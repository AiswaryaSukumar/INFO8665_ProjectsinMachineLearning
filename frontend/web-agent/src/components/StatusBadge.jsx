export default function StatusBadge({ value }) {
  let text = value || "NEW";

  // Simple styling using existing .badge
  let style = { background: "#fff" };
  if (text === "NEW") style = { background: "#ecfeff" };
  if (text === "IN_PROGRESS") style = { background: "#eff6ff" };
  if (text === "RESOLVED") style = { background: "#ecfdf5" };
  if (text === "NEEDS_REVIEW") style = { background: "#fff7ed" };

  return (
    <span className="badge" style={style}>
      {text}
    </span>
  );
}
