// src/components/TicketTableControls.jsx
import React from "react";

/**
 * Search + lane filters + quick filter chips for TicketTable
 *
 * NOTE: Keep this component "CSS-driven" (no inline styles) so
 * high-contrast mode can reliably override everything.
 */
export default function TicketTableControls({
  searchQuery = "",
  onSearchChange,
  chips = { needsReview: false, escalated: false },
  onToggleChip,
  onClearAll,

  queueFilter = "ALL",
  onChangeQueueFilter,
  laneStats = {},
  showLaneFilters = true,
}) {
  const Chip = ({ id, label, active }) => (
    <button
      type="button"
      className={`filterChip ${active ? "isActive" : ""}`}
      onClick={() => onToggleChip?.(id)}
      aria-pressed={!!active}
      title={label}
    >
      <span className="chipLabel">{label}</span>
      {active ? (
        <span className="chipCheck" aria-hidden="true">
          ✓
        </span>
      ) : null}
      <span className="srOnly">{active ? "(active)" : ""}</span>
    </button>
  );

  const LaneBtn = ({ id, label, count, hidden }) => {
    if (hidden) return null;
    const active = queueFilter === id;

    return (
      <button
        type="button"
        className={`laneBtn ${active ? "isActive" : ""}`}
        onClick={() => onChangeQueueFilter?.(id)}
        aria-pressed={active}
        title={label}
      >
        <span className="laneLabel">{label}</span>
        {typeof count === "number" ? (
          <span className="countPill">{count}</span>
        ) : (
          <span className="countPill">0</span>
        )}
      </button>
    );
  };

  const anyActive =
    !!searchQuery?.trim() || Object.values(chips || {}).some(Boolean);

  const clearAll = () => {
    onSearchChange?.("");
    onClearAll?.();
  };

  return (
    <div className="ttControlsGrid">
      {showLaneFilters ? (
        <div className="ttControlsRow" role="group" aria-label="Status filters">
          <span className="controlsLabel">Status filters:</span>

          <LaneBtn id="NEW" label="New" count={laneStats.new} />
          <LaneBtn
            id="APPROVAL"
            label="Approve"
            count={laneStats.approval}
            hidden={!laneStats.showApproval}
          />
          <LaneBtn id="REJECTED" label="Rejected" count={laneStats.rejected} />
          <LaneBtn id="DELETE" label="Delete" count={laneStats.delete} />

          <LaneBtn id="MINE" label="Mine" count={laneStats.mine} />
          <LaneBtn id="ESCALATED" label="Escalated" count={laneStats.escalated} />
          <LaneBtn id="RESOLVED" label="Resolved" count={laneStats.resolved} />
          <LaneBtn id="ALL" label="All Active" count={laneStats.allActive} />
        </div>
      ) : null}

      <div className="ttControlsSearchRow" role="search">
        <div className="ttSearchWrap">
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search: ticket #, name, location, keywords…"
            aria-label="Search tickets"
            className="ttSearchInput"
          />
          <span aria-hidden="true" className="ttSearchIcon">
            🔎
          </span>
        </div>

        <button
          type="button"
          className="filterChip ttClearBtn"
          onClick={clearAll}
          disabled={!anyActive}
          aria-disabled={!anyActive}
          title="Clear search and filters"
        >
          <span className="chipLabel">Clear</span>
        </button>
      </div>

      <div className="ttControlsRow" role="group" aria-label="Quick filters">
        <span className="controlsLabel">Quick filters:</span>
        <Chip id="needsReview" label="Needs Review" active={chips.needsReview} />
        <Chip id="escalated" label="Escalated" active={chips.escalated} />
      </div>
    </div>
  );
}