"""
Repository for Session operations
"""
from sqlalchemy.orm import Session
from ..models import Session as SessionModel, SessionStatus
from datetime import datetime
from typing import Optional


class SessionRepository:
    """
    Handles all database operations for Sessions
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_session(self, session_id: str, caller_id: Optional[str] = None) -> SessionModel:
        """
        Create a new session
        """
        session = SessionModel(
            id=session_id,
            caller_id=caller_id,
            status=SessionStatus.ACTIVE,
            created_at=datetime.utcnow()
        )
        
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        
        return session
    
    def get_session(self, session_id: str) -> Optional[SessionModel]:
        """
        Get session by ID
        """
        return self.db.query(SessionModel).filter(SessionModel.id == session_id).first()
    
    def update_session_context(self, session_id: str, context: dict) -> SessionModel:
        """
        Update conversation context
        """
        session = self.get_session(session_id)
        
        if session:
            session.conversation_context = context
            session.current_state = context.get("current_state")
            
            # Update extracted entities if available
            entities = context.get("extracted_entities", {})
            session.extracted_category = entities.get("category")
            session.extracted_location = entities.get("location")
            session.extracted_description = entities.get("description")
            session.extracted_name = entities.get("citizen_name")
            session.extracted_phone = entities.get("citizen_phone")
            
            # Update confidence scores
            scores = context.get("confidence_scores", {})
            session.category_confidence = scores.get("category", 0.0)
            session.location_confidence = scores.get("location", 0.0)
            session.description_confidence = scores.get("description", 0.0)
            session.name_confidence = scores.get("citizen_name", 0.0)
            session.phone_confidence = scores.get("citizen_phone", 0.0)
            
            session.updated_at = datetime.utcnow()
            
            self.db.commit()
            self.db.refresh(session)
        
        return session
    
    def mark_escalated(self, session_id: str, reason: str) -> SessionModel:
        """
        Mark session as escalated to agent
        """
        session = self.get_session(session_id)
        
        if session:
            session.status = SessionStatus.ESCALATED
            session.escalated = True
            session.escalation_reason = reason
            session.escalated_at = datetime.utcnow()
            
            self.db.commit()
            self.db.refresh(session)
        
        return session
    
    def mark_completed(self, session_id: str) -> SessionModel:
        """
        Mark session as completed
        """
        session = self.get_session(session_id)
        
        if session:
            session.status = SessionStatus.COMPLETED
            session.completed_at = datetime.utcnow()
            
            self.db.commit()
            self.db.refresh(session)
        
        return session
