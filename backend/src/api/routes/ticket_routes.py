from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.database.connection import get_db
from src.database.repositories.ticket_repository import TicketRepository
from src.workflow.ticket_workflow import (
    is_valid_ticket_status,
    is_terminal_ticket_status,
    can_transition_ticket_status,
    can_approve_ticket,
    can_reject_ticket,
    can_resolve_ticket,
    normalize_ticket_status,
    get_initial_ticket_status,
)
from pydantic import BaseModel
from typing import Optional, Any


router = APIRouter()


def normalize_channel_value(value: Optional[str]) -> Optional[str]:
    raw = str(value or "").strip().upper()
    if not raw:
        return value

    if raw in {"WEB", "WEB FORM", "WEB_FORM", "WEBFORM", "ONLINE", "PUBLIC_WEB"}:
        return "WEB"
    if raw in {
        "PHONE",
        "CALL",
        "VOICE",
        "PHONE (HUMAN OPERATOR)",
        "PHONE (AI VOICE BOT)",
        "PHONE (AI VOICE BOT → OPERATOR)",
        "PHONE (AI VOICE BOT → SUPERVISOR)",
    }:
        return "PHONE" if raw != "VOICE" else "VOICE"
    if raw in {"EMAIL", "E-MAIL"}:
        return "EMAIL"
    if raw in {"IN_PERSON", "IN-PERSON", "IN PERSON", "COUNTER"}:
        return "IN_PERSON"

    return raw


class TicketSearchRequest(BaseModel):
    ticket_status: Optional[str] = None
    channel: Optional[str] = None


class TicketCreateRequest(BaseModel):
    ticket_id: Optional[str] = None
    session_id: Optional[str] = None

    ticket_status: Optional[str] = None
    channel: Optional[str] = None
    department: Optional[str] = None
    category: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    caller_name: Optional[str] = None
    phone_number: Optional[str] = None
    severity: Optional[str] = None

    routing_status: Optional[str] = None
    workflow_stage: Optional[str] = None

    created_by_type: Optional[str] = None
    created_by_name: Optional[str] = None
    created_by_role: Optional[str] = None

    handled_by_type: Optional[str] = None
    handled_by_name: Optional[str] = None
    handled_by_role: Optional[str] = None

    notes: Optional[str] = None
    transcript: Optional[str] = None
    recording_url: Optional[str] = None
    rejected_reason: Optional[str] = None
    deleted_reason: Optional[str] = None


class TicketUpdateRequest(BaseModel):
    ticket_status: Optional[str] = None
    category: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    department: Optional[str] = None
    caller_name: Optional[str] = None
    phone_number: Optional[str] = None
    severity: Optional[str] = None
    channel: Optional[str] = None

    routing_status: Optional[str] = None
    workflow_stage: Optional[str] = None
    handled_by_type: Optional[str] = None
    handled_by_name: Optional[str] = None
    handled_by_role: Optional[str] = None

    session_id: Optional[str] = None
    notes: Optional[str] = None
    transcript: Optional[str] = None
    recording_url: Optional[str] = None
    rejected_reason: Optional[str] = None
    deleted_reason: Optional[str] = None


class ApproveTicketRequest(BaseModel):
    department: Optional[str] = None
    handled_by_type: Optional[str] = None
    handled_by_name: Optional[str] = None
    handled_by_role: Optional[str] = None


class RejectTicketRequest(BaseModel):
    rejected_reason: Optional[str] = None
    handled_by_type: Optional[str] = None
    handled_by_name: Optional[str] = None
    handled_by_role: Optional[str] = None


class TicketResponse(BaseModel):
    ticket_id: str
    session_id: Optional[str]
    ticket_status: str
    channel: Optional[str]
    department: Optional[str]
    category: Optional[str]
    location: Optional[str]
    description: Optional[str]
    caller_name: Optional[str]
    phone_number: Optional[str]
    severity: Optional[str]
    created_at: Any
    updated_at: Any

    class Config:
        orm_mode = True


@router.get("/")
def get_tickets(ticket_status: str = None, channel: str = None, db: Session = Depends(get_db)):
    ticket_repo = TicketRepository(db)
    tickets = ticket_repo.search_tickets(ticket_status, channel)

    return {
        "total": len(tickets),
        "tickets": tickets
    }


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, db: Session = Depends(get_db)):
    ticket_repo = TicketRepository(db)
    ticket = ticket_repo.get_ticket_by_number(ticket_id)

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return ticket


