"""
Session data models for call tracking and transcript management
Location: src/database/models/session_model.py
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional
from enum import Enum
import uuid

class SessionStatus(Enum):
    """Session lifecycle status"""
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ABANDONED = "ABANDONED"

@dataclass
class AudioSegment:
    """Represents a single audio segment in a session"""
    segment_number: int
    file_path: str
    duration: float
    created_at: datetime = field(default_factory=datetime.now)

@dataclass
class TranscriptSegment:
    """Represents a transcribed text segment"""
    segment_number: int
    text: str
    language: str
    confidence: float
    created_at: datetime = field(default_factory=datetime.now)

@dataclass
class Session:
    """Represents a complete call session"""
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    caller_phone: Optional[str] = None
    status: SessionStatus = SessionStatus.ACTIVE
    started_at: datetime = field(default_factory=datetime.now)
    ended_at: Optional[datetime] = None
    segment_count: int = 0
    audio_segments: List[AudioSegment] = field(default_factory=list)
    transcript_segments: List[TranscriptSegment] = field(default_factory=list)
    final_audio_url: Optional[str] = None
    final_transcript_url: Optional[str] = None

    def add_audio_segment(self, file_path: str, duration: float):
        """Add a new audio segment to the session"""
        self.segment_count += 1
        segment = AudioSegment(
            segment_number=self.segment_count,
            file_path=file_path,
            duration=duration
        )
        self.audio_segments.append(segment)
        return segment

    def add_transcript_segment(self, text: str, language: str, confidence: float):
        """Add a new transcript segment to the session"""
        segment = TranscriptSegment(
            segment_number=self.segment_count,
            text=text,
            language=language,
            confidence=confidence
        )
        self.transcript_segments.append(segment)
        return segment

    def complete_session(self):
        """Mark session as completed"""
        self.status = SessionStatus.COMPLETED
        self.ended_at = datetime.now()

    def get_full_transcript(self) -> str:
        """Combine all transcript segments into full text"""
        return " ".join([seg.text for seg in self.transcript_segments])
