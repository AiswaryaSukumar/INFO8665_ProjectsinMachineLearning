# 🎙️ INSIGHT-311: AI-Driven Voice Assistant

**INSIGHT-311** is an automated voice-driven assistant designed to streamline 311 municipal service requests. By leveraging Speech-to-Text (STT) and Natural Language Understanding (NLU), it automates the intake, classification, and prioritization of citizen reports through a multi-turn conversational interface.

---

## 🏗️ System Architecture (Refactored)

The project has been restructured into modular services, each with its own `main.py` entrypoint. The components work in synchronization through a central FastAPI application:

### 1. **Core Application** (`main.py`)
* The root FastAPI server that mounts all routers and manages the ML model lifecycles (Whisper STT and DistilBERT NLU).

### 2. **Dialog Orchestrator** (`orchestrator/main.py`)
* Acts as the "Brain" of the conversation using slot-filling techniques.
* Manages required fields: `category`, `location`, `description`, `caller_name`, and `phone_number`.
* Handles the state machine and exposes `/api/voice`, `/api/orchestrator` endpoints.

### 3. **NLP Service** (`nlp_service/`)
* **`main.py`**: The NLU processing pipeline interface.
* **`train/main.py`**: Scripts to train the DistilBERT model.
* **`test/main.py`**: Scripts to test the trained model.
* **`model/`**: Contains ML logic, intent extraction, and VADER sentiment analysis.

### 4. **Microservices**
* **`db_service/main.py`**: Database connections, SQLAlchemy models, and session/ticket repositories.
* **`ticket_service/main.py`**: Endpoints for querying and modifying 311 tickets.
* **`stt_service/main.py`**: Speech-to-Text inference logic using Whisper.
* **`tts_service/main.py`**: Text-to-Speech logic using `pyttsx3`.

---

## 🚀 Getting Started

### **Prerequisites**
- **Python 3.10+**
- **PostgreSQL Database** with `tickets` and `sessions` tables.
- **Virtual Environment** setup:

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
# Additional NLP/Audio dependencies
pip install torch transformers pydub spacy pyttsx3 psycopg2-binary vaderSentiment python-multipart
python -m spacy download en_core_web_sm
```

### **NLU Model Training (Mandatory)**
Model artifacts are local. You must train the DistilBERT classifier before first use if you don't have existing checkpoints:

1. Ensure training data exists in `data/models/training_data.json`.
2. Execute the new training script:
   ```bash
   cd insight311
   python nlp_service/train/main.py
   ```
3. Artifacts will be saved to `insight311/nlp_service/ml_models/saved_models/category_classifier/`.

---

## 🛠️ Usage Guide

### **Starting the Backend Server**

Run the central FastAPI application from the new project root (`insight311/`):

```bash
cd insight311
uvicorn main:app --host 0.0.0.0 --port 8311 --reload
```
*Wait until you see the `🚀 Loading ML Models into Application State...` and `✅ All ML Models loaded successfully!` logs.*

### **Starting the Frontend Voice UI**

To start the interactive web interface, open a **second terminal** and run:

```bash
cd insight311/ui/voice_ui
python start_ui.py
```
*Click the `http://127.0.0.1:8000` link that appears in the terminal to open the UI in your browser.*

### **Interacting with the System**

Once the servers are running:
1. Use the frontend UI at `http://127.0.0.1:8000`.
2. Explore the automatic interactive documentation at `http://localhost:8311/docs`.
3. Use external scripts to test the voice input/output flows via REST API.

---

## 📊 Database Schema

The `tickets` table in PostgreSQL should include the following schema:

| Column | Type | Description |
| :--- | :--- | :--- |
| `ticket_id` | VARCHAR | Unique ID (e.g., TKT-2026...) |
| `category` | VARCHAR | Extracted 311 service category |
| `location` | TEXT | Physical location of the issue |
| `description` | TEXT | Detailed incident description |
| `caller_name` | VARCHAR | Citizen's full name |
| `phone_number`| VARCHAR | Contact information |
| `confirmed` | BOOLEAN | Submission status |

---

## 🔍 NLU Categories
The system is trained to recognize the following official categories:
* `graffiti`, `illegal_sign`, `litter`, `needles`, `parking_complaint`, `property_standards`, `pothole`, `sidewalk_snow`, `sidewalk_hazard`, `trail_maintenance`.

User: the log requirement is as follows , check the code and tell me if its as per the requirement" Use the “logging” Python library.
Create a formatter: '%(asctime)s - %(name)s - %(levelname)s - %(message)s' and add it to a logging handler."


GitHub Copilot: 

  

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/logging_config.py)

Searched for regex `logging|formatter|%(asctime)s|basicConfig|StreamHandler|FileHandler` (`**/*.py`), 50 results

**No, the code does not match the requirement.** Here's the analysis:

**Requirement 1: Use the `logging` Python library** — **Partially met**

The code in logging_config.py does `import logging` and uses `logging.StreamHandler` and `logging.getLogger()`. However, the actual logging throughout the project is done via **structlog** (`structlog.get_logger()`), not the standard `logging` library directly.

**Requirement 2: Create a formatter `'%(asctime)s - %(name)s - %(levelname)s - %(message)s'`** — **Not met**

At logging_config.py, the formatter is:

```python
formatter = structlog.stdlib.ProcessorFormatter(
    processors=[
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        structlog.processors.JSONRenderer(),
    ],
)
```

This is a **structlog JSON renderer**, not the required format string. The requirement explicitly asks for:

```python
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
```

**What would need to change:**

Replace the structlog `ProcessorFormatter` with a standard `logging.Formatter` in `setup_logging()`:

```python
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(formatter)
```

