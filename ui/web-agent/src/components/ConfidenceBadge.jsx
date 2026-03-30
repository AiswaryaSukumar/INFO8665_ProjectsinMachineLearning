export default function ConfidenceBadge({ value }) {
  const text = (value || "MEDIUM").toUpperCase();
  return <span className={`badge confidenceBadge conf-${text}`}>{text}</span>;
}
