# src/database/models/models.py
import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Enum, Text, Integer
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class ConversationState(str, enum.Enum):
    INITIALIZING = "INITIALIZING"
    SLOT_FILLING = "SLOT_FILLING"
    CLARIFICATION = "CLARIFICATION"
    CONFIRMATION = "CONFIRMATION"
    SUBMITTED = "SUBMITTED"
    ESCALATED = "ESCALATED"


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(String, primary_key=True)
    channel = Column(String, nullable=False)
    language = Column(String, default="en")
    caller_number = Column(String, nullable=True)
    session_status = Column(String, default="active")
    current_state = Column(Enum(ConversationState), default=ConversationState.INITIALIZING)
    context_data = Column(JSON, default=dict)
    ticket_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)


class Ticket(Base):
    __tablename__ = "tickets"

    ticket_id = Column(String, primary_key=True)

    # nullable=True is important for manual/public/frontend-created tickets
    # that do not originate from a live voice session
    session_id = Column(String, nullable=True)

    ticket_status = Column(String, default="NEW")
    channel = Column(String, nullable=False)

    department = Column(String, nullable=True)
    category = Column(String, nullable=True)
    location = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    caller_name = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    severity = Column(String, nullable=True)

    # workflow / ownership
    routing_status = Column(String, nullable=True)
    workflow_stage = Column(String, nullable=True)

    created_by_type = Column(String, nullable=True)
    created_by_name = Column(String, nullable=True)
    created_by_role = Column(String, nullable=True)

    handled_by_type = Column(String, nullable=True)
    handled_by_name = Column(String, nullable=True)
    handled_by_role = Column(String, nullable=True)

    # optional metadata
    notes = Column(Text, nullable=True)
    transcript = Column(Text, nullable=True)
    recording_url = Column(String, nullable=True)
    rejected_reason = Column(Text, nullable=True)
    deleted_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TTSResult(Base):
    __tablename__ = "tts_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False)
    turn = Column(Integer, nullable=False)
    question_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)