"""
Audio Merger: Combines audio segments and transcripts on call completion
Location: src/voice-conversion/speech-to-text/audio_merger.py
"""
import json
import logging
import subprocess
from pathlib import Path
from typing import List
from src.database.models.session_model import Session
from config.stt_config import TEMP_STORAGE_DIR

logger = logging.getLogger(__name__)

class AudioMerger:
    """Handles merging of audio segments and transcripts"""

    def merge_audio_segments(self, session: Session) -> str:
        """
        Merge all audio segments into a single WAV file using ffmpeg

        Args:
            session: Session object with audio_segments

        Returns:
            Path to merged audio file
        """
        if not session.audio_segments:
            logger.warning(f"[AudioMerger] No audio segments to merge for session {session.session_id}")
            return ""

        session_dir = Path(TEMP_STORAGE_DIR) / session.session_id
        output_file = session_dir / "final_audio.wav"

        # Create a file list for ffmpeg concat
        concat_file = session_dir / "concat_list.txt"
        with open(concat_file, 'w') as f:
            for segment in sorted(session.audio_segments, key=lambda x: x.segment_number):
                f.write(f"file '{segment.file_path}'\n")

        try:
            # Use ffmpeg to concatenate audio files
            command = [
                'ffmpeg',
                '-f', 'concat',
                '-safe', '0',
                '-i', str(concat_file),
                '-c', 'copy',
                str(output_file),
                '-y'  # Overwrite if exists
            ]

            logger.info(f"[AudioMerger] Merging {len(session.audio_segments)} segments...")
            result = subprocess.run(command, capture_output=True, text=True)

            if result.returncode == 0:
                logger.info(f"[AudioMerger] Successfully merged audio to: {output_file}")
                return str(output_file)
            else:
                logger.error(f"[AudioMerger] FFmpeg error: {result.stderr}")
                return ""

        except FileNotFoundError:
            logger.error("[AudioMerger] FFmpeg not found. Please install ffmpeg.")
            return ""
        except Exception as e:
            logger.error(f"[AudioMerger] Error during audio merge: {e}")
            return ""

    def merge_transcripts(self, session: Session) -> str:
        """
        Combine all transcript segments into a single JSON file

        Args:
            session: Session object with transcript_segments

        Returns:
            Path to merged transcript file
        """
        if not session.transcript_segments:
            logger.warning(f"[AudioMerger] No transcripts to merge for session {session.session_id}")
            return ""

        session_dir = Path(TEMP_STORAGE_DIR) / session.session_id
        output_file = session_dir / "final_transcript.json"

        # Prepare transcript data
        transcript_data = {
            "session_id": session.session_id,
            "caller_phone": session.caller_phone,
            "started_at": session.started_at.isoformat(),
            "ended_at": session.ended_at.isoformat() if session.ended_at else None,
            "total_segments": len(session.transcript_segments),
            "full_text": session.get_full_transcript(),
            "segments": [
                {
                    "segment_number": seg.segment_number,
                    "text": seg.text,
                    "language": seg.language,
                    "confidence": seg.confidence,
                    "timestamp": seg.created_at.isoformat()
                }
                for seg in sorted(session.transcript_segments, key=lambda x: x.segment_number)
            ]
        }

        # Save as JSON
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(transcript_data, f, indent=2, ensure_ascii=False)

        logger.info(f"[AudioMerger] Transcript merged and saved to: {output_file}")
        return str(output_file)

    def cleanup_segments(self, session: Session):
        """Delete individual segment files after successful merge"""
        try:
            for segment in session.audio_segments:
                segment_path = Path(segment.file_path)
                if segment_path.exists():
                    segment_path.unlink()
                    logger.debug(f"[AudioMerger] Deleted segment: {segment_path}")

            # Delete concat list file
            session_dir = Path(TEMP_STORAGE_DIR) / session.session_id
            concat_file = session_dir / "concat_list.txt"
            if concat_file.exists():
                concat_file.unlink()

            logger.info(f"[AudioMerger] Cleaned up segment files for session {session.session_id}")
        except Exception as e:
            logger.error(f"[AudioMerger] Error during cleanup: {e}")
