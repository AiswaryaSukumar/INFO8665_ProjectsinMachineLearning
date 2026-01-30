# Prototype README — Use Case 1  
## AI-Assisted 311 Voice Intake (Simulation)

### Course Context

This prototype supports **Use Case 1** of the INSIGHT-311 project for **INFO8665 – Projects in Machine Learning** and **CSCN8030 – Artificial Intelligence for Business Decisions & Transformation**.

The goal is to **demonstrate an end-to-end AI-assisted intake workflow** for municipal 311 service requests using **simulation artifacts**, not full production infrastructure.

---

## Purpose of the Prototype

This prototype demonstrates how an AI-assisted system can:

- Accept citizen issue descriptions via a **voice-like interaction**
- Convert speech to text (simulated)
- Classify the request using **NLP logic**
- Apply **confidence-based escalation rules**
- Automatically create a structured service ticket
- Maintain a **governance-grade audit trail**

The focus is on **decision support, transparency, and accountability**, not model optimization.

---

## Folder Structure Overview

```
prototype/
├── voicebot_script/
│   └── dialogue.md
├── stt_mock/
│   └── stt_mock.md
├── nlp_mock/
│   ├── classifier_rules.md
│   └── decision_rules.md
├── ticket_api_mock/
│   └── tickets/
│       └── sample_ticket_001.json
├── audit_log/
│   └── audit.jsonl
└── README.md
```
  

---

## Component Descriptions

### 1️⃣ Voice Bot Script (`voicebot_script/`)

**File:** `dialogue.md`

Defines the conversational flow used during a simulated 311 phone call:

- Greeting
- Issue description capture
- Location capture
- AI summary and human confirmation
- Clarification and correction handling

This represents the **human-in-the-loop control point**.

---

### 2️⃣ Speech-to-Text Mock (`stt_mock/`)

**File:** `stt_mock.md`

Simulates speech-to-text behavior:

- Input: citizen’s spoken issue (typed for demonstration)
- Output: text transcript

No real telephony or STT engine is used — this is a **conceptual stand-in**.

---

### 3️⃣ NLP Classification Mock (`nlp_mock/`)

**Files:**
- `classifier_rules.md`
- `decision_rules.md`

Implements a **rules-based NLP classifier**:

- Maps keywords to predefined service categories
- Generates a confidence score
- Applies escalation rules based on confidence, sensitivity, or emergency indicators

This design allows easy replacement with ML-based classifiers in future iterations.

---

### 4️⃣ Ticket Creation Mock (`ticket_api_mock/`)

**File:** `sample_ticket_001.json`

Represents the **system output**:

- Structured 311 service ticket
- Includes category, description, location, confidence, and escalation status

Tickets are stored as JSON files to simulate backend persistence.

---

### 5️⃣ Audit Log (`audit_log/`)

**File:** `audit.jsonl`

Maintains a **line-by-line audit trail** capturing:

- Speech-to-text completion
- Classification decisions
- Human confirmation
- Escalation logic
- Ticket creation

This supports **public-sector governance, traceability, and explainability**.

---

## End-to-End Flow (Conceptual)

1. Citizen describes an issue via phone (simulated)
2. Speech is converted to text
3. NLP classifier predicts a category with confidence
4. System requests human confirmation
5. Escalation rules are evaluated
6. A service ticket is created
7. All actions are logged in the audit trail

---

## Scope Notes

- This is a **prototype**, not a production system
- All AI components are **simulated or rules-based**
- No real personal data, telephony, or live ML models are used
- Design prioritizes **clarity, governance, and decision support**

---

## Possible Extensions (Out of Scope for This Assignment)

- Replace rules-based classifier with TF-IDF + Logistic Regression
- Integrate real speech-to-text services
- Add duplicate request detection
- Add citizen-facing status visibility (Use Case 3)

---

