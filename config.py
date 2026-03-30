"""
Centralized Configuration & Secrets Management for INSIGHT-311
All configurable values are loaded from environment variables or Docker secrets,
with sensible defaults for local development.

Usage:
    from config import DB_USERNAME, DB_PASSWORD, NUM_EPOCHS, FEATURE_NAMES, ...
"""

import os
from dotenv import load_dotenv
from logging_config import get_logger

# Load .env from the project root
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logger = get_logger("insight311.config")


# ---------------------------------------------------------------------------
# Helper: read a Docker secret file, falling back to a plain env var
# ---------------------------------------------------------------------------
def _read_secret(file_env: str, fallback_env: str, default: str = "") -> str:
    """Read a Docker secret from file, falling back to an env var."""
    secret_path = os.getenv(file_env, "")
    if secret_path and os.path.isfile(secret_path):
        with open(secret_path, "r") as f:
            value = f.read().strip()
        logger.info("config_loaded var=%s source=docker_secret", fallback_env)
        return value
    env_value = os.getenv(fallback_env, default)
    source = "env_var" if os.getenv(fallback_env) else "default"
    logger.info("config_loaded var=%s source=%s", fallback_env, source)
    return env_value


# ===========================================================================
# DATABASE CONFIGURATION
# ===========================================================================
DB_USERNAME = _read_secret("DB_USERNAME_FILE", "DB_USERNAME", "user")
DB_PASSWORD = _read_secret("DB_PASSWORD_FILE", "DB_PASSWORD", "password")
DB_HOSTNAME = _read_secret("DB_HOSTNAME_FILE", "DB_HOSTNAME", "localhost")
DB_PORT     = _read_secret("DB_PORT_FILE", "DB_PORT", "5432")
DB_NAME     = os.getenv("DB_NAME", "neondb")
DB_SSLMODE  = os.getenv("DB_SSLMODE", "require")

# Compose the full URL from individual parts, OR fall back to a monolithic
# DATABASE_URL secret/env-var for backward compatibility.
_COMPOSED_URL = (
    f"postgresql+psycopg2://{DB_USERNAME}:{DB_PASSWORD}"
    f"@{DB_HOSTNAME}:{DB_PORT}/{DB_NAME}?sslmode={DB_SSLMODE}"
)
DATABASE_URL = _read_secret("DATABASE_URL_FILE", "DATABASE_URL", _COMPOSED_URL)

logger.info(
    "database_config host=%s port=%s db=%s sslmode=%s",
    DB_HOSTNAME, DB_PORT, DB_NAME, DB_SSLMODE,
)


# ===========================================================================
# ML EXPERIMENT METADATA
# ===========================================================================
EXPERIMENT_NAME    = os.getenv("EXPERIMENT_NAME", "insight311_category_classifier")
EXPERIMENT_VERSION = os.getenv("EXPERIMENT_VERSION", "1.0.0")

logger.info(
    "experiment_config name=%s version=%s",
    EXPERIMENT_NAME, EXPERIMENT_VERSION,
)


# ===========================================================================
# ML HYPERPARAMETERS
# ===========================================================================
MODEL_NAME     = os.getenv("MODEL_NAME", "distilbert-base-uncased")
NUM_LABELS     = int(os.getenv("NUM_LABELS", "11"))
MAX_SEQ_LENGTH = int(os.getenv("MAX_SEQ_LENGTH", "128"))
NUM_EPOCHS     = int(os.getenv("NUM_EPOCHS", "15"))
BATCH_SIZE     = int(os.getenv("BATCH_SIZE", "8"))
LEARNING_RATE  = float(os.getenv("LEARNING_RATE", "2e-5"))
WEIGHT_DECAY   = float(os.getenv("WEIGHT_DECAY", "0.01"))

# Expected accuracy threshold — training logs a warning if final accuracy < this
EXPECTED_ACCURACY = float(os.getenv("EXPECTED_ACCURACY", "0.95"))

logger.info(
    "hyperparameters model=%s num_labels=%d max_seq_length=%d epochs=%d "
    "batch_size=%d lr=%s weight_decay=%s expected_accuracy=%s",
    MODEL_NAME, NUM_LABELS, MAX_SEQ_LENGTH, NUM_EPOCHS,
    BATCH_SIZE, LEARNING_RATE, WEIGHT_DECAY, EXPECTED_ACCURACY,
)


# ===========================================================================
# EDA / NLU FEATURE NAMES
# ===========================================================================
FEATURE_NAMES = [
    "category",
    "location",
    "description",
    "caller_name",
    "phone_number",
    "severity",
    "sentiment_compound",
    "sentiment_neg",
    "urgency_level",
]

logger.info("feature_names count=%d features=%s", len(FEATURE_NAMES), FEATURE_NAMES)


# ===========================================================================
# CONFIDENCE THRESHOLDS
# ===========================================================================
CONFIDENCE_HIGH_THRESHOLD      = float(os.getenv("CONFIDENCE_HIGH_THRESHOLD", "0.80"))
CONFIDENCE_MEDIUM_THRESHOLD    = float(os.getenv("CONFIDENCE_MEDIUM_THRESHOLD", "0.50"))
CATEGORY_HIGH_THRESHOLD        = float(os.getenv("CATEGORY_HIGH_THRESHOLD", "0.60"))
CATEGORY_MEDIUM_THRESHOLD      = float(os.getenv("CATEGORY_MEDIUM_THRESHOLD", "0.35"))
REVIEW_THRESHOLD               = float(os.getenv("REVIEW_THRESHOLD", "0.60"))
CLARIFICATION_THRESHOLD        = float(os.getenv("CLARIFICATION_THRESHOLD", "0.3"))
UI_LOW_CONFIDENCE_THRESHOLD    = float(os.getenv("UI_LOW_CONFIDENCE_THRESHOLD", "0.5"))

logger.info(
    "confidence_thresholds high=%s medium=%s cat_high=%s cat_medium=%s "
    "review=%s clarification=%s ui_low=%s",
    CONFIDENCE_HIGH_THRESHOLD, CONFIDENCE_MEDIUM_THRESHOLD,
    CATEGORY_HIGH_THRESHOLD, CATEGORY_MEDIUM_THRESHOLD,
    REVIEW_THRESHOLD, CLARIFICATION_THRESHOLD, UI_LOW_CONFIDENCE_THRESHOLD,
)


# ===========================================================================
# STT / WHISPER CONFIGURATION
# ===========================================================================
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "small")

logger.info("whisper_config model_size=%s", WHISPER_MODEL_SIZE)


# ===========================================================================
# APPLICATION
# ===========================================================================
APP_PORT  = int(os.getenv("APP_PORT", "8311"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

logger.info("app_config port=%d log_level=%s", APP_PORT, LOG_LEVEL)
