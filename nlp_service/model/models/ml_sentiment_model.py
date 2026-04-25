"""
ML-based Sentiment Analysis using j-hartmann/emotion-english-distilroberta-base.

Outputs 7 emotion labels:
  anger, disgust, fear, joy, neutral, sadness, surprise

Mapping to negative probability (0.0–1.0):
  negative = anger * 1.0 + disgust * 0.6 + fear * 0.4 + sadness * 0.3
  (capped at 1.0)

After computing the ML composite score, a civic-frustration boost is applied
to catch patterns that the emotion model under-scores (e.g. "I've called three
times and nobody is fixing it!" — polite but clearly frustrated).
"""

import re
from typing import Dict, Optional


# Urgency thresholds derived from negative probability
_URGENCY_THRESHOLDS = {
    "critical": 0.85,
    "high":     0.55,  # lowered from 0.65 — civic complaints rarely hit Twitter-level negativity
    "medium":   0.30,
}

_MODEL_ID = "j-hartmann/emotion-english-distilroberta-base"


class MLSentimentModel:
    """
    Lazy-loads the emotion classification pipeline on first call.
    Exposes analyze_ml() returning negative/neutral/positive probabilities
    compatible with the existing sentiment pipeline interface.
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
                "text-classification",
                model=_MODEL_ID,
                top_k=None,        # replaces deprecated return_all_scores=True
                truncation=True,
                max_length=512,
            )
            print(f"✓ ML sentiment model loaded: {_MODEL_ID}")
        except Exception as e:
            print(f"⚠️  ML sentiment model failed to load ({e}). VADER fallback will be used.")
            self._load_failed = True

    def analyze_ml(self, text: str) -> Optional[Dict[str, float]]:
        """
        Run emotion classification on text.

        Returns compatible dict:
            {
              "negative": float,   # 0.0–1.0  (derived from anger/disgust/fear/sadness)
              "neutral":  float,   # joy + neutral
              "positive": float,   # joy
              "label":    str,     # dominant upstream label
              "emotions": dict,    # raw 7-label scores for debugging
            }
        Returns None if model unavailable (caller falls back to VADER).
        """
        self._load()
        if self._load_failed or self._pipeline is None:
            return None

        try:
            raw = self._pipeline(text[:512])
            # top_k=None returns [[{...}, ...]] — flatten if nested
            items = raw[0] if isinstance(raw[0], list) else raw
            scores = {item["label"].lower(): item["score"] for item in items}

            anger   = scores.get("anger",   0.0)
            disgust = scores.get("disgust", 0.0)
            fear    = scores.get("fear",    0.0)
            sadness = scores.get("sadness", 0.0)
            joy     = scores.get("joy",     0.0)
            neutral = scores.get("neutral", 0.0)
            # surprise is ignored — not meaningful for civic complaints

            # Composite negative probability
            # anger weighted most heavily; disgust/fear/sadness contribute less
            ml_neg = min(1.0, anger * 1.0 + disgust * 0.6 + fear * 0.4 + sadness * 0.3)

            # Apply civic-frustration boost for patterns the emotion model under-scores
            boost = civic_frustration_boost(text)
            neg = min(1.0, ml_neg + boost)

            pos = joy
            neu = max(0.0, 1.0 - neg - pos)

            # Dominant raw label (for debugging)
            dominant = max(scores, key=scores.get)

            # Map to sentiment label — re-evaluate after boost so "called 3 times"
            # sentences are no longer labelled NEUTRAL
            if neg >= 0.35:
                label = "NEGATIVE"
            elif dominant == "joy":
                label = "POSITIVE"
            else:
                label = "NEUTRAL"

            return {
                "negative": round(neg, 4),
                "neutral":  round(neu, 4),
                "positive": round(pos, 4),
                "label":    label,
                "emotions": {k: round(v, 4) for k, v in scores.items()},
            }
        except Exception as e:
            print(f"⚠️  ML sentiment inference error: {e}")
            return None

    def is_available(self) -> bool:
        self._load()
        return not self._load_failed and self._pipeline is not None


def civic_frustration_boost(text: str) -> float:
    """
    Return an additive boost (0.0–0.45) for civic-complaint frustration patterns
    that the emotion model under-scores because the language is polite but persistent.

    NOTE: STT (speech-to-text) does not output punctuation such as '!' or '?',
    so all detection is word-based only.

    Examples that get a boost:
      - "I've called three times"         → repeated attempts
      - "nobody is fixing it"             → unresponsiveness
      - "massive / dangerous / hazardous" → severity descriptors
      - "for weeks / for months"          → chronic duration
      - "already / still / again"         → frustration intensifiers (STT-safe)
    """
    boost = 0.0
    t = text.lower()

    # Repeated contact / no response (strong frustration signal)
    if re.search(r"called\s+(two|three|four|five|multiple|\d+)\s+times?", t):
        boost += 0.22
    if re.search(r"report(ed)?\s+(this|it)\s+(multiple|several|\d+)\s+times?", t):
        boost += 0.22
    if any(p in t for p in [
        "nobody is fixing", "no one is fixing", "still not fixed",
        "nothing has been done", "no one has", "hasn't been fixed",
        "keep calling", "keeps happening",
    ]):
        boost += 0.18

    # Chronic duration
    if re.search(r"for\s+(several\s+)?(weeks?|months?)", t):
        boost += 0.15
    if re.search(r"for\s+(many\s+)?(days?)", t):
        boost += 0.08

    # Severity / danger descriptors
    if any(w in t for w in ["massive", "dangerous", "hazardous", "unsafe", "severe", "terrible"]):
        boost += 0.10

    # Frustration intensifiers — words STT reliably captures
    # e.g. "I've called three times already", "it's still not fixed", "calling again"
    if any(w in t for w in ["already", "still", "again", "yet", "keeps"]):
        boost += 0.08

    return min(0.45, boost)  # cap total boost to avoid over-inflation


def negative_score_to_urgency(negative: float) -> tuple:
    """Map emotion-derived negative probability → (urgency_level, urgency_score)."""
    if negative >= _URGENCY_THRESHOLDS["critical"]:
        return "critical", round(min(1.0, 0.90 + (negative - 0.85) * 0.67), 2)
    if negative >= _URGENCY_THRESHOLDS["high"]:
        return "high",     round(0.65 + (negative - 0.55) * 0.83, 2)
    if negative >= _URGENCY_THRESHOLDS["medium"]:
        return "medium",   0.50
    return "low", 0.30
