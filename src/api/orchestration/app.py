"""
FastAPI application - HTTP endpoints for the orchestrator
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, List
import uuid

# Import our orchestrator
from src.ai_orchestration.orchestrator import Orchestrator
from src.database.connection import get_db_context
from src.database.repositories import TranscriptRepository
from src.database.repositories import SessionRepository
from src.database.models import Session

app = FastAPI(title="Insight311 Orchestration API")
orchestrator = Orchestrator()


# Request/Response models
class InitializeRequest(BaseModel):
    caller_id: Optional[str] = None


class ProcessRequest(BaseModel):
    session_id: str
    transcript: Optional[str] = None
    nlu_output: Optional[Dict] = None


class TranscriptResponse(BaseModel):
    speaker: str
    text: str
    timestamp: Optional[str] = None
    confidence: Optional[float] = None


@app.post("/api/orchestrator/initialize")
async def initialize_session(request: InitializeRequest):
    """
    Start a new conversation session
    """
    # Generate unique session ID
    session_id = str(uuid.uuid4())
    
    # Initialize
    action = orchestrator.initialize_session(session_id)
    
    return {
        "session_id": session_id,
        "action_type": action.type,
        "text_to_speak": action.text,
        "state": action.new_state,
        "should_escalate": action.should_escalate
    }


@app.post("/api/orchestrator/process")
async def process_turn(request: ProcessRequest):
    """
    Process a conversation turn (after user speaks)
    """
    action = orchestrator.process_turn(
        session_id=request.session_id,
        transcript=request.transcript,
        nlu_output=request.nlu_output
    )
    
    return {
        "session_id": request.session_id,
        "action_type": action.type,
        "text_to_speak": action.text,
        "field_asked": action.field,
        "state": action.new_state,
        "should_escalate": action.should_escalate,
        "ticket_id": action.ticket_id
    }


@app.get("/")
async def root():
    return {"message": "Insight311 Orchestration API", "status": "running"}


# ============================================================
# SESSION ENDPOINTS
# ============================================================

@app.get("/api/sessions")
async def list_all_sessions(skip: int = 0, limit: int = 100):
    """
    List all sessions with their basic info
    
    Query Parameters:
    - skip: Number of sessions to skip (for pagination)
    - limit: Max number of sessions to return (max 100)
    """
    try:
        with get_db_context() as db:
            # Query sessions with pagination
            sessions = db.query(Session).offset(skip).limit(limit).all()
            
            return {
                "total_count": db.query(Session).count(),
                "skip": skip,
                "limit": limit,
                "sessions": [
                    {
                        "session_id": s.id,
                        "status": s.status.value if s.status else None,
                        "current_state": s.current_state,
                        "caller_id": s.caller_id,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                        "escalated": s.escalated,
                        "escalation_reason": s.escalation_reason
                    }
                    for s in sessions
                ]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}")
async def get_session_info(session_id: str):
    """
    Get detailed information about a specific session
    """
    try:
        with get_db_context() as db:
            session = db.query(Session).filter(Session.id == session_id).first()
            
            if not session:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
            
            return {
                "session_id": session.id,
                "status": session.status.value if session.status else None,
                "current_state": session.current_state,
                "caller_id": session.caller_id,
                "created_at": session.created_at.isoformat() if session.created_at else None,
                "updated_at": session.updated_at.isoformat() if session.updated_at else None,
                "completed_at": session.completed_at.isoformat() if session.completed_at else None,
                "escalated": session.escalated,
                "escalation_reason": session.escalation_reason,
                "extracted_category": session.extracted_category,
                "extracted_location": session.extracted_location,
                "extracted_description": session.extracted_description,
                "extracted_name": session.extracted_name,
                "extracted_phone": session.extracted_phone,
                "confidence_scores": {
                    "category": session.category_confidence,
                    "location": session.location_confidence,
                    "description": session.description_confidence,
                    "name": session.name_confidence,
                    "phone": session.phone_confidence
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# TRANSCRIPT ENDPOINTS
# ============================================================

@app.get("/api/transcripts/{session_id}")
async def get_all_transcripts(session_id: str):
    """
    Get all transcripts for a session
    
    Returns both user and system messages in chronological order
    """
    try:
        with get_db_context() as db:
            repo = TranscriptRepository(db)
            transcripts = repo.get_session_transcripts(session_id)
            
            if not transcripts:
                return {
                    "session_id": session_id,
                    "transcripts": [],
                    "total_count": 0
                }
            
            return {
                "session_id": session_id,
                "transcripts": [
                    {
                        "speaker": t.speaker,
                        "text": t.text,
                        "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                        "confidence": t.confidence_score,
                        "duration_seconds": t.duration_seconds
                    }
                    for t in transcripts
                ],
                "total_count": len(transcripts)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/transcripts/{session_id}/conversation-history")
async def get_conversation_history(session_id: str):
    """
    Get formatted conversation history for a session
    
    Returns user and system messages in a clean conversation format
    """
    try:
        with get_db_context() as db:
            repo = TranscriptRepository(db)
            history = repo.get_conversation_history(session_id)
            
            return {
                "session_id": session_id,
                "conversation": history,
                "total_turns": len(history)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/transcripts/{session_id}/user-messages")
async def get_user_messages(session_id: str):
    """
    Get only user messages for a session
    
    Useful for analyzing what users reported
    """
    try:
        with get_db_context() as db:
            repo = TranscriptRepository(db)
            transcripts = repo.get_session_transcripts(session_id, speaker="user")
            
            return {
                "session_id": session_id,
                "user_messages": [
                    {
                        "text": t.text,
                        "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                        "confidence": t.confidence_score
                    }
                    for t in transcripts
                ],
                "total_messages": len(transcripts)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/transcripts/{session_id}/system-responses")
async def get_system_responses(session_id: str):
    """
    Get only system responses for a session
    
    Useful for reviewing what the bot said
    """
    try:
        with get_db_context() as db:
            repo = TranscriptRepository(db)
            transcripts = repo.get_session_transcripts(session_id, speaker="system")
            
            return {
                "session_id": session_id,
                "system_responses": [
                    {
                        "text": t.text,
                        "timestamp": t.timestamp.isoformat() if t.timestamp else None
                    }
                    for t in transcripts
                ],
                "total_responses": len(transcripts)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))