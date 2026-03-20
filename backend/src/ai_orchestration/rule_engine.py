from typing import Optional, Dict
from src.ai_orchestration.context_models import ConversationContext, Action
from src.database.models.models import ConversationState
from src.ai_orchestration.field_config import CONFIDENCE_THRESHOLDS, CATEGORY_RULES
from src.ai_orchestration.department_mapper import auto_assign_department

FIELD_QUESTIONS = {
    "category":     "What type of issue are you reporting?",
    "location":     "Where exactly is the issue located?",
    "description":  "Can you describe the issue in more detail?",
    "caller_name":  "May I have your name please?",
    "phone_number": "What is the best phone number to reach you?",
}

def human_readable_field(field: str) -> str:
    mapping = {
        "category": "the issue type",
        "location": "the location",
        "description": "the description",
        "caller_name": "your name",
        "phone_number": "your phone number",
    }
    return mapping.get(field, field)

class RuleEngine:
    def get_next_question(self, context: ConversationContext) -> Optional[Action]:
        """Determine next action based on context state and completeness."""
        
        missing = context.missing_fields
        if missing:
             field = missing[0]
             q = FIELD_QUESTIONS.get(field, f"Could you provide {human_readable_field(field)}?")
             return Action(action_type="ask_question", text=q, field=field, new_state=ConversationState.SLOT_FILLING)
             
        # Check clarifications
        low_confidence_fields = [
            f for f in context.extracted_entities.keys()
            if context.confidence_scores.get(f, 1.0) < CONFIDENCE_THRESHOLDS["CLARIFICATION"]
        ]
        
        if low_confidence_fields:
             labels = [human_readable_field(f) for f in low_confidence_fields]
             fields_phrase = labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + f" and {labels[-1]}"
             clarification = f"I am not fully confident about {fields_phrase}. Could you please clarify or repeat them?"
             return Action(action_type="ask_question", text=clarification, field=low_confidence_fields[0], new_state=ConversationState.CLARIFICATION)

        # No missing or clarification -> Confirmation Time
        return self.generate_confirmation(context)

    def generate_confirmation(self, context: ConversationContext) -> Action:
        """Generates the natural spoken confirmation text, incorporating rules."""
        category = context.extracted_entities.get("category")
        nlu_conf = context.confidence_scores.get("category", 1.0)
        
        dept = auto_assign_department(category, nlu_conf)
        category_text = category if category and category != "other" else "an"
        
        location = context.extracted_entities.get("location", "an unknown location")
        caller_name = context.extracted_entities.get("caller_name", "no name")
        phone_number = context.extracted_entities.get("phone_number", "no phone number")
        
        issue_part = f"You reported a {category_text} issue at {location}. "
        
        # Original issue text fallback
        if category == "other" and context.raw_issue_text:
             issue_part = f"You originally described the issue as \"{context.raw_issue_text}\". "
             
        # Rule specific info
        rule_info = ""
        category_rules = CATEGORY_RULES.get(category, {})
        sla = category_rules.get("sla_hours")
        if dept:
            rule_info += f"This will be routed to {dept}. "
        if sla:
            rule_info += f"The standard response time is {sla} hours. "

        text = (
            "For final confirmation, please check the following information. "
            f"{issue_part}"
            f"Your contact information is {caller_name} and {phone_number}. "
            f"{rule_info}"
            "Is this all correct?"
        )
        
        return Action(action_type="confirm", text=text, new_state=ConversationState.CONFIRMATION)
