"""
Interactive TTS Demo - Type text and hear it spoken
Location: scripts/run_tts_demo_interactive.py
"""
import sys
from pathlib import Path

# Add root directory to Python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from src.voice_conversion.text_to_speech import TTSProcessor

def main():
    print("\n" + "="*80)
    print("   INSIGHT-311 Interactive TTS Demo")
    print("="*80 + "\n")

    # Initialize TTS
    print("Initializing TTS engine...\n")
    tts = TTSProcessor()

    print("Commands:")
    print("  - Type any text to hear it spoken")
    print("  - 'system:<key>' to play system message (e.g., system:greeting)")
    print("  - 'rate:<number>' to change speed (e.g., rate:180)")
    print("  - 'volume:<0-1>' to change volume (e.g., volume:0.8)")
    print("  - 'voices' to list available voices")
    print("  - 'quit' or 'exit' to stop\n")
    print("="*80 + "\n")

    while True:
        try:
            user_input = input(">>> Enter text: ").strip()

            if not user_input:
                continue

            # Exit commands
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("\nGoodbye!\n")
                break

            # Show voices
            elif user_input.lower() == 'voices':
                voices = tts.get_available_voices()
                print("\nAvailable voices:")
                for voice in voices:
                    print(f"  [{voice['id']}] {voice['name']}")
                print()
                continue

            # System message
            elif user_input.startswith('system:'):
                key = user_input.split(':', 1)[1].strip()
                print(f"[Playing system message: {key}]")
                tts.speak_system_message(key)
                continue

            # Change rate
            elif user_input.startswith('rate:'):
                try:
                    rate = int(user_input.split(':', 1)[1].strip())
                    tts.adjust_rate(rate)
                    print(f"✓ Speaking rate set to {rate} WPM\n")
                except ValueError:
                    print("✗ Invalid rate value\n")
                continue

            # Change volume
            elif user_input.startswith('volume:'):
                try:
                    volume = float(user_input.split(':', 1)[1].strip())
                    tts.adjust_volume(volume)
                    print(f"✓ Volume set to {volume}\n")
                except ValueError:
                    print("✗ Invalid volume value\n")
                continue

            # Regular text
            else:
                print(f"[Speaking] {user_input}")
                tts.speak(user_input)
                print("✓ Complete\n")

        except KeyboardInterrupt:
            print("\n\nInterrupted by user. Goodbye!\n")
            break
        except Exception as e:
            print(f"\n✗ Error: {e}\n")

if __name__ == "__main__":
    main()
