// src/components/VoiceAssistantModal.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import voiceBot from "../assets/voicebot.png";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").trim();

// ── TTS ───────────────────────────────────────────────────────────────────
const PREFERRED_VOICES = [
  "Samantha",           // iOS default US English
  "Google US English",  // Chrome on Windows/Android
  "Microsoft Zira",     // Windows Edge/IE
  "Microsoft Jenny",    // Windows newer
  "Karen",              // macOS/iOS Australian (fallback)
];

function getPreferredVoice() {
  const voices = window.speechSynthesis.getVoices();
  for (const name of PREFERRED_VOICES) {
    const match = voices.find(v => v.name === name);
    if (match) return match;
  }
  return voices.find(v => v.lang.startsWith("en-US")) || null;
}

function speak(text, onEndCallback) {
  if (!window.speechSynthesis) { onEndCallback?.(); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "en-US"; utt.rate = 1.0; utt.pitch = 1.0;
  const voice = getPreferredVoice();
  if (voice) utt.voice = voice;
  if (onEndCallback) utt.onend = onEndCallback;
  window.speechSynthesis.speak(utt);
}
function stopSpeaking() { window.speechSynthesis?.cancel(); }

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

// ── Dev-mode per-turn metadata card ──────────────────────────────────────
function DevMetaCard({ meta }) {
  if (!meta) return null;
  const { confidence_scores = {}, ml_negative = 0, sentiment_label = "", urgency_level = "", severity_score = 0 } = meta;

  const confEntries = Object.entries(confidence_scores).filter(([k]) => k !== "overall");
  const overall = confidence_scores.overall ?? null;

  const sentColor = sentiment_label === "NEGATIVE" ? "#ef4444"
    : sentiment_label === "POSITIVE" ? "#22c55e" : "#94a3b8";
  const urgColor = urgency_level === "critical" ? "#ef4444"
    : urgency_level === "high" ? "#f97316"
    : urgency_level === "medium" ? "#eab308" : "#22c55e";

  return (
    <div style={{
      marginTop: 4, marginLeft: 40, maxWidth: "78%",
      background: "#0f172a", borderRadius: 10,
      padding: "8px 12px", fontSize: 11, color: "#e2e8f0",
      fontFamily: "monospace",
    }}>
      {/* Confidence scores */}
      {confEntries.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ color: "#64748b", marginBottom: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Confidence</div>
          {confEntries.map(([k, v]) => {
            const pct = Math.round((v ?? 0) * 100);
            const barColor = pct >= 80 ? "#22c55e" : pct >= 60 ? "#eab308" : "#ef4444";
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ width: 72, color: "#94a3b8", flexShrink: 0 }}>{k}</span>
                <div style={{ flex: 1, background: "#1e293b", borderRadius: 4, height: 6 }}>
                  <div style={{ width: `${pct}%`, background: barColor, height: 6, borderRadius: 4, transition: "width 0.4s" }} />
                </div>
                <span style={{ width: 32, textAlign: "right", color: barColor }}>{pct}%</span>
              </div>
            );
          })}
          {overall !== null && (
            <div style={{ color: "#64748b", fontSize: 10, marginTop: 3 }}>
              overall: <span style={{ color: "#e2e8f0" }}>{Math.round(overall * 100)}%</span>
            </div>
          )}
        </div>
      )}

      {/* Sentiment / urgency */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", borderTop: "1px solid #1e293b", paddingTop: 6 }}>
        <span>sentiment <span style={{ color: sentColor, fontWeight: 700 }}>{sentiment_label || "—"}</span></span>
        <span>neg <span style={{ color: sentColor }}>{(ml_negative * 100).toFixed(1)}%</span></span>
        <span>urgency <span style={{ color: urgColor, fontWeight: 700 }}>{urgency_level || "—"}</span></span>
        <span>severity <span style={{ color: urgColor }}>{(severity_score * 100).toFixed(0)}%</span></span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function VoiceAssistantModal({ open, onClose, label = "Talk to ISA" }) {
  const [devMode, setDevMode]           = useState(false);
  const [sessionId, setSessionId]       = useState(null);
  const [callState, setCallState]       = useState("IDLE");
  const [botState, setBotState]         = useState("");
  const [ticketId, setTicketId]         = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [messages, setMessages]         = useState([]);
  const [botTyping, setBotTyping]       = useState(false);
  const [textInput, setTextInput]       = useState("");
  const [sending, setSending]           = useState(false);
  const [listening, setListening]       = useState(false);
  const [liveText, setLiveText]         = useState("");
  const [micError, setMicError]         = useState("");
  const [noiseLevel, setNoiseLevel]     = useState(null); // dev only

  const bottomRef       = useRef(null);
  const inputRef        = useRef(null);
  const recRef          = useRef(null);
  const mediaRecRef     = useRef(null);
  const audioChunksRef  = useRef([]);
  const silenceTimerRef = useRef(null);
  const finalAccumRef   = useRef("");
  const noiseThreshRef  = useRef(0.0);
  const audioCtxRef     = useRef(null);
  const analyserRef     = useRef(null);
  const audioStreamRef  = useRef(null);
  const currentTurnRef  = useRef(1);
  const sessionIdRef    = useRef(null);
  const ticketIdRef     = useRef(null);
  const callStateRef    = useRef("IDLE");
  const liveTextRef     = useRef("");
  const isSendingRef    = useRef(false);
  const SILENCE_MS = 2500;

  const busy   = botTyping || sending;
  const isDone = callState === "DONE";
  callStateRef.current = callState;

  const setLiveTextSynced = (val) => {
    const next = typeof val === "function" ? val(liveTextRef.current) : val;
    liveTextRef.current = next;
    setLiveText(next);
  };

  // Reset on open
  useEffect(() => {
    if (!open) return;
    stopSpeaking();
    setSessionId(null); setCallState("IDLE"); setBotState("");
    setTicketId(""); setMessages([]); setTextInput("");
    setLiveText(""); setMicError(""); setListening(false);
    setNoiseLevel(null);
    audioChunksRef.current = []; mediaRecRef.current = null;
    noiseThreshRef.current = 0.0;
  }, [open]);

  // ── Ambient noise calibration ─────────────────────────────────────────
  async function measureAmbientNoise(durationMs = 1500) {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx      = new AudioContext();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioStreamRef.current = stream;
      audioCtxRef.current    = ctx;
      analyserRef.current    = analyser;

      const buf = new Float32Array(analyser.fftSize);
      const samples = [];
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          samples.push(rms);
        }, 100);
        setTimeout(() => { clearInterval(interval); resolve(); }, durationMs);
      });
      return samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    } catch { return 0; }
  }

  function startTurnRecorder(stream) {
    if (!stream) return;
    const mr = new MediaRecorder(stream);
    audioChunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    mr.start(100);
    mediaRecRef.current = mr;
  }

  function stopTurnRecorderAndUpload(turn) {
    const mr = mediaRecRef.current;
    if (!mr || mr.state === "inactive") return;
    mediaRecRef.current = null;
    mr.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || "audio/webm" });
      audioChunksRef.current = [];
      if (blob.size > 0 && sessionIdRef.current) {
        const form = new FormData();
        form.append("session_id", sessionIdRef.current);
        form.append("ticket_id", ticketIdRef.current || "pending");
        form.append("turn", String(turn));
        form.append("file", blob, `turn_${String(turn).padStart(3,"0")}_caller.webm`);
        fetch(`${API_BASE}/test/upload-audio`, { method: "POST", body: form }).catch(() => {});
      }
    };
    mr.stop();
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, botTyping, liveText]);
  useEffect(() => { if (callState === "ACTIVE") setTimeout(() => inputRef.current?.focus(), 150); }, [callState]);

  // ── Start call ────────────────────────────────────────────────────────
  async function startCall() {
    // iOS Safari blocks speechSynthesis after any await — unlock it synchronously first
    if (window.speechSynthesis) {
      const unlock = new SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(unlock);
    }
    setCallState("ACTIVE");
    setBotTyping(true);
    try {
      // Noise calibration — show message only in dev mode
      if (devMode) addBotMessage("🔇 Measuring ambient noise… please stay quiet for a moment.");
      const noiseFloor = await measureAmbientNoise(1500);

      const res = await fetch(`${API_BASE}/test/start`, { method: "POST" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const sid = data.session_id;
      setSessionId(sid);
      sessionIdRef.current = sid;
      currentTurnRef.current = 1;
      setBotState(data.state || "");

      if (noiseFloor > 0 && sid) {
        try {
          const cRes = await fetch(`${API_BASE}/test/calibrate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sid, noise_rms: noiseFloor }),
          });
          const cData = await cRes.json();
          noiseThreshRef.current = cData.threshold || 0.0;
          if (devMode) {
            const level = noiseFloor < 0.005 ? "🟢 Quiet" : noiseFloor < 0.02 ? "🟡 Moderate" : "🔴 Noisy";
            addBotMessage(`${level} — RMS: ${noiseFloor.toFixed(4)} | threshold: ${noiseThreshRef.current.toFixed(4)}`);
            setNoiseLevel({ rms: noiseFloor, threshold: noiseThreshRef.current });
          }
        } catch { /* continue */ }
      }

      const greeting = data.response || "Hello! How can I help you today?";
      addBotMessage(greeting);
      speak(greeting, () => setTimeout(() => startMic(), 700));
    } catch (err) {
      addBotMessage(`⚠️ Could not connect. Is the backend running?\n${err.message}`);
      setCallState("IDLE");
    } finally {
      setBotTyping(false);
    }
  }

  // ── Send text ─────────────────────────────────────────────────────────
  async function sendText(text) {
    const t = String(text || "").trim();
    const sid = sessionIdRef.current;
    if (!t || !sid || callStateRef.current === "DONE") return;
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    stopSpeaking();
    setSending(true);
    addUserMessage(t);
    setTextInput("");
    setBotTyping(true);
    try {
      const res = await fetch(`${API_BASE}/test/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, text: t }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      const reply = data.response || "";
      const isDoneState = data.ticket_id || data.state === "SUBMITTED" || data.state === "ESCALATED";

      // Attach dev metadata to the user message that triggered this turn
      if (devMode) {
        setMessages((prev) => {
          const copy = [...prev];
          // Find last user message and attach meta
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === "user") {
              copy[i] = {
                ...copy[i],
                meta: {
                  confidence_scores: data.confidence_scores || {},
                  ml_negative:       data.ml_negative ?? 0,
                  sentiment_label:   data.sentiment_label ?? "",
                  urgency_level:     data.urgency_level ?? "",
                  severity_score:    data.severity_score ?? 0,
                },
              };
              break;
            }
          }
          return copy;
        });
      }

      addBotMessage(reply);
      speak(reply, isDoneState ? null : () => setTimeout(() => startMic(), 700));
      if (data.state) setBotState(data.state);
      if (data.turn !== undefined) currentTurnRef.current = data.turn + 1;
      if (data.ticket_id) {
        ticketIdRef.current = data.ticket_id;
        setTicketId(data.ticket_id);
        setCallState("DONE");
        const finalTurn = data.turn ?? currentTurnRef.current;
        const form = new FormData();
        form.append("session_id", sid);
        form.append("ticket_id", data.ticket_id);
        form.append("turn", String(finalTurn));
        form.append("file", new Blob([], { type: "audio/webm" }), `turn_${String(finalTurn).padStart(3,"0")}_caller.webm`);
        fetch(`${API_BASE}/test/upload-audio`, { method: "POST", body: form }).catch(() => {});
      }
      if (data.state === "SUBMITTED") setCallState("DONE");
      if (data.state === "ESCALATED") {
        setIsTransferring(true);
        callStateRef.current = "DONE";
        setTimeout(() => { setIsTransferring(false); setCallState("DONE"); }, 5000);
      }
    } catch (err) {
      addBotMessage(`⚠️ Error: ${err.message}`);
    } finally {
      setSending(false); setBotTyping(false); isSendingRef.current = false;
    }
  }

  // ── Mic ───────────────────────────────────────────────────────────────
  const stopMic = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    recRef.current?.stop();
    setListening(false);
    liveTextRef.current = ""; setLiveText("");
  }, []);

  const startMic = useCallback(() => {
    if (!SpeechRecognition) { setMicError("Microphone not supported. Use Chrome or Edge."); return; }
    if (listening) { stopMic(); return; }
    setMicError("");
    stopSpeaking();
    startTurnRecorder(audioStreamRef.current);

    const rec = new SpeechRecognition();
    rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = true;

    rec.onstart = () => {
      setListening(true); setLiveTextSynced(""); finalAccumRef.current = "";
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
    };

    rec.onresult = (e) => {
      let newFinal = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) newFinal += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      finalAccumRef.current += newFinal;
      const combined = (finalAccumRef.current + interim).trim();
      setLiveTextSynced(combined);
      clearTimeout(silenceTimerRef.current);
      if (combined) {
        silenceTimerRef.current = setTimeout(() => rec.stop(), SILENCE_MS);
      }
    };

    rec.onend = () => {
      clearTimeout(silenceTimerRef.current);
      setListening(false);
      const captured = liveTextRef.current.trim();
      liveTextRef.current = ""; setLiveText("");
      if (!captured) return;
      stopTurnRecorderAndUpload(currentTurnRef.current);
      sendText(captured);
    };

    rec.onerror = (e) => {
      clearTimeout(silenceTimerRef.current);
      setListening(false); setLiveTextSynced("");
      if (e.error !== "no-speech") setMicError(`Mic error: ${e.error}`);
    };

    recRef.current = rec;
    rec.start();
  }, [listening, sessionId, busy, isDone, stopMic]);

  const toggleMic = useCallback(() => {
    if (listening) stopMic(); else startMic();
  }, [listening, startMic, stopMic]);

  function addUserMessage(text) {
    setMessages((prev) => [...prev, { role: "user", text, id: Date.now() + Math.random() }]);
  }
  function addBotMessage(text) {
    setMessages((prev) => [...prev, { role: "bot", text, id: Date.now() + Math.random() }]);
  }

  function handleClose() {
    stopSpeaking();
    recRef.current?.stop();
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stream?.getTracks().forEach((t) => t.stop());
      mediaRecRef.current.stop();
    }
    setListening(false); setCallState("IDLE"); setSessionId(null); setMessages([]);
    onClose?.();
  }

  if (!open) return null;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24,
      width: "min(720px, calc(100vw - 48px))",
      height: "min(900px, calc(100vh - 60px))",
      background: devMode ? "#0f172a" : "#fff",
      borderRadius: 24,
      boxShadow: "0 12px 48px rgba(15,23,42,0.30)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      border: devMode ? "1px solid #334155" : "1px solid rgba(15,23,42,0.08)",
      zIndex: 5000, fontSize: 15,
      transition: "width 0.25s, background 0.25s",
    }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 18px",
        background: devMode
          ? "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
          : "linear-gradient(135deg, #6c3fc5 0%, #4f46e5 100%)",
        color: "#fff", flexShrink: 0,
        borderBottom: devMode ? "1px solid #334155" : "none",
      }}>
        <div style={{ position: "relative" }}>
          <img src={voiceBot} alt="" style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", padding: 4,
          }} />
          {callState === "ACTIVE" && (
            <span style={{
              position: "absolute", bottom: 1, right: 1,
              width: 13, height: 13, background: "#22c55e",
              borderRadius: "50%", border: "2px solid #6c3fc5",
            }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
            {label}
            {devMode && (
              <span style={{
                fontSize: 10, fontWeight: 700, background: "#f59e0b",
                color: "#1e293b", borderRadius: 6, padding: "2px 6px",
                letterSpacing: 0.5, textTransform: "uppercase",
              }}>DEV</span>
            )}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {isDone
              ? ticketId ? `✅ Ticket: ${ticketId}` : "✅ Session complete"
              : callState === "ACTIVE"
                ? botState ? botState.replace(/_/g, " ") : "Connected"
                : devMode ? "Developer mode — real-time NLU debug" : "Your municipal virtual assistant"}
          </div>
        </div>
        <button type="button" onClick={handleClose} style={{
          background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
          borderRadius: 8, width: 36, height: 36, cursor: "pointer",
          fontSize: 16, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>✕</button>
      </div>

      {/* ── IDLE screen ── */}
      {callState === "IDLE" && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 20, background: devMode ? "#0f172a" : "#f8f9fb", padding: 24,
        }}>
          <img src={voiceBot} alt="" style={{ width: 120, height: 120, objectFit: "contain", opacity: devMode ? 0.6 : 0.9 }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 20, color: devMode ? "#e2e8f0" : "#1e293b", marginBottom: 8 }}>
              ISA — Intelligent Service Assistant
            </div>
            <div style={{ fontSize: 14, color: devMode ? "#64748b" : "#64748b", lineHeight: 1.6 }}>
              {devMode
                ? "Developer mode: per-turn confidence & sentiment shown."
                : "Report a city issue by speaking or typing.\nISA will create a service ticket for you."}
            </div>
          </div>

          <button type="button" onClick={startCall} style={{
            background: devMode
              ? "linear-gradient(135deg, #1d4ed8, #1e40af)"
              : "linear-gradient(135deg, #6c3fc5 0%, #4f46e5 100%)",
            color: "#fff", border: "none", borderRadius: 16,
            padding: "18px 52px", fontSize: 18, fontWeight: 700,
            cursor: "pointer", boxShadow: devMode ? "0 4px 16px rgba(29,78,216,0.4)" : "0 4px 16px rgba(108,63,197,0.4)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 28 }}>📞</span> Start Call
          </button>

          {/* Mode toggle */}
          <button type="button" onClick={() => setDevMode((d) => !d)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, color: devMode ? "#f59e0b" : "#94a3b8",
            textDecoration: "underline", padding: 0,
          }}>
            {devMode ? "Switch to Citizen Mode" : "Developer Mode"}
          </button>
        </div>
      )}

      {/* ── ACTIVE / DONE ── */}
      {(callState === "ACTIVE" || callState === "DONE") && (<>

        {/* Transferring overlay */}
        {isTransferring && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(108,63,197,0.96)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 24, zIndex: 10, borderRadius: 24,
          }}>
            <div style={{ position: "relative", width: 90, height: 90 }}>
              {[0,0.5,1].map((delay, i) => (
                <div key={i} style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  border: `3px solid rgba(255,255,255,${0.6 - i * 0.2})`,
                  animation: `isaRing 1.5s ease-out ${delay}s infinite`,
                }} />
              ))}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>📞</div>
            </div>
            <div style={{ color: "#fff", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Connecting to a live agent…</div>
              <div style={{ fontSize: 15, opacity: 0.85 }}>Please stay on the line. Your call is being transferred.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[0,1,2,3].map((i) => (
                <span key={i} style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: "rgba(255,255,255,0.9)", display: "inline-block",
                  animation: `isaTyping 1.2s ease-in-out ${i*0.25}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "14px 14px 8px",
          display: "flex", flexDirection: "column", gap: devMode ? 6 : 10,
          background: devMode ? "#0f172a" : "#f8f9fb",
        }}>
          {messages.map((msg) => (
            <div key={msg.id}>
              <div style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                gap: 8, alignItems: "flex-end",
              }}>
                {msg.role === "bot" && (
                  <img src={voiceBot} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, marginBottom: 2 }} />
                )}
                <div style={{
                  maxWidth: "78%", padding: "12px 16px",
                  borderRadius: msg.role === "user"
                    ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: msg.role === "user"
                    ? (devMode ? "#1d4ed8" : "#6c3fc5")
                    : (devMode ? "#1e293b" : "#fff"),
                  color: msg.role === "user" ? "#fff" : (devMode ? "#e2e8f0" : "#1e293b"),
                  fontSize: 15, lineHeight: 1.6,
                  boxShadow: devMode ? "none" : "0 1px 4px rgba(0,0,0,0.07)",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  border: devMode && msg.role === "bot" ? "1px solid #334155" : "none",
                }}>
                  {msg.text}
                </div>
              </div>
              {/* Dev metadata card — shown below each user message */}
              {devMode && msg.role === "user" && msg.meta && (
                <DevMetaCard meta={msg.meta} />
              )}
            </div>
          ))}

          {/* Bot typing */}
          {botTyping && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <img src={voiceBot} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{
                padding: "13px 18px",
                background: devMode ? "#1e293b" : "#fff",
                borderRadius: "18px 18px 18px 4px",
                boxShadow: devMode ? "none" : "0 1px 4px rgba(0,0,0,0.07)",
                border: devMode ? "1px solid #334155" : "none",
                display: "flex", gap: 5, alignItems: "center",
              }}>
                {[0,1,2].map((i) => (
                  <span key={i} style={{
                    width: 9, height: 9, borderRadius: "50%",
                    background: devMode ? "#3b82f6" : "#a78bfa",
                    display: "inline-block",
                    animation: `isaTyping 1.2s ease-in-out ${i*0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Live transcript */}
          {liveText && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{
                maxWidth: "78%", padding: "12px 16px",
                borderRadius: "18px 18px 4px 18px",
                background: devMode ? "rgba(29,78,216,0.15)" : "rgba(108,63,197,0.12)",
                color: devMode ? "#60a5fa" : "#6c3fc5",
                fontSize: 15, fontStyle: "italic", lineHeight: 1.6,
                border: `1px dashed ${devMode ? "rgba(96,165,250,0.4)" : "rgba(108,63,197,0.3)"}`,
              }}>
                🎙 {liveText}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Ticket banner */}
        {ticketId && (
          <div style={{
            padding: "9px 18px",
            background: devMode ? "#052e16" : "#ecfdf5",
            borderTop: devMode ? "1px solid #166534" : "1px solid #d1fae5",
            fontSize: 14, color: devMode ? "#86efac" : "#065f46",
            fontWeight: 600, flexShrink: 0,
          }}>
            ✅ Ticket created: {ticketId}
          </div>
        )}

        {/* Mic error */}
        {micError && (
          <div style={{
            padding: "8px 18px",
            background: devMode ? "#1c0a0a" : "#fef2f2",
            borderTop: devMode ? "1px solid #7f1d1d" : "1px solid #fee2e2",
            fontSize: 14, color: devMode ? "#fca5a5" : "#991b1b",
            flexShrink: 0,
          }}>
            ⚠️ {micError}
          </div>
        )}

        {/* Input bar */}
        {!isDone ? (
          <div style={{
            display: "flex", gap: 10, padding: "12px 16px",
            borderTop: devMode ? "1px solid #334155" : "1px solid #e5e7eb",
            background: devMode ? "#1e293b" : "#fff",
            flexShrink: 0, alignItems: "center",
          }}>
            <button type="button" onClick={toggleMic} disabled={busy && !listening}
              title={listening ? "Click to stop" : "Click to speak"}
              style={{
                width: 52, height: 52, borderRadius: "50%", border: "none",
                background: listening
                  ? "linear-gradient(135deg, #ef4444, #dc2626)"
                  : devMode
                    ? "linear-gradient(135deg, #1d4ed8, #1e40af)"
                    : "linear-gradient(135deg, #6c3fc5, #4f46e5)",
                color: "#fff", cursor: (busy && !listening) ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, flexShrink: 0,
                boxShadow: listening ? "0 0 0 5px rgba(239,68,68,0.25)" : "none",
                transition: "all 0.2s",
                opacity: (busy && !listening) ? 0.45 : 1,
              }}>
              {listening ? "⏹" : "🎙"}
            </button>

            <input
              ref={inputRef} type="text" value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(textInput); } }}
              placeholder={listening ? "Listening… click ⏹ to stop" : botTyping ? "ISA is thinking…" : "Type a message or click 🎙 to speak"}
              disabled={busy || listening}
              style={{
                flex: 1,
                border: devMode ? "1px solid #334155" : "1px solid #d1d5db",
                borderRadius: 12,
                padding: "11px 16px", fontSize: 15, outline: "none",
                background: devMode
                  ? ((busy || listening) ? "#0f172a" : "#0f172a")
                  : ((busy || listening) ? "#f9fafb" : "#fff"),
                color: devMode ? "#e2e8f0" : "#1e293b",
              }}
            />

            <button type="button" onClick={() => sendText(textInput)}
              disabled={!textInput.trim() || busy || listening}
              style={{
                width: 52, height: 52, borderRadius: "50%", border: "none",
                background: devMode ? "linear-gradient(135deg, #1d4ed8, #1e40af)" : "linear-gradient(135deg, #6c3fc5, #4f46e5)",
                color: "#fff", cursor: "pointer", fontSize: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                opacity: (!textInput.trim() || busy || listening) ? 0.4 : 1,
              }}>↑</button>
          </div>
        ) : (
          <div style={{
            padding: "14px 18px", borderTop: devMode ? "1px solid #334155" : "1px solid #e5e7eb",
            display: "flex", justifyContent: "center",
            background: devMode ? "#1e293b" : "#fff", flexShrink: 0,
          }}>
            <button type="button" onClick={handleClose} style={{
              background: devMode ? "linear-gradient(135deg, #1d4ed8, #1e40af)" : "linear-gradient(135deg, #6c3fc5, #4f46e5)",
              color: "#fff", border: "none", borderRadius: 12,
              padding: "12px 40px", fontSize: 16, fontWeight: 600, cursor: "pointer",
            }}>Close</button>
          </div>
        )}
      </>)}

      <style>{`
        @keyframes isaTyping {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes isaRing {
          0%   { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
