"""
Database Models for Insight311
These define the structure of our database tables
"""
from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, 
    ForeignKey, Enum, JSON, Boolean
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()


class SessionStatus(str, enum.Enum):
    """Possible session states"""
    ACTIVE = "active"
    COMPLETED = "completed"
    ESCALATED = "escalated"
    FAILED = "failed"


class TicketStatus(str, enum.Enum):
    """Ticket lifecycle states"""
    RECEIVED = "received"
    UNDER_REVIEW = "under_review"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CLOSED = "closed"


class TicketPriority(str, enum.Enum):
    """Priority levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Session(Base):
    """
    Represents a single conversation/call session
    """
    __tablename__ = "sessions"
    
    # Primary Key
    id = Column(String, primary_key=True)  # UUID
    
    # Session info
    caller_id = Column(String, nullable=True)  # Phone number if available
    status = Column(Enum(SessionStatus), default=SessionStatus.ACTIVE)
    
    # Conversation state (stored as JSON for flexibility)
    current_state = Column(String, default="initialized")
    conversation_context = Column(JSON, nullable=True)  # Full context object
    
    # Extracted information
    extracted_category = Column(String, nullable=True)
    extracted_location = Column(String, nullable=True)
    extracted_description = Column(Text, nullable=True)
    extracted_name = Column(String, nullable=True)
    extracted_phone = Column(String, nullable=True)
    
    # Confidence scores
    category_confidence = Column(Float, default=0.0)
    location_confidence = Column(Float, default=0.0)
    description_confidence = Column(Float, default=0.0)
    name_confidence = Column(Float, default=0.0)
    phone_confidence = Column(Float, default=0.0)
    
    # Escalation tracking
    escalated = Column(Boolean, default=False)
    escalation_reason = Column(Text, nullable=True)
    escalated_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    transcripts = relationship("Transcript", back_populates="session", cascade="all, delete-orphan")
    ticket = relationship("Ticket", back_populates="session", uselist=False)
    audio_files = relationship("AudioFile", back_populates="session", cascade="all, delete-orphan")


class Transcript(Base):
    """
    Stores conversation transcripts (can be segments or full)
    """
    __tablename__ = "transcripts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"))
    
    # Transcript content
    text = Column(Text, nullable=False)
    speaker = Column(String)  # "user" or "system"
    
    # Timing
    timestamp = Column(DateTime, default=datetime.utcnow)
    duration_seconds = Column(Float, nullable=True)
    
    # Metadata
    is_final = Column(Boolean, default=False)  # True for complete, False for partial
    confidence_score = Column(Float, nullable=True)
    
    # Relationship
    session = relationship("Session", back_populates="transcripts")


class Department(Base):
    """
    Municipal departments that handle tickets
    """
    __tablename__ = "departments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    
    # Active/inactive
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    tickets = relationship("Ticket", back_populates="department")
    categories = relationship("Category", back_populates="department")


class Category(Base):
    """
    Issue categories (Pothole, Streetlight, Noise, etc.)
    """
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    
    # Which department handles this category
    department_id = Column(Integer, ForeignKey("departments.id"))
    
    # Default priority for this category
    default_priority = Column(Enum(TicketPriority), default=TicketPriority.MEDIUM)
    
    # Active/inactive
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    department = relationship("Department", back_populates="categories")
    tickets = relationship("Ticket", back_populates="category")


class Ticket(Base):
    """
    Service request tickets
    """
    __tablename__ = "tickets"
    
    # Primary Key
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Ticket number (format: YYYYMMDD-####)
    ticket_number = Column(String, unique=True, nullable=False, index=True)
    
    # Foreign Keys
    session_id = Column(String, ForeignKey("sessions.id"), unique=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    assigned_agent_id = Column(Integer, ForeignKey("agents.id"), nullable=True)
    
    # Ticket details
    location = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    
    # Citizen information
    citizen_name = Column(String, nullable=False)
    citizen_phone = Column(String, nullable=False)
    citizen_email = Column(String, nullable=True)
    
    # Priority and status
    priority = Column(Enum(TicketPriority), default=TicketPriority.MEDIUM)
    status = Column(Enum(TicketStatus), default=TicketStatus.RECEIVED)
    
    # Source tracking
    source = Column(String, default="AI_VOICE")  # AI_VOICE, MANUAL, WEB, etc.
    is_manual = Column(Boolean, default=False)
    
    # Duplicate detection
    is_duplicate = Column(Boolean, default=False)
    duplicate_of_ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True)
    similarity_score = Column(Float, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    
    # Relationships
    session = relationship("Session", back_populates="ticket")
    category = relationship("Category", back_populates="tickets")
    department = relationship("Department", back_populates="tickets")
    assigned_agent = relationship("Agent", back_populates="tickets")
    
    # Modification history
    modifications = relationship("TicketModification", back_populates="ticket", cascade="all, delete-orphan")
    
    # Duplicate tracking
    duplicates = relationship("Ticket", remote_side=[id], backref="original_ticket")


class Agent(Base):
    """
    Human agents who can review/modify tickets
    """
    __tablename__ = "agents"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Agent info
    username = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    
    # Authentication (in real app, use proper password hashing)
    password_hash = Column(String, nullable=False)
    
    # Role
    role = Column(String, default="agent")  # agent, supervisor, admin
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # Relationships
    tickets = relationship("Ticket", back_populates="assigned_agent")
    modifications = relationship("TicketModification", back_populates="modified_by")


class TicketModification(Base):
    """
    Tracks all changes made to tickets (audit trail)
    """
    __tablename__ = "ticket_modifications"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Foreign Keys
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"))
    modified_by_id = Column(Integer, ForeignKey("agents.id"))
    
    # What changed
    field_name = Column(String, nullable=False)  # Which field was modified
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    
    # When
    modified_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    ticket = relationship("Ticket", back_populates="modifications")
    modified_by = relationship("Agent", back_populates="modifications")


class AudioFile(Base):
    """
    Stores metadata about audio recordings
    """
    __tablename__ = "audio_files"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Foreign Key
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"))
    
    # File information
    file_name = Column(String, nullable=False)  # e.g., "session-123_audio.wav"
    storage_path = Column(String, nullable=False)  # S3/Azure path
    file_size_bytes = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    
    # Type
    file_type = Column(String, default="audio")  # audio, transcript
    mime_type = Column(String, nullable=True)  # audio/wav, text/plain
    
    # Timestamps
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship
    session = relationship("Session", back_populates="audio_files")


class StatusNotification(Base):
    """
    Tracks notifications sent to citizens about ticket status changes
    """
    __tablename__ = "status_notifications"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Which ticket
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"))
    
    # Notification details
    notification_type = Column(String, nullable=False)  # SMS, EMAIL, PUSH
    recipient = Column(String, nullable=False)  # Phone number or email
    
    # Content
    message = Column(Text, nullable=False)
    
    # Status
    sent_at = Column(DateTime, nullable=True)
    delivered = Column(Boolean, default=False)
    delivery_status = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
