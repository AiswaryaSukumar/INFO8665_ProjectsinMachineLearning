"""
Audio Capture Module: Captures microphone input and saves as segment files
Location: src/voice-conversion/speech-to-text/audio_capture.py
"""
import speech_recognition as sr
import wave
import logging
from pathlib import Path
from config.stt_config import (
    TEMP_STORAGE_DIR, SAMPLE_RATE, AUDIO_FORMAT,
    SEGMENT_MAX_DURATION, PAUSE_THRESHOLD, ENERGY_THRESHOLD
)

logger = logging.getLogger(__name__)

class AudioCapture:
    """Handles real-time audio capture and segment file storage"""

    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.recognizer.energy_threshold = ENERGY_THRESHOLD
        self.recognizer.dynamic_energy_threshold = True
        self.recognizer.pause_threshold = PAUSE_THRESHOLD
        logger.info("[AudioCapture] Initialized with energy_threshold={}, pause_threshold={}s".format(
            ENERGY_THRESHOLD, PAUSE_THRESHOLD
        ))

    def calibrate_microphone(self, source, duration=1):
        """Calibrate for ambient noise"""
        logger.info("[AudioCapture] Calibrating for background noise...")
        self.recognizer.adjust_for_ambient_noise(source, duration=duration)
        logger.info("[AudioCapture] Calibration complete.")

    def listen_for_speech(self, source, timeout=None, phrase_time_limit=None):
        """
        Listen for a single speech utterance
        Returns: AudioData object or None if timeout
        """
        try:
            audio = self.recognizer.listen(
                source, 
                timeout=timeout, 
                phrase_time_limit=phrase_time_limit or SEGMENT_MAX_DURATION
            )
            return audio
        except sr.WaitTimeoutError:
            logger.warning("[AudioCapture] Listen timeout - no speech detected")
            return None
        except Exception as e:
            logger.error(f"[AudioCapture] Error during listening: {e}")
            return None

    def save_audio_segment(self, audio_data: sr.AudioData, session_id: str, segment_number: int) -> tuple:
        """
        Save audio data as WAV file
        Returns: (file_path, duration_in_seconds)
        """
        # Create session directory if not exists
        session_dir = TEMP_STORAGE_DIR / session_id
        session_dir.mkdir(exist_ok=True)

        # Generate file path
        file_name = f"segment_{segment_number:04d}.{AUDIO_FORMAT}"
        file_path = session_dir / file_name

        # Get raw audio data
        raw_data = audio_data.get_raw_data()

        # Save as WAV file
        with wave.open(str(file_path), 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(audio_data.sample_width)
            wav_file.setframerate(audio_data.sample_rate)
            wav_file.writeframes(raw_data)

        # Calculate duration
        duration = len(raw_data) / (audio_data.sample_rate * audio_data.sample_width)

        logger.info(f"[AudioCapture] Saved segment {segment_number} to {file_path} (duration: {duration:.2f}s)")

        return str(file_path), duration
