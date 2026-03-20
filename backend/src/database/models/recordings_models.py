import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, JSON, Enum, Text, ForeignKey, Float, Integer
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class Recording(Base):
    __tablename__ = "recordings"

    recording_id = Column(String, primary_key=True)
    session_id = Column(String, nullable=False)
    ticket_id = Column(String, nullable=True)
    merged_audio_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class RecordingTurn(Base):
    __tablename__ = "recording_turns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recording_id = Column(String, ForeignKey("recordings.recording_id", ondelete="CASCADE"), nullable=False)
    session_id = Column(String, nullable=False)
    turn = Column(Integer, nullable=False)
    transcript = Column(Text, nullable=True)
    stt_audio_file_path = Column(String, nullable=True)
    tts_question = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
