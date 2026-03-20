import uuid
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from src.database.connection import get_db
from src.database.repositories.session_repository import SessionRepository
from src.database.repositories.ticket_repository import TicketRepository
from src.ai_orchestration.context_manager import ContextManager
from src.ai_orchestration.rule_engine import RuleEngine
from src.ai_orchestration.orchestrator import Orchestrator
from pydantic import BaseModel
from typing import Dict, Any, Optional

router = APIRouter()

# Dependency Provider for the Orchestrator
def get_orchestrator(db: Session = Depends(get_db)):
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


@router.post("/initialize")
def initialize_session(request: InitializeRequest, orchestrator: Orchestrator = Depends(get_orchestrator), db: Session = Depends(get_db)):
    """Initialize a new conversation session."""
    session_id = str(uuid.uuid4())
    
    # Needs to create session in DB first before loading context
    session_repo = SessionRepository(db)
    session_repo.create_session(session_id, request.channel, request.language, request.caller_number)
    
    context, action = orchestrator.initialize_session(session_id, request.channel, request.caller_number)
    
    return {
        "session_id": session_id,
        "action": action.dict(),
        "context": context.dict()
    }

@router.post("/process")
def process_turn(request: ProcessRequest, orchestrator: Orchestrator = Depends(get_orchestrator)):
    """Process a single turn of conversation with transcribed text and NLU results."""
    try:
        context, action = orchestrator.process_turn(request.session_id, request.transcript, request.nlu_output)
        return {
            "session_id": request.session_id,
            "action": action.dict(),
            "context": context.dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
@router.get("/session/{session_id}")
def get_session_context(session_id: str, db: Session = Depends(get_db)):
    session_repo = SessionRepository(db)
    db_session = session_repo.get_session(session_id)
    if not db_session:
         raise HTTPException(status_code=404, detail="Session not found")
         
    return {
        "session_id": db_session.session_id,
        "channel": db_session.channel,
        "status": db_session.session_status,
        "current_state": db_session.current_state,
        "ticket_id": db_session.ticket_id,
        "context_data": db_session.context_data
    }
