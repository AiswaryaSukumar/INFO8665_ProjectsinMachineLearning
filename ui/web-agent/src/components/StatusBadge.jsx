export default function StatusBadge({ value }) {
  const text = (value || "NEW").toUpperCase();
  const parts = text.split("_").map(p => p.charAt(0) + p.slice(1).toLowerCase());
  const cls = `badge statusBadge status-${text}`;

  if (parts.length > 1) {
    return (
      <span className={cls} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1.35, textAlign: "center" }}>
        {parts.map((p, i) => <span key={i} style={{ whiteSpace: "nowrap" }}>{p}</span>)}
      </span>
    );
  }

  return (
    <span className={cls} style={{ whiteSpace: "nowrap", display: "inline-block", textAlign: "center" }}>
      {parts[0]}
    </span>
  );
}
