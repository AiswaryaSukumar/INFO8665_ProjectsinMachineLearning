"""
Unit tests for Ticket Service API endpoints.
Uses FastAPI TestClient with SQLite in-memory DB.
"""

import pytest


class TestTicketCRUD:
    def test_create_ticket(self, client):
        response = client.post("/api/tickets/", json={
            "channel": "web",
            "category": "pothole",
            "location": "123 Main St",
            "description": "Big hole in road",
            "caller_name": "John Smith",
            "phone_number": "5551234567",
        })
        assert response.status_code == 200
        data = response.json()
        assert "ticket_id" in data
        assert data["ticket_id"].startswith("311-")
        assert data["category"] == "pothole"
        assert data["channel"] == "web"

    def test_get_ticket(self, client):
        # Create first
        create_resp = client.post("/api/tickets/", json={
            "channel": "voice",
            "category": "graffiti",
        })
        ticket_id = create_resp.json()["ticket_id"]

        # Get
        resp = client.get(f"/api/tickets/{ticket_id}")
        assert resp.status_code == 200
        assert resp.json()["ticket_id"] == ticket_id

    def test_get_nonexistent_ticket(self, client):
        resp = client.get("/api/tickets/311-9999-999999")
        assert resp.status_code == 404

    def test_list_tickets(self, client):
        # Create two tickets
        client.post("/api/tickets/", json={"channel": "web", "category": "pothole"})
        client.post("/api/tickets/", json={"channel": "voice", "category": "graffiti"})

        resp = client.get("/api/tickets/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        assert len(data["tickets"]) >= 2

    def test_list_tickets_filter_by_status(self, client):
        client.post("/api/tickets/", json={"channel": "web", "ticket_status": "NEW"})

        resp = client.get("/api/tickets/?ticket_status=NEW")
        assert resp.status_code == 200
        for t in resp.json()["tickets"]:
            assert t["ticket_status"] == "NEW"

    def test_update_ticket(self, client):
        create_resp = client.post("/api/tickets/", json={"channel": "web"})
        ticket_id = create_resp.json()["ticket_id"]

        resp = client.put(f"/api/tickets/{ticket_id}", json={
            "ticket_status": "NEEDS_REVIEW",
            "updates": {"location": "456 Oak Ave"},
        })
        assert resp.status_code == 200
        assert resp.json()["ticket_status"] == "NEEDS_REVIEW"
        assert resp.json()["location"] == "456 Oak Ave"

    def test_approve_ticket(self, client):
        create_resp = client.post("/api/tickets/", json={"channel": "web"})
        ticket_id = create_resp.json()["ticket_id"]

        resp = client.post(f"/api/tickets/{ticket_id}/approve")
        assert resp.status_code == 200
        assert resp.json()["ticket_status"] == "APPROVED"
        assert resp.json()["workflow_stage"] == "APPROVED_BY_SUPERVISOR"

    def test_reject_ticket(self, client):
        create_resp = client.post("/api/tickets/", json={"channel": "web"})
        ticket_id = create_resp.json()["ticket_id"]

        resp = client.post(f"/api/tickets/{ticket_id}/reject", json={
            "rejected_reason": "Duplicate report",
        })
        assert resp.status_code == 200
        assert resp.json()["ticket_status"] == "REJECTED"
        assert resp.json()["rejected_reason"] == "Duplicate report"

    def test_resolve_ticket(self, client):
        create_resp = client.post("/api/tickets/", json={"channel": "web"})
        ticket_id = create_resp.json()["ticket_id"]

        resp = client.post(f"/api/tickets/{ticket_id}/resolve")
        assert resp.status_code == 200
        assert resp.json()["ticket_status"] == "RESOLVED"
        assert resp.json()["workflow_stage"] == "COMPLETED"
