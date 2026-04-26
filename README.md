# INSIGHT-311: AI-Powered Municipal 311 Assistant

INSIGHT-311 is a full-stack AI system for municipal 311 call centers. Citizens report city issues via a browser-based voice assistant (ISA). The backend transcribes speech, classifies the issue, extracts structured entities, and creates a routed service ticket. Operators and supervisors manage tickets through a React dashboard with analytics, duplicate detection, SLA tracking, and SMS notifications.

---

## Features

| Feature | Description |
|---------|-------------|
| **ISA Voice Assistant** | Browser-based multi-turn voice conversation (WebSpeech STT + Web Speech TTS) |
| **NLU Pipeline** | DistilBERT category classification, spaCy + regex NER, RoBERTa sentiment, urgency detection |
| **Operator Dashboard** | Ticket queue with lane filters, search, approve/reject/escalate/resolve |
| **Queue Overview Analytics** | KPI cards, source breakdown, category chart, SLA tracking, duplicate detection, heatmap |
| **Duplicate Detection** | Fuzzy matching on category + location + text + time; supervisor merge/dismiss workflow |
| **SMS Notifications** | Twilio SMS to citizen on ticket approve/reject/escalate (LLM-generated via Llama 3.1) |
| **Call Recordings** | Per-session WAV merge + transcript storage; in-browser audio playback |
| **Bilingual UI** | English / French toggle |
| **Complaint Heatmap** | Geographic visualization of ticket locations |

---

## System Requirements

| Requirement | Version |
|-------------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| PostgreSQL | Neon (cloud) or local 14+ |
| OS | Windows 10/11, macOS, Linux |
| RAM | 8 GB minimum (ML models load ~3–4 GB) |
| ffmpeg | Required by `pydub` for audio conversion |

---

## Getting Started

### Step 1 — Clone the repository

```bash
git clone https://github.com/<your-org>/insight311.git
cd insight311
```

---

### Step 2 — Install ffmpeg

`pydub` requires ffmpeg to convert WebM audio from the browser to WAV.

**Windows:**
```bash
# Using winget
winget install ffmpeg

# Or download from https://ffmpeg.org/download.html
# Add the bin/ folder to your system PATH
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install ffmpeg
```

Verify: `ffmpeg -version`

---

### Step 3 — Create Python virtual environment

```bash
# From inside the insight311/ directory
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

---

### Step 4 — Install Python dependencies

```bash
pip install -r requirements.txt
python -m spacy download en_core_web_md
```

> **Note:** `torch` and `transformers` are large packages (~2–4 GB). Installation may take several minutes.

---

### Step 5 — Configure environment variables

Create a file named `.env` in the `insight311/` root directory:

```env
# ── PostgreSQL (Neon or local) ─────────────────────────────
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require

# ── Twilio SMS (optional — system works without this) ──────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1XXXXXXXXXX

# ── HuggingFace (Llama 3.1 SMS generation, optional) ───────
HF_API_TOKEN=hf_your_token_here
HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
```

> **SMS is optional.** If Twilio/HuggingFace credentials are absent, the system starts normally and silently skips SMS on ticket status changes.

> **Twilio Trial accounts:** Verify recipient phone numbers at Twilio Console → Phone Numbers → Verified Caller IDs before sending.

---

### Step 6 — Set up the database

#### Option A: Neon PostgreSQL (recommended)
1. Create a free project at [neon.tech](https://neon.tech)
2. Copy the connection string into `DATABASE_URL` in your `.env`
3. Run the base migration to create all tables:

```bash
# Tables are auto-created by SQLAlchemy on first backend startup
# Run the duplicate_candidates migration manually:
psql "$DATABASE_URL" -f db_service/migrations/add_duplicate_candidates.sql
```

#### Option B: Local PostgreSQL
```bash
createdb insight311
# Set DATABASE_URL=postgresql+psycopg2://postgres:password@localhost:5432/insight311
```

---

### Step 7 — Train the NLU category classifier (first time only)

The fine-tuned DistilBERT model must be trained before the backend can start.

```bash
python nlp_service/train/main.py
```

This saves model artifacts to:
```
nlp_service/ml_models/saved_models/category_classifier/
```

> Training takes ~10–20 minutes on CPU. On GPU (CUDA) it finishes in ~2–3 minutes.
> Skip this step if the `saved_models/category_classifier/` directory already exists.

---

### Step 8 — Start the backend

```bash
# From insight311/
uvicorn main:app --host 0.0.0.0 --port 8311 --reload
```

Wait until you see:
```
Loading ML Models into Application State...
Loading Whisper STT engine (small)...
Loading NLU Processor Engine...
Pre-warming ML sentiment model...
Pre-warming NER confidence model...
✅ All ML Models loaded successfully!

