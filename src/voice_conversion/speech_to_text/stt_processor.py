"""
STT Processor: Uses Whisper AI to transcribe audio files
Location: src/voice-conversion/speech-to-text/stt_processor.py
"""
import whisper
import torch
import logging
from pathlib import Path
from config.stt_config import WHISPER_MODEL_SIZE, WHISPER_TASK

logger = logging.getLogger(__name__)

class STTProcessor:
    """Whisper-based Speech-to-Text processor"""

    def __init__(self, model_size=None):
        model_size = model_size or WHISPER_MODEL_SIZE
        logger.info(f"[STTProcessor] Loading Whisper model: {model_size}...")
        self.model = whisper.load_model(model_size)
        self.task = WHISPER_TASK
        logger.info(f"[STTProcessor] Model loaded successfully. Task mode: {self.task}")

    def transcribe_file(self, audio_file_path: str) -> dict:
        """
        Transcribe an audio file using Whisper

        Args:
            audio_file_path: Path to the audio file

        Returns:
            dict with keys: text, language, confidence
        """
        try:
            logger.info(f"[STTProcessor] Transcribing: {audio_file_path}")

            # Run Whisper transcription
            result = self.model.transcribe(
                audio_file_path,
                task=self.task,
                fp16=False  # Use FP32 for CPU compatibility
            )

            # Extract results
            text = result['text'].strip()
            language = result.get('language', 'unknown')

            # Calculate average confidence from segments
            segments = result.get('segments', [])
            if segments:
                avg_confidence = sum(seg.get('no_speech_prob', 0) for seg in segments) / len(segments)
                confidence = 1.0 - avg_confidence  # Convert no_speech_prob to confidence
            else:
                confidence = 0.8  # Default confidence if no segments

            logger.info(f"[STTProcessor] Transcription complete: [{language}] {text[:50]}...")

            return {
                'text': text,
                'language': language,
                'confidence': confidence
            }

        except Exception as e:
            logger.error(f"[STTProcessor] Transcription failed: {e}")
            return {
                'text': '',
                'language': 'unknown',
                'confidence': 0.0
            }

    def transcribe_multiple_files(self, file_paths: list) -> list:
        """
        Transcribe multiple audio files in sequence

        Returns:
            List of transcription results
        """
        results = []
        for file_path in file_paths:
            result = self.transcribe_file(file_path)
            results.append(result)
        return results
