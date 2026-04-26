"""
ML-based confidence scoring for caller name extraction.

Uses dslim/bert-base-NER to derive per-token softmax probabilities for the
B-PER / I-PER tags. The mean probability of PERSON tokens that align with the
extracted name span is returned as the confidence score.

Falls back to the rule-based value supplied by the caller if the model is
unavailable (no internet, unit tests, etc.).
"""

from typing import Optional

_MODEL_ID = "dslim/bert-base-NER"


class NERConfidenceModel:
    """
    Lazy-loads dslim/bert-base-NER on first call.
    Exposes get_name_confidence() for ML-derived name extraction confidence.
    """

    def __init__(self):
        self._pipeline = None
        self._load_failed = False

    def _load(self):
        if self._pipeline is not None or self._load_failed:
            return
        try:
            from transformers import pipeline as hf_pipeline
            self._pipeline = hf_pipeline(
                "token-classification",
                model=_MODEL_ID,
                aggregation_strategy="simple",
            )
            print(f"✓ NER confidence model loaded: {_MODEL_ID}")
        except Exception as e:
            print(f"⚠️  NER confidence model failed to load ({e}). Rule-based fallback active.")
            self._load_failed = True

    def get_name_confidence(
        self,
        transcript: str,
        extracted_name: str,
        fallback: float = 0.80,
    ) -> float:
        """
        Return ML-derived confidence for extracted_name appearing in transcript.

        Strategy:
          1. Run NER pipeline on transcript.
          2. Find PER entities whose text overlaps with extracted_name.
          3. Return the mean entity score of matching spans.
          4. If no matching span found, return slightly reduced fallback.

        Args:
            transcript:     Full turn transcript.
            extracted_name: Name string already extracted by EntityExtractor.
            fallback:       Rule-based confidence to use when model unavailable.

        Returns:
            float in [0.0, 1.0]
        """
        self._load()
        if self._load_failed or self._pipeline is None or not extracted_name:
            return fallback

        try:
            entities = self._pipeline(transcript[:512])
            name_lower = extracted_name.lower()

            # Collect scores of PER entities that overlap with extracted_name
            matching_scores = []
            for ent in entities:
                if ent.get("entity_group", "").upper() == "PER":
                    ent_text = ent.get("word", "").lower().strip()
                    if ent_text and (ent_text in name_lower or name_lower in ent_text):
                        matching_scores.append(ent["score"])

            if matching_scores:
                return round(float(sum(matching_scores) / len(matching_scores)), 4)

            # NER didn't find a matching PER span — trust the rule-based extraction as-is.
            # Do NOT reduce fallback here: patterns like "my name is X" are highly reliable,
            # and dslim/bert-base-NER sometimes misses names in civic complaint phrasing.
            return fallback

        except Exception as e:
            print(f"⚠️  NER confidence inference error: {e}")
            return fallback

    def is_available(self) -> bool:
        self._load()
        return not self._load_failed and self._pipeline is not None
