# src/voice_conversion/speech_to_text/stt_service.py
# STT Service — Records mic audio and transcribes using local Whisper model

import whisper
import sounddevice as sd
import soundfile as sf
import numpy as np
import re
import os
from datetime import datetime
from thefuzz import process, fuzz

TEMP_AUDIO_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "../../../data/audio_samples/temp"
))
MERGED_AUDIO_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "../../../data/audio_samples"
))
os.makedirs(TEMP_AUDIO_DIR,   exist_ok=True)
os.makedirs(MERGED_AUDIO_DIR, exist_ok=True)

# Load Whisper model once at startup (base is fast and accurate enough)
print("Loading Whisper model...")
model = whisper.load_model("small") 
# "base" is fast version/ "small" is good balance of speed and accuracy / "medium" more accurate but slower
print("Whisper model loaded.")


def record_audio(session_id: str, turn: int,
                 sample_rate: int = 16000,
                 device: int = 1,
                 silence_threshold: float = 0.03, # Increased to avoid background noise
                 silence_duration: float = 3.0,  # Wait 3s after speech ends
                 start_timeout: float = 15.0,    # Wait up to 15s for the user to start
                 max_duration: float = 60.0,     # Maximum total call duration
                 chunk_size: float = 0.1) -> str:
    
    print(f"  🎙️  Turn {turn} — System is ready. Please speak when you are ready...")

    frames = []
    speaking_started = False
    stop_recording   = False
    
    # Logic for filtering noise
    consecutive_speech_chunks = 0
    min_speech_chunks = 3 # Must have 0.3s of continuous sound to be 'Speech'
    
    # Timing counters
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
            
            # Check for timeout ONLY if speaking hasn't started
            if not speaking_started and elapsed_chunks >= start_timeout_chunks:
                print(f"  ⚠️ Timeout: No speech detected for {start_timeout}s.")
                stop_recording = True
                break
            
            if elapsed_chunks >= int(max_duration / chunk_size):
                print("  ⚠️ Max duration reached.")
                stop_recording = True
                break

    # Final result processing
    if not speaking_started:
        print("  ❌ No valid speech was captured.")
        audio = np.zeros((sample_rate, 1), dtype="float32")
    else:
        audio = np.concatenate(frames, axis=0)

    file_path = os.path.join(TEMP_AUDIO_DIR, f"{session_id}_turn{turn}.wav")
    sf.write(file_path, audio, sample_rate)
    return file_path


def transcribe_audio(audio_file_path: str) -> str:
    """
    Transcribe a WAV file using local Whisper model.
    Returns transcript string.
    """
    print(f"  🔍 Transcribing: {audio_file_path}")
    result     = model.transcribe(audio_file_path, 
                                  language="en",
                                  fp16=False,
                                  temperature=0.0,   # deterministic output (no randomness)
                                  best_of=3,         # run multiple times and pick best result
                                  beam_size=3)
    transcript = result["text"].strip()
    transcript = re.sub(r'^[\s\.]+', '', transcript).strip()
    print(f"  📝 Transcript: {transcript}")
    return transcript


def process_turn(session_id: str, turn: int) -> dict:
    """
    The main entry point called by the API. 
    It triggers the microphone, waits for speech, and then transcribes.
    """
    # 1. Trigger the actual recording with VAD logic
    # This function will now block and wait for the user to speak
    audio_path = record_audio(
        session_id=session_id,
        turn=turn,
        silence_threshold=0.03, 
        silence_duration=2.0,
        start_timeout=15.0
    )

    # 2. Transcribe the captured audio
    transcript = transcribe_audio(audio_path)
    
    # 3. Return the result to the API
    return {
        "session_id": session_id,
        "turn": turn,
        "transcript": transcript, # This MUST be returned for the API to see it
        "audio_file_path": audio_path,
        "created_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
    }


def merge_audio_files(session_id: str, turn_count: int,
                      sample_rate: int = 16000) -> str:
    """
    Merge all turn WAV files into one final recording.
    Inserts 0.5s silence between turns.
    Deletes temp files after merging.
    Returns merged file path.
    """
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
    print(f"  🎵 Merged audio saved: {merged_path}")

    # Delete temp files
    for turn in range(1, turn_count + 1):
        file_path = os.path.join(TEMP_AUDIO_DIR, f"{session_id}_turn{turn}.wav")
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"  🗑️  Deleted temp: {file_path}")

    return merged_path

# Define the official categories and their common mispronunciations
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
            # Check for a fuzzy match against synonyms
            match, score = process.extractOne(word, synonyms, scorer=fuzz.ratio)
            if score > 85 and score > highest_score:
                highest_score = score
                best_match = official_name
        
        corrected_words.append(best_match if best_match else word)
    
    return " ".join(corrected_words)

def transcribe_audio(audio_file_path: str) -> str:
    # Assuming 'model' is your loaded Whisper model
    result = model.transcribe(audio_file_path, language="en")
    raw_text = result["text"].strip()
    
    # Apply the correction layer
    clean_text = apply_phonetic_correction(raw_text)
    print(f"  🔧 STT Post-Process: '{raw_text}' -> '{clean_text}'")
    return clean_text