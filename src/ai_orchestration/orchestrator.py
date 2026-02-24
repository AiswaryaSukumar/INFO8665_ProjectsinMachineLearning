# src/ai_orchestration/orchestrator.py
# Orchestrator — determines next action based on NLU result and collected fields

from typing import Dict, Any, List


REQUIRED_FIELDS = [
    "category",
    "location",
    "description",
    "caller_name",
    "phone_number",
]

FIELD_QUESTIONS = {
    "category":     "What type of issue are you reporting?",
    "location":     "Where exactly is the issue located?",
    "description":  "Can you describe the issue in more detail?",
    "caller_name":  "May I have your name please?",
    "phone_number": "What is the best phone number to reach you?",
}


def human_readable_field(field: str) -> str:
    """Map internal field keys to human-friendly labels for TTS."""
    mapping = {
        "category": "the issue type",
        "location": "the location",
        "description": "the description",
        "caller_name": "your name",
        "phone_number": "your phone number",
    }
    return mapping.get(field, field)


def initial_greeting() -> str:
    """Return opening greeting when call starts."""
    return (
        "Thank you for calling three one one city service. "
        "I am your AI assistant. If you’d like to speak with an agent, press 0. "
        "Please note there may be a wait depending on the situation. "
        "Please describe your issue and I will help you submit a request."
    )


def build_summary(collected_fields: Dict[str, Any]) -> str:
    """Build confirmation summary message from collected fields."""
    raw_category = collected_fields.get("category")
    raw_issue_text = collected_fields.get("raw_issue_text")

    # Map internal category codes to human-readable text
    category_display_map = {
        "pothole": "pothole",
        "property_standards": "property standards",
        "graffiti": "graffiti",
        "illegal_sign": "illegal sign",
        "litter": "litter",
        "needles": "discarded needles",
        "parking_complaint": "parking complaint",
        "sidewalk_snow": "sidewalk snow",
        "sidewalk_hazard": "sidewalk hazard",
        "trail_maintenance": "trail maintenance",
        "other": "other",
        None: "an",
    }

    if raw_category in category_display_map:
        category_text = category_display_map[raw_category]
    else:
        category_text = raw_category if raw_category else "an"

    location = collected_fields.get("location") or "an unknown location"
    description = collected_fields.get("description") or "no description provided"
    caller_name = collected_fields.get("caller_name") or "no name"
    phone_number = collected_fields.get("phone_number") or "no phone number"

    # Special handling for "other" category:
    # If we have the original user issue utterance, echo it back.
    if raw_category == "other" and raw_issue_text:
        issue_phrase = f"\"{raw_issue_text}\""
        issue_part = f"You said {issue_phrase} at {location}. "
    else:
        issue_part = f"You reported a {category_text} issue at {location}. "

    return (
        "For final confirmation, please check the following information. "
        f"{issue_part}"
        f"Your contact information is {caller_name} and {phone_number}. Is this all correct?"
    )


def spell_out(text: str) -> str:
    """
    Convert an ID into space-separated characters so TTS reads them one by one.
    Example: 'TKT-20260222-7015' -> 'T K T 2 0 2 6 0 2 2 2 7 0 1 5'
    """
    chars: List[str] = []
    for ch in text:
        if ch.isalnum():  # letters and digits only
            chars.append(ch)
    return " ".join(chars)


def map_severity_score_to_label(score: float | None) -> str | None:
    """Convert numeric severity score into 'low' / 'medium' / 'high'."""
    if score is None:
        return None
    if score < 0.5:
        return "low"
    if score < 0.8:
        return "medium"
    return "high"


def compute_overall_confidence(confidence_scores: Dict[str, float]) -> float:
    """
    Compute overall confidence as the average of available
    confidence scores for required fields.
    """
    scores: List[float] = [
        confidence_scores.get(f)
        for f in REQUIRED_FIELDS
        if confidence_scores.get(f) is not None
    ]
    if not scores:
        return 0.0
    return sum(scores) / len(scores)


