"""
Sentiment Analysis & Urgency Detection Module
Primary: cardiffnlp/twitter-roberta-base-sentiment-latest (ML)
Fallback: VADER (rule-based, used when ML model is unavailable)
"""

from typing import Dict, Tuple
from .utils import get_urgency_keywords
from .models.ml_sentiment_model import MLSentimentModel, negative_score_to_urgency

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer as _VADER
    _vader_available = True
except ImportError:
    _vader_available = False


class SentimentAnalyzer:
    """
    Analyzes sentiment and urgency from complaint transcripts.
    Uses RoBERTa ML model as primary; falls back to VADER if unavailable.
    """

    def __init__(self):
        self.ml_model = MLSentimentModel()
        self.urgency_keywords = get_urgency_keywords()
        if _vader_available:
            self.vader_analyzer = _VADER()
        else:
            self.vader_analyzer = None
    
    def analyze_sentiment(self, text: str) -> Dict[str, float]:
        """
        Analyze sentiment using ML (RoBERTa) with VADER fallback.

        Returns:
            Dictionary with sentiment scores:
            - compound: Overall sentiment (-1 to +1)  [VADER compat]
            - pos: Positive sentiment (0 to 1)
            - neu: Neutral sentiment (0 to 1)
            - neg: Negative sentiment (0 to 1)
            - ml_negative: Raw ML negative probability (0 to 1)
            - sentiment_label: "NEGATIVE" | "NEUTRAL" | "POSITIVE"
        """
        if not text:
            return {
                "compound": 0.0, "pos": 0.0, "neu": 1.0, "neg": 0.0,
                "ml_negative": 0.0, "sentiment_label": "NEUTRAL",
            }

        # --- Primary: ML model ---
        ml_result = self.ml_model.analyze_ml(text)
        if ml_result is not None:
            neg = ml_result["negative"]
            neu = ml_result["neutral"]
            pos = ml_result["positive"]
            # Map to VADER-compatible compound: positive = +1, negative = -1
            compound = round(pos - neg, 3)
            return {
                "compound":       compound,
                "pos":            round(pos, 3),
                "neu":            round(neu, 3),
                "neg":            round(neg, 3),
                "ml_negative":    round(neg, 4),
                "sentiment_label": ml_result["label"],
            }

        # --- Fallback: VADER ---
        if self.vader_analyzer:
            scores = self.vader_analyzer.polarity_scores(text)
            return {
                "compound":       round(scores["compound"], 3),
                "pos":            round(scores["pos"], 3),
                "neu":            round(scores["neu"], 3),
                "neg":            round(scores["neg"], 3),
                "ml_negative":    round(scores["neg"], 4),
                "sentiment_label": "NEGATIVE" if scores["compound"] < -0.05
                                   else ("POSITIVE" if scores["compound"] > 0.05 else "NEUTRAL"),
            }

        return {
            "compound": 0.0, "pos": 0.0, "neu": 1.0, "neg": 0.0,
            "ml_negative": 0.0, "sentiment_label": "NEUTRAL",
        }
    
    def detect_urgency(self, text: str, category: str = None) -> Tuple[str, float]:
        """
        Detect urgency level. Uses ML negative probability when available;
        falls back to keyword-based scoring.

        Returns:
            Tuple of (urgency_level, urgency_score)
            urgency_level: "critical", "high", "medium", or "low"
            urgency_score: 0.0 to 1.0
        """
        if not text:
            return "medium", 0.5

        # --- Primary: derive from ML negative probability ---
        ml_result = self.ml_model.analyze_ml(text)
        if ml_result is not None:
            return negative_score_to_urgency(ml_result["negative"])

        # --- Fallback: keyword-based ---
        text_lower = text.lower()
        urgency_scores = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for level, keywords in self.urgency_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    urgency_scores[level] += 1

        time_indicators = {"for weeks": 2, "for days": 1.5, "since yesterday": 1, "this morning": 0.5}
        for indicator, weight in time_indicators.items():
            if indicator in text_lower:
                urgency_scores["high"] += weight

        exclamation_count = text.count("!")
        if exclamation_count > 0:
            urgency_scores["high"] += exclamation_count * 0.5

        caps_words = sum(1 for word in text.split() if word.isupper() and len(word) > 2)
        if caps_words > 0:
            urgency_scores["critical"] += caps_words * 0.3

        if urgency_scores["critical"] > 0:
            return "critical", round(min(1.0, 0.9 + urgency_scores["critical"] * 0.05), 2)
        if urgency_scores["high"] > 0:
            return "high",     round(min(0.89, 0.7 + urgency_scores["high"] * 0.05), 2)
        if urgency_scores["medium"] > 0:
            return "medium",   0.50
        return "low", 0.30
    
    def analyze(self, text: str, category: str = None) -> Dict:
        """
        Complete sentiment and urgency analysis.

        Returns:
            {
              "overall_score":   float,   # compound (-1 to +1)
              "positive":        float,
              "neutral":         float,
              "negative":        float,
              "ml_negative":     float,   # raw ML negative probability (0–1)
              "sentiment_label": str,     # "NEGATIVE" | "NEUTRAL" | "POSITIVE"
              "urgency_level":   str,
              "urgency_score":   float,   # maps to severity_score in nlu_processor
            }
        """
        sentiment_scores = self.analyze_sentiment(text)
        urgency_level, urgency_score = self.detect_urgency(text, category)

        return {
            "overall_score":   sentiment_scores["compound"],
            "positive":        sentiment_scores["pos"],
            "neutral":         sentiment_scores["neu"],
            "negative":        sentiment_scores["neg"],
            "ml_negative":     sentiment_scores.get("ml_negative", sentiment_scores["neg"]),
            "sentiment_label": sentiment_scores.get("sentiment_label", "NEUTRAL"),
            "urgency_level":   urgency_level,
            "urgency_score":   urgency_score,
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