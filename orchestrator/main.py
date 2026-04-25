import uuid
import re
import os
import json
import shutil
import tempfile
import pyttsx3
import numpy as np
import soundfile as sf
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable, Tuple

from pathlib import Path
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session as DBSession

# Local DB imports
from db_service.main import get_db, ConversationState, SessionRepository, TicketRepository, generate_ticket_id, Recording, RecordingTurn
from ticket_service.duplicate_detection import find_and_store_duplicates

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
    db=None,
):
    """
    Called when a call reaches SUBMITTED state.
    1. Merge all per-turn caller WAV files into a single recording.
    2. Write a JSON + plain-text transcript covering the full dialogue.
    3. Store recording_url and transcript paths in the DB ticket record.
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    label = f"{session_id}_{timestamp}"

    recording_path = None

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
        recording_filename = f"{label}.wav"
        recording_path = os.path.join(CALL_RECORDINGS_DIR, recording_filename)
        sf.write(recording_path, merged, sample_rate, subtype="PCM_16")
        print(f"  💾 Call recording saved: {recording_path}")
    else:
        print(f"  ⚠️  No audio turns found for session {session_id}, skipping recording.")

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

    transcript_text = "\n".join(transcript_txt_lines)

    txt_path  = os.path.join(CALL_TRANSCRIPTS_DIR, f"{label}.txt")
    json_path = os.path.join(CALL_TRANSCRIPTS_DIR, f"{label}.json")
    with open(txt_path,  "w", encoding="utf-8") as f:
        f.write(transcript_text)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"session_id": session_id, "ticket_id": ticket_id, "timestamp": timestamp, "dialogue": dialogue}, f, ensure_ascii=False, indent=2)
    print(f"  📄 Call transcript saved: {txt_path}")

    # ---- 3. Persist paths to DB ----
    if db is not None and ticket_id:
        try:
            repo = TicketRepository(db)
            db_fields = {"transcript": transcript_text}
            if recording_path:
                db_fields["recording_url"] = f"/api/voice/recording/{recording_filename}"
            repo.update_ticket_fields(ticket_id, db_fields)
            print(f"  ✅ DB updated — ticket {ticket_id}: recording_url + transcript saved.")

            # Insert into recordings table (only when audio was actually captured)
            recording_id = f"REC-{label}"
            rec = Recording(
                recording_id=recording_id,
                session_id=session_id,
                ticket_id=ticket_id,
                merged_audio_path=recording_path or "",
            )
            db.add(rec)
            db.commit()
            print(f"  ✅ tickets.recording_url = {recording_path or '(none)'}")

            # Insert per-turn rows into recording_turns
            session_dir = os.path.join(CALL_TEMP_AUDIO_DIR, session_id)
            caller_turns = {e["turn"]: e["text"] for e in dialogue if e["role"] == "caller"}
            system_turns = {e["turn"]: e["text"] for e in dialogue if e["role"] == "system"}
            all_turns = sorted(set(list(caller_turns.keys()) + list(system_turns.keys())))
            for t in all_turns:
                caller_wav = os.path.join(session_dir, f"turn_{t:03d}_caller.wav")
                rt = RecordingTurn(
                    recording_id=recording_id,
                    session_id=session_id,
                    turn=t,
                    transcript=caller_turns.get(t, ""),
                    stt_audio_file_path=caller_wav if os.path.exists(caller_wav) else "",
                    tts_question=system_turns.get(t, ""),
                )
                db.add(rt)
            db.commit()
            print(f"  ✅ recordings + recording_turns saved (recording_id={recording_id})")
        except Exception as e:
            print(f"  ⚠️  DB update failed for ticket {ticket_id}: {e}")

    # ---- 4. Clean up per-session temp audio ----
    if os.path.isdir(session_dir):
        shutil.rmtree(session_dir, ignore_errors=True)

# ----------------- Field Config & Rules -----------------
MANDATORY_FIELDS: List[str] = ["category", "location", "caller_name", "phone_number"]
OPTIONAL_FIELDS: List[str] = ["severity", "raw_issue_text"]

CONFIDENCE_THRESHOLDS = {
    "CLARIFICATION":          0.5,
    "LOCATION_CLARIFICATION": 0.75,  # street number required; "King St N" (0.65) re-asks, "345 King St N" (0.85) passes
    "UI_LOW_CONFIDENCE":      0.7,
    "FIELD_ALERT":            0.7,   # per-field alert threshold
    "OVERALL_ALERT":          0.7,   # composite score alert threshold
}

# 같은 필드를 이 횟수만큼 물어봐도 응답을 못 받으면 직원 연결
ESCALATION_THRESHOLD = 3

ESCALATION_MESSAGE = (
    "I'm sorry we weren't able to complete this together. "
    "I'm now transferring your call to one of our live agents who will be happy to help you. "
    "Please stay on the line — you will be connected shortly. Thank you for your patience."
)

SENTIMENT_ATTENTION_THRESHOLD = 0.65  # ml_negative >= this → NEEDS_ATTENTION


def evaluate_confidence_alert(confidence_scores: dict) -> tuple:
    """Return (alert_string | None, [alerted_field_names])."""
    key_fields = ["category", "location", "caller_name", "phone_number"]
    alerted = [f for f in key_fields if confidence_scores.get(f, 1.0) < CONFIDENCE_THRESHOLDS["FIELD_ALERT"]]
    overall = confidence_scores.get("overall", 1.0)
    if alerted or overall < CONFIDENCE_THRESHOLDS["OVERALL_ALERT"]:
        return "LOW_CONFIDENCE", alerted
    return None, []


def evaluate_sentiment_flag(ml_negative: float) -> Optional[str]:
    """Return 'NEEDS_ATTENTION' if negative sentiment is high, else None."""
    if ml_negative is not None and ml_negative >= SENTIMENT_ATTENTION_THRESHOLD:
        return "NEEDS_ATTENTION"
    return None

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

# ----------------- Tone Deriver -----------------
def _derive_tone_from_sentiment(sentiment_label: Optional[str], sentiment_score: float):
    """
    Convert ML sentiment label + score into a frontend-friendly tone string.
    Returns (tone, tone_confidence) tuple.
    """
    if not sentiment_label:
        return None, None
    label = str(sentiment_label).upper()
    if label == "NEGATIVE":
        if sentiment_score >= 0.80:
            return "ANGRY", round(sentiment_score, 4)
        return "AGITATED", round(sentiment_score, 4)
    if label == "POSITIVE":
        return "CALM", round(1.0 - sentiment_score, 4)
    return "NEUTRAL", round(1.0 - sentiment_score, 4)


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
    field_ask_counts: Dict[str, int] = Field(default_factory=dict)  # 필드별 재질문 횟수
    escalation_reason: Optional[str] = None
    ticket_id: Optional[str] = None
    raw_issue_text: Optional[str] = None
    peak_ml_negative: float = 0.0      # highest negative sentiment score seen across all turns
    peak_sentiment_label: Optional[str] = None  # label at the peak turn
    last_question_text: Optional[str] = None    # 직전 봇 발화 — repeat 요청 응답용
    pending_secondary_category: Optional[str] = None  # 다중 민원 시 두 번째 카테고리 보류

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
    def _check_escalation(self, field: str, context: ConversationContext) -> Optional[Action]:
        """필드를 ESCALATION_THRESHOLD 이상 물어봤으면 에스컬레이션 액션 반환."""
        count = context.field_ask_counts.get(field, 0)
        if count >= ESCALATION_THRESHOLD:
            return Action(
                action_type="escalate",
                text=ESCALATION_MESSAGE,
                field=field,
                new_state=ConversationState.ESCALATED,
                should_escalate=True,
            )
        return None

    def get_next_question(self, context: ConversationContext) -> Optional[Action]:
        missing = context.missing_fields
        if missing:
            field = missing[0]
            # 같은 필드를 반복해서 물어봤는지 확인
            escalation = self._check_escalation(field, context)
            if escalation:
                return escalation
            q = FIELD_QUESTIONS.get(field, f"Could you provide {human_readable_field(field)}?")
            return Action(action_type="ask_question", text=q, field=field, new_state=ConversationState.SLOT_FILLING)

        low_confidence_fields = [
            f for f in context.extracted_entities.keys()
            if context.confidence_scores.get(f, 1.0) < (
                CONFIDENCE_THRESHOLDS["LOCATION_CLARIFICATION"] if f == "location"
                else CONFIDENCE_THRESHOLDS["CLARIFICATION"]
            )
        ]

        if low_confidence_fields:
            field = low_confidence_fields[0]
            # 신뢰도 낮은 필드도 반복 횟수 체크
            escalation = self._check_escalation(field, context)
            if escalation:
                return escalation
            labels = [human_readable_field(f) for f in low_confidence_fields]
            fields_phrase = labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + f" and {labels[-1]}"
            clarification = f"I am not fully confident about {fields_phrase}. Could you please clarify or repeat them?"
            return Action(action_type="ask_question", text=clarification, field=field, new_state=ConversationState.CLARIFICATION)

        return self.generate_confirmation(context)

    def generate_confirmation(self, context: ConversationContext) -> Action:
        category = context.extracted_entities.get("category")
        nlu_conf = context.confidence_scores.get("category", 1.0)
        dept = auto_assign_department(category, nlu_conf)
        category_text = category.replace("_", " ") if category and category != "other" else "an"
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
            questions_asked=db_context_data.get("questions_asked", []),
            field_ask_counts=db_context_data.get("field_ask_counts", {}),
            escalation_reason=db_context_data.get("escalation_reason", None),
            raw_issue_text=db_context_data.get("raw_issue_text", None),
            peak_ml_negative=db_context_data.get("peak_ml_negative", 0.0),
            peak_sentiment_label=db_context_data.get("peak_sentiment_label", None),
            last_question_text=db_context_data.get("last_question_text", None),
            pending_secondary_category=db_context_data.get("pending_secondary_category", None),
        )

    def save_context(self, context: ConversationContext):
        context_data = {
            "extracted_entities": context.extracted_entities, "confidence_scores": context.confidence_scores,
            "missing_fields": context.missing_fields, "questions_asked": context.questions_asked,
            "field_ask_counts": context.field_ask_counts,
            "escalation_reason": context.escalation_reason,
            "raw_issue_text": context.raw_issue_text,
            "peak_ml_negative": context.peak_ml_negative,
            "peak_sentiment_label": context.peak_sentiment_label,
            "last_question_text": context.last_question_text,
            "pending_secondary_category": context.pending_secondary_category,
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
                else:
                    old_conf = context.confidence_scores.get(field, 1.0)
                    new_conf = confidence_scores.get(field, 0.0)
                    # Always update if field is empty, or if new confidence is higher
                    # (handles clarification re-answers with better location)
                    if not context.extracted_entities.get(field) or new_conf > old_conf:
                        context.extracted_entities[field] = value
                        if field in confidence_scores:
                            context.confidence_scores[field] = new_conf

        severity_score = nlu_result.get("severity_score") or confidence_scores.get("severity")
        if severity_score is not None and not context.extracted_entities.get("severity"):
            context.extracted_entities["severity"] = self._map_severity_score_to_label(severity_score)

        # Track peak negative sentiment across all turns so _create_ticket() uses
        # the most emotionally charged turn, not the neutral "yes" confirmation.
        ml_negative = nlu_result.get("ml_negative", 0.0) or 0.0
        if ml_negative > context.peak_ml_negative:
            context.peak_ml_negative = ml_negative
            context.peak_sentiment_label = nlu_result.get("sentiment_label")
            
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
            
        action = Action(
            action_type="greeting",
            text="Thank you for calling three one one city service. I am your AI assistant. Please describe your issue and I will help you submit a request.",
            new_state=ConversationState.SLOT_FILLING
        )
        return context, action
        
    def _create_ticket(self, context: ConversationContext, nlu_output: Dict[str, Any] = None) -> str:
        ticket_id = generate_ticket_id(self.ticket_repo.db)
        self.ticket_repo.create_ticket(ticket_id, context.session_id, "VOICE")

        # Core ticket fields
        _category = context.extracted_entities.get("category")
        _nlu_conf = context.confidence_scores.get("category", 1.0) if context.confidence_scores else 1.0
        _location = context.extracted_entities.get("location")
        _caller_name = context.extracted_entities.get("caller_name")
        _phone = context.extracted_entities.get("phone_number")
        _dept = auto_assign_department(_category, _nlu_conf)

        # Auto-generate a one-line summary description
        _desc_parts = []
        if _category and _category != "other":
            _desc_parts.append(f"{_category.replace('_', ' ').title()} reported")
        if _location:
            _desc_parts.append(f"at {_location}")
        if _caller_name:
            _desc_parts.append(f"by {_caller_name}")
        if _phone:
            _desc_parts.append(f"({_phone})")
        if _dept:
            _desc_parts.append(f"— routed to {_dept}")
        _description = ". ".join(_desc_parts) if _desc_parts else None

        fields = {
            "category":     _category,
            "department":   _dept,
            "location":     _location,
            "description":  _description,
            "caller_name":  _caller_name,
            "phone_number": _phone,
            "severity":     context.extracted_entities.get("severity"),
            "ticket_status":   "SUBMITTED",
            "routing_status":  "PENDING_APPROVAL",
            "workflow_stage":  "PENDING_APPROVAL",
            "created_by_type": "VOICE_BOT",
            "created_by_name": "INSIGHT VoiceBot",
            "created_by_role": "VOICE_BOT",
            "handled_by_type": "VOICE_BOT",
            "handled_by_name": "INSIGHT VoiceBot",
            "handled_by_role": "VOICE_BOT",
            "department_status": "NOT_STARTED",
        }

        # ML confidence scores (from context accumulated over the conversation)
        conf = context.confidence_scores
        if conf:
            fields["confidence_scores"] = dict(conf)
            alert, alerted_fields = evaluate_confidence_alert(conf)
            fields["confidence_alert"] = alert
            fields["alerted_fields"]   = alerted_fields if alerted_fields else None

        # ML sentiment — use the peak negative score seen across all turns, not the
        # current "yes" confirmation turn which has near-zero negative sentiment.
        peak_neg = context.peak_ml_negative
        if peak_neg > 0.0:
            fields["sentiment_score"] = round(float(peak_neg), 4)
            fields["sentiment_label"] = context.peak_sentiment_label
            fields["sentiment_flag"]  = evaluate_sentiment_flag(peak_neg)
        elif nlu_output:
            # Fallback: use current turn if context peak was never set
            ml_negative = nlu_output.get("ml_negative")
            if ml_negative is not None:
                fields["sentiment_score"] = round(float(ml_negative), 4)
                fields["sentiment_label"] = nlu_output.get("sentiment_label")
                fields["sentiment_flag"]  = evaluate_sentiment_flag(ml_negative)

        # Derive tone from sentiment for frontend ToneBadge display
        sentiment_label = fields.get("sentiment_label")
        sentiment_score = fields.get("sentiment_score", 0.0) or 0.0
        tone, tone_conf = _derive_tone_from_sentiment(sentiment_label, sentiment_score)
        if tone:
            fields["tone"]            = tone
            fields["tone_confidence"] = tone_conf
            fields["tone_source"]     = "ML"

        self.ticket_repo.update_ticket_fields(ticket_id, fields)
        find_and_store_duplicates(self.ticket_repo.db, ticket_id)
        return ticket_id

    # ── Meta-intent: repeat request patterns ──────────────────────────────
    _REPEAT_TRIGGERS = [
        "can you repeat", "say that again", "sorry what", "what did you say",
        "i didn't catch", "could you repeat", "pardon", "repeat that",
        "what was that", "sorry i missed", "come again", "say again",
        "could you say that again", "didn't hear", "didn't get that",
    ]

    # ── Meta-intent: off-topic / FAQ patterns → (response_template, re_ask) ──
    # {re_ask} is replaced at runtime with the last question text.
    _META_INTENTS = [
        (
            ["how long", "how many days", "when will it be fixed", "how soon",
             "response time", "how quickly", "what is the eta", "how fast"],
            "Response times vary by issue type — I'll include the estimated timeframe when I confirm your report. {re_ask}",
        ),
        (
            ["what happens", "what happens next", "what do you do with",
             "where does this go", "who handles", "what department",
             "what will you do", "who will fix"],
            "Once submitted, your report is reviewed and routed to the relevant city department. {re_ask}",
        ),
        (
            ["are you a robot", "are you real", "am i talking to a",
             "is this automated", "are you ai", "are you human",
             "is this a bot", "talking to a computer"],
            "I'm an automated assistant for 311 service requests. I'll make sure your report reaches the right team. {re_ask}",
        ),
        (
            ["never mind", "forget it", "doesn't matter",
             "never mind about that", "just forget it"],
            "No problem. {re_ask}",
        ),
    ]

    def _detect_meta_intent(self, transcript: str) -> Optional[str]:
        """
        Returns a response string if the transcript is a meta/off-topic input,
        or None if it should be treated as a normal slot-filling answer.
        The caller replaces {re_ask} with context.last_question_text.
        """
        t = transcript.lower()
        for triggers, response_template in self._META_INTENTS:
            if any(trigger in t for trigger in triggers):
                return response_template
        return None

    def process_turn(self, session_id: str, transcript: str, nlu_output: Dict[str, Any]) -> Tuple[ConversationContext, Action]:
        context = self.context_manager.load_context(session_id)
        if context.current_state in [ConversationState.SUBMITTED, ConversationState.ESCALATED]:
             return context, Action(action_type="end", text="This session has already ended.", new_state=context.current_state)

        if not context.raw_issue_text and transcript:
             context.raw_issue_text = transcript

        t_lower = transcript.lower()

        # ── Intercept 1: Repeat request — return last question without consuming a slot attempt ──
        if context.last_question_text and any(p in t_lower for p in self._REPEAT_TRIGGERS):
            return context, Action(
                action_type="repeat",
                text=context.last_question_text,
                new_state=context.current_state,
            )

        # ── Intercept 2: Off-topic / FAQ — answer briefly then re-ask ──
        # Only intercept during slot-filling/clarification, not during confirmation
        if context.current_state not in [ConversationState.CONFIRMATION, ConversationState.SUBMITTED]:
            meta_response = self._detect_meta_intent(transcript)
            if meta_response:
                re_ask = context.last_question_text or "Could you please continue with the information?"
                text = meta_response.replace("{re_ask}", re_ask)
                # Do NOT update slot counts — this was not a real slot answer
                return context, Action(
                    action_type="meta_response",
                    text=text,
                    new_state=context.current_state,
                )

        self.context_manager.update_context_with_nlu(context, nlu_output)
        confirm_result = nlu_output.get("confirm_result")
        
        if context.current_state == ConversationState.CONFIRMATION:
            # --- 1. Check for corrections FIRST (works with or without saying "no") ---
            correction_updates = nlu_output.get("correction_updates") or {}
            correction_field   = nlu_output.get("correction_field")
            # Fallback: if correction_updates is missing but correction_field is set, build it
            if not correction_updates and correction_field:
                correction_updates = {correction_field: nlu_output.get("correction_value", "")}

            # Fallback: parse correction directly from transcript when NLU didn't produce one.
            # Handles "No, my name is X", "No, the location is X", "No, my phone number is X"
            # as well as bare corrections without "no" prefix.
            if not correction_updates:
                _t = transcript.strip()
                _name_m    = re.search(r"(?:my\s+)?name\s+is\s+(.+)", _t, re.IGNORECASE)
                _loc_m     = re.search(r"(?:the\s+)?location\s+is\s+(.+)|(?:it'?s?\s+)?located\s+at\s+(.+)", _t, re.IGNORECASE)
                _phone_m   = re.search(r"(?:my\s+)?(?:phone(?:\s+number)?|number)\s+is\s+([\d\s\-\(\)\.]+)", _t, re.IGNORECASE)
                if _name_m:
                    correction_updates["caller_name"] = _name_m.group(1).strip().title()
                if _loc_m:
                    correction_updates["location"] = (_loc_m.group(1) or _loc_m.group(2) or "").strip()
                if _phone_m:
                    correction_updates["phone_number"] = _phone_m.group(1).strip()

            if correction_updates and confirm_result != "yes":
                # Apply ALL corrected fields to the in-memory context
                nlu_conf_scores = nlu_output.get("confidence_scores", {})
                for field, value in correction_updates.items():
                    if value:
                        context.extracted_entities[field] = value
                        # Use NLU-derived confidence for the corrected field.
                        # Phone/name corrections stay near 1.0 (user explicitly stated it).
                        # Location uses the LocationCalibrator score from NLU so that
                        # vague places like "Mcdonald's" don't get inflated to 100%.
                        if field == "location" and field in nlu_conf_scores:
                            context.confidence_scores[field] = nlu_conf_scores[field]
                        elif field in nlu_conf_scores:
                            context.confidence_scores[field] = max(nlu_conf_scores[field], 0.90)
                        else:
                            context.confidence_scores[field] = 0.90
                # Build natural summary text
                human_updates = ", ".join(
                    f"{human_readable_field(f)} to {str(v).replace('_', ' ')}"
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
                  ticket_id = self._create_ticket(context, nlu_output=nlu_output)
                  context.ticket_id = ticket_id
                  context.current_state = transition(context.current_state, ConversationState.SUBMITTED)
                  spelled = self._spell_out(ticket_id)
                  # ── 5번: 보류 중인 두 번째 카테고리가 있으면 함께 안내 ──────────
                  secondary = context.pending_secondary_category
                  if secondary:
                      secondary_label = secondary.replace("_", " ")
                      submit_text = (
                          f"Your ticket number is {spelled}. "
                          f"By the way, you also mentioned {secondary_label}. "
                          f"Would you like to submit a separate report for that as well? "
                          f"If so, please start a new call and describe the {secondary_label} issue."
                      )
                      context.pending_secondary_category = None
                  else:
                      submit_text = f"Your ticket number is {spelled}. Thank you for your report. Goodbye."
                  self.context_manager.save_context(context)
                  action = Action(action_type="submit", text=submit_text, new_state=ConversationState.SUBMITTED, ticket_id=ticket_id)
                  return context, action

            # --- 3. Explicit no with no detectable correction → ask what's wrong ---
            if confirm_result == "no":
                  return context, Action(action_type="ask_question", text="I'm sorry. Which information is incorrect? Please say 'the location is...', 'my name is...', or 'my phone number is...' with the corrected detail.", new_state=ConversationState.CONFIRMATION)

        self.context_manager.compute_missing_fields(context)

        # ── 5번: 다중 카테고리 감지 ───────────────────────────────────────────
        # 첫 턴(raw_issue_text 방금 저장된 시점)에서만 체크
        # NLU가 primary category를 뽑았고, 두 번째 카테고리 키워드가 transcript에 있으면 보류
        if not context.pending_secondary_category:
            primary_cat = context.extracted_entities.get("category")
            if primary_cat:
                all_categories = list(FIELD_QUESTIONS.keys())  # 전체 카테고리 목록
                _CATEGORY_KEYWORDS = {
                    "pothole":            ["pothole", "hole in the road", "road damage", "pavement"],
                    "graffiti":           ["graffiti", "spray paint", "vandalism", "tagging"],
                    "illegal_sign":       ["illegal sign", "unauthorized sign", "sign violation"],
                    "litter":             ["litter", "garbage", "trash", "dumping", "rubbish"],
                    "needles":            ["needle", "syringe", "drug paraphernalia", "sharps"],
                    "parking_complaint":  ["parking", "illegally parked", "blocking"],
                    "sidewalk_snow":      ["snow", "ice", "unplowed", "icy sidewalk"],
                    "sidewalk_hazard":    ["sidewalk hazard", "broken sidewalk", "cracked sidewalk"],
                    "trail_maintenance":  ["trail", "path repair", "overgrown path"],
                    "property_standards": ["property standards", "dilapidated", "unsafe building"],
                }
                t_check = transcript.lower()
                for cat, keywords in _CATEGORY_KEYWORDS.items():
                    if cat != primary_cat and any(kw in t_check for kw in keywords):
                        context.pending_secondary_category = cat
                        break

        action = self.rule_engine.get_next_question(context)

        # ── 에스컬레이션 처리 ──────────────────────────────────────────────────
        if action.action_type == "escalate":
            context.escalation_reason = f"Field '{action.field}' asked {ESCALATION_THRESHOLD} times without valid response."
            context.current_state = transition(context.current_state, ConversationState.ESCALATED)
            self.context_manager.save_context(context)
            return context, action

        # ── 정상 질문: 해당 필드의 재질문 카운터 증가 ──────────────────────────
        if action.action_type == "ask_question" and action.field:
            context.field_ask_counts[action.field] = context.field_ask_counts.get(action.field, 0) + 1

        # ── last_question_text 저장 (repeat 요청 대응용) ──────────────────────
        context.last_question_text = action.text

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

@voice_router.get("/recording/{filename}")
def serve_recording(filename: str, request: Request):
    """Stream a saved call recording WAV with Range request support."""
    # Sanitize filename to prevent path traversal
    safe_name = os.path.basename(filename)
    file_path = os.path.join(CALL_RECORDINGS_DIR, safe_name)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Recording not found")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("Range")

    if range_header:
        range_val = range_header.strip().replace("bytes=", "")
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] else 0
        end   = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        end   = min(end, file_size - 1)
        chunk_size = end - start + 1

        def iter_range(path, s, length):
            with open(path, "rb") as f:
                f.seek(s)
                remaining = length
                while remaining > 0:
                    data = f.read(min(65536, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            iter_range(file_path, start, chunk_size),
            status_code=206,
            media_type="audio/wav",
            headers={
                "Content-Range":  f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(chunk_size),
                "Accept-Ranges":  "bytes",
            },
        )

    def iter_full(path):
        with open(path, "rb") as f:
            while True:
                data = f.read(65536)
                if not data:
                    break
                yield data

    return StreamingResponse(
        iter_full(file_path),
        status_code=200,
        media_type="audio/wav",
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges":  "bytes",
            "Content-Disposition": f'inline; filename="{safe_name}"',
        },
    )


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
            _finalize_call(session_id, _SESSION_DIALOGUE.get(session_id, []), ticket_id=context.ticket_id, db=db)
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
