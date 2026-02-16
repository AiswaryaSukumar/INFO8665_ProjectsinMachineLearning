export default function ConfidenceBadge({ value }) {
  // ✅ Normalize casing + safe fallback
  const text = (value || "MEDIUM").toUpperCase();

  let style = { background: "#fff" };

  if (text === "HIGH") style = { background: "#ecfdf5" };
  if (text === "MEDIUM") style = { background: "#eff6ff" };
  if (text === "LOW") style = { background: "#fff7ed" };

  return (
    <span className="badge" style={style}>
      {text}
    </span>
  );
}
