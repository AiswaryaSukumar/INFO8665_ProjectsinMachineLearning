"""
Test Chat Router — text-based call simulation for local testing.
Endpoints:
  POST /api/test/start  → create session, return greeting
  POST /api/test/chat   → process one turn (NLU + Orchestrator)
  GET  /api/test/ui     → serve browser chat UI
"""

import uuid
import os
from fastapi import APIRouter, Depends, Request, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional

from datetime import datetime
from db_service.main import get_db, DBSession, SessionRepository, TicketRepository, Recording, RecordingTurn, Ticket
from orchestrator.main import ContextManager, RuleEngine, Orchestrator, generate_tts_audio_bytes, _save_system_audio, _finalize_call, CALL_TEMP_AUDIO_DIR, CALL_RECORDINGS_DIR

# In-memory store: session_id → calibrated noise threshold
_SESSION_NOISE_THRESHOLD: dict = {}

# In-memory store: session_id → full dialogue list
_SESSION_DIALOGUE: dict = {}  # { session_id: [{"role": "system"|"caller", "text": str}, ...] }

# In-memory store: session_id → current turn number
_SESSION_TURN: dict = {}  # { session_id: int }

# In-memory store: session_id → latest audio arousal features
# Populated by /upload-audio, consumed by /chat to blend with text sentiment.
_SESSION_AUDIO_FEATURES: dict = {}  # { session_id: {"arousal": float, ...} }

test_router = APIRouter()


def _make_orchestrator(db: DBSession) -> Orchestrator:
    return Orchestrator(
        ContextManager(SessionRepository(db)),
        RuleEngine(),
        TicketRepository(db),
    )


# ── Start session ──────────────────────────────────────────────────────────

@test_router.post("/start")
def start_session(db: DBSession = Depends(get_db)):
    session_id = str(uuid.uuid4())
    SessionRepository(db).create_session(session_id, "test_ui", "en", None)
    orch = _make_orchestrator(db)
    context, action = orch.initialize_session(session_id, "test_ui")

    # Start dialogue log with greeting
    _SESSION_DIALOGUE[session_id] = [{"role": "system", "text": action.text}]
    _SESSION_TURN[session_id] = 1

    # Save greeting TTS audio as turn 0 system audio
    try:
        tts_bytes = generate_tts_audio_bytes(action.text)
        _save_system_audio(session_id, 0, tts_bytes)
    except Exception as e:
        print(f"  ⚠️  TTS save failed for greeting: {e}")

    return {
        "session_id": session_id,
        "response":   action.text,
        "state":      str(context.current_state),
    }


# ── Ambient noise calibration ─────────────────────────────────────────────

class CalibrateRequest(BaseModel):
    session_id: str
    noise_rms: float          # measured by browser Web Audio API
    margin: Optional[float] = 1.8  # threshold = noise_rms × margin

@test_router.post("/calibrate")
def calibrate(req: CalibrateRequest):
    """Store browser-measured ambient noise threshold for a session."""
    threshold = round(req.noise_rms * req.margin, 6)
    # Clamp: never go below 0.01 (too quiet = false triggers) or above 0.3
    threshold = max(0.01, min(0.30, threshold))
    _SESSION_NOISE_THRESHOLD[req.session_id] = threshold
    print(f"  🔇 Session {req.session_id[:8]} calibrated — noise_rms={req.noise_rms:.5f}, threshold={threshold:.5f}")
    return {
        "session_id": req.session_id,
        "noise_rms":  round(req.noise_rms, 5),
        "threshold":  threshold,
    }


# ── Upload session audio ──────────────────────────────────────────────────

_AUDIO_UPLOAD_DIR = str(CALL_RECORDINGS_DIR)

