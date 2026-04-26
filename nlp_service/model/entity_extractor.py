"""
Entity Extraction Module - IMPROVED VERSION
Extracts caller name, phone number, and location from transcripts using spaCy
Now with better confidence scoring for vague/generic locations
"""

import spacy
import re
from typing import Dict, Optional, Tuple

from .utils import extract_phone_number, normalize_location, calculate_text_confidence
from .models.ner_confidence_model import NERConfidenceModel
from .models.location_calibrator import LocationCalibrator

_ROAD_TYPES = (
    "street", "avenue", "road", "boulevard", "drive", "lane",
    "court", "place", "way", "blvd", "ave", "rd", "st", "crescent",
    "circle", "trail", "terrace", "highway", "hwy",
)
_VAGUE_PHRASES = (
    "near", "around", "close to", "next to", "by the",
    "across from", "between", "behind", "in front of",
)


class EntityExtractor:
    """
    Extracts named entities from complaint transcripts
    - Caller name (PERSON)  — confidence via dslim/bert-base-NER
    - Phone number (pattern matching)
    - Location (GPE, LOC, FAC) — confidence via PyTorch MLP calibrator
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

        self.ner_confidence  = NERConfidenceModel()
        self.loc_calibrator  = LocationCalibrator()

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

    BAD_NAME_TOKENS = {
        "calling", "call", "report", "reporting", "fix", "repair",
        "pothole", "issue", "problem", "street", "road", "avenue", "boulevard",
        "drive", "lane", "court", "place", "way", "crescent", "circle",
        "trail", "terrace", "highway", "st", "ave", "blvd", "rd", "dr",
        "ln", "ct", "pl", "hwy", "north", "south", "east", "west",
        "to", "for", "about", "near", "at", "on",
        # Intensifiers that spaCy can absorb into a PERSON span
        "so", "such", "too", "just",
    }

    # Adjectives/adverbs/descriptors that spaCy sometimes tags as PERSON.
    # Includes civic-complaint emotional vocabulary ("frustrating", "ridiculous", etc.)
    # so that phrases like "So Frustrating" or "Very Annoying" are never stored as names.
    BAD_NAME_ADJECTIVES = {
        "really", "very", "quite", "extremely", "absolutely", "totally",
        "highly", "seriously", "badly", "dangerously", "definitely",
        "actually", "basically", "honestly", "literally", "obviously",
        "apparently", "certainly", "dangerous", "hazardous", "urgent",
        "critical", "severe", "major", "minor", "terrible", "horrible",
        "awful", "bad", "good", "big", "large", "small", "broken",
        "damaged", "unsafe", "blocked", "flooded",
        # Frustration / emotion words common in civic complaints
        "frustrating", "frustrated", "annoying", "annoyed", "ridiculous",
        "unacceptable", "outrageous", "disgusting", "pathetic", "shameful",
        "unbelievable", "incredible", "insane", "crazy", "shocking",
        "embarrassing", "infuriating", "appalling", "deplorable",
    }

    # Regex: ends with a road abbreviation (with or without dot) + optional direction
    _ROAD_SUFFIX_RE = re.compile(
        r"\b(?:St|Ave|Blvd|Rd|Dr|Ln|Ct|Pl|Hwy|Street|Avenue|Boulevard|Road|"
        r"Drive|Lane|Court|Place|Highway|Crescent|Circle|Trail|Terrace|Way)"
        r"\.?\s*(?:North|South|East|West|NE|NW|SE|SW|N|S|E|W)?\.?\s*$",
        re.IGNORECASE,
    )

    def _is_name_candidate_valid(self, candidate: str) -> bool:
        """
        Heuristic filter to avoid treating phrases like
        'calling to', 'to report a pothole', 'William St.' etc. as caller names.

        Returns False if too many tokens are typical verbs/prepositions/etc.
        """
        tokens = [t.lower() for t in candidate.split() if t.strip()]
        if not tokens:
            return False

        # Reject anything that looks like a street address / road name
        if self._ROAD_SUFFIX_RE.search(candidate):
            return False

        bad_count = sum(1 for t in tokens if t in self.BAD_NAME_TOKENS)
        # If half or more of the tokens are in BAD_NAME_TOKENS, reject
        if (bad_count / len(tokens)) >= 0.5:
            return False

        # Reject if any token is a known adjective/adverb (not a real name)
        if any(t in self.BAD_NAME_ADJECTIVES for t in tokens):
            return False

        return True


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
                    raw_name = match.group(1).strip()

                    if not self._is_name_candidate_valid(raw_name):
                        continue

                    name = raw_name.title()
                    # ML-derived confidence (fallback=0.85 for explicit pattern match)
                    confidence = self.ner_confidence.get_name_confidence(text, name, fallback=0.85)
                    return name, confidence

            return None, 0.0

        # Filter spaCy PERSON entities — reject descriptive phrases
        valid_persons = [p for p in person_entities if self._is_name_candidate_valid(p)]

        if not valid_persons:
            return None, 0.0

        name = valid_persons[0]

        # Rule-based fallback: explicit phrase → 0.95, plain spaCy → 0.80
        rule_fallback = 0.95 if any(
            phrase in text.lower() for phrase in ["my name", "this is", "i'm", "i am"]
        ) else 0.80
        # ML-derived confidence
        confidence = self.ner_confidence.get_name_confidence(text, name, fallback=rule_fallback)

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

    def _location_feature_vector(self, location: str, full_text: str) -> list:
        """Compute the 5 binary features for LocationCalibrator."""
        loc_lower  = (location or "").lower()
        text_lower = (full_text or "").lower()

        has_street_number = float(bool(re.search(r"\b\d+\s+\w", loc_lower)))
        has_intersection  = float(bool(
            re.search(r"\b(and|&)\b", loc_lower) or
            any(w in loc_lower for w in ("intersection", "corner", "junction"))
        ))
        has_road_name     = float(any(rt in loc_lower for rt in _ROAD_TYPES))

        # If the normalized location already has a street number + road type, it is
        # structurally valid regardless of whether spaCy's NER model happens to know
        # the street name.  Force has_gpe_entity=1 to avoid penalising addresses like
        # "334 King St. South" that spaCy doesn't have in its training data.
        if has_street_number and has_road_name:
            has_gpe_entity = 1.0
        else:
            doc = self.nlp(full_text)
            has_gpe_entity = float(any(ent.label_ in ("GPE", "LOC", "FAC") for ent in doc.ents))

        has_vague_landmark = float(any(vp in text_lower for vp in _VAGUE_PHRASES))

        return [has_street_number, has_intersection, has_road_name,
                has_gpe_entity, has_vague_landmark]

    def extract_location(self, text: str) -> Tuple[Optional[str], float]:
        """
        Extract location from transcript.

        Confidence is derived from LocationCalibrator (ML MLP) when the model
        file exists, otherwise falls back to the weighted heuristic inside
        LocationCalibrator.calibrate().
        """
        if not text:
            return None, 0.0

        _dir_suffix  = r"(?:\s+(?:North|South|East|West|NE|NW|SE|SW|N|S|E|W))?"
        # Long-form and dot-terminated abbreviations are safe anywhere.
        # Short abbreviations (Pl, Ct, Dr, Ln, Rd, Ave, Blvd, Hwy) can be
        # ambiguous mid-word (e.g. "playground" contains "Pl"), so they are
        # only allowed at a word boundary (end of token) via (?=\b|\s|$).
        _road_suffix = (
            r"(?:"
            r"Street|Avenue|Boulevard|Crescent|Circle|Terrace|Highway|Lane|Court|Place|Drive|Road|Way|Trail"
            r"|St\."          # "St." — dot prevents mid-word match
            r"|Blvd\b|Blvd\."
            r"|Ave\b|Ave\."
            r"|Hwy\b|Hwy\."
            r"|Rd\b|Rd\."
            r"|Dr\b|Dr\."
            r"|Ln\b|Ln\."
            r"|Ct\b|Ct\."
            r"|Pl\b|Pl\."     # Pl must end a word — blocks "playground"
            r")"
        )

        # --- Priority 1: numbered street address (regex-first, bypasses spaCy bias) ---
        # e.g. "334 King St. South", "123 Main Street", "22 Oak Ave NW"
        # Try the direction-inclusive pattern first so that "88 Bridgeport Rd. East"
        # is captured in full rather than stopping at "88 Bridgeport Rd".
        _dir_required = r"(?:\s+(?:North|South|East|West|NE|NW|SE|SW|N|S|E|W))"
        addr_with_dir    = rf"\b(\d+\s+[A-Za-z][A-Za-z\s]+?\s+{_road_suffix}{_dir_required})\b"
        addr_without_dir = rf"\b(\d+\s+[A-Za-z][A-Za-z\s]+?\s+{_road_suffix})\b"
        m = re.search(addr_with_dir, text, re.IGNORECASE) or \
            re.search(addr_without_dir, text, re.IGNORECASE)
        if m:
            location   = normalize_location(m.group(1).strip())
            feat       = self._location_feature_vector(location, text)
            confidence = self.loc_calibrator.calibrate(feat)
            if any(p in text.lower() for p in ["i think", "maybe", "probably", "not sure"]):
                confidence = round(confidence * 0.75, 4)
            return location, round(max(0.0, min(1.0, confidence)), 2)

        # --- Priority 2: spaCy NER for named places (parks, districts, etc.) ---
        doc = self.nlp(text)
        location_entities = [
            ent.text
            for ent in doc.ents
            if ent.label_ in ["GPE", "LOC", "FAC", "ORG"]
        ]

        if not location_entities:
            # --- Priority 3: unnamed street address (no building number) ---
            # e.g. "King Street South", "Main Ave NW"
            # Requires a location preposition prefix so that mid-sentence words like
            # "s a massive pothole on King Street North" are not captured from
            # partial words following an apostrophe (e.g. "There's ...").
            # Street name is capped at 3 words (e.g. "King", "Oak Avenue", "Victoria Park Ave")
            # to prevent a preposition mid-sentence (e.g. "Victoria Park on King St. E")
            # from being absorbed into the address name via lazy/greedy over-matching.
            _name3 = r"[A-Za-z]+(?:\s+[A-Za-z]+){0,2}"
            no_num_pattern = rf"(?:on|at|in|near|along)\s+({_name3}\s+{_road_suffix}\s+(?:North|South|East|West|NE|NW|SE|SW|N|S|E|W))\b"
            m2 = re.search(no_num_pattern, text, re.IGNORECASE)
            if m2:
                location   = normalize_location(m2.group(1).strip())
                feat       = self._location_feature_vector(location, text)
                confidence = self.loc_calibrator.calibrate(feat)
                if any(p in text.lower() for p in ["i think", "maybe", "probably", "not sure"]):
                    confidence = round(confidence * 0.75, 4)
                return location, round(max(0.0, min(1.0, confidence)), 2)

            # --- Priority 4: unnamed street address without directional suffix ---
            street_patterns = [
                rf"(?:location\s+is|located\s+at|the\s+address\s+is)\s+((?:\d+\s+)?{_name3}\s+{_road_suffix})",
                rf"(?:on|at|in|near|along)\s+((?:\d+\s+)?{_name3}\s+{_road_suffix})",
            ]
            for pattern in street_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    location   = normalize_location(match.group(1))
                    feat       = self._location_feature_vector(location, text)
                    confidence = self.loc_calibrator.calibrate(feat)
                    if any(p in text.lower() for p in ["i think", "maybe", "probably", "not sure"]):
                        confidence = round(confidence * 0.75, 4)
                    return location, round(confidence, 2)

            # --- Priority 5: vague landmark references ---
            # Only accept if the captured text looks like a proper named place:
            # - Must NOT start with an indefinite article ("a", "an") — filters
            #   phrases like "a playground", "an area", "a road" which are generic
            #   common nouns, not named landmarks.
            # - Must be 1–5 words and longer than 3 characters.
            _ARTICLES = {"a", "an"}
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
                    first_word = location.split()[0].lower() if location.split() else ""
                    if (
                        len(location) > 3
                        and len(location.split()) <= 5
                        and first_word not in _ARTICLES
                    ):
                        feat       = self._location_feature_vector(location, text)
                        confidence = self.loc_calibrator.calibrate(feat)
                        return location, round(min(confidence, 0.55), 2)

            return None, 0.0

        # spaCy found a named entity — recover directional suffix if present
        # Requires a preposition prefix to avoid matching from start-of-sentence
        # (e.g. "Hi my name is ... on King St. E" → should capture "King St. E" only).
        location = " ".join(location_entities)
        # Street name capped at 3 words — prevents absorbing mid-sentence prepositions.
        _name3 = r"[A-Za-z]+(?:\s+[A-Za-z]+){0,2}"
        no_num_pattern2 = rf"(?:on|at|in|near|along)\s+({_name3}\s+{_road_suffix}\s+(?:North|South|East|West|NE|NW|SE|SW|N|S|E|W))\b"
        m3 = re.search(no_num_pattern2, text, re.IGNORECASE)
        if m3:
            location = m3.group(1).strip()

        location   = normalize_location(location)
        feat       = self._location_feature_vector(location, text)
        confidence = self.loc_calibrator.calibrate(feat)

        if any(p in text.lower() for p in ["i think", "maybe", "probably", "not sure"]):
            confidence = round(confidence * 0.75, 4)

        return location, round(max(0.0, min(1.0, confidence)), 2)

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
