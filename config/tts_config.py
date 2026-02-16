"""
Configuration settings for Text-to-Speech System (pyttsx3)
Location: config/tts_config.py
"""
import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
TTS_OUTPUT_DIR = BASE_DIR / "data" / "audio-samples"

# Create directories
TTS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# pyttsx3 TTS Configuration
# ============================================================================

# Voice Settings
TTS_ENGINE = "pyttsx3"  # Options: pyttsx3, gtts, azure, elevenlabs
TTS_VOICE_ID = 1  # None = system default, 0 = male, 1 = female (system dependent)
TTS_RATE = 150  # Speaking speed (words per minute, default: 200)
TTS_VOLUME = 0.9  # Volume level (0.0 to 1.0)
TTS_PITCH = 1.0  # Pitch multiplier (not all engines support this)

# Audio Output Settings
TTS_AUDIO_FORMAT = "wav"  # Output format: wav, mp3
TTS_SAVE_TO_FILE = False  # Save generated audio to file
TTS_AUTO_PLAY = True  # Automatically play audio after generation

# Language Settings
TTS_LANGUAGE = "en"  # Language code (en, es, fr, etc.)

# Pre-defined System Messages (INSIGHT-311 use case)
SYSTEM_MESSAGES = {
    "greeting": "Welcome to INSIGHT-311. How can I help you today?",
    "listening": "I'm listening. Please describe your issue.",
    "processing": "Thank you. I'm processing your request.",
    "confirmation": "Your report has been received. A ticket number will be provided shortly.",
    "goodbye": "Thank you for using INSIGHT-311. Have a great day!",
    "error": "I'm sorry, I didn't understand that. Could you please repeat?",
    "ticket_created": "Your ticket has been created with ID {ticket_id}. We will contact you soon.",
}

# Advanced Settings
TTS_CACHE_ENABLED = True  # Cache frequently used phrases
TTS_CACHE_DIR = BASE_DIR / "data" / "tts-cache"
TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
