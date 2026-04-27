import os
import logging
from datetime import datetime
from typing import Optional, Any, Dict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db_service.main import get_db, Ticket, TicketRepository, Recording, generate_ticket_id, FalseReportPenalty, DuplicateCandidate
from ticket_service.sla_config import compute_sla_deadline
from ticket_service.duplicate_detection import find_and_store_duplicates

# ── status_tracking_RAG: Citizen SMS notifications ────────────────────────────
try:
    from status_tracking_RAG.rag_agent import generate_sms_message
    from status_tracking_RAG.sms_service import send_sms
    _SMS_ENABLED = True
except ImportError:
    _SMS_ENABLED = False

_sms_logger = logging.getLogger("ticket_service.sms")


def _notify_citizen_sms(ticket, old_status: str, new_status: str) -> None:
    """Send an SMS notification to the citizen when a ticket status changes.
    Silently skips if status_tracking_RAG is not installed, phone is missing, or SMS fails.
    """
    if not _SMS_ENABLED:
        return
    phone = getattr(ticket, "phone_number", None) or getattr(ticket, "phone", None)
    if not phone:
        return
    try:
        ctx = {
            "ticket_id":   ticket.ticket_id,
            "category":    ticket.category or "General",
            "description": ticket.description or "",
            "location":    ticket.location or "",
            "caller_name": ticket.caller_name or "Resident",
            "old_status":  old_status,
            "new_status":  new_status,
        }
        msg = generate_sms_message(ctx)
        result = send_sms(phone, msg)
        if "error" in result:
            _sms_logger.warning("SMS failed for %s: %s", ticket.ticket_id, result["error"])
        else:
            _sms_logger.info("SMS sent for %s → %s (SID: %s)", ticket.ticket_id, new_status, result.get("sid"))
    except Exception as exc:
        _sms_logger.error("SMS notification error for %s: %s", ticket.ticket_id, exc)

router = APIRouter()


# ---------- Helper: confidence dict -> simple label ----------
def _derive_confidence_label(confidence_scores: dict) -> str:
    """Convert ML confidence_scores dict to a single UI label string."""
    if not confidence_scores or not isinstance(confidence_scores, dict):
        return ""
    overall = confidence_scores.get("overall")
    if overall is None:
        values = [v for v in confidence_scores.values() if isinstance(v, (int, float))]
        overall = sum(values) / len(values) if values else None
    if overall is None:
        return ""
    if overall >= 0.85:
        return "HIGH"
    if overall >= 0.65:
        return "MEDIUM"
    return "LOW"


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
        "rejected_reason":  ticket.rejected_reason,
        "deleted_reason":   ticket.deleted_reason,
        # ML confidence fields
        "confidence_scores": ticket.confidence_scores,
        "confidence_alert":  ticket.confidence_alert,
        "alerted_fields":    ticket.alerted_fields,
        "confidence":        _derive_confidence_label(ticket.confidence_scores),
        # ML sentiment fields
        "sentiment_score":   ticket.sentiment_score,
        "sentiment_label":   ticket.sentiment_label,
        "sentiment_flag":    ticket.sentiment_flag,
        # Tone / caller mood
        "tone":              ticket.tone,
        "tone_confidence":   ticket.tone_confidence,
        "tone_source":       ticket.tone_source,
        # Priority & escalation
        "priority":          ticket.priority,
        "escalation":        ticket.escalation,
        # Department processing status
        "department_status": ticket.department_status,
        # False report
        "is_false_report": bool(ticket.is_false_report),
        # SLA tracking
        "sla_deadline": ticket.sla_deadline.isoformat() if ticket.sla_deadline else None,
        "is_overdue": (
            ticket.sla_deadline is not None
            and ticket.ticket_status not in ("RESOLVED", "CLOSED", "REJECTED", "DELETED")
            and ticket.sla_deadline < datetime.utcnow()
        ),
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
    tone:              Optional[str]  = None
    tone_confidence:   Optional[float] = None
    tone_source:       Optional[str]  = None
    priority:          Optional[str]  = None
    escalation:        Optional[str]  = None
    department_status: Optional[str]  = None

class TicketUpdateRequest(BaseModel):
    ticket_status:   Optional[str]           = None
    updates:         Dict[str, Any]          = {}

class ApproveRequest(BaseModel):
    handled_by_type: Optional[str] = "SUPERVISOR"
    handled_by_name: Optional[str] = ""
    handled_by_role: Optional[str] = "SUPERVISOR"

class RejectRequest(BaseModel):
    rejected_reason: Optional[str] = ""


# ---------- Endpoints ----------

def _geocode_ticket_bg(ticket_id: str, location: str) -> None:
    """Background task: geocode a single ticket and save lat/lng."""
    try:
        from db_service.main import SessionLocal, TicketRepository as TR
        from map_service.main import geocode_address
        lat, lng = geocode_address(location)
        if lat is not None:
            db2 = SessionLocal()
            try:
                TR(db2).update_ticket_fields(ticket_id, {"lat": lat, "lng": lng})
            finally:
                db2.close()
    except Exception:
        pass


