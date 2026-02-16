"""
INSIGHT-311 Speech-to-Text Demo
Real-time audio capture, transcription, and storage
Location: scripts/run_stt_demo.py
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
    AudioMerger,
    StorageManager,
    SessionManager
)
from src.database.models.session_model import Session
from config.stt_config import NLU_ENABLED, NLU_SERVICE_URL, LOG_LEVEL, LOG_FORMAT, LOG_DIR

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format=LOG_FORMAT,
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / 'stt_system.log')
    ]
)
logger = logging.getLogger(__name__)


class InsightSTTSystem:
    """INSIGHT-311 Real-time Speech-to-Text System"""

    def __init__(self):
        logger.info("="*80)
        logger.info("INSIGHT-311 STT System Initialization")
        logger.info("="*80)

        # Initialize components
        self.audio_capture = AudioCapture()
        self.stt_processor = STTProcessor()
        self.audio_merger = AudioMerger()
        self.storage_manager = StorageManager()
        self.session_manager = SessionManager()

        logger.info("[System] All components initialized successfully")

    def send_to_nlu(self, transcript_text: str, session_id: str):
        """Send transcript to NLU service for analysis"""
        if not NLU_ENABLED:
            logger.info("[NLU] NLU integration disabled (set NLU_ENABLED=True in config/stt_config.py)")
            return

        try:
            import requests

            payload = {
                "session_id": session_id,
                "transcript": transcript_text,
                "timestamp": datetime.now().isoformat()
            }

            logger.info(f"[NLU] Sending transcript to {NLU_SERVICE_URL}")
            response = requests.post(NLU_SERVICE_URL, json=payload, timeout=5)

            if response.status_code == 200:
                logger.info(f"[NLU] Successfully sent to NLU service")
            else:
                logger.warning(f"[NLU] NLU service returned status {response.status_code}")

        except Exception as e:
            logger.error(f"[NLU] Failed to send to NLU: {e}")

    def run_session(self, caller_phone=None):
        """Run a complete call session"""
        # Create new session
        session = self.session_manager.create_session(caller_phone)
        logger.info(f"\n{'='*80}")
        logger.info(f"SESSION STARTED: {session.session_id}")
        logger.info(f"{'='*80}\n")

        print(f"\n>>> Session ID: {session.session_id}")
        print(">>> Speak into your microphone.")
        print(">>> Press Ctrl+C to end the call and merge files.\n")

        try:
            with sr.Microphone(sample_rate=16000) as source:
                # Calibrate microphone
                self.audio_capture.calibrate_microphone(source)

                # Main capture loop
                while True:
                    print(f"\n[Listening...] Segment #{session.segment_count + 1}")

                    # Capture audio
                    audio_data = self.audio_capture.listen_for_speech(source)

                    if audio_data is None:
                        continue

                    # Save audio segment
                    file_path, duration = self.audio_capture.save_audio_segment(
                        audio_data, 
                        session.session_id, 
                        session.segment_count + 1
                    )
                    session.add_audio_segment(file_path, duration)

                    # Transcribe the saved file
                    print(f"[Processing...] Running STT on segment {session.segment_count}")
                    stt_result = self.stt_processor.transcribe_file(file_path)

                    # Add transcript to session
                    session.add_transcript_segment(
                        text=stt_result['text'],
                        language=stt_result['language'],
                        confidence=stt_result['confidence']
                    )

                    # Display result
                    timestamp = datetime.now().strftime('%H:%M:%S')
                    print(f"\n[{timestamp}] [{stt_result['language']}] {stt_result['text']}")
                    print(f"[Confidence: {stt_result['confidence']:.2f}]\n")

                    # Send to NLU (each segment)
                    if stt_result['text']:
                        self.send_to_nlu(stt_result['text'], session.session_id)

        except KeyboardInterrupt:
            print("\n\n>>> Call ending. Processing final files...\n")
            self.end_session(session)

        except Exception as e:
            logger.error(f"[System] Error during session: {e}", exc_info=True)
            session.status = "FAILED"

    def end_session(self, session: Session):
        """End a session: merge files, upload to storage, cleanup"""
        logger.info(f"\n{'='*80}")
        logger.info(f"SESSION ENDING: {session.session_id}")
        logger.info(f"{'='*80}\n")

        # Mark session as completed
        self.session_manager.complete_session(session.session_id)

        # Merge audio segments
        print("[Step 1/4] Merging audio segments...")
        merged_audio_path = self.audio_merger.merge_audio_segments(session)

        # Merge transcripts
        print("[Step 2/4] Merging transcript segments...")
        merged_transcript_path = self.audio_merger.merge_transcripts(session)

        # Upload to storage
        print("[Step 3/4] Uploading to storage...")
        if merged_audio_path:
            audio_key = self.storage_manager.generate_object_key(session.session_id, "audio")
            audio_url = self.storage_manager.upload_file(merged_audio_path, audio_key)
            session.final_audio_url = audio_url

        if merged_transcript_path:
            transcript_key = self.storage_manager.generate_object_key(session.session_id, "transcript")
            transcript_url = self.storage_manager.upload_file(merged_transcript_path, transcript_key)
            session.final_transcript_url = transcript_url

        # Cleanup segment files
        print("[Step 4/4] Cleaning up temporary files...")
        self.audio_merger.cleanup_segments(session)

        # Final summary
        print("\n" + "="*80)
        print("SESSION SUMMARY")
        print("="*80)
        print(f"Session ID:        {session.session_id}")
        print(f"Total Segments:    {session.segment_count}")
        print(f"Duration:          {(session.ended_at - session.started_at).total_seconds():.1f}s")
        print(f"Full Transcript:   {session.get_full_transcript()[:100]}...")
        print(f"Audio URL:         {session.final_audio_url}")
        print(f"Transcript URL:    {session.final_transcript_url}")
        print("="*80 + "\n")

        logger.info("[System] Session processing complete")


def main():
    """Main entry point"""
    print("\n" + "="*80)
    print("   INSIGHT-311 Speech-to-Text System")
    print("   Real-time transcription with file storage & NLU integration")
    print("="*80 + "\n")

    # Initialize system
    stt_system = InsightSTTSystem()

    # Run session
    stt_system.run_session(caller_phone=None)


if __name__ == "__main__":
    main()
