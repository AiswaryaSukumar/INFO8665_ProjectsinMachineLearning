// src/components/VoiceIntakePanel.jsx
import { useMemo, useState } from "react";
import {
  DEFAULT_HUMAN_ASSIGNEE_NAME,
  ACTIVE_OPERATORS,
  SUPERVISOR,
} from "../data/operators";
import AudioLevelMeter from "./AudioLevelMeter";

export default function VoiceIntakePanel({
  transcript,
  setTranscript,
  onExtract,
  activeUser = DEFAULT_HUMAN_ASSIGNEE_NAME,
}) {
  const [status, setStatus] = useState("Ready");

  const [handoffMode, setHandoffMode] = useState("VOICE_BOT");
  const [requestSupervisor, setRequestSupervisor] = useState(false);

  const availableHumanTargets = useMemo(() => {
    if (Array.isArray(ACTIVE_OPERATORS) && ACTIVE_OPERATORS.length > 0) {
      return ACTIVE_OPERATORS.map((u) => u.name);
    }
    return [activeUser || DEFAULT_HUMAN_ASSIGNEE_NAME || "Nagavalli"];
  }, [activeUser]);

  const [selectedOperator, setSelectedOperator] = useState(
    availableHumanTargets?.[0] || activeUser || "Nagavalli"
  );

  const [micActive, setMicActive] = useState(false);

  const startMic = () => {
    setMicActive(true);
    setStatus("Listening");
  };

  const stopMic = () => {
    setMicActive(false);
    setStatus("Ready");
  };

  const simulateVoice = () => {
    setMicActive(true);
    setStatus("ISA Listening");

    setTimeout(() => {
      setTranscript(
        "Hi, I want to report a pothole near King Street and Weber Street. It feels dangerous while driving."
      );
      setMicActive(false);
      setStatus("Ready for Review");
    }, 700);
  };

  const resetAll = () => {
    setTranscript("");
    setStatus("Ready");
    setHandoffMode("VOICE_BOT");
    setRequestSupervisor(false);
    setSelectedOperator(availableHumanTargets?.[0] || activeUser || "Nagavalli");
    setMicActive(false);
  };

  const handleExtract = () => {
    let handoffPayload = { type: "VOICE_BOT" };

    if (handoffMode === "HANDOFF") {
      handoffPayload = {
        type: "VOICE_BOT_TO_HUMAN",
        requestSupervisor,
        preferredOperatorName:
          selectedOperator || activeUser || DEFAULT_HUMAN_ASSIGNEE_NAME,
      };
    }

    onExtract?.(handoffPayload);
    setStatus("ISA Session Completed");
    setMicActive(false);
  };

  const defaultTargetName = activeUser || DEFAULT_HUMAN_ASSIGNEE_NAME || "Nagavalli";
  const supervisorName = SUPERVISOR?.name || "Nagavalli";

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 6 }}>Talk to ISA</h3>

      <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
        Use ISA to capture a caller's issue, review the transcript, and create an AI-assisted ticket.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={simulateVoice} type="button">
          Start ISA Session
        </button>

        {/* Real mic start/stop */}
        {!micActive ? (
          <button className="btn" onClick={startMic} type="button">
            Start Mic (Real)
          </button>
        ) : (
          <button className="btn" onClick={stopMic} type="button">
            Stop Mic
          </button>
        )}

        <button className="btn" onClick={resetAll} type="button">
          Reset Session
        </button>

        <button className="btn" onClick={handleExtract} disabled={!transcript} type="button">
          Create AI Ticket
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 13 }}>
        <b>Status:</b>{" "}
        <span
          style={{
            color:
              status === "ISA Listening" || status === "Listening"
                ? "#2563eb"
                : status === "ISA Session Completed"
                ? "#059669"
                : "#374151",
            fontWeight: 600,
          }}
        >
          {status}
        </span>
      </div>

      <AudioLevelMeter active={micActive} />

      <div style={{ marginTop: 12 }}>
        <label>Call Handling</label>
        <select value={handoffMode} onChange={(e) => setHandoffMode(e.target.value)}>
          <option value="VOICE_BOT">ISA only</option>
          <option value="HANDOFF">ISA + Human transfer</option>
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
            <label>Preferred Human Assignee</label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
            >
              {availableHumanTargets.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Default human routing goes to <b>{defaultTargetName}</b>. If escalation
              rules trigger or a supervisor is requested, it will route to{" "}
              <b>{supervisorName}</b>.
            </p>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <label>ISA Transcript</label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Caller speech captured by ISA will appear here..."
        />
      </div>

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
            This call was processed by ISA. The resulting ticket will be assigned to{" "}
            <b>{defaultTargetName}</b> for human accountability and follow-up.
          </p>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <label>ISA Guidance</label>

        <div className="botAskBox">
          {!transcript && "ISA is ready to capture the caller's issue."}

          {transcript && status !== "ISA Session Completed" && (
            <>ISA has captured the issue. Review the transcript and confirm any missing details.</>
          )}

          {transcript && status === "ISA Session Completed" && (
            <>
              ISA session complete. Please review the auto-filled form and create the ticket for{" "}
              {defaultTargetName}.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
