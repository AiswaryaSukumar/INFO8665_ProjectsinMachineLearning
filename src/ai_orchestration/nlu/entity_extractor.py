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
            "main street",
            "first street",
            "second street",
            "third street",
            "park avenue",
            "oak street",
            "maple street",
            "elm street",
            "center street",
            "church street",
            "washington street",
            "market street",
            "high street",
            "broad street",
        ]

    def extract_caller_name(self, text: str) -> Tuple[Optional[str], float]:
        if not text:
            return None, 0.0

        doc = self.nlp(text)

        # Look for PERSON entities
        person_entities = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]

        # If spaCy did not find any PERSON entities, try pattern-based extraction
        if not person_entities:
            name_patterns = [
                r"my name is ([A-Za-z]+(?:\s+[A-Za-z]+)?)",
                r"this is ([A-Za-z]+(?:\s+[A-Za-z]+)?)",
                r"i'?m ([A-Za-z]+(?:\s+[A-Za-z]+)?)",
                r"name is ([A-Za-z]+(?:\s+[A-Za-z]+)?)",
                r"call me ([A-Za-z]+(?:\s+[A-Za-z]+)?)",
            ]

            for pattern in name_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    name = match.group(1).strip().title()
                    confidence = 0.85
                    return name, confidence

            return None, 0.0

        # Use the first PERSON entity
        name = person_entities[0]

        confidence = 0.8
        if any(
            phrase in text.lower() for phrase in ["my name", "this is", "i'm", "i am"]
        ):
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

        phone = extract_phone_number(text)

        if phone:
            confidence = 0.95

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
        is_generic = any(
            generic in location_lower for generic in self.generic_street_names
        )
        if is_generic:
            specificity_score = 0.4  # Lower score for generic names

        # 1. Has street number (e.g., "123 Main Street")
        if re.search(r"\b\d+\b", location):
            specificity_score += 0.3

        # 2. Has intersection keywords
        if any(
            word in location_lower
            for word in ["and", "at", "intersection", "corner", "junction"]
        ):
            specificity_score += 0.2

        # 3. Has vague landmark markers in full text
        if any(
            word in full_text.lower()
            for word in ["near", "opposite", "beside", "next to", "in front of"]
        ):
            specificity_score += 0.2

        # 4. Has additional GPE/LOC entities in the full text
        doc = self.nlp(full_text)
        location_entities = [ent.text for ent in doc.ents if ent.label_ in ["GPE", "LOC"]]
        if len(location_entities) > 1:
            specificity_score += 0.2

        # 5. Has facility/building keywords
        facility_keywords = [
            "building",
            "apartment",
            "mall",
            "school",
            "hospital",
            "station",
            "center",
        ]
        if any(keyword in full_text.lower() for keyword in facility_keywords):
            specificity_score += 0.15

        specificity_score = min(1.0, specificity_score)
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

        doc = self.nlp(text)

        # Look for location entities
        location_entities = [
            ent.text
            for ent in doc.ents
            if ent.label_ in ["GPE", "LOC", "FAC", "ORG"]
        ]

        if not location_entities:
            # Pattern-based street address extraction
            street_patterns = [
                r"on ([A-Z][a-z]+ (?:Street|Avenue|Road|Boulevard|Drive|Lane|Court|Place))",
                r"at ([A-Z][a-z]+ (?:Street|Avenue|Road|Boulevard|Drive|Lane|Court|Place))",
                r"([A-Z][a-z]+ (?:Street|Avenue|Road|Boulevard|Drive|Lane|Court|Place)(?: near [A-Z][a-z]+)?)",
            ]

            for pattern in street_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    location = match.group(1)
                    normalized = normalize_location(location)

                    is_specific, specificity_score = self._is_location_specific(
                        normalized, text
                    )

                    confidence = 0.5 + (specificity_score * 0.4)  # 0.5 ~ 0.9

                    return normalized, confidence

            # Vague location indicators
            vague_patterns = [
                r"near (the )?([\w\s]+)",
                r"at (the )?([\w\s]+)",
                r"on ([\w\s]+)",
            ]

            for pattern in vague_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    location = match.group(2) if match.lastindex == 2 else match.group(1)
                    location = location.strip()
                    if len(location) > 3 and len(location.split()) <= 5:
                        return location, 0.4

            return None, 0.0

        # Combine all location entities found by spaCy
        location = " ".join(location_entities)
        location = normalize_location(location)

        is_specific, specificity_score = self._is_location_specific(location, text)

        confidence = 0.6  # base

        if is_specific:
            confidence = 0.85
        else:
            confidence = 0.5 + (specificity_score * 0.3)

        if any(
            phrase in text.lower()
            for phrase in ["i think", "maybe", "probably", "not sure"]
        ):
            confidence *= 0.7

        confidence = max(0.0, min(1.0, confidence))

        return location, round(confidence, 2)

    def extract_all(self, text: str, active_slot: Optional[str] = None) -> Dict:
        """
        Extract all entities from transcript.

        Args:
            text: Input transcript text
            active_slot: Which slot is currently being filled
                         ("location", "caller_name", "phone_number" or None)

        Returns:
            Dictionary with all extracted entities and confidence scores
        """
        caller_name: Optional[str] = None
        name_confidence: float = 0.0
        caller_phone: Optional[str] = None
        phone_confidence: float = 0.0
        location: Optional[str] = None
        location_confidence: float = 0.0

        # Run extractors; NLU layer will decide which slot to actually update
        # You can also gate here if you want extraction itself to be limited.
        if active_slot in (None, "caller_name", "location", "phone_number"):
            # Name
            name_value, name_conf = self.extract_caller_name(text)
            caller_name = name_value
            name_confidence = name_conf

            # Phone
            phone_value, phone_conf = self.extract_phone_number(text)
            caller_phone = phone_value
            phone_confidence = phone_conf

            # Location
            loc_value, loc_conf = self.extract_location(text)
            location = loc_value
            location_confidence = loc_conf

        return {
            "caller_name": {
                "value": caller_name,
                "confidence": round(name_confidence, 2),
            },
            "caller_phone": {
                "value": caller_phone,
                "confidence": round(phone_confidence, 2),
            },
            "location": {
                "value": location,
                "confidence": round(location_confidence, 2),
            },
        }


if __name__ == "__main__":
    extractor = EntityExtractor()

    test1 = "There's a pothole on Main Street"
    result1 = extractor.extract_all(test1)
    print("Test 1 (Vague):")
    print(
        f"  Location: {result1['location']['value']} "
        f"(confidence: {result1['location']['confidence']})"
    )

    test2 = "There's a pothole on Main Street near the park"
    result2 = extractor.extract_all(test2)
    print("\nTest 2 (More Specific):")
    print(
        f"  Location: {result2['location']['value']} "
        f"(confidence: {result2['location']['confidence']})"
    )

    test3 = "There's a pothole at 123 Main Street and Oak Avenue intersection"
    result3 = extractor.extract_all(test3)
    print("\nTest 3 (Very Specific):")
    print(
        f"  Location: {result3['location']['value']} "
        f"(confidence: {result3['location']['confidence']})"
    )
