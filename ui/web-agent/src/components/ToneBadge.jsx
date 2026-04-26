// src/components/ToneBadge.jsx
import React from "react";

const TONE_CONFIG = {
  UNKNOWN:  { emoji: "❓", label: "Unknown",  className: "badge tone-unknown"  },
  CALM:     { emoji: "🙂", label: "Calm",     className: "badge tone-calm"     },
  NEUTRAL:  { emoji: "😐", label: "Neutral",  className: "badge tone-neutral"  },
  AGITATED: { emoji: "😟", label: "Agitated", className: "badge tone-agitated" },
  ANGRY:    { emoji: "😡", label: "Angry",    className: "badge tone-angry"    },
  THREAT:   { emoji: "⚠️", label: "Threat",   className: "badge tone-threat"   },
  ABUSIVE:  { emoji: "🚫", label: "Abusive",  className: "badge tone-abusive"  },
};

function normalizeTone(tone) {
  if (!tone) return "UNKNOWN";
  return String(tone).toUpperCase().trim();
}

function normalizeConfidence(conf) {
  if (!conf) return null;
  return String(conf).toUpperCase().trim();
}

export default function ToneBadge({ tone, confidence, toneConfidence, showConfidence = true, compact = false }) {
  const toneKey = normalizeTone(tone);
  const cfg = TONE_CONFIG[toneKey] || TONE_CONFIG.UNKNOWN;
  const conf = normalizeConfidence(confidence || toneConfidence);

  if (compact) {
    return (
      <span
        className={`toneBadge ${cfg.className}`}
        title={cfg.label}
        style={{ fontSize: 18, padding: "2px 4px" }}
      >
        <span aria-hidden="true">{cfg.emoji}</span>
      </span>
    );
  }

  return (
    <span className={`toneBadge ${cfg.className}`} title="Detected from language tone. Operator may override.">
      <span className="toneEmoji" aria-hidden="true">{cfg.emoji}</span>
      <span className="toneLabel">{cfg.label}</span>
      {showConfidence && conf ? <span className="toneConf">({conf})</span> : null}
    </span>
  );
}
