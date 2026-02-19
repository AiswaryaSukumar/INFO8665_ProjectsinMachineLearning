// src/components/SessionHistory.jsx
export default function SessionHistory({ items = [] }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div style={{ background: "#f3f4f6", padding: 10, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
        Session History (Q/A Flow)
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {items.map((m, idx) => (
          <div
            key={idx}
            style={{
              background: "white",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
              {m.speaker || "Unknown"}
            </div>
            <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.35 }}>
              {m.text || "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