@test_router.post("/upload-audio")
async def upload_audio(
    session_id: str = Form(...),
    ticket_id:  str = Form(...),
    turn:       int = Form(...),
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
):
    """Receive a per-turn caller audio blob, save as turn_XXX_caller.wav,
    then merge all caller+system turns into a single recording."""
    import io
    try:
        import soundfile as sf
        import numpy as np
    except ImportError:
        return {"error": "soundfile not available"}

    session_dir = os.path.join(str(CALL_TEMP_AUDIO_DIR), session_id)
    os.makedirs(session_dir, exist_ok=True)

    # Save caller audio for this turn (WebM/Opus → PCM WAV via pydub)
    content = await file.read()
    caller_path = os.path.join(session_dir, f"turn_{turn:03d}_caller.wav")
    try:
        from pydub import AudioSegment
        import tempfile, io as _io
        # Write raw WebM to a temp file so pydub can decode it
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        seg = AudioSegment.from_file(tmp_path)
        os.remove(tmp_path)
        seg = seg.set_channels(1).set_frame_rate(16000)
        seg.export(caller_path, format="wav")
        # Re-read as float32 numpy for downstream processing
        audio_data, sr = sf.read(caller_path, dtype="float32")
    except Exception as e:
        print(f"  ⚠️  Caller audio decode failed turn {turn}: {e}")
        # Last resort: save raw bytes (won't merge properly but at least logged)
        with open(caller_path, "wb") as f:
            f.write(content)

    # ── Audio-based arousal analysis (librosa) ────────────────────────────
    # Runs on the caller WAV after it's saved.  Result is stored per-session
    # and blended with text sentiment in /chat.
    try:
        from nlp_service.model.models.audio_sentiment import analyze_audio
        audio_feat = analyze_audio(caller_path)
        if audio_feat:
            # Accumulate peak arousal across turns (most intense turn wins)
            prev = _SESSION_AUDIO_FEATURES.get(session_id, {})
            if audio_feat["arousal"] >= prev.get("arousal", 0.0):
                _SESSION_AUDIO_FEATURES[session_id] = audio_feat
            print(f"  🎙️  Audio arousal turn {turn}: {audio_feat['arousal']:.3f} "
                  f"(rms={audio_feat['rms_mean']:.4f}, f0_std={audio_feat['f0_std']:.1f}Hz)")
    except Exception as e:
        print(f"  ⚠️  Audio sentiment analysis failed: {e}")

    # Only run the final merge when we have a real ticket_id.
    # Intermediate calls (ticket_id="pending") just save the caller audio and return.
    # This prevents _SESSION_TURN from being popped mid-session and turn files from
    # being overwritten before all turns are complete.
    if ticket_id == "pending":
        return {"path": "", "filename": ""}

    # ── Final merge: scan session_dir for all turn files in order ─────────
    import re as _re
    merged_chunks = []
    TARGET_SR = 16000

    def _read_wav(path):
        """Read a WAV file and return (float32 numpy array, sample_rate).
        Returns None on failure."""
        try:
            a, sr = sf.read(path, dtype="float32")
            if a.ndim > 1:
                a = a.mean(axis=1)
            # Resample to TARGET_SR if needed
            if sr != TARGET_SR:
                new_len = int(len(a) * TARGET_SR / sr)
                a = np.interp(
                    np.linspace(0, len(a) - 1, new_len),
                    np.arange(len(a)),
                    a,
                ).astype(np.float32)
            return a
        except Exception:
            return None

    # Greeting (turn 0 system)
    p = os.path.join(session_dir, "turn_000_system.wav")
    if os.path.exists(p):
        a = _read_wav(p)
        if a is not None:
            merged_chunks.append(a)
            merged_chunks.append(np.zeros(int(TARGET_SR * 0.3), dtype="float32"))

    # Discover the highest turn number from existing files
    turn_nums = set()
    for fname in os.listdir(session_dir):
        m = _re.match(r"turn_(\d+)_(caller|system)\.wav", fname)
        if m:
            turn_nums.add(int(m.group(1)))

    for t in sorted(n for n in turn_nums if n >= 1):
        for role in ("caller", "system"):
            fp = os.path.join(session_dir, f"turn_{t:03d}_{role}.wav")
            if not os.path.exists(fp):
                continue
            a = _read_wav(fp)
            if a is None or len(a) == 0:
                continue
            merged_chunks.append(a)
            gap = 0.2 if role == "caller" else 0.4
            merged_chunks.append(np.zeros(int(TARGET_SR * gap), dtype="float32"))
        print(f"  🔀 Merged turn {t} (caller+system)")

    if not merged_chunks:
        return {"path": "", "filename": ""}

    os.makedirs(_AUDIO_UPLOAD_DIR, exist_ok=True)
    merged = np.concatenate(merged_chunks)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_filename = f"webchat_{session_id[:8]}_{ticket_id}_{timestamp}.wav"
    out_path = os.path.join(_AUDIO_UPLOAD_DIR, out_filename)
    sf.write(out_path, merged, TARGET_SR, subtype="PCM_16")

    # Update recordings table + tickets.recording_url
    recording_api_url = f"/api/voice/recording/{out_filename}"
    try:
        rec = db.query(Recording).filter(Recording.ticket_id == ticket_id).first()
        if rec:
            rec.merged_audio_path = out_path
        ticket_row = db.query(Ticket).filter(Ticket.ticket_id == ticket_id).first()
        if ticket_row:
            ticket_row.recording_url = recording_api_url
        db.commit()
        print(f"  ✅ Merged audio saved: {out_path} ({len(merged)/TARGET_SR:.1f}s)")
    except Exception as e:
        print(f"  ⚠️  Failed to update recording path: {e}")

    # Clean up turn counter only after successful final merge
    _SESSION_TURN.pop(session_id, None)

    return {"path": out_path, "filename": out_filename}


