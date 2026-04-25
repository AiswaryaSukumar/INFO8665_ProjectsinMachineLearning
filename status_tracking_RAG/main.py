"""
status_tracking_RAG — Sequin CDC Webhook Server

Standalone FastAPI application that receives Sequin change-data-capture events
for the `tickets` table, generates a citizen-friendly SMS via a RAG agent
(Llama 3.1 on HF Inference API), and delivers it through Twilio.

Run:
    cd insight311
    python -m status_tracking_RAG.main
"""

import logging
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from status_tracking_RAG.config import validate, USECASE3_PORT, NOTIFY_ON_STATUSES
from status_tracking_RAG.rag_agent import generate_sms_message
from status_tracking_RAG.sms_service import send_sms

# ── Logging ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("status_tracking_rag")

# ── App ─────────────────────────────────────────────────
app = FastAPI(
    title="status_tracking_RAG — Ticket Status SMS Notifier",
    version="1.0.0",
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "status_tracking_RAG"}


@app.post("/webhooks/sequin/ticket-status")
async def handle_ticket_status_change(request: Request):
    """
    Receive a Sequin CDC webhook event for the `tickets` table.

    Sequin payload shape:
    {
      "action": "update",
      "record": { ...current row values... },
      "changes": { ...previous values of changed columns only... },
      "metadata": { "table_name": "tickets", ... }
    }
    """
    payload = await request.json()

    action = payload.get("action")
    record = payload.get("record", {})
    changes = payload.get("changes", {})

    ticket_id = record.get("ticket_id", "unknown")

    # ── Guard 1: only UPDATE events ────────────────────
    if action != "update":
        logger.debug("Ignored non-update action '%s' for ticket %s", action, ticket_id)
        return JSONResponse({"processed": False, "reason": "not an update"})

    # ── Guard 2: ticket_status must have actually changed
    if "ticket_status" not in changes:
        logger.debug("Ignored update without ticket_status change for ticket %s", ticket_id)
        return JSONResponse({"processed": False, "reason": "ticket_status did not change"})

    new_status = (record.get("ticket_status") or "").upper()
    old_status = (changes.get("ticket_status") or "").upper()

    # ── Guard 3: only notify on specific target statuses
    if new_status not in NOTIFY_ON_STATUSES:
        logger.info("Ticket %s: %s → %s (not a notifiable status, skipped)",
                     ticket_id, old_status, new_status)
        return JSONResponse({"processed": False, "reason": f"status {new_status} not notifiable"})

    # ── Guard 4: phone number must be present ──────────
    phone_number = (record.get("phone_number") or "").strip()
    if not phone_number:
        logger.warning("Ticket %s: %s → %s but no phone_number on record, skipping SMS",
                        ticket_id, old_status, new_status)
        return JSONResponse({"processed": False, "reason": "no phone_number"})

    # ── Build ticket context for RAG agent ─────────────
    ticket_context = {
        "ticket_id": ticket_id,
        "old_status": old_status,
        "new_status": new_status,
        "category": record.get("category", "General"),
        "description": record.get("description", ""),
        "location": record.get("location", ""),
        "caller_name": record.get("caller_name", "Resident"),
        "department": record.get("department", ""),
        "severity": record.get("severity", ""),
    }

    logger.info("Ticket %s: %s → %s — generating SMS for %s",
                 ticket_id, old_status, new_status, phone_number)

    # ── Step 1: Generate message via RAG agent ─────────
    sms_body = generate_sms_message(ticket_context)
    logger.info("SMS body for ticket %s: %s", ticket_id, sms_body)

    # ── Step 2: Send via Twilio ────────────────────────
    result = send_sms(phone_number, sms_body)

    if "error" in result:
        logger.error("Failed to send SMS for ticket %s: %s", ticket_id, result["error"])
        return JSONResponse(
            {"processed": True, "sms_sent": False, "error": result["error"]},
            status_code=200,  # Return 200 so Sequin doesn't retry
        )

    logger.info("SMS delivered for ticket %s — SID: %s", ticket_id, result.get("sid"))
    return JSONResponse({
        "processed": True,
        "sms_sent": True,
        "ticket_id": ticket_id,
        "transition": f"{old_status} → {new_status}",
        "twilio_sid": result.get("sid"),
    })


# ── Entrypoint ──────────────────────────────────────────
if __name__ == "__main__":
    validate()
    logger.info("Starting status_tracking_RAG webhook server on port %d", USECASE3_PORT)
    uvicorn.run(
        "status_tracking_RAG.main:app",
        host="0.0.0.0",
        port=USECASE3_PORT,
        log_level="info",
    )
