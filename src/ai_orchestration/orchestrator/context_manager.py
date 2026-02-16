"""
Context Manager - Handles saving and loading conversation state
Think of this as the system's memory system
"""
from typing import Optional
from datetime import datetime
from .models import ConversationContext, ConversationState


class ContextManager:
    """
    Manages conversation context (saving/loading)
    For now, we'll use an in-memory dictionary
    In production, this would use a database
    """
    
    def __init__(self):
        # Dictionary to store contexts by session_id
        # In real implementation, this would be a database
        self._storage: dict[str, ConversationContext] = {}
    
    def create_context(self, session_id: str) -> ConversationContext:
        """
        Create a new conversation context
        
        Args:
            session_id: Unique identifier for this conversation
            
        Returns:
            New ConversationContext
        """
        context = ConversationContext(
            session_id=session_id,
            current_state=ConversationState.INITIALIZED,
            extracted_entities={
                "category": None,
                "location": None,
                "description": None,
                "citizen_name": None,
                "citizen_phone": None
            },
            confidence_scores={
                "category": 0.0,
                "location": 0.0,
                "description": 0.0,
                "citizen_name": 0.0,
                "citizen_phone": 0.0
            },
            conversation_history=[],
            questions_asked={},
            missing_fields=[],
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        # Save it
        self._storage[session_id] = context
        return context
    
    def load_context(self, session_id: str) -> Optional[ConversationContext]:
        """
        Load existing conversation context
        
        Args:
            session_id: Unique identifier for this conversation
            
        Returns:
            ConversationContext if found, None otherwise
        """
        return self._storage.get(session_id)
    
    def save_context(self, context: ConversationContext) -> None:
        """
        Save conversation context
        
        Args:
            context: The context to save
        """
        context.updated_at = datetime.now()
        self._storage[context.session_id] = context
    
    def update_context_with_nlu(
        self, 
        context: ConversationContext, 
        nlu_output: dict
    ) -> ConversationContext:
        """
        Update context with new information from NLU
        
        Args:
            context: Current context
            nlu_output: Dictionary with NLU results
            
        Returns:
            Updated context
        """
        # Update entities if NLU found them and they're not already set
        if nlu_output.get("category") and not context.extracted_entities.get("category"):
            context.extracted_entities["category"] = nlu_output["category"]
            context.confidence_scores["category"] = nlu_output.get("category_confidence", 0.0)
        
        if nlu_output.get("location") and not context.extracted_entities.get("location"):
            context.extracted_entities["location"] = nlu_output["location"]
            context.confidence_scores["location"] = nlu_output.get("location_confidence", 0.0)
        
        if nlu_output.get("description") and not context.extracted_entities.get("description"):
            context.extracted_entities["description"] = nlu_output["description"]
            context.confidence_scores["description"] = nlu_output.get("description_confidence", 0.0)
        
        if nlu_output.get("citizen_name") and not context.extracted_entities.get("citizen_name"):
            context.extracted_entities["citizen_name"] = nlu_output["citizen_name"]
            context.confidence_scores["citizen_name"] = nlu_output.get("name_confidence", 0.0)
        
        if nlu_output.get("citizen_phone") and not context.extracted_entities.get("citizen_phone"):
            context.extracted_entities["citizen_phone"] = nlu_output["citizen_phone"]
            context.confidence_scores["citizen_phone"] = nlu_output.get("phone_confidence", 0.0)
        
        # Add to conversation history
        context.conversation_history.append({
            "timestamp": datetime.now().isoformat(),
            "nlu_output": nlu_output
        })
        
        return context
