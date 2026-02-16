"""
FastAPI application - HTTP endpoints for the orchestrator
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
import uuid

# Import our orchestrator
from src.ai_orchestration.orchestrator import Orchestrator

app = FastAPI(title="Insight311 Orchestration API")
orchestrator = Orchestrator()


# Request/Response models
class InitializeRequest(BaseModel):
    caller_id: Optional[str] = None


class ProcessRequest(BaseModel):
    session_id: str
    transcript: Optional[str] = None
    nlu_output: Optional[Dict] = None


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
