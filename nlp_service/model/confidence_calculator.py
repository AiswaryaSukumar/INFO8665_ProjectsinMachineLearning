"""
Confidence Calculator - FIXED VERSION
Calculates and manages confidence scores for extracted fields
"""

from typing import Dict, List

from logging_config import get_logger
from config import (
    CONFIDENCE_HIGH_THRESHOLD, CONFIDENCE_MEDIUM_THRESHOLD,
    CATEGORY_HIGH_THRESHOLD, CATEGORY_MEDIUM_THRESHOLD,
)

logger = get_logger("insight311.confidence")


class ConfidenceCalculator:
    """
    Calculates confidence scores for NLU extractions and determines
    which fields need clarification or are missing
    """
    
    def __init__(self):
        """Initialize confidence calculator with thresholds"""
        # General thresholds
        self.high_threshold = CONFIDENCE_HIGH_THRESHOLD
        self.medium_threshold = CONFIDENCE_MEDIUM_THRESHOLD
        
        # SPECIAL: Lower threshold for category (ML predictions often lower)
        self.category_high_threshold = CATEGORY_HIGH_THRESHOLD
        self.category_medium_threshold = CATEGORY_MEDIUM_THRESHOLD
        
        logger.info(
            "confidence_calculator_init high=%s medium=%s cat_high=%s cat_medium=%s",
            self.high_threshold, self.medium_threshold,
            self.category_high_threshold, self.category_medium_threshold,
        )
    
# ConfidenceCalculator - IMPROVED VERSION

def process_field(self, field_name: str, value: any, base_confidence: float, transcript: str) -> Dict:
    if not value:
        return {"value": None, "confidence": 0.0, "confirmed": "missing"}
    
    confidence = base_confidence
    transcript_lower = transcript.lower()
    
    # ✅ IMPROVEMENT 1: Only penalize uncertainty, NOT self-correction
    uncertainty_markers = ["maybe", "not sure", "perhaps"]
    if any(marker in transcript_lower for marker in uncertainty_markers):
        confidence *= 0.85 

    # ✅ IMPROVEMENT 2: BOOST confidence if the user is clearly correcting themselves
    # "Actually" usually means the user is giving the FINAL, correct answer.
    correction_markers = ["no wait", "actually", "i mean", "correction"]
    if any(marker in transcript_lower for marker in correction_markers):
        confidence *= 1.2  # Increase by 20% instead of reducing!
    
    # ✅ IMPROVEMENT 3: Integrate location specificity into the score
    if field_name == "location":
        spec_boost = self.evaluate_location_specificity(str(value), transcript)
        confidence += (spec_boost * 0.2) # Add up to 0.2 bonus

    # ✅ IMPROVEMENT 4: Lower the 'Missing' barrier
    # If we found a value, it shouldn't be "missing" unless it's extremely low.
    confidence = min(round(confidence, 2), 1.0)
    
    if field_name == "category":
        high = self.category_high_threshold # 0.60
        med = self.category_medium_threshold # 0.35
    else:
        high = self.high_threshold # 0.80
        med = 0.25  # LOWERED from 0.50 to prevent 'missing' loops
    
    if confidence >= high:
        status = "pending_confirmation"
    elif confidence >= med:
        status = "needs_clarification"
    else:
        status = "missing"

    return {"value": value, "confidence": confidence, "confirmed": status}
    
    def calculate_overall_confidence(self, extracted_data: Dict) -> float:
        """
        Calculate overall confidence across all extracted fields
        
        Args:
            extracted_data: Dictionary of extracted fields with confidence scores
            
        Returns:
            Overall confidence score (0.0 to 1.0)
        """
        # Core fields that matter most for overall confidence
        core_fields = ["category", "location", "description"]
        
        confidences = []
        for field in core_fields:
            if field in extracted_data and extracted_data[field].get("confidence"):
                confidences.append(extracted_data[field]["confidence"])
        
        if not confidences:
            return 0.0
        
        # Weighted average (category is most important)
        if len(confidences) >= 3:
            # category, location, description all present
            weights = [0.4, 0.35, 0.25]  # category weighs most
            overall = sum(c * w for c, w in zip(confidences, weights))
        else:
            # Simple average if not all fields present
            overall = sum(confidences) / len(confidences)
        
        return round(overall, 2)
    
    def identify_missing_fields(self, extracted_data: Dict) -> List[str]:
        """
        Identify which required fields are missing
        
        Args:
            extracted_data: Dictionary of extracted fields
            
        Returns:
            List of missing field names
        """
        missing = []
        
        # Core required fields
        required_fields = ["category", "location", "description"]
        
        for field in required_fields:
            if field in extracted_data:
                field_data = extracted_data[field]
                # Field is missing if:
                # 1. Value is None
                # 2. Confidence is 0
                # 3. Status is "missing"
                if (field_data.get("value") is None or 
                    field_data.get("confidence", 0) == 0 or
                    field_data.get("confirmed") == "missing"):
                    missing.append(field)
        
        # Optional fields (only add if completely absent, not if just low confidence)
        optional_fields = ["caller_name", "caller_phone"]
        for field in optional_fields:
            if field in extracted_data:
                field_data = extracted_data[field]
                # Only mark as missing if value is actually None
                if field_data.get("value") is None:
                    missing.append(field)
        
        return missing
    
    def identify_clarification_needed(self, extracted_data: Dict) -> List[str]:
        """
        Identify which fields need clarification
        
        Args:
            extracted_data: Dictionary of extracted fields
            
        Returns:
            List of field names needing clarification
        """
        needs_clarification = []
        
        # Check all fields
        all_fields = ["category", "location", "description", "caller_name", "caller_phone"]
        
        for field in all_fields:
            if field in extracted_data:
                field_data = extracted_data[field]
                # Needs clarification if status is explicitly "needs_clarification"
                # AND value is present (not None)
                if (field_data.get("confirmed") == "needs_clarification" and
                    field_data.get("value") is not None):
                    needs_clarification.append(field)
        
        return needs_clarification
    
    def evaluate_location_specificity(self, location: str, transcript: str) -> float:
        """
        Evaluate how specific a location description is
        
        Args:
            location: Extracted location string
            transcript: Original transcript
            
        Returns:
            Specificity score (0.0 to 1.0)
        """
        if not location:
            return 0.0
        
        specificity_score = 0.5  # Base score
        
        # Indicators of high specificity
        high_specificity_markers = [
            r'\d+',  # Street numbers (e.g., "123 Main St")
            'intersection', 'corner', 'between',
            'near', 'behind', 'in front of', 'beside',
            'building', 'park', 'school', 'library'
        ]
        
        import re
        location_lower = location.lower()
        
        for marker in high_specificity_markers:
            if re.search(marker, location_lower):
                specificity_score += 0.1
        
        # Cap at 1.0
        return min(specificity_score, 1.0)