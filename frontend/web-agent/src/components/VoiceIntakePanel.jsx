import { useState } from "react";
import { USERS, OPERATORS, SUPERVISOR } from "../data/operators";
import { decideHandoffTarget } from "../utils/routing";

export default function VoiceIntakePanel({ transcript, setTranscript, onExtract }) {
  const [status, setStatus] = useState("Idle");

  // NEW: call handling controls
  const [handoffMode, setHandoffMode] = useState("VOICE_BOT"); // VOICE_BOT | HANDOFF
  const [requestSupervisor, setRequestSupervisor] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState(
    OPERATORS?.[0]?.name || "Jerry"
  );

  const [autoDecision, setAutoDecision] = useState(null);

  const simulateVoice = () => {
    setStatus("Listening");
    setTimeout(() => {
      setTranscript(
        "Hi, I want to report a pothole near King Street and Weber Street. It feels dangerous while driving."
      );
      // Keep as Listening until Extract happens (so lifecycle becomes meaningful)
    }, 700);
  };

  const resetAll = () => {
    setTranscript("");
    setStatus("Idle");
    setAutoDecision(null);
    setHandoffMode("VOICE_BOT");
    setRequestSupervisor(false);
    setSelectedOperator(OPERATORS?.[0]?.name || "Jerry");
  };

  const handleExtract = () => {
    // We don’t have the full ticketDraft here (category/tone/priority)
    // So we pass routing intent up. IntakePage will decide escalation using real draft fields.
    // However, we CAN do “request supervisor” immediately.
    let handoffPayload = { type: "VOICE_BOT" };

    if (handoffMode === "HANDOFF") {
      handoffPayload = {
        type: "VOICE_BOT_TO_HUMAN",
        requestSupervisor,
        preferredOperatorName: selectedOperator,
      };
    }

    onExtract(handoffPayload);
    setStatus("Session Completed");
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Voice Intake (UC1)</h3>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={simulateVoice}>
          Start Voice Intake (Simulate)
        </button>

        <button className="btn" onClick={resetAll}>
          Reset
        </button>

        <button className="btn" onClick={handleExtract} disabled={!transcript}>
          Extract → Auto-fill
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 13 }}>
        <b>Status:</b>{" "}
        <span
          style={{
            color:
              status === "Listening"
                ? "#2563eb"
                : status === "Session Completed"
                ? "#059669"
                : "#374151",
            fontWeight: 600,
          }}
        >
          {status}
        </span>
      </div>

      {/* ✅ NEW: Call handling controls */}
      <div style={{ marginTop: 12 }}>
        <label>Call Handling</label>
        <select
          value={handoffMode}
          onChange={(e) => setHandoffMode(e.target.value)}
        >
          <option value="VOICE_BOT">Voice Bot only</option>
          <option value="HANDOFF">Voice Bot + Human (transfer)</option>
        </select>
      </div>

      {handoffMode === "HANDOFF" && (
        <div style={{ marginTop: 10 }}>
          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={requestSupervisor}
              onChange={(e) => setRequestSupervisor(e.target.checked)}
            />{" "}
            Citizen requested supervisor
          </label>

          <div style={{ marginTop: 8 }}>
            <label>Preferred Operator (if not escalated)</label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
            >
              {OPERATORS.map((op) => (
                <option key={op.id} value={op.name}>
                  {op.name}
                </option>
              ))}
            </select>

            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Default routing is to an Operator (Tom/Jerry). If escalation rules trigger,
              it will route to Supervisor ({SUPERVISOR?.name || "Nagavalli"}).
            </p>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <label>Transcript</label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Caller speech will appear here..."
        />
      </div>

      {/* 🔊 Call playback (Review Only) — shown only when we have a transcript */}
      {transcript?.trim() && (
        <div style={{ marginTop: 10 }}>
          <label>Call Recording (AI Intake)</label>

          <audio controls style={{ width: "100%" }}>
            <source src="/mock/call_sample.mp3" type="audio/mpeg" />
            Your browser does not support audio playback.
          </audio>

          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <a className="btn" href="/mock/call_sample.mp3" download>
              ⬇ Download Recording
            </a>
          </div>

          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            This call was processed by the AI voice bot. If transferred, a human handler will be
            recorded on the ticket for accountability.
          </p>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <label>Bot asks (only if missing fields)</label>
        <div style={{ background: "#f3f4f6", padding: 10, borderRadius: 8 }}>
          {!transcript && "Please describe the issue you’d like to report."}

          {transcript && status !== "Session Completed" && (
            <>Confirm details. If missing, ask: “What is the nearest intersection?”</>
          )}

          {transcript && status === "Session Completed" && (
            <>Session complete. Please review the auto-filled form and create the ticket.</>
          )}
        </div>
      </div>
    </div>
  );
}
