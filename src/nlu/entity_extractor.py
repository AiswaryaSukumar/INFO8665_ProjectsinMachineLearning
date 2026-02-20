"""
Entity Extraction Module - IMPROVED VERSION
Extracts caller name, phone number, and location from transcripts using spaCy
Now with better confidence scoring for vague/generic locations
"""

import spacy
import re
from typing import Dict, Optional, Tuple
from .utils import extract_phone_number, normalize_location, calculate_text_confidence


class EntityExtractor:
    """
    Extracts named entities from complaint transcripts
    - Caller name (PERSON)
    - Phone number (pattern matching)
    - Location (GPE, LOC, FAC)
    """
    
    def __init__(self, model_name: str = "en_core_web_md"):
        """
        Initialize spaCy model for entity extraction
        
        Args:
            model_name: Name of spaCy model to load
        """
        try:
            self.nlp = spacy.load(model_name)
        except OSError:
            print(f"Model '{model_name}' not found. Downloading...")
            import subprocess
            subprocess.run(["python", "-m", "spacy", "download", model_name])
            self.nlp = spacy.load(model_name)
        
        # Generic/vague street names that need more context
        self.generic_street_names = [
            'main street', 'first street', 'second street', 'third street',
            'park avenue', 'oak street', 'maple street', 'elm street',
            'center street', 'church street', 'washington street',
            'market street', 'high street', 'broad street'
        ]
    
    def extract_caller_name(self, text: str) -> Tuple[Optional[str], float]:
        """
        Extract caller name from transcript
        
        Args:
            text: Input transcript text
            
        Returns:
            Tuple of (name, confidence_score)
        """
        if not text:
            return None, 0.0
        
        # Process text with spaCy
        doc = self.nlp(text)
        
        # Look for PERSON entities
        person_entities = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]
        
        if not person_entities:
            # Try pattern matching for "my name is X" or "this is X"
            name_patterns = [
                r'my name is ([A-Z][a-z]+ [A-Z][a-z]+)',
                r'this is ([A-Z][a-z]+ [A-Z][a-z]+)',
                r'I\'m ([A-Z][a-z]+ [A-Z][a-z]+)',
                r'name is ([A-Z][a-z]+ [A-Z][a-z]+)',
            ]
            
            for pattern in name_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    name = match.group(1)
                    confidence = 0.85
                    return name, confidence
            
            return None, 0.0
        
        # Get the first person name (usually the caller)
        name = person_entities[0]
        
        # Calculate confidence based on context
        confidence = 0.8
        
        # Increase confidence if name appears near "my name" or "this is"
        if any(phrase in text.lower() for phrase in ["my name", "this is", "i'm", "i am"]):
            confidence = 0.95
        
        return name, confidence
    
    def extract_phone_number(self, text: str) -> Tuple[Optional[str], float]:
        """
        Extract phone number from transcript
        
        Args:
            text: Input transcript text
            
        Returns:
            Tuple of (phone_number, confidence_score)
        """
        if not text:
            return None, 0.0
        
        # Use utility function for phone extraction
        phone = extract_phone_number(text)
        
        if phone:
            # High confidence if phone found
            confidence = 0.95
            
            # Check for uncertainty in phone number
            if "or was it" in text.lower() or "or is it" in text.lower():
                confidence = 0.6
            
            return phone, confidence
        
        return None, 0.0
    
    def _is_location_specific(self, location: str, full_text: str) -> Tuple[bool, float]:
        """
        Determine if location is specific enough
        Returns (is_specific, specificity_score)
        
        Args:
            location: Extracted location string
            full_text: Full transcript text
            
        Returns:
            Tuple of (is_specific: bool, specificity_score: float)
        """
        if not location:
            return False, 0.0
        
        location_lower = location.lower()
        specificity_score = 0.5  # Base score
        
        # Check if it's a generic street name
        is_generic = any(generic in location_lower for generic in self.generic_street_names)
        
        if is_generic:
            specificity_score = 0.4  # Lower score for generic names
        
        # INCREASE specificity if has additional context:
        
        # 1. Has street number (e.g., "123 Main Street")
        if re.search(r'\b\d+\b', location):
            specificity_score += 0.3
        
        # 2. Has intersection (e.g., "Main Street and Oak Avenue")
        if any(word in location_lower for word in ['and', 'at', 'intersection', 'corner', 'junction']):
            specificity_score += 0.2
        
        # 3. Has landmark (e.g., "Main Street near the park")
        if any(word in full_text.lower() for word in ['near', 'opposite', 'beside', 'next to', 'in front of']):
            specificity_score += 0.2
        
        # 4. Has city/area name
        # Look for additional location entities in the text
        doc = self.nlp(full_text)
        location_entities = [ent.text for ent in doc.ents if ent.label_ in ["GPE", "LOC"]]
        if len(location_entities) > 1:  # Multiple locations mentioned
            specificity_score += 0.2
        
        # 5. Has building/facility name
        facility_keywords = ['building', 'apartment', 'mall', 'school', 'hospital', 'station', 'center']
        if any(keyword in full_text.lower() for keyword in facility_keywords):
            specificity_score += 0.15
        
        # Clamp between 0 and 1
        specificity_score = min(1.0, specificity_score)
        
        # Location is "specific" if score >= 0.7
        is_specific = specificity_score >= 0.7
        
        return is_specific, specificity_score
    
    def extract_location(self, text: str) -> Tuple[Optional[str], float]:
        """
        Extract location from transcript
        
        Args:
            text: Input transcript text
            
        Returns:
            Tuple of (location, confidence_score)
        """
        if not text:
            return None, 0.0
        
        # Process text with spaCy
        doc = self.nlp(text)
        
        # Look for location entities
        location_entities = [
            ent.text for ent in doc.ents 
            if ent.label_ in ["GPE", "LOC", "FAC", "ORG"]
        ]
        
        if not location_entities:
            # Try pattern matching for street addresses
            street_patterns = [
                r'on ([A-Z][a-z]+ (?:Street|Avenue|Road|Boulevard|Drive|Lane|Court|Place))',
                r'at ([A-Z][a-z]+ (?:Street|Avenue|Road|Boulevard|Drive|Lane|Court|Place))',
                r'([A-Z][a-z]+ (?:Street|Avenue|Road|Boulevard|Drive|Lane|Court|Place)(?: near [A-Z][a-z]+)?)',
            ]
            
            for pattern in street_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    location = match.group(1)
                    normalized = normalize_location(location)
                    
                    # Check specificity
                    is_specific, specificity_score = self._is_location_specific(normalized, text)
                    
                    # Base confidence on specificity
                    confidence = 0.5 + (specificity_score * 0.4)  # Range: 0.5 to 0.9
                    
                    return normalized, confidence
            
            # Look for vague location indicators
            vague_patterns = [
                r'near (the )?([\w\s]+)',
                r'at (the )?([\w\s]+)',
                r'on ([\w\s]+)',
            ]
            
            for pattern in vague_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    location = match.group(2) if match.lastindex == 2 else match.group(1)
                    location = location.strip()
                    if len(location) > 3 and len(location.split()) <= 5:
                        return location, 0.4  # Low confidence for vague location
            
            return None, 0.0
        
        # Combine all location entities
        location = " ".join(location_entities)
        
        # Normalize location
        location = normalize_location(location)
        
        # Check specificity
        is_specific, specificity_score = self._is_location_specific(location, text)
        
        # Calculate base confidence
        confidence = 0.6  # Base confidence
        
        # Adjust confidence based on specificity
        if is_specific:
            confidence = 0.85  # High confidence for specific locations
        else:
            confidence = 0.5 + (specificity_score * 0.3)  # Medium confidence
        
        # Check for uncertainty markers
        if any(phrase in text.lower() for phrase in ["i think", "maybe", "probably", "not sure"]):
            confidence *= 0.7  # Reduce by 30%
        
        # Clamp confidence
        confidence = max(0.0, min(1.0, confidence))
        
        return location, round(confidence, 2)
    
    def extract_all(self, text: str) -> Dict:
        """
        Extract all entities from transcript
        
        Args:
            text: Input transcript text
            
        Returns:
            Dictionary with all extracted entities and confidence scores
        """
        caller_name, name_confidence = self.extract_caller_name(text)
        caller_phone, phone_confidence = self.extract_phone_number(text)
        location, location_confidence = self.extract_location(text)
        
        return {
            "caller_name": {
                "value": caller_name,
                "confidence": round(name_confidence, 2)
            },
            "caller_phone": {
                "value": caller_phone,
                "confidence": round(phone_confidence, 2)
            },
            "location": {
                "value": location,
                "confidence": round(location_confidence, 2)
            }
        }


# Example usage (for testing)
if __name__ == "__main__":
    extractor = EntityExtractor()
    
    # Test case 1: Vague location (Main Street)
    test1 = "There's a pothole on Main Street"
    result1 = extractor.extract_all(test1)
    print("Test 1 (Vague):")
    print(f"  Location: {result1['location']['value']} (confidence: {result1['location']['confidence']})")
    
    # Test case 2: Specific location (Main Street near park)
    test2 = "There's a pothole on Main Street near the park"
    result2 = extractor.extract_all(test2)
    print("\nTest 2 (More Specific):")
    print(f"  Location: {result2['location']['value']} (confidence: {result2['location']['confidence']})")
    
    # Test case 3: Very specific (with number and intersection)
    test3 = "There's a pothole at 123 Main Street and Oak Avenue intersection"
    result3 = extractor.extract_all(test3)
    print("\nTest 3 (Very Specific):")
    print(f"  Location: {result3['location']['value']} (confidence: {result3['location']['confidence']})")