// src/pages/QueueOverviewPanel.jsx
import { useEffect, useState, useMemo } from "react";
import DonutChart from "../components/DonutChart";
import { dismissDuplicate, fetchDuplicates, mergeDuplicate } from "../api/duplicates";

function parseApiDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  const parsed = new Date(hasTimezone ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatAge(iso) {
  const parsed = parseApiDate(iso);
  if (!parsed) return "—";
  const diff = Math.max(0, Date.now() - parsed.getTime());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "< 1m";
}

function fmtCat(c) {
  return String(c || "").replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
}

const STAT_COLOR = { NEW: "#6366f1", NEEDS_REVIEW: "#f59e0b", ESCALATED: "#ef4444", RESOLVED: "#10b981", CLOSED: "#9ca3af", REJECTED: "#dc2626", APPROVED: "#0891b2" };
const CAT_PALETTE = ["#7c3aed","#2563eb","#059669","#d97706","#dc2626","#0891b2","#be185d","#0d9488"];
const DUP_THEME = {
  panelBg: "linear-gradient(135deg, rgba(109,40,217,0.055), rgba(37,99,235,0.045), rgba(34,211,238,0.035))",
  border: "rgba(109,40,217,0.16)",
  rowActive: "#f8fbff",
  pendingText: "#4338ca",
  mergedText: "#047857",
  dismissedText: "#64748b",
  scoreHigh: "#7c3aed",
  scoreMed: "#2563eb",
  scoreLow: "#0891b2",
};

/*
const MOCK_DUPLICATES_UNUSED = [
  { id: "DUP-001", status: "pending", category: "pothole", matchScore: 94, detectedAt: new Date(Date.now() - 3_600_000).toISOString(), original: { id: "311-2026-000030", location: "West Avenue", description: "Large pothole causing traffic issues", caller: "David R.", time: "07:50" }, duplicate: { id: "311-2026-000028", location: "345 King Street North", description: "Big hole in road — very dangerous", caller: "Sam B.", time: "14:00" } },
  { id: "DUP-002", status: "pending", category: "graffiti", matchScore: 88, detectedAt: new Date(Date.now() - 7_200_000).toISOString(), original: { id: "311-2026-000033", location: "Aliette Parliament St", description: "Graffiti tags covering wall", caller: "Maria S.", time: "07:50" }, duplicate: { id: "311-2026-000031", location: "King Street", description: "Spray paint all over the tunnel walls", caller: "Priya K.", time: "06:30" } },
  { id: "DUP-003", status: "merged", category: "pothole", matchScore: 97, detectedAt: new Date(Date.now() - 86_400_000).toISOString(), original: { id: "311-2026-000029", location: "345 King St N", description: "Multiple potholes on road", caller: "Lisa M.", time: "14:20" }, duplicate: { id: "311-2026-000028", location: "345 King Street North", description: "Road damage near school zone", caller: "Sam B.", time: "14:00" } },
];
*/

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>{children}</div>;
}

function Badge({ label, color }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color, background: color + "1a", borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{label}</span>;
}

