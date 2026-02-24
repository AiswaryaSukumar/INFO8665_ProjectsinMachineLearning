# INSIGHT-311 Voice Assistant (Demo)

This project is a voice-driven 311 call assistant that:

- Listens to the caller (speech-to-text).
- Analyzes the transcript with NLU (category, location, caller name, phone number, etc.).
- Orchestrates a multi-turn dialog to fill required fields and confirm the details.
- Creates and updates a ticket in the database and reads back the ticket ID.

---

## Main Components

- `src/api/ml_service.py`  
  Flask-based API service that exposes endpoints for:
  - NLU analysis
  - Orchestrator actions
  - Speech-to-text / text-to-speech integration

- `src/ai_orchestration/orchestrator.py`  
  Dialog manager:
  - Slot filling for required fields (`category`, `location`, `description`, `caller_name`, `phone_number`)
  - Confidence-score based logic (e.g., improving `category` when a better prediction appears)
  - Confirmation step and final ticket submission

- `scripts/test_call.py`  
  Command-line script that simulates a full 311 phone call:
  - Prompts you to speak on each turn
  - Sends audio/text to the API
  - Prints NLU results and the orchestrated responses
  - Shows the final collected ticket information

---

## Prerequisites

- Python 3.10+ (matching the existing `.venv`).
- A virtual environment for the project, with dependencies installed:

  ```bash
  python -m venv .venv
  .venv\Scripts\activate
  pip install -r requirements.txt


### PostgreSQL running, with the required tables and columns, for example:

tickets
including: ticket_id, session_id, ticket_status, category,
location, description, severity, caller_name, phone_number,
raw_issue_text, confirmed, mode, etc.

sessions

tts_results

(Adjust the schema as needed to match what update_ticket() writes.)

## How to Run the Demo
You will use two terminals from the project root folder.

1) Start the API Server
1. Open Terminal 1.

2. Go to the project root:
    cd C:\Users\jjh95\Desktop\2026-Winter\stt_oct_NLU\INFO8665_ProjectsinMachineLearning

3. Activate the virtual environment:
    .venv\Scripts\activate

4. Start the API service:
    python src/api/ml_service.py

Keep this terminal open and running.
This starts the Flask server that the test script will call.

2) Run the Call Simulation
1. Open Terminal 2 (new window or tab).

2. Again, go to the project root:
    cd C:\Users\jjh95\Desktop\2026-Winter\stt_oct_NLU\INFO8665_ProjectsinMachineLearning

3. Move into the scripts directory:
    cd scripts

4. Run the test call script:
    python test_call.py

5. Follow the prompts:

When you see Press Enter to start speaking..., press Enter and then speak your answer.

The script will show:

What you said (transcript).

NLU results (category, location, caller_name, phone_number, confidence scores).

The assistant’s response (next question or confirmation).

At the end, the script prints:

The final ticket number.

The collected fields (category, location, description, severity, caller_name,
phone_number, raw_issue_text, confirmed, mode, etc.).

### Notes for Team Members
If you change API or orchestrator logic (ml_service.py, orchestrator.py), restart Terminal 1.

If you change only test_call.py, just re-run the script in Terminal 2.

If you see database warnings like “column does not exist”, add the column to the tickets table or adjust which fields are written in update_ticket().
