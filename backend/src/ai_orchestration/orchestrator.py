from typing import Dict, Any, Tuple

from src.ai_orchestration.context_models import ConversationContext, Action
from src.database.models.models import ConversationState
from src.ai_orchestration.context_manager import ContextManager
from src.ai_orchestration.state_machine import transition
from src.ai_orchestration.rule_engine import RuleEngine
from src.ai_orchestration.department_mapper import auto_assign_department
from src.database.repositories.ticket_repository import TicketRepository


class Orchestrator:
    def __init__(self, context_manager: ContextManager, rule_engine: RuleEngine, ticket_repo: TicketRepository):
        self.context_manager = context_manager
        self.rule_engine = rule_engine
        self.ticket_repo = ticket_repo

    def initialize_session(self, session_id: str, channel: str, caller_number: str = None) -> Tuple[ConversationContext, Action]:
        """Entry point for explicitly starting a new session"""
        context = self.context_manager.load_context(session_id, channel)

        if caller_number and not context.extracted_entities.get("phone_number"):
            context.extracted_entities["phone_number"] = caller_number

        if context.current_state == ConversationState.INITIALIZING:
            context.current_state = transition(context.current_state, ConversationState.SLOT_FILLING)
            self.context_manager.save_context(context)

        action = Action(
            action_type="greeting",
            text="Thank you for calling three one one city service. I am your AI assistant. Please describe your issue and I will help you submit a request.",
            new_state=ConversationState.SLOT_FILLING
        )
        return context, action

    def _create_ticket(self, context: ConversationContext) -> str:
        """
        Create a backend ticket from the current conversation context.

        IMPORTANT:
        - Repository decides initial workflow status
        - For voice tickets this should become NEEDS_REVIEW
        - Repository also generates the unified 311-YYYY-###### ticket number
        """
        # Let repository generate the unified municipal ticket id
        created_ticket = self.ticket_repo.create_ticket(None, context.session_id, context.channel)
        ticket_id = created_ticket.ticket_id

        category = context.extracted_entities.get("category")
        category_conf = context.confidence_scores.get("category", 0.0)
        department = auto_assign_department(category, category_conf)

        description = (
            context.extracted_entities.get("description")
            or context.raw_issue_text
        )

        transcript = context.raw_issue_text or description

        fields = {
            "category": category,
            "department": department,
            "location": context.extracted_entities.get("location"),
            "description": description,
            "caller_name": context.extracted_entities.get("caller_name"),
            "phone_number": context.extracted_entities.get("phone_number"),
            "severity": context.extracted_entities.get("severity"),
            "transcript": transcript,
        }

        clean_fields = {
            key: value
            for key, value in fields.items()
            if value is not None and value != ""
        }

        if clean_fields:
            self.ticket_repo.update_ticket_fields(ticket_id, clean_fields)

        return ticket_id

    def process_turn(self, session_id: str, transcript: str, nlu_output: Dict[str, Any]) -> Tuple[ConversationContext, Action]:
        """
        Main turn loop:
        Load Context -> Merge NLU -> Decide Next Action -> Transition State -> Persist Context -> Return Action
        """
        context = self.context_manager.load_context(session_id)

        if context.current_state in [ConversationState.SUBMITTED, ConversationState.ESCALATED]:
            return context, Action(
                action_type="end",
                text="This session has already ended.",
                new_state=context.current_state
            )

        if not context.raw_issue_text and transcript:
            context.raw_issue_text = transcript

        self.context_manager.update_context_with_nlu(context, nlu_output)

        confirm_result = nlu_output.get("confirm_result")

        if context.current_state == ConversationState.CONFIRMATION:
            if confirm_result == "yes":
                ticket_id = self._create_ticket(context)
                context.ticket_id = ticket_id
                context.current_state = transition(context.current_state, ConversationState.SUBMITTED)
                self.context_manager.save_context(context)

                spelled = self._spell_out(ticket_id)
                action = Action(
                    action_type="submit",
                    text=f"Your ticket number is {spelled}. Thank you for your report. Goodbye.",
                    new_state=ConversationState.SUBMITTED,
                    ticket_id=ticket_id
                )
                return context, action

            elif confirm_result == "no":
                correction_field = nlu_output.get("correction_field")
                if correction_field:
                    from src.ai_orchestration.rule_engine import human_readable_field

                    readable_field = human_readable_field(correction_field)
                    val = nlu_output.get("correction_value", "")

                    action = Action(
                        action_type="confirm",
                        text=f"I understand. I have updated {readable_field} to {val}. Let's review again. {self.rule_engine.generate_confirmation(context).text}",
                        new_state=ConversationState.CONFIRMATION
                    )
                    return context, action
                else:
                    return context, Action(
                        action_type="ask_question",
                        text="I'm sorry. To correct your information, please say 'no' followed by the corrected information. For example, 'no, the location is 123 Main Street'.",
                        new_state=ConversationState.CONFIRMATION
                    )

        self.context_manager.compute_missing_fields(context)
        action = self.rule_engine.get_next_question(context)

        context.current_state = transition(context.current_state, action.new_state)
        self.context_manager.save_context(context)

        return context, action

    def _spell_out(self, text: str) -> str:
        """Helper for TTS ticket spelling"""
        return " ".join([ch for ch in text if ch.isalnum()])