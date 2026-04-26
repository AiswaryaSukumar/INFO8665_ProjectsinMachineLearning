// src/pages/QueueOverviewPanel.jsx
import { useState, useMemo, useEffect } from "react";
import DonutChart from "../components/DonutChart";
import MapPanel from "./MapPanel";
import { fetchPenalties } from "../api/tickets";
import { fetchDuplicates, mergeDuplicate, dismissDuplicate } from "../api/duplicates";

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

function getResidenceInfo(iso) {
  if (!iso) return { label: "—", color: "#9ca3af", urgent: false };
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const color  = h >= 24 ? "#ef4444" : h >= 8 ? "#f59e0b" : "#10b981";
  return { label, color, urgent: h >= 24 };
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

function SectionLabel({ children }) {
  return <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>{children}</div>;
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
  const total    = tickets.length || 1;
  const botTickets = tickets.filter(t => String(t.createdByType || "").toUpperCase() === "VOICE_BOT");
  const voiceBot = botTickets.length;
  const human    = total - voiceBot;
  const voicePct = Math.round((voiceBot / total) * 100);
  const humanPct = 100 - voicePct;

  // Bot accuracy metrics
  const botRejected = botTickets.filter(t => String(t.status || "").toUpperCase() === "REJECTED").length;
  const botModified = botTickets.filter(t =>
    t.handledByType && String(t.handledByType).toUpperCase() !== "VOICE_BOT" &&
    String(t.status || "").toUpperCase() !== "REJECTED"
  ).length;
  const botClean    = voiceBot - botRejected - botModified;
  const botAccuracy = voiceBot > 0 ? Math.round((botClean / voiceBot) * 100) : 100;
  const accColor    = botAccuracy >= 80 ? "#10b981" : botAccuracy >= 60 ? "#f59e0b" : "#ef4444";

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
          { label: "👤 Human",     count: human,    pct: humanPct, color: "#0891b2" },
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

      {/* Voice Bot Accuracy */}
      {voiceBot > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid #e5e7eb", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            🤖 {isFR ? "Précision Voice Bot" : "Voice Bot Accuracy"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: accColor }}>{botAccuracy}%</div>
            <div style={{ flex: 1 }}>
              <div style={{ background: "#f3f4f6", borderRadius: 4, height: 8 }}>
                <div style={{ width: `${botAccuracy}%`, height: "100%", background: accColor, borderRadius: 4, transition: "width 0.6s" }} />
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                {isFR ? "Tickets acceptés sans modification" : "Accepted without modification"}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {[
              { label: isFR ? "✓ Acceptés" : "✓ Clean",    count: botClean,    color: "#10b981" },
              { label: isFR ? "✏ Modifiés" : "✏ Modified", count: botModified, color: "#f59e0b" },
              { label: isFR ? "✕ Rejetés"  : "✕ Rejected", count: botRejected, color: "#ef4444" },
            ].map(item => (
              <div key={item.label} style={{ textAlign: "center", background: item.color + "10", borderRadius: 8, padding: "6px 4px" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.count}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Status Breakdown</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {statuses.map(([status, count]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 105, fontSize: 13, fontWeight: 600, color: STAT_COLOR[status] || "#6b7280", flexShrink: 0 }}>{status.replace(/_/g, " ")}</span>
              <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 8 }}>
                <div style={{ width: `${(count / total) * 100}%`, height: "100%", background: STAT_COLOR[status] || "#9ca3af", borderRadius: 4, transition: "width 0.6s" }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", minWidth: 22, textAlign: "right" }}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Category Bar Chart ────────────────────────────────────────────────────────
function CategoryChart({ tickets, isFR }) {
  const [selectedMonth, setSelectedMonth] = useState("ALL");

  const months = useMemo(() => {
    const seen = new Set();
    tickets.forEach(t => {
      if (!t.createdAt) return;
      const d = new Date(t.createdAt);
      if (isNaN(d)) return;
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return [...seen].sort().reverse();
  }, [tickets]);

  const filtered = useMemo(() => {
    if (selectedMonth === "ALL") return tickets;
    return tickets.filter(t => {
      const d = new Date(t.createdAt || "");
      if (isNaN(d)) return false;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === selectedMonth;
    });
  }, [tickets, selectedMonth]);

  const counts = useMemo(() => {
    const acc = {};
    filtered.forEach(t => { acc[t.category] = (acc[t.category] || 0) + 1; });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const max   = counts[0]?.[1] || 1;
  const total = filtered.length || 1;

  return (
    <div className="card" style={{ background: "#fbfbff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <SectionLabel>{isFR ? "Tickets par catégorie" : "Tickets by Category"}</SectionLabel>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          style={{ fontSize: 11, padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, color: "#374151", background: "#fff", cursor: "pointer" }}>
          <option value="ALL">{isFR ? "Toutes périodes" : "All Time"}</option>
          {months.map(m => {
            const [y, mo] = m.split("-");
            const label = new Date(+y, +mo - 1).toLocaleDateString("en-CA", { year: "numeric", month: "short" });
            return <option key={m} value={m}>{label}</option>;
          })}
        </select>
      </div>
      {counts.length === 0
        ? <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>No data</div>
        : (
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
        )}
    </div>
  );
}

// ── Needs Review ──────────────────────────────────────────────────────────────
function NeedsReviewPanel({ tickets, isFR, onRowClick }) {
  const flagged = useMemo(() =>
    tickets
      .filter(t => t.status === "NEEDS_REVIEW" || t.confidence === "LOW")
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)),
  [tickets]);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 500, overflowY: "auto" }}>
          {flagged.map(t => {
            const res = getResidenceInfo(t.createdAt);
            return (
              <div key={t.id || t.ticketNumber} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: `1px solid ${res.urgent ? "#fca5a5" : "#fde68a"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}
                onClick={() => onRowClick && onRowClick(t, "/dashboard/overview")}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontFamily: "Consolas, 'Cascadia Code', monospace", color: "#6b7280" }}>{t.ticketNumber}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.location || "—"}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{fmtCat(t.category)} · {t.name || "—"}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: res.color, background: res.color + "15", borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>
                    ⏱ {res.label}
                  </span>
                  <button className="btn primary" style={{ fontSize: 11, padding: "5px 10px" }}>{isFR ? "Réviser" : "Review"}</button>
                </div>
              </div>
            );
          })}
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
  const [filterPending, setFilterPending] = useState(false);

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
      const updated = await mergeDuplicate(id, localStorage.getItem("userName") || "Supervisor");
      setDupes(p => p.map(d => d.id === id ? updated : d));
      window.dispatchEvent(new Event("tickets-changed"));
      showToast(isFR ? "Tickets fusionnés" : "Tickets merged", "#10b981");
    } catch (e) {
      showToast(e?.message || (isFR ? "Fusion impossible" : "Merge failed"), "#dc2626");
    }
  };

  const handleDismiss = async (id) => {
    try {
      const updated = await dismissDuplicate(id, localStorage.getItem("userName") || "Supervisor");
      setDupes(p => p.map(d => d.id === id ? updated : d));
      showToast(isFR ? "Marquage retiré" : "Flag dismissed", "#6b7280");
    } catch (e) {
      showToast(e?.message || (isFR ? "Action impossible" : "Dismiss failed"), "#dc2626");
    }
  };

  const pending = dupes.filter(d => d.status === "pending").length;
  const merged = dupes.filter(d => d.status === "merged").length;
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const visibleDupes = useMemo(
    () => dupes
      .filter(d => d.status !== "dismissed")
      .filter(d => filterPending ? d.status === "pending" : true)
      .filter(d => {
        const t1 = new Date(d.original?.createdAt || 0).getTime();
        const t2 = new Date(d.duplicate?.createdAt || 0).getTime();
        return t1 > 0 && t2 > 0 && Math.abs(t1 - t2) <= TWO_DAYS_MS;
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        const ta = new Date(a.detectedAt || 0).getTime();
        const tb = new Date(b.detectedAt || 0).getTime();
        return tb - ta;
      }),
    [dupes, filterPending]
  );
  const dupRate = ticketCount > 0 ? ((pending / ticketCount) * 100).toFixed(1) : "0.0";

  return (
    <div className="card" style={{ marginTop: 0, background: DUP_THEME.panelBg, borderColor: DUP_THEME.border }}>
      {toastMsg && (
        <div style={{ position: "fixed", top: 20, right: 24, background: toastMsg.color, color: "#fff", padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
          {toastMsg.msg}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 14, color: "#111827" }}>{isFR ? "Détection des doublons" : "Duplicate Ticket Detection"}</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
            {isFR ? "Signalements potentiellement identiques." : "Potentially matching reports grouped for city-worker review."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <div
            onClick={() => setFilterPending(f => !f)}
            style={{ textAlign: "center", background: filterPending ? "#4f46e5" : "#eef2ff", border: filterPending ? "2px solid #4f46e5" : "1px solid rgba(99,102,241,0.18)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", transition: "all 0.15s" }}
          >
            <div style={{ fontSize: 15, fontWeight: 900, color: filterPending ? "#fff" : "#4f46e5" }}>{pending}</div>
            <div style={{ fontSize: 10, color: filterPending ? "#c7d2fe" : "#4338ca", fontWeight: 800 }}>{isFR ? "À traiter" : "Need Action"}</div>
          </div>
          <div style={{ textAlign: "center", background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.20)", borderRadius: 8, padding: "4px 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#047857" }}>{merged}</div>
            <div style={{ fontSize: 10, color: "#047857", fontWeight: 800 }}>{isFR ? "Fusionnés" : "Merged"}</div>
          </div>
        </div>
      </div>
      {(loading || error) && (
        <div style={{ fontSize: 12, color: error ? "#dc2626" : "#6b7280", marginBottom: 8 }}>
          {loading ? (isFR ? "Chargement des doublons..." : "Loading duplicate candidates...") : error}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", border: "1px solid rgba(109,40,217,0.14)", borderRadius: 10, overflow: "hidden", background: "#fff", maxHeight: 320, overflowY: "auto" }}>
        {visibleDupes.length === 0 && !loading && !error && (
          <div style={{ padding: 18, color: "#475569", fontSize: 13, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span>{isFR ? "Aucun doublon actif à réviser." : "No active duplicate candidates need review."}</span>
            <Badge label={isFR ? "À jour" : "Clear"} color="#2563eb" />
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
                <span style={{ fontSize: 13, color: "#64748b", width: 12 }}>{isExpanded ? "▾" : "▸"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "Consolas, 'Cascadia Code', monospace", fontSize: 11, color: "#6b7280" }}>{dup.id}</span>
                    <Badge label={fmtCat(dup.category)} color="#7c3aed" />
                    <Badge label={dup.status === "pending" ? (isFR ? "À réviser" : "Pending Review") : dup.status === "merged" ? (isFR ? "Fusionné" : "Merged") : (isFR ? "Ignoré" : "Dismissed")}
                      color={statusColor} />
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                    {dup.original.id} - {dup.duplicate.id} · {formatAge(dup.original.createdAt)} / {formatAge(dup.duplicate.createdAt)} {isFR ? "ancien" : "old"}
                  </div>
                </div>
                <div style={{ textAlign: "center", minWidth: 52, flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: matchColor }}>{dup.matchScore}%</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>{isFR ? "similarité" : "match"}</div>
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
                      <div style={{ fontSize: 11, fontFamily: "Consolas, 'Cascadia Code', monospace", color: "#6b7280", marginBottom: 4 }}>{ticket.id}</div>
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

// ── Ticket Trends Chart ───────────────────────────────────────────────────────
function TicketTrends({ tickets, isFR }) {
  const [range, setRange] = useState("week");

  const parseDate = iso => {
    const s = String(iso || "");
    const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
    return isNaN(d.getTime()) ? null : d;
  };

  const chartData = useMemo(() => {
    const now = new Date();
    if (range === "today") {
      const hours = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, count: 0 }));
      tickets.forEach(t => { const d = parseDate(t.createdAt); if (d && (now - d) / 3_600_000 <= 24) hours[d.getHours()].count++; });
      return hours.slice(0, now.getHours() + 1);
    }
    if (range === "week") {
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (6 - i)); return { label: d.toLocaleDateString("en-CA", { weekday: "short" }), count: 0, date: d.toDateString() }; });
      tickets.forEach(t => { const d = parseDate(t.createdAt); if (!d) return; const idx = days.findIndex(x => x.date === d.toDateString()); if (idx >= 0) days[idx].count++; });
      return days;
    }
    if (range === "month") {
      const days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - (29 - i));
        const day = d.getDate();
        const show = day === 1 || day % 7 === 0;
        const label = show ? d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "";
        return { label, fullLabel: d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }), count: 0, date: d.toDateString() };
      });
      tickets.forEach(t => { const d = parseDate(t.createdAt); if (!d) return; const idx = days.findIndex(x => x.date === d.toDateString()); if (idx >= 0) days[idx].count++; });
      return days;
    }
    if (range === "year") {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((label, i) => ({ label, count: 0, month: i }));
      tickets.forEach(t => { const d = parseDate(t.createdAt); if (d && d.getFullYear() === now.getFullYear()) months[d.getMonth()].count++; });
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
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
          { label: isFR ? "Pic" : "Peak", value: peak ? `${peak.count} (${peak.fullLabel || peak.label})` : "—", color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: "#f9fafb", borderRadius: 8, padding: "10px 12px", border: `1px solid ${s.color}20` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bar chart — bars area */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: range === "month" ? 2 : 6, height: 156, position: "relative" }}>
        {/* Y axis hint lines */}
        {[0.25, 0.5, 0.75, 1].map(p => (
          <div key={p} style={{ position: "absolute", left: 0, right: 0, bottom: p * 116, borderTop: "1px dashed #f3f4f6", zIndex: 0 }} />
        ))}
        {chartData.map((d, i) => {
          const h = max > 0 ? Math.max(4, (d.count / max) * 116) : 4;
          const isZero = d.count === 0;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, zIndex: 1 }} title={`${d.fullLabel || d.label}: ${d.count} tickets`}>
              {d.count > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>{d.count}</div>
              )}
              <div style={{ width: "100%", height: h, background: isZero ? "#f3f4f6" : "linear-gradient(180deg, #818cf8 0%, #6366f1 100%)", borderRadius: "4px 4px 0 0", transition: "height 0.5s ease", minHeight: 4 }} />
            </div>
          );
        })}
      </div>
      {/* X-axis labels — always below bars, never overlapping */}
      <div style={{ display: "flex", gap: range === "month" ? 2 : 6, marginTop: 4 }}>
        {chartData.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: range === "month" ? 11 : 12, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.label}
          </div>
        ))}
      </div>

      {/* Business insight */}
      {totalInRange > 0 && (
        <div style={{ marginTop: 8, background: "#f0f9ff", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0369a1", display: "flex", alignItems: "center", gap: 8 }}>
          <span>💡</span>
          <span>
            {peak && peak.count > 0
              ? (isFR
                ? `Pic d'activité le ${peak.fullLabel || peak.label} avec ${peak.count} tickets. Envisagez plus de ressources ce jour-là.`
                : `Peak activity on ${peak.fullLabel || peak.label} with ${peak.count} tickets. Consider allocating more staff on high-volume days.`)
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
        <td style={{ ...tdStyle, fontFamily: "Consolas, 'Cascadia Code', monospace", color: "#6366f1" }}>{t.ticketNumber}</td>
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

// ── False Report Penalty Panel ────────────────────────────────────────────────
function FalseReportPanel({ tickets, isFR }) {
  const [penalties, setPenalties] = useState(null);

  useEffect(() => {
    fetchPenalties()
      .then(data => setPenalties(data))
      .catch(() => setPenalties({ total: 0, flagged: 0, penalties: [] }));
  }, [tickets]); // refresh when tickets change

  const falseCount = useMemo(
    () => tickets.filter(t => t.isFalseReport).length,
    [tickets]
  );

  const list = penalties?.penalties || [];
  const flaggedList = list.filter(p => p.flagged);

  return (
    <div className="card" style={{ background: falseCount > 0 ? "#fffbeb" : "#fbfbff", border: falseCount > 0 ? "1px solid #fde68a" : undefined }}>
      <SectionLabel>⚑ {isFR ? "Signalements abusifs" : "False Report Penalties"}</SectionLabel>

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: isFR ? "Faux signalements" : "False Reports",  count: falseCount,             bg: "#fffbeb", color: "#d97706" },
          { label: isFR ? "Numéros suivis"    : "Numbers Tracked", count: list.length,            bg: "#f5f3ff", color: "#7c3aed" },
          { label: isFR ? "Numéros bloqués"   : "Flagged Numbers", count: flaggedList.length,     bg: "#fef2f2", color: "#dc2626" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign: "center", padding: "14px 0", color: "#9ca3af", fontSize: 13 }}>
          {isFR ? "Aucun abus détecté." : "No penalty records yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {list.map(p => (
            <div key={p.phone_number} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#fff", borderRadius: 8, padding: "9px 12px",
              border: `1px solid ${p.flagged ? "#fca5a5" : "#e5e7eb"}`,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "0.04em" }}>
                  {p.phone_number}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  {isFR ? "Dernier" : "Last"}: {p.last_reported ? new Date(p.last_reported).toLocaleDateString() : "—"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#d97706" }}>
                  {p.report_count}× {isFR ? "signalé" : "reported"}
                </span>
                {p.flagged && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 6, padding: "2px 8px" }}>
                    FLAGGED
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {flaggedList.length > 0 && (
        <div style={{ marginTop: 10, background: "#fef2f2", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#dc2626" }}>
          ⚠ {flaggedList.length} {isFR ? "numéro(s) ont dépassé le seuil de 3 faux signalements." : `number${flaggedList.length > 1 ? "s" : ""} exceeded the 3 false-report threshold.`}
        </div>
      )}
    </div>
  );
}

// ── SLA Overview Panel ────────────────────────────────────────────────────────
function SlaPanel({ tickets, isFR, onRowClick }) {
  const now = Date.now();
  const [activeFilter, setActiveFilter] = useState(null);

  const active = tickets.filter(t => {
    const s = String(t.status || "").toUpperCase();
    return s !== "RESOLVED" && s !== "DELETE" && s !== "REJECTED";
  });

  const overdueTickets = active.filter(t => t.isOverdue === true);

  const dueSoonTickets = active.filter(t => {
    if (t.isOverdue) return false;
    if (!t.slaDeadline) return false;
    const ms = new Date(t.slaDeadline).getTime() - now;
    return ms > 0 && ms <= 24 * 3_600_000;
  });

  const withSla = active.filter(t => t.slaDeadline);
  const onTrackTickets = withSla.filter(t => !t.isOverdue && (() => {
    const ms = new Date(t.slaDeadline).getTime() - now;
    return ms > 24 * 3_600_000;
  })());

  const fmtDeadline = iso => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const fmtTimeLeft = iso => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - now;
    if (ms <= 0) {
      const over = Math.abs(ms);
      const h = Math.floor(over / 3_600_000);
      return { label: h > 0 ? `${h}h overdue` : "Just overdue", color: "#dc2626" };
    }
    const h = Math.ceil(ms / 3_600_000);
    if (h <= 24) return { label: `${h}h left`, color: "#c2410c" };
    return { label: `${Math.ceil(h / 24)}d left`, color: "#15803d" };
  };

  const filterDefs = [
    { key: "overdue",  label: isFR ? "En retard" : "Overdue",   count: overdueTickets.length,  bg: "#fef2f2", color: "#dc2626", tickets: overdueTickets },
    { key: "dueSoon",  label: isFR ? "Bientôt"  : "Due < 24h",  count: dueSoonTickets.length,  bg: "#fff7ed", color: "#c2410c", tickets: dueSoonTickets },
    { key: "onTrack",  label: isFR ? "OK"       : "On Track",   count: onTrackTickets.length,  bg: "#f0fdf4", color: "#15803d", tickets: onTrackTickets },
  ];

  const listTickets = (() => {
    if (activeFilter) {
      const def = filterDefs.find(f => f.key === activeFilter);
      return (def?.tickets || []).sort((a, b) => new Date(a.slaDeadline || 0) - new Date(b.slaDeadline || 0));
    }
    return [...overdueTickets, ...dueSoonTickets]
      .sort((a, b) => new Date(a.slaDeadline || 0) - new Date(b.slaDeadline || 0))
      .slice(0, 8);
  })();

  return (
    <div className="card" style={{ background: "#fff" }}>
      <SectionLabel>⏰ {isFR ? "Suivi SLA" : "SLA Tracking"}</SectionLabel>

      {/* Summary row — clickable */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {filterDefs.map(s => {
          const isActive = activeFilter === s.key;
          return (
            <div key={s.key}
              onClick={() => setActiveFilter(isActive ? null : s.key)}
              style={{
                background: s.bg, borderRadius: 10, padding: "10px 12px", textAlign: "center",
                cursor: "pointer", border: isActive ? `2px solid ${s.color}` : "2px solid transparent",
                boxShadow: isActive ? `0 0 0 2px ${s.color}30` : "none",
                transition: "border 0.15s, box-shadow 0.15s",
              }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
              {isActive && <div style={{ fontSize: 10, color: s.color, fontWeight: 700, marginTop: 3 }}>▲ {isFR ? "Filtré" : "Filtered"}</div>}
            </div>
          );
        })}
      </div>

      {activeFilter && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
            {filterDefs.find(f => f.key === activeFilter)?.label} — {listTickets.length} {isFR ? "ticket(s)" : "ticket(s)"}
          </span>
          <button className="btn" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setActiveFilter(null)}>
            {isFR ? "Effacer" : "Clear"}
          </button>
        </div>
      )}

      {listTickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "18px 0", color: "#9ca3af" }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>✓</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            {activeFilter === "onTrack"
              ? (isFR ? "Aucun ticket en cours de suivi SLA." : "No tickets with active SLA tracking.")
              : (isFR ? "Tous les tickets sont dans les délais !" : "All tickets within SLA!")}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 300, overflowY: "auto" }}>
          {listTickets.map(t => {
            const tl = fmtTimeLeft(t.slaDeadline);
            const borderColor = t.isOverdue ? "#fca5a5" : (() => { const ms = new Date(t.slaDeadline || 0).getTime() - now; return ms <= 24 * 3_600_000 ? "#fed7aa" : "#d1fae5"; })();
            return (
              <div key={t.id || t.ticketNumber}
                style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: `1px solid ${borderColor}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}
                onClick={() => onRowClick?.(t, "/dashboard/overview")}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontFamily: "Consolas, 'Cascadia Code', monospace", color: "#6b7280" }}>{t.ticketNumber}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fmtCat(t.category)} · {t.location || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {isFR ? "Échéance" : "Deadline"}: {fmtDeadline(t.slaDeadline)}
                  </div>
                </div>
                {tl && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: tl.color, background: tl.color + "15", borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {tl.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function QueueOverviewPanel({
  tickets = [],
  isFR = false,
  userName = "",
  userRole = "OPERATOR",
  loadingTickets = false,
  ticketsError = null,
  lastRefreshedAt = null,
  onRefresh,
  onRowClick,
  onNavigate,
  qoCounts = {},
  qoRecentActivity = [],
  systemDonutStats = {},
  myAllDonutStats = {},
}) {
  const [filters, setFilters] = useState({ status: "ALL", category: "ALL", channel: "ALL", severity: "ALL", search: "" });

  const kpis = [
    { title: isFR ? "Tickets visibles" : "Visible Tickets",  value: qoCounts.visible    ?? 0, sub: isFR ? "Selon votre rôle"  : "Visible to your role",    accent: "#6366f1", preset: "ACTIVE"      },
    { title: isFR ? "Actifs"           : "Active",           value: qoCounts.active     ?? 0, sub: isFR ? "Non résolus"        : "Not resolved",            accent: "#2563eb", preset: "ACTIVE"      },
    { title: isFR ? "À valider"        : "Needs Review",     value: qoCounts.needsReview?? 0, sub: isFR ? "Triage requis"      : "Triage attention",        accent: "#f59e0b", preset: "NEEDS_REVIEW" },
    { title: isFR ? "Escaladés"        : "Escalated",        value: qoCounts.escalated  ?? 0, sub: isFR ? "Superviseur requis" : "Supervisor / specialist", accent: "#ef4444", preset: "ESCALATED"   },
    { title: isFR ? "Résolus"          : "Resolved",         value: qoCounts.resolved   ?? 0, sub: isFR ? "Fermés"             : "Closed",                  accent: "#10b981", preset: "RESOLVED"    },
    { title: isFR ? "SLA dépassé"      : "Overdue SLA",      value: qoCounts.overdue    ?? 0, sub: isFR ? "Hors délai"         : "Past deadline",           accent: "#dc2626", preset: "ACTIVE"      },
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
        {(qoCounts.overdue ?? 0) > 0
          ? <span className="pill" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>🚨 {qoCounts.overdue} {isFR ? "SLA dépassé" : "SLA overdue"}</span>
          : <span className="pill pillOk">✓ {isFR ? "SLA respecté" : "SLA on track"}</span>}
        <span className="pill">⏱ {isFR ? "Dernier" : "Newest"}: {qoRecentActivity[0] ? formatAge(qoRecentActivity[0]?.createdAt) : "—"}</span>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 10 }}>
        {kpis.map(k => (
          <KpiCard key={k.title} title={k.title} value={k.value} sub={k.sub} accent={k.accent}
            onClick={() => onNavigate && onNavigate("/dashboard/my-work", { state: { queuePreset: k.preset } })} />
        ))}
      </div>

      {/* ── Filters (horizontal) ── */}
      <FilterBar tickets={tickets} filters={filters} setFilters={setFilters} isFR={isFR} />

      {/* ── Analytics row: Source + Category + Needs Review ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "stretch" }}>
        <SourceBreakdown tickets={tickets} isFR={isFR} />
        <CategoryChart tickets={tickets} isFR={isFR} />
        <NeedsReviewPanel tickets={tickets} isFR={isFR} onRowClick={onRowClick} />
      </div>

      <hr style={{ border: "none", borderTop: "3px double #e5e7eb", margin: "4px 0" }} />

      {/* ── Ticket Volume Trends (2fr) + Duplicate Detection (1fr) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "stretch", minHeight: 420 }}>
        <TicketTrends tickets={tickets} isFR={isFR} />
        <DuplicateSection isFR={isFR} ticketCount={tickets.length} />
      </div>

      <hr style={{ border: "none", borderTop: "3px double #e5e7eb", margin: "4px 0" }} />

      {/* ── SLA Tracking + False Report ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "stretch" }}>
        <SlaPanel tickets={tickets} isFR={isFR} onRowClick={onRowClick} />
        <FalseReportPanel tickets={tickets} isFR={isFR} />
      </div>

      <hr style={{ border: "none", borderTop: "3px double #e5e7eb", margin: "4px 0" }} />

      {/* ── Complaint Map ── */}
      <MapPanel isFR={isFR} />

    </div>
  );
}
