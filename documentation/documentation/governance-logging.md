# INSIGHT-311 — Governance & Audit Logging (Use Case 1)

**Purpose:**  
This document defines how INSIGHT-311 ensures accountability, transparency, and public-sector governance for AI-assisted 311 phone intake.

The logging framework ensures that all AI recommendations remain auditable, explainable, and reviewable by municipal staff.

---

## 1) Why Governance Logging is Required (Public-Sector Context)

Municipal decision-support systems must comply with:
- Transparency requirements
- Accountability standards
- Human-in-the-loop oversight
- Audit and review obligations

INSIGHT-311 does **not** automate decisions.  
Instead, it logs AI recommendations alongside human confirmations to support safe adoption.

---

## 2) What is Logged During a 311 Call

Each intake interaction generates a **governance log record** linked to the service request.

### A) Call Metadata
- Call_ID
- Timestamp
- Channel (phone)
- Language (if detected)
- Agent_ID (if applicable)

---

### B) AI Recommendation Record
- Predicted_Category
- Confidence_Score
- Explanation_Snippet (keywords or phrases influencing prediction)
- Model_Version (prototype identifier)

This allows post-hoc review of **why** a category was suggested.

---

### C) Human-in-the-Loop Decisions
- Caller_Confirmed_Category (Yes / No)
- Final_Category (agent-confirmed)
- Clarification_Count
- Agent_Override (Yes / No)
- Override_Reason (if applicable)

This explicitly preserves **human authority**.

---

### D) Escalation & Safety Signals
- Escalated_To_Human (Yes / No)
- Escalation_Reason:
  - Low confidence
  - Emergency phrase detected
  - Unknown category
  - Caller uncertainty
- Emergency_Detected (Yes / No)
- Emergency_Phrase (if detected)

Emergency-related records are flagged for priority review.

---

## 3) Governance Principles Enforced

INSIGHT-311 enforces the following principles:

- **Traceability:** Every AI suggestion can be traced to a call and outcome  
- **Explainability:** Confidence scores and explanation snippets are retained  
- **Human Oversight:** AI cannot finalize tickets without confirmation  
- **Non-Retention of Audio:** Voice recordings are not retained in the prototype  
- **Bias Review Support:** Logs can be sampled for fairness analysis  

---

## 4) Relationship to Other Use Cases

Governance logs generated in Use Case 1 support:

- **Use Case 2:** Duplicate detection analysis
- **Performance monitoring:** Confidence vs override trends
- **Policy review:** Category routing effectiveness
- **Model improvement:** Identifying low-confidence patterns

---

## 5) Academic & Ethical Positioning

This governance model aligns with:
- Decision Support System (DSS) theory
- Ethical AI deployment principles
- Public-sector AI risk management expectations

INSIGHT-311 demonstrates how AI can be introduced responsibly into municipal workflows without removing human accountability.