# ── Process one turn ───────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    text: str


@test_router.post("/chat")
def chat(req: ChatRequest, request: Request, db: DBSession = Depends(get_db)):
    nlu = getattr(request.app.state, "nlu_processor", None)
    if not nlu:
        raise HTTPException(status_code=503, detail="NLU processor not ready")

    nlu_output = nlu.process(req.text, req.session_id)

    # ── Blend audio arousal with text-based NLP sentiment ────────────────
    # The upload-audio endpoint stores peak arousal in _SESSION_AUDIO_FEATURES.
    # Here we adjust ml_negative and severity_score before passing to the
    # orchestrator so that tone/severity reflect vocal energy, not just words.
    audio_feat = _SESSION_AUDIO_FEATURES.get(req.session_id)
    if audio_feat:
        from nlp_service.model.models.ml_sentiment_model import negative_score_to_urgency
        audio_arousal = audio_feat["arousal"]
        text_neg = float(nlu_output.get("ml_negative") or 0.0)

        # 65% text + 35% audio — text is more reliable for civic complaints,
        # audio fills the gap when the speaker is clearly agitated but polite.
        blended_neg = min(1.0, text_neg * 0.65 + audio_arousal * 0.35)
        nlu_output["ml_negative"] = round(blended_neg, 4)

        # Recompute severity so urgency_level/score reflect the blended signal
        _, blended_urgency_score = negative_score_to_urgency(blended_neg)
        nlu_output["severity_score"] = round(blended_urgency_score, 2)

        # Upgrade label from NEUTRAL → NEGATIVE if blended score crosses 0.35
        if blended_neg >= 0.35 and nlu_output.get("sentiment_label") == "NEUTRAL":
            nlu_output["sentiment_label"] = "NEGATIVE"

        print(f"  📊 Sentiment blend — text: {text_neg:.3f}, audio: {audio_arousal:.3f} "
              f"→ blended: {blended_neg:.3f}")

    orch            = _make_orchestrator(db)
    context, action = orch.process_turn(req.session_id, req.text, nlu_output)

    # Track turn number
    turn = _SESSION_TURN.get(req.session_id, 1)
    _SESSION_TURN[req.session_id] = turn + 1

    # Save TTS audio for this turn
    try:
        tts_bytes = generate_tts_audio_bytes(action.text)
        _save_system_audio(req.session_id, turn, tts_bytes)
    except Exception as e:
        print(f"  ⚠️  TTS save failed turn {turn}: {e}")

    # Accumulate dialogue
    dialogue = _SESSION_DIALOGUE.setdefault(req.session_id, [])
    dialogue.append({"role": "caller", "text": req.text, "turn": turn})
    dialogue.append({"role": "system",  "text": action.text, "turn": turn})

    # On ticket creation, save full transcript + recording tables to DB
    if action.ticket_id:
        transcript_lines = []
        for entry in dialogue:
            role = "[CALLER]" if entry["role"] == "caller" else "[ISA]"
            transcript_lines.append(f"{role} {entry['text']}")
        transcript_text = "\n".join(transcript_lines)
        try:
            TicketRepository(db).update_ticket_fields(action.ticket_id, {
                "transcript": transcript_text
            })

            # recordings row
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            recording_id = f"REC-{req.session_id[:8]}-{timestamp}"
            rec = Recording(
                recording_id=recording_id,
                session_id=req.session_id,
                ticket_id=action.ticket_id,
                merged_audio_path="",  # no audio in test chat
            )
            db.add(rec)
            db.commit()

            # recording_turns rows
            caller_turns = [(i, e) for i, e in enumerate(dialogue) if e["role"] == "caller"]
            system_turns = {i: e["text"] for i, e in enumerate(dialogue) if e["role"] == "system"}
            for idx, (di, entry) in enumerate(caller_turns):
                # pair each caller turn with the system response that follows it (di+1)
                tts_q = system_turns.get(di + 1, "")
                rt = RecordingTurn(
                    recording_id=recording_id,
                    session_id=req.session_id,
                    turn=idx + 1,
                    transcript=entry["text"],
                    stt_audio_file_path="",  # no audio in test chat
                    tts_question=tts_q,
                )
                db.add(rt)
            db.commit()
            print(f"  ✅ recordings + recording_turns saved (recording_id={recording_id})")
        except Exception as e:
            print(f"  ⚠️  Failed to save transcript for {action.ticket_id}: {e}")
        _SESSION_DIALOGUE.pop(req.session_id, None)       # free memory
        _SESSION_AUDIO_FEATURES.pop(req.session_id, None)  # free audio features

    return {
        "response":          action.text,
        "state":             str(context.current_state),
        "action_type":       action.action_type,
        "ticket_id":         action.ticket_id,
        "turn":              turn,
        "entities":          context.extracted_entities,
        "confidence_scores": context.confidence_scores,
        # Dev-mode fields: per-turn sentiment/emotion signal
        "ml_negative":       round(float(nlu_output.get("ml_negative") or 0.0), 4),
        "sentiment_label":   nlu_output.get("sentiment_label", "NEUTRAL"),
        "severity_score":    round(float(nlu_output.get("severity_score") or 0.0), 2),
        "urgency_level":     nlu_output.get("urgency_level", "low"),
    }


