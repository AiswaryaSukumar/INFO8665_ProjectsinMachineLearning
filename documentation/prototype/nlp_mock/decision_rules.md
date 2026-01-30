# INSIGHT-311 — Decision & Escalation Rules (Use Case 1)

**Purpose:** Define when the AI-assisted intake should escalate to a human agent and why.

This supports governance, safety, and public-sector accountability.

---

## 1) Escalate to Human if ANY of the following are true

### A) Low confidence
- `confidence_score < 0.70`

### B) Caller correction
- Caller says the category is incorrect (`Caller_Confirmed_Category = No`)
- Agent changes the category (`Corrected_Category` is used)

### C) Too many clarifications
- `Clarification_Count >= 2`

### D) Unknown category
- `predicted_category = "Unknown / Needs Human Review"`

### E) Emergency language detected (immediate handoff)
If transcript contains any of:
- fire, weapon, gun, bomb, someone hurt, bleeding, emergency, attack, danger

**System behavior:**
- Do NOT auto-create ticket
- Escalate immediately
- Recommend: "Please stay on the line while I connect you to an operator."

---

## 2) Auto-create Ticket if ALL are true
- `confidence_score >= 0.70`
- Caller confirms category + location
- No emergency trigger terms detected

---

## 3) Audit Log Fields to Record (required)
- transcript_text
- predicted_category
- confidence_score
- matched_terms / explanation_snippet
- caller_confirmed_category (yes/no)
- escalation_decision (yes/no)
- escalation_reason (if yes)
- final_category (after agent confirmation)
