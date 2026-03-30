"""
Custom Prometheus metrics for INSIGHT-311.

Counters, histograms, and gauges exposed at /metrics alongside
the default FastAPI instrumentation.
"""

from prometheus_client import Counter, Histogram, Gauge

# ── Counters ──────────────────────────────────────────────
sessions_created_total = Counter(
    "insight311_sessions_created_total",
    "Total conversation sessions created",
    ["channel"],
)

tickets_created_total = Counter(
    "insight311_tickets_created_total",
    "Total tickets created",
    ["category", "severity", "channel"],
)

nlu_classifications_total = Counter(
    "insight311_nlu_classifications_total",
    "Total NLU category classifications",
    ["predicted_category"],
)

escalations_total = Counter(
    "insight311_escalations_total",
    "Total session escalations",
    ["reason"],
)

stt_transcriptions_total = Counter(
    "insight311_stt_transcriptions_total",
    "Total STT transcription attempts",
    ["status"],
)

# ── Histograms ────────────────────────────────────────────
nlu_processing_seconds = Histogram(
    "insight311_nlu_processing_seconds",
    "NLU pipeline processing duration in seconds",
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

stt_transcription_seconds = Histogram(
    "insight311_stt_transcription_seconds",
    "Whisper STT transcription duration in seconds",
    buckets=(0.5, 1.0, 2.0, 5.0, 10.0, 30.0),
)

turn_processing_seconds = Histogram(
    "insight311_turn_processing_seconds",
    "Full turn processing duration (STT + NLU + orchestrator + TTS)",
    buckets=(0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0),
)

nlu_confidence_score = Histogram(
    "insight311_nlu_confidence_score",
    "Distribution of NLU overall confidence scores",
    buckets=(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0),
)

# ── Gauges ────────────────────────────────────────────────
active_sessions = Gauge(
    "insight311_active_sessions",
    "Number of currently active conversation sessions",
)