And if you want to fully satisfy the requirement, the services should use `logging.getLogger(name)` instead of `structlog.get_logger(name)` — or at minimum, the formatter attached to the handler must be the exact format string specified.

User: implement that

GitHub Copilot: 

I don't have file editing tools available in this mode. Here's the exact replacement for logging_config.py:

```python
"""
Centralized logging configuration for INSIGHT-311.

Uses the standard Python logging library with a consistent formatter.
All services import `get_logger` from here to get a configured logger.
"""

import logging
import os
import sys


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


def setup_logging():
    """Configure stdlib logging for the entire application."""

    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

    # Quiet noisy third-party loggers
    for name in ("uvicorn.access", "sqlalchemy.engine", "httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)


def get_logger(name: str = __name__) -> logging.Logger:
    """Return a stdlib logger with the given name."""
    return logging.getLogger(name)
```

**What changed:**
- Removed `structlog` entirely — now uses only the standard `logging` library
- Formatter is exactly `'%(asctime)s - %(name)s - %(levelname)s - %(message)s'` as required
- `get_logger()` now returns a standard `logging.Logger` instead of a structlog `BoundLogger`
- All existing service imports (`from logging_config import get_logger`) will continue to work since the function signature and return type are compatible — standard `Logger` objects support the same `.info()`, `.error()`, `.warning()`, etc. methods

No changes are needed in any other service files — the API is preserved.

User: what do i do next to view the logs ?

GitHub Copilot: 

  

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/main.py#1-1), lines 1 to 50

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/docker-compose.yml#1-1), lines 1 to 80

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/docker-compose.yml#80-80), lines 80 to 94

There are two ways to view the logs depending on how you run the app:

### Option 1: Running locally (no Docker)
Run the app and logs will print directly to your terminal (stdout):
```bash
python main.py
```
You'll see output like:
```
2026-03-23 14:30:00,123 - insight311.main - INFO - loading_ml_models
2026-03-23 14:30:01,456 - insight311.main - INFO - loading_whisper_stt
```

### Option 2: Running with Docker Compose
```bash
docker compose up
```
Then view logs with:
```bash
docker compose logs -f app
```
Or view them in **Grafana** at `http://localhost:3000` (login: `admin`/`admin`) via the Loki datasource, since Promtail ships container logs to Loki automatically.

---

### Important: You have a breaking issue

Your main.py still imports `structlog`, and the logger calls use structlog-style keyword arguments that standard `logging` doesn't support:

```python
import structlog                          # line 4 — unused now
logger.info("loading_whisper_stt", model_size="small")  # line 38 — will fail
```

Standard `logging.Logger.info()` doesn't accept arbitrary `**kwargs`. You need to update main.py (and any other service files using this pattern) to:

1. Remove `import structlog` on line 4
2. Change keyword-style log calls to f-strings:
   ```python
   logger.info("loading_whisper_stt model_size=small")
   # or
   logger.info("loading_whisper_stt: %s", "small")
   ```

Would you like me to scan all service files for these incompatible log calls so you can fix them all at once?

User: yes

GitHub Copilot: 

  

Searched for text `import structlog` (`**/*.py`), 3 results

Searched for regex `logger\.\w+\(.+,\s*\w+=` (`**/*.py`), 100 results

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/main.py#1-1), lines 1 to 110

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/stt_service/main.py)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py#1-1), lines 1 to 50

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ticket_service/main.py#1-1), lines 1 to 100

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/tts_service/main.py)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/nlp_service/model/nlu_processor.py#1-1), lines 1 to 70

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/db_service/main.py#1-1), lines 1 to 50

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/nlp_service/main.py)

Now let me also check the rest of the orchestrator for all the structlog-style calls: 

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py#50-50), lines 50 to 200

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py#200-200), lines 200 to 500

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py#500-500), lines 500 to 600

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py#600-600), lines 600 to 623

Here's the full list of **all project files with incompatible structlog-style log calls** that need to be fixed:

---

### 1. main.py — 7 issues

| Line | Issue |
|------|-------|
| main.py | `import structlog` — remove |
| main.py | `logger.info("loading_whisper_stt", model_size="small")` |
| main.py | `logger.info("ml_models_loaded", docs_url="http://localhost:8311/docs")` |
| main.py | `structlog.contextvars.clear_contextvars()` / `bind_contextvars(...)` — remove entirely |
| main.py | `logger.info("http_request", method=..., path=..., status=..., duration_ms=...)` |
| main.py | `logger.exception("unhandled_exception", path=..., error=...)` |

**Fix main.py to:**
```python
# Line 4: remove "import structlog"

# Line 37:
logger.info("loading_whisper_stt model_size=small")

# Line 44:
logger.info("ml_models_loaded docs_url=http://localhost:8311/docs")

# Lines 84-85: remove both structlog.contextvars lines entirely

# Lines 88-93:
logger.info("http_request method=%s path=%s status=%s duration_ms=%s",
            request.method, request.url.path, response.status_code, duration_ms)

# Line 99:
logger.exception("unhandled_exception path=%s error=%s", request.url.path, str(exc))
```

---

### 2. main.py — 5 issues

| Line | Current | Fix |
|------|---------|-----|
| main.py | `logger.info("whisper_model_loaded", model_size="small")` | `logger.info("whisper_model_loaded model_size=small")` |
| main.py | `logger.warning("whisper_model_load_failed", error=str(e))` | `logger.warning("whisper_model_load_failed error=%s", e)` |
| main.py | `logger.debug("recording_start", session_id=..., turn=...)` | `logger.debug("recording_start session_id=%s turn=%s", session_id, turn)` |
| main.py | `logger.info("merged_audio_saved", session_id=..., path=...)` | `logger.info("merged_audio_saved session_id=%s path=%s", session_id, merged_path)` |
| main.py | `logger.debug("deleted_temp_audio", path=...)` | `logger.debug("deleted_temp_audio path=%s", file_path)` |

