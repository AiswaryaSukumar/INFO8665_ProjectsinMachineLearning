"""
Repository for Transcript operations
"""
from sqlalchemy.orm import Session
from ..models import Transcript
from datetime import datetime
from typing import List, Optional


class TranscriptRepository:
    """
    Handles all database operations for Transcripts
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def save_transcript(
        self, 
        session_id: str, 
        text: str, 
        speaker: str = "user",
        is_final: bool = True,
        confidence_score: Optional[float] = None,
        duration_seconds: Optional[float] = None
    ) -> Transcript:
        """
        Save a transcript to the database
        
        Args:
            session_id: The session this transcript belongs to
            text: The transcript text
            speaker: Who spoke ("user" or "system")
            is_final: Whether this is a final/complete transcript
            confidence_score: Confidence in the transcription (0.0-1.0)
            duration_seconds: How long the audio was
            
        Returns:
            The created Transcript object
        """
        transcript = Transcript(
            session_id=session_id,
            text=text,
            speaker=speaker,
            is_final=is_final,
            confidence_score=confidence_score,
            duration_seconds=duration_seconds,
            timestamp=datetime.utcnow()
        )
        
        self.db.add(transcript)
        self.db.commit()
        self.db.refresh(transcript)
        
        return transcript
    
    def save_user_transcript(
        self, 
        session_id: str, 
        text: str,
        confidence_score: Optional[float] = None,
        duration_seconds: Optional[float] = None
    ) -> Transcript:
        """
        Convenience method to save user transcript
        
        Args:
            session_id: The session ID
            text: What the user said
            confidence_score: STT confidence
            duration_seconds: Duration of audio
            
        Returns:
            The created Transcript
        """
        return self.save_transcript(
            session_id=session_id,
            text=text,
            speaker="user",
            is_final=True,
            confidence_score=confidence_score,
            duration_seconds=duration_seconds
        )
    
    def save_system_transcript(
        self, 
        session_id: str, 
        text: str
    ) -> Transcript:
        """
        Convenience method to save system response
        
        Args:
            session_id: The session ID
            text: What the system said
            
        Returns:
            The created Transcript
        """
        return self.save_transcript(
            session_id=session_id,
            text=text,
            speaker="system",
            is_final=True
        )
    
    def get_session_transcripts(
        self, 
        session_id: str,
        speaker: Optional[str] = None
    ) -> List[Transcript]:
        """
        Get all transcripts for a session
        
        Args:
            session_id: The session ID
            speaker: Filter by speaker ("user" or "system"), or None for all
            
        Returns:
            List of transcripts
        """
        query = self.db.query(Transcript).filter(Transcript.session_id == session_id)
        
        if speaker:
            query = query.filter(Transcript.speaker == speaker)
        
        return query.order_by(Transcript.timestamp).all()
    
    def get_conversation_history(self, session_id: str) -> List[dict]:
        """
        Get formatted conversation history for a session
        
        Args:
            session_id: The session ID
            
        Returns:
            List of dicts with speaker, text, and timestamp
        """
        transcripts = self.get_session_transcripts(session_id)
        
        return [
            {
                "speaker": t.speaker,
                "text": t.text,
                "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                "confidence": t.confidence_score
            }
            for t in transcripts
        ]
    
    def delete_session_transcripts(self, session_id: str) -> int:
        """
        Delete all transcripts for a session
        
        Args:
            session_id: The session ID
            
        Returns:
            Number of transcripts deleted
        """
        count = self.db.query(Transcript).filter(
            Transcript.session_id == session_id
        ).delete()
        
        self.db.commit()
        return count