@router.post("/")
def create_ticket(request: TicketCreateRequest, db: Session = Depends(get_db)):
    ticket_repo = TicketRepository(db)

    payload = request.dict(exclude_none=True)

    incoming_status = payload.get("ticket_status")
    normalized_channel = normalize_channel_value(payload.get("channel"))

    created_by_type = payload.get("created_by_type")
    handled_by_type = payload.get("handled_by_type")
    handled_by_role = payload.get("handled_by_role")

    if incoming_status is not None:
      target_status = normalize_ticket_status(incoming_status)
      if not is_valid_ticket_status(target_status):
          raise HTTPException(
              status_code=400,
              detail=f"Invalid ticket_status '{incoming_status}'"
          )
    else:
      target_status = get_initial_ticket_status(
          channel=normalized_channel,
          created_by_type=created_by_type,
          handled_by_type=handled_by_type,
          handled_by_role=handled_by_role,
      )

    payload["ticket_status"] = target_status

    if normalized_channel is not None:
        payload["channel"] = normalized_channel

    if "routing_status" not in payload:
        if target_status == "APPROVED":
            payload["routing_status"] = "APPROVED"
        elif target_status == "REJECTED":
            payload["routing_status"] = "REJECTED"
        elif target_status == "NEEDS_REVIEW":
            payload["routing_status"] = "PENDING_APPROVAL"
        else:
            payload["routing_status"] = "ROUTED"

    if "workflow_stage" not in payload:
        if target_status == "APPROVED":
            payload["workflow_stage"] = "APPROVED_BY_SUPERVISOR"
        elif target_status == "REJECTED":
            payload["workflow_stage"] = "REJECTED_BY_SUPERVISOR"
        elif target_status == "RESOLVED":
            payload["workflow_stage"] = "COMPLETED"
        elif target_status == "NEEDS_REVIEW":
            payload["workflow_stage"] = "PENDING_APPROVAL"
        else:
            payload["workflow_stage"] = "STANDARD"

    try:
        created_ticket = ticket_repo.create_ticket_full(payload)
        return created_ticket
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{ticket_id}")
def update_ticket(ticket_id: str, request: TicketUpdateRequest, db: Session = Depends(get_db)):
    ticket_repo = TicketRepository(db)
    ticket = ticket_repo.get_ticket_by_number(ticket_id)

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    payload = request.dict(exclude_none=True)

    # Always remove ticket_status first so it cannot bypass validation
    incoming_status = payload.pop("ticket_status", None)

    if "channel" in payload:
        payload["channel"] = normalize_channel_value(payload.get("channel"))

    allowed_fields = {
        "category",
        "location",
        "description",
        "department",
        "caller_name",
        "phone_number",
        "severity",
        "channel",
        "session_id",
        "routing_status",
        "workflow_stage",
        "handled_by_type",
        "handled_by_name",
        "handled_by_role",
        "notes",
        "transcript",
        "recording_url",
        "rejected_reason",
        "deleted_reason",
    }

    updates = {k: v for k, v in payload.items() if k in allowed_fields}

    current_status = normalize_ticket_status(ticket.ticket_status)

    # Governed status update
    if incoming_status is not None:
        target_status = normalize_ticket_status(incoming_status)

        if not is_valid_ticket_status(target_status):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid ticket_status '{incoming_status}'"
            )

        if current_status != target_status:
            if is_terminal_ticket_status(current_status):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot change terminal ticket status from {current_status} to {target_status}"
                )

            if not can_transition_ticket_status(current_status, target_status):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid ticket status transition from {current_status} to {target_status}"
                )

            updates["ticket_status"] = target_status

    updated_ticket = ticket_repo.update_ticket_fields(ticket_id, updates) if updates else ticket

    return ticket_repo.get_ticket_by_number(ticket_id)


@router.post("/{ticket_id}/approve")
def approve_ticket(
    ticket_id: str,
    request: ApproveTicketRequest = ApproveTicketRequest(),
    db: Session = Depends(get_db),
):
    ticket_repo = TicketRepository(db)
    ticket = ticket_repo.get_ticket_by_number(ticket_id)

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    current_status = normalize_ticket_status(ticket.ticket_status)

    if not can_approve_ticket(current_status):
        raise HTTPException(
            status_code=400,
            detail=f"Only NEEDS_REVIEW tickets can be approved. Current status: {current_status}"
        )

    updates = {
        "ticket_status": "APPROVED",
        "routing_status": "APPROVED",
        "workflow_stage": "APPROVED_BY_SUPERVISOR",
    }

    if request.department is not None:
        updates["department"] = request.department
    if request.handled_by_type is not None:
        updates["handled_by_type"] = request.handled_by_type
    if request.handled_by_name is not None:
        updates["handled_by_name"] = request.handled_by_name
    if request.handled_by_role is not None:
        updates["handled_by_role"] = request.handled_by_role

    updated_ticket = ticket_repo.update_ticket_fields(ticket_id, updates)

    return updated_ticket


@router.post("/{ticket_id}/reject")
def reject_ticket(
    ticket_id: str,
    request: RejectTicketRequest = RejectTicketRequest(),
    db: Session = Depends(get_db),
):
    ticket_repo = TicketRepository(db)
    ticket = ticket_repo.get_ticket_by_number(ticket_id)

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    current_status = normalize_ticket_status(ticket.ticket_status)

    if not can_reject_ticket(current_status):
        raise HTTPException(
            status_code=400,
            detail=f"Only NEEDS_REVIEW tickets can be rejected. Current status: {current_status}"
        )

    updates = {
        "ticket_status": "REJECTED",
        "routing_status": "REJECTED",
        "workflow_stage": "REJECTED_BY_SUPERVISOR",
    }

    if request.rejected_reason:
        updates["rejected_reason"] = request.rejected_reason
    if request.handled_by_type is not None:
        updates["handled_by_type"] = request.handled_by_type
    if request.handled_by_name is not None:
        updates["handled_by_name"] = request.handled_by_name
    if request.handled_by_role is not None:
        updates["handled_by_role"] = request.handled_by_role

    updated_ticket = ticket_repo.update_ticket_fields(ticket_id, updates)

    return updated_ticket


@router.post("/{ticket_id}/resolve")
def resolve_ticket(ticket_id: str, db: Session = Depends(get_db)):
    ticket_repo = TicketRepository(db)
    ticket = ticket_repo.get_ticket_by_number(ticket_id)

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    current_status = normalize_ticket_status(ticket.ticket_status)

    if not can_resolve_ticket(current_status):
        raise HTTPException(
            status_code=400,
            detail=f"Only NEW or APPROVED tickets can be resolved. Current status: {current_status}"
        )

    updated_ticket = ticket_repo.update_ticket_fields(
        ticket_id,
        {
            "ticket_status": "RESOLVED",
            "workflow_stage": "COMPLETED",
        },
    )

    return updated_ticket