---

### 3. main.py — 7 issues

| Line | Current | Fix |
|------|---------|-----|
| main.py | `logger.info("call_recording_saved", session_id=..., path=...)` | `logger.info("call_recording_saved session_id=%s path=%s", session_id, recording_path)` |
| main.py | `logger.warning("no_audio_turns_found", session_id=...)` | `logger.warning("no_audio_turns_found session_id=%s", session_id)` |
| main.py | `logger.info("call_transcript_saved", session_id=..., path=...)` | `logger.info("call_transcript_saved session_id=%s path=%s", session_id, txt_path)` |
| main.py | `logger.info("session_initialized", session_id=..., channel=...)` | `logger.info("session_initialized session_id=%s channel=%s", session_id, channel)` |
| main.py | `logger.info("ticket_created", ticket_id=..., ...)` | `logger.info("ticket_created ticket_id=%s session_id=%s category=%s severity=%s", ticket_id, context.session_id, fields["category"], fields["severity"])` |
| main.py | `logger.info("process_turn_start", session_id=..., state=...)` | `logger.info("process_turn_start session_id=%s state=%s", session_id, context.current_state)` |

---

### 4. main.py — 1 issue

| Line | Current | Fix |
|------|---------|-----|
| main.py | `logger.info("ticket_created_via_api", ticket_id=..., channel=...)` | `logger.info("ticket_created_via_api ticket_id=%s channel=%s", ticket_id, request.channel)` |

---

### 5. main.py — 1 issue

| Line | Current | Fix |
|------|---------|-----|
| main.py | `logger.info("tts_speak", text_length=len(text))` | `logger.info("tts_speak text_length=%s", len(text))` |

---

### 6. nlu_processor.py — 2 issues

| Line | Current | Fix |
|------|---------|-----|
| nlu_processor.py | `logger.info("ml_classifier_loaded", path=model_path)` | `logger.info("ml_classifier_loaded path=%s", model_path)` |
| nlu_processor.py | `logger.warning("ml_classifier_fallback", error=str(e))` | `logger.warning("ml_classifier_fallback error=%s", e)` |

---

### Files that are fine (no changes needed)
- main.py — no structlog-style calls
- main.py — no logger calls at all

---

**Summary:** 6 files, ~23 log call sites to update. The pattern is the same everywhere — replace structlog keyword args with `%s` placeholders. The most critical file is main.py because it also has `import structlog` and uses `structlog.contextvars` in the middleware.

User: make the required changes

GitHub Copilot: 

 

Created 6 todos

Let me re-read the exact content from all files to ensure precise replacements.        

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/main.py#1-1), lines 1 to 110

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/stt_service/main.py#25-25), lines 25 to 50

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/stt_service/main.py#170-170), lines 170 to 184

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py#135-135), lines 135 to 175

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py#388-388), lines 388 to 440

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ticket_service/main.py#83-83), lines 83 to 92

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/tts_service/main.py#26-26), lines 26 to 33

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/nlp_service/model/nlu_processor.py#46-46), lines 46 to 60

Now I have all the exact strings. Let me apply all changes across all 6 files: 

Replacing 47 lines with 38 lines in [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/stt_service/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ticket_service/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/tts_service/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/nlp_service/model/nlu_processor.py)


```

```

```

```

```

```

```

```

```

```

```

```


Completed: *Fix main.py structlog calls* (1/7)

Checked [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/stt_service/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/orchestrator/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ticket_service/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/tts_service/main.py), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/nlp_service/model/nlu_processor.py), no problems found

Completed: *Verify changes with error check* (7/7)

All 6 files updated with no errors. Here's what was changed:

| File | Changes |
|------|---------|
| main.py | Removed `import structlog`, removed `structlog.contextvars` calls, converted 4 log calls to `%s` style |
| main.py | Converted 5 log calls |
| main.py | Converted 7 log calls |
| main.py | Converted 1 log call |
| main.py | Converted 1 log call |
| nlu_processor.py | Converted 2 log calls |

All logger calls now use standard `logging` `%s`-style formatting (e.g., `logger.info("event key=%s", value)`) instead of structlog keyword arguments. The `structlog` dependency is no longer used at runtime.

Made changes.

User: have the changes been updarted to the docker loki and graffana 

GitHub Copilot: 

Let me check the current monitoring configurations to see if they're compatible with the new plain-text log format.    

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/loki-config.yml)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/promtail-config.yml)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/prometheus.yml)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/datasources)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/dashboards)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/alerting)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/datasources/datasources.yml)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/dashboards/dashboard.yml)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/alerting/alerts.yml#1-1), lines 1 to 100

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/dashboards/insight311.json#1-1), lines 1 to 100

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/dashboards/insight311.json#100-100), lines 100 to 197

**No, the Promtail config has NOT been updated** and it will break with the new plain-text log format. Here's the issue:

### The Problem

promtail-config.yml has a `pipeline_stages` section that expects **JSON structlog output**:

```yaml
pipeline_stages:
  - match:
      selector: '{service="app"}'
      stages:
        - json:
            expressions:
              level: level
              logger: logger_name
              event: event
              session_id: session_id
              request_id: request_id
        - labels:
            level:
            logger:
```

Your logs are now plain text like:
```
2026-03-23 14:30:00,123 - insight311.main - INFO - loading_ml_models
```

The `json:` stage will fail silently on every log line since they're no longer JSON. The `level` and `logger` labels won't be extracted, so Grafana queries filtering by log level or logger name won't work.

