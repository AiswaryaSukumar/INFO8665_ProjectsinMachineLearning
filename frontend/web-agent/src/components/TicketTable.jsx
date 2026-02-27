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

  /**
   * ✅ onRowClick signature now supports:
   *   onRowClick(ticket, backTo)
   * Parent can use backTo to navigate and preserve breadcrumb return path.
   */
  onRowClick,

  /**
   * ✅ NEW: parent passes the current list route, e.g.
   *   "/dashboard/my-work" or "/dashboard/overview"
   */
  backTo = "/dashboard/my-work",

  mode = "operator",
  // ✅ "OPERATOR" | "SUPERVISOR" (passed from IntakePage)
  sessionRole = "OPERATOR",
  // optional (future-proof)
  sessionName,
  onApprove,

  // ✅ parent passes lane-aware empty text
  emptyMessage = "No tickets to show.",
}) {
  const isCitizen = mode === "citizen";
  const isReadOnly = mode === "readonly";

  // ✅ Session is used ONLY for permissions/columns (NOT for filtering)
  const isSupervisorSession = String(sessionRole).toUpperCase() === "SUPERVISOR";

  const isResolved = (t) => (t?.status || "").toUpperCase() === "RESOLVED";
  const isApproved = (t) => t?.routingStatus === "APPROVED";

  const inferCreatedType = (t) => {
    const createdType = String(t?.createdByType || "").toUpperCase();
    const handledType = String(t?.handledByType || "").toUpperCase();
    if (createdType) return createdType;

    const createdName = String(t?.createdByName || "").toLowerCase();
    const handledName = String(t?.handledByName || "").toLowerCase();

    const looksLikeBot =
      createdType === "VOICE_BOT" ||
      handledType === "VOICE_BOT" ||
      createdName.includes("voicebot") ||
      handledName.includes("voicebot");

    return looksLikeBot ? "VOICE_BOT" : "OPERATOR";
  };

  // ✅ Bot-only means BOTH created + handled are VOICE_BOT.
  // Anything else (operator-created, bot→human handoff, etc.) should NOT show Approve.
  const isPureVoiceBot = (t) =>
    inferCreatedType(t) === "VOICE_BOT" &&
    String(t?.handledByRole || "").toUpperCase() === "VOICE_BOT" &&
    String(t?.handledByType || "").toUpperCase() === "VOICE_BOT";

  const isBotOnlyPendingApproval = (t) => {
    if (!isPureVoiceBot(t)) return false;
    // For bot-only tickets, supervisor can approve until routingStatus becomes APPROVED.
    return !isApproved(t) && !isResolved(t);
  };

  // ✅ Render EXACTLY what parent passes (already lane+visibility filtered)
  const rows = tickets;

  const showConfidenceCol = useMemo(
    () => rows.some((t) => inferCreatedType(t) === "VOICE_BOT"),
    [rows]
  );

  const showApprovalColumn = useMemo(() => {
    if (isCitizen || isReadOnly) return false;
    if (!isSupervisorSession) return false;
    return rows.some((t) => isBotOnlyPendingApproval(t));
  }, [rows, isCitizen, isReadOnly, isSupervisorSession]);

  const renderCreatedBy = (t) => {
    const name = t?.createdByName || "—";
    return name;
  };

  const renderHandledBy = (t) => {
    const roleU = String(t?.handledByRole || "").toUpperCase();
    const typeU = String(t?.handledByType || "").toUpperCase();
    const name = t?.handledByName || "—";

    if (!roleU && !typeU) return "—";
    return name && name !== "-" ? name : "—";
  };

  // ✅ Centralized row open so it always passes backTo
  const openRow = (t) => {
    if (!onRowClick) return;
    onRowClick(t, backTo);
  };

  const onRowKeyDown = (e, t) => {
    if (!onRowClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openRow(t);
    }
  };

  // compute column count for skeleton
  const cols =
    5 + // ticket#, created, desc, category, dept
    (isCitizen ? 0 : 2) + // name, phone
    1 + // status
    (showConfidenceCol ? 1 : 0) +
    (isCitizen ? 0 : 1) + // tone
    (isCitizen ? 0 : 2) + // created by, handled by
    (showApprovalColumn ? 1 : 0);

  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="ttTableWrap">
      {loading ? <div className="ttLoadingLabel">{loadingLabel}</div> : null}

      {isEmpty ? (
        <div className="emptyCard" role="status" aria-live="polite">
          {emptyMessage || "No tickets to show."}
        </div>
      ) : (
        <div className="tableWrap">
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

                <th scope="col" className="colText">
                  Category
                </th>
                <th scope="col" className="colText">
                  Department
                </th>

                {!isCitizen ? (
                  <th scope="col" className="colText">
                    Name
                  </th>
                ) : null}
                {!isCitizen ? (
                  <th scope="col" className="colText">
                    Phone
                  </th>
                ) : null}

                <th scope="col" className="colCenter">
                  Status
                </th>

                {showConfidenceCol ? (
                  <th scope="col" className="colCenter">
                    Confidence
                  </th>
                ) : null}

                {!isCitizen ? (
                  <th scope="col" className="colCenter">
                    Tone
                  </th>
                ) : null}

                {!isCitizen ? (
                  <th scope="col" className="colText">
                    Created By
                  </th>
                ) : null}

                {!isCitizen ? (
                  <th scope="col" className="colText">
                    Handled By
                  </th>
                ) : null}

                {showApprovalColumn ? (
                  <th scope="col" className="colCenter">
                    Approval
                  </th>
                ) : null}
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
                  // ✅ Per-row computed flags (prevents ReferenceError + keeps logic consistent)
                  const resolved = isResolved(t);
                  const approved = isApproved(t);
                  const needsApproval = isBotOnlyPendingApproval(t);
                  const canApprove = isSupervisorSession && needsApproval && !resolved;

                  return (
                    <tr
                      key={t.id}
                      onClick={() => openRow(t)}
                      onKeyDown={(e) => onRowKeyDown(e, t)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ticket details for ${t.ticketNumber}`}
                      className="rowClickable"
                    >
                      <td className="colTicket">
                        <span className="ticketLink">{t.ticketNumber}</span>
                      </td>

                      <td className="colDate">{t.createdAt}</td>

                      <td className="colDesc">
                        {t.description?.slice(0, 55)}
                        {t.description?.length > 55 ? "..." : ""}
                      </td>

                      <td className="colText">
                        <span className="metaPill">{t.category || "—"}</span>
                      </td>

                      <td className="colText">
                        <span className="metaPill metaPillMuted">
                          {t.assignedDepartment || "Unassigned"}
                        </span>
                      </td>

                      {!isCitizen ? (
                        <td className="colText">
                          {t.name ? t.name : <span className="placeholderDash">—</span>}
                        </td>
                      ) : null}

                      {!isCitizen ? (
                        <td className="colText">
                          {t.phone ? t.phone : <span className="placeholderDash">—</span>}
                        </td>
                      ) : null}

                      <td className="colCenter">
                        <StatusBadge value={t.status} />
                      </td>

                      {showConfidenceCol ? (
                        <td className="colCenter">
                          {String(t?.createdByType || "").toUpperCase() === "VOICE_BOT" ? (
                            <ConfidenceBadge value={t.confidence} />
                          ) : (
                            <span className="placeholderDash">—</span>
                          )}
                        </td>
                      ) : null}

                      {!isCitizen ? (
                        <td className="colCenter">
                          {resolved ? (
                            <span className="placeholderDash">—</span>
                          ) : (
                            <ToneBadge
                              tone={t.tone}
                              confidence={t.toneConfidence}
                              showConfidence={false}
                            />
                          )}
                        </td>
                      ) : null}

                      {!isCitizen ? <td className="colText">{renderCreatedBy(t)}</td> : null}

                      {!isCitizen ? <td className="colText">{renderHandledBy(t)}</td> : null}

                      {showApprovalColumn ? (
                        <td className="colCenter" onClick={(e) => e.stopPropagation()}>
                          {approved ? (
                            <span
                              className="badge"
                              title={`Routed to: ${
                                t.routedToDepartment || t.assignedDepartment || "-"
                              }`}
                            >
                              Routed to {t.routedToDepartment || t.assignedDepartment || "Department"} ✓
                            </span>
                          ) : needsApproval && !resolved ? (
                            <button
                              className="btn primary approveBtnSmall"
                              type="button"
                              onClick={() => onApprove?.(t.id)}
                              aria-label={`Approve ticket ${t.ticketNumber}`}
                              title="Supervisor approval required before routing"
                              disabled={!canApprove}
                            >
                              Approve
                            </button>
                          ) : (
                            <span className="placeholderDash">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}