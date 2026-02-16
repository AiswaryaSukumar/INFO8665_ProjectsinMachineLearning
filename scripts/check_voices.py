"""
Check and Select English Voice
Location: scripts/check_voices.py
"""
import pyttsx3

engine = pyttsx3.init()
voices = engine.getProperty('voices')

print("\n" + "="*80)
print("Available Voices on Your System:")
print("="*80 + "\n")

for idx, voice in enumerate(voices):
    print(f"[{idx}] {voice.name}")
    print(f"    ID: {voice.id}")
    print(f"    Languages: {voice.languages}")
    print(f"    Gender: {getattr(voice, 'gender', 'Unknown')}")
    print()

print("="*80)
print("To use English voice, set TTS_VOICE_ID in config/tts_config.py")
print("Example: TTS_VOICE_ID = 0  (for first English voice)")
print("="*80 + "\n")
