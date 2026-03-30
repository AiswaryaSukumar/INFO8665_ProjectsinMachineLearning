// src/components/Floating311Button.jsx
// Reusable floating CTA for citizens to quickly call 311.

import voiceBot from "../assets/voicebot.png";

export default function Floating311Button({
  label = "Talk to ISA",
  tooltip = "Connect with the municipal service line",
}) {
  return (
    <a
      className="voiceFab"
      href="tel:311"
      aria-label={label}
      title={tooltip}
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
    </a>
  );
}