function KpiCard({ title, value, sub, accent = "#6366f1", onClick }) {
  return (
    <div className="card" onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      style={{ borderTop: `3px solid ${accent}`, cursor: onClick ? "pointer" : "default", padding: "14px 16px" }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#111827", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 2 }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Source Breakdown ──────────────────────────────────────────────────────────
function SourceBreakdown({ tickets, isFR }) {
  const total = tickets.length || 1;
  const voiceBot = tickets.filter(t => String(t.createdByType || "").toUpperCase() === "VOICE_BOT").length;
  const human = total - voiceBot;
  const voicePct = Math.round((voiceBot / total) * 100);
  const humanPct = 100 - voicePct;

  const statuses = useMemo(() => {
    const counts = {};
    tickets.forEach(t => {
      const s = String(t.status || "NEW").toUpperCase();
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [tickets]);

  return (
    <div className="card" style={{ background: "#fbfbff" }}>
      <SectionLabel>{isFR ? "Origine des tickets" : "Ticket Sources"}</SectionLabel>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {[
          { label: "🤖 Voice Bot", count: voiceBot, pct: voicePct, color: "#6366f1" },
          { label: "👤 Human", count: human, pct: humanPct, color: "#0891b2" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "12px 14px", border: `1px solid ${s.color}25` }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "2px 0 6px" }}>{s.label}</div>
            <div style={{ background: "#f3f4f6", borderRadius: 4, height: 6 }}>
              <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 4, transition: "width 0.6s" }} />
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{s.pct}% of all tickets</div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Status Breakdown</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {statuses.map(([status, count]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 105, fontSize: 11, fontWeight: 600, color: STAT_COLOR[status] || "#6b7280", flexShrink: 0 }}>{status.replace(/_/g, " ")}</span>
              <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 8 }}>
                <div style={{ width: `${(count / total) * 100}%`, height: "100%", background: STAT_COLOR[status] || "#9ca3af", borderRadius: 4, transition: "width 0.6s" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", minWidth: 22, textAlign: "right" }}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Category Bar Chart ────────────────────────────────────────────────────────
function CategoryChart({ tickets, isFR }) {
  const counts = useMemo(() => {
    const acc = {};
    tickets.forEach(t => { acc[t.category] = (acc[t.category] || 0) + 1; });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [tickets]);
  const max = counts[0]?.[1] || 1;
  const total = tickets.length || 1;

  return (
    <div className="card" style={{ background: "#fbfbff" }}>
      <SectionLabel>{isFR ? "Tickets par catégorie" : "Tickets by Category"}</SectionLabel>
      {counts.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af" }}>No data</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {counts.map(([cat, count], i) => (
          <div key={cat}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{fmtCat(cat)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
                {count} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({Math.round((count / total) * 100)}%)</span>
              </span>
            </div>
            <div style={{ background: "#f3f4f6", borderRadius: 6, height: 16, overflow: "hidden" }}>
              <div style={{ width: `${(count / max) * 100}%`, height: "100%", background: CAT_PALETTE[i % CAT_PALETTE.length], borderRadius: 6, transition: "width 0.6s ease", display: "flex", alignItems: "center", paddingLeft: 6 }}>
                {(count / max) > 0.25 && <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{count}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Needs Review ──────────────────────────────────────────────────────────────
function NeedsReviewPanel({ tickets, isFR, onRowClick }) {
  const flagged = useMemo(() => tickets.filter(t => t.status === "NEEDS_REVIEW" || t.confidence === "LOW"), [tickets]);
  return (
    <div className="card" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
      <SectionLabel>{isFR ? `⚠️ À réviser (${flagged.length})` : `⚠️ Needs Review (${flagged.length})`}</SectionLabel>
      <div style={{ fontSize: 12, color: "#92400e", marginBottom: 10 }}>
        {isFR ? "Tickets à vérifier manuellement." : "Auto-fill quality is low — city worker should verify before closing."}
      </div>
      {flagged.length === 0 ? (
        <div style={{ textAlign: "center", padding: "18px 0", color: "#9ca3af" }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>✓</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{isFR ? "Tout semble bon !" : "Everything looks good!"}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
          {flagged.map(t => (
            <div key={t.id || t.ticketNumber} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #fde68a", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}
              onClick={() => onRowClick && onRowClick(t, "/dashboard/overview")}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280" }}>{t.ticketNumber}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.location || "—"}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{fmtCat(t.category)} · {t.name || "—"}</div>
              </div>
              <button className="btn primary" style={{ fontSize: 11, padding: "5px 10px", flexShrink: 0 }}>{isFR ? "Réviser" : "Review"}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Duplicate Detection ───────────────────────────────────────────────────────
function DuplicateSection({ isFR, ticketCount = 0 }) {
  const [dupes, setDupes] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const showToast = (msg, color) => { setToastMsg({ msg, color }); setTimeout(() => setToastMsg(null), 3000); };

  const loadDupes = async () => {
    setLoading(true);
    setError("");
    try {
      setDupes(await fetchDuplicates({ limit: 25 }));
    } catch (e) {
      setError(e?.message || "Failed to load duplicate candidates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDupes();
    const handleTicketsChanged = () => loadDupes();
    window.addEventListener("tickets-changed", handleTicketsChanged);
    return () => window.removeEventListener("tickets-changed", handleTicketsChanged);
  }, []);

  const handleMerge = async (id) => {
    try {
      const updated = await mergeDuplicate(id, localStorage.getItem("userName") || "Nagavalli");
      setDupes(p => p.map(d => d.id === id ? updated : d));
      window.dispatchEvent(new Event("tickets-changed"));
      showToast(isFR ? "Tickets fusionnes" : "Tickets merged", "#10b981");
    } catch (e) {
      showToast(e?.message || (isFR ? "Fusion impossible" : "Merge failed"), "#dc2626");
    }
  };

  const handleDismiss = async (id) => {
    try {
      const updated = await dismissDuplicate(id, localStorage.getItem("userName") || "Nagavalli");
      setDupes(p => p.map(d => d.id === id ? updated : d));
      showToast(isFR ? "Marquage retire" : "Flag dismissed", "#6b7280");
    } catch (e) {
      showToast(e?.message || (isFR ? "Action impossible" : "Dismiss failed"), "#dc2626");
    }
  };

  const pending = dupes.filter(d => d.status === "pending").length;
  const merged = dupes.filter(d => d.status === "merged").length;
  const visibleDupes = useMemo(
    () => dupes
      .filter(d => d.status !== "dismissed")
      .sort((a, b) => {
        if (a.status === b.status) return (b.matchScore || 0) - (a.matchScore || 0);
        return a.status === "pending" ? -1 : 1;
      }),
    [dupes]
  );
  const dupRate = ticketCount > 0 ? ((pending / ticketCount) * 100).toFixed(1) : "0.0";

  return (
    <div className="card" style={{ marginTop: 0, background: DUP_THEME.panelBg, borderColor: DUP_THEME.border }}>
      {toastMsg && (
        <div style={{ position: "fixed", top: 20, right: 24, background: toastMsg.color, color: "#fff", padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
          {toastMsg.msg}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>{isFR ? "Detection des doublons" : "Duplicate Ticket Detection"}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {isFR ? "Signalements potentiellement identiques." : "Potentially matching reports grouped for city-worker review."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", background: "#eef2ff", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 10, padding: "8px 16px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#4f46e5" }}>{pending}</div>
            <div style={{ fontSize: 11, color: "#4338ca", fontWeight: 800 }}>{isFR ? "A traiter" : "Need Action"}</div>
          </div>
          <div style={{ textAlign: "center", background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.20)", borderRadius: 10, padding: "8px 16px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#047857" }}>{merged}</div>
            <div style={{ fontSize: 11, color: "#047857", fontWeight: 800 }}>{isFR ? "Fusionnes" : "Merged"}</div>
          </div>
          <div style={{ textAlign: "center", background: "#eff6ff", border: "1px solid rgba(37,99,235,0.18)", borderRadius: 10, padding: "8px 16px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#2563eb" }}>{dupRate}%</div>
            <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 800 }}>{isFR ? "Taux actif" : "Active Rate"}</div>
          </div>
        </div>
      </div>
      {(loading || error) && (
        <div style={{ fontSize: 12, color: error ? "#dc2626" : "#6b7280", marginBottom: 10 }}>
          {loading ? (isFR ? "Chargement des doublons..." : "Loading duplicate candidates...") : error}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", border: "1px solid rgba(109,40,217,0.14)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
        {visibleDupes.length === 0 && !loading && !error && (
          <div style={{ padding: 18, color: "#475569", fontSize: 13, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span>{isFR ? "Aucun doublon actif a reviser." : "No active duplicate candidates need review."}</span>
            <Badge label={isFR ? "A jour" : "Clear"} color="#2563eb" />
          </div>
        )}
        {visibleDupes.map((dup, i) => {
          const isPending = dup.status === "pending";
          const isExpanded = expandedId === dup.id;
          const matchColor = dup.matchScore >= 90 ? DUP_THEME.scoreHigh : dup.matchScore >= 80 ? DUP_THEME.scoreMed : DUP_THEME.scoreLow;
          const statusColor = dup.status === "pending" ? DUP_THEME.pendingText : dup.status === "merged" ? DUP_THEME.mergedText : DUP_THEME.dismissedText;
          return (
            <div key={dup.id} style={{ borderBottom: i < visibleDupes.length - 1 ? "1px solid #eef2f7" : "none" }}>
              <div onClick={() => setExpandedId(isExpanded ? null : dup.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer", background: isExpanded ? DUP_THEME.rowActive : "#fff" }}>
                <span style={{ fontSize: 13, color: "#64748b", width: 12 }}>{isExpanded ? "v" : ">"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{dup.id}</span>
                    <Badge label={fmtCat(dup.category)} color="#7c3aed" />
                    <Badge label={dup.status === "pending" ? (isFR ? "A reviser" : "Pending Review") : dup.status === "merged" ? (isFR ? "Fusionne" : "Merged") : (isFR ? "Ignore" : "Dismissed")}
                      color={statusColor} />
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                    {dup.original.id} - {dup.duplicate.id} · {formatAge(dup.original.createdAt)} / {formatAge(dup.duplicate.createdAt)} {isFR ? "ancien" : "old"}
                  </div>
                </div>
                <div style={{ textAlign: "center", minWidth: 52, flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: matchColor }}>{dup.matchScore}%</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>{isFR ? "similarite" : "match"}</div>
                </div>
                {isPending && (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button className="btn primary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => handleMerge(dup.id)}>{isFR ? "Fusionner" : "Merge"}</button>
                    <button className="btn" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => handleDismiss(dup.id)}>{isFR ? "Ignorer" : "Dismiss"}</button>
                  </div>
                )}
              </div>
              {isExpanded && (
                <div style={{ padding: "0 16px 16px", background: DUP_THEME.rowActive, display: "flex", gap: 12 }}>
                  {[{ label: "CANONICAL", color: "#2563eb", ticket: dup.original }, { label: isFR ? "DOUBLON POSSIBLE" : "POSSIBLE DUPLICATE", color: "#7c3aed", ticket: dup.duplicate }].map(({ label, color, ticket }) => (
                    <div key={label} style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "14px", border: "1px solid " + color + "40" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color, marginBottom: 8 }}>{label}</div>
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", marginBottom: 4 }}>{ticket.id}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{ticket.location || "-"}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, lineHeight: 1.4 }}>{ticket.description || "-"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af" }}>
                        <span>{ticket.caller || "-"}</span><span>{parseApiDate(ticket.createdAt)?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "-"}</span>
                      </div>
                    </div>
                  ))}
                  {Array.isArray(dup.reasonCodes) && dup.reasonCodes.length > 0 && (
                    <div style={{ width: 180, background: "#fff", borderRadius: 10, padding: 14, border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", marginBottom: 8 }}>SIGNALS</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {dup.reasonCodes.map(code => <Badge key={code} label={code.replace(/_/g, " ")} color="#475569" />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function TicketTrends({ tickets, isFR }) {
  const [range, setRange] = useState("week");

  const chartData = useMemo(() => {
    const now = new Date();
    if (range === "today") {
      const hours = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, count: 0 }));
      tickets.forEach(t => { const d = parseApiDate(t.createdAt); if (d && (now - d) / 3_600_000 <= 24) hours[d.getHours()].count++; });
      return hours.slice(0, now.getHours() + 1);
    }
    if (range === "week") {
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (6 - i)); return { label: d.toLocaleDateString("en-CA", { weekday: "short" }), count: 0, date: d.toDateString() }; });
      tickets.forEach(t => { const d = parseApiDate(t.createdAt); if (!d) return; const idx = days.findIndex(x => x.date === d.toDateString()); if (idx >= 0) days[idx].count++; });
      return days;
    }
    if (range === "month") {
      const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (29 - i)); return { label: d.getDate() % 5 === 0 ? d.getDate().toString() : "", fullLabel: d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }), count: 0, date: d.toDateString() }; });
      tickets.forEach(t => { const d = parseApiDate(t.createdAt); if (!d) return; const idx = days.findIndex(x => x.date === d.toDateString()); if (idx >= 0) days[idx].count++; });
      return days;
    }
    if (range === "year") {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((label, i) => ({ label, count: 0, month: i }));
      tickets.forEach(t => { const d = parseApiDate(t.createdAt); if (d && d.getFullYear() === now.getFullYear()) months[d.getMonth()].count++; });
      return months;
    }
    return [];
  }, [tickets, range]);

  const max = Math.max(...chartData.map(d => d.count), 1);
  const totalInRange = chartData.reduce((s, d) => s + d.count, 0);
  const activeBars = chartData.filter(d => d.count > 0);
  const avgPerBar = activeBars.length > 0 ? (totalInRange / activeBars.length).toFixed(1) : 0;
  const peak = chartData.reduce((p, d) => d.count > (p?.count || 0) ? d : p, null);

  const ranges = [
    { key: "today", label: isFR ? "Aujourd'hui" : "Today" },
    { key: "week",  label: isFR ? "7 jours" : "7 Days" },
    { key: "month", label: isFR ? "30 jours" : "30 Days" },
    { key: "year",  label: isFR ? "Cette année" : "This Year" },
  ];

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>📈 {isFR ? "Tendances des tickets" : "Ticket Volume Trends"}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {isFR ? "Volume de tickets sur la période sélectionnée." : "Ticket volume over the selected period — identify peak days and workload patterns."}
          </div>
        </div>
        {/* Range selector */}
        <div style={{ display: "flex", gap: 6 }}>
          {ranges.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid", background: range === r.key ? "#6366f1" : "#fff", color: range === r.key ? "#fff" : "#6b7280", borderColor: range === r.key ? "#6366f1" : "#e5e7eb", transition: "all 0.15s" }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {[
          { label: isFR ? "Total" : "Total Tickets", value: totalInRange, color: "#6366f1" },
          { label: isFR ? "Moyenne" : "Avg per Day", value: avgPerBar, color: "#0891b2" },
          { label: isFR ? "Pic" : "Peak", value: peak ? `${peak.count} (${peak.label})` : "—", color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: "#f9fafb", borderRadius: 8, padding: "10px 12px", border: `1px solid ${s.color}20` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: range === "month" ? 2 : 6, height: 140, paddingBottom: 24, position: "relative" }}>
        {/* Y axis hint lines */}
        {[0.25, 0.5, 0.75, 1].map(p => (
          <div key={p} style={{ position: "absolute", left: 0, right: 0, bottom: 24 + (p * 116), borderTop: "1px dashed #f3f4f6", zIndex: 0 }} />
        ))}
        {chartData.map((d, i) => {
          const h = max > 0 ? Math.max(4, (d.count / max) * 116) : 4;
          const isZero = d.count === 0;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative", zIndex: 1 }} title={`${d.fullLabel || d.label}: ${d.count} tickets`}>
              {d.count > 0 && (
                <div style={{ fontSize: 9, fontWeight: 700, color: "#6366f1", marginBottom: 1 }}>{d.count}</div>
              )}
              <div style={{ width: "100%", height: h, background: isZero ? "#f3f4f6" : "linear-gradient(180deg, #818cf8 0%, #6366f1 100%)", borderRadius: "4px 4px 0 0", transition: "height 0.5s ease", minHeight: 4 }} />
              <div style={{ fontSize: range === "month" ? 8 : 10, color: "#9ca3af", position: "absolute", bottom: 0, whiteSpace: "nowrap" }}>
                {range === "month" ? d.label : d.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Business insight */}
      {totalInRange > 0 && (
        <div style={{ marginTop: 8, background: "#f0f9ff", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0369a1", display: "flex", alignItems: "center", gap: 8 }}>
          <span>💡</span>
          <span>
            {peak && peak.count > 0
              ? (isFR
                ? `Pic d'activité le ${peak.label} avec ${peak.count} tickets. Envisagez plus de ressources ce jour-là.`
                : `Peak activity on ${peak.label} with ${peak.count} tickets. Consider allocating more staff on high-volume days.`)
              : (isFR ? "Aucune activité sur cette période." : "No activity in this period.")}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Filter Bar (horizontal) ───────────────────────────────────────────────────
function FilterBar({ tickets, filters, setFilters, isFR }) {
  const categories = useMemo(() => [...new Set(tickets.map(t => t.category).filter(Boolean))], [tickets]);
  const set = (k, v) => setFilters(p => ({ ...p, [k]: v }));

  return (
    <div className="card" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "nowrap", overflowX: "auto" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", flexShrink: 0 }}>🔍 {isFR ? "Filtres" : "Filters"}:</span>
        <input placeholder={isFR ? "Rechercher…" : "Search tickets, locations…"} value={filters.search} onChange={e => set("search", e.target.value)}
          style={{ minWidth: 180, flex: "0 0 180px", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 12 }} />
        {[
          ["status",   ["ALL", "NEW", "NEEDS_REVIEW", "ESCALATED", "RESOLVED", "CLOSED"], isFR ? "Statut" : "Status"],
          ["category", ["ALL", ...categories],                                             isFR ? "Catégorie" : "Category"],
          ["channel",  ["ALL", "VOICE", "WEB", "PHONE"],                                  isFR ? "Canal" : "Channel"],
          ["severity", ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"],                      isFR ? "Gravité" : "Severity"],
        ].map(([key, opts, placeholder]) => (
          <select key={key} value={filters[key]} onChange={e => set(key, e.target.value)}
            style={{ flex: "0 0 130px", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 12, background: "#fff", cursor: "pointer", color: filters[key] !== "ALL" ? "#6366f1" : "#374151", fontWeight: filters[key] !== "ALL" ? 700 : 400 }}>
            <option value="ALL">{placeholder}</option>
            {opts.filter(o => o !== "ALL").map(o => <option key={o} value={o}>{key === "category" ? fmtCat(o) : o}</option>)}
          </select>
        ))}
        <button className="btn" style={{ fontSize: 12, padding: "7px 12px", flexShrink: 0 }}
          onClick={() => setFilters({ status: "ALL", category: "ALL", channel: "ALL", severity: "ALL", search: "" })}>
          {isFR ? "Effacer" : "Clear"}
        </button>
      </div>
    </div>
  );
}

// ── Ticket Row (avoids fragment key issue) ────────────────────────────────────
function TicketRow({ t, i, isFR, onRowClick }) {
  const [isExp, setIsExp] = useState(false);
  const tdStyle = { padding: "11px 14px", fontSize: 12, color: "#111827", borderBottom: "1px solid #f3f4f6" };
  const sevColor = { CRITICAL: "#dc2626", HIGH: "#ea580c", MEDIUM: "#d97706", LOW: "#16a34a" };
  return (
    <tbody>
      <tr style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", cursor: "pointer" }} onClick={() => setIsExp(v => !v)}>
        <td style={{ ...tdStyle, fontFamily: "monospace", color: "#6366f1" }}>{t.ticketNumber}</td>
        <td style={{ ...tdStyle, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.location || "—"}</td>
        <td style={tdStyle}><Badge label={fmtCat(t.category)} color="#7c3aed" /></td>
        <td style={tdStyle}><Badge label={String(t.status || "").replace(/_/g, " ")} color={STAT_COLOR[String(t.status || "").toUpperCase()] || "#6b7280"} /></td>
        <td style={tdStyle}><Badge label={t.severity || "—"} color={sevColor[String(t.severity || "").toUpperCase()] || "#6b7280"} /></td>
        <td style={{ ...tdStyle, color: "#6b7280" }}>{t.channel === "VOICE" || String(t.createdByType || "").toUpperCase() === "VOICE_BOT" ? "🤖 Voice" : "👤 Human"}</td>
        <td style={{ ...tdStyle, color: "#9ca3af", whiteSpace: "nowrap" }}>{formatAge(t.createdAt)}</td>
        <td style={tdStyle}>
          <button className="btn primary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={e => { e.stopPropagation(); onRowClick && onRowClick(t, "/dashboard/overview"); }}>
            {isFR ? "Voir" : "View"}
          </button>
        </td>
      </tr>
      {isExp && (
        <tr>
          <td colSpan={8} style={{ background: "#f8fafc", padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
              {[[isFR?"Appelant":"Caller",t.name||"—"],[isFR?"Téléphone":"Phone",t.phone||"—"],[isFR?"Département":"Department",t.assignedDepartment||t.department||"—"],[isFR?"Canal":"Channel",t.channel||"—"],[isFR?"Notes":"Notes",t.notes||"—"],[isFR?"Description":"Description",t.description||"—"]].map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", marginBottom: 3 }}>{k}</div>
                  <div style={{ fontSize: 13, color: "#111827" }}>{v}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function QueueOverviewPanel({
  tickets = [],
  isFR = false,
  loadingTickets = false,
  ticketsError = null,
  lastRefreshedAt = null,
  onRefresh,
  onRowClick,
  onNavigate,
  qoCounts = {},
  qoRecentActivity = [],
}) {
  const [filters, setFilters] = useState({ status: "ALL", category: "ALL", channel: "ALL", severity: "ALL", search: "" });

  const kpis = [
    { title: isFR ? "Tickets visibles" : "Visible Tickets",  value: qoCounts.visible    ?? 0, sub: isFR ? "Selon votre rôle"  : "Visible to your role",    accent: "#6366f1", preset: "ACTIVE"      },
    { title: isFR ? "Actifs"           : "Active",           value: qoCounts.active     ?? 0, sub: isFR ? "Non résolus"        : "Not resolved",            accent: "#2563eb", preset: "ACTIVE"      },
    { title: isFR ? "À valider"        : "Needs Review",     value: qoCounts.needsReview?? 0, sub: isFR ? "Triage requis"      : "Triage attention",        accent: "#f59e0b", preset: "NEEDS_REVIEW" },
    { title: isFR ? "Escaladés"        : "Escalated",        value: qoCounts.escalated  ?? 0, sub: isFR ? "Superviseur requis" : "Supervisor / specialist", accent: "#ef4444", preset: "ESCALATED"   },
    { title: isFR ? "Résolus"          : "Resolved",         value: qoCounts.resolved   ?? 0, sub: isFR ? "Fermés"             : "Closed",                  accent: "#10b981", preset: "RESOLVED"    },
  ];

  return (
    <div id="queue-overview" className="qoShell" style={{ scrollMarginTop: 92 }}>


      {/* ── Title + refresh ── */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, marginBottom: 4 }}>{isFR ? "Vue d'ensemble" : "Queue Overview"}</h3>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{isFR ? "Tableau de bord opérationnel en temps réel." : "Real-time operational dashboard for city workers."}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {loadingTickets && <span className="pill">{isFR ? "Actualisation…" : "Refreshing…"}</span>}
          {!!ticketsError && !loadingTickets && <span className="pill pillError">Offline / error</span>}
          {lastRefreshedAt && !loadingTickets && (
            <span className="pill">{isFR ? "Actualisé" : "Refreshed"}: {new Date(lastRefreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          )}
          <button className="btn" onClick={onRefresh} disabled={loadingTickets}>{isFR ? "Actualiser" : "Refresh"}</button>
          <button className="btn" onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6 }}>🖨️ {isFR ? "Imprimer" : "Print"}</button>
        </div>
      </div>

      {/* ── Alert strip ── */}
      <div className="qoAlertStrip" role="status">
        {(qoCounts.needsReview ?? 0) > 0
          ? <span className="pill pillWarn">⚠️ {qoCounts.needsReview} {isFR ? "à valider" : "need review"}</span>
          : <span className="pill pillOk">✓ {isFR ? "Aucun triage en attente" : "No triage backlog"}</span>}
        {(qoCounts.escalated ?? 0) > 0
          ? <span className="pill pillEsc">🔺 {qoCounts.escalated} {isFR ? "escaladé(s)" : "escalated"}</span>
          : <span className="pill">{isFR ? "Escalade : 0" : "Escalations: 0"}</span>}
        <span className="pill">⏱ {isFR ? "Dernier" : "Newest"}: {qoRecentActivity[0] ? formatAge(qoRecentActivity[0]?.createdAt) : "—"}</span>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10 }}>
        {kpis.map(k => (
          <KpiCard key={k.title} title={k.title} value={k.value} sub={k.sub} accent={k.accent}
            onClick={() => onNavigate && onNavigate("/dashboard/my-work", { state: { queuePreset: k.preset } })} />
        ))}
      </div>

      {/* ── Filters (horizontal) ── */}
      <FilterBar tickets={tickets} filters={filters} setFilters={setFilters} isFR={isFR} />

      {/* ── Analytics row: Source + Category + Needs Review ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "start" }}>
        <SourceBreakdown tickets={tickets} isFR={isFR} />
        <CategoryChart tickets={tickets} isFR={isFR} />
        <NeedsReviewPanel tickets={tickets} isFR={isFR} onRowClick={onRowClick} />
      </div>

      {/* ── Duplicate Detection (moved up) ── */}
      <DuplicateSection isFR={isFR} ticketCount={tickets.length} />

      {/* ── Ticket Trends (replaces live feed) ── */}
      <TicketTrends tickets={tickets} isFR={isFR} />

    </div>
  );
}
