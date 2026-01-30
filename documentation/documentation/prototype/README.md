# INSIGHT-311 — Use Case 1 Prototype (Simulation-First)

## Purpose
This prototype demonstrates **AI-assisted 311 phone intake** in a professor-safe way (no telephony, no real ML required).
It shows how speech input can become a **structured ticket** with **human-in-the-loop confirmation** and **audit logging**.

## What this prototype includes
### 1) Voice Bot Script (Conversation Flow)
**Path:** `prototype/voicebot_script/dialogue.md`  
Defines the guided call flow: greeting → capture issue → capture location → confirm category → handle correction.

### 2) Speech-to-Text (STT) Mock
**Path (current):** `stt_mock/stt_mock.md`  
Simulates STT by treating typed text as the transcript output.

> Note: For clean structure, this can be moved later under `prototype/stt_mock/`.

### 3) NLP Classification (Rules-Based) + Confidence
**Path:** `prototype/nlp_mock/classifier_rules.md`  
Maps keywords/phrases → predicted category and a confidence score.

### 4) Escalation / Decision Rules (Human-in-the-loop)
**Path:** `prototype/nlp_mock/decision_rules.md`  
Defines when to escalate to a live agent (low confidence, emergency terms, repeated confusion, etc.).

### 5) Ticket Creation Mock (System Output)
**Path:** `prototype/ticket_api_mock/tickets/sample_ticket_001.json`  
Shows a structured ticket payload created from the transcript + confirmed classification.

### 6) Governance / Audit Log (Public Sector Accountability)
**Path:** `prototype/audit_log/audit.jsonl`  
JSON Lines (one JSON per line) capturing: STT completion → classification → human confirmation → escalation decision → ticket created.

## End-to-end Flow (How it connects)
1. Caller speaks (simulated as text input)
2. STT mock outputs transcript
3. Classifier predicts category + confidence
4. Human confirmation step validates/edits the prediction
5. Decision rules determine escalation (if needed)
6. Ticket payload is generated (saved JSON)
7. Audit entries are recorded for traceability

## How to demo (quick)
Use the scenarios in `prototype/demo_scenarios.md` to walk through:
transcript → predicted category → confirmation → ticket created → audit entries.
