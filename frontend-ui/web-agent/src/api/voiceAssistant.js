import { apiFetch } from "./client";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim();

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
}) {
  if (!API_BASE) {
    throw new Error("API base URL not set (VITE_API_BASE_URL).");
  }

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
      `API error (${response.status}) — /voice/process_audio${detail ? `: ${detail}` : ""}`
    );
  }

  const audioResponseBlob = await response.blob();

  return {
    audioBlob: audioResponseBlob,
    transcript: response.headers.get("X-Transcript") || "",
    responseText: response.headers.get("X-Response-Text") || "",
    currentState: response.headers.get("X-Current-State") || "",
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
      `API error (${response.status}) — /voice/synthesize${detail ? `: ${detail}` : ""}`
    );
  }

  return await response.blob();
}