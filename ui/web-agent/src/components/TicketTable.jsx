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

function SlaBadge({ ticket }) {
  const isOverdue = ticket?.isOverdue ?? ticket?.is_overdue;
  const deadline = ticket?.slaDeadline ?? ticket?.sla_deadline;

  if (!deadline) return <span className="placeholderDash">—</span>;

  if (isOverdue) {
    return (
      <span
        style={{
          display: "inline-block", fontSize: 10, fontWeight: 800,
          padding: "2px 7px", borderRadius: 999,
          background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fca5a5",
          whiteSpace: "nowrap",
        }}
        title={`SLA deadline: ${deadline}`}
      >
        OVERDUE
      </span>
    );
  }

  const msLeft = new Date(deadline).getTime() - Date.now();
  const hrsLeft = Math.ceil(msLeft / 3_600_000);

  if (hrsLeft <= 24) {
    return (
      <span
        style={{
          display: "inline-block", fontSize: 10, fontWeight: 700,
          padding: "2px 7px", borderRadius: 999,
          background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa",
          whiteSpace: "nowrap",
        }}
        title={`SLA deadline: ${deadline}`}
      >
        {hrsLeft <= 0 ? "Due now" : `Due in ${hrsLeft}h`}
      </span>
    );
  }

  const daysLeft = Math.ceil(hrsLeft / 24);
  return (
    <span
      style={{
        display: "inline-block", fontSize: 10, fontWeight: 600,
        padding: "2px 7px", borderRadius: 999,
        background: "#f0fdf4", color: "#15803d", border: "1.5px solid #bbf7d0",
        whiteSpace: "nowrap",
      }}
      title={`SLA deadline: ${deadline}`}
    >
      {daysLeft}d left
    </span>
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

function splitTicketNumber(value = "") {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.*)-(\d{6})$/);
  if (!match) return { prefix: raw, suffix: "" };
  return { prefix: match[1], suffix: match[2] };
}

