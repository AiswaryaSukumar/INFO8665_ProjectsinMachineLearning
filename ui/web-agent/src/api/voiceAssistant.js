import { apiFetch } from "./client";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim();

function getHeader(response, name) {
  return (
    response.headers.get(name) ||
    response.headers.get(name.toLowerCase()) ||
    ""
  );
}

function extractTicketId(text = "") {
  const match = String(text).match(/\b311-\d{4}-\d{4,8}\b/i);
  return match ? match[0].toUpperCase() : "";
}

export function initializeVoiceSession({
  channel = "VOICE",
  language = "en",
  callerNumber = null,
} = {}) {
  return apiFetch("/orchestrator/initialize", {
    method: "POST",
    body: JSON.stringify({
      channel,
      language,
      caller_number: callerNumber,
    }),
  });
}

export function getVoiceSession(sessionId) {
  return apiFetch(`/orchestrator/session/${encodeURIComponent(sessionId)}`);
}

export async function processVoiceAudio({
  sessionId,
  turn,
  audioBlob,
  filename = "recording.webm",
  transcript = null,
  isTextInput = false,
}) {
  if (!API_BASE) {
    throw new Error("API base URL not set (VITE_API_BASE_URL).");
  }

  if (!sessionId) {
    throw new Error("Missing sessionId for voice processing.");
  }

  // For text input, send directly without audio file
  if (isTextInput && transcript) {
    try {
      const response = await fetch(`${API_BASE}/orchestrator/process_text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          turn: String(turn),
          text: transcript,
        }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const data = await response.json();
          detail = data?.detail || data?.error || data?.message || "";
        } catch {
          detail = "";
        }
        throw new Error(
          `API error (${response.status}) — /orchestrator/process_text${
            detail ? `: ${detail}` : ""
          }`
        );
      }

      const data = await response.json();

      return {
        audioBlob: null,
        transcript: transcript,
        responseText:
          data?.response_text ||
          data?.response ||
          data?.reply ||
          data?.message ||
          data?.action?.text ||
          "",
        currentState: data?.current_state || data?.state || "",
        ticketId: data?.ticket_id || data?.ticketId || extractTicketId(data?.response_text || ""),
        raw: data,
      };
    } catch (err) {
      console.warn("Text processing failed, falling back to audio synthesis:", err);
      // Fall back to audio synthesis if text endpoint unavailable
      if (!audioBlob) {
        throw err;
      }
    }
  }

  // Original audio processing path
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("turn", String(turn));
  formData.append("audio_file", audioBlob, filename);

  let response;
  try {
    response = await fetch(`${API_BASE}/voice/process_audio`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Network error. Unable to reach voice API.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data?.detail || data?.error || data?.message || "";
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
    }

    throw new Error(
      `API error (${response.status}) — /voice/process_audio${
        detail ? `: ${detail}` : ""
      }`
    );
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const data = await response.json();

    const transcriptValue = data?.transcript || data?.text || "";
    const responseText =
      data?.response_text ||
      data?.response ||
      data?.reply ||
      data?.message ||
      data?.action?.text ||
      "";

    return {
      audioBlob: null,
      transcript: transcriptValue,
      responseText,
      currentState: data?.current_state || data?.state || "",
      ticketId: data?.ticket_id || data?.ticketId || extractTicketId(responseText),
      raw: data,
    };
  }

  const audioResponseBlob = await response.blob();

  const transcriptValue = getHeader(response, "X-Transcript");
  const responseText = getHeader(response, "X-Response-Text");

  return {
    audioBlob: audioResponseBlob,
    transcript: transcriptValue,
    responseText,
    currentState: getHeader(response, "X-Current-State"),
    ticketId: extractTicketId(responseText),
    raw: null,
  };
}

export async function synthesizeVoiceText(text) {
  if (!API_BASE) {
    throw new Error("API base URL not set (VITE_API_BASE_URL).");
  }

  const formData = new FormData();
  formData.append("text", text);

  let response;
  try {
    response = await fetch(`${API_BASE}/voice/synthesize`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Network error. Unable to reach synthesize API.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data?.detail || data?.error || data?.message || "";
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
    }

    throw new Error(
      `API error (${response.status}) — /voice/synthesize${
        detail ? `: ${detail}` : ""
      }`
    );
  }

  return await response.blob();
}