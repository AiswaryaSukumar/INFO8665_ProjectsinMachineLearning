import uuid
import re
import os
import json
import shutil
import tempfile
import time as _time
import pyttsx3
import numpy as np
import soundfile as sf
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable, Tuple

from pathlib import Path
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session as DBSession

from logging_config import get_logger
from metrics import (
    sessions_created_total, tickets_created_total, escalations_total,
    active_sessions, turn_processing_seconds, stt_transcriptions_total,
    nlu_processing_seconds, nlu_confidence_score,
)
from config import CLARIFICATION_THRESHOLD, UI_LOW_CONFIDENCE_THRESHOLD

# Local DB imports
from db_service.main import get_db, ConversationState, SessionRepository, TicketRepository, generate_ticket_id

logger = get_logger("insight311.orchestrator")

orchestrator_router = APIRouter()
voice_router = APIRouter()

# ---------- Call Archive Directories ----------

def _resolve_stt_data_dir() -> Path:
    """
    Resolve stt_service/data by finding an EXISTING stt_service folder.
    Searches upward from orchestrator/ to avoid creating a duplicate
    insight311/insight311/stt_service/ when run inside Docker or a sub-directory.
    """
    orchestrator_dir = Path(__file__).resolve().parent
    # Search upward for an already-existing stt_service sibling
    for parent in [orchestrator_dir.parent, *orchestrator_dir.parents]:
        candidate = parent / "stt_service"
        if candidate.is_dir():
            return candidate / "data"
    # Fallback: default location (insight311/stt_service/data)
    return orchestrator_dir.parent / "stt_service" / "data"

DATA_BASE_DIR = _resolve_stt_data_dir()

CALL_RECORDINGS_DIR  = DATA_BASE_DIR / "call_recordings"
CALL_TRANSCRIPTS_DIR = DATA_BASE_DIR / "call_transcripts"
CALL_TEMP_AUDIO_DIR  = DATA_BASE_DIR / "audio_samples"

def initialize_directories():
    """Create all necessary data directories if they don't exist."""
    target_dirs = [CALL_RECORDINGS_DIR, CALL_TRANSCRIPTS_DIR, CALL_TEMP_AUDIO_DIR]
    for directory in target_dirs:
        directory.mkdir(parents=True, exist_ok=True)

# In-memory dialogue store: {session_id: [{role, turn, text}, ...]}
# Avoids DB write-overwrite race with orchestrator's save_context.
_SESSION_DIALOGUE: Dict[str, List[Dict[str, Any]]] = {}


def _save_turn_audio(session_id: str, turn: int, wav_path: str):
    """Copy the caller WAV for this turn into the per-session temp folder."""
    session_dir = os.path.join(CALL_TEMP_AUDIO_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)
    dest = os.path.join(session_dir, f"turn_{turn:03d}_caller.wav")
    shutil.copy2(wav_path, dest)


def _save_system_audio(session_id: str, turn: int, tts_bytes: bytes):
    """Write the system TTS WAV bytes for this turn, resampled to 16000 Hz to match caller audio."""
    import io
    session_dir = os.path.join(CALL_TEMP_AUDIO_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)
    dest = os.path.join(session_dir, f"turn_{turn:03d}_system.wav")
    # Read from bytes, resample to 16000 Hz if needed
    audio_data, orig_sr = sf.read(io.BytesIO(tts_bytes), dtype="float32")
    # Convert stereo to mono if needed
    if audio_data.ndim > 1:
        audio_data = audio_data.mean(axis=1)
    if orig_sr != 16000:
        # Simple linear resample by ratio
        ratio = 16000 / orig_sr
        new_length = int(len(audio_data) * ratio)
        audio_data = np.interp(
            np.linspace(0, len(audio_data) - 1, new_length),
            np.arange(len(audio_data)),
            audio_data
        ).astype(np.float32)
    sf.write(dest, audio_data, 16000)