function formatTimestampParts(value = "") {
  if (!value) return { date: "-", time: "" };
  const raw = String(value);
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  const parsed = new Date(hasTimezone ? iso : `${iso}Z`);
  if (Number.isNaN(parsed.getTime())) {
    const [datePart = raw, timePart = ""] = raw.split(/[T ]/);
    return {
      date: datePart.replaceAll("-", "/"),
      time: timePart.slice(0, 8),
    };
  }

  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${parsed.getFullYear()}/${pad(parsed.getMonth() + 1)}/${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`,
  };
}

function firstNumericScore(...values) {
  for (const value of values) {
    const number = Number(value);
    if (!Number.isNaN(number) && Number.isFinite(number)) {
      return number <= 1 ? number * 100 : number;
    }
  }
  return null;
}

function scoreText(score, fallback = "-") {
  if (score === null || score === undefined) return fallback || "-";
  return `${Math.round(score)}%`;
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
  duplicateByTicketId = {},
  onMergeDuplicate,
  onDuplicateTicketClick,

  showSlaCol = false,

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
    (isCitizen ? 0 : 1) + // duplicate
    (isCitizen ? 0 : 2) + // created by, handled by
    (showApprovalColumn ? 1 : 0) +
    (showSlaCol ? 1 : 0);

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
                  <th scope="col" className="colDuplicate">
                    Duplicate
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

                {showSlaCol ? (
                  <th scope="col" className="colCenter">
                    SLA
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
                  const ticketNumber = t.ticketNumber || t.ticketId || t.id || "";
                  const splitNumber = splitTicketNumber(ticketNumber);
                  const createdParts = formatTimestampParts(t.createdAt);
                  const approvalTimestamp = t.approvedAt || (approved ? t.updatedAt : "");
                  const approvedParts = formatTimestampParts(approvalTimestamp);
                  const issueLine = [t.category, t.location].filter(Boolean).join(" at ");
                  const descriptionLine = issueLine || t.description || "No description";
                  const contactLine = [displayName !== "—" ? displayName : "", t.phone || ""]
                    .filter(Boolean)
                    .join(" / ");
                  const duplicateInfo = duplicateByTicketId[ticketNumber] || duplicateByTicketId[t.id];
                  const duplicateScore = Number(duplicateInfo?.matchScore || 0);
                  const canMergeDuplicate =
                    duplicateInfo?.status === "pending" &&
                    duplicateScore >= 80 &&
                    typeof onMergeDuplicate === "function";
                  const confidenceScore = firstNumericScore(
                    t?.confidenceScores?.overall,
                    t?.confidenceScores?.classification,
                    t?.confidenceScores?.category,
                    t?.classificationConfidence,
                    t?.confidenceScore
                  );
                  const toneScore = firstNumericScore(t?.toneConfidence, t?.sentimentScore);

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
                        <span className="ticketLink ticketNumberStack">
                          <span>{splitNumber.prefix || ticketNumber}</span>
                          {splitNumber.suffix ? <span>{splitNumber.suffix}</span> : null}
                        </span>
                      </td>

                      <td className="colDate">
                        <span className="dateStack">
                          <span>{createdParts.date}</span>
                          {createdParts.time ? <span>{createdParts.time}</span> : null}
                        </span>
                      </td>

                      <td className="colDesc">
                        <div className="ticketDescBlock">
                          <span className="ticketDescPrimary">{descriptionLine}</span>
                          <span className="ticketDescSecondary">
                            {contactLine || "No caller contact"}
                          </span>
                          <span className="ticketScoreFooter">
                            <span className="scoreBadge">
                              Confidence {scoreText(confidenceScore, t.confidence || "-")}
                            </span>
                            {!isCitizen ? (
                              <span className="scoreBadge scoreBadgeTone">
                                Tone {scoreText(toneScore, t.toneConfidence || "-")}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>

                      <td className="colText">
                        <span className="metaPill">{(t.category || "—").replace(/_/g, " ")}</span>
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

                      {!isCitizen ? (
                        <td className="colDuplicate" onClick={(e) => e.stopPropagation()}>
                          {duplicateInfo && duplicateScore >= 60 ? (
                            <div className="duplicateMini">
                              <span className="duplicateMiniScore">{Math.round(duplicateScore)}%</span>
                              <span className="duplicateMiniText">
                                {duplicateInfo.status === "merged" ? "Linked with" : "Similar to"}{" "}
                                <button
                                  type="button"
                                  className="inlineTicketButton"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const targetId =
                                      duplicateInfo.parentTicketId || duplicateInfo.similarTicketId;
                                    const targetTicket = rows.find(
                                      (row) =>
                                        row.ticketNumber === targetId ||
                                        row.ticketId === targetId ||
                                        row.id === targetId
                                    );
                                    if (targetTicket) openRow(targetTicket);
                                    else if (targetId) onDuplicateTicketClick?.(targetId);
                                  }}
                                >
                                  {duplicateInfo.parentTicketId || duplicateInfo.similarTicketId}
                                </button>
                              </span>
                              {duplicateInfo.status === "pending" ? (
                                <button
                                  type="button"
                                  className="btn duplicateMergeBtn"
                                  disabled={!canMergeDuplicate}
                                  title={
                                    duplicateScore >= 80
                                      ? "Merge duplicate candidate"
                                      : "Merge unlocks at 80% similarity"
                                  }
                                  onClick={() => onMergeDuplicate?.(duplicateInfo.id)}
                                >
                                  Merge
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="placeholderDash">-</span>
                          )}
                        </td>
                      ) : null}

                      {!isCitizen ? <td className="colText">{renderCreatedBy(t)}</td> : null}
                      {!isCitizen ? <td className="colText">{renderHandledBy(t)}</td> : null}

                      {showApprovalColumn ? (
                        <td className="colCenter" onClick={(e) => e.stopPropagation()}>
                          {approved ? (
                            <>
                            <span
                              className="badge"
                              title={`Routed to: ${
                                t.routedToDepartment || t.assignedDepartment || "-"
                              }`}
                            >
                              Routed to{" "}
                              {t.routedToDepartment || t.assignedDepartment || "Department"} ✓
                            </span>
                            {approvalTimestamp ? (
                              <span className="approvalTime">
                                <b>Approved</b>
                                <br />
                                {approvedParts.date}
                                <br />
                                {approvedParts.time}
                              </span>
                            ) : null}
                            </>
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

                      {showSlaCol ? (
                        <td className="colCenter" onClick={(e) => e.stopPropagation()}>
                          {resolved || deleted || rejected ? (
                            <span className="placeholderDash">—</span>
                          ) : (
                            <SlaBadge ticket={t} />
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
