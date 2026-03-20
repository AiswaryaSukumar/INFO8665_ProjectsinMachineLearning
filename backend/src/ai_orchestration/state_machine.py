from typing import List
from src.database.models.models import ConversationState

VALID_TRANSITIONS = {
    ConversationState.INITIALIZING: [
        ConversationState.SLOT_FILLING,
        ConversationState.CLARIFICATION
    ],
    ConversationState.SLOT_FILLING: [
        ConversationState.SLOT_FILLING,
        ConversationState.CLARIFICATION,
        ConversationState.CONFIRMATION,
        ConversationState.SUBMITTED
    ],
    ConversationState.CLARIFICATION: [
        ConversationState.SLOT_FILLING,
        ConversationState.CLARIFICATION,
        ConversationState.CONFIRMATION
    ],
    ConversationState.CONFIRMATION: [
        ConversationState.SLOT_FILLING,
        ConversationState.CONFIRMATION,
        ConversationState.SUBMITTED
    ],
    ConversationState.SUBMITTED: [],
    ConversationState.ESCALATED: []
}


def is_valid_transition(current: ConversationState, target: ConversationState) -> bool:
    """Check if the transition between two conversation states is valid."""
    # Allow self-transitions
    if current == target:
        return True

    # Allow escalation from any state
    if target == ConversationState.ESCALATED:
        return True

    return target in VALID_TRANSITIONS.get(current, [])


def transition(
    current: ConversationState,
    target: ConversationState,
    history: List[ConversationState] = None
) -> ConversationState:
    """Attempt to transition the state. Returns the new state if successful, or raises ValueError."""
    if not is_valid_transition(current, target):
        raise ValueError(f"Invalid state transition from {current} to {target}")

    if history is not None:
        history.append(current)

    return target