"""
Twilio SMS Service — sends SMS notifications to citizens.
"""

import logging
import re
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from status_tracking_RAG.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

logger = logging.getLogger("status_tracking_rag.sms_service")

_client: Client | None = None

# E.164 pattern: +[country code][number], 8-15 digits total
_E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    return _client


def _normalize_phone(number: str) -> str | None:
    """
    Best-effort normalization to E.164.
    Returns None if number is clearly invalid.
    """
    cleaned = re.sub(r"[\s\-\(\)\.]+", "", number.strip())

    # North American numbers without country code
    if cleaned.startswith("1") and len(cleaned) == 11:
        cleaned = "+" + cleaned
    elif len(cleaned) == 10 and cleaned[0] != "+":
        cleaned = "+1" + cleaned
    elif not cleaned.startswith("+"):
        cleaned = "+" + cleaned

    if _E164_RE.match(cleaned):
        return cleaned
    return None


def send_sms(to_number: str, message: str) -> dict:
    """
    Send an SMS via Twilio.

    Parameters
    ----------
    to_number : str
        Recipient phone number (any common format accepted).
    message : str
        SMS body text.

    Returns
    -------
    dict  {"sid": str, "status": str} on success,
          {"error": str} on failure.
    """
    normalized = _normalize_phone(to_number)
    if normalized is None:
        logger.warning("Invalid phone number format: %s", to_number)
        return {"error": f"Invalid phone number: {to_number}"}

    try:
        client = _get_client()
        msg = client.messages.create(
            body=message,
            from_=TWILIO_FROM_NUMBER,
            to=normalized,
        )
        logger.info("SMS sent to %s — SID: %s, status: %s",
                     normalized, msg.sid, msg.status)
        return {"sid": msg.sid, "status": msg.status}

    except TwilioRestException as exc:
        logger.error("Twilio API error sending to %s: %s", normalized, exc)
        return {"error": str(exc)}