# ── Browser UI ─────────────────────────────────────────────────────────────

@test_router.get("/ui", response_class=HTMLResponse)
def test_ui():
    return HTMLResponse(content=_HTML)


_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>INSIGHT-311 Call Test</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f0f2f5;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  #app {
    width: 480px;
    height: 92vh;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  #header {
    background: #1a73e8;
    color: #fff;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  #header .icon { font-size: 24px; }
  #header h1 { font-size: 16px; font-weight: 600; }
  #header p  { font-size: 11px; opacity: 0.85; margin-top: 2px; }
  #status-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: #fbbc04;
    margin-left: auto;
    flex-shrink: 0;
  }
  #status-dot.connected { background: #34a853; }

  /* State badge */
  #state-bar {
    background: #e8f0fe;
    color: #1a73e8;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 16px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  /* Chat area */
  #chat {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bubble-wrap {
    display: flex;
    flex-direction: column;
  }
  .bubble-wrap.user  { align-items: flex-end; }
  .bubble-wrap.agent { align-items: flex-start; }

  .bubble {
    max-width: 78%;
    padding: 10px 14px;
    border-radius: 18px;
    font-size: 14px;
    line-height: 1.45;
    word-break: break-word;
  }
  .bubble.user  { background: #1a73e8; color: #fff; border-bottom-right-radius: 4px; }
  .bubble.agent { background: #f1f3f4; color: #202124; border-bottom-left-radius: 4px; }

  .meta {
    font-size: 10px;
    color: #9aa0a6;
    margin-top: 3px;
    padding: 0 4px;
  }

  /* Confidence pill */
  .conf-pill {
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
    padding: 0 4px;
  }
  .pill {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 10px;
    background: #e8f0fe;
    color: #1a73e8;
    font-weight: 600;
  }
  .pill.low { background: #fce8e6; color: #c5221f; }
  .pill.mid { background: #fef7e0; color: #a37400; }

  /* Entity card */
  .entity-card {
    font-size: 11px;
    background: #f8f9fa;
    border: 1px solid #e8eaed;
    border-radius: 8px;
    padding: 8px 10px;
    margin-top: 4px;
    color: #5f6368;
    line-height: 1.6;
  }
  .entity-card b { color: #202124; }

  /* Alert banners */
  .alert-banner {
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 8px;
    margin-top: 4px;
    font-weight: 500;
  }
  .alert-banner.low-conf { background: #fce8e6; color: #c5221f; }
  .alert-banner.sentiment { background: #fef7e0; color: #a37400; }

  /* Input area */
  #input-area {
    padding: 12px 16px;
    border-top: 1px solid #e8eaed;
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  #msg {
    flex: 1;
    resize: none;
    border: 1px solid #dadce0;
    border-radius: 22px;
    padding: 10px 16px;
    font-size: 14px;
    outline: none;
    max-height: 120px;
    line-height: 1.4;
    font-family: inherit;
    transition: border-color 0.2s;
  }
  #msg:focus { border-color: #1a73e8; }
  #msg:disabled { background: #f8f9fa; }

  #send-btn {
    width: 42px; height: 42px;
    border-radius: 50%;
    background: #1a73e8;
    border: none;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s;
  }
  #send-btn:hover  { background: #1557b0; }
  #send-btn:disabled { background: #9aa0a6; cursor: default; }
  #send-btn svg { width: 18px; height: 18px; fill: #fff; }

  /* Mic button */
  #mic-btn {
    width: 42px; height: 42px;
    border-radius: 50%;
    background: #f1f3f4;
    border: 1px solid #dadce0;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s, border-color 0.2s;
  }
  #mic-btn:hover { background: #e8eaed; }
  #mic-btn:disabled { opacity: 0.4; cursor: default; }
  #mic-btn svg { width: 18px; height: 18px; fill: #5f6368; }
  #mic-btn.listening {
    background: #fce8e6;
    border-color: #c5221f;
    animation: pulse 1s infinite;
  }
  #mic-btn.listening svg { fill: #c5221f; }
  @keyframes pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(197,34,31,0.3); }
    50%      { box-shadow: 0 0 0 6px rgba(197,34,31,0); }
  }

  /* New call button */
  #new-btn {
    width: 100%;
    padding: 10px;
    background: #f1f3f4;
    border: none;
    border-top: 1px solid #e8eaed;
    font-size: 13px;
    color: #5f6368;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.2s;
  }
  #new-btn:hover { background: #e8eaed; }

  /* Calibration bar */
  #calib-bar {
    display: none;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: #fff8e1;
    border-bottom: 1px solid #ffe082;
    font-size: 12px;
    color: #795548;
  }
  #calib-bar.visible { display: flex; }
  #calib-progress-wrap {
    flex: 1;
    height: 6px;
    background: #ffe082;
    border-radius: 3px;
    overflow: hidden;
  }
  #calib-progress {
    height: 100%;
    width: 0%;
    background: #fb8c00;
    border-radius: 3px;
    transition: width 0.1s linear;
  }
  #calib-result {
    font-size: 11px;
    color: #5f6368;
    padding: 4px 16px 6px;
    background: #f8f9fa;
    border-bottom: 1px solid #e8eaed;
    display: none;
  }
  #calib-result.visible { display: block; }

  /* Typing indicator */
  .typing {
    display: flex; align-items: center; gap: 4px;
    padding: 10px 14px;
    background: #f1f3f4;
    border-radius: 18px;
    border-bottom-left-radius: 4px;
    width: fit-content;
  }
  .typing span {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #9aa0a6;
    animation: bounce 1.2s infinite;
  }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%,60%,100% { transform: translateY(0); }
    30% { transform: translateY(-5px); }
  }