### What Needs to Change

The Promtail pipeline should use a **regex** stage instead of `json` to parse the new format `%(asctime)s - %(name)s - %(levelname)s - %(message)s`:

```yaml
    pipeline_stages:
      - match:
          selector: '{service="app"}'
          stages:
            - regex:
                expression: '^(?P<timestamp>\S+ \S+) - (?P<logger>\S+) - (?P<level>\w+) - (?P<message>.*)$'
            - labels:
                level:
                logger:
```

### Other configs are fine
- **Loki** (loki-config.yml) — stores/indexes logs, format-agnostic. No change needed.
- **Prometheus** (prometheus.yml) — scrapes `/metrics` endpoint, unrelated to log format. No change needed.
- **Grafana datasources** (datasources.yml) — just connection URLs. No change needed.
- **Grafana dashboard** (insight311.json) — the Logs panel uses `{service="app"} |= ``` which shows all logs regardless of format. No change needed.
- **Grafana alerts** (alerts.yml) — all based on Prometheus metrics, not logs. No change needed.

Want me to update the Promtail config?

User: yes

GitHub Copilot: I don't have file editing tools available in this mode. Here's the exact replacement for the `pipeline_stages` section in promtail-config.yml:

Replace lines 32–43 with:

```yaml
    pipeline_stages:
      - match:
          selector: '{service="app"}'
          stages:
            - regex:
                expression: '^(?P<timestamp>\S+ \S+) - (?P<logger>\S+) - (?P<level>\w+) - (?P<message>.*)$'
            - labels:
                level:
                logger:
```

This changes the parsing from JSON (`- json:`) to a regex that matches your new log format:
```
2026-03-23 14:30:00,123 - insight311.main - INFO - loading_ml_models
```

The `level` and `logger` labels will continue to be extracted and available for filtering in Grafana (e.g., `{service="app", level="ERROR"}`).

User: make the changes needed and update the containers

GitHub Copilot: 

 

Replacing 15 lines with 10 lines in [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/promtail-config.yml)


```

```
Now let me rebuild and restart the containers: 

Ran terminal command: docker compose down

Ran terminal command: docker compose up --build -d

All containers are up. Let me verify they're healthy: 

Ran terminal command: docker compose ps

All 5 containers are running:

| Container | Status | Port |
|-----------|--------|------|
| **insight311-app** | Up (health starting — ML models loading) | `8311` |
| **insight311-grafana** | Up | `3000` |
| **insight311-loki** | Up | `3100` |
| **insight311-prometheus** | Up | `9090` |
| **insight311-promtail** | Up | — |

The Promtail config has been updated from JSON parsing to regex parsing to match the new plain-text log format. You can view logs in Grafana at `http://localhost:3000` (admin/admin) and filter by `{service="app", level="INFO"}` or `{service="app", logger="insight311.main"}`.

Made changes.

User: start the frontend

GitHub Copilot: 

 

Explore frontend startup commands

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/citizen-app)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/vite.config.js)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/package.json)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/voice_ui/start_ui.py)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/voice_ui)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/citizen-app/android)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/citizen-app/src)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/voice_ui/index.html#1-1), lines 1 to 100

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/voice_ui/app.js#1-1), lines 1 to 50

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src)

Searched for regex `package.json|react-native|expo` (`**/ui/citizen-app/**`), no results

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/index.html)

Searched for files matching `**/ui/citizen-app/**/package.json`, no matches

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/README.md#1-1), lines 1 to 40

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/README.md#1-1), lines 1 to 80

Searched for files matching `**/ui/citizen-app/**`, 7 matches

Searched for regex `App|main` (`**/ui/web-agent/src/**`), 5 results

The main web frontend is in web-agent. Let me start it: 

Ran terminal command: cd ui/web-agent; npm install

Dependencies are already installed. Starting the dev server: 

Ran terminal command: npm run dev

The terminal lost its working directory. Let me fix that: 

Ran terminal command: Set-Location "c:\Conestoga Projects\Integration\insight311_jj\insight311\ui\web-agent"; npm run dev

Frontend is running at **http://localhost:5173/**. 

Your full stack is now up:
- **Backend API:** http://localhost:8311
- **Web Frontend:** http://localhost:5173
- **Grafana (logs/metrics):** http://localhost:3000 (admin/admin)
- **Prometheus:** http://localhost:9090

User: why do i have to start the frontend seperately ? Can all the services be initiated when the app is being run

GitHub Copilot: 

Good question. Right now the frontend is **not included in your Docker Compose** setup. Your docker-compose.yml only defines these 5 services:

1. `app` (FastAPI backend)
2. `prometheus`
3. `grafana`
4. `loki`
5. `promtail`

The React frontend in web-agent is completely separate — it has to be started manually with `npm run dev`.

### How to fix it

You can add the frontend as a service in docker-compose.yml so it starts alongside everything else with a single `docker compose up`. You'd add something like:

```yaml
  # ── Web Frontend (React + Vite) ────────────────────────
  web-ui:
    image: node:20-slim
    container_name: insight311-web-ui
    working_dir: /app
    ports:
      - "5173:5173"
    volumes:
      - ./ui/web-agent:/app
      - web-ui-node-modules:/app/node_modules
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0"
    depends_on:
      - app
    restart: unless-stopped
```

And add the volume at the bottom:
```yaml
volumes:
  web-ui-node-modules:
  # ...existing volumes...
```

Key details:
- `--host 0.0.0.0` is needed so Vite listens outside the container (not just localhost)
- `depends_on: app` ensures the backend starts first
- The named volume for `node_modules` avoids conflicts between host/container dependencies

After this change, `docker compose up` would start **everything** — backend, frontend, and all monitoring — in one command.

