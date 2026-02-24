# src/api/ml_service.py
# INSIGHT311 NLU Service — Main API Server
# Full call flow: Session → STT → NLU → Orchestrator → TTS → Recording → DB

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../"))

from flask import Flask, request, redirect, jsonify, make_response
from flask_restful import Api, Resource
from flask_cors import CORS
import uuid
from datetime import datetime
from typing import Dict, Any
import json

from src.ai_orchestration.nlu.nlu_processor import NLUProcessor
nlu_engine = NLUProcessor(use_ml_classifier=True)

from src.database.database import (
    save_session, get_session, update_session,
    save_ticket, get_ticket, get_all_tickets, update_ticket,
    save_tts_result,
    save_recording, save_recording_turn, get_recording, delete_recording, serialize
)
from src.voice_conversion.speech_to_text.stt_service import (
    process_turn, merge_audio_files
)
from src.voice_conversion.text_to_speech.tts_service import speak
from src.ai_orchestration.orchestrator import decide_action, initial_greeting

class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)
    
app = Flask(__name__)
app.json_encoder = DateTimeEncoder
api = Api(app)

API_KEY = "test123"
BASE    = "/INSIGHT311API"


def ts() -> str:
    """Return current UTC timestamp in ISO-like format."""
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")


def ok() -> bool:
    """Simple API key check."""
    return request.args.get("apikey") == API_KEY


    
# ── In-memory session state store (demo) ───────────────────────────

_DEFAULT_FIELDS: Dict[str, Any] = {
    "category": None,
    "location": None,
    "description": None,
    "severity": None,     # not required, but captured from NLU if present
    "caller_name": None,
    "phone_number": None,
    "raw_issue_text": None  # Original user issue utterance (for "other" category)
}

_SESSION_STATE: Dict[str, Dict[str, Any]] = {}


def get_collected_fields(session_id: str) -> Dict[str, Any]:
    """Get current collected_fields for a session, or initialize defaults."""
    stored = _SESSION_STATE.get(session_id)
    if stored is None:
        stored = _DEFAULT_FIELDS.copy()
        _SESSION_STATE[session_id] = stored
    return stored


def save_collected_fields(session_id: str, collected_fields: Dict[str, Any]) -> None:
    """Persist collected_fields for a session in memory (demo only)."""
    _SESSION_STATE[session_id] = collected_fields


# ── Root ──────────────────────────────────────────────────────────
@app.route("/")
def index():
    return redirect(BASE)


@app.route(BASE)
def base_index():
    return {
        "service":  "INSIGHT311 NLU Service",
        "version":  "2.0",
        "status":   "running",
        "port":     8311,
        "database": "PostgreSQL DB1: insight311 / DB2: insight311_recordings",
    }

@app.route('/INSIGHT311API/stt/transcribe', methods=['POST'])
def transcribe():
    data = request.get_json()
    session_id = data.get("session_id")
    turn = data.get("turn", 1)

    # ✅ This line MUST call process_turn to trigger the mic!
    from src.voice_conversion.speech_to_text.stt_service import process_turn
    
    result = process_turn(session_id, turn)
    
    # Check if transcription failed
    if result.get("transcript") == "None":
        return jsonify({"status": "error", "message": "No speech detected"}), 400

    return jsonify(result)


# ── 1. POST /sessions ─────────────────────────────────────────────
class SessionsResource(Resource):
    def post(self):
        """Create a new call session and play initial TTS greeting."""
        if not ok():
            return {"error": "Unauthorized"}, 401

        data = request.get_json() or {}
        if not data.get("channel"):
            return {"error": "Missing required field: channel"}, 400

        session_id = str(uuid.uuid4())
        save_session(
            session_id    = session_id,
            channel       = data["channel"],
            language      = data.get("language", "en"),
            caller_number = data.get("caller_number"),
        )

        # Initialize in-memory collected_fields for this session
        _SESSION_STATE[session_id] = _DEFAULT_FIELDS.copy()

        speak(initial_greeting())

        return {
            "session_id":     session_id,
            "session_status": "active",
            "created_at":     ts(),
            "channel":        data["channel"],
        }, 201


# ── 9 & 12. PUT + GET /sessions/<session_id> ──────────────────────
class SessionResource(Resource):
    def get(self, session_id):
        if not ok():
            return {"error": "Unauthorized"}, 401

        session = get_session(session_id)
        if not session:
            return {"error": "Not Found"}, 404

        return serialize(dict(session)), 200

    def put(self, session_id):
        if not ok():
            return {"error": "Unauthorized"}, 401

        session = get_session(session_id)
        if not session:
            return {"error": "Not Found"}, 404

        data   = request.get_json() or {}
        status = data.get("session_status")
        if status not in ["ended", "deleted"]:
            return {"error": "session_status must be 'ended' or 'deleted'"}, 422

        update_session(session_id, {
            "session_status": status,
            "ended_at":       datetime.utcnow(),
        })

        return serialize(dict(get_session(session_id))), 200


