from datetime import datetime

from sqlalchemy.orm import Session as DBSession
from src.database.models.models import Ticket
from src.workflow.ticket_workflow import get_initial_ticket_status


def normalize_channel_value(value: str | None) -> str | None:
    raw = str(value or "").strip().upper()
    if not raw:
        return value

    if raw in {"WEB", "WEB FORM", "WEB_FORM", "WEBFORM", "ONLINE", "PUBLIC_WEB"}:
        return "WEB"

    if raw in {
        "PHONE",
        "CALL",
        "PHONE (HUMAN OPERATOR)",
        "PHONE (AI VOICE BOT)",
        "PHONE (AI VOICE BOT → OPERATOR)",
        "PHONE (AI VOICE BOT → SUPERVISOR)",
    }:
        return "PHONE"

    if raw == "VOICE":
        return "VOICE"

    if raw in {"EMAIL", "E-MAIL"}:
        return "EMAIL"

    if raw in {"IN_PERSON", "IN-PERSON", "IN PERSON", "COUNTER"}:
        return "IN_PERSON"

    return raw


class TicketRepository:
    def __init__(self, db: DBSession):
        self.db = db

    def _generate_next_ticket_id(self) -> str:
        """
        Generate unified municipal ticket number:
        311-YYYY-######

        Sequence resets per year.
        Example:
        311-2026-000001
        """
        year = datetime.now().year
        prefix = f"311-{year}-"

        existing_ids = (
            self.db.query(Ticket.ticket_id)
            .filter(Ticket.ticket_id.like(f"{prefix}%"))
            .all()
        )

        max_seq = 0
        for row in existing_ids:
            ticket_id = row[0] if isinstance(row, tuple) else getattr(row, "ticket_id", None)
            if not ticket_id:
                continue

            value = str(ticket_id).strip()
            if not value.startswith(prefix):
                continue

            suffix = value[len(prefix):]
            if len(suffix) == 6 and suffix.isdigit():
                seq = int(suffix)
                if seq > max_seq:
                    max_seq = seq

        next_seq = max_seq + 1
        return f"{prefix}{next_seq:06d}"

    def create_ticket(self, ticket_id: str | None, session_id: str, channel: str) -> Ticket:
        """
        Legacy helper used by existing voice/orchestrator flow.
        Kept for backward compatibility.

        If ticket_id is not provided, generate unified municipal ticket number.
        """
        normalized_channel = normalize_channel_value(channel)
        is_voice_bot = str(normalized_channel or "").upper() == "VOICE"

        resolved_ticket_id = ticket_id or self._generate_next_ticket_id()

        db_ticket = Ticket(
            ticket_id=resolved_ticket_id,
            session_id=session_id,
            channel=normalized_channel,

            # core business rule
            ticket_status=get_initial_ticket_status(
                channel=normalized_channel,
                created_by_type="VOICE_BOT" if is_voice_bot else "OPERATOR",
                handled_by_type="VOICE_BOT" if is_voice_bot else "OPERATOR",
                handled_by_role="VOICE_BOT" if is_voice_bot else "OPERATOR",
            ),

            # workflow defaults
            routing_status="PENDING_APPROVAL" if is_voice_bot else "ROUTED",
            workflow_stage="PENDING_APPROVAL" if is_voice_bot else "STANDARD",

            created_by_type="VOICE_BOT" if is_voice_bot else "OPERATOR",
            created_by_name="INSIGHT VoiceBot" if is_voice_bot else None,
            created_by_role="SYSTEM" if is_voice_bot else "OPERATOR",

            handled_by_type="VOICE_BOT" if is_voice_bot else "OPERATOR",
            handled_by_name="INSIGHT VoiceBot" if is_voice_bot else None,
            handled_by_role="VOICE_BOT" if is_voice_bot else "OPERATOR",
        )

        self.db.add(db_ticket)
        self.db.commit()
        self.db.refresh(db_ticket)
        return db_ticket

    def create_ticket_full(self, fields: dict) -> Ticket:
        """
        Full create path for frontend/manual/public/API ticket creation.
        Saves all major fields in one go.
        """
        payload = dict(fields or {})

        ticket_id = payload.get("ticket_id") or self._generate_next_ticket_id()
        session_id = payload.get("session_id")

        channel = normalize_channel_value(payload.get("channel"))
        created_by_type = payload.get("created_by_type")
        created_by_name = payload.get("created_by_name")
        created_by_role = payload.get("created_by_role")

        handled_by_type = payload.get("handled_by_type")
        handled_by_name = payload.get("handled_by_name")
        handled_by_role = payload.get("handled_by_role")

        ticket_status = payload.get("ticket_status") or get_initial_ticket_status(
            channel=channel,
            created_by_type=created_by_type,
            handled_by_type=handled_by_type,
            handled_by_role=handled_by_role,
        )

        routing_status = payload.get("routing_status")
        workflow_stage = payload.get("workflow_stage")

        if not routing_status:
            if ticket_status == "APPROVED":
                routing_status = "APPROVED"
            elif ticket_status == "REJECTED":
                routing_status = "REJECTED"
            elif ticket_status == "NEEDS_REVIEW":
                routing_status = "PENDING_APPROVAL"
            else:
                routing_status = "ROUTED"

        if not workflow_stage:
            if ticket_status == "APPROVED":
                workflow_stage = "APPROVED_BY_SUPERVISOR"
            elif ticket_status == "REJECTED":
                workflow_stage = "REJECTED_BY_SUPERVISOR"
            elif ticket_status == "RESOLVED":
                workflow_stage = "COMPLETED"
            elif ticket_status == "NEEDS_REVIEW":
                workflow_stage = "PENDING_APPROVAL"
            else:
                workflow_stage = "STANDARD"

        db_ticket = Ticket(
            ticket_id=ticket_id,
            session_id=session_id,
            ticket_status=ticket_status,
            channel=channel,
            department=payload.get("department"),
            category=payload.get("category"),
            location=payload.get("location"),
            description=payload.get("description"),
            caller_name=payload.get("caller_name"),
            phone_number=payload.get("phone_number"),
            severity=payload.get("severity"),

            routing_status=routing_status,
            workflow_stage=workflow_stage,

            created_by_type=created_by_type,
            created_by_name=created_by_name,
            created_by_role=created_by_role,

            handled_by_type=handled_by_type,
            handled_by_name=handled_by_name,
            handled_by_role=handled_by_role,

            notes=payload.get("notes"),
            transcript=payload.get("transcript"),
            recording_url=payload.get("recording_url"),
            rejected_reason=payload.get("rejected_reason"),
            deleted_reason=payload.get("deleted_reason"),
        )

        self.db.add(db_ticket)
        self.db.commit()
        self.db.refresh(db_ticket)
        return db_ticket

    def get_ticket_by_number(self, ticket_id: str) -> Ticket:
        return self.db.query(Ticket).filter(Ticket.ticket_id == ticket_id).first()

    def search_tickets(self, ticket_status: str = None, channel: str = None) -> list[Ticket]:
        query = self.db.query(Ticket)

        if ticket_status:
            query = query.filter(Ticket.ticket_status == ticket_status)

        if channel:
            query = query.filter(Ticket.channel == normalize_channel_value(channel))

        return query.all()

    def update_ticket_status(self, ticket_id: str, new_status: str):
        ticket = self.get_ticket_by_number(ticket_id)
        if ticket:
            ticket.ticket_status = new_status
            self.db.commit()
            self.db.refresh(ticket)
        return ticket

    def update_ticket_fields(self, ticket_id: str, fields: dict):
        ticket = self.get_ticket_by_number(ticket_id)
        if ticket:
            for key, value in fields.items():
                if not hasattr(ticket, key):
                    continue

                if key == "channel":
                    value = normalize_channel_value(value)

                setattr(ticket, key, value)

            self.db.commit()
            self.db.refresh(ticket)

        return ticket