import os
import sys
from dotenv import load_dotenv

# Load .env from the project root (one level up from status_tracking_RAG/)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# ── Twilio ──────────────────────────────────────────────
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")

# ── Hugging Face ────────────────────────────────────────
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
HF_MODEL = os.getenv("HF_MODEL", "meta-llama/Llama-3.1-8B-Instruct")

# ── Sequin (optional HMAC verification) ────────────────
SEQUIN_WEBHOOK_SECRET = os.getenv("SEQUIN_WEBHOOK_SECRET", "")

# ── Server ──────────────────────────────────────────────
USECASE3_PORT = int(os.getenv("USECASE3_PORT", "8312"))

# ── Ticket statuses that trigger SMS ────────────────────
NOTIFY_ON_STATUSES = {"APPROVED", "REJECTED", "ESCALATED"}

# ── Validation ──────────────────────────────────────────
_REQUIRED = {
    "TWILIO_ACCOUNT_SID": TWILIO_ACCOUNT_SID,
    "TWILIO_AUTH_TOKEN": TWILIO_AUTH_TOKEN,
    "TWILIO_FROM_NUMBER": TWILIO_FROM_NUMBER,
    "HF_API_TOKEN": HF_API_TOKEN,
}


def validate() -> None:
    missing = [k for k, v in _REQUIRED.items() if not v]
    if missing:
        print(f"[status_tracking_RAG] ERROR: missing required env vars: {', '.join(missing)}")
        sys.exit(1)
