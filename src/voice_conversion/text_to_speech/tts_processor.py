"""
TTS Processor: Converts text to speech using pyttsx3 (FIXED)
Location: src/voice_conversion/text_to_speech/tts_processor.py
"""
import pyttsx3
import logging
import time
from pathlib import Path
from typing import Optional
from config.tts_config import (
    TTS_RATE, TTS_VOLUME, TTS_VOICE_ID,
    TTS_SAVE_TO_FILE, TTS_OUTPUT_DIR, 
    TTS_AUDIO_FORMAT, SYSTEM_MESSAGES
)

logger = logging.getLogger(__name__)

class TTSProcessor:
    """pyttsx3-based Text-to-Speech processor (Fixed for multiple calls)"""

    def __init__(self):
        """Initialize TTS engine"""
        self.engine = None
        self._init_engine()
        logger.info("[TTSProcessor] pyttsx3 engine initialized successfully")

    def _init_engine(self):
        """Initialize or reinitialize the engine"""
        try:
            if self.engine is not None:
                try:
                    self.engine.stop()
                except:
                    pass

            self.engine = pyttsx3.init()
            self._configure_engine()
        except Exception as e:
            logger.error(f"[TTSProcessor] Failed to initialize TTS engine: {e}")
            raise

    def _configure_engine(self):
        """Configure TTS engine settings"""
        # Set speaking rate
        self.engine.setProperty('rate', TTS_RATE)
        logger.info(f"[TTSProcessor] Speaking rate set to {TTS_RATE} WPM")

        # Set volume
        self.engine.setProperty('volume', TTS_VOLUME)
        logger.info(f"[TTSProcessor] Volume set to {TTS_VOLUME}")

        # Set voice (if specified)
        if TTS_VOICE_ID is not None:
            voices = self.engine.getProperty('voices')
            if 0 <= TTS_VOICE_ID < len(voices):
                self.engine.setProperty('voice', voices[TTS_VOICE_ID].id)
                logger.info(f"[TTSProcessor] Voice set to: {voices[TTS_VOICE_ID].name}")
            else:
                logger.warning(f"[TTSProcessor] Voice ID {TTS_VOICE_ID} out of range")

    def get_available_voices(self) -> list:
        """Get list of available voices on the system"""
        voices = self.engine.getProperty('voices')
        voice_list = []
        for idx, voice in enumerate(voices):
            voice_list.append({
                'id': idx,
                'name': voice.name,
                'languages': voice.languages,
                'gender': getattr(voice, 'gender', 'Unknown')
            })
        return voice_list

    def speak(self, text: str, save_to_file: Optional[str] = None) -> Optional[str]:
        """
        Convert text to speech and optionally save to file

        Args:
            text: Text to convert to speech
            save_to_file: If provided, save audio to this file path

        Returns:
            Path to saved audio file (if save_to_file is True), else None
        """
        try:
            logger.info(f"[TTSProcessor] Converting text to speech: '{text[:50]}...'")

            # Reinitialize engine for each call (fixes the bug)
            self._init_engine()

            # Save to file if requested
            if save_to_file:
                output_path = Path(save_to_file)
                output_path.parent.mkdir(parents=True, exist_ok=True)

                self.engine.save_to_file(text, str(output_path))
                self.engine.runAndWait()

                logger.info(f"[TTSProcessor] Audio saved to: {output_path}")
                return str(output_path)

            # Just speak (real-time)
            else:
                self.engine.say(text)
                self.engine.runAndWait()

                # Small delay to ensure completion
                time.sleep(0.3)

                logger.info("[TTSProcessor] Speech completed")
                return None

        except Exception as e:
            logger.error(f"[TTSProcessor] Error during TTS: {e}")
            # Try to recover by reinitializing
            self._init_engine()
            return None

    def speak_and_save(self, text: str, filename: Optional[str] = None) -> str:
        """
        Speak text and save to default output directory

        Args:
            text: Text to convert
            filename: Custom filename (without extension)

        Returns:
            Path to saved audio file
        """
        if filename is None:
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"tts_output_{timestamp}"

        output_path = TTS_OUTPUT_DIR / f"{filename}.{TTS_AUDIO_FORMAT}"
        return self.speak(text, save_to_file=str(output_path))

    def speak_system_message(self, message_key: str, **kwargs) -> str:
        """
        Speak a pre-defined system message

        Args:
            message_key: Key from SYSTEM_MESSAGES config
            **kwargs: Format parameters for the message

        Returns:
            Path to saved audio file (if saving enabled)

        Example:
            tts.speak_system_message('ticket_created', ticket_id='12345')
        """
        if message_key not in SYSTEM_MESSAGES:
            logger.warning(f"[TTSProcessor] Unknown message key: {message_key}")
            return None

        message = SYSTEM_MESSAGES[message_key].format(**kwargs)
        logger.info(f"[TTSProcessor] Speaking system message: {message_key}")

        if TTS_SAVE_TO_FILE:
            return self.speak_and_save(message, filename=f"system_{message_key}")
        else:
            self.speak(message)
            return None

    def adjust_rate(self, rate: int):
        """Change speaking rate dynamically"""
        self.engine.setProperty('rate', rate)
        logger.info(f"[TTSProcessor] Speaking rate adjusted to {rate} WPM")

    def adjust_volume(self, volume: float):
        """Change volume dynamically (0.0 to 1.0)"""
        self.engine.setProperty('volume', max(0.0, min(1.0, volume)))
        logger.info(f"[TTSProcessor] Volume adjusted to {volume}")

    def stop(self):
        """Stop current speech"""
        try:
            if self.engine:
                self.engine.stop()
            logger.info("[TTSProcessor] Speech stopped")
        except Exception as e:
            logger.error(f"[TTSProcessor] Error stopping speech: {e}")

    def __del__(self):
        """Cleanup when object is destroyed"""
        try:
            if hasattr(self, 'engine') and self.engine:
                self.engine.stop()
        except:
            pass