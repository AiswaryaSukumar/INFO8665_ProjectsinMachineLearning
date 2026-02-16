"""
Configuration settings for Speech-to-Text System
Aligned with INFO8665_ProjectsinMachineLearning structure
"""
import os
from pathlib import Path

# Base paths - Root directory is config's parent
BASE_DIR = Path(__file__).resolve().parent.parent
TEMP_STORAGE_DIR = BASE_DIR / "data" / "temp" / "sessions"
LOG_DIR = BASE_DIR / "logs"
PROCESSED_DATA_DIR = BASE_DIR / "data" / "processed" / "audio"
AUDIO_SAMPLES_DIR = BASE_DIR / "data" / "audio-samples"

# Create directories if they don't exist
TEMP_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Whisper Model Configuration
WHISPER_MODEL_SIZE = "small.en"  # Options: tiny, base, small, medium, large
WHISPER_TASK = "transcribe"  # Options: transcribe, translate

# Audio Configuration
SAMPLE_RATE = 16000
AUDIO_FORMAT = "wav"
SEGMENT_MAX_DURATION = 15  # Maximum duration for a single segment (seconds)
PAUSE_THRESHOLD = 3  # Silence duration before considering speech ended (seconds)
ENERGY_THRESHOLD = 100  # Microphone sensitivity (lower = more sensitive)

# Session Configuration
SESSION_TIMEOUT = 3600  # Auto-cleanup abandoned sessions after 1 hour (seconds)

# Storage Configuration (AWS S3 / Azure Blob / GCS)
STORAGE_TYPE = "local"  # Options: s3, azure, gcs, local
STORAGE_BUCKET = "insight311-audio-storage"
STORAGE_REGION = "us-east-1"

# AWS S3 Credentials (if using S3)
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")

# Database Configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "insight311")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")

# NLU Service Configuration
NLU_SERVICE_URL = os.getenv("NLU_SERVICE_URL", "http://localhost:8001/api/nlu/analyze")
NLU_ENABLED = False  # Set to True when NLU service is ready

# Logging Configuration
LOG_LEVEL = "INFO"  # Options: DEBUG, INFO, WARNING, ERROR
LOG_FORMAT = "[%(asctime)s] [%(levelname)s] %(name)s: %(message)s"
