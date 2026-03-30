"""
Centralized logging configuration for INSIG
Uses the standard Python logging library with a consistent formatter.
All services import `get_logger` from here to get a configured logger.
"""


import logging
import os
import sys


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


def setup_logging():
    """Configure stdlib logging for the entire application."""

    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

    # Quiet noisy third-party loggers
    for name in ("uvicorn.access", "sqlalchemy.engine", "httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)


def get_logger(name: str = __name__) -> logging.Logger:
    """Return a stdlib logger with the given name."""
    return logging.getLogger(name)