# INSIGHT-311 System Architecture
**Last updated: 2026-04-09 (status_tracking_RAG SMS integration, location confidence threshold)**

---

## 1. System Overview

INSIGHT-311 is an AI-powered municipal 311 call-center assistant. Citizens report city issues (potholes, graffiti, litter, etc.) via voice or text. The system transcribes speech, extracts structured data, creates a service ticket, and routes it to the appropriate city department. Operators and supervisors review, approve, reject, or escalate tickets through a web dashboard.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CITIZEN                                   │
│          Speaks / types to ISA voice assistant                   │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP (WebSpeech API STT + fetch)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              FastAPI Backend  (port 8311)                        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │ orchestrator  │  │ orchestrator │  │   ticket_service    │    │
│  │ /test_router  │  │   /main.py   │  │   /api/tickets/*    │    │
│  │ /api/test/*   │  │ /api/orch/*  │  │ approve/reject/     │    │
│  └──────┬───────┘  └──────┬───────┘  │ escalate → SMS ↓    │    │
│         │                 │           └──────────┬──────────┘    │
│         │                 │                      │               │
│         │                 │           ┌──────────▼──────────┐    │
│         │                 │           │  status_tracking_RAG (SMS)      │    │
│         │                 │           │  rag_agent (LLM msg) │    │
│         │                 │           │  sms_service (Twilio)│    │
│         │                 │           └──────────────────────┘    │
│         │                 │                       │              │
│         ▼                 ▼                                      │
│  ┌──────────────────────────────────┐                            │
│  │       nlp_service (NLU)          │                            │
│  │  Intent → Category → Entities    │             │              │
│  │  Confidence → Sentiment → Tone   │                            │
│  └──────────────────────────────────┘                            │
│                                                                  │
│                              ┌─────────────────────────────┐     │
│                              │     db_service (SQLite)      │    │
│                              │  sessions / tickets /        │    │
│                              │  recordings / tts_results    │    │
│                              └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│           React Frontend  (Vite dev server / build)              │
│                                                                  │
│  Landing → Login → Dashboard (IntakePage)                        │
│  TicketDetailsDrawer / VoiceAssistantModal (ISA)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Call Flow (Turn-by-Turn)

```
1. User opens VoiceAssistantModal → clicks "Start Call"
2. Frontend: measureAmbientNoise (1.5s) → POST /api/test/start
   └─ Backend creates session_id, returns greeting text
3. Frontend TTS (Web Speech) speaks greeting → auto-starts mic
4. User speaks → WebSpeechRecognition STT → finalAccumRef accumulates
5. Silence detected (2.5s) → POST /api/test/chat { session_id, text }
   ├─ NLUProcessor.process(text) → intent / entities / confidence / sentiment
   ├─ Audio arousal blend (65% text + 35% audio)
   ├─ ContextManager.update_context_with_nlu()  ← slot filling
   ├─ RuleEngine.get_next_question()             ← decides next prompt
   └─ Returns { response, state, entities, confidence_scores,
                ml_negative, sentiment_label, urgency_level, ... }
6. Frontend speaks response → auto-restarts mic → repeat from step 4
7. When all slots filled → RuleEngine.generate_confirmation()
8. User says "Yes" → Orchestrator._create_ticket() → DB ticket created
9. _finalize_call() → merge audio WAV + write transcript → DB updated
10. Frontend shows ticket number → call ends
```

---

## 3. Backend Files

### `main.py` — Application Entry Point
- FastAPI app with lifespan startup
- Loads ML models on startup: Whisper (STT), NLUProcessor (DistilBERT + pipelines), RoBERTa sentiment, BERT NER
- Registers all routers under `/api/*`
- CORS middleware (allows all origins for dev)
- Port: **8311**

### `orchestrator/test_router.py` — Primary Web UI Call Router
- Handles all calls initiated from `VoiceAssistantModal` (React)
- `POST /api/test/start` — create session, return greeting
- `POST /api/test/chat` — process one turn: NLU → orchestrator → response
  - Returns: `response`, `state`, `entities`, `confidence_scores`, `ml_negative`, `sentiment_label`, `urgency_level`, `severity_score`
- `POST /api/test/calibrate` — store ambient noise threshold per session
- `POST /api/test/upload-audio` — receive per-turn WebM audio, convert to WAV, store for merge
- `GET /api/test/ui` — legacy HTML test UI (browser-only, no React)
- In-memory stores: `_SESSION_DIALOGUE`, `_SESSION_AUDIO_FEATURES`

### `orchestrator/main.py` — Conversation State Machine
**Core classes:**
- `ConversationContext` — holds session state, extracted entities, confidence scores, peak sentiment
- `ContextManager` — loads/saves context to DB; `update_context_with_nlu()` fills slots with confidence gating (`_should_update_slot`)
- `RuleEngine` — decides next question (`get_next_question`), generates confirmation summary
- `Orchestrator` — main engine: `initialize_session`, `process_turn`, `_create_ticket`, `_detect_meta_intent`

**Slot filling logic:**
- Mandatory slots: `issue_type`, `location`, `caller_name`, `phone_number`
- Optional: `severity`, `raw_issue_text`
- Turn 1: all non-empty slots accepted
- Turn 2+: `_should_update_slot()` — HIGH_CONF (0.85) gate; explicit phrases lower threshold to 0.70

**Location clarification threshold (`CONFIDENCE_THRESHOLDS`):**
- `LOCATION_CLARIFICATION = 0.75` — location without a street number scores ~0.65 → bot re-asks
- `CLARIFICATION = 0.5` — used for all other fields (name, phone)
- "King Street North" (0.65) → re-asks; "345 King Street North" (0.85) → passes

**Call finalization (`_finalize_call`):**
- Merges per-turn WAV files into one recording
- Writes TXT + JSON transcript
- Updates `tickets.recording_url` and inserts into `recordings` table

**API endpoints:**
- `POST /api/orchestrator/initialize`
- `POST /api/orchestrator/process`
- `GET /api/orchestrator/session/{session_id}`
- `POST /api/voice/synthesize` — TTS via pyttsx3
- `POST /api/voice/process_audio` — Whisper transcription (direct audio upload path)

### `nlp_service/main.py` — NLUProcessor Factory
- `NLUProcessor` class: initializes all sub-models on construction
- `process(text, session_id)` → unified NLU output dict
- Output: `intent`, `category`, `entities`, `confidence_scores`, `ml_negative`, `sentiment_label`, `urgency_level`, `urgency_score`, `severity_score`

### `nlp_service/model/nlu_processor.py` — NLU Pipeline Core
- Orchestrates: category classification → entity extraction → confidence calculation → sentiment analysis
- `_decide_next_slot()` — purely value-presence based (no confidence threshold)
- `_should_update_slot()` — dual-threshold update gate for Turn 2+ opportunistic slot fills

### `nlp_service/model/entity_extractor.py` — Named Entity Extraction
- Rule-based regex + spaCy NER hybrid
- Extracts: `location`, `caller_name`, `phone_number`, `issue_type`
- Location priority: P1(numbered+direction) > P1(numbered) > spaCy > P3(no-number+direction) > P4(no-number) > P5(vague)
- `_road_suffix` with `\b` word boundaries
- `BAD_NAME_TOKENS` / `BAD_NAME_ADJECTIVES` filtering
- PHONETIC_MAP: STT correction ("letter" → "litter")

### `nlp_service/model/sentiment_analyzer.py` — Sentiment & Urgency
- Primary: `MLSentimentModel` (RoBERTa emotion)
- Fallback: VADER
- `detect_urgency()` → maps ml_negative to urgency level
- `analyze()` → returns full sentiment + urgency dict

### `nlp_service/model/models/ml_sentiment_model.py` — Emotion Model
- Model: `j-hartmann/emotion-english-distilroberta-base` (7 emotions)
- Composite `ml_neg = anger×1.0 + disgust×0.6 + fear×0.4 + sadness×0.3`
- `civic_frustration_boost()` — additive boost for polite-but-persistent patterns
- `negative_score_to_urgency()` — thresholds: critical≥0.85, high≥0.55, medium≥0.30

### `nlp_service/model/models/audio_sentiment.py` — Audio Arousal Analysis
- Analyzes raw WAV for vocal energy (arousal) via librosa
- Used in `orchestrator/test_router.py` to blend with text sentiment (35% audio weight)

### `nlp_service/model/models/location_calibrator.py` — Location Confidence
- MLP classifier for location confidence scoring
- Feature vector includes: has_number, has_street_keyword, has_road_name, has_gpe_entity, etc.
- Floor applied: `max(score, 0.65)` when `has_road_name=1 AND has_gpe_entity=1`

### `nlp_service/model/models/category_classifier_ml.py` — Category Classification
- Fine-tuned DistilBERT classifier
- Trained on civic complaint categories (pothole, graffiti, litter, etc.)
- Saved model: `nlp_service/ml_models/saved_models/category_classifier/`

### `nlp_service/model/models/ner_confidence_model.py` — NER Confidence
- BERT-based NER confidence scorer (`dslim/bert-base-NER`)
- Per-entity confidence scoring used in `confidence_calculator.py`

### `nlp_service/model/confidence_calculator.py` — Confidence Aggregation
- Combines per-field confidence signals into `confidence_scores` dict
- Fields: `location`, `caller_name`, `phone_number`, `issue_type`, `overall`

### `nlp_service/model/utils.py` — Shared Utilities
- `normalize_location()` — expands cardinal abbreviations (E→East, NE→Northeast, etc.)
- `get_urgency_keywords()` — keyword lists for fallback urgency detection
- `clean_text()`, `tokenize()`, other NLP helpers

### `stt_service/main.py` — Speech-to-Text (Hardware/Direct Path)
- Whisper-based transcription for direct audio upload (non-browser path)
- `PHONETIC_MAP` — STT correction dictionary
- `apply_phonetic_correction()` — post-processing
- `measure_ambient_noise()`, `record_audio()` — microphone capture utilities
- **Note:** Browser calls use WebSpeechRecognition (client-side), not this module

### `tts_service/main.py` — Text-to-Speech
- `speak(text)` via pyttsx3 (system TTS engine)
- Used by the hardware/direct call path
- **Note:** Browser calls use Web Speech API (`window.speechSynthesis`), not this module

### `ticket_service/main.py` — Ticket CRUD API
- `GET /api/tickets/` — list all tickets
- `GET /api/tickets/{id}` — get single ticket
- `PUT /api/tickets/{id}` — update ticket
- `POST /api/tickets/{id}/approve` — supervisor approve → triggers SMS notification
- `POST /api/tickets/{id}/reject` — supervisor reject (with optional reason) → triggers SMS notification
- `POST /api/tickets/{id}/resolve` — mark resolved
- `POST /api/tickets/{id}/escalate` — escalate → triggers SMS notification
- `GET /api/tickets/{id}/recording` — **stream WAV audio** (fallback: tickets.recording_url → recordings.merged_audio_path)
- SMS helper: `_notify_citizen_sms()` — calls status_tracking_RAG directly; silently skips if status_tracking_RAG not installed or phone number absent

### `status_tracking_RAG/` — Citizen SMS Notification Service
- Integrated directly into `ticket_service` (no separate server required)
- Triggered when a ticket is approved, rejected, or escalated
- **`status_tracking_RAG/config.py`** — loads Twilio & HuggingFace credentials from `.env`; `NOTIFY_ON_STATUSES = {APPROVED, REJECTED, ESCALATED}`
- **`status_tracking_RAG/rag_agent.py`** — `generate_sms_message(ctx)`: calls Llama 3.1 via HuggingFace Inference API to write a citizen-friendly SMS (≤280 chars); falls back to static templates if LLM fails
- **`status_tracking_RAG/sms_service.py`** — `send_sms(to, msg)`: normalizes phone to E.164, sends via Twilio REST API
- **`status_tracking_RAG/main.py`** — Sequin CDC webhook server (not used here; kept for standalone deployment option)
- **Required `.env` keys:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `HF_API_TOKEN`
- **Graceful degradation:** if `twilio` or `huggingface-hub` are not installed, imports fail silently and SMS is skipped

### `ticket_service/monitoring.py` — ML Monitoring API
- `GET /api/monitoring/flagged` — tickets with NEEDS_ATTENTION sentiment flag
- `GET /api/monitoring/alerts` — tickets with LOW_CONFIDENCE alert
- `GET /api/monitoring/dashboard` — aggregate stats (last N hours)
- `POST /api/monitoring/{id}/acknowledge` — clear a flag

### `db_service/main.py` — Database Layer (SQLAlchemy / SQLite)
**Tables:**
| Table | Purpose |
|-------|---------|
| `sessions` | Conversation state per session_id |
| `tickets` | Service tickets (all fields) |
| `recordings` | Merged call WAV paths per session |
| `recording_turns` | Per-turn WAV + transcript |
| `tts_results` | TTS audio cache (legacy) |

**Repositories:** `SessionRepository`, `TicketRepository`

**Key ticket fields:** `ticket_id`, `ticket_status`, `routing_status`, `workflow_stage`, `category`, `location`, `caller_name`, `phone_number`, `transcript`, `recording_url`, `confidence_scores`, `sentiment_score`, `tone`, `priority`

---

## 4. Frontend Files

### Entry & Routing
| File | Role |
|------|------|
| `src/main.jsx` | React root mount |
| `src/App.jsx` | React Router routes — maps URL paths to page components |

**Routes:**
- `/` → `LandingPage`
- `/login` → `LoginPage`
- `/status` → `CitizenStatusPage`
- `/lookup` → `PublicLookupPage`
- `/request` → `PublicRequestPage`
- `/dashboard/*` → `DashboardLayout` (requires auth via `RequireAuth`)

### Pages
| File | Role |
|------|------|
| `LandingPage.jsx` | Public landing — ISA demo entry, links to login/status |
| `LoginPage.jsx` | Operator/supervisor login |
| `DashboardLayout.jsx` | Sidebar nav shell wrapping all dashboard views |
| `IntakePage.jsx` | **Main operator dashboard** — ticket queue, lane filters, ticket table, VoiceAssistantModal trigger |
| `QueueOverviewPanel.jsx` | Summary KPI cards + donut charts (active/escalated/resolved counts) |
| `TicketDetailsPage.jsx` | Full-page ticket detail (standalone route) |
| `CitizenStatusPage.jsx` | Public ticket status lookup (wraps StatusLookupPage) |
| `StatusLookupPage.jsx` | Ticket lookup by number — shows status to citizen |
| `PublicLookupPage.jsx` | Public ticket lookup with local ticketStore fallback |
| `PublicRequestPage.jsx` | Public ticket submission form |
| `DuplicatesPage.jsx` | Duplicate ticket detection view (stub/unused) |

### Components
| File | Role |
|------|------|
| `VoiceAssistantModal.jsx` | **ISA voice chat modal** — citizen mode (clean bubbles) + dev mode (dark theme + per-turn confidence/sentiment cards) |
| `TicketDetailsDrawer.jsx` | Slide-in drawer with full ticket detail, approve/reject/edit actions, transcript bubble view, audio player |
| `TicketTable.jsx` | Sortable/filterable ticket list table |
| `TicketTableControls.jsx` | Lane filter buttons (New/Approval/Rejected/Mine/etc.) + search bar + chip filters |
| `TicketForm.jsx` | Manual ticket creation/edit form |
| `TicketViewDropdown.jsx` | Switcher: Recent / History / Deleted / Reports |
| `TicketReportsPanel.jsx` | Analytics charts and date-range reporting |
| `TicketStatusOverview.jsx` | Status summary widget |
| `SessionHistory.jsx` | Renders [ISA]/[CALLER] dialogue turns in transcript |
| `HeaderBar.jsx` | Top navigation bar |
| `RequireAuth.jsx` | Auth guard — redirects to login if no session |
| `ToneBadge.jsx` | Colored badge for caller tone (CALM / AGITATED / ANGRY) |
| `ConfidenceBadge.jsx` | Badge for ML confidence level (HIGH / MEDIUM / LOW) |
| `StatusBadge.jsx` | Ticket status chip |
| `DonutChart.jsx` | SVG donut chart for KPI panels |
| `Toast.jsx` | Notification toast system |
| `Floating311Button.jsx` | Floating "Talk to ISA" button shown on dashboard |
| `AudioLevelMeter.jsx` | Visual mic level meter (used by VoiceIntakePanel) |
| `VoiceIntakePanel.jsx` | Alternative voice intake panel (older, not used in main flow) |
| `PublicHeader.jsx` / `PublicFooter.jsx` | Shared header/footer for public pages |
| `FiltersBar.jsx` | Generic filter bar component (not currently wired) |

### API Layer
| File | Role |
|------|------|
| `api/client.js` | `apiFetch` wrapper — base URL config + error handling |
| `api/tickets.js` | All ticket CRUD calls; `normalizeTicket()` maps snake_case→camelCase |
| `api/voiceAssistant.js` | Voice session API calls (initialize, processAudio, synthesize) — used by direct audio path, not VoiceAssistantModal |

### Utils
| File | Role |
|------|------|
| `utils/categoryRouting.js` | `inferDepartmentFromCategory()` — maps issue category to city department |
| `utils/ticketWorkflow.js` | Ticket status predicates (`isRejectedTicket`, `isApprovedTicket`, etc.) |
| `utils/ticketStore.js` | In-memory localStorage-backed ticket store (used by PublicLookupPage) |
| `utils/routing.js` | `decideHandoffTarget()` — determines routing target for escalations |
| `utils/ticketNumber.js` | Ticket number generation/formatting utilities |

### Data
| File | Role |
|------|------|
| `data/operators.js` | Static list of operator names for round-robin assignment |
| `mock/mockTickets.js` | Mock ticket data (development only, not used in production flow) |

---

## 5. Database Schema (SQLite)

```
sessions
├── session_id (PK)
├── channel ("web" | "voice")
├── language
├── caller_number
├── current_state (ConversationState enum)
├── context_data (JSON — full ConversationContext)
└── created_at

tickets
├── ticket_id (PK)  e.g. "311-2026-000067"
├── ticket_status   NEW | NEEDS_REVIEW | ESCALATED | RESOLVED | DELETE | REJECTED
├── routing_status  PENDING_APPROVAL | APPROVED | REJECTED | ESCALATED
├── workflow_stage  PENDING_APPROVAL | COMPLETED | REJECTED_BY_SUPERVISOR | ...
├── category, location, caller_name (full_name), phone_number
├── transcript (full dialogue text)
├── recording_url (server file path to merged WAV)
├── confidence_scores (JSON), confidence_alert, alerted_fields
├── sentiment_score (ml_negative 0-1), sentiment_label, sentiment_flag
├── tone, tone_confidence, tone_source
├── priority, escalation, department_status
├── created_by_type / name / role
├── handled_by_type / name / role
├── rejected_reason, deleted_reason
└── created_at

recordings
├── recording_id (PK)  "REC-{session_id}_{timestamp}"
├── session_id, ticket_id
└── merged_audio_path

recording_turns
├── id (PK, auto)
├── recording_id, session_id, turn
├── transcript (caller text for this turn)
├── stt_audio_file_path
└── tts_question (system prompt for this turn)

tts_results (legacy)
├── id (PK), session_id, turn
├── text, audio_path
└── created_at
```

---

## 6. ML Models Summary

| Model | Library | Purpose |
|-------|---------|---------|
| `openai/whisper-small` | whisper | Speech-to-text (direct audio path) |
| Fine-tuned DistilBERT | transformers | Issue category classification |
| `j-hartmann/emotion-english-distilroberta-base` | transformers | 7-class emotion → sentiment/urgency |
| `dslim/bert-base-NER` | transformers | NER confidence scoring |
| spaCy `en_core_web_sm` | spacy | Entity recognition (location, names) |
| VADER | vaderSentiment | Sentiment fallback |
| Custom MLP | sklearn/numpy | Location confidence calibration |

---

## 7. Key Configuration

| Setting | Value |
|---------|-------|
| Backend port | `8311` |
| Frontend dev port | `5173` (Vite) |
| DB file | `stt_service/data/insight311.db` (SQLite) |
| Audio temp dir | `stt_service/data/audio_samples/` |
| Recordings dir | `stt_service/data/call_recordings/` |
| Transcripts dir | `stt_service/data/call_transcripts/` |
| API base (frontend) | `VITE_API_BASE_URL` env var, default `http://127.0.0.1:8311/api` |

---

## 8. Unused / Potentially Removable Files

> **Do NOT delete without review.** Listed here for cleanup consideration only.

| File | Reason |
|------|--------|
| `ui/voice_ui/app.js` | Legacy browser-only voice UI, superseded by VoiceAssistantModal |
| `ui/voice_ui/start_ui.py` | Serves the legacy voice_ui; no longer needed with React frontend |
| `tts_service/main.py` | pyttsx3 TTS used only in hardware call path; browser uses Web Speech API |
| `stt_service/main.py` (partial) | `record_audio()`, `measure_ambient_noise()` functions unused in browser flow |
| `components/VoiceIntakePanel.jsx` | Older voice panel; not imported in any current page |
| `components/AudioLevelMeter.jsx` | Only used by VoiceIntakePanel (which is unused) |
| `components/FiltersBar.jsx` | Defined but not imported anywhere in current pages |
| `pages/DuplicatesPage.jsx` | Stub page; not registered in App.jsx routes |
| `mock/mockTickets.js` | Mock data; not imported in production code paths |
| `nlp_service/test/main.py` | Model test script; dev-only, not part of runtime |
| `nlp_service/test/test_pipeline.py` | NLU pipeline integration test; dev-only, not part of runtime |
| `nlp_service/train/main.py` | Model training script; dev-only, not part of runtime |
| `nlp_service/train/train_entity_confidence.py` | Training script; dev-only |
| `stt_service/data/call_transcripts/*.json` | Accumulated session data; safe to archive/clear periodically |
| `nlp_service/ml_models/saved_models/.../checkpoint-765/` | Intermediate training checkpoint; final model is in parent dir |
| `nlp_service/ml_models/saved_models/.../checkpoint-3825/` | Intermediate training checkpoint |
| `CODE_ANALYSIS_en.md` | Older architecture doc; superseded by this file |
| `DATA_SCHEMA_AUDIT_en.md` | Older schema doc; superseded by this file |
| `SYSTEM_OVERVIEW_0402.md` | Older overview doc; superseded by this file |
