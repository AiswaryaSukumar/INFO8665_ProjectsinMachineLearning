import requests
import time
import json
import os
import sys

# Ensure project root is in path so internal modules can be resolved
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# We only use STT service now to RECORD the audio locally, not to transcribe it.
from src.voice_conversion.speech_to_text.stt_service import record_audio
from src.voice_conversion.text_to_speech.tts_service import speak

BASE_URL = "http://localhost:8311/api"

def check_response(resp):
    """Check if the server returned a success status code."""
    if resp.status_code not in [200, 201]:
        print(f"❌ Server Error ({resp.status_code}): {resp.text}")
        return False
    return True

def play_audio_bytes(wav_bytes: bytes):
    import tempfile
    import wave
    import pyaudio
    
    # Writing to a temp file because some simple audio libraries struggle with pure IO bytes
    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    temp_path = temp_wav.name
    temp_wav.write(wav_bytes)
    temp_wav.close()  # MUST close manually so Windows releases the lock

    try:
        wf = wave.open(temp_path, 'rb')
        p = pyaudio.PyAudio()
        
        stream = p.open(format=p.get_format_from_width(wf.getsampwidth()),
                        channels=wf.getnchannels(),
                        rate=wf.getframerate(),
                        output=True)
                        
        data = wf.readframes(1024)
        while data:
            stream.write(data)
            data = wf.readframes(1024)
            
        stream.stop_stream()
        stream.close()
        p.terminate()
        wf.close()  # Must explicitly close the wave file handle so Windows can delete it
    except Exception as e:
        print(f"⚠️ Could not play audio: {e}")
    finally:
        os.remove(temp_path)

def run_actual_voice_simulation():
    print("\n--- Starting REAL Voice 311 Simulation (Thin Client) ---")
    
    # 1. Initialize Session
    print("\n1. Initializing Session...")
    resp = requests.post(f"{BASE_URL}/orchestrator/initialize", json={"channel": "voice", "caller_number": "555-REAL"})
    if not check_response(resp): return
    
    init_data = resp.json()
    session_id = init_data.get("session_id")
    action = init_data.get("action", {})
    context = init_data.get("context", {})
    
    print(f"✓ Session Started: {session_id}")
    
    ai_text = action.get('text')
    print(f"\n🤖 AI: {ai_text}")
    
    # Speak the first system prompt using local TTS directly just to bootstrap the conversation
    speak(ai_text)
    
    turn = 1
    current_state = context.get("current_state")
    
    while True:
        if current_state in ["SUBMITTED", "ESCALATED"]:
             break
             
        print(f"\n" + "="*50)
        print(f" TURN {turn} ")
        print("="*50)
        
        input("\n🎤 Press [ENTER] to start speaking into your microphone...")
        print("🔴 RECORDING (Speak now, will auto-stop after 2 seconds of silence)...")
        
        # 2. Record Local Audio
        audio_path = record_audio(
            session_id=session_id,
            turn=turn,
            silence_threshold=0.03, 
            silence_duration=2.0,
            start_timeout=15.0
        )
        
        if not os.path.exists(audio_path):
             print("❌ Audio recording failed or was empty. Trying again.")
             continue
             
        # 3. Stream Audio to API
        print("⏳ Uploading Audio for Inference (STT -> NLU -> Orchestrator -> TTS)...")
        with open(audio_path, "rb") as audio_f:
            files = {"audio_file": (os.path.basename(audio_path), audio_f, "audio/wav")}
            data = {"session_id": session_id, "turn": turn}
            
            resp = requests.post(f"{BASE_URL}/voice/process_audio", files=files, data=data)
            
        if not check_response(resp): break
        
        # 4. Read Response Details from Headers
        transcript = resp.headers.get("X-Transcript", "")
        response_text = resp.headers.get("X-Response-Text", "")
        current_state = resp.headers.get("X-Current-State", "")
        
        print(f"📝 Transcribed: '{transcript}'")
        print(f"🤖 AI Response: {response_text}")
        print(f"🔍 System State: {current_state}")
        
        # 5. Play Response Audio returned from server
        print("🔊 Playing server TTS audio...")
        play_audio_bytes(resp.content)
        
        # 6. Fetch and display the internal system state
        session_resp = requests.get(f"{BASE_URL}/orchestrator/session/{session_id}")
        if session_resp.status_code == 200:
            sess_info = session_resp.json()
            ctx_data = sess_info.get("context_data", {})
            entities = ctx_data.get("extracted_entities", {})
            print(f"\n--- 🧠 Current System Knowledge ---")
            print(f"   Category : {entities.get('category')}")
            print(f"   Location : {entities.get('location')}")
            print(f"   Name     : {entities.get('caller_name')}")
            print(f"   Phone    : {entities.get('phone_number')}")
            print(f"-----------------------------------\n")
        
        if current_state == "SUBMITTED":
            print("\n" + "*"*50)
            print("✅ TICKET SUBMITTED SUCCESSFULLY!")
            print("*"*50)
            break
        
        turn += 1
        time.sleep(1)

if __name__ == "__main__":
    run_actual_voice_simulation()