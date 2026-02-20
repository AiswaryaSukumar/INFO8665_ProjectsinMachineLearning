"""
NLU Processor - Main Module
Orchestrates all NLU components to process complaint transcripts
"""

import time
from datetime import datetime
from typing import Dict, Optional

from .entity_extractor import EntityExtractor
from .category_classifier import CategoryClassifier
from .description_extractor import DescriptionExtractor
from .sentiment_analyzer import SentimentAnalyzer
from .confidence_calculator import ConfidenceCalculator
from .utils import (
    clean_transcript,
    remove_filler_words,
    handle_self_corrections
)


class NLUProcessor:
    """
    Main NLU Processor that coordinates all components
    Processes complaint transcripts and extracts structured information
    """
    
    def __init__(
        self,
        categories_file: str = "data/categories.json",
        spacy_model: str = "en_core_web_md"
    ):
        """
        Initialize NLU Processor with all components
        
        Args:
            categories_file: Path to categories JSON file
            spacy_model: Name of spaCy model to use
        """
        print("Initializing NLU Processor...")
        
        # Initialize all components
        self.entity_extractor = EntityExtractor(model_name=spacy_model)
        self.category_classifier = CategoryClassifier(categories_file=categories_file)
        self.description_extractor = DescriptionExtractor()
        self.sentiment_analyzer = SentimentAnalyzer()
        self.confidence_calculator = ConfidenceCalculator()
        
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
        
        # Step 3: Remove filler words (but keep original for some extractions)
        # We'll use both versions - cleaned for classification, original for extraction
        
        return cleaned
    
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
        
        # STEP 1: Extract Category
        category_result = self.category_classifier.classify_with_details(cleaned_transcript)
        category_field = self.confidence_calculator.process_field(
            "category",
            category_result["id"],
            category_result["confidence"],
            cleaned_transcript
        )
        
        # STEP 2: Extract Entities (name, phone, location)
        entities = self.entity_extractor.extract_all(transcript)  # Use original for better entity extraction
        
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
        processing_time = int((time.time() - start_time) * 1000)  # in milliseconds
        
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
            "metadata": {
                "original_transcript": transcript,
                "cleaned_transcript": cleaned_transcript,
                "description_summary": description_result["summary"],
                "description_details": description_result["details"]
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
        # Determine which field is being updated
        # Check what was missing or needed clarification
        missing = previous_data.get("missing_fields", [])
        needs_clarification = previous_data.get("requires_clarification", [])
        
        # Start with previous data
        updated_data = previous_data.copy()
        
        # Try to extract the missing/unclear field from new transcript
        if "location" in missing or "location" in needs_clarification:
            # Extract location
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
        
        # Recalculate missing fields and clarifications
        extracted_fields = {
            "category": updated_data.get("category"),
            "location": updated_data.get("location"),
            "description": updated_data.get("description")
        }
        
        updated_data["missing_fields"] = self.confidence_calculator.identify_missing_fields(extracted_fields)
        updated_data["requires_clarification"] = self.confidence_calculator.identify_clarification_needed(extracted_fields)
        
        # Update processing time
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
            "processing_time_ms": 0
        }
    
    def _generate_conversation_id(self) -> str:
        """
        Generate a unique conversation ID
        
        Returns:
            Unique conversation ID
        """
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        return f"conv_{timestamp}"


# Example usage (for testing)
if __name__ == "__main__":
    # Initialize processor
    processor = NLUProcessor()
    
    # Test case 1: Complete transcript
    print("=" * 60)
    print("TEST 1: Complete Transcript")
    print("=" * 60)
    
    transcript1 = """
    Hello, I want to report a pothole on Riverside Drive near Oak Street intersection.
    It's been there for about two weeks and it's getting worse. The pothole is 
    approximately 3 feet wide and 6 inches deep. Several cars have damaged their 
    tires because of it. My name is Sarah Martinez and you can reach me at 555-0123.
    """
    
    result1 = processor.process(transcript1, conversation_id="test_001")
    
    print(f"\nCategory: {result1['category']['value']} (confidence: {result1['category']['confidence']})")
    print(f"Location: {result1['location']['value']} (confidence: {result1['location']['confidence']})")
    print(f"Description: {result1['description']['value'][:50]}...")
    print(f"Caller: {result1['caller_name']['value']} - {result1['caller_phone']['value']}")
    print(f"Sentiment: {result1['sentiment']['overall_score']} (Urgency: {result1['sentiment']['urgency_level']})")
    print(f"Missing Fields: {result1['missing_fields']}")
    print(f"Needs Clarification: {result1['requires_clarification']}")
    print(f"Processing Time: {result1['processing_time_ms']}ms")
    
    # Test case 2: Missing location
    print("\n" + "=" * 60)
    print("TEST 2: Missing Location")
    print("=" * 60)
    
    transcript2 = "There's a streetlight not working. It's been dark for weeks."
    
    result2 = processor.process(transcript2, conversation_id="test_002")
    
    print(f"\nCategory: {result2['category']['value']} (confidence: {result2['category']['confidence']})")
    print(f"Location: {result2['location']['value']} (confidence: {result2['location']['confidence']})")
    print(f"Missing Fields: {result2['missing_fields']}")
    print(f"Processing Time: {result2['processing_time_ms']}ms")