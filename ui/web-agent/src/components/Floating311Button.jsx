import { useState } from "react";
import voiceBot from "../assets/voicebot.png";
import VoiceAssistantModal from "./VoiceAssistantModal";

export default function Floating311Button({
  label = "Talk to ISA",
  tooltip = "Connect with the municipal service line",
}) {
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  return (
    <>
      {!isVoiceModalOpen && (
        <button
          type="button"
          className="voiceFab"
          aria-label={label}
          title={tooltip}
          onClick={() => setIsVoiceModalOpen(true)}
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
      )}

      <VoiceAssistantModal
        open={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        label={label}
      />
    </>
  );
}
