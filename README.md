# INSIGHT-311: AI-Powered Municipal Voice Assistant

INSIGHT-311 is an AI-driven 311 call-center assistant for municipal governments. Citizens report city issues (potholes, graffiti, litter, etc.) via a voice or text interface. The system transcribes speech, extracts structured data using NLU, creates a service ticket, and routes it to the appropriate city department. Operators and supervisors manage tickets through a React web dashboard.

---

## Features

- **Voice call interface** — browser-based STT (Web Speech API) with multi-turn slot filling
- **NLU pipeline** — intent classification (DistilBERT), named entity extraction (spaCy + regex), confidence scoring, sentiment analysis (RoBERTa), urgency detection
- **Operator dashboard** — ticket queue management, approve / reject / escalate / resolve actions
- **Developer mode** — per-turn confidence scores, sentiment labels, urgency indicators
- **SMS notifications** — citizen notified via Twilio SMS when a ticket is approved, rejected, or escalated (LLM-generated message via Llama 3.1, with static fallback)
- **Call recordings** — per-session WAV merge, transcript storage, in-browser audio playback

---

## System Overview

```
Citizen (browser) → VoiceAssistantModal
                          │  WebSpeech STT + fetch
                          ▼
                FastAPI backend  (port 8311)
          ┌──────────────┬────────────────────────┐
     orchestrator/   ticket_service/         nlp_service/
     test_router.py  approve/reject/escalate  NLU pipeline
                          │ SMS trigger
                          ▼
                 status_tracking_RAG/
                 Llama 3.1 + Twilio SMS
                          │
                    db_service/ (PostgreSQL)

React frontend  (Vite, port 5173)
  Landing → Login → Dashboard (IntakePage)
  TicketDetailsDrawer / VoiceAssistantModal
```

---

## Project Structure

```
insight311/
├── main.py                        # FastAPI entry point, ML model startup
├── orchestrator/
│   ├── main.py                    # Conversation state machine (slot filling, rule engine)
│   └── test_router.py             # Web UI call router (/api/test/*)
├── nlp_service/
│   ├── main.py                    # NLUProcessor factory
│   └── model/
│       ├── nlu_processor.py       # NLU pipeline core
│       ├── entity_extractor.py    # Location / name / phone extraction
│       ├── sentiment_analyzer.py  # Urgency & sentiment
│       ├── confidence_calculator.py
│       └── models/
│           ├── ml_sentiment_model.py     # RoBERTa emotion model
│           ├── audio_sentiment.py        # Audio arousal (librosa)
│           ├── location_calibrator.py    # Location confidence MLP
│           └── category_classifier_ml.py # DistilBERT category classifier
├── ticket_service/
│   ├── main.py                    # Ticket CRUD + approve/reject/escalate/resolve
│   └── monitoring.py              # ML alert & flagged ticket endpoints
├── db_service/
│   └── main.py                    # SQLAlchemy models, SessionRepository, TicketRepository
├── status_tracking_RAG/           # Citizen SMS notification service
│   ├── config.py                  # Twilio / HuggingFace credentials
│   ├── rag_agent.py               # SMS message generation (Llama 3.1 via HF Inference API)
│   ├── sms_service.py             # Twilio send + E.164 phone normalization
│   └── main.py                    # Standalone Sequin CDC webhook server (optional)
├── stt_service/                   # Whisper STT (hardware/direct path)
├── tts_service/                   # pyttsx3 TTS (hardware/direct path)
└── ui/
    └── web-agent/                 # React + Vite frontend
        └── src/
            ├── pages/
            │   ├── IntakePage.jsx           # Main operator dashboard
            │   └── ...
            └── components/
                ├── VoiceAssistantModal.jsx  # ISA voice chat (Citizen + Dev mode)
                ├── TicketDetailsDrawer.jsx  # Ticket detail, audio player, transcript
                └── ...
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+ (for the React frontend)
- PostgreSQL database

### 1. Clone & install Python dependencies

```bash
cd insight311
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
pip install fastapi uvicorn[standard] python-dotenv psycopg2-binary pydub librosa
pip install twilio huggingface-hub
python -m spacy download en_core_web_sm
```

### 2. Configure environment variables

Create `insight311/.env`:

```env
# PostgreSQL
DATABASE_URL=postgresql://your_user:your_password@your_host:5432/your_db