@router.post("/")
def create_ticket(request: TicketCreateRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Create a new ticket (used by the web UI)."""
    ticket_id = generate_ticket_id(db)
    fields = request.model_dump(exclude_none=True)
    fields["sla_deadline"] = compute_sla_deadline(fields.get("category"))
    repo = TicketRepository(db)
    ticket = repo.create_ticket_full(ticket_id, fields)
    if fields.get("location"):
        background_tasks.add_task(_geocode_ticket_bg, ticket_id, fields["location"])
    try:
        find_and_store_duplicates(db, ticket.ticket_id)
    except Exception:
        pass
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
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket_to_dict(ticket)


@router.put("/{ticket_id}")
def update_ticket(ticket_id: str, request: TicketUpdateRequest,
                  db: Session = Depends(get_db)):
    """Update status and/or arbitrary fields on a ticket."""
    repo = TicketRepository(db)
    if not repo.get_ticket_by_number(ticket_id):
        raise HTTPException(status_code=404, detail="Ticket not found")
    if request.ticket_status:
        repo.update_ticket_status(ticket_id, request.ticket_status)
        _propagate_status_to_merged_duplicates(repo, ticket_id, request.ticket_status, db)
    if request.updates:
        repo.update_ticket_fields(ticket_id, request.updates)
        duplicate_fields = {"category", "location", "description", "notes", "transcript"}
        if duplicate_fields.intersection(request.updates.keys()):
            try:
                find_and_store_duplicates(db, ticket_id)
            except Exception:
                pass
    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


def _dismiss_pending_duplicate_candidates(ticket_id: str, db: Session) -> None:
    from sqlalchemy import or_
    db.query(DuplicateCandidate).filter(
        or_(
            DuplicateCandidate.ticket_id == ticket_id,
            DuplicateCandidate.candidate_ticket_id == ticket_id,
        ),
        DuplicateCandidate.status == "PENDING",
    ).update({"status": "DISMISSED"}, synchronize_session=False)
    db.commit()


def _propagate_status_to_merged_duplicates(ticket_repo: TicketRepository, parent_ticket_id: str, new_status: str, db: Session) -> None:
    merged = db.query(DuplicateCandidate).filter(
        DuplicateCandidate.candidate_ticket_id == parent_ticket_id,
        DuplicateCandidate.status == "MERGED",
    ).all()
    for candidate in merged:
        ticket_repo.update_ticket_fields(candidate.ticket_id, {"ticket_status": new_status})


@router.post("/{ticket_id}/approve")
def approve_ticket(ticket_id: str, body: ApproveRequest = ApproveRequest(),
                   db: Session = Depends(get_db)):
    """Approve a NEEDS_REVIEW ticket (supervisor action)."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    old_status = ticket.ticket_status or "PENDING_APPROVAL"
    repo.update_ticket_fields(ticket_id, {
        "ticket_status":   "APPROVED",
        "workflow_stage":  "APPROVED_BY_SUPERVISOR",
        "routing_status":  "APPROVED",
        "handled_by_type": body.handled_by_type,
        "handled_by_name": body.handled_by_name,
        "handled_by_role": body.handled_by_role,
    })
    _propagate_status_to_merged_duplicates(repo, ticket_id, "APPROVED", db)
    _notify_citizen_sms(ticket, old_status, "APPROVED")
    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


@router.post("/{ticket_id}/reject")
def reject_ticket(ticket_id: str, body: RejectRequest = RejectRequest(),
                  db: Session = Depends(get_db)):
    """Reject a NEEDS_REVIEW ticket (supervisor action)."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    old_status = ticket.ticket_status or "PENDING_APPROVAL"
    repo.update_ticket_fields(ticket_id, {
        "ticket_status":   "REJECTED",
        "workflow_stage":  "REJECTED_BY_SUPERVISOR",
        "routing_status":  "REJECTED",
        "rejected_reason": body.rejected_reason,
    })
    _propagate_status_to_merged_duplicates(repo, ticket_id, "REJECTED", db)
    _notify_citizen_sms(ticket, old_status, "REJECTED")
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
        "department_status": "COMPLETED",
    })
    _propagate_status_to_merged_duplicates(repo, ticket_id, "RESOLVED", db)
    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


@router.post("/{ticket_id}/escalate")
def escalate_ticket(ticket_id: str, db: Session = Depends(get_db)):
    """Escalate a ticket to supervisor / specialist (supervisor or operator action)."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    old_status = ticket.ticket_status or "NEW"
    repo.update_ticket_fields(ticket_id, {
        "ticket_status":   "ESCALATED",
        "workflow_stage":  "ESCALATED",
        "routing_status":  "ESCALATED",
        "escalation":      "ESCALATED",
        "department_status": "ON_HOLD",
    })
    _propagate_status_to_merged_duplicates(repo, ticket_id, "ESCALATED", db)
    _notify_citizen_sms(ticket, old_status, "ESCALATED")
    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


_FALSE_REPORT_THRESHOLD = 3  # flag phone after this many false reports


@router.post("/{ticket_id}/false-report")
def mark_false_report(ticket_id: str, db: Session = Depends(get_db)):
    """Mark a ticket as a false report and update the caller's penalty record."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket.is_false_report:
        return ticket_to_dict(ticket)  # already marked, idempotent

    repo.update_ticket_fields(ticket_id, {"is_false_report": True})

    phone = ticket.phone_number
    if phone:
        penalty = db.query(FalseReportPenalty).filter(
            FalseReportPenalty.phone_number == phone
        ).first()
        if penalty:
            penalty.report_count += 1
            penalty.last_reported = datetime.utcnow()
            if penalty.report_count >= _FALSE_REPORT_THRESHOLD:
                penalty.flagged = True
        else:
            db.add(FalseReportPenalty(
                phone_number=phone,
                report_count=1,
                flagged=False,
                last_reported=datetime.utcnow(),
            ))
        db.commit()

    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


@router.delete("/{ticket_id}/false-report")
def unmark_false_report(ticket_id: str, db: Session = Depends(get_db)):
    """Undo a false-report marking (operator correction)."""
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if not ticket.is_false_report:
        return ticket_to_dict(ticket)

    repo.update_ticket_fields(ticket_id, {"is_false_report": False})

    phone = ticket.phone_number
    if phone:
        penalty = db.query(FalseReportPenalty).filter(
            FalseReportPenalty.phone_number == phone
        ).first()
        if penalty and penalty.report_count > 0:
            penalty.report_count -= 1
            if penalty.report_count < _FALSE_REPORT_THRESHOLD:
                penalty.flagged = False
            db.commit()

    return ticket_to_dict(repo.get_ticket_by_number(ticket_id))


@router.get("/penalties/list")
def get_penalties(db: Session = Depends(get_db)):
    """Return all phone numbers with false-report penalty records."""
    penalties = db.query(FalseReportPenalty).order_by(
        FalseReportPenalty.report_count.desc()
    ).all()
    return {
        "total": len(penalties),
        "flagged": sum(1 for p in penalties if p.flagged),
        "penalties": [
            {
                "phone_number":  p.phone_number,
                "report_count":  p.report_count,
                "flagged":       p.flagged,
                "last_reported": p.last_reported.isoformat() if p.last_reported else None,
            }
            for p in penalties
        ],
    }


@router.get("/{ticket_id}/recording")
def stream_recording(ticket_id: str, request: Request, db: Session = Depends(get_db)):
    """Stream the call recording WAV file with Range request support.

    Resolution order:
    1. tickets.recording_url  (set by upload-audio endpoint)
    2. recordings.merged_audio_path  (fallback)
    """
    repo = TicketRepository(db)
    ticket = repo.get_ticket_by_number(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # 1) Primary: tickets.recording_url
    recording_path = ticket.recording_url or ""

    # 2) Fallback: recordings table
    if not recording_path or not os.path.isfile(recording_path):
        rec = (
            db.query(Recording)
            .filter(Recording.ticket_id == ticket_id)
            .order_by(Recording.recording_id.desc())
            .first()
        )
        if rec:
            recording_path = rec.merged_audio_path or ""

    if not recording_path or not os.path.isfile(recording_path):
        raise HTTPException(status_code=404, detail="Recording not available")

    # Sync tickets.recording_url if it was empty
    if not ticket.recording_url and recording_path:
        repo.update_ticket_fields(ticket_id, {"recording_url": recording_path})

    file_size = os.path.getsize(recording_path)
    range_header = request.headers.get("Range")

    if range_header:
        # Parse "bytes=start-end"
        range_val = range_header.strip().replace("bytes=", "")
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] else 0
        end   = int(parts[1]) if parts[1] else file_size - 1
        end   = min(end, file_size - 1)
        chunk_size = end - start + 1

        def iter_file(path, s, length):
            with open(path, "rb") as f:
                f.seek(s)
                remaining = length
                while remaining > 0:
                    data = f.read(min(65536, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            iter_file(recording_path, start, chunk_size),
            status_code=206,
            media_type="audio/wav",
            headers={
                "Content-Range":  f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(chunk_size),
                "Accept-Ranges":  "bytes",
            },
        )

    # Full file response (first load — browser uses this to get duration)
    def iter_full(path):
        with open(path, "rb") as f:
            while True:
                data = f.read(65536)
                if not data:
                    break
                yield data

    return StreamingResponse(
        iter_full(recording_path),
        status_code=200,
        media_type="audio/wav",
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges":  "bytes",
            "Content-Disposition": f'inline; filename="{os.path.basename(recording_path)}"',
        },
    )
