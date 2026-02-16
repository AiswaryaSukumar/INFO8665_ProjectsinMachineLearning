// src/components/TicketTable.jsx
import { useMemo } from "react";
import StatusBadge from "./StatusBadge";
import ConfidenceBadge from "./ConfidenceBadge";
import ToneBadge from "./ToneBadge";

function SkeletonRow({ cols }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}>
          <div className="skeletonLine" />
        </td>
      ))}
    </tr>
  );
}

export default function TicketTable({
  tickets = [],
  loading = false,
  loadingLabel = "Refreshing…",
  onRowClick,
  mode = "operator",
  onApprove,

  // ✅ parent passes lane-aware empty text (Requirement 2)
  emptyMessage = "No tickets to show.",
}) {
  const isCitizen = mode === "citizen";

  // ✅ Session is used ONLY for permissions/columns (NOT for filtering)
  const sessionRole = (localStorage.getItem("userRole") || "OPERATOR").toUpperCase();
  const isSupervisorSession = sessionRole === "SUPERVISOR";

  const isResolved = (t) => (t?.status || "").toUpperCase() === "RESOLVED";
  const isApproved = (t) => t?.routingStatus === "APPROVED";

  const isPureVoiceBot = (t) =>
    String(t?.createdByType || "").toUpperCase() === "VOICE_BOT" &&
    String(t?.handledByRole || "VOICE_BOT").toUpperCase() === "VOICE_BOT" &&
    String(t?.handledByType || "VOICE_BOT").toUpperCase() === "VOICE_BOT";

  const isBotOnlyPendingApproval = (t) => isPureVoiceBot(t) && !isApproved(t) && !isResolved(t);

  // ✅ Render EXACTLY what parent passes (already lane+visibility filtered)
  const rows = tickets;

  const showConfidenceCol = useMemo(
    () => rows.some((t) => String(t?.createdByType || "").toUpperCase() === "VOICE_BOT"),
    [rows]
  );

  const showApprovalColumn = useMemo(() => {
    if (isCitizen) return false;
    if (!isSupervisorSession) return false;
    return rows.some((t) => isBotOnlyPendingApproval(t));
  }, [rows, isCitizen, isSupervisorSession]);

  const renderCreatedBy = (t) => {
    const type = String(t?.createdByType || "OPERATOR").toUpperCase();
    const name = t?.createdByName || "-";
    return type === "VOICE_BOT" ? `Voice Bot (${name})` : `Operator (${name})`;
  };

  const renderHandledBy = (t) => {
    const roleU = String(t?.handledByRole || "").toUpperCase();
    const typeU = String(t?.handledByType || "").toUpperCase();
    const name = t?.handledByName || "-";

    if (!roleU && !typeU) return "—";
    if (roleU === "VOICE_BOT" || typeU === "VOICE_BOT") return `Voice Bot (${name})`;

    if (typeU === "VOICE_BOT_TO_HUMAN") {
      const who = roleU === "SUPERVISOR" ? "Supervisor" : "Operator";
      return `${who} (${name})`;
    }

    if (roleU === "SUPERVISOR") return `Supervisor (${name})`;
    if (roleU === "OPERATOR") return `Operator (${name})`;
    return name !== "-" ? name : "—";
  };

  const onRowKeyDown = (e, t) => {
    if (!onRowClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(t);
    }
  };

  // compute column count for skeleton
  const cols =
    3 + // ticket#, created, desc
    (isCitizen ? 0 : 2) + // name, phone
    1 + // status
    (showConfidenceCol ? 1 : 0) +
    (isCitizen ? 0 : 1) + // tone
    (isCitizen ? 0 : 2) + // created by, handled by
    (showApprovalColumn ? 1 : 0);

  const isEmpty = !loading && rows.length === 0;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {loading && (
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>{loadingLabel}</div>
      )}

      {isEmpty ? (
        <div className="emptyCard" role="status" aria-live="polite">
          {emptyMessage || "No tickets to show."}
        </div>
      ) : (
        <table className="table stickyHeader">
          <thead>
            <tr>
              <th scope="col" className="colTicket">
                Ticket #
              </th>
              <th scope="col" className="colDate">
                Created
              </th>
              <th scope="col" className="colDesc">
                Description
              </th>

              {!isCitizen && (
                <th scope="col" className="colText">
                  Name
                </th>
              )}
              {!isCitizen && (
                <th scope="col" className="colText">
                  Phone
                </th>
              )}

              <th scope="col" className="colCenter">
                Status
              </th>

              {showConfidenceCol && (
                <th scope="col" className="colCenter">
                  Confidence
                </th>
              )}

              {!isCitizen && (
                <th scope="col" className="colCenter">
                  Tone
                </th>
              )}
              {!isCitizen && (
                <th scope="col" className="colText">
                  Created By
                </th>
              )}
              {!isCitizen && (
                <th scope="col" className="colText">
                  Handled By
                </th>
              )}

              {showApprovalColumn && (
                <th scope="col" className="colCenter">
                  Approval
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <>
                <SkeletonRow cols={cols} />
                <SkeletonRow cols={cols} />
                <SkeletonRow cols={cols} />
                <SkeletonRow cols={cols} />
                <SkeletonRow cols={cols} />
                <SkeletonRow cols={cols} />
              </>
            ) : (
              rows.map((t) => {
                const approved = isApproved(t);
                const resolved = isResolved(t);
                const needsApproval = isBotOnlyPendingApproval(t);
                const canApprove = !isCitizen && isSupervisorSession && needsApproval;

                return (
                  <tr
                    key={t.id}
                    onClick={() => onRowClick?.(t)}
                    onKeyDown={(e) => onRowKeyDown(e, t)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ticket details for ${t.ticketNumber}`}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="colTicket">
                      <span style={{ color: "#2563eb", textDecoration: "underline" }}>
                        {t.ticketNumber}
                      </span>
                    </td>

                    <td className="colDate">{t.createdAt}</td>

                    <td className="colDesc">
                      {t.description?.slice(0, 55)}
                      {t.description?.length > 55 ? "..." : ""}
                    </td>

                    {!isCitizen && <td className="colText">{t.name}</td>}
                    {!isCitizen && <td className="colText">{t.phone}</td>}

                    <td className="colCenter">
                      <StatusBadge value={t.status} />
                    </td>

                    {showConfidenceCol && (
                      <td className="colCenter">
                        {String(t?.createdByType || "").toUpperCase() === "VOICE_BOT" ? (
                          <ConfidenceBadge value={t.confidence} />
                        ) : (
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                    )}

                    {!isCitizen && (
                      <td className="colCenter">
                        {resolved ? (
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                        ) : (
                          <ToneBadge tone={t.tone} confidence={t.toneConfidence} showConfidence={false} />
                        )}
                      </td>
                    )}

                    {!isCitizen && <td className="colText">{renderCreatedBy(t)}</td>}
                    {!isCitizen && <td className="colText">{renderHandledBy(t)}</td>}

                    {showApprovalColumn && (
                      <td className="colCenter" onClick={(e) => e.stopPropagation()}>
                        {!needsApproval || resolved ? (
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                        ) : approved ? (
                          <span className="badge" title={`Assigned to: ${t.assignedDepartment || "-"}`}>
                            Approved ✓ {t.assignedDepartment ? `(${t.assignedDepartment})` : ""}
                          </span>
                        ) : (
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => onApprove?.(t.id)}
                            aria-label={`Approve ticket ${t.ticketNumber}`}
                            title="Supervisor approval required before routing"
                            disabled={!canApprove}
                            style={{ padding: "6px 10px", borderRadius: 10 }}
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
