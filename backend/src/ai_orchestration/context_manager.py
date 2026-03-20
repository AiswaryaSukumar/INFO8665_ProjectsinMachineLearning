from typing import Dict, Any, List
from src.database.models.models import ConversationState
from src.ai_orchestration.context_models import ConversationContext
from src.database.repositories.session_repository import SessionRepository
from src.ai_orchestration.field_config import MANDATORY_FIELDS


class ContextManager:
    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    def load_context(self, session_id: str, channel: str = "web") -> ConversationContext:
        """Loads context from the database, or initializes a new one if not present in DB."""
        db_context_data = self.session_repo.load_context(session_id)
        db_session = self.session_repo.get_session(session_id)

        current_state = db_session.current_state if db_session else ConversationState.INITIALIZING
        ticket_id = db_session.ticket_id if db_session else None

        # Use the persisted session channel if available
        actual_channel = db_session.channel if db_session and db_session.channel else channel

        return ConversationContext(
            session_id=session_id,
            channel=actual_channel,
            current_state=current_state,
            ticket_id=ticket_id,
            extracted_entities=db_context_data.get("extracted_entities", {}),
            confidence_scores=db_context_data.get("confidence_scores", {}),
            missing_fields=db_context_data.get("missing_fields", []),
            questions_asked=db_context_data.get("questions_asked", []),
            raw_issue_text=db_context_data.get("raw_issue_text", None)
        )

    def save_context(self, context: ConversationContext):
        """Persists the Pydantic context back to the database JSON field."""
        context_data = {
            "extracted_entities": context.extracted_entities,
            "confidence_scores": context.confidence_scores,
            "missing_fields": context.missing_fields,
            "questions_asked": context.questions_asked,
            "raw_issue_text": context.raw_issue_text
        }
        self.session_repo.save_context(context.session_id, context_data, context.current_state)

        if context.ticket_id:
            self.session_repo.update_state(context.session_id, context.current_state, ticket_id=context.ticket_id)

    def update_context_with_nlu(self, context: ConversationContext, nlu_result: Dict[str, Any]):
        """Increments context with NLU results, protecting confirmed values."""

        is_confirmation_phase = context.current_state in [ConversationState.CONFIRMATION, ConversationState.SUBMITTED]
        correction_field = nlu_result.get("correction_field")
        correction_value = nlu_result.get("correction_value")

        if is_confirmation_phase and correction_field and correction_value:
            context.extracted_entities[correction_field] = correction_value
            if "confidence_scores" in nlu_result and correction_field in nlu_result["confidence_scores"]:
                context.confidence_scores[correction_field] = nlu_result["confidence_scores"][correction_field]
            return

        confidence_scores = nlu_result.get("confidence_scores", {})
        extracted_entities = nlu_result.get("extracted_entities", {})

        for field in MANDATORY_FIELDS:
            # Support both payload styles:
            # 1) top-level -> nlu_result["category"]
            # 2) nested    -> nlu_result["extracted_entities"]["category"]
            value = nlu_result.get(field)
            if value is None:
                value = extracted_entities.get(field)

            if value:
                if field == "category":
                    new_conf = confidence_scores.get("category", 0.0)
                    old_value = context.extracted_entities.get("category")
                    old_conf = context.confidence_scores.get("category", 0.0)

                    if (
                        old_value is None
                        or old_value == ""
                        or new_conf > old_conf
                        or (old_value == "other" and new_conf >= old_conf)
                    ):
                        context.extracted_entities[field] = value
                        context.confidence_scores[field] = new_conf

                elif not context.extracted_entities.get(field):
                    context.extracted_entities[field] = value
                    if field in confidence_scores:
                        context.confidence_scores[field] = confidence_scores[field]

        severity_score = nlu_result.get("severity_score") or confidence_scores.get("severity")
        if severity_score is not None and not context.extracted_entities.get("severity"):
            context.extracted_entities["severity"] = self._map_severity_score_to_label(severity_score)

    def _map_severity_score_to_label(self, score: float) -> str:
        """Convert numeric severity score into 'low' / 'medium' / 'high'."""
        if score >= 0.75:
            return "high"
        if score >= 0.4:
            return "medium"
        return "low"

    def compute_missing_fields(self, context: ConversationContext):
        """Compute missing mandatory fields."""
        context.missing_fields = [
            field for field in MANDATORY_FIELDS
            if not context.extracted_entities.get(field)
        ]