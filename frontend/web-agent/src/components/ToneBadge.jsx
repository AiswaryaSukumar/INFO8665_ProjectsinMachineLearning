// src/components/ToneBadge.jsx
import React from "react";

const TONE_CONFIG = {
  UNKNOWN: { emoji: "😐", label: "Unknown", className: "badge tone-unknown" },
  CALM: { emoji: "🙂", label: "Calm", className: "badge tone-calm" },
  AGITATED: { emoji: "😟", label: "Agitated", className: "badge tone-agitated" },
  ANGRY: { emoji: "😡", label: "Angry", className: "badge tone-angry" },
  THREAT: { emoji: "⚠️", label: "Threat", className: "badge tone-threat" },
  ABUSIVE: { emoji: "🚫", label: "Abusive", className: "badge tone-abusive" },
};

export default function ToneBadge({
  tone = "UNKNOWN",
  confidence = "MEDIUM",
  showConfidence = true,
}) {
  const key = (tone || "UNKNOWN").toUpperCase();
  const cfg = TONE_CONFIG[key] || TONE_CONFIG.UNKNOWN;

  return (
    <span
      className={`toneBadge ${cfg.className}`}
      title="Inferred from language tone; operator may override"
    >
      <span className="toneEmoji" aria-hidden="true">
        {cfg.emoji}
      </span>
      <span className="toneLabel">{cfg.label}</span>
      {showConfidence && <span className="toneConf">({confidence})</span>}
    </span>
  );
}
