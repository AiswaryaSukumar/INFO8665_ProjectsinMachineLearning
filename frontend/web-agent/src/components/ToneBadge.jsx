// src/components/ToneBadge.jsx
import React from "react";

const TONE_CONFIG = {
  UNKNOWN: {
    emoji: "😐",
    label: "Unknown",
    className: "badge tone-unknown",
  },
  CALM: {
    emoji: "🙂",
    label: "Calm",
    className: "badge tone-calm",
  },
  AGITATED: {
    emoji: "😟",
    label: "Agitated",
    className: "badge tone-agitated",
  },
  ANGRY: {
    emoji: "😡",
    label: "Angry",
    className: "badge tone-angry",
  },
  THREAT: {
    emoji: "⚠️",
    label: "Threat",
    className: "badge tone-threat",
  },
  ABUSIVE: {
    emoji: "🚫",
    label: "Abusive",
    className: "badge tone-abusive",
  },
};

export default function ToneBadge({
  tone = "UNKNOWN",
  confidence = "MEDIUM",
  showConfidence = true,
}) {
  // ✅ Normalize tone safely
  const key = (tone || "UNKNOWN").toUpperCase();
  const cfg = TONE_CONFIG[key] || TONE_CONFIG.UNKNOWN;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${cfg.className}`}
      title="Inferred from language tone; operator may override"
    >
      <span className="text-lg">{cfg.emoji}</span>
      <span>{cfg.label}</span>
      {showConfidence && (
        <span className="text-xs opacity-70">({confidence})</span>
      )}
    </div>
  );
}
