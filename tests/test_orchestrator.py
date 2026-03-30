"""
Unit tests for the Orchestrator:
- Session initialization
- State machine transitions
- Turn processing (slot filling → confirmation → submission)
- ContextManager
- RuleEngine
"""

import pytest
from unittest.mock import MagicMock

from db_service.main import ConversationState, SessionRepository, TicketRepository
from orchestrator.main import (
    Orchestrator,
    ContextManager,
    RuleEngine,
    ConversationContext,
    Action,
    MANDATORY_FIELDS,
    transition,
    is_valid_transition,
    validate_phone_number,
)


# ── State machine helpers ────────────────────────────────

class TestStateMachine:
    def test_valid_transition_init_to_slot_filling(self):
        assert is_valid_transition(ConversationState.INITIALIZING, ConversationState.SLOT_FILLING)

    def test_valid_transition_slot_to_confirmation(self):
        assert is_valid_transition(ConversationState.SLOT_FILLING, ConversationState.CONFIRMATION)

    def test_invalid_transition_init_to_submitted(self):
        assert not is_valid_transition(ConversationState.INITIALIZING, ConversationState.SUBMITTED)

    def test_escalation_always_valid(self):
        for state in ConversationState:
            assert is_valid_transition(state, ConversationState.ESCALATED)

    def test_transition_raises_on_invalid(self):
        with pytest.raises(ValueError):
            transition(ConversationState.INITIALIZING, ConversationState.SUBMITTED)

    def test_same_state_transition(self):
        result = transition(ConversationState.SLOT_FILLING, ConversationState.SLOT_FILLING)
        assert result == ConversationState.SLOT_FILLING


# ── Validation ───────────────────────────────────────────

class TestValidation:
    def test_valid_phone_number(self):
        assert validate_phone_number("555-123-4567") is True

    def test_short_phone_number(self):
        assert validate_phone_number("12345") is False

    def test_empty_phone_number(self):
        assert validate_phone_number("") is False


# ── RuleEngine ───────────────────────────────────────────

class TestRuleEngine:
    def setup_method(self):
        self.engine = RuleEngine()

    def test_asks_for_missing_field(self):
        context = ConversationContext(
            session_id="test1",
            channel="voice",
            current_state=ConversationState.SLOT_FILLING,
            missing_fields=["location", "caller_name"],
            extracted_entities={"category": "pothole"},
        )
        action = self.engine.get_next_question(context)
        assert action is not None
        assert action.action_type == "ask_question"
        assert action.field == "location"

    def test_generates_confirmation_when_complete(self):
        context = ConversationContext(
            session_id="test2",
            channel="voice",
            current_state=ConversationState.SLOT_FILLING,
            missing_fields=[],
            extracted_entities={
                "category": "pothole",
                "location": "123 Main St",
                "description": "big hole",
                "caller_name": "John",
                "phone_number": "5551234567",
            },
            confidence_scores={
                "category": 0.9, "location": 0.8, "description": 0.7,
                "caller_name": 0.8, "phone_number": 0.9,
            },
        )
        action = self.engine.get_next_question(context)
        assert action is not None
        assert action.action_type == "confirm"
        assert action.new_state == ConversationState.CONFIRMATION


# ── ContextManager ───────────────────────────────────────

class TestContextManager:
    def test_update_context_with_nlu(self, db_session):
        repo = SessionRepository(db_session)
        repo.create_session("ctx-test", "voice")
        cm = ContextManager(repo)

        context = cm.load_context("ctx-test", "voice")
        nlu_result = {
            "category": "pothole",
            "location": "456 Oak Ave",
            "description": "road damage",
            "severity_score": 0.6,
            "caller_name": "Jane",
            "phone_number": "5559876543",
            "confidence_scores": {
                "category": 0.85, "location": 0.75, "description": 0.7,
                "severity": 0.6, "caller_name": 0.8, "phone_number": 0.9,
            },
        }
        cm.update_context_with_nlu(context, nlu_result)

        assert context.extracted_entities["category"] == "pothole"
        assert context.extracted_entities["location"] == "456 Oak Ave"

    def test_compute_missing_fields(self, db_session):
        repo = SessionRepository(db_session)
        repo.create_session("miss-test", "voice")
        cm = ContextManager(repo)

        context = cm.load_context("miss-test", "voice")
        context.extracted_entities = {"category": "pothole"}
        missing = cm.compute_missing_fields(context)

        assert "location" in missing
        assert "caller_name" in missing
        assert "phone_number" in missing
        assert "description" in missing
        assert "category" not in missing


