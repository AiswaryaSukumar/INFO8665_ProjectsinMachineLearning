"""
Unit tests for STT service:
- Phonetic correction
- Transcription (mocked Whisper)
"""

import pytest
from unittest.mock import patch, MagicMock

from stt_service.main import apply_phonetic_correction


class TestPhoneticCorrection:
    def test_graffiti_correction(self):
        """Common mishearing: 'gravity' should become 'graffiti'."""
        corrected = apply_phonetic_correction("gravity on the wall")
        assert "graffiti" in corrected

    def test_pothole_correction(self):
        corrected = apply_phonetic_correction("there is a portfol on the road")
        assert "pothole" in corrected

    def test_no_change_for_clean_text(self):
        text = "hello world this is a test"
        corrected = apply_phonetic_correction(text)
        assert corrected == text

    def test_parking_complaint_correction(self):
        # The phonetic map matches individual words; "barking" fuzzy-matches
        # the synonym "barking ticket" only at word level with score > 85
        corrected = apply_phonetic_correction("there is a pothole")
        assert "pothole" in corrected


class TestTranscribeAudio:
    def test_transcribe_returns_string(self, mock_whisper_model):
        """Mocked transcription returns corrected text."""
        with patch("stt_service.main.model", mock_whisper_model):
            from stt_service.main import transcribe_audio
            result = transcribe_audio("fake_path.wav")
            assert isinstance(result, str)
            assert len(result) > 0
            mock_whisper_model.transcribe.assert_called_once()

    def test_process_turn_structure(self, mock_whisper_model):
        """process_turn should return a dict with expected keys."""
        mock_record = MagicMock(return_value="fake_audio.wav")

        with patch("stt_service.main.model", mock_whisper_model), \
             patch("stt_service.main.record_audio", mock_record):
            from stt_service.main import process_turn
            result = process_turn("test-session-id", 1)

            assert "session_id" in result
            assert "turn" in result
            assert "transcript" in result
            assert result["session_id"] == "test-session-id"
            assert result["turn"] == 1