</style>
</head>
<body>
<div id="app">
  <div id="header">
    <div class="icon">📞</div>
    <div>
      <h1>INSIGHT-311 Call Test</h1>
      <p id="session-label">Initializing...</p>
    </div>
    <div id="status-dot"></div>
  </div>
  <div id="state-bar">State: INITIALIZING</div>
  <div id="calib-bar">
    <span id="calib-label">🔇 Measuring ambient noise...</span>
    <div id="calib-progress-wrap"><div id="calib-progress"></div></div>
    <span id="calib-timer">1.5s</span>
  </div>
  <div id="calib-result"></div>
  <div id="chat"></div>
  <div id="input-area">
    <textarea id="msg" rows="1" placeholder="Type your message..." disabled></textarea>
    <button id="mic-btn" disabled title="Voice input">
      <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93H2c0 4.72 3.56 8.63 8 9.46V20h4v-2.61c4.44-.83 8-4.74 8-9.46h-2c0 4.08-3.06 7.44-7 7.93V15h-2z"/></svg>
    </button>
    <button id="send-btn" disabled>
      <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
    </button>
  </div>
  <button id="new-btn">+ New Call</button>
</div>

<script>
const API = 'http://localhost:8311/api/test';
let sessionId    = null;
let callEnded    = false;
let noiseFloor   = 0.0;   // measured ambient RMS
let noiseThresh  = 0.0;   // threshold = noiseFloor × 1.8 (set by server)

