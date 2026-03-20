// src/components/TicketReportsPanel.jsx
import { useEffect, useMemo, useState } from "react";

function toDateInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseTicketDate(createdAt) {
  // expected: YYYY-MM-DD HH:MM (or ISO)
  const str = String(createdAt || "");
  const iso = str.includes("T") ? str : str.replace(" ", "T");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function downloadTextFile(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[\n",]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };

  const headers = [
    "ticketNumber",
    "createdAt",
    "status",
    "priority",
    "category",
    "location",
    "assignedDepartment",
    "createdByName",
    "handledByName",
  ];

  const lines = [headers.join(",")];
  for (const t of rows) {
    lines.push(headers.map((h) => escape(t?.[h])).join(","));
  }
  return lines.join("\n");
}

function quarterKey(d) {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function seasonLabel(d) {
  const m = d.getMonth();
  if (m === 11 || m <= 1) return "Winter";
  if (m >= 2 && m <= 4) return "Spring";
  if (m >= 5 && m <= 7) return "Summer";
  return "Fall";
}

function normalizeArea(location) {
  const loc = String(location || "").trim();
  if (!loc) return "Unknown";
  const lower = loc.toLowerCase();
  const nearIdx = lower.indexOf(" near ");
  const ampIdx = loc.indexOf("&");
  const cut =
    nearIdx > 0 ? loc.slice(0, nearIdx) : ampIdx > 0 ? loc.slice(0, ampIdx) : loc;
  return cut.trim() || "Unknown";
}

function BarList({ title, items, hint }) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return (
    <div className="reportCard">
      <div className="reportTitleRow">
        <div>
          <div className="reportTitle">{title}</div>
          {hint ? <div className="reportHint">{hint}</div> : null}
        </div>
      </div>

      <div className="barList">
        {items.map((x) => (
          <div key={x.label} className="barRow">
            <div className="barLabel">{x.label}</div>
            <div className="barTrack">
              <div className="barFill" style={{ width: `${(x.value / max) * 100}%` }} />
            </div>
            <div className="barValue">{x.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TicketReportsPanel({ tickets = [] }) {
  const today = new Date();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - 3);
    return toDateInputValue(d);
  });
  const [toDate, setToDate] = useState(() => toDateInputValue(today));
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [autoRangeApplied, setAutoRangeApplied] = useState(false);

  useEffect(() => {
    if (autoRangeApplied) return;

    const parsed = (tickets || [])
      .map((t) => parseTicketDate(t?.createdAt))
      .filter(Boolean);

    if (parsed.length === 0) return;

    const min = new Date(Math.min(...parsed.map((d) => d.getTime())));
    const max = new Date(Math.max(...parsed.map((d) => d.getTime())));

    setFromDate(toDateInputValue(min));
    setToDate(toDateInputValue(max));
    setAutoRangeApplied(true);
  }, [tickets, autoRangeApplied]);

  const filtered = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    const isDeleted = (t) => String(t?.status || "").toUpperCase() === "DELETE";

    return (tickets || []).filter((t) => {
      if (!includeDeleted && isDeleted(t)) return false;
      const d = parseTicketDate(t?.createdAt);
      if (!d) return true;
      return d >= from && d <= to;
    });
  }, [tickets, fromDate, toDate, includeDeleted]);

  const analytics = useMemo(() => {
    const byQuarter = {};
    const bySeasonCategory = {};
    const byCategory = {};
    const byArea = {};

    for (const t of filtered) {
      const d = parseTicketDate(t?.createdAt) || new Date();
      const q = quarterKey(d);
      byQuarter[q] = (byQuarter[q] || 0) + 1;

      const season = seasonLabel(d);
      const cat = String(t?.category || "Unknown").trim() || "Unknown";
      const key = `${season} • ${cat}`;
      bySeasonCategory[key] = (bySeasonCategory[key] || 0) + 1;

      byCategory[cat] = (byCategory[cat] || 0) + 1;

      const area = normalizeArea(t?.location);
      byArea[area] = (byArea[area] || 0) + 1;
    }

    const top = (obj, n = 8) =>
      Object.entries(obj)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, n);

    return {
      quarterItems: top(byQuarter, 8),
      seasonCategoryItems: top(bySeasonCategory, 8),
      categoryItems: top(byCategory, 10),
      areaItems: top(byArea, 10),
    };
  }, [filtered]);

  return (
    <div>
      <div className="reportFilters">
        <div className="reportField">
          <label className="reportLabel">From</label>
          <input
            className="reportInput"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="reportField">
          <label className="reportLabel">To</label>
          <input
            className="reportInput"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div className="reportField reportToggle">
          <label className="reportLabel">Data</label>
          <label className="togglePill">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            <span>Include deleted</span>
          </label>
        </div>

        <div className="reportActions">
          <button
            className="btn"
            type="button"
            onClick={() => downloadTextFile("tickets_report.csv", toCsv(filtered), "text/csv")}
          >
            Download CSV
          </button>

          <button
            className="btn"
            type="button"
            onClick={() =>
              downloadTextFile(
                "tickets_report.json",
                JSON.stringify(
                  {
                    fromDate,
                    toDate,
                    includeDeleted,
                    count: filtered.length,
                    tickets: filtered,
                  },
                  null,
                  2
                ),
                "application/json"
              )
            }
          >
            Download JSON
          </button>
        </div>
      </div>

      <div className="reportSummaryRow">
        <div className="reportSummary">
          <div className="reportSummaryKpi">{filtered.length}</div>
          <div className="reportSummaryLabel">Tickets in range</div>
        </div>
        <div className="reportSummary">
          <div className="reportSummaryKpi">
            {analytics.categoryItems?.[0]?.label ? analytics.categoryItems[0].label : "—"}
          </div>
          <div className="reportSummaryLabel">Top category</div>
        </div>
        <div className="reportSummary">
          <div className="reportSummaryKpi">
            {analytics.quarterItems?.[0]?.label ? analytics.quarterItems[0].label : "—"}
          </div>
          <div className="reportSummaryLabel">Busiest quarter</div>
        </div>
      </div>

      <div className="reportGrid">
        <BarList
          title="Tickets by quarter"
          items={analytics.quarterItems}
          hint="Which quarter had maximum tickets"
        />
        <BarList
          title="Season + category pattern"
          items={analytics.seasonCategoryItems}
          hint="Example: Winter → missed garbage spikes"
        />
        <BarList title="Top categories" items={analytics.categoryItems} />
        <BarList title="Top areas (location heuristic)" items={analytics.areaItems} />
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
        Notes: Trend analysis is based on the currently loaded ticket dataset and updates with the selected date range.
      </div>
    </div>
  );
}