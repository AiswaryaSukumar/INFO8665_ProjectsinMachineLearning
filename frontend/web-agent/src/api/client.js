// src/api/client.js

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim(); // e.g. "http://localhost:5000"

/**
 * Reads response body safely (json OR text). Returns:
 * { json: object|null, text: string|null }
 */
async function readBodySafe(res) {
  // 204 No Content or empty body
  if (res.status === 204) return { json: null, text: null };

  const ct = (res.headers.get("content-type") || "").toLowerCase();

  // Try JSON first if content-type hints JSON
  if (ct.includes("application/json")) {
    try {
      const json = await res.json();
      return { json, text: null };
    } catch {
      // fall through to text attempt
    }
  }

  // Otherwise try text
  try {
    const text = await res.text();
    return { json: null, text: text || null };
  } catch {
    return { json: null, text: null };
  }
}

/**
 * Produces a user-facing error message that is good for toasts.
 */
function buildApiErrorMessage({ path, status, serverMessage }) {
  const base = status ? `API error (${status})` : "API error";
  const where = path ? ` — ${path}` : "";
  const detail = serverMessage ? `: ${serverMessage}` : "";
  return `${base}${where}${detail}`;
}

export async function apiFetch(path, options = {}) {
  if (!API_BASE) {
    // Intentional: forces you to set VITE_API_BASE_URL for backend integration
    throw new Error("API base URL not set (VITE_API_BASE_URL).");
  }

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
  } catch (e) {
    // Covers DNS, CORS blocks, connection refused, etc.
    throw new Error("Network error. Unable to reach API.");
  }

  const { json, text } = await readBodySafe(res);

  if (!res.ok) {
    // Prefer JSON message fields if present (common patterns)
    const serverMessage =
      json?.message ||
      json?.error ||
      (typeof text === "string" && text.trim().length > 0 ? text.trim() : "");

    throw new Error(
      buildApiErrorMessage({
        path,
        status: res.status,
        serverMessage,
      })
    );
  }

  // Success
  if (res.status === 204) return null;

  // If JSON parsed, return it
  if (json !== null) return json;

  // If not JSON but has text, return text (rare but safe)
  if (typeof text === "string") return text;

  // If truly empty/unknown
  return null;
}
