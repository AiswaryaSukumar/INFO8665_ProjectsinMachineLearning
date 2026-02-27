// src/components/TicketStatusOverview.jsx
import { useMemo } from "react";

const low = (v) => String(v ?? "").trim().toLowerCase();

export default function TicketStatusOverview({
  tickets = [],
  queueFilter = "ALL",
  onChangeFilter,
  loading = false,
  error = false,
  onRefresh,
  lastRefreshedAt,
}) {
  const sessionRole = (localStorage.getItem("userRole") || "OPERATOR").toUpperCase();
  const sessionName = low(localStorage.getItem("userName"));
  const isSupervisor = sessionRole === "SUPERVISOR";

  const isResolved = (t) => String(t?.status || "").toUpperCase() === "RESOLVED";
  const isInProgress = (t) => String(t?.status || "").toUpperCase() === "IN_PROGRESS";
  const isEscalated = (t) => String(t?.status || "").toUpperCase() === "ESCALATED";

  // ✅ keep normalized approved check
  const isApproved = (t) => String(t?.routingStatus || "").toUpperCase() === "APPROVED";

  const isPureVoiceBot = (t) =>
    String(t?.createdByType || "").toUpperCase() === "VOICE_BOT" &&
    String(t?.handledByRole || "VOICE_BOT").toUpperCase() === "VOICE_BOT" &&
    String(t?.handledByType || "VOICE_BOT").toUpperCase() === "VOICE_BOT";

  const isBotOnlyPendingApproval = (t) => {
    const stage = String(t?.workflowStage || "").toUpperCase();
    const legacyPending = isPureVoiceBot(t) && !isApproved(t) && !isResolved(t);
    return stage === "PENDING_SUPERVISOR_APPROVAL" || legacyPending;
  };

  const visibleTickets = useMemo(() => {
    if (isSupervisor) return tickets;

    // ✅ Policy-safe: operator visibility is only their handled/legacy tickets
    return tickets.filter((t) => {
      const handled = low(t?.handledByName) === sessionName;
      const legacy = low(t?.createdByName) === sessionName;
      return handled || legacy;
    });
  }, [tickets, isSupervisor, sessionName]);

  const stats = useMemo(() => {
    const approvalNeededAll = visibleTickets.filter(isBotOnlyPendingApproval).length;

    const mine = visibleTickets.filter((t) => {
      const handled = low(t?.handledByName) === sessionName;
      const legacy = low(t?.createdByName) === sessionName;
      return (handled || legacy) && !isResolved(t);
    }).length;

    const inProgress = visibleTickets.filter(isInProgress).length;
    const escalated = visibleTickets.filter(isEscalated).length;
    const resolved = visibleTickets.filter(isResolved).length;

    const humanHandled = visibleTickets.filter((t) => !isPureVoiceBot(t)).length;
    const botOnlyVisible = visibleTickets.filter(isPureVoiceBot).length;

    const allActive = visibleTickets.filter((t) => !isResolved(t)).length;

    return {
      approvalNeededAll,
      mine,
      inProgress,
      escalated,
      resolved,
      humanHandled,
      botOnlyVisible,
      allActive,
    };
  }, [visibleTickets, sessionName]);

  const LaneBtn = ({ id, label, count }) => {
    const active = queueFilter === id;

    return (
      <button
        className="btn"
        onClick={() => onChangeFilter?.(id)}
        aria-pressed={active}
        type="button"
        disabled={loading}
        style={{
          padding: "8px 12px",
          borderRadius: 12,
          border: active ? "2px solid #2563eb" : "1px solid #e5e7eb",
          background: active ? "#eff6ff" : "white",
          display: "flex",
          gap: 8,
          alignItems: "center",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
        title={label}
      >
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span
          style={{
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#f3f4f6",
            fontWeight: 900,
          }}
        >
          {count}
        </span>
      </button>
    );
  };

  // ✅ Quick filter toggle (Supervisor only)
  const approvalsOnly = queueFilter === "APPROVAL";

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Queue Overview</h3>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Showing tickets visible to you (
            {isSupervisor ? "Supervisor sees all" : "Operator sees assigned/handled tickets"}).
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {loading && <span className="pill">Refreshing…</span>}
          {error && !loading && <span className="pill pillError">Offline / error</span>}

          {lastRefreshedAt && !loading ? (
            <span className="pill" title="Last refresh time">
              Last refreshed: {new Date(lastRefreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}

          {/* ✅ Supervisor quick toggle for approvals */}
          {isSupervisor && stats.approvalNeededAll > 0 && (
            <button
              className="btn"
              type="button"
              disabled={loading}
              onClick={() => onChangeFilter?.(approvalsOnly ? "ALL" : "APPROVAL")}
              title="Toggle bot-only approvals filter"
              style={{
                border: approvalsOnly ? "2px solid #16a34a" : "1px solid #e5e7eb",
                background: approvalsOnly ? "#ecfdf5" : "white",
              }}
            >
              {approvalsOnly ? "Showing Approvals Only" : "Show Approvals Only"}
            </button>
          )}

          {onRefresh && (
            <button className="btn" type="button" onClick={onRefresh} disabled={loading}>
              Refresh
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isSupervisor && (
          <Badge label="✅ Bot-only pending approval (HITL)" value={stats.approvalNeededAll} />
        )}
        <Badge label="👤 Human-handled tickets" value={stats.humanHandled} />
        {stats.botOnlyVisible > 0 && (
          <Badge label="🤖 Bot-only (visible)" value={stats.botOnlyVisible} />
        )}
      </div>

      <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isSupervisor && (
          <LaneBtn
            id="APPROVAL"
            label="Approval Needed (Bot-only)"
            count={stats.approvalNeededAll}
          />
        )}
        <LaneBtn id="MINE" label="Mine (Created/Handled)" count={stats.mine} />
        <LaneBtn id="IN_PROGRESS" label="In Progress" count={stats.inProgress} />
        <LaneBtn id="ESCALATED" label="Escalated" count={stats.escalated} />
        <LaneBtn id="RESOLVED" label="Resolved" count={stats.resolved} />
        <LaneBtn id="ALL" label="All Active" count={stats.allActive} />
      </div>
    </div>
  );
}

function Badge({ label, value }) {
  return (
    <div
      style={{
        background: "#f3f4f6",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 900 }}>{value}</span>
    </div>
  );
}
