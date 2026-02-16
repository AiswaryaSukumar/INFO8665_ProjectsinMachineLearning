"""
Rule Engine - Manages question templates and text generation
This is like the system's script book
"""
from typing import Dict, List
from .models import ConversationContext


class RuleEngine:
    """
    Generates questions and manages conversation templates
    """
    
    # Different ways to ask for each piece of information
    QUESTION_TEMPLATES = {
        "category": [
            "What type of issue would you like to report today?",
            "Could you tell me what kind of problem you're experiencing?",
            "What is the nature of the issue you're calling about?"
        ],
        "location": [
            "Where is this issue located?",
            "Can you tell me the specific address or location?",
            "What's the location of this problem?"
        ],
        "description": [
            "Could you describe the problem in more detail?",
            "Can you provide more information about what's happening?",
            "Please tell me more about the issue."
        ],
        "citizen_name": [
            "May I have your name please?",
            "What's your name for our records?",
            "Could you tell me your name?"
        ],
        "citizen_phone": [
            "What's the best phone number to reach you at?",
            "May I have a contact phone number?",
            "What phone number should we use for follow-up?"
        ]
    }
    
    # Initial greeting when call starts
    GREETING = (
        "Thank you for calling 311 service. I'm your AI assistant. "
        "How can I help you today? Please describe the issue you'd like to report."
    )
    
    # Template for confirmation
    CONFIRMATION_TEMPLATE = """
Let me confirm the information I've collected:
- Issue type: {category}
- Location: {location}  
- Description: {description}
- Your name: {citizen_name}
- Phone number: {citizen_phone}

Is all of this information correct? Please say yes to confirm or no if you need to make any changes.
"""
    
    def get_greeting(self) -> str:
        """
        Get the initial greeting message
        """
        return self.GREETING
    
    def get_question(self, field: str, context: ConversationContext) -> str:
        """
        Generate appropriate question for a specific field
        
        Args:
            field: Which field to ask about (e.g., "location")
            context: Current conversation context
            
        Returns:
            The question to ask
        """
        # Get the templates for this field
        templates = self.QUESTION_TEMPLATES.get(field, [])
        
        if not templates:
            return f"Could you provide the {field}?"
        
        # How many times have we asked for this field?
        retry_count = context.questions_asked.get(field, 0)
        
        # Use different phrasing each time (but don't go past available templates)
        template_index = min(retry_count, len(templates) - 1)
        question = templates[template_index]
        
        # If we've asked before, acknowledge that
        if retry_count > 0:
            question = f"I'm sorry, I didn't quite catch that. {question}"
        
        return question
    
    def generate_confirmation(self, context: ConversationContext) -> str:
        """
        Generate a confirmation message with all collected info
        
        Args:
            context: Current conversation context
            
        Returns:
            Formatted confirmation message
        """
        return self.CONFIRMATION_TEMPLATE.format(
            category=context.extracted_entities.get("category", "Not specified"),
            location=context.extracted_entities.get("location", "Not specified"),
            description=context.extracted_entities.get("description", "Not specified"),
            citizen_name=context.extracted_entities.get("citizen_name", "Not specified"),
            citizen_phone=context.extracted_entities.get("citizen_phone", "Not specified")
        )
    
    def detect_affirmative(self, text: str) -> bool:
        """
        Check if user said "yes" or confirmed
        
        Args:
            text: What the user said
            
        Returns:
            True if it's a yes/confirmation
        """
        affirmative_words = ["yes", "yeah", "yep", "correct", "right", "that's right", 
                            "affirmative", "sure", "ok", "okay"]
        text_lower = text.lower().strip()
        
        return any(word in text_lower for word in affirmative_words)
    
    def detect_negative(self, text: str) -> bool:
        """
        Check if user said "no" or disagreed
        
        Args:
            text: What the user said
            
        Returns:
            True if it's a no/disagreement
        """
        negative_words = ["no", "nope", "incorrect", "wrong", "not right", 
                         "that's wrong", "negative"]
        text_lower = text.lower().strip()
        
        return any(word in text_lower for word in negative_words)
