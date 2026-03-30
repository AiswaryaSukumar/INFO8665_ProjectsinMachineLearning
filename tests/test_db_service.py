"""
Unit tests for DB service:
- SessionRepository
- TicketRepository
- generate_ticket_id
"""

import pytest

from db_service.main import (
    SessionRepository,
    TicketRepository,
    ConversationState,
    generate_ticket_id,
)


class TestSessionRepository:
    def test_create_session(self, db_session):
        repo = SessionRepository(db_session)
        session = repo.create_session("sess-001", "voice", "en", "5551234567")

        assert session.session_id == "sess-001"
        assert session.channel == "voice"
        assert session.session_status == "active"
        assert session.current_state == "INITIALIZING"

    def test_get_session(self, db_session):
        repo = SessionRepository(db_session)
        repo.create_session("sess-002", "web")

        fetched = repo.get_session("sess-002")
        assert fetched is not None
        assert fetched.session_id == "sess-002"

    def test_get_nonexistent_session(self, db_session):
        repo = SessionRepository(db_session)
        assert repo.get_session("nonexistent") is None

    def test_save_and_load_context(self, db_session):
        repo = SessionRepository(db_session)
        repo.create_session("sess-ctx", "voice")

        context_data = {
            "extracted_entities": {"category": "pothole", "location": "Main St"},
            "confidence_scores": {"category": 0.9},
            "missing_fields": ["caller_name", "phone_number"],
        }
        repo.save_context("sess-ctx", context_data, ConversationState.SLOT_FILLING)

        loaded = repo.load_context("sess-ctx")
        assert loaded["extracted_entities"]["category"] == "pothole"
        assert loaded["missing_fields"] == ["caller_name", "phone_number"]

    def test_update_state(self, db_session):
        repo = SessionRepository(db_session)
        repo.create_session("sess-state", "voice")

        repo.update_state("sess-state", ConversationState.SUBMITTED, ticket_id="311-2026-000001")
        session = repo.get_session("sess-state")

        assert session.current_state == "SUBMITTED"
        assert session.ticket_id == "311-2026-000001"
        assert session.session_status == "ended"


class TestTicketRepository:
    def test_create_ticket(self, db_session):
        repo = TicketRepository(db_session)
        ticket = repo.create_ticket("311-2026-000001", "sess-001", "voice")

        assert ticket.ticket_id == "311-2026-000001"
        assert ticket.ticket_status == "NEW"

    def test_create_ticket_full(self, db_session):
        repo = TicketRepository(db_session)
        fields = {
            "channel": "web",
            "category": "pothole",
            "location": "123 Main St",
            "description": "Big pothole",
            "caller_name": "John",
            "phone_number": "5551234567",
            "severity": "high",
        }
        ticket = repo.create_ticket_full("311-2026-000002", fields)

        assert ticket.category == "pothole"
        assert ticket.location == "123 Main St"
        assert ticket.severity == "high"

    def test_search_tickets_by_status(self, db_session):
        repo = TicketRepository(db_session)
        repo.create_ticket("311-2026-000010", channel="voice")
        repo.create_ticket("311-2026-000011", channel="web")
        repo.update_ticket_status("311-2026-000011", "APPROVED")

        new_tickets = repo.search_tickets(ticket_status="NEW")
        assert len(new_tickets) == 1
        assert new_tickets[0].ticket_id == "311-2026-000010"

    def test_update_ticket_fields(self, db_session):
        repo = TicketRepository(db_session)
        repo.create_ticket("311-2026-000020", channel="voice")

        repo.update_ticket_fields("311-2026-000020", {
            "category": "graffiti",
            "location": "456 Oak Ave",
        })
        ticket = repo.get_ticket_by_number("311-2026-000020")
        assert ticket.category == "graffiti"
        assert ticket.location == "456 Oak Ave"


class TestTicketIdGenerator:
    def test_sequential_format(self, db_session):
        tid1 = generate_ticket_id(db_session)
        assert tid1.startswith("311-")
        assert len(tid1.split("-")) == 3
        # Number part should be 6 digits
        num_part = tid1.split("-")[2]
        assert len(num_part) == 6

    def test_increment(self, db_session):
        repo = TicketRepository(db_session)
        tid1 = generate_ticket_id(db_session)
        repo.create_ticket(tid1, channel="voice")

        tid2 = generate_ticket_id(db_session)
        # Second ID should be 1 higher
        n1 = int(tid1.split("-")[2])
        n2 = int(tid2.split("-")[2])
        assert n2 == n1 + 1
