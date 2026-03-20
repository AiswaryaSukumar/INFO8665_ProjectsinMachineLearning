# src/ai_orchestration/state_store.py
from typing import Dict

_default_fields = {
    "category": None,
    "location": None,
    "description": None,
    "severity": None,
    "caller_name": None,
    "phone_number": None,
}

_session_state: Dict[str, Dict] = {}  # key: session_id

def get_collected_fields(session_id: str) -> Dict:
    stored = _session_state.get(session_id)
    if stored is None:
        stored = _default_fields.copy()
        _session_state[session_id] = stored
    return stored

def save_collected_fields(session_id: str, collected_fields: Dict):
    _session_state[session_id] = collected_fields
