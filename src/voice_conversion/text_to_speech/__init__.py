"""
Text-to-Speech System Package
Location: src/voice_conversion/text_to_speech/__init__.py
"""
from .tts_processor import TTSProcessor
from .audio_player import AudioPlayer

__all__ = ['TTSProcessor', 'AudioPlayer']