"""
Data models for the orchestration layer
These are like blueprints for the data we'll work with
"""
from enum import Enum
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel


class ConversationState(str, Enum):
    """
    All possible states a conversation can be in
    Think of this like a roadmap of where the conversation is
    """
    INITIALIZED = "initialized"
    GREETING = "greeting"
    LISTENING = "listening"
    PROCESSING = "processing"
    COLLECTING_INFO = "collecting_info"
    VALIDATING = "validating"
    CONFIRMING = "confirming"
    CORRECTING = "correcting"
    CREATING_TICKET = "creating_ticket"
    COMPLETED = "completed"
    ESCALATED = "escalated"
    FAILED = "failed"


class Action(BaseModel):
    """
    Represents what the system should do next
    """
    type: str  # e.g., "ASK_QUESTION", "CONFIRM", "CREATE_TICKET"
    text: Optional[str] = None  # What to say to the user
    field: Optional[str] = None  # Which field we're asking about
    new_state: ConversationState  # What state to move to
    should_escalate: bool = False
    ticket_id: Optional[str] = None


class ConversationContext(BaseModel):
    """
    Everything we know about the conversation
    This is like the conversation's memory
    """
    session_id: str
    current_state: ConversationState
    
    # Information extracted from user
    extracted_entities: Dict[str, Any] = {
        "category": None,
        "location": None,
        "description": None,
        "citizen_name": None,
        "citizen_phone": None
    }
    
    # How confident we are about each piece of info (0.0 to 1.0)
    confidence_scores: Dict[str, float] = {
        "category": 0.0,
        "location": 0.0,
        "description": 0.0,
        "citizen_name": 0.0,
        "citizen_phone": 0.0
    }
    
    # Complete conversation history
    conversation_history: List[Dict] = []
    
    # Tracking which questions we've asked and how many times
    questions_asked: Dict[str, int] = {}
    
    # Fields we still need to collect
    missing_fields: List[str] = []
    
    # Last question we asked (helps avoid repetition)
    last_question_asked: Optional[str] = None
    
    # If escalating, why?
    escalation_reason: Optional[str] = None
    
    # Timestamps
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()
    
    class Config:
        """Allow datetime objects"""
        arbitrary_types_allowed = True


class NLUOutput(BaseModel):
    """
    What we receive from the NLU service
    """
    category: Optional[str] = None
    category_confidence: float = 0.0
    
    location: Optional[str] = None
    location_confidence: float = 0.0
    
    description: Optional[str] = None
    description_confidence: float = 0.0
    
    citizen_name: Optional[str] = None
    name_confidence: float = 0.0
    
    citizen_phone: Optional[str] = None
    phone_confidence: float = 0.0
    
    sentiment: Optional[str] = "neutral"  # neutral, frustrated, angry, urgent
    urgency_score: float = 0.5  # 0.0 to 1.0
