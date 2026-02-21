"""
Examples of how to save and retrieve transcripts
"""

from src.ai_orchestration.orchestrator import Orchestrator
from src.database.connection import get_db_context
from src.database.repositories import TranscriptRepository

# ============================================================
# EXAMPLE 1: Automatic transcript saving (built into orchestrator)
# ============================================================

def example_automatic_saving():
    """
    Transcripts are automatically saved by the orchestrator
    """
    orch = Orchestrator()
    
    # Initialize session - greeting is saved automatically
    action = orch.initialize_session("session-001")
    print(f"System: {action.text}")
    # ✅ System greeting is saved to database
    
    # Process turn - user and system transcripts are saved automatically
    action = orch.process_turn(
        session_id="session-001",
        transcript="There's a pothole on Main Street",
        nlu_output={
            "category": "Pothole",
            "location": "Main Street",
            "description": "pothole"
        }
    )
    print(f"User: There's a pothole on Main Street")
    # ✅ User transcript saved
    print(f"System: {action.text}")
    # ✅ System response saved


# ============================================================
# EXAMPLE 2: Manual transcript saving
# ============================================================

def example_manual_saving():
    """
    Save transcripts directly if needed
    """
    session_id = "session-002"
    
    with get_db_context() as db:
        repo = TranscriptRepository(db)
        
        # Save user transcript
        repo.save_user_transcript(
            session_id=session_id,
            text="I'd like to report a broken streetlight",
            confidence_score=0.95
        )
        
        # Save system response
        repo.save_system_transcript(
            session_id=session_id,
            text="Thank you for reporting that. Can you tell me which street?"
        )
        
        # Save another user message
        repo.save_user_transcript(
            session_id=session_id,
            text="Corner of Main and Oak",
            confidence_score=0.88
        )


# ============================================================
# EXAMPLE 3: Retrieve transcripts
# ============================================================

def example_retrieve_transcripts():
    """
    Get transcripts from database
    """
    session_id = "session-001"
    
    with get_db_context() as db:
        repo = TranscriptRepository(db)
        
        # Get all transcripts for this session
        all_transcripts = repo.get_session_transcripts(session_id)
        print(f"\nAll transcripts for {session_id}:")
        for t in all_transcripts:
            print(f"  [{t.speaker}] {t.text}")
        
        # Get only user transcripts
        user_transcripts = repo.get_session_transcripts(session_id, speaker="user")
        print(f"\nUser transcripts only:")
        for t in user_transcripts:
            print(f"  {t.text} (confidence: {t.confidence_score})")
        
        # Get formatted conversation history
        history = repo.get_conversation_history(session_id)
        print(f"\nFormatted history:")
        for msg in history:
            print(f"  {msg['speaker']}: {msg['text']}")


# ============================================================
# EXAMPLE 4: Advanced - Save with metadata
# ============================================================

def example_advanced_saving():
    """
    Save transcripts with additional metadata
    """
    session_id = "session-003"
    
    with get_db_context() as db:
        repo = TranscriptRepository(db)
        
        # Save transcript with duration and confidence
        repo.save_transcript(
            session_id=session_id,
            text="I need to report a noise complaint",
            speaker="user",
            is_final=True,
            confidence_score=0.92,  # STT confidence
            duration_seconds=3.5    # How long the audio was
        )


# ============================================================
# EXAMPLE 5: Delete transcripts (cleanup)
# ============================================================

def example_delete_transcripts():
    """
    Delete all transcripts for a session
    """
    session_id = "session-001"
    
    with get_db_context() as db:
        repo = TranscriptRepository(db)
        
        deleted_count = repo.delete_session_transcripts(session_id)
        print(f"Deleted {deleted_count} transcripts")


# ============================================================
# KEY POINTS
# ============================================================

"""
✅ Automatic Saving:
   - Orchestrator automatically saves all user and system transcripts
   - No extra code needed - just call orchestrator.process_turn()
   
✅ Manual Saving:
   - Use TranscriptRepository for manual control
   - Useful if handling transcripts outside the orchestrator
   
✅ What Gets Saved:
   - Speaker (user/system)
   - Text content
   - Timestamp (automatic)
   - Confidence score (optional, from STT)
   - Duration (optional, from audio)
   - is_final flag (whether it's complete)

✅ Query Transcripts:
   - Get all transcripts for a session
   - Filter by speaker
   - Get formatted conversation history
   - Sort by timestamp automatically

✅ Database Schema:
   - Table: transcripts
   - Linked to sessions table via session_id
   - Auto-cascade delete when session is deleted
"""

if __name__ == "__main__":
    print("Transcript Saving Examples")
    print("=" * 60)
    
    # Uncomment to run examples:
    # example_automatic_saving()
    # example_manual_saving()
    # example_retrieve_transcripts()
    # example_advanced_saving()
    # example_delete_transcripts()
