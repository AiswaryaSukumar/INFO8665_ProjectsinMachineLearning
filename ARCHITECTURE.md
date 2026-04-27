# INSIGHT-311 — System Architecture
**Last updated: 2026-04-27**

---

## 1. System Overview

INSIGHT-311 is an AI-powered municipal 311 call-center assistant. Citizens report city issues (potholes, graffiti, sidewalk snow, etc.) via a browser-based voice assistant (ISA) or a web form. The system transcribes speech, extracts structured data via an NLU pipeline, creates a service ticket, and routes it to the appropriate city department. Operators and supervisors manage tickets through a full-featured React web dashboard.

```
┌──────────────────────────────────────────────────────────────┐
│                         CITIZEN                               │
│         Speaks / types to ISA voice assistant                 │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP (WebSpeech API STT + fetch)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│               FastAPI Backend  (port 8311)                    │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ orchestrator │  │ticket_service│  │   nlp_service      │   │
│  │ test_router  │  │CRUD + approve│  │ NLU pipeline       │   │
│  │ /api/test/*  │  │ reject/esc.  │  │ DistilBERT / NER   │   │
│  └──────┬──────┘  └──────┬───────┘  └────────────────────┘   │
│         │                │ SMS trigger                         │
│         │                ▼                                     │
│         │    ┌──────────────────────┐                         │
│         │    │  status_tracking_RAG │                         │
│         │    │  Llama 3.1 + Twilio  │                         │
│         │    └──────────────────────┘                         │
│         │                                                      │
│         │         ┌──────────────────────────┐                │
│         └────────▶│  db_service              │                │
│                   │  SQLAlchemy + Neon PG     │                │
│                   └──────────────────────────┘                │
│                                                               │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │ map_service│  │  duplicates │  │     monitoring         │  │
│  │ /api/map/* │  │ /api/dup.*  │  │  /api/monitoring/*     │  │
│  └────────────┘  └─────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│            React + Vite Frontend  (port 5173)                 │
│                                                               │
│  Landing → Login → Dashboard                                  │
│  ├── IntakePage (My Work Queue)                               │
│  ├── QueueOverviewPanel (Analytics + KPIs)                    │
│  └── VoiceAssistantModal (ISA)                                │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Call Flow (Turn-by-Turn)

```
1. Citizen opens VoiceAssistantModal → clicks "Start Call"
2. Frontend: measureAmbientNoise (1.5 s) → POST /api/test/start
   └─ Backend creates session_id, returns greeting text
3. Frontend TTS (Web Speech) speaks greeting → auto-starts mic
4. Citizen speaks → WebSpeechRecognition STT → text accumulated
5. Silence (2.5 s) detected → POST /api/test/chat { session_id, text }
   ├─ NLUProcessor.process(text) → intent / category / entities / confidence / sentiment
   ├─ Audio arousal blend (65 % text + 35 % audio)
   ├─ ContextManager.update_context_with_nlu()  ← slot filling
   ├─ RuleEngine.get_next_question()             ← decides next prompt
   └─ Returns { response, state, entities, confidence_scores, ... }
6. Frontend speaks response → auto-restarts mic → repeat from step 4
7. All slots filled → RuleEngine.generate_confirmation()
8. Citizen confirms → Orchestrator._create_ticket() → DB ticket created
                     → find_and_store_duplicates() triggered
