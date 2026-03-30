import os
import enum
from datetime import datetime
from sqlalchemy import create_engine, Column, String, DateTime, Integer, Text, JSON, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session as DBSession

from logging_config import get_logger
from config import DATABASE_URL, DB_HOSTNAME, DB_PORT, DB_NAME

logger = get_logger("insight311.db")


# ---------- Connection ----------
engine = create_engine(
    DATABASE_URL,
    connect_args={"sslmode": "require"},
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
logger.info("db_engine_created host=%s port=%s db=%s pool_size=5", DB_HOSTNAME, DB_PORT, DB_NAME)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Backward-compat alias (was get_db2 for a separate recordings DB)
get_db2 = get_db

# ---------- Python Enum (for type safety in application code) ----------
class ConversationState(str, enum.Enum):
    INITIALIZING = "INITIALIZING"
    SLOT_FILLING  = "SLOT_FILLING"
    CLARIFICATION = "CLARIFICATION"
    CONFIRMATION  = "CONFIRMATION"
    SUBMITTED     = "SUBMITTED"
    ESCALATED     = "ESCALATED"

# ---------- Models (mapped to Neon schema) ----------
Base = declarative_base()

class Session(Base):
    __tablename__ = "sessions"
    session_id     = Column(String, primary_key=True)
    channel        = Column(String, nullable=False)
    language       = Column(String, default="en")
    caller_number  = Column(String, nullable=True)
    session_status = Column(String, default="active")
    current_state  = Column(String, default="INITIALIZING")  # VARCHAR in Neon
    context_data   = Column(JSON, default=dict)
    ticket_id      = Column(String, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    ended_at       = Column(DateTime, nullable=True)

class Ticket(Base):
    __tablename__ = "tickets"
    ticket_id       = Column(String, primary_key=True)
    session_id      = Column(String, nullable=True)        # nullable in Neon
    ticket_status   = Column(String, default="NEW")        # Neon default is NEW
    channel         = Column(String, nullable=False)
    department      = Column(String, nullable=True)
    category        = Column(String, nullable=True)
    location        = Column(String, nullable=True)
    description     = Column(Text,   nullable=True)
    caller_name     = Column(String, nullable=True)
    phone_number    = Column(String, nullable=True)
    severity        = Column(String, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    routing_status  = Column(String, nullable=True)
    workflow_stage  = Column(String, nullable=True)
    created_by_type = Column(String, nullable=True)
    created_by_name = Column(String, nullable=True)
    created_by_role = Column(String, nullable=True)
    handled_by_type = Column(String, nullable=True)
    handled_by_name = Column(String, nullable=True)
    handled_by_role = Column(String, nullable=True)
    notes           = Column(Text, nullable=True)
    transcript      = Column(Text, nullable=True)
    recording_url   = Column(String, nullable=True)
    rejected_reason = Column(Text, nullable=True)
    deleted_reason  = Column(Text, nullable=True)

class TTSResult(Base):
    __tablename__ = "tts_results"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    session_id    = Column(String, nullable=False)
    turn          = Column(Integer, nullable=False)
    question_text = Column(Text, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)

class Recording(Base):
    __tablename__ = "recordings"
    recording_id      = Column(String(50), primary_key=True)
    session_id        = Column(String(50), nullable=True)
    ticket_id         = Column(String(50), nullable=True)
    merged_audio_path = Column(Text, nullable=True)

class RecordingTurn(Base):
    __tablename__ = "recording_turns"
    id                  = Column(Integer, primary_key=True, autoincrement=True)
    recording_id        = Column(String(50), nullable=True)
    session_id          = Column(String(50), nullable=True)
    turn                = Column(Integer, nullable=True)
    transcript          = Column(Text, nullable=True)
    stt_audio_file_path = Column(Text, nullable=True)
    tts_question        = Column(Text, nullable=True)

# ---------- Repositories ----------
class SessionRepository:
    def __init__(self, db: DBSession):
        self.db = db

    def create_session(self, session_id: str, channel: str,
                       language: str = "en", caller_number: str = None) -> Session:
        db_session = Session(
            session_id=session_id,
            channel=channel,
            language=language,
            caller_number=caller_number,
            session_status="active",
            current_state=ConversationState.INITIALIZING.value,
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

    def save_context(self, session_id: str, context_data: dict,
                     current_state: ConversationState = None):
        session = self.get_session(session_id)
        if session:
            session.context_data = context_data
            if current_state:
                session.current_state = (
                    current_state.value
                    if isinstance(current_state, ConversationState)
                    else current_state
                )
            self.db.commit()
            self.db.refresh(session)

    def update_state(self, session_id: str, new_state: ConversationState,
                     ticket_id: str = None):
        session = self.get_session(session_id)
        if session:
            session.current_state = (
                new_state.value if isinstance(new_state, ConversationState) else new_state
            )
            if ticket_id:
                session.ticket_id = ticket_id
            if new_state in [ConversationState.SUBMITTED, ConversationState.ESCALATED]:
                session.session_status = "ended"
                session.ended_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(session)


class TicketRepository:
    def __init__(self, db: DBSession):
        self.db = db

    def create_ticket(self, ticket_id: str, session_id: str = None,
                      channel: str = "voice") -> Ticket:
        """Minimal create - used by the voice orchestrator."""
        db_ticket = Ticket(
            ticket_id=ticket_id,
            session_id=session_id,
            channel=channel,
            ticket_status="NEW",
        )
        self.db.add(db_ticket)
        self.db.commit()
        self.db.refresh(db_ticket)
        return db_ticket

    def create_ticket_full(self, ticket_id: str, fields: dict) -> Ticket:
        """Full create - used by UI-initiated ticket creation."""
        mapped = {k: v for k, v in fields.items() if hasattr(Ticket, k)}
        db_ticket = Ticket(ticket_id=ticket_id, **mapped)
        self.db.add(db_ticket)
        self.db.commit()
        self.db.refresh(db_ticket)
        return db_ticket

    def get_ticket_by_number(self, ticket_id: str) -> Ticket:
        return self.db.query(Ticket).filter(Ticket.ticket_id == ticket_id).first()

    def search_tickets(self, ticket_status: str = None,
                       channel: str = None) -> list:
        query = self.db.query(Ticket)
        if ticket_status:
            query = query.filter(Ticket.ticket_status == ticket_status)
        if channel:
            query = query.filter(Ticket.channel == channel)
        return query.all()

    def update_ticket_status(self, ticket_id: str, new_status: str) -> Ticket:
        ticket = self.get_ticket_by_number(ticket_id)
        if ticket:
            ticket.ticket_status = new_status
            self.db.commit()
            self.db.refresh(ticket)
        return ticket

    def update_ticket_fields(self, ticket_id: str, fields: dict) -> Ticket:
        """Update arbitrary fields on a ticket."""
        ticket = self.get_ticket_by_number(ticket_id)
        if ticket:
            for key, value in fields.items():
                if hasattr(ticket, key):
                    setattr(ticket, key, value)
            self.db.commit()
            self.db.refresh(ticket)
        return ticket


# ---------- Ticket ID Generator ----------
def generate_ticket_id(db: DBSession) -> str:
    """
    Generate the next sequential ticket ID in format: 311-YYYY-000001
    e.g. 10th ticket in 2026 → 311-2026-000010
    """
    year = datetime.utcnow().year
    prefix = f"311-{year}-"
    count = db.query(func.count(Ticket.ticket_id)).filter(
        Ticket.ticket_id.like(f"{prefix}%")
    ).scalar() or 0
    return f"{prefix}{count + 1:06d}"