# ── 2 & 10. POST + GET /tickets ───────────────────────────────────
class TicketsResource(Resource):
    def post(self):
        """Create a draft ticket linked to a session."""
        if not ok():
            return {"error": "Unauthorized"}, 401

        data = request.get_json() or {}
        if not data.get("session_id"):
            return {"error": "Missing required field: session_id"}, 400

        session_id = data["session_id"]
        session    = get_session(session_id)
        if not session:
            return {"error": "Session not found"}, 404

        ticket_id = f"TKT-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"

        save_ticket(ticket_id, session_id, session["channel"])
        update_session(session_id, {"ticket_id": ticket_id})

        return {
            "ticket_id":     ticket_id,
            "session_id":    session_id,
            "ticket_status": "draft",
            "created_at":    ts(),
        }, 201

    def get(self):
        if not ok():
            return {"error": "Unauthorized"}, 401

        tickets = get_all_tickets(
            ticket_status = request.args.get("ticket_status"),
            channel       = request.args.get("channel"),
        )
        return {
            "total":   len(tickets),
            "tickets": serialize([dict(t) for t in tickets]),
        }, 200


# ── 6 & 11. PUT + GET /tickets/<ticket_id> ────────────────────────
class TicketResource(Resource):
    def get(self, ticket_id):
        if not ok():
            return {"error": "Unauthorized"}, 401

        ticket = get_ticket(ticket_id)
        if not ticket:
            return {"error": "Not Found"}, 404

        return serialize(dict(ticket)), 200

    def put(self, ticket_id):
        if not ok():
            return {"error": "Unauthorized"}, 401

        ticket = get_ticket(ticket_id)
        if not ticket:
            return {"error": "Not Found"}, 404

        data    = request.get_json() or {}
        updates = data.get("collected_fields", {})

        if "ticket_status" in data:
            if data["ticket_status"] not in ["draft", "submitted", "cancelled", "deleted"]:
                return {"error": "Invalid ticket_status value"}, 422
            updates["ticket_status"] = data["ticket_status"]

        update_ticket(ticket_id, updates)
        return serialize(dict(get_ticket(ticket_id))), 200


# ── 3. POST /stt/transcribe ───────────────────────────────────────
class STTResource(Resource):
    def post(self):
        """Capture one speech turn, transcribe, and store a temp audio file."""
        if not ok():
            return {"error": "Unauthorized"}, 401

        data = request.get_json() or {}
        if not data.get("session_id"):
            return {"error": "Missing required field: session_id"}, 400

        result = process_turn(
            session_id = data["session_id"],
            turn       = data.get("turn", 1),
            duration   = data.get("duration", 10),
        )
        return result, 201


# ── 4. POST /nlu/analyze ──────────────────────────────────────────
class NLUAnalyzeResource(Resource):
    def post(self):
        """
        NLU stub — replace with real model from src/ai_orchestration/nlu/
        Should return extracted fields + per-field confidence
        + confirmation/correction signals.
        """
        if not ok():
            return {"error": "Unauthorized"}, 401

        data = request.get_json() or {}
        if not data.get("session_id") or not data.get("transcript"):
            return {"error": "Missing required fields: session_id, transcript"}, 400

        try:
            nlu_result = nlu_engine.process(data["transcript"], data["session_id"])
            return nlu_result, 201
        except Exception as e:
            return {"error": "NLU processing failed", "message": str(e)}, 500



