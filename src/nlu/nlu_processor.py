"""
NLU Processor - Orchestrator Integration Version
Outputs EXACT format required by orchestrator
FINAL VERSION with absolute path fix
"""

import re
import uuid
import os
from typing import Dict, Any, Optional
from datetime import datetime

# Import your existing modules
from .ml_models.category_classifier_ml import DistilBERTCategoryClassifier as CategoryClassifierML
from .entity_extractor import EntityExtractor
from .sentiment_analyzer import SentimentAnalyzer
from .description_extractor import DescriptionExtractor


class NLUProcessor:
    """
    Main NLU Processor - Orchestrator Integration
    
    Output Format:
    {
        "session_id": string,
        "category": string or null,
        "sub_category": string or null,
        "location": string or null,
        "description": string or null,
        "severity": string or null,
        "caller_name": string or null,
        "phone_number": string or null,
        "confidence_scores": {
            "category": number or null,
            "location": number or null,
            "description": number or null,
            "severity": number or null,
            "caller_name": number or null,
            "phone_number": number or null,
            "overall": number
        },
        "missing_fields": array,
        "confirmed": boolean,
        "correction_field": string or null,
        "requires_review": boolean,
        "ready_to_submit": boolean
    }
    """
    
    def __init__(self, use_ml_classifier=True):
        """Initialize NLU components"""
        
        # Initialize ML classifier
        self.use_ml = use_ml_classifier
        if use_ml_classifier:
            try:
                # Create classifier WITHOUT auto-load first
                self.classifier = CategoryClassifierML(auto_load=False)
                
                # Get correct model path (works from any directory)
                # Go up from src/nlu/ to project root
                project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                model_path = os.path.join(project_root, "ml-models", "saved-models", "category_classifier")
                
                print(f"Loading model from: {model_path}")
                
                # Load the model
                self.classifier.load_model(model_path)
                
                print("✓ ML classifier loaded")
            except Exception as e:
                print(f"⚠️  ML classifier failed to load: {e}")
                import traceback
                traceback.print_exc()
                print("   Falling back to rule-based classification")
                self.use_ml = False
        else:
            self.use_ml = False
        
        # Initialize other components
        self.entity_extractor = EntityExtractor()
        self.sentiment_analyzer = SentimentAnalyzer()
        self.description_extractor = DescriptionExtractor()
        
        # Session storage (in-memory for now)
        self.sessions = {}
        
        # Confidence thresholds
        self.MIN_CONFIDENCE = 0.35
        self.REVIEW_THRESHOLD = 0.60
        
        print("✓ NLU Processor initialized (Orchestrator Integration Mode)")
    
    
    def process(self, transcript: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process transcript and return structured output for orchestrator
        
        Args:
            transcript: The complaint transcript text
            session_id: Optional session ID (generated if not provided)
        
        Returns:
            Dictionary with exact format required by orchestrator
        """
        
        # Generate or use provided session ID
        if not session_id:
            session_id = self._generate_session_id()
        
        # Step 1: Category Classification
        if self.use_ml:
            category_result = self.classifier.predict(transcript)
            category_value = category_result.get('category')
            category_confidence = category_result.get('confidence', 0.0)
        else:
            category_value = None
            category_confidence = 0.0
        
        # Step 2: Entity Extraction
        entities = self.entity_extractor.extract_all(transcript)
        
        # Step 3: Sentiment Analysis
        sentiment = self.sentiment_analyzer.analyze(transcript)
        
        # Step 4: Description Extraction
        description_text = self.description_extractor.extract(transcript)
        
        # Step 5: Determine severity from sentiment
        severity_value = self._calculate_severity(sentiment)
        
        # Step 6: Extract values
        location_value = entities.get('location')
        caller_name_value = entities.get('caller_name')
        phone_number_value = entities.get('caller_phone')
        
        # Step 7: Get confidence scores
        location_conf = entities.get('location_confidence', 0.0)
        caller_name_conf = entities.get('caller_name_confidence', 0.0)
        phone_conf = entities.get('caller_phone_confidence', 0.0)
        description_conf = 0.8 if description_text else 0.0
        severity_conf = sentiment.get('urgency_score', 0.0)
        
        # Step 8: Calculate overall confidence
        overall_conf = self._calculate_overall_confidence({
            'category': category_confidence,
            'location': location_conf,
            'description': description_conf,
            'severity': severity_conf,
            'caller_name': caller_name_conf,
            'phone_number': phone_conf
        })
        
        # Step 9: Identify missing fields
        missing_fields = self._identify_missing_fields({
            'category': category_value,
            'location': location_value,
            'description': description_text,
            'caller_name': caller_name_value,
            'phone_number': phone_number_value
        })
        
        # Step 10: Determine if requires review
        requires_review = self._check_requires_review({
            'category': category_confidence,
            'location': location_conf,
            'description': description_conf
        })
        
        # Step 11: Build EXACT output format
        result = {
            "session_id": session_id,
            
            # Field values (simple values, NOT objects!)
            "category": category_value,
            "sub_category": None,
            "location": location_value,
            "description": description_text,
            "severity": severity_value,
            "caller_name": caller_name_value,
            "phone_number": phone_number_value,
            
            # Confidence scores (separate object)
            "confidence_scores": {
                "category": round(category_confidence, 2) if category_confidence else None,
                "location": round(location_conf, 2) if location_conf else None,
                "description": round(description_conf, 2) if description_conf else None,
                "severity": round(severity_conf, 2) if severity_conf else None,
                "caller_name": round(caller_name_conf, 2) if caller_name_conf else None,
                "phone_number": round(phone_conf, 2) if phone_conf else None,
                "overall": round(overall_conf, 2)
            },
            
            # Status fields
            "missing_fields": missing_fields,
            "confirmed": False,
            "correction_field": None,
            "requires_review": requires_review,
            "ready_to_submit": False
        }
        
        # Store session
        self.sessions[session_id] = result
        
        return result
    
    
    def update_field(self, session_id: str, field_name: str, new_value: str) -> Optional[Dict[str, Any]]:
        """
        Update a specific field when orchestrator gets clarification from user
        
        Args:
            session_id: The session identifier
            field_name: Field to update (e.g., 'caller_name', 'location')
            new_value: New value from user
        
        Returns:
            Updated session data or None if session not found
        """
        
        if session_id not in self.sessions:
            print(f"⚠️  Session {session_id} not found")
            return None
        
        # Update the field value
        if field_name in self.sessions[session_id]:
            self.sessions[session_id][field_name] = new_value
            
            # Update confidence to 100% for manually entered fields
            if field_name in self.sessions[session_id]['confidence_scores']:
                self.sessions[session_id]['confidence_scores'][field_name] = 1.0
            
            # Recalculate overall confidence
            self.sessions[session_id]['confidence_scores']['overall'] = \
                self._calculate_overall_confidence(self.sessions[session_id]['confidence_scores'])
            
            # Recalculate missing fields
            self.sessions[session_id]['missing_fields'] = self._identify_missing_fields({
                'category': self.sessions[session_id]['category'],
                'location': self.sessions[session_id]['location'],
                'description': self.sessions[session_id]['description'],
                'caller_name': self.sessions[session_id]['caller_name'],
                'phone_number': self.sessions[session_id]['phone_number']
            })
            
            # Clear correction_field since it's been corrected
            self.sessions[session_id]['correction_field'] = None
            
            # Recalculate requires_review
            self.sessions[session_id]['requires_review'] = self._check_requires_review(
                self.sessions[session_id]['confidence_scores']
            )
            
            print(f"✓ Updated {field_name} for session {session_id}")
        
        return self.sessions[session_id]
    
    
    def confirm_submission(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Mark session as confirmed when user says YES
        
        Args:
            session_id: The session identifier
        
        Returns:
            Updated session data or None if session not found
        """
        
        if session_id not in self.sessions:
            print(f"⚠️  Session {session_id} not found")
            return None
        
        # Set confirmed to True
        self.sessions[session_id]['confirmed'] = True
        
        # Check if ready to submit
        # Ready only if: confirmed=True AND no missing fields
        if len(self.sessions[session_id]['missing_fields']) == 0:
            self.sessions[session_id]['ready_to_submit'] = True
            print(f"✓ Session {session_id} confirmed and READY TO SUBMIT")
        else:
            print(f"⚠️  Session {session_id} confirmed but has missing fields: {self.sessions[session_id]['missing_fields']}")
        
        return self.sessions[session_id]
    
    
    def set_correction_field(self, session_id: str, field_name: str) -> Optional[Dict[str, Any]]:
        """
        Mark a specific field as needing correction
        Used by orchestrator when asking user to clarify a field
        
        Args:
            session_id: The session identifier
            field_name: Field that needs correction
        
        Returns:
            Updated session data
        """
        
        if session_id not in self.sessions:
            return None
        
        self.sessions[session_id]['correction_field'] = field_name
        return self.sessions[session_id]
    
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve session data
        
        Args:
            session_id: The session identifier
        
        Returns:
            Session data or None if not found
        """
        return self.sessions.get(session_id)
    
    
    # ========== HELPER METHODS ==========
    
    def _generate_session_id(self) -> str:
        """Generate unique session ID"""
        return str(uuid.uuid4())
    
    
    def _calculate_severity(self, sentiment: Dict) -> Optional[str]:
        """
        Calculate severity level from sentiment analysis
        
        Returns: 'low', 'medium', 'high', or None
        """
        urgency_score = sentiment.get('urgency_score', 0.0)
        
        if urgency_score >= 0.7:
            return 'high'
        elif urgency_score >= 0.4:
            return 'medium'
        elif urgency_score > 0:
            return 'low'
        else:
            return None
    
    
    def _calculate_overall_confidence(self, confidence_scores: Dict) -> float:
        """
        Calculate overall confidence from individual scores
        
        Args:
            confidence_scores: Dictionary of confidence scores
        
        Returns:
            Overall confidence (0.0 to 1.0)
        """
        # Get scores for required fields (not caller info)
        required_scores = []
        
        for field in ['category', 'location', 'description']:
            score = confidence_scores.get(field)
            if score is not None:
                required_scores.append(score)
        
        if not required_scores:
            return 0.0
        
        # Average of required fields
        return sum(required_scores) / len(required_scores)
    
    
    def _identify_missing_fields(self, fields: Dict[str, Any]) -> list:
        """
        Identify which required fields are missing
        
        Args:
            fields: Dictionary of extracted fields
        
        Returns:
            List of missing field names
        """
        missing = []
        
        # Check each required field
        required_fields = ['category', 'location', 'description', 'caller_name', 'phone_number']
        
        for field in required_fields:
            value = fields.get(field)
            
            # Consider missing if:
            # - Value is None
            # - Value is empty string
            # - Value is just whitespace
            if not value or (isinstance(value, str) and not value.strip()):
                missing.append(field)
        
        return missing
    
    
    def _check_requires_review(self, confidence_scores: Dict) -> bool:
        """
        Determine if complaint requires human review based on confidence
        
        Args:
            confidence_scores: Dictionary of confidence scores
        
        Returns:
            True if requires review, False otherwise
        """
        # Check critical fields
        critical_fields = ['category', 'location', 'description']
        
        for field in critical_fields:
            score = confidence_scores.get(field)
            
            if score is None:
                return True  # Missing critical field
            
            if score < self.REVIEW_THRESHOLD:
                return True  # Low confidence on critical field
        
        return False
    
    
    def clear_session(self, session_id: str) -> bool:
        """
        Clear session data (for cleanup)
        
        Args:
            session_id: The session identifier
        
        Returns:
            True if cleared, False if session didn't exist
        """
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False


# ========== EXAMPLE USAGE ==========

if __name__ == "__main__":
    import json
    
    # Initialize processor
    processor = NLUProcessor(use_ml_classifier=True)
    
    # Example 1: Process initial complaint
    print("\n" + "="*70)
    print("EXAMPLE 1: Initial Processing")
    print("="*70)
    
    transcript1 = """
    There's a huge pothole on Main Street near the school. 
    It's been there for weeks and cars keep hitting it.
    """
    
    result1 = processor.process(transcript1)
    
    print("\nOutput (JSON format):")
    print(json.dumps(result1, indent=2))
    
    # Example 2: Update missing field
    print("\n" + "="*70)
    print("EXAMPLE 2: Update Missing Field (Caller Name)")
    print("="*70)
    
    session_id = result1['session_id']
    updated = processor.update_field(session_id, 'caller_name', 'John Smith')
    
    print(f"\nCaller Name: {updated['caller_name']}")
    print(f"Confidence: {updated['confidence_scores']['caller_name']}")
    print(f"Missing Fields: {updated['missing_fields']}")
    
    # Example 3: Update phone number
    print("\n" + "="*70)
    print("EXAMPLE 3: Update Phone Number")
    print("="*70)
    
    updated2 = processor.update_field(session_id, 'phone_number', '416-555-1234')
    print(f"\nPhone: {updated2['phone_number']}")
    print(f"Missing Fields: {updated2['missing_fields']}")
    
    # Example 4: Confirm submission
    print("\n" + "="*70)
    print("EXAMPLE 4: Confirm Submission")
    print("="*70)
    
    final = processor.confirm_submission(session_id)
    
    print(f"\nConfirmed: {final['confirmed']}")
    print(f"Ready to Submit: {final['ready_to_submit']}")
    print(f"Requires Review: {final['requires_review']}")
    print(f"\nFinal Output:")
    print(json.dumps(final, indent=2))