def decide_action(
    nlu_result: dict,
    collected_fields: dict,
    ticket_id: str | None = None,
) -> dict:
    """
    Merge NLU result into collected fields.
    Handle required fields, low-confidence clarifications,
    confirmation, and corrections.
    """

    # Threshold for asking the caller a clarification question
    CLARIFICATION_CONFIDENCE_THRESHOLD = 0.3

    # Threshold for flagging low-confidence fields in the agent UI
    UI_LOW_CONFIDENCE_THRESHOLD = 0.5

    # Ensure we have a confirmed flag and mode in state
    if "confirmed" not in collected_fields:
        collected_fields["confirmed"] = False
    if "mode" not in collected_fields:
        collected_fields["mode"] = "slot_filling"  # or "confirmation"

    mode = collected_fields.get("mode", "slot_filling")

    # Extract confirm_result first from NLU
    confirm_result = nlu_result.get("confirm_result")
    correction_field = nlu_result.get("correction_field")
    correction_value = nlu_result.get("correction_value")

    # In slot_filling mode, completely ignore confirm_result from NLU
    if mode != "confirmation":
        confirm_result = None

    # Confidence information from NLU
    confidence_scores: Dict[str, float] = nlu_result.get("confidence_scores", {}) or {}

    # 1) Merge NLU extracted fields (slot filling only)
    if mode != "confirmation":
        for field in REQUIRED_FIELDS:
            value = nlu_result.get(field)

            # Category: update safely based on confidence
            if field == "category":
                if value:
                    new_conf = confidence_scores.get("category", 0.0)
                    old_value = collected_fields.get("category")
                    old_conf = collected_fields.get("_category_conf", 0.0)

                    # Rules:
                    #  - If there is no previous value, always set it.
                    #  - If previous value is "other", allow replacing when new confidence is higher or equal.
                    #  - If previous value is not "other", replace only when new confidence is strictly higher.
                    if (
                        old_value is None
                        or old_value == ""
                        or new_conf > old_conf
                        or (old_value == "other" and new_conf >= old_conf)
                    ):
                        collected_fields["category"] = value
                        collected_fields["_category_conf"] = new_conf
                continue

            # Other fields: keep only the first non-empty value
            if value and not collected_fields.get(field):
                collected_fields[field] = value

    # 1-b) Handle severity using numeric score → 'low' / 'medium' / 'high'
    severity_score = nlu_result.get("severity_score")

    if severity_score is None:
        confidence_scores_raw = nlu_result.get("confidence_scores", {}) or {}
        severity_score = confidence_scores_raw.get("severity")

    severity_label = map_severity_score_to_label(severity_score)
    if severity_label and not collected_fields.get("severity"):
        collected_fields["severity"] = severity_label

    # For UI: fields that are low-confidence from an agent perspective
    low_confidence_fields = [
        f for f in REQUIRED_FIELDS
        if confidence_scores.get(f, 1.0) < UI_LOW_CONFIDENCE_THRESHOLD
    ]

    # Overall confidence (average over required fields)
    overall_confidence = compute_overall_confidence(confidence_scores)

    # 2) If we already confirmed earlier, just submit
    if collected_fields.get("confirmed"):
        if ticket_id:
            spelled = spell_out(ticket_id)
            next_question = (
                f"Your ticket number is {spelled}. "
                "\n\n"
                "Thank you for your report. Goodbye."
            )
        else:
            next_question = (
                "Your report has been submitted. "
                "\n\n"
                "Thank you for your call. Goodbye."
            )

        return {
            "action":                 "submit",
            "next_question":          next_question,
            "missing_fields":         [],
            "collected_fields":       collected_fields,
            "ready_to_submit":        True,
            "overall_confidence":     overall_confidence,
            "low_confidence_fields":  low_confidence_fields,
        }

    # 3) Check for missing required fields (normal information phase)
    missing = [f for f in REQUIRED_FIELDS if not collected_fields.get(f)]

    if missing and mode != "confirmation" and not confirm_result:
        # We are still in normal slot-filling phase
        next_field = missing[0]
        next_question = FIELD_QUESTIONS[next_field]
        collected_fields["mode"] = "slot_filling"
        return {
            "action":                 "ask_question",
            "next_question":          next_question,
            "missing_fields":         missing,
            "collected_fields":       collected_fields,
            "ready_to_submit":        False,
            "overall_confidence":     overall_confidence,
            "low_confidence_fields":  low_confidence_fields,
        }

    # 3.5) All required fields are present, but some confidence is low → ask clarification
    # Only do this before we enter the explicit confirmation step
    if not missing and mode != "confirmation" and not confirm_result:
        clarify_fields = [
            f for f in REQUIRED_FIELDS
            if confidence_scores.get(f, 1.0) < CLARIFICATION_CONFIDENCE_THRESHOLD
        ]
        if clarify_fields:
            labels = [human_readable_field(f) for f in clarify_fields]

            if len(labels) == 1:
                fields_phrase = labels[0]
            else:
                fields_phrase = ", ".join(labels[:-1]) + f" and {labels[-1]}"

            clarification = (
                f"I am not fully confident about {fields_phrase}. "
                f"Could you please clarify or repeat them?"
            )

            collected_fields["mode"] = "slot_filling"
            return {
                "action":                 "ask_question",
                "next_question":          clarification,
                "missing_fields":         [],
                "collected_fields":       collected_fields,
                "ready_to_submit":        False,
                "overall_confidence":     overall_confidence,
                "low_confidence_fields":  low_confidence_fields,
            }

    # At this point, required fields are filled (or the caller is reacting to confirmation)

    # 4) Handle confirmation answers (only meaningful in confirmation mode)
    if mode == "confirmation" and confirm_result == "yes":
        collected_fields["confirmed"] = True

        if ticket_id:
            spelled = spell_out(ticket_id)
            next_question = (
                f"Your ticket number is {spelled}. "
                "Thank you for your report. Goodbye."
            )
        else:
            next_question = (
                "Your report has been submitted. "
                "Thank you for your call. Goodbye."
            )

        return {
            "action":                 "submit",
            "next_question":          next_question,
            "missing_fields":         [],
            "collected_fields":       collected_fields,
            "ready_to_submit":        True,
            "overall_confidence":     overall_confidence,
            "low_confidence_fields":  low_confidence_fields,
        }

    if mode == "confirmation" and confirm_result == "no":
        if correction_field and correction_value:
            collected_fields[correction_field] = correction_value

            summary = build_summary(collected_fields)
            return {
                "action":                 "confirm",
                "next_question":          summary,
                "missing_fields":         [],
                "collected_fields":       collected_fields,
                "ready_to_submit":        False,
                "overall_confidence":     overall_confidence,
                "low_confidence_fields":  low_confidence_fields,
            }
        else:
            clarification = (
                "I'm sorry about that. Which part is incorrect: the location, "
                "the description, or your contact information?"
            )
            return {
                "action":                 "ask_question",
                "next_question":          clarification,
                "missing_fields":         [],
                "collected_fields":       collected_fields,
                "ready_to_submit":        False,
                "overall_confidence":     overall_confidence,
                "low_confidence_fields":  low_confidence_fields,
            }

    # 5) No confirm_result yet, and all required fields are present:
    #    first time we enter confirmation phase → send summary
    if not missing and not collected_fields.get("confirmed"):
        summary = build_summary(collected_fields)
        collected_fields["mode"] = "confirmation"
        return {
            "action":                 "confirm",
            "next_question":          summary,
            "missing_fields":         [],
            "collected_fields":       collected_fields,
            "ready_to_submit":        False,
            "overall_confidence":     overall_confidence,
            "low_confidence_fields":  low_confidence_fields,
        }

    # Fallback: submit if everything looks complete
    if ticket_id:
        spelled = spell_out(ticket_id)
        next_question = (
            f"Your ticket number is {spelled}. "
            "Thank you for your report. Goodbye."
        )
    else:
        next_question = (
            "Your report has been submitted. "
            "Thank you for your call. Goodbye."
        )

    return {
        "action":                 "submit",
        "next_question":          next_question,
        "missing_fields":         [],
        "collected_fields":       collected_fields,
        "ready_to_submit":        True,
        "overall_confidence":     overall_confidence,
        "low_confidence_fields":  low_confidence_fields,
    }
