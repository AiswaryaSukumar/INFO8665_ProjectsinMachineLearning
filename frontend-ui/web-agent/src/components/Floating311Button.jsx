// src/components/Floating311Button.jsx
// Floating CTA that now opens an in-app ISA voice assistant panel.

import { useState } from "react";
import voiceBot from "../assets/voicebot.png";
import VoiceAssistantModal from "./VoiceAssistantModal";

export default function Floating311Button({
  label = "Talk to ISA",
  tooltip = "Connect with the municipal service line",
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="voiceFab"
        aria-label={label}
        title={tooltip}
        onClick={() => setOpen(true)}
      >
        <img
          className="voiceBotLarge"
          src={voiceBot}
          alt=""
          aria-hidden="true"
        />

        <span className="voiceLabel">{label}</span>

        <span className="voiceTooltip" role="tooltip">
          {tooltip}
        </span>
      </button>

      <VoiceAssistantModal open={open} onClose={() => setOpen(false)} label={label} />
    </>
  );
}