# ── Orchestrator ─────────────────────────────────────────

class TestOrchestrator:
    def _make_orchestrator(self, db_session):
        session_repo = SessionRepository(db_session)
        ticket_repo = TicketRepository(db_session)
        cm = ContextManager(session_repo)
        re = RuleEngine()
        return Orchestrator(cm, re, ticket_repo), session_repo

    def test_initialize_session(self, db_session):
        orch, session_repo = self._make_orchestrator(db_session)
        session_repo.create_session("init-1", "voice")
        context, action = orch.initialize_session("init-1", "voice")

        assert action.action_type == "greeting"
        assert context.current_state == ConversationState.SLOT_FILLING

    def test_process_turn_slot_filling(self, db_session):
        orch, session_repo = self._make_orchestrator(db_session)
        session_repo.create_session("slot-1", "voice")
        orch.initialize_session("slot-1", "voice")

        nlu_output = {
            "category": "pothole",
            "location": None,
            "description": "hole in road",
            "severity_score": 0.5,
            "caller_name": None,
            "phone_number": None,
            "confidence_scores": {
                "category": 0.9, "location": 0.0, "description": 0.7,
                "severity": 0.5, "caller_name": 0.0, "phone_number": 0.0,
            },
            "confirm_result": None,
            "correction_field": None,
            "correction_value": None,
        }
        context, action = orch.process_turn("slot-1", "there is a pothole", nlu_output)

        assert context.current_state == ConversationState.SLOT_FILLING
        assert action.action_type == "ask_question"
        # Should ask for location (first missing field)
        assert action.field == "location"

    def test_process_turn_confirmation(self, db_session):
        orch, session_repo = self._make_orchestrator(db_session)
        session_repo.create_session("conf-1", "voice")
        orch.initialize_session("conf-1", "voice")

        nlu_output = {
            "category": "pothole",
            "location": "123 Main St",
            "description": "big hole",
            "severity_score": 0.5,
            "caller_name": "John Smith",
            "phone_number": "5551234567",
            "confidence_scores": {
                "category": 0.9, "location": 0.8, "description": 0.7,
                "severity": 0.5, "caller_name": 0.8, "phone_number": 0.9,
            },
            "confirm_result": None,
            "correction_field": None,
            "correction_value": None,
        }
        context, action = orch.process_turn("conf-1", "full report", nlu_output)

        assert context.current_state == ConversationState.CONFIRMATION
        assert action.action_type == "confirm"

    def test_process_turn_submitted(self, db_session):
        orch, session_repo = self._make_orchestrator(db_session)
        session_repo.create_session("sub-1", "voice")
        orch.initialize_session("sub-1", "voice")

        # First turn: fill all slots
        nlu_all = {
            "category": "pothole", "location": "123 Main St",
            "description": "big hole", "severity_score": 0.5,
            "caller_name": "John", "phone_number": "5551234567",
            "confidence_scores": {
                "category": 0.9, "location": 0.8, "description": 0.7,
                "severity": 0.5, "caller_name": 0.8, "phone_number": 0.9,
            },
            "confirm_result": None, "correction_field": None, "correction_value": None,
        }
        orch.process_turn("sub-1", "full report", nlu_all)

        # Second turn: confirm yes
        nlu_yes = {
            "category": "pothole", "location": "123 Main St",
            "description": "big hole", "severity_score": 0.5,
            "caller_name": "John", "phone_number": "5551234567",
            "confidence_scores": {
                "category": 0.9, "location": 0.8, "description": 0.7,
                "severity": 0.5, "caller_name": 0.8, "phone_number": 0.9,
            },
            "confirm_result": "yes", "correction_field": None, "correction_value": None,
        }
        context, action = orch.process_turn("sub-1", "yes", nlu_yes)

        assert context.current_state == ConversationState.SUBMITTED
        assert action.action_type == "submit"
        assert action.ticket_id is not None

    def test_spell_out(self, db_session):
        orch, _ = self._make_orchestrator(db_session)
        result = orch._spell_out("311-2026-000001")
        assert "3" in result and "1" in result
