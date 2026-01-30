# INSIGHT-311 — Voice Bot Dialogue Script (Use Case 1)

**Purpose:**  
Defines the conversational flow for AI-assisted 311 phone intake.
This script represents a prototype-level, voice-first interaction with
human-in-the-loop confirmation and safety controls.

---

## 1) Greeting & Context

**System (Voice Bot):**  
“Thank you for calling 311. Please describe the issue you would like to report.”

---

## 2) Issue Description Capture

**Caller:**  
(Free speech describing the issue)

**System Action:**  
- Capture caller speech
- Forward input to Speech-to-Text (STT) module

---

## 3) Location Capture

**System (Voice Bot):**  
“Can you tell me the address, nearest intersection, or a nearby landmark?”

**Caller:**  
(Provides location verbally)

**System Action:**  
- Capture location text
- Associate location with issue description

---

## 4) AI Understanding & Confirmation (Human-in-the-loop)

**System (Voice Bot):**  
“I understood this as a **{predicted_category}** near **{location_text}**.  
Is that correct?”

**Caller Response Options:**
- “Yes”
- “No”

---

## 5A) Confirmation Path (Yes)

**System Action:**  
- Mark category as confirmed
- Proceed to ticket creation

**System (Voice Bot):**  
“Thank you. Your request has been recorded.”

---

## 5B) Correction Path (No)

**System (Voice Bot):**  
“Thank you for clarifying. Could you briefly describe the issue again, or tell me which category fits better?”

**System Action:**  
- Re-capture description
- Re-run classification
- Increment clarification count

---

## 6) Escalation Conditions (Safety Controls)

The system transfers to a human agent if:
- Confidence score < 0.70
- Emergency keywords detected (e.g., fire, weapon, injury)
- Caller is unsure after two clarification attempts
- Category = Unknown / Needs Human Review

**System (Voice Bot):**  
“Please hold while I connect you to an agent for further assistance.”

---

## 7) End of Call

**System Action:**  
- Either auto-create ticket (high confidence)
- Or escalate to human operator
