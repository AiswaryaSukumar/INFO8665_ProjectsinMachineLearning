"""
Sentiment Analysis & Urgency Detection Module
Uses VADER for sentiment analysis and keyword-based urgency detection
"""

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from typing import Dict, Tuple
from .utils import get_urgency_keywords


class SentimentAnalyzer:
    """
    Analyzes sentiment and urgency from complaint transcripts
    """
    
    def __init__(self):
        """Initialize VADER sentiment analyzer"""
        self.vader_analyzer = SentimentIntensityAnalyzer()
        self.urgency_keywords = get_urgency_keywords()
    
    def analyze_sentiment(self, text: str) -> Dict[str, float]:
        """
        Analyze sentiment of text using VADER
        
        Args:
            text: Input text to analyze
            
        Returns:
            Dictionary with sentiment scores:
            - compound: Overall sentiment (-1 to +1)
            - pos: Positive sentiment (0 to 1)
            - neu: Neutral sentiment (0 to 1)
            - neg: Negative sentiment (0 to 1)
        """
        if not text:
            return {
                "compound": 0.0,
                "pos": 0.0,
                "neu": 1.0,
                "neg": 0.0
            }
        
        # Get VADER scores
        scores = self.vader_analyzer.polarity_scores(text)
        
        return {
            "compound": round(scores['compound'], 3),
            "pos": round(scores['pos'], 3),
            "neu": round(scores['neu'], 3),
            "neg": round(scores['neg'], 3)
        }
    
    def detect_urgency(self, text: str, category: str = None) -> Tuple[str, float]:
        """
        Detect urgency level based on keywords and context
        
        Args:
            text: Input text
            category: Issue category (optional, can influence urgency)
            
        Returns:
            Tuple of (urgency_level, urgency_score)
            urgency_level: "critical", "high", "medium", or "low"
            urgency_score: 0.0 to 1.0
        """
        if not text:
            return "medium", 0.5
        
        text_lower = text.lower()
        
        # Count keywords for each urgency level
        urgency_scores = {
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0
        }
        
        for level, keywords in self.urgency_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    urgency_scores[level] += 1
        
        # Check for time-based urgency indicators
        time_indicators = {
            "for weeks": 2,
            "for days": 1.5,
            "since yesterday": 1,
            "this morning": 0.5
        }
        
        for indicator, weight in time_indicators.items():
            if indicator in text_lower:
                urgency_scores["high"] += weight
        
        # Check for exclamation marks (indicates emotion/urgency)
        exclamation_count = text.count('!')
        if exclamation_count > 0:
            urgency_scores["high"] += exclamation_count * 0.5
        
        # Check for ALL CAPS words (indicates shouting/urgency)
        caps_words = sum(1 for word in text.split() if word.isupper() and len(word) > 2)
        if caps_words > 0:
            urgency_scores["critical"] += caps_words * 0.3
        
        # Determine final urgency level
        if urgency_scores["critical"] > 0:
            urgency_level = "critical"
            urgency_score = min(1.0, 0.9 + urgency_scores["critical"] * 0.05)
        elif urgency_scores["high"] > 0:
            urgency_level = "high"
            urgency_score = min(0.89, 0.7 + urgency_scores["high"] * 0.05)
        elif urgency_scores["medium"] > 0:
            urgency_level = "medium"
            urgency_score = 0.5
        else:
            urgency_level = "low"
            urgency_score = 0.3
        
        return urgency_level, round(urgency_score, 2)
    
    def analyze(self, text: str, category: str = None) -> Dict:
        """
        Complete sentiment and urgency analysis
        
        Args:
            text: Input text
            category: Issue category (optional)
            
        Returns:
            Dictionary with sentiment and urgency information
        """
        sentiment_scores = self.analyze_sentiment(text)
        urgency_level, urgency_score = self.detect_urgency(text, category)
        
        return {
            "overall_score": sentiment_scores["compound"],
            "positive": sentiment_scores["pos"],
            "neutral": sentiment_scores["neu"],
            "negative": sentiment_scores["neg"],
            "urgency_level": urgency_level,
            "urgency_score": urgency_score
        }


# Example usage (for testing)
if __name__ == "__main__":
    analyzer = SentimentAnalyzer()
    
    # Test case 1: Critical urgency
    test1 = "This is an emergency! There's a huge pothole and someone got injured!"
    result1 = analyzer.analyze(test1)
    print("Test 1 (Critical):")
    print(f"  Sentiment: {result1['overall_score']}")
    print(f"  Urgency: {result1['urgency_level']} ({result1['urgency_score']})")
    
    # Test case 2: Medium urgency
    test2 = "There's a streetlight not working on Baker Street"
    result2 = analyzer.analyze(test2)
    print("\nTest 2 (Medium):")
    print(f"  Sentiment: {result2['overall_score']}")
    print(f"  Urgency: {result2['urgency_level']} ({result2['urgency_score']})")