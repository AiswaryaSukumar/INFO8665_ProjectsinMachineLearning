"""
RAG Agent — generates citizen-friendly SMS messages using Llama 3.1 via HF Inference API.

The ticket record fields serve as the "retrieved" context: ticket ID, category,
description, location, caller name, and the status transition details.
"""

import logging
from huggingface_hub import InferenceClient
from status_tracking_RAG.config import HF_API_TOKEN, HF_MODEL

logger = logging.getLogger("status_tracking_rag.rag_agent")

_client: InferenceClient | None = None


def _get_client() -> InferenceClient:
    global _client
    if _client is None:
        _client = InferenceClient(model=HF_MODEL, token=HF_API_TOKEN)
    return _client


# ── Static fallback messages (used when LLM is unavailable) ─────────
_FALLBACK_MESSAGES = {
    "APPROVED": (
        "City of Kitchener 311: Your service request {ticket_id} regarding "
        '"{category}" has been approved and assigned for resolution. '
        "We will keep you informed of further updates."
    ),
    "REJECTED": (
        "City of Kitchener 311: Your service request {ticket_id} regarding "
        '"{category}" has been reviewed and could not be approved at this time. '
        "Please contact 311 for more details."
    ),
    "ESCALATED": (
        "City of Kitchener 311: Your service request {ticket_id} regarding "
        '"{category}" has been escalated for priority attention. '
        "A supervisor will follow up shortly."
    ),
}

SYSTEM_PROMPT = """\
You are a professional city government SMS notification writer for the City of Kitchener 311 service.

Your task: write a SHORT SMS message (maximum 280 characters) informing a citizen about their 311 service request status change.

Rules:
- Be professional, clear, and empathetic.
- Always include the ticket reference number.
- Mention what the request was about (category/description) briefly.
- State the new status clearly.
- Do NOT use emojis, hashtags, or informal language.
- Do NOT include any greeting like "Dear" or sign-off like "Sincerely".
- Keep it under 280 characters total.
- Output ONLY the SMS text, nothing else."""


def _build_user_prompt(ctx: dict) -> str:
    return (
        f"Ticket ID: {ctx.get('ticket_id', 'N/A')}\n"
        f"Category: {ctx.get('category', 'General')}\n"
        f"Description: {ctx.get('description', 'N/A')}\n"
        f"Location: {ctx.get('location', 'N/A')}\n"
        f"Citizen Name: {ctx.get('caller_name', 'Resident')}\n"
        f"Previous Status: {ctx.get('old_status', 'N/A')}\n"
        f"New Status: {ctx.get('new_status', 'N/A')}\n"
    )


def generate_sms_message(ticket_context: dict) -> str:
    """
    Generate a citizen-friendly SMS message based on the ticket context.

    Parameters
    ----------
    ticket_context : dict
        Must contain at least: ticket_id, new_status.
        Optional: category, description, location, caller_name, old_status.

    Returns
    -------
    str  SMS message text (≤ 300 characters).
    """
    new_status = ticket_context.get("new_status", "UPDATED")

    try:
        client = _get_client()
        response = client.chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(ticket_context)},
            ],
            max_tokens=120,
            temperature=0.4,
        )
        message = response.choices[0].message.content.strip()

        # Truncate if LLM exceeded the limit
        if len(message) > 300:
            message = message[:297] + "..."

        logger.info("LLM generated SMS (%d chars) for ticket %s",
                     len(message), ticket_context.get("ticket_id"))
        return message

    except Exception as exc:
        logger.warning("LLM call failed (%s), using fallback message", exc)
        template = _FALLBACK_MESSAGES.get(new_status, _FALLBACK_MESSAGES["APPROVED"])
        return template.format(
            ticket_id=ticket_context.get("ticket_id", "N/A"),
            category=ticket_context.get("category", "your request"),
        )
