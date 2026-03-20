from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from src.database.models.models import ConversationState

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
    # Add raw text for "other" category descriptions
    raw_issue_text: Optional[str] = None

class Action(BaseModel):
    action_type: str = Field(..., description="Action type like 'ask_question', 'confirm', 'submit', 'escalate'")
    text: str = Field(..., description="The message or question to return to the user via TTS/Text")
    field: Optional[str] = Field(None, description="The specific field being targeted for clarification or question")
    new_state: ConversationState = Field(..., description="The next state the conversation should transition into")
    should_escalate: bool = False
    ticket_id: Optional[str] = None
