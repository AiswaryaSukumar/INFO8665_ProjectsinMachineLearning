"""
Integration tests for INSIGHT-311.

Tests the full conversation flow via the FastAPI API:
  initialize → slot-filling turns → confirmation → ticket submission
"""

import pytest


class TestFullConversationFlow:
    """End-to-end conversation via /api/orchestrator endpoints."""

    def test_initialize_returns_session(self, client):
        resp = client.post("/api/orchestrator/initialize", json={
            "channel": "voice",
            "language": "en",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data
        assert data["action"]["action_type"] == "greeting"
        assert data["context"]["current_state"] == "SLOT_FILLING"

    def test_full_flow_to_ticket(self, client):
        """Walk through a complete conversation to ticket submission."""
        # Step 1: Initialize
        init_resp = client.post("/api/orchestrator/initialize", json={
            "channel": "voice",
        })
        session_id = init_resp.json()["session_id"]

        # Step 2: Provide all entities at once
        nlu_output = {
            "category": "pothole",
            "location": "123 Main Street",
            "description": "There is a large pothole causing damage",
            "severity_score": 0.6,
            "caller_name": "Jane Doe",
            "phone_number": "5559876543",
            "confidence_scores": {
                "category": 0.92, "location": 0.85, "description": 0.8,
                "severity": 0.6, "caller_name": 0.9, "phone_number": 0.95,
            },
            "confirm_result": None,
            "correction_field": None,
            "correction_value": None,
        }
        process_resp = client.post("/api/orchestrator/process", json={
            "session_id": session_id,
            "transcript": "There is a large pothole at 123 Main Street, my name is Jane Doe and my number is 555-987-6543",
            "nlu_output": nlu_output,
        })
        assert process_resp.status_code == 200
        data = process_resp.json()
        # Should be in CONFIRMATION since all fields are filled
        assert data["context"]["current_state"] == "CONFIRMATION"
        assert data["action"]["action_type"] == "confirm"

        # Step 3: Confirm
        confirm_nlu = {
            "category": "pothole",
            "location": "123 Main Street",
            "description": "There is a large pothole causing damage",
            "severity_score": 0.6,
            "caller_name": "Jane Doe",
            "phone_number": "5559876543",
            "confidence_scores": {
                "category": 0.92, "location": 0.85, "description": 0.8,
                "severity": 0.6, "caller_name": 0.9, "phone_number": 0.95,
            },
            "confirm_result": "yes",
            "correction_field": None,
            "correction_value": None,
        }
        submit_resp = client.post("/api/orchestrator/process", json={
            "session_id": session_id,
            "transcript": "yes that is all correct",
            "nlu_output": confirm_nlu,
        })
        assert submit_resp.status_code == 200
        submit_data = submit_resp.json()
        assert submit_data["context"]["current_state"] == "SUBMITTED"
        assert submit_data["action"]["action_type"] == "submit"
        assert submit_data["action"]["ticket_id"] is not None

        # Step 4: Verify ticket in DB via ticket API
        ticket_id = submit_data["action"]["ticket_id"]
        ticket_resp = client.get(f"/api/tickets/{ticket_id}")
        assert ticket_resp.status_code == 200
        ticket = ticket_resp.json()
        assert ticket["category"] == "pothole"
        assert ticket["location"] == "123 Main Street"

    def test_session_persistence(self, client):
        """Verify context is preserved across turns."""
        init = client.post("/api/orchestrator/initialize", json={"channel": "web"})
        session_id = init.json()["session_id"]

        # Turn 1: partial info
        client.post("/api/orchestrator/process", json={
            "session_id": session_id,
            "transcript": "pothole",
            "nlu_output": {
                "category": "pothole", "location": None, "description": "pothole",
                "severity_score": 0.3, "caller_name": None, "phone_number": None,
                "confidence_scores": {
                    "category": 0.9, "location": 0.0, "description": 0.5,
                    "severity": 0.3, "caller_name": 0.0, "phone_number": 0.0,
                },
                "confirm_result": None, "correction_field": None, "correction_value": None,
            },
        })

        # Check session endpoint
        sess_resp = client.get(f"/api/orchestrator/session/{session_id}")
        assert sess_resp.status_code == 200
        sess_data = sess_resp.json()
        assert sess_data["current_state"] == "SLOT_FILLING"
        # Context should have the category persisted
        assert sess_data["context_data"]["extracted_entities"]["category"] == "pothole"


class TestHealthCheck:
    def test_health_endpoint(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.json()["status"] == "running"