def _finalize_call(
    session_id: str,
    dialogue: List[Dict[str, str]],  # [{"role": "caller"|"system", "text": "...", "turn": N}]
    ticket_id: Optional[str] = None,
):
    """
    Called when a call reaches SUBMITTED state.
    1. Merge all per-turn caller WAV files into a single recording.
    2. Write a JSON + plain-text transcript covering the full dialogue.
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    label = f"{session_id}_{timestamp}"

    # ---- 1. Merge audio (caller → system → caller → system ...) ----
    session_dir = os.path.join(CALL_TEMP_AUDIO_DIR, session_id)
    merged_chunks = []
    sample_rate = 16000
    if os.path.isdir(session_dir):
        # Collect all turn numbers present
        all_files = os.listdir(session_dir)
        turn_nums = sorted(set(
            int(f.split("_")[1]) for f in all_files
            if f.endswith(".wav") and len(f.split("_")) >= 3
        ))
        for t in turn_nums:
            for role in ("caller", "system"):
                fpath = os.path.join(session_dir, f"turn_{t:03d}_{role}.wav")
                if not os.path.exists(fpath):
                    continue
                try:
                    audio, sr = sf.read(fpath, dtype="float32")
                    sample_rate = sr
                    merged_chunks.append(audio)
                    # Short gap between same-turn tracks, longer gap between turns
                    gap = 0.2 if role == "caller" else 0.5
                    merged_chunks.append(np.zeros(int(sr * gap), dtype="float32"))
                except Exception:
                    pass

    if merged_chunks:
        merged = np.concatenate(merged_chunks)
        recording_path = os.path.join(CALL_RECORDINGS_DIR, f"{label}.wav")
        sf.write(recording_path, merged, sample_rate)
        logger.info("call_recording_saved session_id=%s path=%s", session_id, recording_path)
    else:
        logger.warning("no_audio_turns_found session_id=%s", session_id)

    # ---- 2. Write transcript ----
    transcript_txt_lines = [
        f"INSIGHT-311 CALL TRANSCRIPT",
        f"Session ID : {session_id}",
        f"Ticket  ID : {ticket_id or 'N/A'}",
        f"Timestamp  : {timestamp}",
        "=" * 60,
        "",
    ]
    for entry in dialogue:
        role = "[CALLER]" if entry["role"] == "caller" else "[SYSTEM]"
        transcript_txt_lines.append(f"Turn {entry.get('turn', '?'):>3}  {role}  {entry['text']}")
    transcript_txt_lines.append("")
    transcript_txt_lines.append("=" * 60)

    txt_path  = os.path.join(CALL_TRANSCRIPTS_DIR, f"{label}.txt")
    json_path = os.path.join(CALL_TRANSCRIPTS_DIR, f"{label}.json")
    with open(txt_path,  "w", encoding="utf-8") as f:
        f.write("\n".join(transcript_txt_lines))
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"session_id": session_id, "ticket_id": ticket_id, "timestamp": timestamp, "dialogue": dialogue}, f, ensure_ascii=False, indent=2)
    logger.info("call_transcript_saved session_id=%s path=%s", session_id, txt_path)

    # ---- 3. Clean up per-session temp audio ----
    if os.path.isdir(session_dir):
        shutil.rmtree(session_dir, ignore_errors=True)

# ----------------- Field Config & Rules -----------------
MANDATORY_FIELDS: List[str] = ["category", "location", "description", "caller_name", "phone_number"]
OPTIONAL_FIELDS: List[str] = ["severity", "raw_issue_text"]

CONFIDENCE_THRESHOLDS = {
    "CLARIFICATION": CLARIFICATION_THRESHOLD,
    "UI_LOW_CONFIDENCE": UI_LOW_CONFIDENCE_THRESHOLD,
}

logger.info(
    "orchestrator_config clarification_threshold=%s ui_low_confidence=%s",
    CLARIFICATION_THRESHOLD, UI_LOW_CONFIDENCE_THRESHOLD,
)

CATEGORY_RULES = {
    "pothole": {"extra_required_fields": ["severity"], "auto_escalate": False, "sla_hours": 48},
    "property_standards": {"extra_required_fields": [], "auto_escalate": False, "sla_hours": 72},
    "emergency": {"extra_required_fields": [], "auto_escalate": True, "priority_override": "high", "sla_hours": 1}
}

def validate_phone_number(phone: str) -> bool:
    if not phone: return False
    digits = re.sub(r'\D', '', phone)
    return len(digits) >= 10

def validate_field(field_name: str, value: any) -> bool:
    if not value: return False
    validators: Dict[str, Callable] = {"phone_number": validate_phone_number}
    validator = validators.get(field_name)
    if validator: return validator(value)
    return True

# ----------------- Department Mapper -----------------
CATEGORY_DEPARTMENT_MAPPING = {
    "pothole": "Transportation Services", "graffiti": "Public Use Facilities", "illegal_sign": "Municipal Licensing and Standards",
    "litter": "Solid Waste Management", "needles": "Public Health", "parking_complaint": "Police Services (Parking Enforcement)",
    "sidewalk_snow": "Transportation Services", "sidewalk_hazard": "Transportation Services", "trail_maintenance": "Parks, Forestry and Recreation",
    "property_standards": "Municipal Licensing and Standards", "emergency": "Emergency Services", "other": "311 General Support"
}
CATEGORY_ALIASES = {"garbage": "litter", "trash": "litter", "snow": "sidewalk_snow", "ice": "sidewalk_snow", "hole": "pothole"}

def auto_assign_department(category: str, nlu_confidence: float) -> Optional[str]:
    if not category: return None
    normalized_category = category.lower().strip()
    if normalized_category in CATEGORY_ALIASES:
        normalized_category = CATEGORY_ALIASES[normalized_category]
    return CATEGORY_DEPARTMENT_MAPPING.get(normalized_category, "311 General Support")

# ----------------- State Machine -----------------
VALID_TRANSITIONS = {
    ConversationState.INITIALIZING: [ConversationState.SLOT_FILLING],
    ConversationState.SLOT_FILLING: [ConversationState.CLARIFICATION, ConversationState.CONFIRMATION, ConversationState.SUBMITTED],
    ConversationState.CLARIFICATION: [ConversationState.SLOT_FILLING, ConversationState.CONFIRMATION],
    ConversationState.CONFIRMATION: [ConversationState.SLOT_FILLING, ConversationState.SUBMITTED],
    ConversationState.SUBMITTED: [], ConversationState.ESCALATED: []
}

def is_valid_transition(current: ConversationState, target: ConversationState) -> bool:
    if current == target: return True
    if target == ConversationState.ESCALATED: return True
    return target in VALID_TRANSITIONS.get(current, [])

def transition(current: ConversationState, target: ConversationState, history: List[ConversationState] = None) -> ConversationState:
    if not is_valid_transition(current, target):
        raise ValueError(f"Invalid state transition from {current} to {target}")
    if history is not None: history.append(current)
    return target

# ----------------- Context Models -----------------
class ConversationContext(BaseModel):
    session_id: str
    channel: str
    current_state: ConversationState = ConversationState.INITIALIZING
    extracted_entities: Dict[str, Any] = Field(default_factory=dict)
    confidence_scores: Dict[str, float] = Field(default_factory=dict)
    missing_fields: List[str] = Field(default_factory=list)
    questions_asked: List[str] = Field(default_factory=list)
    escalation_reason: Optional[str] = None
    ticket_id: Optional[str] = None
    raw_issue_text: Optional[str] = None

class Action(BaseModel):
    action_type: str = Field(..., description="Action type like 'ask_question', 'confirm', 'submit', 'escalate'")
    text: str = Field(..., description="The message or question to return to the user via TTS/Text")
    field: Optional[str] = Field(None, description="The specific field being targeted for clarification or question")
    new_state: ConversationState = Field(..., description="The next state the conversation should transition into")
    should_escalate: bool = False
    ticket_id: Optional[str] = None

# ----------------- Rule Engine -----------------
FIELD_QUESTIONS = {
    "category": "What type of issue are you reporting?",
    "location": "Where exactly is the issue located?",
    "description": "Can you describe the issue in more detail?",
    "caller_name": "May I have your name please?",
    "phone_number": "What is the best phone number to reach you?",
}

def human_readable_field(field: str) -> str:
    mapping = {"category": "the issue type", "location": "the location", "description": "the description", "caller_name": "your name", "phone_number": "your phone number"}
    return mapping.get(field, field)

class RuleEngine:
    def get_next_question(self, context: ConversationContext) -> Optional[Action]:
        missing = context.missing_fields
        if missing:
             field = missing[0]
             q = FIELD_QUESTIONS.get(field, f"Could you provide {human_readable_field(field)}?")
             return Action(action_type="ask_question", text=q, field=field, new_state=ConversationState.SLOT_FILLING)

        low_confidence_fields = [f for f in context.extracted_entities.keys()
                                 if context.confidence_scores.get(f, 1.0) < CONFIDENCE_THRESHOLDS["CLARIFICATION"]]

        if low_confidence_fields:
             labels = [human_readable_field(f) for f in low_confidence_fields]
             fields_phrase = labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + f" and {labels[-1]}"
             clarification = f"I am not fully confident about {fields_phrase}. Could you please clarify or repeat them?"
             return Action(action_type="ask_question", text=clarification, field=low_confidence_fields[0], new_state=ConversationState.CLARIFICATION)

        return self.generate_confirmation(context)

    def generate_confirmation(self, context: ConversationContext) -> Action:
        category = context.extracted_entities.get("category")
        nlu_conf = context.confidence_scores.get("category", 1.0)
        dept = auto_assign_department(category, nlu_conf)
        category_text = category if category and category != "other" else "an"
        location = context.extracted_entities.get("location", "an unknown location")
        caller_name = context.extracted_entities.get("caller_name", "no name")
        phone_number = context.extracted_entities.get("phone_number", "no phone number")
        
        issue_part = f"You reported a {category_text} issue at {location}. "
        if category == "other" and context.raw_issue_text:
             issue_part = f"You originally described the issue as \"{context.raw_issue_text}\". "
             
        rule_info = ""
        category_rules = CATEGORY_RULES.get(category, {})
        sla = category_rules.get("sla_hours")
        if dept: rule_info += f"This will be routed to {dept}. "
        if sla: rule_info += f"The standard response time is {sla} hours. "

        text = f"For final confirmation, please check the following information. {issue_part}Your contact information is {caller_name} and {phone_number}. {rule_info}Is this all correct?"
        return Action(action_type="confirm", text=text, new_state=ConversationState.CONFIRMATION)

# ----------------- Context Manager -----------------
class ContextManager:
    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    def load_context(self, session_id: str, channel: str = "web") -> ConversationContext:
        db_context_data = self.session_repo.load_context(session_id)
        db_session = self.session_repo.get_session(session_id)
        current_state = db_session.current_state if db_session else ConversationState.INITIALIZING
        ticket_id = db_session.ticket_id if db_session else None
        
        return ConversationContext(
            session_id=session_id, channel=channel, current_state=current_state,
            ticket_id=ticket_id, extracted_entities=db_context_data.get("extracted_entities", {}),
            confidence_scores=db_context_data.get("confidence_scores", {}), missing_fields=db_context_data.get("missing_fields", []),
            questions_asked=db_context_data.get("questions_asked", []), raw_issue_text=db_context_data.get("raw_issue_text", None)
        )

    def save_context(self, context: ConversationContext):
        context_data = {
            "extracted_entities": context.extracted_entities, "confidence_scores": context.confidence_scores,
            "missing_fields": context.missing_fields, "questions_asked": context.questions_asked, "raw_issue_text": context.raw_issue_text
        }
        self.session_repo.save_context(context.session_id, context_data, context.current_state)
        if context.ticket_id:
            self.session_repo.update_state(context.session_id, context.current_state, ticket_id=context.ticket_id)

    def update_context_with_nlu(self, context: ConversationContext, nlu_result: Dict[str, Any]):
        is_confirmation_phase = context.current_state in [ConversationState.CONFIRMATION, ConversationState.SUBMITTED]
        correction_field = nlu_result.get("correction_field")
        correction_value = nlu_result.get("correction_value")
        
        if is_confirmation_phase and correction_field and correction_value:
             context.extracted_entities[correction_field] = correction_value
             if "confidence_scores" in nlu_result and correction_field in nlu_result["confidence_scores"]:
                  context.confidence_scores[correction_field] = nlu_result["confidence_scores"][correction_field]
             return
             
        confidence_scores = nlu_result.get("confidence_scores", {})
        for field in MANDATORY_FIELDS:
            value = nlu_result.get(field)
            if value:
                if field == "category":
                     new_conf = confidence_scores.get("category", 0.0)
                     old_value = context.extracted_entities.get("category")
                     old_conf = context.confidence_scores.get("category", 0.0)
                     if (old_value is None or old_value == "" or new_conf > old_conf or (old_value == "other" and new_conf >= old_conf)):
                          context.extracted_entities[field] = value
                          context.confidence_scores[field] = new_conf
                elif not context.extracted_entities.get(field):
                     context.extracted_entities[field] = value
                     if field in confidence_scores:
                         context.confidence_scores[field] = confidence_scores[field]

        severity_score = nlu_result.get("severity_score") or confidence_scores.get("severity")
        if severity_score is not None and not context.extracted_entities.get("severity"):
            context.extracted_entities["severity"] = self._map_severity_score_to_label(severity_score)
            
    def _map_severity_score_to_label(self, score: float) -> str:
        if score < 0.5: return "low"
        if score < 0.8: return "medium"
        return "high"

    def compute_missing_fields(self, context: ConversationContext) -> List[str]:
        missing = [f for f in MANDATORY_FIELDS if not context.extracted_entities.get(f)]
        context.missing_fields = missing
        return missing

# ----------------- Orchestrator Main Engine -----------------
class Orchestrator:
    def __init__(self, context_manager: ContextManager, rule_engine: RuleEngine, ticket_repo: TicketRepository):
        self.context_manager = context_manager
        self.rule_engine = rule_engine
        self.ticket_repo = ticket_repo

    def initialize_session(self, session_id: str, channel: str, caller_number: str = None) -> Tuple[ConversationContext, Action]:
        context = self.context_manager.load_context(session_id, channel)
        if context.current_state == ConversationState.INITIALIZING:
            context.current_state = transition(context.current_state, ConversationState.SLOT_FILLING)
            self.context_manager.save_context(context)

        logger.info("session_initialized session_id=%s channel=%s", session_id, channel)
        sessions_created_total.labels(channel=channel).inc()
        active_sessions.inc()

        action = Action(
            action_type="greeting",
            text="Thank you for calling three one one city service. I am your AI assistant. Please describe your issue and I will help you submit a request.",
            new_state=ConversationState.SLOT_FILLING
        )
        return context, action
        
    def _create_ticket(self, context: ConversationContext) -> str:
        ticket_id = generate_ticket_id(self.ticket_repo.db)
        self.ticket_repo.create_ticket(ticket_id, context.session_id, context.channel)
        fields = {
             "category": context.extracted_entities.get("category"),
             "location": context.extracted_entities.get("location"),
             "description": context.extracted_entities.get("description"),
             "caller_name": context.extracted_entities.get("caller_name"),
             "phone_number": context.extracted_entities.get("phone_number"),
             "severity": context.extracted_entities.get("severity"),
             "ticket_status": "submitted"
        }
        self.ticket_repo.update_ticket_fields(ticket_id, fields)
        logger.info(
            "ticket_created ticket_id=%s session_id=%s category=%s severity=%s",
            ticket_id, context.session_id, fields["category"], fields["severity"],
        )
        tickets_created_total.labels(
            category=fields.get("category") or "unknown",
            severity=fields.get("severity") or "unknown",
            channel=context.channel,
        ).inc()
        active_sessions.dec()
        return ticket_id

    def process_turn(self, session_id: str, transcript: str, nlu_output: Dict[str, Any]) -> Tuple[ConversationContext, Action]:
        context = self.context_manager.load_context(session_id)
        logger.info("process_turn_start session_id=%s state=%s", session_id, context.current_state)
        if context.current_state in [ConversationState.SUBMITTED, ConversationState.ESCALATED]:
             return context, Action(action_type="end", text="This session has already ended.", new_state=context.current_state)
             
        if not context.raw_issue_text and transcript:
             context.raw_issue_text = transcript
             
        self.context_manager.update_context_with_nlu(context, nlu_output)
        confirm_result = nlu_output.get("confirm_result")
        
        if context.current_state == ConversationState.CONFIRMATION:
            # --- 1. Check for corrections FIRST (works with or without saying "no") ---
            correction_updates = nlu_output.get("correction_updates") or {}
            correction_field   = nlu_output.get("correction_field")
            # Fallback: if correction_updates is missing but correction_field is set, build it
            if not correction_updates and correction_field:
                correction_updates = {correction_field: nlu_output.get("correction_value", "")}

            if correction_updates and confirm_result != "yes":
                # Apply ALL corrected fields to the in-memory context
                for field, value in correction_updates.items():
                    if value:
                        context.extracted_entities[field] = value
                        context.confidence_scores[field] = 1.0
                # Build natural summary text
                human_updates = ", ".join(
                    f"{human_readable_field(f)} to {v}"
                    for f, v in correction_updates.items() if v
                )
                self.context_manager.save_context(context)
                action = Action(
                    action_type="confirm",
                    text=f"I've updated {human_updates}. Let's review again. " + self.rule_engine.generate_confirmation(context).text,
                    new_state=ConversationState.CONFIRMATION
                )
                return context, action

            # --- 2. Explicit yes → submit ticket ---
            if confirm_result == "yes":
                  ticket_id = self._create_ticket(context)
                  context.ticket_id = ticket_id
                  context.current_state = transition(context.current_state, ConversationState.SUBMITTED)
                  self.context_manager.save_context(context)
                  spelled = self._spell_out(ticket_id)
                  action = Action(action_type="submit", text=f"Your ticket number is {spelled}. Thank you for your report. Goodbye.", new_state=ConversationState.SUBMITTED, ticket_id=ticket_id)
                  return context, action

            # --- 3. Explicit no with no detectable correction → ask what's wrong ---
            if confirm_result == "no":
                  return context, Action(action_type="ask_question", text="I'm sorry. Which information is incorrect? Please say 'the location is...', 'my name is...', or 'my phone number is...' with the corrected detail.", new_state=ConversationState.CONFIRMATION)

        self.context_manager.compute_missing_fields(context)
        action = self.rule_engine.get_next_question(context)
        context.current_state = transition(context.current_state, action.new_state)
        self.context_manager.save_context(context)
        return context, action


    def _spell_out(self, text: str) -> str:
        return " ".join([ch for ch in text if ch.isalnum()])

# ----------------- FastAPI Routes -----------------
def get_orchestrator(db: DBSession = Depends(get_db)):
    session_repo = SessionRepository(db)
    ticket_repo = TicketRepository(db)
    context_manager = ContextManager(session_repo)
    rule_engine = RuleEngine()
    return Orchestrator(context_manager, rule_engine, ticket_repo)

class InitializeRequest(BaseModel):
    channel: str
    language: str = "en"
    caller_number: Optional[str] = None

class ProcessRequest(BaseModel):
    session_id: str
    transcript: str
    nlu_output: Dict[str, Any]

@orchestrator_router.post("/initialize")
def initialize_session(request: InitializeRequest, orchestrator: Orchestrator = Depends(get_orchestrator), db: DBSession = Depends(get_db)):
    session_id = str(uuid.uuid4())
    session_repo = SessionRepository(db)
    session_repo.create_session(session_id, request.channel, request.language, request.caller_number)
    context, action = orchestrator.initialize_session(session_id, request.channel, request.caller_number)
    return {"session_id": session_id, "action": action.dict(), "context": context.dict()}

@orchestrator_router.post("/process")
def process_turn(request: ProcessRequest, orchestrator: Orchestrator = Depends(get_orchestrator)):
    try:
        context, action = orchestrator.process_turn(request.session_id, request.transcript, request.nlu_output)
        return {"session_id": request.session_id, "action": action.dict(), "context": context.dict()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
@orchestrator_router.get("/session/{session_id}")
def get_session_context(session_id: str, db: DBSession = Depends(get_db)):
    session_repo = SessionRepository(db)
    db_session = session_repo.get_session(session_id)
    if not db_session:
         raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": db_session.session_id, "channel": db_session.channel, "status": db_session.session_status, "current_state": db_session.current_state, "ticket_id": db_session.ticket_id, "context_data": db_session.context_data}

def generate_tts_audio_bytes(text: str) -> bytes:
    engine = pyttsx3.init()
    rate = 150
    if text.startswith("Your ticket number is"): rate = 130  
    engine.setProperty("rate", rate)
    voices = engine.getProperty("voices")
    if len(voices) > 1: engine.setProperty("voice", voices[1].id)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fp: temp_path = fp.name
    engine.save_to_file(text, temp_path)
    engine.runAndWait()
    with open(temp_path, "rb") as f: wav_bytes = f.read()
    os.remove(temp_path)
    return wav_bytes

@voice_router.post("/synthesize")
async def synthesize_text(text: str = Form(...)):
    try:
        tts_bytes = generate_tts_audio_bytes(text)
        return Response(content=tts_bytes, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@voice_router.post("/process_audio")
async def process_audio(
    request: Request, session_id: str = Form(...), turn: int = Form(...),
    audio_file: UploadFile = File(...), orchestrator: Orchestrator = Depends(get_orchestrator), db: DBSession = Depends(get_db)
):
    app_state = request.app.state
    whisper_model = getattr(app_state, "whisper_model", None)
    nlu_processor = getattr(app_state, "nlu_processor", None)
    if not whisper_model or not nlu_processor: raise HTTPException(status_code=503, detail="ML Models are not loaded yet.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        shutil.copyfileobj(audio_file.file, temp_audio)
        temp_audio_path = temp_audio.name
    temp_wav_path = temp_audio_path.replace(".webm", ".wav")
        
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(temp_audio_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        audio.export(temp_wav_path, format="wav")

        # --- Save caller audio for this turn ---
        _save_turn_audio(session_id, turn, temp_wav_path)
        
        # STT
        result = whisper_model.transcribe(temp_wav_path, language="en", fp16=False, temperature=0.0)
        raw_text = result["text"].strip()
        from stt_service.main import apply_phonetic_correction
        transcript = apply_phonetic_correction(raw_text)
        
        # NLU
        nlu_output = nlu_processor.process(transcript, session_id=session_id)

        # Orchestrator Decisions
        context, action = orchestrator.process_turn(session_id, transcript, nlu_output)
        
        # TTS
        response_text = action.text
        tts_bytes = generate_tts_audio_bytes(response_text)
        _save_system_audio(session_id, turn, tts_bytes)  # Save system audio for this turn

        # --- Accumulate dialogue in memory (immune to DB overwrite issues) ---
        if session_id not in _SESSION_DIALOGUE:
            _SESSION_DIALOGUE[session_id] = []
        _SESSION_DIALOGUE[session_id].append({"role": "caller", "turn": turn, "text": transcript})
        _SESSION_DIALOGUE[session_id].append({"role": "system",  "turn": turn, "text": response_text})

        # --- Finalize call on termination ---
        if context.current_state in [ConversationState.SUBMITTED, ConversationState.ESCALATED]:
            _finalize_call(session_id, _SESSION_DIALOGUE.get(session_id, []), ticket_id=context.ticket_id)
            _SESSION_DIALOGUE.pop(session_id, None)  # free memory

        headers = {
            "X-Transcript": transcript.encode('utf-8').decode('latin-1'),
            "X-Response-Text": response_text.encode('utf-8').decode('latin-1'),
            "X-Current-State": context.current_state,
        }
        return Response(content=tts_bytes, media_type="audio/wav", headers=headers)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_audio_path): os.remove(temp_audio_path)
        if 'temp_wav_path' in locals() and os.path.exists(temp_wav_path): os.remove(temp_wav_path)
