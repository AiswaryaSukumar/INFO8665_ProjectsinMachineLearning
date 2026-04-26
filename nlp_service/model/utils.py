"""
Utility functions for NLU module
Handles text preprocessing, cleaning, and common operations
"""

import re
import json
from typing import Dict, List, Optional


def load_json(filepath: str) -> Dict:
    """
    Load JSON file and return as dictionary
    
    Args:
        filepath: Path to JSON file
        
    Returns:
        Dictionary containing JSON data
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data: Dict, filepath: str) -> None:
    """
    Save dictionary as JSON file
    
    Args:
        data: Dictionary to save
        filepath: Path to save JSON file
    """
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def clean_transcript(text: str) -> str:
    """
    Clean and normalize transcript text
    Removes filler words, extra spaces, normalizes text
    
    Args:
        text: Raw transcript text
        
    Returns:
        Cleaned transcript text
    """
    if not text:
        return ""
    
    # Convert to lowercase for processing
    text = text.lower()
    
    # Remove multiple spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Remove leading/trailing spaces
    text = text.strip()
    
    return text


def remove_filler_words(text: str) -> str:
    """
    Remove common filler words from transcript
    
    Args:
        text: Input text
        
    Returns:
        Text with filler words removed
    """
    # Common filler words in conversational speech
    filler_words = [
        r'\bum\b', r'\buh\b', r'\blike\b', r'\byou know\b',
        r'\bi mean\b', r'\bso\b', r'\bwell\b', r'\bokay\b',
        r'\byeah\b', r'\byep\b', r'\bnah\b'
    ]
    
    cleaned_text = text
    for filler in filler_words:
        cleaned_text = re.sub(filler, ' ', cleaned_text, flags=re.IGNORECASE)
    
    # Remove multiple spaces created by removal
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()
    
    return cleaned_text


def detect_uncertainty_markers(text: str) -> List[str]:
    """
    Detect words/phrases that indicate uncertainty
    Used for confidence score calculation
    
    Args:
        text: Input text
        
    Returns:
        List of uncertainty markers found
    """
    uncertainty_markers = [
        'maybe', 'perhaps', 'i think', 'i guess', 'not sure',
        'probably', 'might be', 'could be', 'i don\'t know',
        'not certain', 'possibly'
    ]
    
    found_markers = []
    text_lower = text.lower()
    
    for marker in uncertainty_markers:
        if marker in text_lower:
            found_markers.append(marker)
    
    return found_markers


def handle_self_corrections(text: str) -> str:
    """
    Handle self-corrections in speech (e.g., "Baker Road no wait Baker Street")
    Keeps the corrected version
    
    Args:
        text: Input text with potential self-corrections
        
    Returns:
        Text with corrections applied
    """
    # Pattern: "X no wait Y" -> keep Y
    correction_patterns = [
        (r'(\w+)\s+no\s+wait\s+(\w+)', r'\2'),
        (r'(\w+)\s+I mean\s+(\w+)', r'\2'),
        (r'(\w+)\s+sorry\s+(\w+)', r'\2'),
        (r'(\w+)\s+actually\s+(\w+)', r'\2')
    ]
    
    corrected_text = text
    for pattern, replacement in correction_patterns:
        corrected_text = re.sub(pattern, replacement, corrected_text, flags=re.IGNORECASE)
    
    return corrected_text


def extract_phone_number(text: str) -> Optional[str]:
    """
    Extract phone number from text using regex patterns
    
    Args:
        text: Input text
        
    Returns:
        Phone number if found, None otherwise
    """
    # Common phone number patterns
    patterns = [
        r'\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b',  # 555-123-4567 or 555 123 4567
        r'\b(\d{3}[-.\s]?\d{4})\b',              # 555-1234
        r'\((\d{3})\)\s*(\d{3})[-.\s]?(\d{4})',  # (555) 123-4567
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            # Clean and format phone number
            phone = ''.join(filter(str.isdigit, match.group(0)))
            # Format as XXX-XXXX or XXX-XXX-XXXX
            if len(phone) == 7:
                return f"{phone[:3]}-{phone[3:]}"
            elif len(phone) == 10:
                return f"{phone[:3]}-{phone[3:6]}-{phone[6:]}"
            else:
                return phone
    
    return None


def normalize_location(location: str) -> str:
    """
    Normalize location text
    Handles common variations (St vs Street, Ave vs Avenue, etc.)
    
    Args:
        location: Raw location text
        
    Returns:
        Normalized location
    """
    if not location:
        return ""
    
    # Abbreviation mappings (with and without trailing period, e.g. "St." and "St")
    abbreviations = {
        r'\bst\.': 'street',   # "St." with period — must come before \bst\b
        r'\bst\b': 'street',
        r'\bave\.': 'avenue',
        r'\bave\b': 'avenue',
        r'\brd\.': 'road',
        r'\brd\b': 'road',
        r'\bblvd\.': 'boulevard',
        r'\bblvd\b': 'boulevard',
        r'\bdr\.': 'drive',
        r'\bdr\b': 'drive',
        r'\bln\.': 'lane',
        r'\bln\b': 'lane',
        r'\bct\.': 'court',
        r'\bct\b': 'court',
        r'\bpl\.': 'place',
        r'\bpl\b': 'place',
        r'\bhwy\.': 'highway',
        r'\bhwy\b': 'highway',
        # Cardinal direction abbreviations — expand so stored address is unambiguous
        r'\bne\b': 'Northeast',
        r'\bnw\b': 'Northwest',
        r'\bse\b': 'Southeast',
        r'\bsw\b': 'Southwest',
        r'\bn\b': 'North',
        r'\bs\b': 'South',
        r'\be\b': 'East',
        r'\bw\b': 'West',
    }

    normalized = location.lower()

    for abbrev, full in abbreviations.items():
        normalized = re.sub(abbrev, full, normalized, flags=re.IGNORECASE)
    
    # Capitalize first letter of each word
    normalized = ' '.join(word.capitalize() for word in normalized.split())
    
    return normalized


def calculate_text_confidence(text: str, extracted_value: Optional[str]) -> float:
    """
    Calculate confidence score based on text characteristics
    
    Args:
        text: Original text
        extracted_value: The extracted value (can be None)
        
    Returns:
        Confidence score between 0 and 1
    """
    if not extracted_value:
        return 0.0
    
    # Start with base confidence
    confidence = 0.7
    
    # Reduce confidence if uncertainty markers present
    uncertainty_markers = detect_uncertainty_markers(text)
    if uncertainty_markers:
        confidence -= 0.1 * len(uncertainty_markers)
    
    # Increase confidence if value is specific (e.g., has numbers, proper formatting)
    if re.search(r'\d', extracted_value):  # Contains numbers
        confidence += 0.1
    
    if len(extracted_value.split()) >= 2:  # Multi-word (more specific)
        confidence += 0.1
    
    # Clamp between 0 and 1
    return max(0.0, min(1.0, confidence))


def get_urgency_keywords() -> Dict[str, List[str]]:
    """
    Get urgency level keywords
    
    Returns:
        Dictionary mapping urgency levels to keyword lists
    """
    return {
        "critical": [
            "emergency", "urgent", "immediately", "dangerous", "critical",
            "life-threatening", "accident", "injured", "fire", "explosion"
        ],
        "high": [
            "serious", "major", "severe", "significant", "important",
            "affecting many", "for days", "for weeks", "getting worse"
        ],
        "medium": [
            "problem", "issue", "not working", "broken", "damaged"
        ],
        "low": [
            "minor", "small", "noticed", "could be better"
        ]
    }


def format_output(data: Dict) -> Dict:
    """
    Format NLU output to standard JSON schema
    
    Args:
        data: Raw extracted data
        
    Returns:
        Formatted output dictionary
    """
    return {
        "conversation_id": data.get("conversation_id", ""),
        "extraction_timestamp": data.get("extraction_timestamp", ""),
        "category": data.get("category", {}),
        "location": data.get("location", {}),
        "description": data.get("description", {}),
        "caller_name": data.get("caller_name", {}),
        "caller_phone": data.get("caller_phone", {}),
        "sentiment": data.get("sentiment", {}),
        "requires_clarification": data.get("requires_clarification", []),
        "missing_fields": data.get("missing_fields", []),
        "processing_time_ms": data.get("processing_time_ms", 0)
    }