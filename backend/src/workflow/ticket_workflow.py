from typing import Optional

# Canonical backend ticket statuses
VALID_TICKET_STATUSES = {
    "NEW",
    "NEEDS_REVIEW",
    "APPROVED",
    "REJECTED",
    "RESOLVED",
    "DELETE",
}

# Terminal means no further workflow action should be allowed
TERMINAL_TICKET_STATUSES = {
    "REJECTED",
    "RESOLVED",
    "DELETE",
}

# Central lifecycle rules
# IMPORTANT:
# - No IN_PROGRESS
# - Approval is only for NEEDS_REVIEW
# - Rejection is only for NEEDS_REVIEW
# - Resolution is allowed from NEW and APPROVED
ALLOWED_TICKET_TRANSITIONS = {
    "NEW": {"RESOLVED"},
    "NEEDS_REVIEW": {"APPROVED", "REJECTED"},
    "APPROVED": {"RESOLVED"},
    "REJECTED": set(),
    "RESOLVED": set(),
    "DELETE": set(),
}


def normalize_ticket_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    return str(status).strip().upper()


def normalize_channel_value(channel: Optional[str]) -> Optional[str]:
    if channel is None:
        return None

    raw = str(channel).strip().upper()
    if not raw:
        return None

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


def is_valid_ticket_status(status: Optional[str]) -> bool:
    normalized = normalize_ticket_status(status)
    return normalized in VALID_TICKET_STATUSES


def is_terminal_ticket_status(status: Optional[str]) -> bool:
    normalized = normalize_ticket_status(status)
    return normalized in TERMINAL_TICKET_STATUSES


def can_transition_ticket_status(current_status: Optional[str], new_status: Optional[str]) -> bool:
    current = normalize_ticket_status(current_status)
    target = normalize_ticket_status(new_status)

    if current is None or target is None:
        return False

    if current == target:
        return True

    if current not in ALLOWED_TICKET_TRANSITIONS:
        return False

    return target in ALLOWED_TICKET_TRANSITIONS[current]


def can_approve_ticket(current_status: Optional[str]) -> bool:
    return normalize_ticket_status(current_status) == "NEEDS_REVIEW"


def can_reject_ticket(current_status: Optional[str]) -> bool:
    return normalize_ticket_status(current_status) == "NEEDS_REVIEW"


def can_resolve_ticket(current_status: Optional[str]) -> bool:
    normalized = normalize_ticket_status(current_status)
    return normalized in {"NEW", "APPROVED"}


def is_pure_voice_bot_ticket(
    channel: Optional[str] = None,
    created_by_type: Optional[str] = None,
    handled_by_type: Optional[str] = None,
    handled_by_role: Optional[str] = None,
) -> bool:
    """
    Pure bot-only ticket means:
    - created by VOICE_BOT
    - handled by VOICE_BOT
    - handled role is VOICE_BOT

    Channel alone should NOT force NEEDS_REVIEW.
    """
    channel_upper = normalize_channel_value(channel)
    created_upper = str(created_by_type or "").strip().upper()
    handled_type_upper = str(handled_by_type or "").strip().upper()
    handled_role_upper = str(handled_by_role or "").strip().upper()

    created_is_bot = created_upper == "VOICE_BOT"

    # Backward compatibility:
    # if older flow only provided channel=VOICE and omitted created_by_type,
    # still treat it as bot-created.
    if not created_is_bot and channel_upper == "VOICE":
        created_is_bot = True

    return (
        created_is_bot
        and handled_type_upper == "VOICE_BOT"
        and handled_role_upper == "VOICE_BOT"
    )


def get_initial_ticket_status(
    channel: Optional[str],
    created_by_type: Optional[str] = None,
    handled_by_type: Optional[str] = None,
    handled_by_role: Optional[str] = None,
) -> str:
    """
    Business rule:
    - created by Voice Bot + handled by Voice Bot => NEEDS_REVIEW
    - created by Voice Bot + handled by human => NEW
    - created by human => NEW

    Only pure bot-only tickets start as NEEDS_REVIEW.
    """
    pure_bot = is_pure_voice_bot_ticket(
        channel=channel,
        created_by_type=created_by_type,
        handled_by_type=handled_by_type,
        handled_by_role=handled_by_role,
    )

    return "NEEDS_REVIEW" if pure_bot else "NEW"