const chat       = document.getElementById('chat');
const msgInput   = document.getElementById('msg');
const sendBtn    = document.getElementById('send-btn');
const micBtn     = document.getElementById('mic-btn');
const stateBar   = document.getElementById('state-bar');
const statusDot  = document.getElementById('status-dot');
const sessionLbl = document.getElementById('session-label');
const newBtn     = document.getElementById('new-btn');
const calibBar   = document.getElementById('calib-bar');
const calibProg  = document.getElementById('calib-progress');
const calibTimer = document.getElementById('calib-timer');
const calibLabel = document.getElementById('calib-label');
const calibResult= document.getElementById('calib-result');

// ── Auto-resize textarea ──────────────────────────────────────────────────
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
});

// ── Send on Enter (Shift+Enter = newline) ─────────────────────────────────
msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);
newBtn.addEventListener('click', startSession);

// ── Helpers ───────────────────────────────────────────────────────────────
function scrollBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function addBubble(text, role, meta = '') {
  const wrap = document.createElement('div');
  wrap.className = `bubble-wrap ${role}`;

  const bub = document.createElement('div');
  bub.className = `bubble ${role}`;
  bub.textContent = text;
  wrap.appendChild(bub);

  if (meta) {
    const m = document.createElement('div');
    m.className = 'meta';
    m.textContent = meta;
    wrap.appendChild(m);
  }

  chat.appendChild(wrap);
  scrollBottom();
  return wrap;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap agent';
  wrap.id = 'typing-indicator';
  wrap.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  chat.appendChild(wrap);
  scrollBottom();
}

function removeTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

function addAgentResponse(data) {
  removeTyping();
  const wrap = addBubble(data.response, 'agent');

  // Confidence pills
  const scores = data.confidence_scores || {};
  if (Object.keys(scores).length > 0) {
    const pillRow = document.createElement('div');
    pillRow.className = 'conf-pill';
    const fields = ['category','location','caller_name','phone_number','overall'];
    fields.forEach(f => {
      if (scores[f] === undefined) return;
      const v = scores[f];
      const cls = v < 0.50 ? 'low' : v < 0.70 ? 'mid' : '';
      const pill = document.createElement('span');
      pill.className = `pill ${cls}`;
      pill.textContent = `${f.replace('_',' ')}: ${(v*100).toFixed(0)}%`;
      pillRow.appendChild(pill);
    });
    wrap.appendChild(pillRow);
  }

  // Entity card
  const ent = data.entities || {};
  const entKeys = ['category','location','caller_name','phone_number'].filter(k => ent[k]);
  if (entKeys.length > 0) {
    const card = document.createElement('div');
    card.className = 'entity-card';
    card.innerHTML = entKeys.map(k =>
      `<b>${k.replace('_',' ')}:</b> ${ent[k]}`
    ).join('<br>');
    wrap.appendChild(card);
  }

  // Ticket ID
  if (data.ticket_id) {
    const banner = document.createElement('div');
    banner.className = 'alert-banner low-conf';
    banner.style.background = '#e6f4ea';
    banner.style.color = '#137333';
    banner.textContent = `Ticket created: ${data.ticket_id}`;
    wrap.appendChild(banner);
  }

  scrollBottom();
}

