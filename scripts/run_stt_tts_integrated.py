"""
INSIGHT-311 Integrated Demo: STT + TTS Combined
Real conversation with voice input and voice response
Location: scripts/run_stt_tts_integrated.py
"""
import logging
import sys
import speech_recognition as sr
from datetime import datetime
from pathlib import Path

# Add root directory to Python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from src.voice_conversion.speech_to_text import (
    AudioCapture,
    STTProcessor,
    SessionManager
)
from src.voice_conversion.text_to_speech import TTSProcessor
from config.stt_config import LOG_LEVEL, LOG_FORMAT, LOG_DIR

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format=LOG_FORMAT,
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / 'integrated_system.log')
    ]
)
logger = logging.getLogger(__name__)


class InsightIntegratedSystem:
    """INSIGHT-311 Full System: Voice Input → STT → Processing → TTS → Voice Output"""

    def __init__(self):
        logger.info("="*80)
        logger.info("INSIGHT-311 Integrated System Initialization")
        logger.info("="*80)

        # Initialize STT components
        self.audio_capture = AudioCapture()
        self.stt_processor = STTProcessor()
        self.session_manager = SessionManager()

        # Initialize TTS component
        self.tts = TTSProcessor()

        logger.info("[System] All components initialized successfully")

    def run_conversation(self):
        """Run a complete conversation session with voice I/O"""
        # Create session
        session = self.session_manager.create_session()

        print("\n" + "="*80)
        print("   INSIGHT-311 Voice Conversation System")
        print("   STT + TTS Integrated Demo")
        print("="*80 + "\n")

        # Welcome message (TTS)
        print("[System] Speaking welcome message...")
        self.tts.speak_system_message('greeting')

        try:
            with sr.Microphone(sample_rate=16000) as source:
                # Calibrate
                print("\n[System] Calibrating microphone...")
                self.audio_capture.calibrate_microphone(source)

                # Ask for issue description
                print("\n[System] Prompting user for input...")
                self.tts.speak_system_message('listening')

                print("\n>>> Speak now (describe your issue)...")
                print(">>> Press Ctrl+C when done speaking\n")

                # Collect all speech segments
                segments_text = []

                for i in range(3):  # Allow up to 3 segments
                    print(f"[Listening...] Segment {i+1}/3")

                    # Capture audio
                    audio_data = self.audio_capture.listen_for_speech(source, timeout=10)

                    if audio_data is None:
                        print("[Timeout] No speech detected\n")
                        break

                    # Save segment
                    file_path, duration = self.audio_capture.save_audio_segment(
                        audio_data, 
                        session.session_id, 
                        i + 1
                    )
                    session.add_audio_segment(file_path, duration)

                    # Transcribe
                    print(f"[Processing...] Transcribing segment {i+1}")
                    stt_result = self.stt_processor.transcribe_file(file_path)

                    if stt_result['text']:
                        segments_text.append(stt_result['text'])
                        session.add_transcript_segment(
                            text=stt_result['text'],
                            language=stt_result['language'],
                            confidence=stt_result['confidence']
                        )

                        # Show transcription
                        print(f"[Transcribed] {stt_result['text']}")
                        print(f"[Confidence] {stt_result['confidence']:.2f}\n")
                    else:
                        break

                # Get full transcript
                full_transcript = session.get_full_transcript()

                if full_transcript:
                    print("\n" + "="*80)
                    print("CONVERSATION SUMMARY")
                    print("="*80)
                    print(f"\nYou said: {full_transcript}\n")

                    # System response (TTS)
                    print("[System] Speaking confirmation...")
                    self.tts.speak_system_message('processing')

                    # Generate ticket ID (mock)
                    ticket_id = f"INS-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

                    print(f"\n[System] Ticket created: {ticket_id}")
                    self.tts.speak_system_message('ticket_created', ticket_id=ticket_id)

                    print("="*80 + "\n")
                else:
                    print("\n[Error] No speech detected")
                    self.tts.speak_system_message('error')

        except KeyboardInterrupt:
            print("\n\n[System] Session interrupted by user")

        except Exception as e:
            logger.error(f"[System] Error during conversation: {e}", exc_info=True)

        finally:
            # Goodbye message
            print("\n[System] Ending session...")
            self.tts.speak_system_message('goodbye')

            self.session_manager.complete_session(session.session_id)
            print("\nSession completed.\n")


def main():
    """Main entry point"""
    system = InsightIntegratedSystem()
    system.run_conversation()


if __name__ == "__main__":
    main()
