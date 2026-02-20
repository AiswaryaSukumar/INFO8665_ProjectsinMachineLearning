"""
NLU Processor - Main Module (VERSION 1: ML-BASED)
Orchestrates all NLU components to process complaint transcripts
NOW USES TRAINED MACHINE LEARNING MODEL!
"""

import time
from datetime import datetime
from typing import Dict, Optional
import os

from .entity_extractor import EntityExtractor
from .description_extractor import DescriptionExtractor
from .sentiment_analyzer import SentimentAnalyzer
from .confidence_calculator import ConfidenceCalculator
from .utils import (
    clean_transcript,
    remove_filler_words,
    handle_self_corrections
)

# Import ML model
from .ml_models.category_classifier_ml import DistilBERTCategoryClassifier


class NLUProcessor:
    """
    Main NLU Processor that coordinates all components
    VERSION 1: Now uses trained Machine Learning model for category classification
    """
    
    def __init__(
        self,
        categories_file: str = "data/models/categories.json",
        spacy_model: str = "en_core_web_md",
        use_ml_classifier: bool = True
    ):
        """
        Initialize NLU Processor with all components
        
        Args:
            categories_file: Path to categories JSON file
            spacy_model: Name of spaCy model to use
            use_ml_classifier: Whether to use ML model (True) or keyword matching (False)
        """
        print("Initializing NLU Processor...")
        
        self.use_ml_classifier = use_ml_classifier
        
        # Initialize all components
        self.entity_extractor = EntityExtractor(model_name=spacy_model)
        self.description_extractor = DescriptionExtractor()
        self.sentiment_analyzer = SentimentAnalyzer()
        self.confidence_calculator = ConfidenceCalculator()
        
        # Initialize category classifier (ML or keyword-based)
        if use_ml_classifier:
            print("Using MACHINE LEARNING classifier (DistilBERT)")
            self.ml_classifier = DistilBERTCategoryClassifier()
            self.ml_classifier.load_categories(categories_file)
            
            # Try to load trained model
            model_path = "ml-models/saved-models/category_classifier"
            if os.path.exists(model_path):
                try:
                    self.ml_classifier.load_model(model_path)
                    print("✓ Trained ML model loaded successfully!")
                except Exception as e:
                    print(f"⚠️  Warning: Could not load trained model: {e}")
                    print("⚠️  Please train the model first: python scripts/train_nlu_model.py")
                    self.use_ml_classifier = False
            else:
                print(f"⚠️  Warning: Trained model not found at: {model_path}")
                print("⚠️  Please train the model first: python scripts/train_nlu_model.py")
                self.use_ml_classifier = False
        
        if not self.use_ml_classifier:
            # Fallback to keyword-based classifier
            print("Using keyword-based classifier (fallback)")
            from .category_classifier import CategoryClassifier
            self.category_classifier = CategoryClassifier(categories_file=categories_file)
        
        print("NLU Processor initialized successfully!")
    
    def preprocess_transcript(self, transcript: str) -> str:
        """
        Preprocess transcript text
        
        Args:
            transcript: Raw transcript text
            
        Returns:
            Cleaned and preprocessed transcript
        """
        if not transcript:
            return ""
        
        # Step 1: Basic cleaning
        cleaned = clean_transcript(transcript)
        
        # Step 2: Handle self-corrections
        cleaned = handle_self_corrections(cleaned)
        
        return cleaned
    
    def classify_category(self, text: str) -> Dict:
        """
        Classify complaint category using ML model or keyword matching
        
        Args:
            text: Preprocessed transcript
            
        Returns:
            Dictionary with category, confidence, and probabilities
        """
        if self.use_ml_classifier:
            # Use ML model
            result = self.ml_classifier.predict(text)
            return {
                "id": result["category"],
                "confidence": result["confidence"],
                "probabilities": result["probabilities"]
            }
        else:
            # Fallback to keyword matching
            category_id = self.category_classifier.classify(text)
            return {
                "id": category_id,
                "confidence": 0.75,  # Default confidence for keyword matching
                "probabilities": {}
            }
    
    def process(
        self,
        transcript: str,
        conversation_id: str = None,
        is_followup: bool = False,
        previous_data: Dict = None
    ) -> Dict:
        """
        Process a complaint transcript and extract all information
        
        Args:
            transcript: Complaint transcript text
            conversation_id: Unique conversation identifier
            is_followup: Whether this is a follow-up message (updating existing data)
            previous_data: Previously extracted data (if follow-up)
            
        Returns:
            Dictionary with all extracted information, confidence scores, and metadata
        """
        start_time = time.time()
        
        # Validate input
        if not transcript or not transcript.strip():
            return self._create_empty_response(conversation_id)
        
        # Preprocess transcript
        cleaned_transcript = self.preprocess_transcript(transcript)
        
        # If this is a follow-up, merge with previous data
        if is_followup and previous_data:
            return self._process_followup(
                cleaned_transcript,
                previous_data,
                conversation_id,
                start_time
            )
        
        # STEP 1: Extract Category (NOW USING ML!)
        category_result = self.classify_category(cleaned_transcript)
        category_field = self.confidence_calculator.process_field(
            "category",
            category_result["id"],
            category_result["confidence"],
            cleaned_transcript
        )
        
        # STEP 2: Extract Entities (name, phone, location)
        entities = self.entity_extractor.extract_all(transcript)
        
        # Process each entity with confidence calculator
        location_field = self.confidence_calculator.process_field(
            "location",
            entities["location"]["value"],
            entities["location"]["confidence"],
            transcript
        )
        
        caller_name_field = self.confidence_calculator.process_field(
            "caller_name",
            entities["caller_name"]["value"],
            entities["caller_name"]["confidence"],
            transcript
        )
        
        caller_phone_field = self.confidence_calculator.process_field(
            "caller_phone",
            entities["caller_phone"]["value"],
            entities["caller_phone"]["confidence"],
            transcript
        )
        
        # STEP 3: Extract Description
        description_result = self.description_extractor.extract_with_summary(
            cleaned_transcript,
            category_result["id"]
        )
        
        description_field = self.confidence_calculator.process_field(
            "description",
            description_result["full"],
            description_result["confidence"],
            cleaned_transcript
        )
        
        # STEP 4: Analyze Sentiment and Urgency
        sentiment_result = self.sentiment_analyzer.analyze(
            cleaned_transcript,
            category_result["id"]
        )
        
        # STEP 5: Build extraction result
        extracted_data = {
            "category": category_field,
            "location": location_field,
            "description": description_field,
            "caller_name": caller_name_field,
            "caller_phone": caller_phone_field
        }
        
        # STEP 6: Identify missing fields and clarifications needed
        missing_fields = self.confidence_calculator.identify_missing_fields(extracted_data)
        requires_clarification = self.confidence_calculator.identify_clarification_needed(extracted_data)
        
        # STEP 7: Calculate overall confidence
        overall_confidence = self.confidence_calculator.calculate_overall_confidence(extracted_data)
        
        # STEP 8: Calculate processing time
        processing_time = int((time.time() - start_time) * 1000)
        
        # STEP 9: Build final output
        output = {
            "conversation_id": conversation_id or self._generate_conversation_id(),
            "extraction_timestamp": datetime.utcnow().isoformat() + "Z",
            "category": category_field,
            "location": location_field,
            "description": description_field,
            "caller_name": caller_name_field,
            "caller_phone": caller_phone_field,
            "sentiment": sentiment_result,
            "overall_confidence": overall_confidence,
            "requires_clarification": requires_clarification,
            "missing_fields": missing_fields,
            "processing_time_ms": processing_time,
            "ml_model_used": self.use_ml_classifier,  # Indicates if ML was used
            "metadata": {
                "original_transcript": transcript,
                "cleaned_transcript": cleaned_transcript,
                "description_summary": description_result["summary"],
                "description_details": description_result["details"],
                "category_probabilities": category_result.get("probabilities", {})
            }
        }
        
        return output
    
    def _process_followup(
        self,
        transcript: str,
        previous_data: Dict,
        conversation_id: str,
        start_time: float
    ) -> Dict:
        """
        Process follow-up message (update existing extraction)
        
        Args:
            transcript: New transcript (citizen's answer)
            previous_data: Previously extracted data
            conversation_id: Conversation ID
            start_time: Processing start time
            
        Returns:
            Updated extraction data
        """
        missing = previous_data.get("missing_fields", [])
        needs_clarification = previous_data.get("requires_clarification", [])
        
        updated_data = previous_data.copy()
        
        if "location" in missing or "location" in needs_clarification:
            entities = self.entity_extractor.extract_all(transcript)
            location_field = self.confidence_calculator.process_field(
                "location",
                entities["location"]["value"],
                entities["location"]["confidence"],
                transcript
            )
            updated_data["location"] = location_field
            updated_data["location"]["confirmed"] = "updated"
        
        if "caller_name" in missing or "caller_name" in needs_clarification:
            entities = self.entity_extractor.extract_all(transcript)
            name_field = self.confidence_calculator.process_field(
                "caller_name",
                entities["caller_name"]["value"],
                entities["caller_name"]["confidence"],
                transcript
            )
            updated_data["caller_name"] = name_field
            updated_data["caller_name"]["confirmed"] = "updated"
        
        if "caller_phone" in missing or "caller_phone" in needs_clarification:
            entities = self.entity_extractor.extract_all(transcript)
            phone_field = self.confidence_calculator.process_field(
                "caller_phone",
                entities["caller_phone"]["value"],
                entities["caller_phone"]["confidence"],
                transcript
            )
            updated_data["caller_phone"] = phone_field
            updated_data["caller_phone"]["confirmed"] = "updated"
        
        extracted_fields = {
            "category": updated_data.get("category"),
            "location": updated_data.get("location"),
            "description": updated_data.get("description")
        }
        
        updated_data["missing_fields"] = self.confidence_calculator.identify_missing_fields(extracted_fields)
        updated_data["requires_clarification"] = self.confidence_calculator.identify_clarification_needed(extracted_fields)
        
        processing_time = int((time.time() - start_time) * 1000)
        updated_data["processing_time_ms"] = processing_time
        updated_data["extraction_timestamp"] = datetime.utcnow().isoformat() + "Z"
        
        return updated_data
    
    def _create_empty_response(self, conversation_id: str = None) -> Dict:
        """
        Create empty response for invalid input
        
        Args:
            conversation_id: Conversation ID
            
        Returns:
            Empty response dictionary
        """
        return {
            "conversation_id": conversation_id or self._generate_conversation_id(),
            "extraction_timestamp": datetime.utcnow().isoformat() + "Z",
            "category": {"value": None, "confidence": 0.0, "confirmed": "missing"},
            "location": {"value": None, "confidence": 0.0, "confirmed": "missing"},
            "description": {"value": None, "confidence": 0.0, "confirmed": "missing"},
            "caller_name": {"value": None, "confidence": 0.0, "confirmed": "missing"},
            "caller_phone": {"value": None, "confidence": 0.0, "confirmed": "missing"},
            "sentiment": {
                "overall_score": 0.0,
                "urgency_level": "low",
                "urgency_score": 0.0
            },
            "overall_confidence": 0.0,
            "requires_clarification": [],
            "missing_fields": ["category", "location", "description"],
            "processing_time_ms": 0,
            "ml_model_used": False
        }
    
    def _generate_conversation_id(self) -> str:
        """
        Generate a unique conversation ID
        
        Returns:
            Unique conversation ID
        """
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        return f"conv_{timestamp}"