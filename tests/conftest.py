"""
Shared fixtures for INSIGHT-311 tests.

Provides:
- SQLite in-memory database override for isolation
- FastAPI TestClient
- Mock ML models (Whisper, DistilBERT)
"""

import os
import sys
import pytest
from unittest.mock import MagicMock, patch

# Ensure project root is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Guard against spaCy failing on Python 3.14+ ─────────────
# spaCy uses pydantic v1 internals that break on 3.14.  Inject a
# lightweight mock so the import chain main → nlp_service → entity_extractor
# → spacy doesn't blow up during collection.
try:
    import spacy  # noqa: F401 — probe whether import succeeds
except Exception:
    _mock_spacy = MagicMock()
    # Make spacy.load() return a mock nlp object whose __call__ returns a mock doc
    _mock_doc = MagicMock()
    _mock_doc.ents = []
    _mock_nlp = MagicMock(return_value=_mock_doc)
    _mock_spacy.load.return_value = _mock_nlp
    sys.modules["spacy"] = _mock_spacy

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db_service.main import Base, get_db


# ── In-memory SQLite engine for test isolation ───────────────
# StaticPool ensures every connection shares the SAME in-memory database
# (otherwise each connection gets its own empty DB).
_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


@pytest.fixture(autouse=True)
def _create_tables():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture()
def db_session():
    """Yield a fresh DB session for direct repository tests."""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _override_get_db():
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """FastAPI TestClient with DB overridden to SQLite."""
    # Patch ML model loading so lifespan doesn't need real models
    mock_whisper_model = MagicMock()
    mock_whisper_model.transcribe.return_value = {"text": "test transcript"}

    mock_nlu = MagicMock()
    mock_nlu.process.return_value = {
        "session_id": "test",
        "category": "pothole",
        "location": "123 Main St",
        "description": "There is a pothole",
        "severity_score": 0.5,
        "caller_name": "John",
        "phone_number": "5551234567",
        "confidence_scores": {
            "category": 0.9, "location": 0.8, "description": 0.7,
            "severity": 0.5, "caller_name": 0.8, "phone_number": 0.9,
            "overall": 0.8,
        },
        "confirm_result": None,
        "correction_field": None,
        "correction_value": None,
        "missing_fields": [],
    }

    # Import main OUTSIDE any patch.dict("sys.modules") context.
    # patch.dict snapshots sys.modules and removes any entries added during the
    # context (e.g. torch, safetensors) on exit.  Those PyO3/Rust extensions
    # cannot be re-initialised, so a second fixture invocation would crash.
    import main as main_module
    from main import app

    # Mock whisper.load_model so the lifespan doesn't download the real model,
    # and replace main.NLUProcessor so it returns our mock processor.
    with patch("whisper.load_model", return_value=mock_whisper_model):
        with patch.object(main_module, "NLUProcessor", return_value=mock_nlu):
            app.dependency_overrides[get_db] = _override_get_db

            from fastapi.testclient import TestClient
            with TestClient(app) as tc:
                yield tc

            app.dependency_overrides.clear()


@pytest.fixture()
def mock_whisper_model():
    """A mock Whisper model for unit tests."""
    model = MagicMock()
    model.transcribe.return_value = {"text": " There is a pothole on Main Street. "}
    return model