# Twilio SMS (required for citizen notifications)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1XXXXXXXXXX

# HuggingFace (Llama 3.1 SMS generation)
HF_API_TOKEN=hf_your_token_here
HF_MODEL=meta-llama/Llama-3.1-8B-Instruct   # optional, this is the default
```

> **Note:** SMS notifications are optional. If `TWILIO_*` or `HF_API_TOKEN` are missing, the system starts normally and silently skips SMS on ticket status changes.

> **Twilio Trial accounts:** You must verify recipient phone numbers at Twilio Console → Phone Numbers → Verified Caller IDs before sending.

### 3. Train the NLU model (first-time only)

```bash
cd insight311
python nlp_service/train/main.py
```

Artifacts are saved to `nlp_service/ml_models/saved_models/category_classifier/`.

### 4. Start the backend

```bash
cd insight311
uvicorn main:app --host 0.0.0.0 --port 8311 --reload
```

Wait for:
```
Loading ML Models into Application State...
All ML Models loaded successfully.
```

### 5. Start the frontend

```bash
cd insight311/ui/web-agent
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Usage

| Role | Action |
|------|--------|
| **Citizen** | Click "Talk to ISA" → report an issue by voice |
| **Operator** | Log in → view ticket queue → manage assignments |
| **Supervisor** | Approve / Reject / Escalate Voice Bot tickets → citizen receives SMS |

### Voice Assistant Modes

- **Citizen Mode** (default) — clean chat bubble interface, no debug info
- **Developer Mode** — dark theme, per-turn confidence bars, sentiment labels, urgency indicators (toggle button in the idle screen)

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/test/start` | Start a new voice session |
| POST | `/api/test/chat` | Process one conversation turn |
| POST | `/api/test/upload-audio` | Upload per-turn WebM audio |
| GET | `/api/tickets/` | List tickets |
| GET | `/api/tickets/{id}` | Get ticket detail |
| PUT | `/api/tickets/{id}` | Update ticket fields |
| POST | `/api/tickets/{id}/approve` | Approve ticket → triggers SMS |
| POST | `/api/tickets/{id}/reject` | Reject ticket → triggers SMS |
| POST | `/api/tickets/{id}/escalate` | Escalate ticket → triggers SMS |
| POST | `/api/tickets/{id}/resolve` | Mark resolved |
| GET | `/api/tickets/{id}/recording` | Stream call recording (WAV) |
| GET | `/api/monitoring/dashboard` | ML monitoring stats |

Interactive API docs: `http://localhost:8311/docs`

---

## NLU Categories

The system classifies citizen reports into:

`graffiti` · `illegal_sign` · `litter` · `needles` · `parking_complaint` · `pothole` · `property_standards` · `sidewalk_hazard` · `sidewalk_snow` · `trail_maintenance`

---

## ML Models

| Model | Purpose |
|-------|---------|
| Fine-tuned DistilBERT | Issue category classification |
| `j-hartmann/emotion-english-distilroberta-base` | Sentiment & urgency (7-class emotion) |
| `dslim/bert-base-NER` | NER confidence scoring |
| spaCy `en_core_web_sm` | Entity recognition |
| Custom MLP | Location confidence calibration |
| VADER | Sentiment fallback |
| `openai/whisper-small` | STT (hardware/direct path) |
| Llama 3.1 (HF Inference API) | SMS message generation |

---

## Key Configuration

| Setting | Default |
|---------|---------|
| Backend port | `8311` |
| Frontend dev port | `5173` |
| Location confidence threshold | `0.75` (street number required) |
| Sentiment urgency: high | `≥ 0.55` ml_negative |
| Escalation attempts before handoff | `3` |
