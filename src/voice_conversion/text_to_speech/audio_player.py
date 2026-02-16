"""
Audio Player: Plays generated audio files
Location: src/voice_conversion/text_to_speech/audio_player.py
"""
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

class AudioPlayer:
    """Simple audio player for TTS output"""

    def __init__(self):
        """Initialize audio player"""
        self.current_player = None
        self._detect_audio_library()

    def _detect_audio_library(self):
        """Detect available audio playback library"""
        try:
            import pygame
            pygame.mixer.init()
            self.player_type = "pygame"
            logger.info("[AudioPlayer] Using pygame for audio playback")
        except ImportError:
            try:
                import playsound
                self.player_type = "playsound"
                logger.info("[AudioPlayer] Using playsound for audio playback")
            except ImportError:
                self.player_type = "pyttsx3"
                logger.info("[AudioPlayer] Using pyttsx3 built-in playback")

    def play(self, audio_file_path: str, block: bool = True) -> bool:
        """
        Play an audio file

        Args:
            audio_file_path: Path to audio file
            block: If True, wait until playback finishes

        Returns:
            True if playback started successfully
        """
        audio_path = Path(audio_file_path)

        if not audio_path.exists():
            logger.error(f"[AudioPlayer] Audio file not found: {audio_path}")
            return False

        try:
            if self.player_type == "pygame":
                return self._play_pygame(str(audio_path), block)
            elif self.player_type == "playsound":
                return self._play_playsound(str(audio_path), block)
            else:
                logger.warning("[AudioPlayer] No audio player available, using TTS engine")
                return False

        except Exception as e:
            logger.error(f"[AudioPlayer] Error playing audio: {e}")
            return False

    def _play_pygame(self, audio_path: str, block: bool) -> bool:
        """Play using pygame"""
        import pygame

        pygame.mixer.music.load(audio_path)
        pygame.mixer.music.play()

        if block:
            while pygame.mixer.music.get_busy():
                pygame.time.Clock().tick(10)

        logger.info(f"[AudioPlayer] Played audio: {audio_path}")
        return True

    def _play_playsound(self, audio_path: str, block: bool) -> bool:
        """Play using playsound"""
        from playsound import playsound

        playsound(audio_path, block=block)
        logger.info(f"[AudioPlayer] Played audio: {audio_path}")
        return True

    def stop(self):
        """Stop current playback"""
        try:
            if self.player_type == "pygame":
                import pygame
                pygame.mixer.music.stop()
                logger.info("[AudioPlayer] Playback stopped")
        except Exception as e:
            logger.error(f"[AudioPlayer] Error stopping playback: {e}")
