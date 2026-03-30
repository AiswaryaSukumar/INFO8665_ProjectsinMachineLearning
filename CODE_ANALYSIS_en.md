# Insight-311 System Code Detailed Analysis Document

> Date: 2026-03-20
> Project: `stt_oct_NLU / insight311`
> Purpose: Explain the overall system behavior + provide detailed function-level analysis for each file

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture and Data Flow](#2-architecture-and-data-flow)
3. [Detailed File-by-File Analysis](#3-detailed-file-by-file-analysis)
   - [insight311/main.py](#31-insight311mainpy--application-entry-point)
   - [db_service/main.py](#32-db_servicemainpy--database-layer)
   - [orchestrator/main.py](#33-orchestratormainpy--conversation-state-machine)
   - [ticket_service/main.py](#34-ticket_servicemainpy--ticket-rest-api)
   - [stt_service/main.py](#35-stt_servicemainpy--speech-recognition-service)
   - [tts_service/main.py](#36-tts_servicemainpy--text-to-speech-service)
   - [nlp_service/main.py](#37-nlp_servicemainpy--nlp-service-entry-point)
   - [nlp_service/model/nlu_processor.py](#38-nlp_servicemodelnlu_processorpy--nlu-pipeline)
   - [nlp_service/model/entity_extractor.py](#39-nlp_servicemodelentity_extractorpy--entity-extraction)
   - [nlp_service/model/sentiment_analyzer.py](#310-nlp_servicemodelsentiment_analyzerpy--sentiment-analysis)
   - [nlp_service/model/description_extractor.py](#311-nlp_servicemodeldescription_extractorpy--description-extraction)
   - [nlp_service/model/confidence_calculator.py](#312-nlp_servicemodelconfidence_calculatorpy--confidence-calculation)
   - [nlp_service/model/utils.py](#313-nlp_servicemodelutilspy--utility-functions)
   - [nlp_service/model/models/category_classifier_ml.py](#314-nlp_servicemodelmodelscategory_classifier_mlpy--ml-classifier)
   - [nlp_service/train/main.py](#315-nlp_servicetrainmainpy--model-training)
   - [nlp_service/test/main.py](#316-nlp_servicetestmainpy--model-testing)
   - [ui/voice_ui/start_ui.py](#317-uivoice_uistart_uipy--voice-ui-server)
   - [ui/voice_ui/app.js](#318-uivoice_uiappjs--browser-voice-client)
4. [Conversation State Machine Flowchart](#4-conversation-state-machine-flowchart)
5. [ML Model Configuration Summary](#5-ml-model-configuration-summary)
6. [Known Bugs and Schema Mismatches](#6-known-bugs-and-schema-mismatches)

---

## 1. System Overview

**Insight-311** is an **AI-based 311 service request intake system** that automatically creates a service ticket when a citizen reports an issue by voice through a phone call or web browser.

### Core Features
| Feature | Description |
|------|------|
| Voice input | Microphone recording → convert speech to text with OpenAI Whisper |
| Natural language understanding | DistilBERT (classification) + spaCy (entities) + VADER (sentiment) |
| Dialogue management | Slot-filling-based state machine |
| Voice output | Generate TTS responses with pyttsx3 |
| Ticket creation | Store service tickets in PostgreSQL (Neon) |
| Web UI | Browser-based voice interface + React management UI |

### Service Request Categories (11 types)
`graffiti`, `illegal_sign`, `litter`, `needles`, `parking_complaint`,
`property_standards`, `pothole`, `sidewalk_snow`, `sidewalk_hazard`,
`trail_maintenance`, `other`

---

## 2. Architecture and Data Flow

```
[User speech]
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│  stt_service/main.py                                    │
│  - Microphone recording (sounddevice)                   │
│  - Stop recording via silence detection                 │
│  - Convert speech to text with Whisper                  │
│  - Apply phonetic correction (phonetic map)             │
└──────────────────────┬──────────────────────────────────┘
                       │ transcript (str)
                       ▼
┌─────────────────────────────────────────────────────────┐
│  nlp_service/model/nlu_processor.py  (NLUProcessor)     │
│  ┌─────────────────────────────────────────────────┐    │
│  │ entity_extractor.py  → extract location, name,  │    │
│  │                         and phone number         │    │
│  │ category_classifier_ml.py → DistilBERT category │    │
│  │ sentiment_analyzer.py → VADER sentiment/urgency │    │
│  │ description_extractor.py → refine issue details │    │
│  │ confidence_calculator.py → compute confidence   │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │ NLU result (dict)
                       ▼
┌─────────────────────────────────────────────────────────┐
│  orchestrator/main.py  (Orchestrator + RuleEngine)      │
│  - State machine: INITIALIZING → SLOT_FILLING           │
│               → CLARIFICATION/CONFIRMATION → SUBMITTED  │
│  - ContextManager: merges session memory and NLU result │
│  - RuleEngine: decides the next question                │
│  - Stores ticket in DB once conditions are satisfied    │
└──────────────────────┬──────────────────────────────────┘
                       │ response_text (str)
                       ▼
┌─────────────────────────────────────────────────────────┐
│  tts_service/main.py  (TTSService)                      │
│  - Convert text to speech with pyttsx3                  │
│  - Slow down speech when reading the ticket number      │
└──────────────────────┬──────────────────────────────────┘
                       │ audio
                       ▼
               [Played back to the user]

[Data storage]
  db_service/main.py → PostgreSQL (Neon Cloud)
    - sessions table: tracks session state
    - tickets table: service tickets (ticket_id: 311-YYYY-XXXXXX)
    - recordings table: recording file metadata
```

### Service Ports
| Service | Port |
|--------|------|
| FastAPI backend | 8311 |
| Voice UI (HTTP server) | 8000 |
| Web Agent (Vite) | 5173 (default) |

---

## 3. Detailed File-by-File Analysis

---

### 3.1 `insight311/main.py` — Application Entry Point

**Role**: Creates the FastAPI app instance, initializes ML models, registers routers, and runs the server.

#### Main Components

**`lifespan(app)` — asynchronous context manager**
- Contains initialization code executed at app startup.
- Loads the OpenAI Whisper model (`"small"` size) onto GPU/CPU and stores it in `app.state.whisper_model`.
- Creates an `NLUProcessor` instance and stores it in `app.state.nlu_processor`.
- Cleans up resources when the app shuts down.
- Implemented with the `@asynccontextmanager` decorator.

**CORS middleware**
- Registers `CORSMiddleware` to allow requests from all origins (`*`).
- Configures the cross-origin policy for frontend-browser and backend communication.

**Router mounting**
| Router | Path prefix | Description |
|--------|------------|------|
| orchestrator.router | `/api` | Conversation-processing endpoints |
| ticket_service.router | `/api/tickets` | Ticket CRUD |
| stt_service.router | `/api/voice` | Voice processing |

**Runtime configuration**
- Runs on `0.0.0.0:8311` using `uvicorn`.
- Provides automatically generated Swagger UI at `/docs`.

---

### 3.2 `db_service/main.py` — Database Layer

**Role**: Defines SQLAlchemy ORM models and provides DB CRUD through a Repository pattern.

#### ORM Models

**`Session` model**
```
session_id     : str (PK, UUID)
channel        : str ("voice" | "web")
caller_number  : str | None
current_state  : str (current state of the state machine)
context_data   : JSON (entire conversation context)
created_at     : datetime
updated_at     : datetime
```

**`Ticket` model** (23 columns)
```
id             : int (auto-increment, PK)
ticket_id      : str (format: "311-YYYY-XXXXXX")
category       : str (service request category)
location       : str
description    : str
caller_name    : str
phone_number   : str
severity       : str ("low"/"medium"/"high"/"critical")
ticket_status  : str ("NEW"/"IN_PROGRESS"/"RESOLVED")
routing_status : str
workflow_stage : str
notes          : str
transcript     : str (full conversation transcript)
recording_url  : str
created_at     : datetime
updated_at     : datetime
```

**`TTSResult` model**
- Tracks TTS requests/results by session.
- Stores `session_id`, `text`, `audio_path`, and `created_at`.

**`Recording` model**
- Metadata for call recording files.
- Stores `session_id`, `file_path`, `duration`, and `created_at`.

**`RecordingTurn` model**
- Stores each utterance-level recording within a call.
- Stores `recording_id`, `turn_index`, `transcript`, `audio_path`, and `created_at`.

#### Repository Classes

**`SessionRepository`**

| Method | Parameters | Return | Behavior |
|--------|---------|------|------|
| `create_session()` | channel, caller_number | Session | Inserts a new session into the DB |
| `get_session(session_id)` | str | Session \| None | Looks up a session by ID |
| `update_context(session_id, context)` | str, dict | Session | Overwrites `context_data` JSON |
| `update_state(session_id, state)` | str, str | Session | Updates `current_state` |

**`TicketRepository`**

| Method | Parameters | Return | Behavior |
|--------|---------|------|------|
| `create_ticket(data)` | dict | Ticket | Creates a ticket and auto-generates `ticket_id` |
| `get_ticket(ticket_id)` | str | Ticket \| None | Looks up a ticket by ID |
| `update_ticket(ticket_id, updates)` | str, dict | Ticket | Updates specified fields |
| `list_tickets(filters)` | dict | List[Ticket] | Returns a filtered ticket list |

**Ticket ID generation logic**
```python
# Example: "311-2026-000042"
year = datetime.now().year
count = query number of tickets created this year in the DB + 1
ticket_id = f"311-{year}-{count:06d}"
```

**DB connection**
- Reads `DATABASE_URL` (Neon PostgreSQL) from `.env` and creates a SQLAlchemy engine.
- Builds a DB session factory with `sessionmaker`.
- Uses the `get_db()` generator for FastAPI dependency injection.

---

### 3.3 `orchestrator/main.py` — Conversation State Machine

**Role**: The core logic that manages the conversation with the user. It receives the NLU result, decides the next question, and creates the ticket.

#### Class Structure

**`RuleEngine`**

Responsible for slot-filling order and next-question generation.

| Method | Behavior |
|--------|------|
| `get_next_missing_field(context)` | Returns the highest-priority field that has not yet been collected |
| `generate_question(field, context)` | Generates the question text for the target field |
| `is_slot_filling_complete(context)` | Checks whether all 5 required slots are filled |
| `get_category_department(category)` | Returns the department mapped to the category |
| `get_category_sla(category)` | Returns the category-specific processing deadline (hours) |

**Slot-filling priority**
```
1. category (issue type)
2. location (incident location)
3. caller_name (reporter name)
4. phone_number (contact number)
5. description (detailed description)
```

**`ContextManager`**

Merges session memory with NLU results.

| Method | Behavior |
|--------|------|
| `merge_nlu_result(session_context, nlu_result)` | Overwrites or merges NLU results into existing session data |
| `get_context(session_id)` | Loads session context from the DB |
| `save_context(session_id, context)` | Saves updated context to the DB |
| `initialize_context()` | Returns an empty context dict (all slots initialized to `None`) |

**`Orchestrator`**

The core conversation state machine. Called once per API request.

| Method | Behavior |
|--------|------|
| `process_turn(session_id, transcript, audio_path)` | Handles one utterance: NLU → context merge → state transition → response generation |
| `_handle_initializing(context)` | Returns the first greeting message and transitions to `SLOT_FILLING` |
| `_handle_slot_filling(context, nlu_result)` | Runs the slot-filling loop |
| `_handle_clarification(context, nlu_result)` | Requests reconfirmation for low-confidence fields |
| `_handle_confirmation(context, nlu_result)` | Reads back collected information and asks for confirmation |
| `_submit_ticket(context)` | Inserts the ticket into the DB and transitions to `SUBMITTED` |
| `_generate_confirmation_message(context)` | Generates a confirmation summary message |
| `_detect_correction(nlu_result)` | Detects self-correction phrases like `"no wait"`, `"actually"` |
| `_detect_yes_no(transcript)` | Classifies yes/no responses during confirmation |

#### API Endpoints

**`POST /api/turn`**
```
Request: { session_id, transcript, audio_path? }
Response: { response_text, current_state, context, tts_audio_path? }
```

**`POST /api/session/start`**
```
Request: { channel, caller_number? }
Response: { session_id, greeting_text }
```

#### Category-specific settings (hardcoded in `RuleEngine`)
```python
CATEGORY_CONFIG = {
    "pothole":           {"department": "Roads",     "sla_hours": 72},
    "graffiti":          {"department": "Parks",     "sla_hours": 48},
    "litter":            {"department": "Sanitation","sla_hours": 24},
    "needles":           {"department": "Health",    "sla_hours": 4},   # immediate response
    "parking_complaint": {"department": "Bylaw",     "sla_hours": 24},
    ...
}
```

---

### 3.4 `ticket_service/main.py` — Ticket REST API

**Role**: Provides CRUD and workflow endpoints for tickets (used by the supervisor UI, etc.).

#### Pydantic Models

**`TicketCreateRequest`**
- Validation model containing all fields required to create a ticket.
- Includes `category`, `location`, `description`, `caller_name`, `phone_number`, and `severity`.

**`TicketUpdateRequest`**
- Request model for ticket updates.
- Note: the UI sends a flat structure, but the backend expects a nested structure `{ticket_status, updates:{...}}` (known bug).

#### Endpoints

| Method | Path | Function | Behavior |
|--------|------|------|------|
| POST | `/tickets/` | `create_ticket()` | Creates a new ticket and returns `ticket_id` |
| GET | `/tickets/` | `list_tickets()` | Returns a filtered ticket list by status/category/date |
| GET | `/tickets/{ticket_id}` | `get_ticket()` | Retrieves a single ticket |
| PUT | `/tickets/{ticket_id}` | `update_ticket()` | Updates specified fields |
| POST | `/tickets/{ticket_id}/approve` | `approve_ticket()` | Supervisor approval, sets `routing_status` → `"APPROVED"` |
| POST | `/tickets/{ticket_id}/reject` | `reject_ticket()` | Supervisor rejection, stores rejection reason (`reason`) |
| POST | `/tickets/{ticket_id}/resolve` | `resolve_ticket()` | Marks the ticket as completed, `ticket_status` → `"RESOLVED"` |

---

### 3.5 `stt_service/main.py` — Speech Recognition Service

**Role**: Records microphone audio and converts it to text using the Whisper model.

#### Core Functions

**`record_audio(duration, sample_rate, silence_threshold, silence_duration)`**
- Starts microphone recording using `sounddevice`.
- Uses RMS (Root Mean Square) energy-based silence detection.
- Automatically stops recording if silence continues for `silence_duration` seconds (default 2 seconds).
- Returns: numpy ndarray (audio samples)

**`transcribe_audio(audio_data, model, sample_rate)`**
- Resamples audio to 16kHz (Whisper requirement).
- Converts speech to text using `model.transcribe()`.
- Returns: transcript string

**`apply_phonetic_corrections(text, phonetic_map)`**
- Applies domain-specific speech corrections.
- Example: `"putos"` → `"pothole"`, `"pot hole"` → `"pothole"`
- Iterates through the `phonetic_map` dict and applies regex replacements.

**`save_turn_audio(audio_data, session_id, turn_index, sample_rate)`**
- Saves each utterance to `data/audio_samples/{session_id}/turn_{turn_index}.wav`.
- Automatically creates a session-specific folder.

**`merge_session_audio(session_id)`**
- Merges all utterance audio files in the session in chronological order.
- Saves to `data/call_recordings/{session_id}.wav`.
- Inserts 0.5 seconds of silence between utterances.

**`save_transcript(session_id, turns)`**
- Saves the transcript in both JSON and TXT formats.
- `data/call_transcripts/{session_id}.json`
- `data/call_transcripts/{session_id}.txt`

#### API Endpoint

**`POST /api/voice/`**
```
Request: multipart/form-data { audio_file (WAV/MP3), session_id }
Processing: Whisper transcription → phonetic correction → orchestrator call
Response: { transcript, response_text, tts_audio, current_state }
```

---

### 3.6 `tts_service/main.py` — Text-to-Speech Service

**Role**: Converts text into speech and plays it back to the user.

#### Class: `TTSService`

**`__init__()`**
- Initializes the TTS engine with `pyttsx3.init()`.
- Retrieves the list of available voices (typically Windows SAPI).
- Selects the second voice (index 1) if available, which is often a female voice.
- Uses `threading.Lock()` to ensure thread safety.

**`speak(text, slow=False)`**
- If `slow=True`, reduces the speaking rate (used when reading ticket numbers).
- `engine.say(text)` → `engine.runAndWait()`
- Prevents simultaneous calls by using a lock.

**`speak_ticket_number(ticket_id)`**
- Slowly reads a ticket number in the format `"311-2026-000042"`.
- Inserts pauses between digits for more natural pronunciation.

**`set_rate(rate)`**
- Adjusts speaking speed (default is about 200 WPM).

**`set_voice(voice_id)`**
- Changes to a specific voice engine ID.

---

### 3.7 `nlp_service/main.py` — NLP Service Entry Point

**Role**: Entry-point module that exposes the `NLUProcessor` class for external import.

- An `NLUProcessor` instance can be created directly, or
- a shared instance can be used through `FastAPI app.state.nlu_processor`.
- When run independently (`__main__`), it performs a simple test.

---

### 3.8 `nlp_service/model/nlu_processor.py` — NLU Pipeline

**Role**: Main pipeline that combines all NLP components and returns a structured result from a single text input.

#### Class: `NLUProcessor`

**`__init__(model_path=None)`**
- Loads `CategoryClassifierML` (loads a saved model if available, otherwise falls back to rule-based classification).
- Creates an `EntityExtractor` instance.
- Creates a `SentimentAnalyzer` instance.
- Creates a `DescriptionExtractor` instance.
- Creates a `ConfidenceCalculator` instance.
- Initializes `self._session_states: dict` for storing per-session context.

**`process(transcript, session_id, current_intent=None)`**
- Main entry point of the NLU pipeline.
- Processing order:
  1. Text normalization (`utils.clean_transcript`)
  2. Detect self-corrections (`utils.handle_self_corrections`)
  3. Decide intent-based slot gating
  4. Category classification (ML → rule-based fallback)
  5. Entity extraction (location, name, phone)
  6. Description extraction
  7. Sentiment/urgency analysis
  8. Confidence score calculation
  9. Session context update
  10. Return structured result dict
- Return structure:
  ```python
  {
      "category": str | None,
      "category_confidence": float,
      "location": str | None,
      "location_confidence": float,
      "caller_name": str | None,
      "name_confidence": float,
      "phone_number": str | None,
      "phone_confidence": float,
      "description": str | None,
      "description_confidence": float,
      "sentiment": dict,       # VADER scores
      "urgency": str,          # "low"/"medium"/"high"/"critical"
      "severity_score": float, # 0.0~1.0
      "self_correction": bool,
      "corrected_field": str | None,
      "intent": str | None,
  }
  ```

**`update_field(session_id, field_name, value)`**
- Used when the orchestrator manually updates a specific field.
- Directly updates the field in the session context.

**`set_confirm(session_id, confirmed)`**
- Records a yes/no response during confirmation.
- `self._session_states[session_id]["confirmed"] = confirmed`

**`get_session_context(session_id)`**
- Returns the session's current collection state (slot values).

**`_classify_category_rule_based(text)`**
- Rule-based fallback used when ML classification fails.
- Matches the text against keyword lists in `categories.json`.
- Computes a score based on the number of matched keywords.

**`_apply_intent_gating(current_intent, extraction_flags)`**
- Decides which fields to extract based on the current intent.
- Example: if the intent is `"asking_location"`, only location is extracted.
- Prevents errors caused by extracting unnecessary fields.

---

### 3.9 `nlp_service/model/entity_extractor.py` — Entity Extraction

**Role**: Uses spaCy NER and regular expressions to extract phone numbers, names, and locations from text.

#### Class: `EntityExtractor`

**`__init__()`**
- Loads the spaCy `en_core_web_md` model.
- Precompiles regex patterns for names, locations, and phone numbers.

**`extract_caller_name(text, intent_gated=False)`**

Extraction strategy (in priority order):
1. **Explicit patterns**: `"my name is [Name]"`, `"I'm [Name]"`, `"this is [Name]"` → confidence 0.95
2. **spaCy PERSON entity**: PERSON label recognized by NER → confidence 0.80
3. **Capitalized-word pattern**: 2–4 consecutive capitalized words → confidence 0.65
- If `intent_gated=True`, extraction happens only when the current intent is the name-collection step.
- Returns: `{"value": str, "confidence": float}`

**`extract_phone_number(text)`**

Three regex patterns:
1. `(604) 555-1234` format
2. `604-555-1234` format
3. `6045551234` as 10 consecutive digits
- If uncertain phrases such as `"I think it's"` or `"maybe"` are detected, confidence is lowered to 0.60.
- Returns: `{"value": str, "confidence": float}`

**`extract_location(text, intent_gated=False)`**

Extraction strategy (in priority order):
1. **Street number + road name**: `"123 Main Street"` → confidence 0.85
2. **Intersection**: `"Main and Oak"`, `"Main & Oak"` → confidence 0.80
3. **spaCy GPE/LOC/FAC**: place/entity recognition → confidence 0.75
4. **Road name only**: `"on Oak Street"` → confidence 0.65
5. **Relative expressions**: `"near the park"`, `"in front of"` → confidence 0.40~0.55
- Uses `utils.normalize_location()` to expand abbreviations (St → Street, Ave → Avenue).
- Returns: `{"value": str, "confidence": float}`

**`extract_all(text, current_intent=None)`**
- Runs all three extractions at once.
- If `current_intent` is set, focuses only on the relevant field.
- Returns: `{"name": {...}, "phone": {...}, "location": {...}}`

---

### 3.10 `nlp_service/model/sentiment_analyzer.py` — Sentiment Analysis

**Role**: Uses VADER to produce sentiment scores and urgency levels.

#### Class: `SentimentAnalyzer`

**`__init__()`**
- Creates an instance of `vaderSentiment.SentimentIntensityAnalyzer()`.
- Loads the urgency keyword dictionary (`utils.get_urgency_keywords()`).

**`analyze_sentiment(text)`**
- Calls VADER `polarity_scores(text)`.
- Returns:
  ```python
  {
      "compound": float,   # overall score from -1.0 to 1.0
      "positive": float,   # positive ratio
      "neutral": float,    # neutral ratio
      "negative": float,   # negative ratio
      "label": str         # "positive"/"neutral"/"negative"
  }
  ```

**`detect_urgency(text)`**
- Four-level urgency classification logic:

| Urgency | Condition |
|--------|------|
| `critical` | words like `"emergency"`, `"injured"`, `"bleeding"`, `"danger"` |
| `high` | words like `"urgent"`, `"serious"`, `"broken"`, `"flooding"` + negative sentiment |
| `medium` | words like `"broken"`, `"damaged"`, `"weeks"`, `"months"` (long-term neglect) |
| `low` | none of the above |

- Booster conditions: number of `!`, all-caps sentence detection.
- Computes `severity_score`: `critical=1.0`, `high=0.75`, `medium=0.5`, `low=0.25`.
- Returns: `{"urgency": str, "severity_score": float, "matched_keywords": list}`

**`analyze(text)`**
- Combined call to `analyze_sentiment()` + `detect_urgency()`.
- Returns a dictionary merging both results.

---

### 3.11 `nlp_service/model/description_extractor.py` — Description Extraction

**Role**: Extracts only the core issue description and removes unnecessary parts such as greetings or personal information.

#### Class: `DescriptionExtractor`

**`__init__()`**
- Defines patterns to remove:
  - Greetings: `"hi"`, `"hello"`, `"good morning"`, `"thank you"`, etc.
  - Caller information: `"my name is"`, `"I'm calling"`, `"my number is"`, etc.
  - Urgency markers: `"urgent"`, `"emergency"`, `"ASAP"`, etc. (removed from the description and handled separately in the urgency field)

**`extract(text)`**
- Removes unnecessary phrases by pattern matching.
- Splits into sentences and filters out sentences unrelated to the issue description.
- Normalizes and returns the remaining text.
- Returns: cleaned description string

**`extract_with_summary(text)`**
- Adds extra analysis to the result of `extract()`.
- Returns:
  ```python
  {
      "description": str,      # cleaned description
      "summary": str,          # 1–2 sentence summary
      "details": dict,         # extracted detailed information
      "confidence": float      # description-quality confidence
  }
  ```

**`_extract_details(text)`**
- Uses regex to extract specific information from the description.
- Extracted items:
  - size: `"3 feet wide"`, `"large"`, `"small"`
  - duration: `"for 3 days"`, `"since last week"`
  - impact: `"blocking the sidewalk"`, `"traffic hazard"`
  - quantity: `"several"`, `"many"`, `"two cans"`
- Returns: `{"size": str, "duration": str, "impact": str, "quantity": str}`

**`_calculate_confidence(text, details)`**
- Starts with a base confidence of 0.70.
- Word-count bonus: +0.05 for 10+ words, +0.10 for 20+ words.
- Adds +0.05 for each successfully extracted detail item.
- Maximum 0.99.

---

### 3.12 `nlp_service/model/confidence_calculator.py` — Confidence Calculation

**Role**: Calculates confidence scores for each extracted field and classifies them as high/medium/low.

#### Class: `ConfidenceCalculator`

**`__init__()`**
- Defines thresholds:
  ```python
  HIGH_THRESHOLD = 0.80    # high confidence
  MEDIUM_THRESHOLD = 0.50  # medium confidence
  CATEGORY_HIGH = 0.60     # special threshold for category (lower because of ML characteristics)
  CATEGORY_MEDIUM = 0.35
  ```

**`calculate(field_name, value, raw_confidence, text_context)`**
- Adjusts the raw confidence score using several factors.
- Adjustment factors:
  - **Uncertainty-marker penalty**: subtract 0.15 if `"maybe"`, `"I think"`, `"not sure"` is detected
  - **Self-correction bonus**: add 0.10 if `"actually"`, `"I mean"`, `"no wait"` is detected (the corrected value is assumed to be more accurate)
  - **Location specificity bonus**: +0.20 if a street number is included, +0.15 for an intersection
  - **Category ML confidence**: directly uses the ML model probability output
- Returns: `{"score": float, "level": str, "is_high": bool, "is_medium": bool}`

**`get_level(score, field_name)`**
- Converts a score into a level string.
- Applies separate thresholds for category fields.
- Returns: `"high"` | `"medium"` | `"low"`

**`should_clarify(field_name, confidence_result)`**
- Decides whether reconfirmation is needed when confidence is medium or lower.
- Triggers the clarification stage if `is_high` is `False`.

---

### 3.13 `nlp_service/model/utils.py` — Utility Functions

**Role**: Collection of common text-processing functions used across the NLP pipeline.

#### Main Functions

**`clean_transcript(text)`**
- Consecutive spaces → single space
- Removes leading/trailing spaces
- Converts to lowercase
- Returns: str

**`remove_filler_words(text)`**
- Removes words such as `"um"`, `"uh"`, `"like"`, `"you know"`, `"sort of"`, `"kind of"`, `"I mean"`
- Regex match based on word boundaries
- Returns: str

**`detect_uncertainty_markers(text)`**
- List of uncertainty expressions: `["maybe", "perhaps", "I think", "I believe", "not sure", "might be", "could be"]`
- Returns the list of found markers.
- Returns: `List[str]`

**`handle_self_corrections(text)`**
- Detects self-correction patterns: `"no wait [value]"`, `"actually [value]"`, `"I mean [value]"`, `"sorry [value]"`
- Separates corrected and original values.
- Returns:
  ```python
  {
      "has_correction": bool,
      "original": str,
      "corrected": str,
      "correction_phrase": str
  }
  ```

**`extract_phone_number(text)`**
- Extracts a phone number using three regex patterns.
- Same logic as `entity_extractor.py` (utility layer provides the base logic).
- Returns: `str | None`

**`normalize_location(location_text)`**
- Replaces abbreviations with full words:
  ```
  St → Street, Ave → Avenue, Blvd → Boulevard
  Dr → Drive, Rd → Road, Ln → Lane, Ct → Court
  N/S/E/W → North/South/East/West
  ```
- Returns: str

**`calculate_text_confidence(text)`**
- Computes confidence based on text quality.
- Considers word count, sentence length, and punctuation ratio.
- Returns: float (0.0~1.0)

**`get_urgency_keywords()`**
- Returns a four-level urgency keyword dictionary.
- Shared with `sentiment_analyzer.py`.
- Returns:
  ```python
  {
      "critical": ["emergency", "danger", "injured", ...],
      "high": ["urgent", "serious", "flooding", ...],
      "medium": ["broken", "damaged", "weeks", ...],
      "low": []
  }
  ```

**`format_output(fields)`**
- Formats the final NLU result into the standard schema.
- Fills missing fields with default `None` values.
- Returns: standardized dict

---

### 3.14 `nlp_service/model/models/category_classifier_ml.py` — ML Classifier

**Role**: Fine-tunes DistilBERT to classify service request text into one of 11 categories.

#### Class: `CategoryClassifierML`

**`__init__(model_path=None, auto_load=True)`**
- Loads the `distilbert-base-uncased` tokenizer/model.
- If `auto_load=True` and a checkpoint exists at `model_path`, loads the fine-tuned weights.
- Initializes category label ↔ index mapping dictionaries.

**`load_categories(categories_path)`**
- Loads the category list from `data/models/categories.json`.
- Creates `label2id` and `id2label` dictionaries.
- Returns: `(label2id: dict, id2label: dict)`

**`prepare_dataset(samples)`**
- Converts training data into Hugging Face `Dataset` format.
- Tokenizes each sample transcript (`max_length=128`, padding, truncation).
- Converts category labels into integer indices.
- Returns: `datasets.Dataset`

**`train(train_samples, eval_samples, output_dir, epochs=15, batch_size=8, learning_rate=2e-5)`**
- Configures Hugging Face `TrainingArguments`.
- Runs fine-tuning with the `Trainer` class.
- Settings:
  ```python
  num_train_epochs = 15
  per_device_train_batch_size = 8
  learning_rate = 2e-5
  evaluation_strategy = "epoch"
  save_strategy = "epoch"
  load_best_model_at_end = True
  ```
- Saves the model to `output_dir` after training.

**`predict(text)`**
- Tokenizes the input text.
- Runs a model forward pass (softmax probabilities).
- Chooses the top-probability category with `argmax`.
- Returns:
  ```python
  {
      "category": str,       # predicted category
      "confidence": float,   # highest probability (0.0~1.0)
      "all_scores": dict     # probabilities for all categories
  }
  ```

**`save(output_dir)`**
- Saves the model and tokenizer to `output_dir`.
- Uses Hugging Face `save_pretrained()`.

**`load(model_dir)`**
- Loads weights from a saved model directory.
- Used for inference without retraining.

---

### 3.15 `nlp_service/train/main.py` — Model Training

**Role**: Script for fine-tuning the DistilBERT category classifier using training data.

#### Execution Flow

**Step 1: Load data**
```python
# data/models/training_data.json (342 samples)
# data/models/test.json (test samples)
with open("training_data.json") as f:
    train_data = json.load(f)
```

**Step 2: Split data**
- Splits training/validation data at an 80:20 ratio (or uses a separate `test.json`).

**Step 3: Initialize model and train**
```python
classifier = CategoryClassifierML()
classifier.train(
    train_samples=train_samples,
    eval_samples=eval_samples,
    output_dir="ml_models/saved_models/category_classifier/",
    epochs=15
)
```

**Step 4: Save**
- The best-performing checkpoint is saved to `ml_models/saved_models/category_classifier/`.

**`main()`**
- Runs the full training pipeline.
- After training, performs a quick prediction test to confirm normal operation.

---

### 3.16 `nlp_service/test/main.py` — Model Testing

**Role**: Quickly validates the performance of the saved model with sample predictions.

**`test_classifier()`**
- Calls `classifier.predict()` on 3 sample service request texts.
- Compares predicted categories with actual labels.
- Prints accuracy (%).

**Sample test cases**
```python
[
    {"text": "There's a huge pothole on Main Street...", "expected": "pothole"},
    {"text": "Someone spray painted graffiti on...", "expected": "graffiti"},
    {"text": "There's garbage and litter all over...", "expected": "litter"},
]
```

---

### 3.17 `ui/voice_ui/start_ui.py` — Voice UI Server

**Role**: A simple HTTP file server that provides a browser-based voice UI.

**`main()`**
- Uses `http.server.HTTPServer` + `SimpleHTTPRequestHandler`.
- Runs on port 8000.
- Serves static files (HTML/CSS/JS) from the current directory (`voice_ui/`).
- Returns `index.html` when accessed via `http://localhost:8000`.

---

### 3.18 `ui/voice_ui/app.js` — Browser Voice Client

**Role**: JavaScript logic for microphone recording, backend API communication, and TTS playback in the browser.

#### Core Functions

**`startCall()`**
- Calls `POST /api/session/start` to obtain a `session_id`.
- Requests microphone permission (`getUserMedia`).
- Starts audio visualization.
- Plays the initial greeting TTS.

**`startRecording()`**
- Creates `MediaRecorder(stream)` (WebM/Opus codec).
- Collects audio data chunks.
- Starts a silence-detection timer (2 seconds).

**`stopRecording()`**
- Calls `MediaRecorder.stop()`.
- Merges the collected chunks into a `Blob`.
- Calls `sendAudioToBackend()`.

**`sendAudioToBackend(audioBlob)`**
- Attaches the audio file and `session_id` to `FormData`.
- Sends to `POST /api/voice/` via the `fetch` API.
- Receives `response_text`, `tts_audio`, and `current_state` from the response.
- Plays TTS audio if provided; otherwise displays text.

**`detectSilence(stream)`**
- Measures real-time volume using `AudioContext` + `AnalyserNode`.
- Treats RMS energy below a threshold as silence.
- Automatically calls `stopRecording()` after 2 seconds of silence.

**`updateStateDisplay(context)`**
- Updates the screen panel with context data from the backend response.
- Display items: session ID, current state, collected slots (category/location/name/phone).

**`endCall()`**
- Stops the microphone stream.
- Calls the session-end API.
- Returns the UI to its initial state.

---

## 4. Conversation State Machine Flowchart

```text
INITIALIZING
     │
     ▼
SLOT_FILLING ←─────────────────────────────────────────┐
     │                                                  │
     │ Ask for the next missing field                   │
     │ (order: category → location → name → phone →    │
     │ description)                                     │
     │                                                  │
     ├─[Low confidence detected]──→ CLARIFICATION       │
     │                          │                       │
     │                          │ After reconfirmation  │
     │                          └───────────────────────┘
     │
     │ [All slots complete]
     ▼
CONFIRMATION ──→ Read back collected information + "Is that correct?"
     │
     ├─[yes / positive]──→ SUBMITTED
     │                    │
     │                    ▼
     │              Save ticket to DB
     │              Provide ticket_id
     │              End call
     │
     ├─[no / negative]──→ Ask again for the corrected field → SLOT_FILLING
     │
     └─[Self-correction detected]──→ Recollect target field → SLOT_FILLING
```

---

## 5. ML Model Configuration Summary

| Model | Purpose | Framework | Size |
|------|------|-----------|------|
| OpenAI Whisper (small) | Speech → text | PyTorch | ~240MB |
| DistilBERT (fine-tuned) | Service request category classification | HuggingFace Transformers | ~260MB |
| spaCy en_core_web_md | Named entity recognition (PERSON, GPE, LOC) | spaCy | ~43MB |
| VADER | Sentiment analysis, urgency detection | NLTK / vaderSentiment | <1MB |

### Training Data Statistics
- Training samples: **342** labeled service-request transcripts
- Number of categories: **11** (10 service request types + `other`)
- Average samples/category: ~31

---

## 6. Known Bugs and Schema Mismatches

> Source: `DATA_SCHEMA_AUDIT.md`

### HIGH Priority

**Bug 1: PUT /tickets/{id} structure mismatch**
- The UI sends a flat object: `{ticket_status: "...", field: value}`
- The backend expects a nested structure: `{ticket_status: "...", updates: {field: value}}`
- Result: only the status change is applied, and all other fields are ignored.

**Bug 2: Voice UI `.env` port misconfiguration**
- `.env` file: `VITE_API_URL=http://localhost:8000`
- Actual backend port: `8311`
- `app.js` is hardcoded to use `8311` (mixed configuration)

### MEDIUM Priority

**Bug 3: Missing DB columns**
- Columns referenced by the UI/orchestrator but not present in the DB schema:
  - `session_history`, `ticket_number`, `confidence`, `approvedAt`

**Bug 4: Ticket status value mismatch**
- Voice orchestrator: `ticket_status = "submitted"` (lowercase)
- Web UI filter expects: `"NEW"` (uppercase)
- Result: tickets created through voice do not appear in the web UI.

### LOW Priority

**Bug 5: Soft delete not implemented**
- The UI sends a `DELETE` request as a `PUT` with `ticket_status = "DELETE"`
- There is no dedicated delete endpoint.

---

*This document was automatically generated. It should be updated when the code changes.*
