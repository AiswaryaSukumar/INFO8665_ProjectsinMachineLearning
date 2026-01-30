# INSIGHT-311 — Speech-to-Text (STT) Mock
**Use Case:** Voice-Based 311 Intake (Use Case 1)

---

## 1) Purpose

This document simulates the **Speech-to-Text (STT)** component of INSIGHT-311.

In the prototype phase:
- No real audio or telephony is used
- Caller speech is **represented as typed text**
- The output is treated as the **STT transcript**

This keeps the system:
- Lightweight
- Explainable
- Academically appropriate

---

## 2) STT Mock Input

**Source:**  
Caller’s spoken description (simulated as text)

**Example Input:**
> “My garbage wasn’t picked up today and the bins are still outside my house at 55 King Street.”

---

## 3) STT Mock Output

**Transcript_Text:**
> “My garbage wasn’t picked up today and the bins are still outside my house at 55 King Street.”

**Transcript_Quality:** High  
**Language:** English  
**Timestamp:** System-generated

---

## 4) STT Assumptions (Prototype Scope)

- The transcript is assumed to be accurate
- Minor speech errors are ignored in this phase
- Noise handling and accents are out of scope
- Real STT engines (Azure, Google, Whisper) can replace this later

---

## 5) Downstream Usage

The STT output is passed to:
- NLP classification
- Confidence scoring
- Human confirmation
- Ticket creation
- Governance logging

This separation keeps STT **modular and replaceable**.

---

## 6) Why This Is Acceptable for a DSS Prototype

- Focuses on **decision support**, not speech engineering
- Matches real municipal pilot approaches
- Avoids unnecessary technical risk in early stages
- Clearly documents assumptions and limitations
