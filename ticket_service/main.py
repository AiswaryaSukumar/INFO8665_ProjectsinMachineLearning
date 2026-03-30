from datetime import datetime
from typing import Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db_service.main import get_db, Ticket, TicketRepository, generate_ticket_id
from logging_config import get_logger

logger = get_logger("insight311.ticket")

router = APIRouter()


# ---------- Helper: DB row -> API dict ----------
def ticket_to_dict(ticket: Ticket) -> dict:
    """Convert a Ticket ORM object to a JSON-serializable dict."""
    return {
        "ticket_id":       ticket.ticket_id,
        "session_id":      ticket.session_id,
        "ticket_status":   ticket.ticket_status,
        "channel":         ticket.channel,
        "department":      ticket.department,
        "category":        ticket.category,
        "location":        ticket.location,
        "description":     ticket.description,
        "caller_name":     ticket.caller_name,
        "phone_number":    ticket.phone_number,
        "severity":        ticket.severity,
        "created_at":      ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at":      ticket.updated_at.isoformat() if ticket.updated_at else None,
        "routing_status":  ticket.routing_status,
        "workflow_stage":  ticket.workflow_stage,
        "created_by_type": ticket.created_by_type,
        "created_by_name": ticket.created_by_name,
        "created_by_role": ticket.created_by_role,
        "handled_by_type": ticket.handled_by_type,
        "handled_by_name": ticket.handled_by_name,
        "handled_by_role": ticket.handled_by_role,
        "notes":           ticket.notes,
        "transcript":      ticket.transcript,
        "recording_url":   ticket.recording_url,
        "rejected_reason": ticket.rejected_reason,
        "deleted_reason":  ticket.deleted_reason,
    }


# ---------- Request models ----------
class TicketCreateRequest(BaseModel):
    channel:         str
    session_id:      Optional[str]  = None
    category:        Optional[str]  = None
    department:      Optional[str]  = None
    location:        Optional[str]  = None
    description:     Optional[str]  = None
    caller_name:     Optional[str]  = None
    phone_number:    Optional[str]  = None
    severity:        Optional[str]  = None
    ticket_status:   Optional[str]  = "NEW"
    routing_status:  Optional[str]  = None
    workflow_stage:  Optional[str]  = None
    created_by_type: Optional[str]  = None
    created_by_name: Optional[str]  = None
    created_by_role: Optional[str]  = None
    notes:           Optional[str]  = None
    transcript:      Optional[str]  = None
    recording_url:   Optional[str]  = None

class TicketUpdateRequest(BaseModel):
    ticket_status:   Optional[str]           = None
    updates:         Dict[str, Any]          = {}

class RejectRequest(BaseModel):
    rejected_reason: Optional[str] = ""


# ---------- Endpoints ----------

@router.post("/")
def create_ticket(request: TicketCreateRequest, db: Session = Depends(get_db)):
    """Create a new ticket (used by the web UI)."""
    ticket_id = generate_ticket_id(db)
    fields = request.model_dump(exclude_none=True)
    repo = TicketRepository(db)
    ticket = repo.create_ticket_full(ticket_id, fields)
    logger.info("ticket_created_via_api ticket_id=%s channel=%s", ticket_id, request.channel)
    return ticket_to_dict(ticket)


@router.get("/")
def get_tickets(ticket_status: str = None, channel: str = None,
                db: Session = Depends(get_db)):
    """List tickets, optionally filtered by status or channel."""
    repo = TicketRepository(db)
    tickets = repo.search_tickets(ticket_status, channel)
    return {
        "total":   len(tickets),
        "tickets": [ticket_to_dict(t) for t in tickets],
    }


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, db: Session = Depends(get_db)):
    """Get a single ticket by ID."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        logger.warning("ticket_not_found ticket_id=%s", ticket_id)
        raise HTTPException(status_code=404, detail="Ticket not found")
    logger.info("ticket_fetched ticket_id=%s", ticket_id)
    return ticket_to_dict(ticket)


@router.put("/{ticket_id}")
def update_ticket(ticket_id: str, request: TicketUpdateRequest,
                  db: Session = Depends(get_db)):
    """Update status and/or arbitrary fields on a ticket."""
    repo = TicketRepository(db)
    if not repo.get_ticket_by_number(ticket_id):
        logger.warning("ticket_update_not_found ticket_id=%s", ticket_id)
        raise HTTPException(status_code=404, detail="Ticket not found")
    if request.ticket_status:
        repo.update_ticket_status(ticket_id, request.ticket_status)
    if request.updates:
        repo.update_ticket_fields(ticket_id, request.updates)
    logger.info("ticket_updated ticket_id=%s status=%s", ticket_id, request.ticket_status)
    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


@router.post("/{ticket_id}/approve")
def approve_ticket(ticket_id: str, db: Session = Depends(get_db)):
    """Approve a NEEDS_REVIEW ticket (supervisor action)."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    repo.update_ticket_fields(ticket_id, {
        "ticket_status": "APPROVED",
        "workflow_stage": "APPROVED_BY_SUPERVISOR",
        "routing_status": "APPROVED",
    })
    logger.info("ticket_approved ticket_id=%s", ticket_id)
    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


@router.post("/{ticket_id}/reject")
def reject_ticket(ticket_id: str, body: RejectRequest = RejectRequest(),
                  db: Session = Depends(get_db)):
    """Reject a NEEDS_REVIEW ticket (supervisor action)."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    repo.update_ticket_fields(ticket_id, {
        "ticket_status":   "REJECTED",
        "workflow_stage":  "REJECTED_BY_SUPERVISOR",
        "routing_status":  "REJECTED",
        "rejected_reason": body.rejected_reason,
    })
    logger.info("ticket_rejected ticket_id=%s reason=%s", ticket_id, body.rejected_reason)
    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


@router.post("/{ticket_id}/resolve")
def resolve_ticket(ticket_id: str, db: Session = Depends(get_db)):
    """Mark a ticket as resolved."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    repo.update_ticket_fields(ticket_id, {
        "ticket_status": "RESOLVED",
        "workflow_stage": "COMPLETED",
    })
    logger.info("ticket_resolved ticket_id=%s", ticket_id)
    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))