# ── 5. POST /orchestrator/action ──────────────────────────────────
class OrchestratorResource(Resource):
    def post(self):
        """
        Decide next action based on NLU result and collected fields,
        trigger TTS for the next question, and save TTS result to DB1.
        """
        if not ok():
            return {"error": "Unauthorized"}, 401

        data = request.get_json() or {}
        if not data.get("session_id") or not data.get("ticket_id"):
            return {"error": "Missing required fields: session_id, ticket_id"}, 400

        session_id = data["session_id"]
        ticket_id  = data["ticket_id"]
        nlu_result = data.get("nlu_result", {})
        turn       = data.get("turn", 1)
        transcript = data.get("transcript")  # optional, but used for raw_issue_text

        # Load previously collected fields for this session
        collected_fields = get_collected_fields(session_id)

        # Set raw_issue_text once, from the first meaningful user utterance
        if transcript and not collected_fields.get("raw_issue_text"):
            collected_fields["raw_issue_text"] = transcript

        # Decide next action and merge NLU result into collected_fields
        result = decide_action(nlu_result, collected_fields, ticket_id)

        # Persist updated collected_fields for this session (in-memory)
        save_collected_fields(session_id, result["collected_fields"])

        # 🔹 Persist collected_fields into ticket record in DB on every turn
        try:
            if ticket_id:
                update_ticket(ticket_id, result["collected_fields"])
        except Exception as e:
            print(f"[WARN] Failed to update ticket {ticket_id} with collected_fields: {e}")

        # If we have a next question, synthesize and store TTS
        if result["next_question"]:
            speak(result["next_question"])
            save_tts_result(session_id, turn, result["next_question"])

        return {
            "session_id":            session_id,
            "ticket_id":             ticket_id,
            "action":                result["action"],
            "next_question":         result["next_question"],
            "collected_fields":      result["collected_fields"],
            "missing_fields":        result["missing_fields"],
            "ready_to_submit":       result["ready_to_submit"],
            "overall_confidence":    result.get("overall_confidence"),
            "low_confidence_fields": result.get("low_confidence_fields", []),
        }, 201


# ── 7. POST /tts/synthesize ───────────────────────────────────────
class TTSResource(Resource):
    def post(self):
        """Standalone TTS endpoint for arbitrary prompts if needed."""
        if not ok():
            return {"error": "Unauthorized"}, 401

        data = request.get_json() or {}
        if not data.get("session_id") or not data.get("next_question"):
            return {"error": "Missing required fields: session_id, next_question"}, 400

        speak(data["next_question"])

        return {
            "session_id": data["session_id"],
            "spoken":     data["next_question"],
            "created_at": ts(),
        }, 201


# ── 8. POST /recordings ───────────────────────────────────────────
class RecordingsResource(Resource):
    def post(self):
        """
        Merge temporary audio files, save merged recording to DB2,
        store per-turn transcript metadata, and clean up temp files.
        """
        if not ok():
            return {"error": "Unauthorized"}, 401

        data = request.get_json() or {}
        if not data.get("session_id") or not data.get("ticket_id"):
            return {"error": "Missing required fields: session_id, ticket_id"}, 400

        session_id   = data["session_id"]
        ticket_id    = data["ticket_id"]
        turn_count   = data.get("turn_count", 1)
        turns_data   = data.get("turns", [])
        recording_id = f"REC-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"

        merged_path = merge_audio_files(session_id, turn_count)
        save_recording(recording_id, session_id, ticket_id, merged_path)

        for turn in turns_data:
            save_recording_turn(
                recording_id        = recording_id,
                session_id          = session_id,
                turn                = turn["turn"],
                transcript          = turn.get("transcript"),
                stt_audio_file_path = turn.get("audio_file_path"),
                tts_question        = turn.get("tts_question"),
            )

        return {
            "recording_id":      recording_id,
            "session_id":        session_id,
            "ticket_id":         ticket_id,
            "merged_audio_path": merged_path,
            "created_at":        ts(),
        }, 201


# ── 13 & 14. GET + DELETE /recordings/<recording_id> ──────────────
class RecordingResource(Resource):
    def get(self, recording_id):
        if not ok():
            return {"error": "Unauthorized"}, 401

        recording = get_recording(recording_id)
        if not recording:
            return {"error": "Not Found"}, 404

        return serialize(dict(recording)), 200

    def delete(self, recording_id):
        if not ok():
            return {"error": "Unauthorized"}, 401

        if not get_recording(recording_id):
            return {"error": "Not Found"}, 404

        delete_recording(recording_id)
        return {"recording_id": recording_id, "deleted_at": ts()}, 200


# ── Register Routes ───────────────────────────────────────────────
api.add_resource(SessionsResource,     f"{BASE}/sessions")
api.add_resource(SessionResource,      f"{BASE}/sessions/<string:session_id>")
api.add_resource(TicketsResource,      f"{BASE}/tickets")
api.add_resource(TicketResource,       f"{BASE}/tickets/<string:ticket_id>")
api.add_resource(STTResource,          f"{BASE}/stt/transcribe")
api.add_resource(NLUAnalyzeResource,   f"{BASE}/nlu/analyze")
api.add_resource(OrchestratorResource, f"{BASE}/orchestrator/action")
api.add_resource(TTSResource,          f"{BASE}/tts/synthesize")
api.add_resource(RecordingsResource,   f"{BASE}/recordings")
api.add_resource(RecordingResource,    f"{BASE}/recordings/<string:recording_id>")


if __name__ == "__main__":
    print("INSIGHT311 NLU Service running on port 8311")
    app.run(port=8311, debug=False)
