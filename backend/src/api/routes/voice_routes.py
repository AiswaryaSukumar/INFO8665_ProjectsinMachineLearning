from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from src.database.connection import get_db
from src.database.repositories.session_repository import SessionRepository

import os
import shutil
import tempfile

from src.api.routes.orchestrator_routes import get_orchestrator
from src.ai_orchestration.orchestrator import Orchestrator

import edge_tts

router = APIRouter()


def safe_remove_file(path: str):
    """Best-effort cleanup for temp files."""
    if not path:
        return
    if not os.path.exists(path):
        return

    try:
        os.remove(path)
    except Exception as e:
        print(f"Warning: could not delete temp file {path}: {e}")


def resolve_voice(language: str | None) -> str:
    """
    Pick a stable neural voice.
    """
    normalized = (language or "en").strip().lower()

    if normalized.startswith("fr"):
        return "fr-CA-SylvieNeural"

    return "en-CA-ClaraNeural"


async def generate_tts_audio_bytes(text: str, language: str = "en") -> bytes:
    """
    Generate MP3 audio bytes from text using edge-tts.
    """
    if not text or not text.strip():
        raise ValueError("Text for TTS cannot be empty.")

    voice = resolve_voice(language)
    rate = "-5%"

    if text.startswith("Your ticket number is"):
        rate = "-15%"

    print(f"TTS selected voice: {voice}, language={language}, rate={rate}")

    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
    )

    audio_chunks = []

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])

    if not audio_chunks:
        raise RuntimeError("No audio returned by edge-tts.")

    return b"".join(audio_chunks)


@router.post("/synthesize")
async def synthesize_text(
    text: str = Form(...),
    language: str = Form("en"),
):
    """
    Synthesizes text to speech and returns MP3 audio bytes.
    """
    try:
        tts_bytes = await generate_tts_audio_bytes(text, language=language)
        return Response(content=tts_bytes, media_type="audio/mpeg")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process_audio")
async def process_audio(
    request: Request,
    session_id: str = Form(...),
    turn: int = Form(...),
    audio_file: UploadFile = File(...),
    orchestrator: Orchestrator = Depends(get_orchestrator),
    db: Session = Depends(get_db)
):
    """
    1. Receives audio from the client.
    2. Converts it to WAV.
    3. Runs Whisper STT.
    4. Runs NLU on the transcript.
    5. Ensures the voice session exists in DB.
    6. Passes the turn to the orchestrator.
    7. Generates TTS for the response.
    8. Returns MP3 audio plus context headers.
    """
    app_state = request.app.state
    whisper_model = getattr(app_state, "whisper_model", None)
    nlu_processor = getattr(app_state, "nlu_processor", None)

    if not whisper_model or not nlu_processor:
        raise HTTPException(status_code=503, detail="ML Models are not loaded yet.")

    temp_audio_path = None
    temp_wav_path = None

    try:
        original_name = audio_file.filename or "upload.webm"
        original_ext = os.path.splitext(original_name)[1].lower().strip()
        if not original_ext:
            original_ext = ".webm"

        with tempfile.NamedTemporaryFile(delete=False, suffix=original_ext) as temp_audio:
            shutil.copyfileobj(audio_file.file, temp_audio)
            temp_audio_path = temp_audio.name

        temp_wav_path = os.path.splitext(temp_audio_path)[0] + ".wav"

        from pydub import AudioSegment

        print(f"[{session_id} Turn {turn}] Converting audio to WAV...")
        audio = AudioSegment.from_file(temp_audio_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        audio.export(temp_wav_path, format="wav")

        print(f"[{session_id} Turn {turn}] Transcribing audio...")
        result = whisper_model.transcribe(
            temp_wav_path,
            language="en",
            fp16=False,
            temperature=0.0
        )
        raw_text = result["text"].strip()

        from src.voice_conversion.speech_to_text.stt_service import apply_phonetic_correction
        transcript = apply_phonetic_correction(raw_text)
        print(f"[{session_id}] User said: '{transcript}'")

        print(f"[{session_id}] Running NLU...")
        nlu_output = nlu_processor.process(transcript, session_id=session_id)
        print(f"[{session_id}] NLU Extracted: {nlu_output}")

        session_repo = SessionRepository(db)
        existing_session = session_repo.get_session(session_id)

        if not existing_session:
            print(f"[{session_id}] No existing session found. Creating voice session...")
            existing_session = session_repo.create_session(
                session_id=session_id,
                channel="voice",
                language="en",
                caller_number=None
            )
        else:
            print(f"[{session_id}] Existing session found.")

        print(f"[{session_id}] Passing turn to orchestrator...")
        context, action = orchestrator.process_turn(session_id, transcript, nlu_output)

        response_text = action.text
        print(f"[{session_id}] System says: '{response_text}'")

        session_language = getattr(existing_session, "language", "en") or "en"
        tts_bytes = await generate_tts_audio_bytes(response_text, language=session_language)

        headers = {
            "X-Transcript": transcript.encode("utf-8", errors="ignore").decode("latin-1", errors="ignore"),
            "X-Response-Text": response_text.encode("utf-8", errors="ignore").decode("latin-1", errors="ignore"),
            "X-Current-State": str(context.current_state),
        }

        return Response(
            content=tts_bytes,
            media_type="audio/mpeg",
            headers=headers
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        try:
            await audio_file.close()
        except Exception:
            pass

        safe_remove_file(temp_audio_path)
        safe_remove_file(temp_wav_path)