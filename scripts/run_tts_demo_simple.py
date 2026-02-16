import sys
import time
from pathlib import Path

# Add root directory to Python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from src.voice_conversion.text_to_speech import TTSProcessor

def main():
    print("\n" + "="*80)
    print("   INSIGHT-311 Text-to-Speech Demo (Simple)")
    print("="*80 + "\n")

    # Initialize TTS
    print("[1/3] Initializing TTS engine...")
    tts = TTSProcessor()

    # Show available voices
    print("\n[2/3] Available voices on your system:")
    voices = tts.get_available_voices()
    for voice in voices:
        lang = voice.get('languages', ['Unknown'])[0] if voice.get('languages') else 'Unknown'
        print(f"  [{voice['id']}] {voice['name']} - {lang}")

    # Test speech
    print("\n[3/3] Testing speech output...\n")

    test_messages = [
        "Welcome to INSIGHT three one one.",
        "How can I help you today?",
        "Your report has been received.",
        "Thank you for using our service."
    ]

    for idx, message in enumerate(test_messages, 1):
        print(f"[Speaking {idx}/{len(test_messages)}] {message}")
        tts.speak(message)
        time.sleep(0.5)  # 각 메시지 사이 0.5초 대기
        print("  ✓ Complete\n")

    print("="*80)
    print("Demo completed successfully!")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()