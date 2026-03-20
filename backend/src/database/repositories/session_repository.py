from sqlalchemy.orm import Session as DBSession
from src.database.models.models import Session, ConversationState
from datetime import datetime

class SessionRepository:
    def __init__(self, db: DBSession):
        self.db = db

    def create_session(self, session_id: str, channel: str, language: str = "en", caller_number: str = None) -> Session:
        db_session = Session(
            session_id=session_id,
            channel=channel,
            language=language,
            caller_number=caller_number,
            session_status="active",
            current_state=ConversationState.INITIALIZING,
            context_data={},
        )
        self.db.add(db_session)
        self.db.commit()
        self.db.refresh(db_session)
        return db_session

    def get_session(self, session_id: str) -> Session:
        return self.db.query(Session).filter(Session.session_id == session_id).first()

    def load_context(self, session_id: str) -> dict:
        session = self.get_session(session_id)
        if session and session.context_data:
            return session.context_data
        return {}

    def save_context(self, session_id: str, context_data: dict, current_state: ConversationState = None):
        session = self.get_session(session_id)
        if session:
            session.context_data = context_data
            if current_state:
                session.current_state = current_state
            self.db.commit()
            self.db.refresh(session)

    def update_state(self, session_id: str, new_state: ConversationState, ticket_id: str = None):
        session = self.get_session(session_id)
        if session:
            session.current_state = new_state
            if ticket_id:
                session.ticket_id = ticket_id
            if new_state in [ConversationState.SUBMITTED, ConversationState.ESCALATED]:
                session.session_status = "ended"
                session.ended_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(session)
