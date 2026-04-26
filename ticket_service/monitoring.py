"""
Monitoring API for ML confidence alerts and sentiment flags.

Endpoints:
  GET  /api/monitoring/flagged          - Tickets with sentiment_flag="NEEDS_ATTENTION"
  GET  /api/monitoring/alerts           - Tickets with confidence_alert="LOW_CONFIDENCE"
  GET  /api/monitoring/dashboard        - Aggregate stats for the last N hours
  POST /api/monitoring/{ticket_id}/acknowledge - Clear a flag (supervisor action)
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db_service.main import get_db, TicketRepository
from ticket_service.main import ticket_to_dict

router = APIRouter()


# ---------- Request/Response models ----------

class AcknowledgeRequest(BaseModel):
    flag_type: str  # "sentiment" | "confidence"


# ---------- Endpoints ----------

@router.get("/flagged")
def get_flagged_tickets(
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Return tickets flagged as NEEDS_ATTENTION due to negative sentiment."""
    repo = TicketRepository(db)
    tickets = repo.get_flagged_tickets(flag_type="sentiment", limit=limit)
    return {
        "total": len(tickets),
        "tickets": [ticket_to_dict(t) for t in tickets],
    }


@router.get("/alerts")
def get_alerted_tickets(
    field: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Return tickets with LOW_CONFIDENCE alert. Optionally filter by alerted field."""
    repo = TicketRepository(db)
    tickets = repo.get_flagged_tickets(flag_type="confidence", limit=limit)
    if field:
        tickets = [t for t in tickets if t.alerted_fields and field in t.alerted_fields]
    return {
        "total": len(tickets),
        "tickets": [ticket_to_dict(t) for t in tickets],
    }


@router.get("/dashboard")
def get_dashboard(
    hours: int = 24,
    db: Session = Depends(get_db),
):
    """Return aggregate monitoring statistics for the last N hours."""
    repo = TicketRepository(db)
    return repo.get_dashboard_stats(hours=hours)


@router.post("/{ticket_id}/acknowledge")
def acknowledge_flag(
    ticket_id: str,
    body: AcknowledgeRequest,
    db: Session = Depends(get_db),
):
    """Clear a sentiment or confidence flag (supervisor acknowledge action)."""
    if body.flag_type not in ("sentiment", "confidence"):
        raise HTTPException(status_code=400, detail="flag_type must be 'sentiment' or 'confidence'")
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    updated = repo.clear_flag(ticket_id, body.flag_type)
    return ticket_to_dict(updated)
