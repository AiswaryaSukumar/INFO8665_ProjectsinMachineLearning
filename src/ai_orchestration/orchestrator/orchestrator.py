"""
Main Orchestrator - The brain of the conversation system
This decides what to do next at each step
"""
from typing import Optional, Dict
from .models import (
    ConversationContext, 
    ConversationState, 
    Action,
    NLUOutput
)
from .context_manager import ContextManager
from .rule_engine import RuleEngine


class Orchestrator:
    """
    Main orchestration engine that manages conversation flow
    """
    
    def __init__(self):
        self.context_manager = ContextManager()
        self.rule_engine = RuleEngine()
        
        # Configuration
        self.CONFIDENCE_THRESHOLD = 0.6  # Minimum confidence to accept info
        self.MAX_RETRIES = 3  # Max times to ask same question
    
    def initialize_session(self, session_id: str) -> Action:
        """
        Start a new conversation session
        
        Args:
            session_id: Unique ID for this conversation
            
        Returns:
            Action with greeting message
        """
        # Create new context
        context = self.context_manager.create_context(session_id)
        
        # Get greeting
        greeting = self.rule_engine.get_greeting()
        
        # Move to GREETING state
        context.current_state = ConversationState.GREETING
        self.context_manager.save_context(context)
        
        return Action(
            type="PLAY_GREETING",
            text=greeting,
            new_state=ConversationState.LISTENING
        )
    
    def process_turn(
        self, 
        session_id: str, 
        transcript: str = None,
        nlu_output: Dict = None
    ) -> Action:
        """
        Main method - called after each user utterance
        This is the core decision-making function
        
        Args:
            session_id: Which conversation this is
            transcript: What the user said (raw text)
            nlu_output: Structured data from NLU service
            
        Returns:
            Action object with what to do next
        """
        # Load conversation context
        context = self.context_manager.load_context(session_id)
        
        if not context:
            # Session doesn't exist - initialize it
            return self.initialize_session(session_id)
        
        # Update context with NLU results if provided
        if nlu_output:
            context = self.context_manager.update_context_with_nlu(context, nlu_output)
        
        # Add transcript to history
        if transcript:
            context.conversation_history.append({
                "speaker": "user",
                "text": transcript,
                "timestamp": datetime.now().isoformat()
            })
        
        # CORE DECISION LOGIC - determine what to do next
        action = self._decide_next_action(context)
        
        # Update state based on action
        context.current_state = action.new_state
        
        # Save updated context
        self.context_manager.save_context(context)
        
        return action
    
    def _decide_next_action(self, context: ConversationContext) -> Action:
        """
        Core decision logic - THE BRAIN
        Determines what the system should do next
        
        Args:
            context: Current conversation state
            
        Returns:
            Action to take
        """
        # PRIORITY 1: Check if we should escalate to human
        if self._should_escalate(context):
            return Action(
                type="ESCALATE",
                text="Let me connect you with one of our service representatives who can better assist you.",
                new_state=ConversationState.ESCALATED,
                should_escalate=True
            )
        
        # PRIORITY 2: If we just greeted, start listening
        if context.current_state == ConversationState.GREETING:
            return Action(
                type="LISTEN",
                text=None,
                new_state=ConversationState.LISTENING
            )
        
        # PRIORITY 3: If we're confirming, check user's response
        if context.current_state == ConversationState.CONFIRMING:
            last_transcript = self._get_last_user_message(context)
            
            if self.rule_engine.detect_affirmative(last_transcript):
                # User confirmed - create ticket!
                return Action(
                    type="CREATE_TICKET",
                    text="Perfect! I'm creating your service ticket now. You'll receive a confirmation shortly.",
                    new_state=ConversationState.CREATING_TICKET
                )
            elif self.rule_engine.detect_negative(last_transcript):
                # User said no - handle correction
                return Action(
                    type="HANDLE_CORRECTION",
                    text="No problem. Which information would you like to correct?",
                    new_state=ConversationState.CORRECTING
                )
        
        # PRIORITY 4: Check if we have all required information
        if self._is_information_complete(context):
            # We have everything - ask for confirmation
            confirmation_text = self.rule_engine.generate_confirmation(context)
            return Action(
                type="CONFIRM_INFORMATION",
                text=confirmation_text,
                new_state=ConversationState.CONFIRMING
            )
        
        # PRIORITY 5: We're missing information - ask for it
        missing_field = self._select_next_field_to_ask(context)
        
        if missing_field:
            # Generate question for this field
            question = self.rule_engine.get_question(missing_field, context)
            
            # Track that we asked this question
            context.questions_asked[missing_field] = context.questions_asked.get(missing_field, 0) + 1
            
            return Action(
                type="ASK_QUESTION",
                text=question,
                field=missing_field,
                new_state=ConversationState.COLLECTING_INFO
            )
        
        # FALLBACK: Something went wrong
        return Action(
            type="ERROR",
            text="I'm having trouble processing your request. Let me connect you with an agent.",
            new_state=ConversationState.ESCALATED,
            should_escalate=True
        )
    
    def _is_information_complete(self, context: ConversationContext) -> bool:
        """
        Check if we have all required information with good confidence
        
        Args:
            context: Current conversation state
            
        Returns:
            True if all required info collected
        """
        required_fields = ["category", "location", "description", "citizen_name", "citizen_phone"]
        
        context.missing_fields = []
        
        for field in required_fields:
            # Check if field exists
            value = context.extracted_entities.get(field)
            if not value:
                context.missing_fields.append(field)
                continue
            
            # Check confidence
            confidence = context.confidence_scores.get(field, 0.0)
            if confidence < self.CONFIDENCE_THRESHOLD:
                context.missing_fields.append(field)
        
        return len(context.missing_fields) == 0
    
    def _select_next_field_to_ask(self, context: ConversationContext) -> Optional[str]:
        """
        Choose which field to ask about next
        
        Args:
            context: Current conversation state
            
        Returns:
            Field name to ask about, or None if all asked too many times
        """
        # Priority order for asking questions
        priority_order = ["category", "location", "description", "citizen_name", "citizen_phone"]
        
        for field in priority_order:
            if field in context.missing_fields:
                # Check if we've already asked this too many times
                times_asked = context.questions_asked.get(field, 0)
                if times_asked < self.MAX_RETRIES:
                    return field
        
        # All fields asked maximum times - should escalate
        return None
    
    def _should_escalate(self, context: ConversationContext) -> bool:
        """
        Determine if conversation should be escalated to human agent
        
        Args:
            context: Current conversation state
            
        Returns:
            True if should escalate
        """
        # Check 1: Have we asked any question 3+ times?
        for field, count in context.questions_asked.items():
            if count >= self.MAX_RETRIES:
                context.escalation_reason = f"Asked for {field} {count} times without success"
                return True
        
        # Check 2: Is overall confidence consistently low?
        if len(context.confidence_scores) > 0:
            avg_confidence = sum(context.confidence_scores.values()) / len(context.confidence_scores)
            if avg_confidence < 0.4 and len(context.conversation_history) > 3:
                context.escalation_reason = "Consistently low confidence in understanding"
                return True
        
        # Check 3: Too many conversation turns without progress?
        if len(context.conversation_history) > 15:
            context.escalation_reason = "Conversation too long without completion"
            return True
        
        return False
    
    def _get_last_user_message(self, context: ConversationContext) -> str:
        """
        Get the most recent thing the user said
        
        Args:
            context: Current conversation state
            
        Returns:
            Last user message text
        """
        for message in reversed(context.conversation_history):
            if message.get("speaker") == "user":
                return message.get("text", "")
        return ""


# For imports
from datetime import datetime
