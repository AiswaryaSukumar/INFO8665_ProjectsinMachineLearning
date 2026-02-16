// src/components/DonutChart.jsx
import React, { useMemo, useState } from "react";

/**
 * Two-ring donut chart (INSIGHT-311 themed)
 *
 * outerSegments: [{ label, value }]
 * innerSegments: [{ label, value }]
 * total: number (center label)
 *
 * Included:
 * ✅ Theme-friendly colors (purple → blue → cyan family)
 * ✅ % shown in legend (per ring)
 * ✅ Hover highlight (segment thickens + legend row highlights)
 * ✅ ESCALATED uses darker tone (#1E3A8A)
 *
 * Quick-wins added in this version:
 * ✅ Clickable legend rows (filter shortcut)
 * ✅ onLegendClick callback
 * ✅ Keyboard accessible legend (Enter/Space)
 * ✅ aria-label on chart segments + legend items
 * ✅ Keyboard accessible chart segments (Enter/Space)  <-- ADDED
 */
export default function DonutChart({
  outerSegments = [],
  innerSegments = [],
  total = 0,
  size = 260,
  outerStroke = 22,
  innerStroke = 18,
  gap = 10,

  // ✅ click handler for legend/segments
  onLegendClick,
}) {
  const [hoverKey, setHoverKey] = useState(null); // e.g. "outer:Voice Bot" / "inner:NEW"

  const outerSum = useMemo(
    () => outerSegments.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1,
    [outerSegments]
  );

  const innerSum = useMemo(
    () => innerSegments.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1,
    [innerSegments]
  );

  const cx = size / 2;
  const cy = size / 2;

  const outerR = (size - outerStroke) / 2;
  const innerR = outerR - outerStroke - gap;

  const outerC = 2 * Math.PI * outerR;
  const innerC = 2 * Math.PI * innerR;

  // ✅ INSIGHT-311 theme palette (outer ring)
  const OUTER_COLORS = [
    "#3B82F6", // Voice Bot
    "#6D28D9", // Human
    "#22D3EE",
    "#8B5CF6",
  ];

  // ✅ Inner ring (status): order-based. Keep your innerSegments order consistent!
  const INNER_COLORS = [
    "#22D3EE", // NEW
    "#60A5FA", // IN_PROGRESS
    "#A78BFA", // NEEDS_REVIEW
    "#1E3A8A", // ESCALATED (darker)
    "#6D28D9", // RESOLVED
    "#67E8F9", // fallback
    "#8B5CF6", // fallback
  ];

  const pct = (v, sum) => {
    const val = Number(v) || 0;
    if (!sum || sum <= 0) return "0%";
    return `${Math.round((val / sum) * 100)}%`;
  };

  const clickable = typeof onLegendClick === "function";

  const emitLegendClick = ({ ringId, label, value }) => {
    onLegendClick?.({ ringId, label, value });
  };

  const onLegendKeyDown = (e, payload) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      emitLegendClick(payload);
    }
  };

  // ✅ ADDED: keyboard support for chart segments
  const onSegmentKeyDown = (e, payload) => {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      emitLegendClick(payload);
    }
  };

  const ring = ({ ringId, segments, sum, r, c, stroke, colors }) => {
    let acc = 0;

    return (
      <>
        {/* background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />

        {segments.map((s, i) => {
          const v = Number(s.value) || 0;
          const frac = v / sum;
          const dash = frac * c;

          const key = `${ringId}:${s.label}`;
          const isHover = hoverKey === key;

          const strokeW = isHover ? stroke + 4 : stroke;
          const opacity = hoverKey ? (isHover ? 1 : 0.35) : 1;

          const payload = { ringId, label: s.label, value: v };

          const el = (
            <circle
              key={`${key}-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth={strokeW}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-acc}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{
                transition: "opacity 140ms ease, stroke-width 140ms ease",
                opacity,
                cursor: clickable ? "pointer" : "default",
              }}
              // ✅ a11y
              aria-label={`${ringId === "outer" ? "Source" : "Status"}: ${s.label}, ${v} (${pct(
                v,
                sum
              )})`}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={(e) => onSegmentKeyDown(e, payload)}
              onMouseEnter={() => setHoverKey(key)}
              onMouseLeave={() => setHoverKey(null)}
              onClick={() => clickable && emitLegendClick(payload)}
            />
          );

          acc += dash;
          return el;
        })}
      </>
    );
  };

  const Legend = ({ title, ringId, segments, colors, sum }) => (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 12 }}>{title}</div>

      {segments.map((s, i) => {
        const key = `${ringId}:${s.label}`;
        const isHover = hoverKey === key;

        const v = Number(s.value) || 0;
        const payload = { ringId, label: s.label, value: v };

        return (
          <div
            key={`${title}-${s.label}`}
            // ✅ hover highlight
            onMouseEnter={() => setHoverKey(key)}
            onMouseLeave={() => setHoverKey(null)}
            // ✅ clickable legend (filter shortcut)
            onClick={() => clickable && emitLegendClick(payload)}
            // ✅ keyboard accessible
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => clickable && onLegendKeyDown(e, payload)}
            // ✅ a11y
            aria-label={
              clickable
                ? `Filter by ${ringId === "outer" ? "Source" : "Status"}: ${s.label}`
                : undefined
            }
            style={{
              display: "grid",
              gridTemplateColumns: "12px 1fr auto auto",
              gap: 10,
              alignItems: "center",
              fontSize: 12,
              padding: "6px 8px",
              borderRadius: 10,
              background: isHover ? "rgba(99,102,241,0.08)" : "transparent",
              transition: "background 140ms ease",
              cursor: clickable ? "pointer" : "default",
              outline: "none",
              userSelect: "none",
            }}
            title={clickable ? "Click to filter" : undefined}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: colors[i % colors.length],
                display: "inline-block",
              }}
              aria-hidden="true"
            />
            <span style={{ color: "#334155", fontWeight: 700 }}>{s.label}</span>
            <span style={{ color: "#64748b", fontWeight: 800 }}>{s.value}</span>
            <span style={{ color: "#94a3b8", fontWeight: 800 }}>{pct(s.value, sum)}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Ticket distribution donut chart"
      >
        {/* OUTER: Source */}
        {ring({
          ringId: "outer",
          segments: outerSegments,
          sum: outerSum,
          r: outerR,
          c: outerC,
          stroke: outerStroke,
          colors: OUTER_COLORS,
        })}

        {/* INNER: Status */}
        {ring({
          ringId: "inner",
          segments: innerSegments,
          sum: innerSum,
          r: innerR,
          c: innerC,
          stroke: innerStroke,
          colors: INNER_COLORS,
        })}

        {/* center label */}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: 28, fontWeight: 900, fill: "#0f172a" }}
        >
          {total}
        </text>
        <text
          x="50%"
          y="63%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: 12, fontWeight: 800, fill: "#64748b" }}
        >
          Tickets
        </text>
      </svg>

      {/* legends */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
          width: "min(560px, 92vw)",
        }}
      >
        <Legend
          title="Source (Outer)"
          ringId="outer"
          segments={outerSegments}
          colors={OUTER_COLORS}
          sum={outerSum}
        />
        <Legend
          title="Status (Inner)"
          ringId="inner"
          segments={innerSegments}
          colors={INNER_COLORS}
          sum={innerSum}
        />
      </div>
    </div>
  );
}