Want me to add this to your Docker Compose file?

User: yes, add it to the docker compose file 

GitHub Copilot: I don't have file editing tools available in this mode. Here's the exact changes for docker-compose.yml:

**1. Add this service block after the `promtail` service (before the `volumes:` section):**

```yaml
  # ── Web Frontend (React + Vite) ────────────────────────
  web-ui:
    image: node:20-slim
    container_name: insight311-web-ui
    working_dir: /app
    ports:
      - "5173:5173"
    volumes:
      - ./ui/web-agent:/app
      - web-ui-node-modules:/app/node_modules
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0"
    depends_on:
      - app
    restart: unless-stopped
```

**2. Add `web-ui-node-modules:` to the `volumes:` section at the bottom:**

```yaml
volumes:
  prometheus-data:
  grafana-data:
  loki-data:
  whisper-cache:
  hf-cache:
  web-ui-node-modules:
```

After making these changes, run:
```powershell
docker compose down
docker compose up --build -d
```

Then everything — backend, frontend, and monitoring — starts with one command. The frontend will be at **http://localhost:5173**.

User: make the changes as per the suggestion

GitHub Copilot: Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/docker-compose.yml#80-80), lines 80 to 94

Replacing 10 lines with 26 lines in [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/docker-compose.yml)


```

```
Now let me restart everything with the new configuration: 

Ran terminal command: docker compose down

Ran terminal command: docker compose up --build -d

Ran terminal command: docker compose ps

All 6 containers are up and running. Now a single `docker compose up` starts everything:

| Service | URL |
|---------|-----|
| **Web Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:8311 |
| **Grafana** | http://localhost:3000 |
| **Prometheus** | http://localhost:9090 |
| **Loki** | http://localhost:3100 |
| **Promtail** | (internal log shipper) |

Made changes.

User: can you view the dashboard http://localhost:3000/d/insight311-main/insight-311-dashboard?orgId=1&from=now-1h&to=now&timezone=browser&refresh=10s

GitHub Copilot: 

 



Fetched http://localhost:3000/d/insight311-main/insight-311-dashboard?orgId=1&from=now-1h&to=now&timezone=browser&refresh=10s

I can't view the dashboard directly — Grafana requires authentication and it redirected to the login page. I can't interact with web UIs that need login sessions.

However, I can verify the dashboard is accessible by checking the Grafana API with credentials: 



Fetched http://admin:admin@localhost:3000/api/dashboards/uid/insight311-main



Fetched http://localhost:3000/api/health

I can't view the Grafana dashboard visually — I don't have the ability to render web UIs or bypass authentication. But I can confirm:

- **Grafana is running** (v12.4.1, database: ok)
- The dashboard exists at `/d/insight311-main/insight-311-dashboard`

To access it yourself:
1. Open **http://localhost:3000** in your browser
2. Login with **admin** / **admin**
3. Navigate to the dashboard (or use your full URL)

You should see panels for: Request Rate, Request Latency (p95), Error Rate, Active Sessions, Sessions Created, Escalations, Tickets by Category, NLU Confidence, NLU/STT/Turn latencies, and Application Logs.

User: the problem is that I am unable to view the logs

GitHub Copilot: 

Let me diagnose the issue step by step.I don't have the terminal tool available right now. Let me check via the web fetch approach and file inspection.  





Fetched http://localhost:3100/ready

Fetched http://localhost:3100/loki/api/v1/query?query={service="app"}&limit=5



Fetched http://localhost:3100/loki/api/v1/labels

Found the issue. Loki is up but has **no labels** like `service`, `container`, or `job` — only the default `service_name`. This means **Promtail is not successfully shipping logs to Loki**.

Let me check the Promtail and app container logs. I need terminal access for that. 



Fetched http://localhost:9080/ready

I don't have `run_in_terminal` available right now. Let me check the configs more carefully — the issue is likely in the Promtail configuration or Docker socket access on Windows.  

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/promtail-config.yml)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/docker-compose.yml#75-75), lines 75 to 95

Here's the problem. **You're running on Windows**, and the Promtail config uses:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

with `docker_sd_configs` that connects to `unix:///var/run/docker.sock`. **This only works on Linux.** On Windows with Docker Desktop, the Docker socket path is different, and `docker_sd_configs` often doesn't work reliably.

### The Fix

The most reliable approach on Windows is to switch Promtail from Docker service discovery (`docker_sd_configs`) to **reading Docker container logs directly via the Docker log driver**. But the simplest fix that works cross-platform is to have the app container write logs to a shared volume and have Promtail read from that file instead.

However, there's actually a simpler path — **Docker Desktop for Windows does expose the Docker socket at the Linux path inside WSL2 containers**. The issue might be that Loki wasn't fully ready when Promtail started trying to push.

Let me check if you can run these diagnostic commands in your terminal:

```powershell
# Check if Promtail is erroring
docker compose logs promtail --tail=20

# Check if the app is producing logs
docker compose logs app --tail=10

# Check Loki readiness
docker compose logs loki --tail=20
```

Can you run `docker compose logs promtail --tail=20` and share the output? That will tell us exactly why logs aren't reaching Loki — whether it's a socket access issue, a config parsing error, or a connectivity problem.

User: Start implementation

GitHub Copilot: 

Let me diagnose and fix the log pipeline. 

Ran terminal command: Set-Location "c:\Conestoga Projects\Integration\insight311_jj\insight311"; docker compose logs promtail --tail=30

Promtail discovered 6 Docker targets (all containers). Now let me check if Loki is receiving data:  

Ran terminal command: docker compose logs loki --tail=20

I can see Loki executed a query for `{service="app"}` and returned `total_entries=1`. So data IS there, but the label query only found `service_name`. Let me check what labels actually exist: 

