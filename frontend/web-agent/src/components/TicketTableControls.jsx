// src/components/TicketTableControls.jsx
import React from "react";

/**
 * Search + quick filter chips for TicketTable
 *
 * Props:
 * - searchQuery: string
 * - onSearchChange: (value: string) => void
 * - chips: { needsReview: boolean, escalated: boolean }
 * - onToggleChip: (chipKey: "needsReview"|"escalated") => void
 * - onClearAll?: () => void
 */
export default function TicketTableControls({
  searchQuery = "",
  onSearchChange,
  chips = { needsReview: false, escalated: false },
  onToggleChip,
  onClearAll,
}) {
  const Chip = ({ id, label, active }) => (
    <button
      type="button"
      className="btn"
      onClick={() => onToggleChip?.(id)}
      aria-pressed={!!active}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: active ? "2px solid #2563eb" : "1px solid #e5e7eb",
        background: active ? "#eff6ff" : "#ffffff",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
      }}
      title={label}
    >
      <span style={{ fontWeight: 800, fontSize: 12 }}>{label}</span>
      {active && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 900,
            color: "#2563eb",
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          ✓
        </span>
      )}
    </button>
  );

  const anyActive =
    !!searchQuery?.trim() ||
    Object.values(chips || {}).some(Boolean);

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        marginTop: 12,
        marginBottom: 10,
      }}
    >
      {/* Search */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search: ticket #, name, location, keywords…"
            aria-label="Search tickets"
            style={{
              width: "100%",
              paddingLeft: 36,
              borderRadius: 12,
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#64748b",
              fontSize: 14,
              pointerEvents: "none",
            }}
          >
            🔎
          </span>
        </div>

        <button
          type="button"
          className="btn"
          onClick={() => {
            onSearchChange?.("");
            onClearAll?.();
          }}
          disabled={!anyActive}
          aria-disabled={!anyActive}
          title="Clear search and filters"
          style={{
            opacity: anyActive ? 1 : 0.5,
            cursor: anyActive ? "pointer" : "not-allowed",
          }}
        >
          Clear
        </button>
      </div>

      {/* Quick Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, marginRight: 4 }}>
          Quick filters:
        </div>

        <Chip id="needsReview" label="Needs Review" active={chips.needsReview} />
        <Chip id="escalated" label="Escalated" active={chips.escalated} />
      </div>
    </div>
  );
}
