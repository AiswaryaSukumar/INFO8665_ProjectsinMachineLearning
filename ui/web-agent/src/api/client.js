// src/api/client.js

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").trim();

/**
 * Reads response body safely (json OR text). Returns:
 * { json: object|null, text: string|null }
 */
async function readBodySafe(res) {
  if (res.status === 204) return { json: null, text: null };

  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (ct.includes("application/json")) {
    try {
      const json = await res.json();
      return { json, text: null };
    } catch {
      // fall through
    }
  }

  try {
    const text = await res.text();
    return { json: null, text: text || null };
  } catch {
    return { json: null, text: null };
  }
}

function buildApiErrorMessage({ path, status, serverMessage }) {
  const base = status ? `API error (${status})` : "API error";
  const where = path ? ` — ${path}` : "";
  const detail = serverMessage ? `: ${serverMessage}` : "";
  return `${base}${where}${detail}`;
}

export async function apiFetch(path, options = {}) {

  const url = `${API_BASE}${path}`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error("Network error. Unable to reach API.");
  }

  const { json, text } = await readBodySafe(res);

  if (!res.ok) {
    const serverMessage =
      json?.message ||
      json?.error ||
      json?.detail ||
      (typeof text === "string" && text.trim() ? text.trim() : "");

    throw new Error(
      buildApiErrorMessage({
        path,
        status: res.status,
        serverMessage,
      })
    );
  }

  if (res.status === 204) return null;
  if (json !== null) return json;
  if (typeof text === "string") return text;

  return null;
}