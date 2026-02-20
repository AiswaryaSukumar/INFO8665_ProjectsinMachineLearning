"""
Confidence Calculator - FIXED VERSION
Calculates and manages confidence scores for extracted fields
"""

from typing import Dict, List


class ConfidenceCalculator:
    """
    Calculates confidence scores for NLU extractions and determines
    which fields need clarification or are missing
    """
    
    def __init__(self):
        """Initialize confidence calculator with thresholds"""
        # General thresholds
        self.high_threshold = 0.80      # High confidence
        self.medium_threshold = 0.50    # Medium confidence
        
        # SPECIAL: Lower threshold for category (ML predictions often lower)
        self.category_high_threshold = 0.60
        self.category_medium_threshold = 0.35  # LOWERED from 0.50
    
    def process_field(
        self,
        field_name: str,
        value: any,
        base_confidence: float,
        transcript: str
    ) -> Dict:
        """
        Process a single field and calculate its confidence status
        
        Args:
            field_name: Name of the field (category, location, etc.)
            value: Extracted value
            base_confidence: Initial confidence score
            transcript: Original transcript text
            
        Returns:
            Dictionary with value, confidence, and confirmation status
        """
        if not value:
            return {
                "value": None,
                "confidence": 0.0,
                "confirmed": "missing"
            }
        
        # Adjust confidence based on text markers
        confidence = base_confidence
        
        # Check for uncertainty markers
        uncertainty_markers = ["maybe", "i think", "probably", "not sure", "perhaps"]
        if any(marker in transcript.lower() for marker in uncertainty_markers):
            confidence *= 0.85  # Reduce by 15%
        
        # Check for self-corrections
        correction_markers = ["no wait", "actually", "i mean", "correction"]
        if any(marker in transcript.lower() for marker in correction_markers):
            confidence *= 0.90  # Reduce by 10%
        
        # Boost confidence for specific, detailed information
        if field_name == "location" and len(str(value).split()) >= 3:
            confidence *= 1.1  # Increase by 10%
        
        # SPECIAL HANDLING FOR CATEGORY
        # ML predictions often have lower raw confidence but are still useful
        if field_name == "category":
            if confidence >= self.category_high_threshold:  # 0.60
                status = "pending_confirmation"
            elif confidence >= self.category_medium_threshold:  # 0.35 (LOWERED!)
                status = "needs_clarification"
            else:
                status = "missing"
        else:
            # Other fields use standard thresholds
            if confidence >= self.high_threshold:  # 0.80
                status = "pending_confirmation"
            elif confidence >= self.medium_threshold:  # 0.50
                status = "needs_clarification"
            else:
                status = "missing"
        
        return {
            "value": value,
            "confidence": round(confidence, 2),
            "confirmed": status
        }
    
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