9. _finalize_call() → merge WAV + write transcript → DB updated
10. Frontend shows ticket number → call ends
```

---

## 3. Backend Services

### `main.py` — Application Entry Point
- FastAPI app with lifespan startup
- Loads ML models on startup: Whisper (STT), NLUProcessor (DistilBERT + pipelines), RoBERTa sentiment, BERT NER
- Registers all routers under `/api/*`
- CORS open for development; port **8311**

### `orchestrator/test_router.py` — Web UI Call Router (`/api/test/*`)
- `POST /api/test/start` — create session, return greeting
- `POST /api/test/chat` — process one turn: NLU → orchestrator → response
- `POST /api/test/calibrate` — store ambient noise threshold per session
- `POST /api/test/upload-audio` — receive per-turn WebM audio → convert to WAV
- `GET  /api/test/ui` — legacy HTML test UI

### `orchestrator/main.py` — Conversation State Machine
**Core classes:**
| Class | Role |
|-------|------|
| `ConversationContext` | Session state, extracted entities, confidence, peak sentiment |
| `ContextManager` | Load/save context to DB; `update_context_with_nlu()` slot filling |
| `RuleEngine` | `get_next_question()`, confirmation summary |
| `Orchestrator` | `initialize_session`, `process_turn`, `_create_ticket`, duplicate trigger |

**Slot filling:**
- Mandatory: `issue_type`, `location`, `caller_name`, `phone_number`
- Turn 1: all non-empty slots accepted
- Turn 2+: `_should_update_slot()` gate — HIGH_CONF ≥ 0.85; explicit phrases lower to 0.70
- Location clarification threshold: 0.75 (street number required)

### `nlp_service/` — NLU Pipeline

| File | Role |
|------|------|
| `main.py` | `NLUProcessor` factory; `process(text)` → unified NLU dict |
| `model/nlu_processor.py` | Pipeline orchestrator |
| `model/entity_extractor.py` | Regex + spaCy hybrid; location priority tiers |
| `model/sentiment_analyzer.py` | RoBERTa + VADER fallback; urgency detection |
| `model/confidence_calculator.py` | Per-field confidence aggregation |
| `model/models/ml_sentiment_model.py` | `j-hartmann/emotion-english-distilroberta-base` |
| `model/models/category_classifier_ml.py` | Fine-tuned DistilBERT |
| `model/models/ner_confidence_model.py` | `dslim/bert-base-NER` |
| `model/models/location_calibrator.py` | Custom MLP location confidence |
| `model/models/audio_sentiment.py` | Librosa audio arousal analysis |

**Location extraction priority tiers (`entity_extractor.py`):**
- **Priority 1** — Standard civic address: `\d+ Street Name (Direction)`
- **Priority 2** — Intersection: `Street Name & Street Name`
- **Priority 3** — Named location with optional trailing number and direction:
  ```
  (?:on|at|in|near|along)\s+(Name Road_Suffix(?:\s+\d+)?\s+(?:North|South|...))
  ```
  The `(?:\s+\d+)?` group handles non-standard civic addresses like "Queen Street 130 North" where the house/building number appears after the street suffix rather than before it.

### `ticket_service/main.py` — Ticket CRUD API (`/api/tickets/*`)
| Endpoint | Action |
|----------|--------|
| `GET /` | List all tickets |
| `GET /{id}` | Get single ticket |
| `PUT /{id}` | Update ticket fields; triggers duplicate re-scan on key field changes |
| `POST /{id}/approve` | Approve → SMS notification |
| `POST /{id}/reject` | Reject → SMS notification |
| `POST /{id}/escalate` | Escalate → SMS notification |
| `POST /{id}/resolve` | Mark resolved |
| `GET /{id}/recording` | Stream call WAV |
| `POST /` | Create ticket manually; triggers duplicate scan |

### `ticket_service/duplicate_detection.py` — Fuzzy Duplicate Matching
- `find_and_store_duplicates(db, ticket_id)` — called on every ticket create/update
- Scoring weights: **category 25% + location 45% + text 20% + time 10%**
- Uses `rapidfuzz.fuzz.token_set_ratio` for string similarity
- Saves results to `duplicate_candidates` table; deduplicates via unique constraint

**Location scoring (`_location_score`) — three-layer logic:**
1. Abbreviation normalization (`st` → `street`, `ave` → `avenue`, etc.)
2. **Cardinal direction check:** if both addresses contain a direction token (`north`/`south`/`east`/`west`) but they differ → score immediately capped at **10.0**, eliminating the pair regardless of string similarity
3. **Street number numeric distance:** if both addresses have a leading civic number:
   - diff > 50 → cap score at **35.0**
   - diff > 20 → cap score at **60.0**
4. Base score: `fuzz.token_set_ratio(normalized_left, normalized_right)`

**Filtering pipeline before scoring:**
- Candidate must be within 14-day lookback window
- Category score must be ≥ 70 to proceed
- Either location ≥ 70 OR text ≥ 80 required
- Final match score must be ≥ 60.0 (`MATCH_THRESHOLD`) to be saved

**`DuplicateCandidate` field semantics:**
- `ticket_id` = the duplicate/redundant ticket (the newer report)
- `candidate_ticket_id` = the parent/primary ticket

### `ticket_service/duplicates.py` — Duplicate Review API (`/api/duplicates/*`)
| Endpoint | Action |
|----------|--------|
| `GET /` | List duplicate candidates (excludes dismissed) |
| `POST /{id}/merge` | Mark pair as merged; duplicate ticket inherits parent's current `ticket_status` |
| `POST /{id}/dismiss` | Dismiss false-positive flag |

**Merge behavior:** The duplicate ticket (identified by `ticket_id`) is updated with the parent's current `ticket_status` at merge time — not hardcoded to `RESOLVED`. It also receives `routing_status = "MERGED"` and `workflow_stage = "MERGED_DUPLICATE"`.

**Status propagation (`ticket_service/main.py → _propagate_status_to_merged_duplicates`):**
Every status-changing endpoint (approve, reject, resolve, escalate, update) also propagates the new status to any tickets that were previously merged as duplicates of the changed ticket:
```python
def _propagate_status_to_merged_duplicates(ticket_repo, parent_ticket_id, new_status, db):
    merged = db.query(DuplicateCandidate).filter(
        DuplicateCandidate.candidate_ticket_id == parent_ticket_id,
        DuplicateCandidate.status == "MERGED",
    ).all()
    for candidate in merged:
        ticket_repo.update_ticket_fields(candidate.ticket_id, {"ticket_status": new_status})
```

### `ticket_service/monitoring.py` — ML Monitoring (`/api/monitoring/*`)
- `GET /flagged` — tickets with NEEDS_ATTENTION sentiment flag
- `GET /alerts` — tickets with LOW_CONFIDENCE alert
- `GET /dashboard` — aggregate stats (last N hours)
- `POST /{id}/acknowledge` — clear a flag

### `map_service/main.py` — Complaint Heatmap (`/api/map/*`)
- Returns ticket location data for geographic heatmap rendering
- Supports filtering by date range and category
- Used by `MapPanel` component in QueueOverviewPanel

### `status_tracking_RAG/` — Citizen SMS Notification Service
- Triggered by `ticket_service` when a ticket is approved, rejected, or escalated
- `rag_agent.py` — generates citizen-friendly SMS (≤ 280 chars) via Llama 3.1 (HuggingFace Inference API); static template fallback
- `sms_service.py` — E.164 normalization + Twilio REST send
- Graceful degradation: if `twilio` / `huggingface-hub` not installed, silently skipped

### `db_service/main.py` — Database Layer
- SQLAlchemy ORM targeting **Neon PostgreSQL** (via `DATABASE_URL`)
- Repositories: `SessionRepository`, `TicketRepository`
- `db_service/migrations/` — raw SQL migration scripts

**Ticket ID generation (`generate_ticket_id`):**
Uses `MAX` of existing IDs (not `COUNT`) to avoid `UniqueViolation` after ticket deletions. Format: `311-{YEAR}-{NNNNNN}` (e.g. `311-2026-000042`).
```python
max_id = db.query(func.max(Ticket.ticket_id)).filter(Ticket.ticket_id.like(f"{prefix}%")).scalar()
```

---

## 4. Database Schema

```
sessions
├── session_id (PK)
├── channel ("web" | "voice")
├── current_state  (ConversationState enum)
├── context_data   (JSON — full ConversationContext)
└── created_at

tickets
├── ticket_id (PK)   e.g. "311-2026-000067"
├── ticket_status    NEW | NEEDS_REVIEW | ESCALATED | RESOLVED | DELETED | REJECTED
├── routing_status   PENDING_APPROVAL | APPROVED | REJECTED | ESCALATED
├── category, location, caller_name, phone_number
├── description, notes, transcript
├── recording_url
├── confidence_scores (JSON), confidence  HIGH | MEDIUM | LOW
├── sentiment_score (0–1), sentiment_label, tone, tone_confidence
├── priority, department, assigned_department
├── created_by_type / name / role
├── handled_by_type / name / role
├── rejected_reason, deleted_reason
└── created_at / updated_at

duplicate_candidates
├── duplicate_id (PK)
├── ticket_id, candidate_ticket_id  (UNIQUE together)
├── match_score, category_score, location_score, text_score, time_score
├── reason_codes (JSON)
├── status         PENDING | MERGED | DISMISSED
├── reviewed_by, reviewed_at
└── created_at / updated_at

recordings
├── recording_id (PK)
├── session_id, ticket_id
└── merged_audio_path

recording_turns
├── id (PK, auto)
├── recording_id, session_id, turn
├── transcript, stt_audio_file_path, tts_question
└── (timestamps)
```

---

## 5. Frontend Pages & Components

### Pages (`src/pages/`)
| File | Role |
|------|------|
| `LandingPage.jsx` | Public landing — ISA demo entry, login/status links |
| `LoginPage.jsx` | Operator/supervisor login; default user: Nagavalli (SUPERVISOR) |
| `DashboardLayout.jsx` | Top nav shell, language toggle (EN/FR), a11y controls |
| `IntakePage.jsx` | **Main operator dashboard** — My Work Queue ticket table, lane filters, VoiceAssistantModal trigger |
| `QueueOverviewPanel.jsx` | **Analytics dashboard** — KPI cards + 6 analytics panels + map |
| `TicketDetailsPage.jsx` | Full-page ticket detail |
| `StatusLookupPage.jsx` | Public ticket status lookup |
| `PublicLookupPage.jsx` | Public ticket lookup with localStorage fallback |
| `PublicRequestPage.jsx` | Public ticket submission form |

### QueueOverviewPanel Sections
| Section | Description |
|---------|-------------|
| KPI Row | Total / Needs Review / Escalated / Active / Overdue / Resolved count cards |
| Ticket Sources | Voice Bot vs. Human breakdown + Voice Bot Accuracy |
| Tickets by Category | Bar chart with month filter |
| Needs Review | Scrollable list of LOW confidence / NEEDS_REVIEW tickets |
| Ticket Volume Trends | Bar chart (Today / Week / Month) with peak/avg stats |
| Duplicate Ticket Detection | Pending/Merged pairs; click "Need Action" to filter; Merge/Dismiss actions; merge button disabled with "Merging…" label during in-flight request to prevent double-submission |
| SLA Tracking | Overdue / Due <24h / On Track — clickable filter |
| False Report Penalties | Operator false-report scores |
| Complaint Heatmap | Geographic heatmap of ticket locations |

### Key Components (`src/components/`)
| File | Role |
|------|------|
| `VoiceAssistantModal.jsx` | ISA voice chat — Citizen mode (clean) + Dev mode (confidence/sentiment) |
| `TicketDetailsDrawer.jsx` | Slide-in drawer — full ticket detail, approve/reject/edit, audio player, transcript |
| `TicketTable.jsx` | Responsive ticket table; percentage-based column widths; font scales with zoom |
| `StatusBadge.jsx` | Status chip; multi-word statuses (NEEDS_REVIEW) render on 2 lines |
| `ToneBadge.jsx` | Emoji + label; label shrinks with zoom via `min(10px, 0.65vw)`; hides at viewport < 900px |
| `ConfidenceBadge.jsx` | HIGH / MEDIUM / LOW badge; `white-space: nowrap`; font shrinks with zoom |

---

## 6. ML Models Summary

| Model | Library | Purpose |
|-------|---------|---------|
| Fine-tuned DistilBERT | transformers | Issue category classification |
| `j-hartmann/emotion-english-distilroberta-base` | transformers | 7-class emotion → sentiment/urgency |
| `dslim/bert-base-NER` | transformers | NER confidence scoring |
| spaCy `en_core_web_md` | spacy | Entity recognition |
| Custom MLP | sklearn | Location confidence calibration |
| VADER | vaderSentiment | Sentiment fallback |
| `openai/whisper-small` | whisper | STT (hardware/direct path) |
| Llama 3.1 (HF Inference API) | huggingface_hub | Citizen SMS generation |

---

## 7. Key Configuration

| Setting | Value |
|---------|-------|
| Backend port | `8311` |
| Frontend dev port | `5173` (Vite) |
| Database | Neon PostgreSQL (`DATABASE_URL` in `.env`) |
| Audio temp | `stt_service/data/audio_samples/` |
| Recordings | `stt_service/data/call_recordings/` |
| Transcripts | `stt_service/data/call_transcripts/` |
| API base (frontend) | `VITE_API_BASE_URL` env var → default `http://127.0.0.1:8311/api` |
| Location confidence threshold | `0.75` |
| Urgency HIGH threshold | `ml_negative ≥ 0.55` |
| Duplicate score threshold | `≥ 0.60` to surface; `≥ 0.80` for Merge suggestion |
| Duplicate display window | Only pairs where both tickets were created within **2 days** of each other are shown in the UI (`QueueOverviewPanel`) |

---

## 8. API Router Summary

| Prefix | Module | Tags |
|--------|--------|------|
| `/api/test/*` | `orchestrator/test_router.py` | Test UI |
| `/api/orchestrator/*` | `orchestrator/main.py` | Orchestrator |
| `/api/voice/*` | `orchestrator/main.py` | Voice ML Processing |
| `/api/tickets/*` | `ticket_service/main.py` | Tickets |
| `/api/duplicates/*` | `ticket_service/duplicates.py` | Duplicates |
| `/api/monitoring/*` | `ticket_service/monitoring.py` | Monitoring |
| `/api/map/*` | `map_service/main.py` | Map / Heatmap |

Interactive docs: `http://localhost:8311/docs`
