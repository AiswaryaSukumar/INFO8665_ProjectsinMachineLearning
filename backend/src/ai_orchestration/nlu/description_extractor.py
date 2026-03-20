"""
Description Extractor - FIXED VERSION
Extracts and simplifies complaint descriptions
"""

import re
from typing import Dict


class DescriptionExtractor:
    """
    Extracts the problem description from complaint transcripts
    Removes greetings, caller info, and creates simplified summaries
    """
    
    def __init__(self):
        """Initialize description extractor"""
        # Patterns to remove
        self.greeting_patterns = [
            r'\b(hi|hello|hey|good morning|good afternoon|good evening)\b',
            r'\bi want to report\b',
            r'\bi\'m calling about\b',
            r'\bthis is about\b'
        ]
        
        self.caller_info_patterns = [
            r'my name is [A-Za-z\s]+',
            r'this is [A-Za-z\s]+ calling',
            r'call me at [\d\-\(\)\s]+',
            r'you can reach me at [\d\-\(\)\s]+',
            r'my (phone )?number is [\d\-\(\)\s]+',
            r'[\d]{3}[-\.\s]?[\d]{3}[-\.\s]?[\d]{4}',  # Phone numbers
        ]
        
        self.urgency_patterns = [
            r'this is urgent',
            r'this is an? emergency',
            r'please (send|come|help)',
            r'right away',
            r'immediately',
            r'as soon as possible',
            r'asap'
        ]
    
    def extract(self, text: str, category: str = None) -> str:
        """
        Extract and clean the problem description
        
        Args:
            text: Transcript text
            category: Optional category for context
            
        Returns:
            Cleaned description
        """
        if not text:
            return ""
        
        description = text.lower().strip()
        
        # Remove greetings
        for pattern in self.greeting_patterns:
            description = re.sub(pattern, '', description, flags=re.IGNORECASE)
        
        # Remove caller information
        for pattern in self.caller_info_patterns:
            description = re.sub(pattern, '', description, flags=re.IGNORECASE)
        
        # Remove urgency markers (keep them for urgency detection, but not in description)
        for pattern in self.urgency_patterns:
            description = re.sub(pattern, '', description, flags=re.IGNORECASE)
        
        # Clean up extra spaces and punctuation
        description = re.sub(r'\s+', ' ', description)
        description = re.sub(r'[,\.]+\s*$', '', description)  # Remove trailing punctuation
        description = description.strip()
        
        # Capitalize first letter
        if description:
            description = description[0].upper() + description[1:]
        
        return description
    
    def extract_with_summary(self, text: str, category: str = None) -> Dict:
        """
        Extract full description and create a simplified summary
        
        Args:
            text: Transcript text
            category: Optional category for context
            
        Returns:
            Dictionary with full description, summary, details, and confidence
        """
        # Get cleaned full description
        full_description = self.extract(text, category)
        
        # Create simplified summary (first 50 characters or first sentence)
        summary = self._create_summary(full_description)
        
        # Extract specific details
        details = self._extract_details(text)
        
        # Calculate confidence (higher if description is detailed)
        confidence = self._calculate_confidence(full_description, details)
        
        return {
            "full": full_description,
            "summary": summary,
            "details": details,
            "confidence": confidence
        }
    
    def _create_summary(self, text: str, max_words: int = 15) -> str:
        """
        Create a short summary of the description
        
        Args:
            text: Full description
            max_words: Maximum words in summary
            
        Returns:
            Shortened summary
        """
        if not text:
            return ""
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', text)
        first_sentence = sentences[0].strip() if sentences else text
        
        # If first sentence is short enough, use it
        words = first_sentence.split()
        if len(words) <= max_words:
            return first_sentence
        
        # Otherwise, truncate to max_words
        summary = ' '.join(words[:max_words])
        
        # Try to end at a natural break
        if ',' in summary:
            parts = summary.split(',')
            if len(parts[0].split()) >= 5:  # First part has enough words
                return parts[0].strip()
        
        return summary
    
    def _extract_details(self, text: str) -> Dict:
        """
        Extract specific details like size, duration, impact
        
        Args:
            text: Original transcript
            
        Returns:
            Dictionary of extracted details
        """
        details = {}
        
        # Size/measurements
        size_pattern = r'(\d+\s*(feet|foot|ft|inches|inch|in|meters|meter|m|wide|long|deep))'
        size_match = re.search(size_pattern, text.lower())
        if size_match:
            details["size"] = size_match.group(0)
        
        # Duration/time
        duration_patterns = [
            r'for (\d+\s*(days?|weeks?|months?|years?))',
            r'(\d+\s*(days?|weeks?|months?|years?)) ago',
            r'been there (for )?\d+\s*(days?|weeks?|months?)'
        ]
        for pattern in duration_patterns:
            duration_match = re.search(pattern, text.lower())
            if duration_match:
                details["duration"] = duration_match.group(0)
                break
        
        # Impact/consequences
        impact_keywords = [
            'dangerous', 'damaging', 'damaged', 'hurt', 'injured',
            'can\'t use', 'blocking', 'unsafe', 'hazardous'
        ]
        for keyword in impact_keywords:
            if keyword in text.lower():
                details["impact"] = keyword
                break
        
        # Quantity/count
        count_pattern = r'(multiple|several|\d+) (potholes?|needles?|signs?|tags?|items?)'
        count_match = re.search(count_pattern, text.lower())
        if count_match:
            details["quantity"] = count_match.group(0)
        
        return details
    
    def _calculate_confidence(self, description: str, details: Dict) -> float:
        """
        Calculate confidence score based on description quality
        
        Args:
            description: Cleaned description text
            details: Extracted details dictionary
            
        Returns:
            Confidence score (0.0 to 1.0)
        """
        if not description:
            return 0.0
        
        confidence = 0.7  # Base confidence
        
        # Longer, more detailed descriptions get higher confidence
        word_count = len(description.split())
        if word_count >= 10:
            confidence += 0.1
        if word_count >= 20:
            confidence += 0.1
        
        # Specific details increase confidence
        if details:
            confidence += len(details) * 0.05
        
        # Cap at 0.99 (never 1.0, always some uncertainty)
        return min(confidence, 0.99)