function setInputEnabled(enabled) {
  msgInput.disabled = !enabled;
  sendBtn.disabled  = !enabled;
  micBtn.disabled   = !enabled;
  if (enabled) msgInput.focus();
}

// ── Voice input (Web Speech API + Web Audio noise gate) ───────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition   = null;
let isListening   = false;

// Web Audio monitor — runs in parallel with Web Speech API
let audioCtx      = null;
let audioStream   = null;
let audioAnalyser = null;
let rmsSamples    = [];    // RMS values collected during this recording session
let rmsMonitorId  = null;

function startRmsMonitor() {
  rmsSamples = [];
  if (!audioCtx || audioCtx.state === 'closed') return;
  const buf = new Float32Array(audioAnalyser.fftSize);
  rmsMonitorId = setInterval(() => {
    audioAnalyser.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
    rmsSamples.push(rms);
  }, 80);
}

function stopRmsMonitor() {
  if (rmsMonitorId) { clearInterval(rmsMonitorId); rmsMonitorId = null; }
}

function avgRms() {
  if (!rmsSamples.length) return 0;
  return rmsSamples.reduce((a, b) => a + b, 0) / rmsSamples.length;
}

async function ensureAudioMonitor() {
  if (audioCtx && audioCtx.state !== 'closed') return;
  try {
    audioStream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx      = new AudioContext();
    const source  = audioCtx.createMediaStreamSource(audioStream);
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 256;
    source.connect(audioAnalyser);
  } catch (e) {
    console.warn('Audio monitor init failed:', e);
  }
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    msgInput.placeholder = 'Listening...';
    startRmsMonitor();
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map(r => r[0].transcript)
      .join('');
    msgInput.value = transcript;
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('listening');
    msgInput.placeholder = 'Type your message...';
    stopRmsMonitor();

    const text    = msgInput.value.trim();
    const voiceRms = avgRms();

    // ── Noise gate check ──────────────────────────────────────────────
    // If calibration was done, require voice RMS to be clearly above noise floor.
    // "clearly above" = at least noiseThresh (= noiseFloor × 1.8)
    if (noiseThresh > 0 && voiceRms < noiseThresh) {
      // Audio level didn't exceed noise floor → discard as background noise
      msgInput.value = '';
      msgInput.placeholder = `Too quiet (${voiceRms.toFixed(4)} < ${noiseThresh.toFixed(4)}) — speak louder`;
      setTimeout(() => { msgInput.placeholder = 'Type your message...'; }, 2500);
      return;
    }

    if (text) sendMessage();
  };

  recognition.onerror = (e) => {
    isListening = false;
    micBtn.classList.remove('listening');
    msgInput.placeholder = 'Type your message...';
    stopRmsMonitor();
    if (e.error !== 'no-speech') {
      addBubble(`Voice error: ${e.error}`, 'agent');
    }
  };

  micBtn.addEventListener('click', async () => {
    if (isListening) {
      recognition.stop();
    } else {
      await ensureAudioMonitor();
      recognition.start();
    }
  });
} else {
  // Browser doesn't support Web Speech API
  micBtn.title = 'Voice input not supported in this browser (use Chrome/Edge)';
  micBtn.style.opacity = '0.3';
  micBtn.disabled = true;
}

function updateState(state) {
  stateBar.textContent = `State: ${state}`;
  const ended = ['SUBMITTED','ESCALATED'].includes(state);
  if (ended) {
    stateBar.style.background = state === 'SUBMITTED' ? '#e6f4ea' : '#fce8e6';
    stateBar.style.color      = state === 'SUBMITTED' ? '#137333' : '#c5221f';
    setInputEnabled(false);
    callEnded = true;
  }
}

