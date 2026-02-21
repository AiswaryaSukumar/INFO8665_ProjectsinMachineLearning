"""
Simple tests for the orchestrator
"""
import pytest
from src.ai_orchestration.orchestrator import Orchestrator
from src.database.connection import get_db_context
from src.database.models import Session as SessionModel


@pytest.fixture(autouse=True)
def cleanup_test_sessions():
    """Clean up test sessions before each test"""
    test_session_ids = ["test-session-123", "test-session-456"]
    
    with get_db_context() as db:
        for session_id in test_session_ids:
            session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            if session:
                db.delete(session)
        db.commit()
    
    yield
    
    # Cleanup after test as well
    with get_db_context() as db:
        for session_id in test_session_ids:
            session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            if session:
                db.delete(session)
        db.commit()


def test_initialization():
    """Test creating a new session"""
    orch = Orchestrator()
    action = orch.initialize_session("test-session-123")
    
    assert action.type == "PLAY_GREETING"
    assert "311" in action.text
    print("✅ Initialization test passed!")


def test_complete_flow():
    """Test a complete conversation"""
    orch = Orchestrator()
    
    # Step 1: Initialize
    action = orch.initialize_session("test-session-456")
    print(f"\n1. System: {action.text}")
    
    # Step 2: User provides all info at once
    action = orch.process_turn(
        session_id="test-session-456",
        transcript="There's a pothole on Main Street",
        nlu_output={
            "category": "Pothole",
            "category_confidence": 0.95,
            "location": "Main Street",
            "location_confidence": 0.90,
            "description": "pothole",
            "description_confidence": 0.85
        }
    )
    print(f"\n2. System: {action.text}")
    print(f"   Action type: {action.type}")
    
    # Step 3: Provide missing info (name)
    action = orch.process_turn(
        session_id="test-session-456",
        transcript="John Smith",
        nlu_output={
            "citizen_name": "John Smith",
            "name_confidence": 0.95
        }
    )
    print(f"\n3. System: {action.text}")
    
    # Step 4: Provide phone
    action = orch.process_turn(
        session_id="test-session-456",
        transcript="555-1234",
        nlu_output={
            "citizen_phone": "555-1234",
            "phone_confidence": 0.95
        }
    )
    print(f"\n4. System: {action.text}")
    
    # Step 5: Confirm
    action = orch.process_turn(
        session_id="test-session-456",
        transcript="Yes, that's correct"
    )
    print(f"\n5. System: {action.text}")
    print(f"   Action type: {action.type}")
    
    print("\n✅ Complete flow test passed!")


if __name__ == "__main__":
    test_initialization()
    test_complete_flow()