Ran terminal command: docker compose logs app --tail=5

App logs look correct with the new format. Now let me query Loki to find out what labels are available:  

Ran terminal command: Invoke-RestMethod -Uri "http://localhost:3100/loki/api/v1/labels" | ConvertTo-Json

Only `service_name` exists — meaning the `container`, `service`, `level`, and `logger` labels from Promtail relabeling aren't being applied. The relabel configs that set `service` from Docker Compose labels are not working. Let me check what Promtail targets look like:  

Ran terminal command: Invoke-RestMethod -Uri "http://localhost:9080/targets" -ErrorAction SilentlyContinue | Out-String -Width 500 | Select-Object -First 80
Completed with input: Invoke-RestMethod -Uri "http://localhost:9080/targets" -ErrorAction SilentlyContinue | Out-String -Width 500 | Select-Object -First 80

Promtail's port (9080) isn't exposed to the host. Let me check targets via docker exec: 

Ran terminal command: docker exec insight311-promtail wget -q -O - http://localhost:9080/targets 2>$null | Select-String -Pattern "insight311" | Select-Object -First 20
Completed with input: docker exec insight311-promtail wget -q -O - http://localhost:9080/targets 2>$null | Select-String -Pattern "insight311" | Select-Object -First 20

Ran terminal command: docker exec insight311-promtail wget -q -O - "http://localhost:9080/api/v1/targets" 2>&1 | Select-Object -First 40
Completed with input: docker exec insight311-promtail wget -q -O - "http://localhost:9080/api/v1/targets" 2>&1 | Select-Object -First 40

Ran terminal command: docker exec insight311-promtail curl -s "http://localhost:9080/targets" 2>&1 | Select-Object -First 40
Completed with input: docker exec insight311-promtail curl -s "http://localhost:9080/targets" 2>&1 | Select-Object -First 40

Ran terminal command: docker exec insight311-promtail /usr/bin/promtail -print-config-stderr -config.file=/etc/promtail/config.yml 2>&1 | Select-String -Pattern "service|container|regex|label" | Select-Object -First 20
Completed with input: docker exec insight311-promtail /usr/bin/promtail -print-config-stderr -config.file=/etc/promtail/config.yml 2>&1 | Select-String -Pattern "service|container|regex|label" | Select-Object -First 20

Let me try a different approach — query Loki with a broader label to see what's stored:  

Ran terminal command: Invoke-RestMethod -Uri "http://localhost:3100/loki/api/v1/label/service_name/values" | ConvertTo-Json

Ran terminal command: $encoded = [uri]::EscapeDataString('{service_name="unknown_service"}'); Invoke-RestMethod -Uri "http://localhost:3100/loki/api/v1/query?query=$encoded&limit=3" | ConvertTo-Json -Depth 10
Completed with input: $encoded = [uri]::EscapeDataString('{service_name="unknown_service"}'); Invoke-RestMethod -Uri "http://localhost:3100/loki/api/v1/query?query=$encoded&limit=3" | ConvertTo-Json -Depth 10

Ran terminal command: $encoded = [uri]::EscapeDataString('{service_name="unknown_service"}'); Invoke-RestMethod -Uri "http://localhost:3100/loki/api/v1/query_range?query=$encoded&limit=3" | ConvertTo-Json -Depth 10