// ── Ambient noise calibration (Web Audio API) ─────────────────────────────
async function measureAmbientNoise(durationMs = 1500) {
  try {
    const stream  = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx     = new AudioContext();
    const source  = ctx.createMediaStreamSource(stream);
    const analyser= ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const buf = new Float32Array(analyser.fftSize);
    const samples = [];
    const interval = 100; // sample every 100ms
    const steps = durationMs / interval;
    let elapsed = 0;

    // Show progress bar
    calibBar.classList.add('visible');
    calibResult.classList.remove('visible');

    await new Promise(resolve => {
      const tick = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
        samples.push(rms);
        elapsed++;
        const pct = Math.min(100, (elapsed / steps) * 100);
        calibProg.style.width = pct + '%';
        const remaining = ((durationMs - elapsed * interval) / 1000).toFixed(1);
        calibTimer.textContent = remaining + 's';
        if (elapsed >= steps) { clearInterval(tick); resolve(); }
      }, interval);
    });

    // Clean up audio context
    stream.getTracks().forEach(t => t.stop());
    ctx.close();

    const avgRms = samples.reduce((a, b) => a + b, 0) / samples.length;
    calibBar.classList.remove('visible');
    return avgRms;
  } catch (e) {
    calibBar.classList.remove('visible');
    console.warn('Calibration failed (mic permission denied?):', e);
    return 0.0;
  }
}

// ── API calls ─────────────────────────────────────────────────────────────
async function startSession() {
  chat.innerHTML = '';
  callEnded = false;
  sessionId = null;
  noiseFloor = 0.0;
  noiseThresh = 0.0;
  setInputEnabled(false);
  statusDot.classList.remove('connected');
  stateBar.textContent = 'State: INITIALIZING';
  stateBar.style.background = '';
  stateBar.style.color = '';
  sessionLbl.textContent = 'Calibrating...';
  calibResult.classList.remove('visible');

  // ── 1. Measure ambient noise ──────────────────────────────────────────
  calibLabel.textContent = '🔇 Measuring ambient noise...';
  calibProg.style.width  = '0%';
  calibTimer.textContent = '1.5s';
  noiseFloor = await measureAmbientNoise(1500);

  // ── 2. Start session ──────────────────────────────────────────────────
  sessionLbl.textContent = 'Connecting...';
  addTyping();
  try {
    const res  = await fetch(`${API}/start`, { method: 'POST' });
    const data = await res.json();
    removeTyping();

    sessionId = data.session_id;
    sessionLbl.textContent = `Session: ${sessionId.slice(0,8)}...`;
    statusDot.classList.add('connected');
    updateState(data.state);

    // ── 3. Send calibration result to backend ─────────────────────────
    if (noiseFloor > 0 && sessionId) {
      try {
        const cRes = await fetch(`${API}/calibrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, noise_rms: noiseFloor }),
        });
        const cData = await cRes.json();
        noiseThresh = cData.threshold || 0.0;

        // Show calibration result banner
        const level = noiseFloor < 0.005 ? '🟢 Quiet'
                    : noiseFloor < 0.02  ? '🟡 Moderate'
                    : '🔴 Noisy';
        calibResult.textContent =
          `Ambient: ${level}  |  noise RMS: ${noiseFloor.toFixed(4)}  |  voice threshold: ${noiseThresh.toFixed(4)}`;
        calibResult.classList.add('visible');
      } catch (_) { /* calibration send failed, continue anyway */ }
    }

    addBubble(data.response, 'agent');
    setInputEnabled(true);
  } catch (e) {
    removeTyping();
    addBubble('Failed to connect to server. Is the server running at localhost:8311?', 'agent');
    sessionLbl.textContent = 'Connection failed';
  }
}

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !sessionId || callEnded) return;

  addBubble(text, 'user');
  msgInput.value = '';
  msgInput.style.height = 'auto';
  setInputEnabled(false);
  addTyping();

  try {
    const res  = await fetch(`${API}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ session_id: sessionId, text }),
    });
    const data = await res.json();

    updateState(data.state);
    addAgentResponse(data);
  } catch (e) {
    removeTyping();
    addBubble('Server error. Check the terminal for details.', 'agent');
  }

  if (!callEnded) setInputEnabled(true);
}

// ── Boot ──────────────────────────────────────────────────────────────────
startSession();
</script>
</body>
</html>
"""
