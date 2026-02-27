export default function StatusBadge({ value }) {
  const text = (value || "NEW").toUpperCase();
  const cls = `badge statusBadge status-${text}`;
  return <span className={cls}>{text}</span>;
}
