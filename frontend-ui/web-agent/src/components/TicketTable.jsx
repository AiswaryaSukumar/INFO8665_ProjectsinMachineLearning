// src/components/TicketTable.jsx
import { useMemo } from "react";
import StatusBadge from "./StatusBadge";
import ConfidenceBadge from "./ConfidenceBadge";
import ToneBadge from "./ToneBadge";
import {
  canApproveTicket,
  isTerminalStatus,
  isPureVoiceBotTicket,
  normalizeTicketStatus,
  TICKET_STATUSES,
} from "../utils/ticketWorkflow";

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

function normalizeToneValue(value = "") {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "UNKNOWN";

  if (raw === "UPSET") return "AGITATED";
  if (raw === "FRUSTRATED") return "AGITATED";
  if (raw === "THREATENING") return "THREAT";

  const allowed = ["UNKNOWN", "CALM", "NEUTRAL", "AGITATED", "ANGRY", "THREAT", "ABUSIVE"];
  return allowed.includes(raw) ? raw : "UNKNOWN";
}

function normalizeChannelValue(value = "") {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  if (
    raw === "WEB" ||
    raw === "WEB FORM" ||
    raw === "WEB_FORM" ||
    raw === "WEBFORM" ||
    raw === "ONLINE" ||
    raw === "PUBLIC_WEB"
  ) {
    return "WEB";
  }

  if (
    raw === "PHONE" ||
    raw === "CALL" ||
    raw === "VOICE" ||
    raw === "PHONE (HUMAN OPERATOR)" ||
    raw === "PHONE (AI VOICE BOT)" ||
    raw === "PHONE (AI VOICE BOT → OPERATOR)" ||
    raw === "PHONE (AI VOICE BOT → SUPERVISOR)"
  ) {
    return "PHONE";
  }

  if (raw === "EMAIL" || raw === "E-MAIL") return "EMAIL";

  if (
    raw === "IN_PERSON" ||
    raw === "IN-PERSON" ||
    raw === "IN PERSON" ||
    raw === "COUNTER"
  ) {
    return "IN_PERSON";
  }

  return raw;
}

function formatChannelLabel(value = "") {
  const channel = normalizeChannelValue(value);

  switch (channel) {
    case "WEB":
      return "Web form";
    case "PHONE":
      return "Phone";
    case "EMAIL":
      return "Email";
    case "IN_PERSON":
      return "In-person";
    default:
      return value ? String(value) : "—";
  }
}

export default function TicketTable({
  tickets = [],
  loading = false,
  loadingLabel = "Refreshing…",

  /**
   * onRowClick(ticket, backTo)
   */
  onRowClick,

  /**
   * parent passes the current list route
   */
  backTo = "/dashboard/my-work",

  mode = "operator",
  sessionRole = "OPERATOR",
  sessionName,
  onApprove,

  emptyMessage = "No tickets to show.",
}) {
  const isCitizen = mode === "citizen";
  const isReadOnly = mode === "readonly";
  const isSupervisorSession = String(sessionRole).toUpperCase() === "SUPERVISOR";

  const getStatus = (t) => normalizeTicketStatus(t);

  const isApproved = (t) => getStatus(t) === TICKET_STATUSES.APPROVED;
  const isRejected = (t) => getStatus(t) === TICKET_STATUSES.REJECTED;
  const isResolved = (t) => getStatus(t) === TICKET_STATUSES.RESOLVED;
  const isDeleted = (t) => getStatus(t) === TICKET_STATUSES.DELETE;

  const isBotOnlyPendingApproval = (t) => {
    if (!isPureVoiceBotTicket(t)) return false;
    if (isRejected(t)) return false;
    if (isResolved(t)) return false;
    if (isDeleted(t)) return false;
    return canApproveTicket(t);
  };

  // Render exactly what parent passes
  const rows = tickets;

  const showConfidenceCol = useMemo(
    () =>
      rows.some(
        (t) => String(t?.createdByType || t?.created_by_type || "").toUpperCase() === "VOICE_BOT"
      ),
    [rows]
  );

  const showApprovalColumn = useMemo(() => {
    if (isCitizen || isReadOnly) return false;
    if (!isSupervisorSession) return false;
    return rows.some((t) => isBotOnlyPendingApproval(t) || isApproved(t));
  }, [rows, isCitizen, isReadOnly, isSupervisorSession]);

  const renderCreatedBy = (t) => {
    return t?.createdByName || "—";
  };

  const renderHandledBy = (t) => {
    const roleU = String(t?.handledByRole || "").toUpperCase();
    const typeU = String(t?.handledByType || "").toUpperCase();
    const name = t?.handledByName || "—";

    if (!roleU && !typeU) return "—";
    return name && name !== "-" ? name : "—";
  };

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

  const cols =
    6 + // ticket#, created, desc, category, dept, channel
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
                <th scope="col" className="colText">
                  Channel
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
                  const status = getStatus(t);
                  const approved = isApproved(t);
                  const rejected = isRejected(t);
                  const resolved = isResolved(t);
                  const deleted = isDeleted(t);
                  const needsApproval = isBotOnlyPendingApproval(t);
                  const terminal = isTerminalStatus(t);

                  const canApprove =
                    isSupervisorSession &&
                    needsApproval &&
                    !terminal &&
                    !rejected &&
                    !resolved &&
                    !deleted;

                  const displayName = t?.name || t?.fullName || "—";
                  const displayTone = normalizeToneValue(t?.tone || t?.callerTone);
                  const displayChannel = formatChannelLabel(t?.channel);

                  return (
                    <tr
                      key={t.id || t.ticketNumber}
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
                          {t.assignedDepartment || t.department || "Unassigned"}
                        </span>
                      </td>

                      <td className="colText">
                        <span className="metaPill metaPillMuted">{displayChannel}</span>
                      </td>

                      {!isCitizen ? (
                        <td className="colText">
                          {displayName !== "—" ? displayName : <span className="placeholderDash">—</span>}
                        </td>
                      ) : null}

                      {!isCitizen ? (
                        <td className="colText">
                          {t.phone ? t.phone : <span className="placeholderDash">—</span>}
                        </td>
                      ) : null}

                      <td className="colCenter">
                        <StatusBadge value={status} />
                      </td>

                      {showConfidenceCol ? (
                        <td className="colCenter">
                          {String(t?.createdByType || "").toUpperCase() === "VOICE_BOT" ? (
                            <ConfidenceBadge value={t.confidence || t.severity} />
                          ) : (
                            <span className="placeholderDash">—</span>
                          )}
                        </td>
                      ) : null}

                      {!isCitizen ? (
                        <td className="colCenter">
                          {resolved || deleted || rejected ? (
                            <span className="placeholderDash">—</span>
                          ) : (
                            <ToneBadge
                              tone={displayTone}
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
                              Routed to{" "}
                              {t.routedToDepartment || t.assignedDepartment || "Department"} ✓
                            </span>
                          ) : needsApproval ? (
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