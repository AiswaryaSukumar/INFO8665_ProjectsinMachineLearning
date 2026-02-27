// src/components/Floating311Button.jsx
// Reusable, eye-catching CTA for citizens to call 311.

// NOTE: project asset is a PNG in this repo
import voiceBot from "../assets/voicebot.png";

export default function Floating311Button({ label = "Talk to 311" }) {
  return (
    <a className="voiceFab" href="tel:311" aria-label={label}>
      <img className="voiceBotLarge" src={voiceBot} alt={label} aria-hidden="true" />
      <span className="voiceLabel">{label}</span>
      <span className="voiceTooltip" role="tooltip">
        AI Voice Intake – Faster than forms
      </span>
    </a>
  );
}
