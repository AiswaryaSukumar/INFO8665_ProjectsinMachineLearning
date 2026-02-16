"""
Session Manager: Handles session lifecycle and state management
Location: src/voice-conversion/speech-to-text/session_manager.py
"""
import logging
from typing import Dict, Optional
from src.database.models.session_model import Session, SessionStatus
from datetime import datetime, timedelta
from config.stt_config import SESSION_TIMEOUT

logger = logging.getLogger(__name__)

class SessionManager:
    """Manages active sessions and their lifecycle"""

    def __init__(self):
        self.active_sessions: Dict[str, Session] = {}

    def create_session(self, caller_phone: Optional[str] = None) -> Session:
        """Create a new session"""
        session = Session(caller_phone=caller_phone)
        self.active_sessions[session.session_id] = session
        logger.info(f"[Session Created] ID: {session.session_id}, Phone: {caller_phone}")
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Retrieve a session by ID"""
        return self.active_sessions.get(session_id)

    def complete_session(self, session_id: str) -> Optional[Session]:
        """Mark a session as completed"""
        session = self.get_session(session_id)
        if session:
            session.complete_session()
            logger.info(f"[Session Completed] ID: {session_id}, Segments: {session.segment_count}")
            return session
        return None

    def cleanup_abandoned_sessions(self):
        """Remove sessions that have been inactive for too long"""
        now = datetime.now()
        timeout_threshold = timedelta(seconds=SESSION_TIMEOUT)

        abandoned = []
        for session_id, session in self.active_sessions.items():
            if session.status == SessionStatus.ACTIVE:
                if now - session.started_at > timeout_threshold:
                    session.status = SessionStatus.ABANDONED
                    abandoned.append(session_id)

        for session_id in abandoned:
            logger.warning(f"[Session Abandoned] ID: {session_id}")
            del self.active_sessions[session_id]

        return len(abandoned)

    def get_active_session_count(self) -> int:
        """Get count of currently active sessions"""
        return sum(1 for s in self.active_sessions.values() if s.status == SessionStatus.ACTIVE)
