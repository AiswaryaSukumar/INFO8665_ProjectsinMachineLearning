"""
Unit tests for NLP service components:
- EntityExtractor
- SentimentAnalyzer
- ConfidenceCalculator
- NLUProcessor (with mocked classifier)
"""

import pytest
from unittest.mock import MagicMock, patch

# spaCy may not work on Python 3.14+ (pydantic v1 incompatibility).
# Guard the import so other tests still run; skip spaCy-dependent tests.
try:
    from nlp_service.model.entity_extractor import EntityExtractor
    _spacy_available = True
except Exception:
    _spacy_available = False

from nlp_service.model.sentiment_analyzer import SentimentAnalyzer
from nlp_service.model.confidence_calculator import ConfidenceCalculator

_skip_spacy = pytest.mark.skipif(not _spacy_available, reason="spaCy unavailable on this Python version")


# ── EntityExtractor ──────────────────────────────────────

@_skip_spacy
class TestEntityExtractor:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.extractor = EntityExtractor()

    def test_extract_caller_name(self):
        name, confidence = self.extractor.extract_caller_name("My name is John Smith")
        assert name is not None
        assert "john" in name.lower() or "smith" in name.lower()
        assert confidence > 0.0

    def test_extract_phone_number(self):
        phone, confidence = self.extractor.extract_phone_number("Call me at 555-123-4567")
        assert phone is not None
        # Should contain the digits
        digits = "".join(c for c in phone if c.isdigit())
        assert len(digits) >= 10
        assert confidence > 0.0

    def test_extract_location(self):
        location, confidence = self.extractor.extract_location(
            "There is a big pothole at 123 Main Street"
        )
        assert location is not None
        assert "main" in location.lower() or "123" in location
        assert confidence > 0.0

    def test_extract_all_returns_expected_keys(self):
        result = self.extractor.extract_all("My name is Jane at 456 Oak Avenue, call 555-987-6543")
        assert "caller_name" in result
        assert "caller_phone" in result
        assert "location" in result
        # Each should be a dict with value and confidence
        for key in ("caller_name", "caller_phone", "location"):
            assert "value" in result[key]
            assert "confidence" in result[key]

    def test_extract_no_entities(self):
        result = self.extractor.extract_all("hello there")
        # Should return dicts with None or empty values, not crash
        assert isinstance(result, dict)


# ── SentimentAnalyzer ────────────────────────────────────

class TestSentimentAnalyzer:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.analyzer = SentimentAnalyzer()

    def test_positive_sentiment(self):
        result = self.analyzer.analyze("Everything is wonderful and great, thank you so much!")
        assert result["overall_score"] > 0.0

    def test_negative_sentiment(self):
        result = self.analyzer.analyze("This is terrible and disgusting, I am furious!")
        assert result["overall_score"] < 0.0

    def test_urgency_critical(self):
        level, score = self.analyzer.detect_urgency(
            "This is an emergency, there is a gas leak and people are in danger!"
        )
        assert level in ("critical", "high")
        assert score > 0.5

    def test_urgency_low(self):
        level, score = self.analyzer.detect_urgency("I noticed some litter in the park")
        assert level in ("low", "medium")

    def test_analyze_returns_all_keys(self):
        result = self.analyzer.analyze("Some neutral text about a topic")
        for key in ("overall_score", "positive", "neutral", "negative", "urgency_level", "urgency_score"):
            assert key in result


# ── ConfidenceCalculator ─────────────────────────────────

class TestConfidenceCalculator:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.calc = ConfidenceCalculator()

    def test_thresholds_are_set(self):
        assert 0 < self.calc.high_threshold <= 1.0
        assert 0 < self.calc.medium_threshold <= 1.0
        assert self.calc.category_high_threshold < self.calc.high_threshold

    def test_category_thresholds_lower_than_general(self):
        assert self.calc.category_medium_threshold < self.calc.medium_threshold


# ── NLUProcessor (mocked classifier) ─────────────────────

@_skip_spacy
class TestNLUProcessor:
    @pytest.fixture()
    def processor(self):
        """Create NLU processor with mocked ML classifier."""
        with patch(
            "nlp_service.model.nlu_processor.CategoryClassifierML"
        ) as MockClassifier:
            mock_instance = MagicMock()
            mock_instance.predict.return_value = {
                "category": "pothole",
                "confidence": 0.92,
            }
            MockClassifier.return_value = mock_instance

            from nlp_service.model.nlu_processor import NLUProcessor
            proc = NLUProcessor(use_ml_classifier=True)
            return proc

    def test_process_returns_expected_keys(self, processor):
        result = processor.process(
            "There is a huge pothole at 123 Main Street, my name is John Smith, call me at 555-123-4567"
        )
        expected_keys = {
            "session_id", "category", "location", "description",
            "severity_score", "caller_name", "phone_number",
            "confidence_scores", "confirm_result", "missing_fields",
        }
        assert expected_keys.issubset(result.keys())

    def test_process_detects_category(self, processor):
        result = processor.process("I want to report a pothole on my street")
        assert result["category"] == "pothole"

    def test_process_missing_fields(self, processor):
        result = processor.process("hello there")
        # With just "hello there", most fields should be missing
        assert isinstance(result["missing_fields"], list)

    def test_process_confidence_scores_range(self, processor):
        result = processor.process("There is graffiti at 100 King Street")
        scores = result["confidence_scores"]
        for key, val in scores.items():
            assert 0.0 <= val <= 1.0, f"Confidence for {key} out of range: {val}"
