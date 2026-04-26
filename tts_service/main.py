import pyttsx3
import threading

def _speak(text: str):
    """Internal TTS engine runner (thread-safe)."""
    engine = pyttsx3.init()
    rate = 150
    if text.startswith("Your ticket number is"):
        rate = 130
    engine.setProperty("rate", rate)
    engine.setProperty("volume", 1.0)
    voices = engine.getProperty("voices")
    if len(voices) > 1:
        engine.setProperty("voice", voices[1].id)
    engine.say(text)
    engine.runAndWait()
    engine.stop()

def speak(text: str):
    """
    Convert text to speech and play aloud.
    Runs in a separate thread to prevent blocking.
    """
    print(f"  🔊 TTS speaking: {text}")
    t = threading.Thread(target=_speak, args=(text,))
    t.start()
    t.join()
