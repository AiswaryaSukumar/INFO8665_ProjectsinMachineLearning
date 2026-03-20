from typing import List, Dict, Callable
import re

MANDATORY_FIELDS: List[str] = [
    "category",
    "location",
    "description",
    "caller_name",
    "phone_number",
]

OPTIONAL_FIELDS: List[str] = [
    "severity",
    "raw_issue_text"
]

# Thresholds for NLU confidence scores
CONFIDENCE_THRESHOLDS = {
    "CLARIFICATION": 0.3, # Under this score, we always ask for clarification
    "UI_LOW_CONFIDENCE": 0.5 # Under this score, we flag it in the UI as low confidence
}

# Category specific configuration
CATEGORY_RULES = {
    "pothole": {
        "extra_required_fields": ["severity"],
        "auto_escalate": False,
        "sla_hours": 48
    },
    "property_standards": {
         "extra_required_fields": [],
         "auto_escalate": False,
         "sla_hours": 72
    },
    "emergency": {
        "extra_required_fields": [],
        "auto_escalate": True,
        "priority_override": "high",
        "sla_hours": 1
    }
}

def validate_phone_number(phone: str) -> bool:
    if not phone:
        return False
    # Simple digits validation
    digits = re.sub(r'\D', '', phone)
    return len(digits) >= 10

def validate_field(field_name: str, value: any) -> bool:
    """Run specific validator if exists, otherwise assume valid if truthy."""
    if not value:
        return False
        
    validators: Dict[str, Callable] = {
        "phone_number": validate_phone_number
    }
    
    validator = validators.get(field_name)
    if validator:
        return validator(value)
    return True