==================================================
🌐 Server is running! Click the links below to test:
👉 http://localhost:8311/docs         ← Swagger API
👉 http://localhost:8311/api/test/ui  ← Call Test UI
==================================================
```

> First startup downloads Whisper and HuggingFace models from the internet (~1–2 GB). Subsequent starts use the local cache.

---

### Step 9 — Install frontend dependencies

```bash
cd ui/web-agent
npm install
```

---

### Step 10 — Configure frontend environment (optional)

By default the frontend calls `http://127.0.0.1:8311/api`. To change this, create `ui/web-agent/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8311/api
```

---

### Step 11 — Start the frontend

```bash
# From ui/web-agent/
npm run dev
```

Open your browser at: **http://localhost:5173**

---

## Default Login Accounts

| Name | Role | Default |
|------|------|---------|
| Nagavalli | SUPERVISOR | ✅ Pre-selected |
| Jerry | OPERATOR | — |
| Helen | OPERATOR | — |
| Denver | OPERATOR | — |

---

## Usage Guide

### Citizen
1. Click **"Talk to ISA"** on the landing page or dashboard
2. Allow microphone access when prompted
3. Speak your issue naturally — ISA will ask clarifying questions
4. Confirm the summary — a ticket number is created instantly
5. You will receive an SMS when your ticket status changes (if phone number provided)

### Operator
1. Log in → land on **My Work Queue**
2. View assigned tickets; use lane filters (New / Needs Review / Escalated / etc.)
3. Click any ticket row to open the detail drawer
4. Edit fields, listen to recording, view transcript
5. Approve Voice Bot tickets or escalate to supervisor

### Supervisor
1. Log in → access all ticket views
2. **Queue Overview** tab — analytics, SLA status, duplicate detection
3. Approve / Reject / Escalate tickets → citizen receives automated SMS
4. Review duplicate pairs → Merge or Dismiss

---

## API Reference

Interactive docs: **http://localhost:8311/docs**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/test/start` | Start a new voice session |
| `POST` | `/api/test/chat` | Process one conversation turn |
| `POST` | `/api/test/upload-audio` | Upload per-turn WebM audio |
| `GET`  | `/api/tickets/` | List all tickets |
| `GET`  | `/api/tickets/{id}` | Get ticket detail |
| `PUT`  | `/api/tickets/{id}` | Update ticket |
| `POST` | `/api/tickets/{id}/approve` | Approve → triggers SMS |
| `POST` | `/api/tickets/{id}/reject` | Reject → triggers SMS |
| `POST` | `/api/tickets/{id}/escalate` | Escalate → triggers SMS |
| `POST` | `/api/tickets/{id}/resolve` | Mark resolved |
| `GET`  | `/api/tickets/{id}/recording` | Stream call WAV |
| `GET`  | `/api/duplicates/` | List duplicate candidates |
| `POST` | `/api/duplicates/{id}/merge` | Merge duplicate pair |
| `POST` | `/api/duplicates/{id}/dismiss` | Dismiss false positive |
| `GET`  | `/api/monitoring/dashboard` | ML monitoring stats |
| `GET`  | `/api/map/` | Ticket location data for heatmap |

---

## Project Structure

```
insight311/
├── .env                           # Secrets (never commit)
├── .gitignore
├── main.py                        # FastAPI entry point + ML model startup
├── requirements.txt
│
├── orchestrator/
│   ├── main.py                    # Conversation state machine
│   └── test_router.py             # /api/test/* (web UI call router)
│
├── nlp_service/
│   ├── main.py                    # NLUProcessor factory
│   └── model/
│       ├── nlu_processor.py
│       ├── entity_extractor.py
│       ├── sentiment_analyzer.py
│       ├── confidence_calculator.py
│       └── models/
│           ├── ml_sentiment_model.py
│           ├── category_classifier_ml.py
│           ├── ner_confidence_model.py
│           ├── location_calibrator.py
│           └── audio_sentiment.py
│
├── ticket_service/
│   ├── main.py                    # Ticket CRUD + approve/reject/escalate
│   ├── duplicate_detection.py     # Fuzzy duplicate matching (rapidfuzz)
│   ├── duplicates.py              # /api/duplicates/* router
│   ├── monitoring.py              # /api/monitoring/* router
│   └── sla_config.py              # SLA deadline configuration
│
├── db_service/
│   ├── main.py                    # SQLAlchemy models + repositories
│   └── migrations/
│       └── add_duplicate_candidates.sql
│
├── map_service/
│   └── main.py                    # /api/map/* heatmap data
│
├── status_tracking_RAG/
│   ├── config.py                  # Twilio + HuggingFace credentials
│   ├── rag_agent.py               # Llama 3.1 SMS generation
│   ├── sms_service.py             # Twilio send + E.164 normalization
│   └── main.py                    # Standalone CDC webhook (optional)
│
├── stt_service/                   # Whisper STT (hardware path)
├── tts_service/                   # pyttsx3 TTS (hardware path)
│
└── ui/
    └── web-agent/                 # React + Vite frontend
        ├── package.json
        └── src/
            ├── pages/
            │   ├── IntakePage.jsx
            │   ├── QueueOverviewPanel.jsx
            │   ├── LoginPage.jsx
            │   └── ...
            └── components/
                ├── VoiceAssistantModal.jsx
                ├── TicketDetailsDrawer.jsx
                ├── TicketTable.jsx
                └── ...
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError: whisper` | Run `pip install openai-whisper` |
| `ffmpeg not found` | Install ffmpeg and ensure it's on PATH |
| `spacy model not found` | Run `python -m spacy download en_core_web_md` |
| Backend starts but ML fails | Check that `nlp_service/ml_models/saved_models/category_classifier/` exists; re-run training |
| `psycopg2` connection error | Verify `DATABASE_URL` in `.env`; check Neon project is active |
| Frontend shows blank / API errors | Confirm backend is running on port 8311; check `VITE_API_BASE_URL` |
| SMS not sending | Verify Twilio credentials; on Trial accounts, verify recipient numbers in Twilio Console |
| Duplicate candidates not appearing | Run `psql "$DATABASE_URL" -f db_service/migrations/add_duplicate_candidates.sql` |

---

## ML Model Notes

- **Category classifier** must be trained before first run (`nlp_service/train/main.py`)
- **Whisper, RoBERTa, BERT-NER** are downloaded automatically from HuggingFace Hub on first startup (~1–2 GB total); cached in `~/.cache/huggingface/`
- **spaCy** model downloaded via `python -m spacy download en_core_web_md`
- All models are loaded once at startup and held in `app.state`; first startup takes 2–5 minutes

---

## License

For academic and demonstration purposes. All credentials in `.env` must be replaced with your own before deployment.