Read [](file:///c%3A/Users/joseg/AppData/Roaming/Code/User/workspaceStorage/b5186481dd82ea79fbf9b3032c42eb02/GitHub.copilot-chat/chat-session-resources/507b1947-203a-456f-9df4-6b5c73b1dd28/toolu_bdrk_01PpVd2Gh5zZt5e3BKcKGskW__vscode-1774276112885/content.txt#1-1), lines 1 to 30

Now I can see the problem clearly. Loki is receiving logs but they only have `service_name: "unknown_service"` — the Promtail `service` and `container` relabel labels aren't being stored in Loki. The `docker_sd_configs` is discovering containers but the relabel config produces labels that Loki doesn't recognize as stream labels.

The issue is that newer versions of Promtail with Docker SD require the labels to actually be present in the stream. Let me check what Promtail actually sends by looking at all label names more carefully: 

Ran terminal command: $encoded = [uri]::EscapeDataString('{service_name=~".+"}'); Invoke-RestMethod -Uri "http://localhost:3100/loki/api/v1/series?match%5B%5D=$encoded" | ConvertTo-Json -Depth 5 | Select-Object -First 60

Only one stream with a single label. The relabeled labels (`service`, `container`) from Promtail are NOT being stored. This confirms the `docker_sd_configs` relabeling isn't working properly — likely because on Docker Desktop for Windows, the Docker container metadata labels differ from what the regex expects.

The root fix: switch Promtail from `docker_sd_configs` (which is unreliable on Docker Desktop for Windows) to reading Docker container log files directly. Let me also add the app's logging driver to output to a file that Promtail can scrape:  

Created 3 todos

Ran terminal command: docker inspect insight311-app --format '{{.LogPath}}'

Docker stores logs at `/var/lib/docker/containers/` inside the WSL2 VM. The most reliable approach on Docker Desktop for Windows is to mount the Docker containers log directory and use a file-based scrape config. Let me update the configs:   

Replacing 44 lines with 45 lines in [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/promtail-config.yml), [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/monitoring/grafana/provisioning/dashboards/insight311.json)


```

```

```

```


Starting: *Rebuild and verify logs in Grafana* (3/3)

Now rebuild and restart:  

Ran terminal command: docker compose down; docker compose up --build -d

Containers are up. Let me wait a few seconds for Promtail to start scraping, then verify:  

Ran terminal command: Start-Sleep -Seconds 15; Invoke-RestMethod -Uri "http://localhost:3100/loki/api/v1/labels" | ConvertTo-Json

Labels are now correctly populated in Loki. Let me verify we can query app logs:   

Ran terminal command: $encoded = [uri]::EscapeDataString('{container="insight311-app"}'); $result = Invoke-RestMethod -Uri "http://localhost:3100/loki/api/v1/query_range?query=$encoded&limit=3"; $result.data.result | ForEach-Object { $_.stream | ConvertTo-Json -Compress; $_.values | ForEach-Object { $_[1] } }

Everything is working. Logs now show the correct labels:

- `container`: `insight311-app`
- `service`: `app`
- `level`: `INFO`
- `logger`: `insight311.main` 

Completed: *Rebuild and verify logs in Grafana* (3/3)

The log pipeline is now working. Here's what was fixed:

**Problem:** The Promtail `relabel_configs` regex `"insight311-.*"` didn't match container names because Docker prefixes them with `/` (e.g. `/insight311-app`). So no labels were applied and logs went to Loki as `unknown_service` with no `container`, `service`, `level`, or `logger` labels.

**Fixes applied:**
1. **promtail-config.yml** — Changed regex from `"insight311-.*"` to `"/?(insight311-.*)"` to strip the leading `/`. Also fixed the `container` relabel to capture the name without `/`. Updated the pipeline `match` selector from `{service="app"}` to `{container="insight311-app"}` for reliability.
2. **insight311.json** — Updated the Logs panel query to `{container="insight311-app"}`.

**You can now view logs in Grafana:**
- Go to **http://localhost:3000** → login with **admin/admin**
- Open the **INSIGHT-311 Dashboard** — the "Application Logs" panel at the bottom now shows logs
- Or go to **Explore → Loki** and query: `{container="insight311-app"}`
- Filter by level: `{container="insight311-app", level="ERROR"}`
- Filter by logger: `{container="insight311-app", logger="insight311.main"}`

Made changes.

User: push the latest images to docker hub

GitHub Copilot: 

Before pushing, I need to know your Docker Hub username to tag the images correctly. Let me first check what images are built locally and if you're logged in: 

Ran terminal command: docker images | Select-String "insight311"

You have the `insight311-app:latest` image. To push to Docker Hub, I need your **Docker Hub username** (e.g., `yourusername/insight311-app`). 

Are you logged in? And what's your Docker Hub username?

User: 9082825 , I am logged in

GitHub Copilot: Ran terminal command: docker tag insight311-app:latest 9082825/insight311-app:latest

Ran terminal command: docker push 9082825/insight311-app:latest
Completed with input: docker push 9082825/insight311-app:latest

Got a temporary 502 error from Docker Hub's auth service. Let me retry:  

Ran terminal command: docker push 9082825/insight311-app:latest

Pushed successfully. Your image is now available at **docker.io/9082825/insight311-app:latest**.

User: Explain the components used to build the GUI in this project

GitHub Copilot: 

 

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/citizen-app/src)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/package.json)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/voice_ui/index.html#1-1), lines 1 to 30

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/components)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/pages)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/api)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/main.jsx)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/App.jsx)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/utils)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/data)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/mock)

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/api/client.js#1-1), lines 1 to 50

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/voice_ui/app.js#1-1), lines 1 to 100

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/web-agent/src/styles.css#1-1), lines 1 to 60

