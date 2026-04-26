"""
Audio-based arousal analysis using librosa.

Extracts three acoustic features from a caller WAV file:
  1. RMS energy mean  — overall loudness/volume
  2. F0 std deviation — pitch variation (emotional speech is more varied)
  3. ZCR mean         — zero-crossing rate (speech energy/tension)

These are combined into a single "arousal" score (0.0–1.0) that represents
the *acoustic* intensity of the speaker, independent of word content.

The arousal score is blended with the text-based NLP sentiment score in the
/test/chat endpoint to produce a more accurate final severity measurement.

NOTE: STT does not output punctuation (no '!' etc.), so acoustic signals are
the only way to capture volume, pitch, and speaking energy from voice input.
"""

from typing import Optional, Dict
import numpy as np

# Normalization references (calibrated for 16 kHz mono speech)
# Values above these are considered "high" for each feature.
_RMS_REF   = 0.08   # loud speech threshold  (~0.04 = calm, ~0.10 = raised voice)
_F0_STD_REF = 50.0  # Hz — emotional speech typically 50–80 Hz variation
_ZCR_REF   = 0.15   # zero-crossing rate upper reference


def analyze_audio(wav_path: str) -> Optional[Dict[str, float]]:
    """
    Compute acoustic arousal features from a WAV file.

    Args:
        wav_path: Path to a mono/stereo WAV file (16 kHz preferred).

    Returns:
        dict with keys:
            arousal   — composite score 0.0–1.0 (higher = more energetic/intense)
            rms_mean  — mean RMS energy
            f0_std    — std dev of voiced fundamental frequency (Hz)
            zcr_mean  — mean zero-crossing rate
        or None if librosa is unavailable or the file is too short / unreadable.
    """
    try:
        import librosa
    except ImportError:
        print("⚠️  librosa not installed — audio sentiment skipped. Run: pip install librosa")
        return None

    try:
        # Load at 16 kHz, flatten to mono
        y, sr = librosa.load(wav_path, sr=16000, mono=True)
    except Exception as e:
        print(f"⚠️  audio_sentiment: could not load {wav_path}: {e}")
        return None

    # Need at least 0.5 s of audio to be meaningful
    if len(y) < sr * 0.5:
        return None

    # ── Feature 1: RMS energy (loudness) ────────────────────────────────────
    rms_frames = librosa.feature.rms(y=y, frame_length=512, hop_length=256)[0]
    rms_mean = float(np.mean(rms_frames))

    # ── Feature 2: Fundamental frequency std (pitch variation) ──────────────
    try:
        # yin is faster than pyin; fmin/fmax cover typical adult speech range
        f0 = librosa.yin(y, fmin=75, fmax=400, sr=sr,
                         frame_length=1024, hop_length=256)
        voiced = f0[(f0 > 75) & (f0 < 400)]   # keep only voiced frames
        f0_std = float(np.std(voiced)) if len(voiced) > 5 else 0.0
    except Exception:
        f0_std = 0.0

    # ── Feature 3: Zero-crossing rate (speech tension / energy) ─────────────
    zcr_frames = librosa.feature.zero_crossing_rate(y, frame_length=512, hop_length=256)[0]
    zcr_mean = float(np.mean(zcr_frames))

    # ── Composite arousal score ──────────────────────────────────────────────
    # Weights: RMS is the most direct signal; F0 std adds emotional variation;
    # ZCR is a lightweight energy proxy.
    rms_norm   = min(1.0, rms_mean / _RMS_REF)
    f0_std_norm = min(1.0, f0_std  / _F0_STD_REF)
    zcr_norm   = min(1.0, zcr_mean / _ZCR_REF)

    arousal = (rms_norm * 0.50 + f0_std_norm * 0.30 + zcr_norm * 0.20)

    return {
        "arousal":  round(arousal,  4),
        "rms_mean": round(rms_mean, 6),
        "f0_std":   round(f0_std,   2),
        "zcr_mean": round(zcr_mean, 6),
    }
