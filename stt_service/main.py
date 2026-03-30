import whisper
import sounddevice as sd
import soundfile as sf
import numpy as np
import re
import os
import time as _time
from datetime import datetime
from thefuzz import process, fuzz

from logging_config import get_logger
from metrics import stt_transcriptions_total, stt_transcription_seconds
from config import WHISPER_MODEL_SIZE

logger = get_logger("insight311.stt")

TEMP_AUDIO_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "data/audio_samples/temp"
))
MERGED_AUDIO_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "data/audio_samples"
))
def initialize_stt_dirs():
    global model
    os.makedirs(TEMP_AUDIO_DIR,   exist_ok=True)
    os.makedirs(MERGED_AUDIO_DIR, exist_ok=True)
    if model is None:
        try:
            model = whisper.load_model(WHISPER_MODEL_SIZE)
            logger.info("whisper_model_loaded model_size=%s", WHISPER_MODEL_SIZE)
        except Exception as e:
            logger.warning("whisper_model_load_failed error=%s", e)

model = None

def record_audio(session_id: str, turn: int,
                 sample_rate: int = 16000,
                 device: int = 1,
                 silence_threshold: float = 0.03,
                 silence_duration: float = 3.0,
                 start_timeout: float = 15.0,
                 max_duration: float = 60.0,
                 chunk_size: float = 0.1) -> str:
    print(f"  🎙️  Turn {turn} — System is ready. Please speak when you are ready...")
    logger.debug("recording_start session_id=%s turn=%s", session_id, turn)

    frames = []
    speaking_started = False
    stop_recording   = False
    consecutive_speech_chunks = 0
    min_speech_chunks = 3
    silent_chunks = 0
    elapsed_chunks = 0
    silence_limit_chunks = int(silence_duration / chunk_size)
    start_timeout_chunks = int(start_timeout / chunk_size)

    def callback(indata, frame_count, time_info, status):
        nonlocal silent_chunks, speaking_started, stop_recording, consecutive_speech_chunks

        frames.append(indata.copy())
        rms = np.sqrt(np.mean(indata ** 2))

        if rms > silence_threshold:
            consecutive_speech_chunks += 1
            if not speaking_started and consecutive_speech_chunks >= min_speech_chunks:
                print("  🔔 Speech Confirmed — Start recording.")
                speaking_started = True
            silent_chunks = 0
        else:
            consecutive_speech_chunks = 0
            if speaking_started:
                silent_chunks += 1
                if silent_chunks >= silence_limit_chunks:
                    print(f"  | End of speech detected ({silence_duration}s silence).")
                    stop_recording = True

    with sd.InputStream(samplerate=sample_rate, channels=1, dtype="float32",
                        device=device, blocksize=int(sample_rate * chunk_size),
                        callback=callback):
        while not stop_recording:
            sd.sleep(int(chunk_size * 1000))
            elapsed_chunks += 1
            if not speaking_started and elapsed_chunks >= start_timeout_chunks:
                print(f"  ⚠️ Timeout: No speech detected for {start_timeout}s.")
                stop_recording = True
                break
            if elapsed_chunks >= int(max_duration / chunk_size):
                print("  ⚠️ Max duration reached.")
                stop_recording = True
                break

    if not speaking_started:
        print("  ❌ No valid speech was captured.")
        audio = np.zeros((sample_rate, 1), dtype="float32")
    else:
        audio = np.concatenate(frames, axis=0)

    file_path = os.path.join(TEMP_AUDIO_DIR, f"{session_id}_turn{turn}.wav")
    sf.write(file_path, audio, sample_rate)
    return file_path


PHONETIC_MAP = {
    "graffiti": ["gravity", "grafity", "graphity"],
    "illegal_sign": ["illegal sign", "illegal sine"],
    "litter": ["leader", "liter", "leather"],
    "needles": ["noodles", "knees", "needle"],
    "parking_complaint": ["parking complaint", "barking ticket", "park in complaint"],
    "property_standards": ["property standards", "property standard"],
    "pothole": ["pothole", "putos", "portfol", "portal", "full tall", "road hole"],
    "sidewalk_snow": ["sidewalk snow", "piles of snow", "unplowed sidewalk"],
    "sidewalk_hazard": ["sidewalk hazard", "hazard on sidewalk"],
    "trail_maintenance": ["trail maintenance", "trail repair"]
}

def apply_phonetic_correction(transcript: str) -> str:
    words = transcript.lower().split()
    corrected_words = []
    for word in words:
        best_match = None
        highest_score = 0
        for official_name, synonyms in PHONETIC_MAP.items():
            match, score = process.extractOne(word, synonyms, scorer=fuzz.ratio)
            if score > 85 and score > highest_score:
                highest_score = score
                best_match = official_name
        corrected_words.append(best_match if best_match else word)
    return " ".join(corrected_words)


def transcribe_audio(audio_file_path: str) -> str:
    print(f"  🔍 Transcribing: {audio_file_path}")
    logger.info("transcription_start file=%s", audio_file_path)
    result = model.transcribe(audio_file_path, language="en", fp16=False, temperature=0.0, best_of=3, beam_size=3)
    raw_text = result["text"].strip()
    raw_text = re.sub(r'^[\s\.]+', '', raw_text).strip()
    print(f"  📝 Transcript: {raw_text}")
    clean_text = apply_phonetic_correction(raw_text)
    print(f"  🔧 STT Post-Process: '{raw_text}' -> '{clean_text}'")
    logger.info("transcription_complete raw_length=%d clean_length=%d", len(raw_text), len(clean_text))
    return clean_text


def process_turn(session_id: str, turn: int) -> dict:
    audio_path = record_audio(
        session_id=session_id,
        turn=turn,
        silence_threshold=0.03, 
        silence_duration=2.0,
        start_timeout=15.0
    )
    transcript = transcribe_audio(audio_path)
    return {
        "session_id": session_id,
        "turn": turn,
        "transcript": transcript,
        "audio_file_path": audio_path,
        "created_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
    }


def merge_audio_files(session_id: str, turn_count: int, sample_rate: int = 16000) -> str:
    merged_audio = []
    for turn in range(1, turn_count + 1):
        file_path = os.path.join(TEMP_AUDIO_DIR, f"{session_id}_turn{turn}.wav")
        if os.path.exists(file_path):
            audio, sr = sf.read(file_path, dtype="float32")
            sample_rate = sr                               
            merged_audio.append(audio)
            merged_audio.append(np.zeros(int(sr * 0.5), dtype="float32"))

    if not merged_audio:
        return None

    merged      = np.concatenate(merged_audio)
    merged_path = os.path.join(MERGED_AUDIO_DIR, f"merged_{session_id}.wav")
    sf.write(merged_path, merged, sample_rate)
    logger.info("merged_audio_saved session_id=%s path=%s", session_id, merged_path)

    for turn in range(1, turn_count + 1):
        file_path = os.path.join(TEMP_AUDIO_DIR, f"{session_id}_turn{turn}.wav")
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.debug("deleted_temp_audio path=%s", file_path)

    return merged_path