Read [](file:///c%3A/Conestoga%20Projects/Integration/insight311_jj/insight311/ui/voice_ui/start_ui.py)

The project has **three GUIs**, each built with a different technology stack:

---

## 1. Web Agent Dashboard (web-agent)
The primary operational UI — a single-page application for operators and supervisors.

**Core Framework & Build:**
| Component | Technology |
|-----------|-----------|
| UI Library | **React 19.2** (JSX, functional components) |
| Build Tool | **Vite 7.2** (dev server + bundler) |
| Routing | **React Router DOM 7.13** (nested `<Routes>`) |
| HTTP Client | **Axios 1.13** + custom `fetch` wrapper in client.js |
| Linting | **ESLint 9** with React Hooks + React Refresh plugins |

**Styling:** Pure **custom CSS** with CSS variables — no UI framework (no Material UI, no Tailwind). Defined in styles.css using:
- CSS custom properties (`--brand1`, `--brand2`, etc.)
- Google Fonts: **Inter** and **Poppins**
- Accessibility toggles (large text mode)

**Pages** (11 routes in App.jsx):
| Page | Role |
|------|------|
| `LandingPage` | Public homepage |
| `LoginPage` | Auth gate |
| `PublicRequestPage` | Citizens submit issues |
| `PublicLookupPage` | Citizens look up ticket status |
| `CitizenStatusPage` | Citizen ticket tracking |
| `DashboardLayout` | Protected operator shell (sidebar + outlet) |
| `IntakePage` | Main work queue with 3 views (My Work / Overview / Manual Ticket) |
| `TicketDetailsPage` | Single ticket detail view |
| `DuplicatesPage` | Duplicate ticket detection |
| `StatusLookupPage` | Internal status search |

**Components** (21 custom components):
| Component | Purpose |
|-----------|---------|
| `HeaderBar` | Top navigation bar |
| `TicketTable` / `TicketTableControls` | Ticket list with sorting/filtering |
| `TicketForm` | Manual ticket creation form |
| `TicketDetailsDrawer` | Slide-out ticket detail panel |
| `TicketStatusOverview` / `TicketReportsPanel` | Stats and reporting |
| `VoiceIntakePanel` | AI voice bot integration panel |
| `AudioLevelMeter` | Real-time audio level visualization |
| `ConfidenceBadge` / `ToneBadge` / `StatusBadge` | Visual indicators for NLU confidence, sentiment, status |
| `DonutChart` | Category/status chart |
| `FiltersBar` | Ticket filter controls |
| `Toast` / `ToastProvider` | Notification system (React Context) |
| `RequireAuth` | Route guard (protected routes) |
| `SessionHistory` | Conversation history display |
| `PublicHeader` / `PublicFooter` / `Floating311Button` | Public-facing layout components |
| `TicketViewDropdown` | View selector dropdown |

**State Management:** No external library — uses **React built-in state** (`useState`, `useContext`) plus utility modules in `utils/` (`ticketStore.js`, `ticketWorkflow.js`, `routing.js`).

---

## 2. Voice UI (voice_ui)
A standalone voice assistant simulation interface.

| Component | Technology |
|-----------|-----------|
| Markup | **Vanilla HTML** (index.html) |
| Logic | **Vanilla JavaScript** (app.js) — no framework |
| Styling | **Custom CSS** (style.css) |
| Icons | **Ionicons 7.1** (via CDN) |
| Fonts | **Google Fonts (Inter)** |
| Server | **Python `http.server`** (start_ui.py) — serves static files on port 8000 |
| Audio | **Web Audio API** (`MediaRecorder`, `AudioContext`, `AnalyserNode`) for browser-based recording |
| Backend Comm | **Fetch API** calling `http://localhost:8311/api` (orchestrator + voice endpoints) |

Features: live microphone recording with silence detection, audio visualizer with pulse ring, chat bubble UI, real-time entity display (category, location, name, phone), developer view toggle.

---

## 3. Citizen App (citizen-app)
**Not implemented** — contains only empty placeholder directories (`screens/`, `components/`, `navigation/`) with `.gitkeep` files. Intended to be a **React Native** mobile app (has `android/` and `ios/` folders) but no actual source code exists.

---

### Summary

| GUI | Tech Stack | Status |
|-----|-----------|--------|
| **Web Agent** | React 19 + Vite + React Router + Custom CSS | Fully built |
| **Voice UI** | Vanilla HTML/JS/CSS + Web Audio API | Fully built |
| **Citizen App** | React Native (planned) | Placeholder only |

User: whats the GUI for voice UI

GitHub Copilot: 

The Voice UI is a **vanilla HTML/CSS/JavaScript** web interface — no framework. Here's the breakdown:

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Markup | Single index.html file |
| Logic | Plain JavaScript in app.js — DOM manipulation, Fetch API |
| Styling | Custom CSS in style.css with glassmorphism theme |
| Icons | **Ionicons 7.1** (loaded via CDN) |
| Fonts | **Google Fonts — Inter** (400/500/600/700 weights) |
| Audio | **Web Audio API** — `MediaRecorder`, `AudioContext`, `AnalyserNode` for browser mic recording |
| Server | Python `http.server` in start_ui.py — serves static files on port 8000 |

### UI Layout
- **Header bar** — Logo, "Dev View" toggle button, connection status badge, Call/End buttons
- **Chat panel** — Scrolling message bubbles (AI vs. You), similar to a chat app
- **Audio visualizer** — Animated pulse ring that changes color:
  - Red = recording (mic active)
  - Purple = thinking (processing)
- **State panel** (developer view, togglable) — Shows session ID, current state, turn count, ticket ID, and extracted entities (category, location, name, phone)

### How It Works
1. User clicks **Call** → initializes a session via `POST /api/orchestrator/initialize`
2. AI greeting plays → browser starts recording via `MediaRecorder`
3. Silence detection (2s threshold) auto-stops recording
4. Audio sent as `.webm` to `POST /api/voice/process_audio`
5. Response comes back as WAV audio + headers (`X-Transcript`, `X-Response-Text`, `X-Current-State`)
6. Audio plays, chat bubbles update, entity display updates
7. Loop continues until state reaches `SUBMITTED` or `ESCALATED`

**No build step required** — it's pure static files served by Python's built-in HTTP server.

User: how do i view it in the browser

GitHub Copilot: 

The Voice UI isn't included in Docker Compose — it's a standalone static site. You have two options:

### Option 1: Run it locally
```powershell
cd "c:\Conestoga Projects\Integration\insight311_jj\insight311\ui\voice_ui"
python start_ui.py
```
Then open **http://127.0.0.1:8000** in your browser.

### Option 2: Use the Web Agent dashboard instead
The React dashboard is already running in Docker at **http://localhost:5173** — it includes a `VoiceIntakePanel` component with similar voice functionality built in.

---

The Voice UI requires the backend to be running on port 8311 (which it is via Docker) since app.js connects to `http://localhost:8311/api`.

User: http://localhost:8311/api give {"detail":"Not Found"}

GitHub Copilot: 

That's expected. There's no route registered at `/api` — it's just a prefix. The actual endpoints are:

Consolidated URL list:
| URL | What it does |
|-----|-------------|
| http://localhost:8311/ | Health check |
| http://localhost:8311/docs | Swagger UI (interactive API docs) |
| http://localhost:8311/api/orchestrator/initialize | Start a session (POST) |
| http://localhost:8311/api/orchestrator/process | Process a turn (POST) |
| http://localhost:8311/api/orchestrator/session/{id} | Get session info (GET) |
| http://localhost:8311/api/tickets/ | List/create tickets (GET/POST) |
| http://localhost:8311/api/voice/process_audio | Process audio (POST) |
| http://localhost:8311/api/voice/synthesize | Text-to-speech (POST) |
| http://localhost:8311/metrics | Prometheus metrics |

Open **http://localhost:8311/docs** in your browser to see all available endpoints with an interactive test interface.