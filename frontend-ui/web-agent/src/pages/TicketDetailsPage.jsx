// src/pages/TicketDetailsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import ToneBadge from "../components/ToneBadge";
import { useToast } from "../components/Toast";

import {
  fetchTicket,
  updateTicket as updateTicketApi,
  approveTicket as approveTicketApi,
  rejectTicket as rejectTicketApi,
  resolveTicket as resolveTicketApi,
  deleteTicket as deleteTicketApi,
} from "../api/tickets";

import {
  CATEGORIES as CANONICAL_CATEGORIES,
  DEPARTMENTS as CANONICAL_DEPARTMENTS,
  inferDepartmentFromCategory,
  normalizeCategory,
  normalizeDepartment,
} from "../utils/categoryRouting";

import {
  canApproveTicket,
  canRejectTicket,
  canResolveTicket,
  canDeleteTicket,
  isPureVoiceBotTicket,
  normalizeTicketStatus,
  TICKET_STATUSES,
} from "../utils/ticketWorkflow";

function Field({ label, children, hint }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <div className="ticketFieldLabel">{label}</div>
      {children}
      {hint ? <div className="ticketFieldHint">{hint}</div> : null}
    </div>
  );
}

function upper(value) {
  return String(value || "").toUpperCase();
}

function normalizeTicketForDraft(ticket) {
  if (!ticket) return ticket;

  const category = normalizeCategory(ticket.category || "");
  const department =
    normalizeDepartment(ticket.assignedDepartment || ticket.department || "") ||
    inferDepartmentFromCategory(category) ||
    "";

  const notes = ticket.notes ?? ticket.comments ?? "";
  const transcript = ticket.transcript || ticket.description || "";
  const normalizedStatus = normalizeTicketStatus(ticket);

  return {
    ...ticket,
    category,
    department,
    assignedDepartment: department,
    status: normalizedStatus,
    ticketStatus: normalizedStatus,
    notes,
    transcript,
  };
}

function hasEvidenceFields(ticket) {
  if (!ticket) return false;
  return (
    !!ticket.recordingUrl ||
    !!ticket.transcript ||
    (Array.isArray(ticket.sessionHistory) && ticket.sessionHistory.length > 0)
  );
}

function mergeTicketPreservingEvidence(baseTicket, nextTicket) {
  if (!baseTicket && !nextTicket) return null;
  if (!baseTicket) return nextTicket || null;
  if (!nextTicket) return baseTicket || null;

  const merged = {
    ...baseTicket,
    ...nextTicket,
    recordingUrl: nextTicket?.recordingUrl || baseTicket?.recordingUrl || "",
    transcript: nextTicket?.transcript || baseTicket?.transcript || "",
    sessionHistory:
      Array.isArray(nextTicket?.sessionHistory) && nextTicket.sessionHistory.length > 0
        ? nextTicket.sessionHistory
        : baseTicket?.sessionHistory || [],
  };

  const normalizedStatus = normalizeTicketStatus(merged);

  return {
    ...merged,
    status: normalizedStatus,
    ticketStatus: normalizedStatus,
  };
}

function requireBackendId(ticket) {
  const apiId = ticket?.ticketId || ticket?.id;
  if (!apiId) {
    throw new Error("Missing backend ticket ID.");
  }
  return apiId;
}

function notifyTicketsChanged() {
  window.dispatchEvent(new CustomEvent("tickets-changed"));
}

export default function TicketDetailsPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { ticketNumber } = useParams();
  const { toast } = useToast();

  const [ticket, setTicket] = useState(() =>
    loc.state?.ticket
      ? {
          ...loc.state.ticket,
          status: normalizeTicketStatus(loc.state.ticket),
          ticketStatus: normalizeTicketStatus(loc.state.ticket),
        }
      : null
  );
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const [draft, setDraft] = useState(() =>
    normalizeTicketForDraft(loc.state?.ticket || null)
  );

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [deleteComment, setDeleteComment] = useState("");
  const [deptManuallySet, setDeptManuallySet] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const sessionRole = upper(localStorage.getItem("userRole") || "OPERATOR");
  const sessionName = (localStorage.getItem("userName") || "").trim();
  const canStaffAct = sessionRole === "OPERATOR" || sessionRole === "SUPERVISOR";

  const backTo = loc.state?.backTo || loc.state?.from || "/dashboard/my-work";
  const listLabel = String(backTo).includes("/dashboard/overview")
    ? "Overview"
    : "My work";

  const onBack = () => {
    if (loc.state?.backTo) return nav(loc.state.backTo);
    if (loc.state?.from) return nav(loc.state.from);
    return nav("/dashboard/my-work");
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const stateTicket = loc.state?.ticket || null;
        const lookupId =
          stateTicket?.ticketId ||
          stateTicket?.id ||
          stateTicket?.ticketNumber ||
          ticketNumber;

        if (!lookupId) {
          if (!cancelled) {
            setTicket(null);
            setDraft(null);
            setLoading(false);
          }
          return;
        }

        const apiTicket = await fetchTicket(lookupId);
        if (cancelled) return;

        const merged = stateTicket
          ? mergeTicketPreservingEvidence(stateTicket, apiTicket)
          : mergeTicketPreservingEvidence(null, apiTicket);

        setTicket(merged || null);
        setDraft(normalizeTicketForDraft(merged || null));
        setEvidenceOpen(hasEvidenceFields(merged || null));
      } catch (error) {
        console.error("Failed to load ticket details:", error);

        const fallback = loc.state?.ticket || null;
        const normalizedFallback = fallback
          ? mergeTicketPreservingEvidence(null, fallback)
          : null;

        if (!cancelled) {
          setTicket(normalizedFallback);
          setDraft(normalizeTicketForDraft(normalizedFallback));
          setEvidenceOpen(hasEvidenceFields(normalizedFallback));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [ticketNumber, loc.state]);

  useEffect(() => {
    if (!ticket) return;
    setDraft(normalizeTicketForDraft(ticket));
  }, [ticket]);

  useEffect(() => {
    if (!draft || deptManuallySet) return;

    const category = String(draft.category || "").trim();
    if (!category) return;

    const inferred = inferDepartmentFromCategory(category);
    if (!inferred) return;

    setDraft((current) => ({
      ...current,
      department: inferred,
      assignedDepartment: inferred,
    }));
  }, [draft?.category, deptManuallySet]);

  const normalizedStatus = useMemo(() => normalizeTicketStatus(ticket), [ticket]);
  const routingStatus = useMemo(
    () => upper(ticket?.routingStatus || ticket?.routing_status || "PENDING_APPROVAL"),
    [ticket]
  );

  const approved = normalizedStatus === TICKET_STATUSES.APPROVED;
  const rejected = normalizedStatus === TICKET_STATUSES.REJECTED;
  const isResolved = normalizedStatus === TICKET_STATUSES.RESOLVED;
  const isDeleted = normalizedStatus === TICKET_STATUSES.DELETE;
  const pureVoiceBot = isPureVoiceBotTicket(ticket);

  const routingStatusLabel = isDeleted ? "DELETED" : routingStatus;

  const createdByType = ticket?.createdByType || "OPERATOR";
  const createdByName = ticket?.createdByName || "-";
  const isVoiceBotTicket = upper(createdByType) === "VOICE_BOT";

  const handledByRole =
    ticket?.handledByRole || (isVoiceBotTicket ? "VOICE_BOT" : "OPERATOR");
  const handledByName = ticket?.handledByName || createdByName || "-";
  const handledByType =
    ticket?.handledByType || (isVoiceBotTicket ? "VOICE_BOT" : "OPERATOR");

  const canApprove =
    sessionRole === "SUPERVISOR" &&
    pureVoiceBot &&
    canApproveTicket(ticket);

  const canReject =
    sessionRole === "SUPERVISOR" &&
    pureVoiceBot &&
    canRejectTicket(ticket);

  const canResolve =
    canStaffAct &&
    canResolveTicket(ticket) &&
    !isDeleted;

  const canEditDepartment =
    canStaffAct &&
    !rejected &&
    !isResolved &&
    !isDeleted &&
    (!pureVoiceBot || sessionRole === "SUPERVISOR");

  const canStartEdit =
    canStaffAct &&
    !rejected &&
    !isResolved &&
    !isDeleted;

  const canSave =
    isEditing &&
    !saving &&
    !rejected &&
    !isResolved &&
    !isDeleted;

  const canDelete =
    sessionRole === "SUPERVISOR" &&
    canDeleteTicket(ticket);

  async function doSave() {
    if (!draft || !ticket) return;
    if (rejected || isResolved || isDeleted) {
      toast({
        type: "warning",
        title: "Edit locked",
        msg: "This ticket can no longer be edited.",
      });
      return;
    }

    setSaving(true);

    try {
      const apiId = requireBackendId(ticket);

      const payload = {
        category: draft.category,
        location: draft.location,
        description: draft.description,
        assignedDepartment: draft.department || null,
        notes: draft.notes || "",
      };

      const updated = await updateTicketApi(apiId, payload);
      const mergedUpdated = mergeTicketPreservingEvidence(ticket, updated);

      setTicket(mergedUpdated);
      setDraft(normalizeTicketForDraft(mergedUpdated));
      setEvidenceOpen(hasEvidenceFields(mergedUpdated));
      setIsEditing(false);
      notifyTicketsChanged();

      toast({
        type: "success",
        title: "Saved",
        msg: "Ticket updated successfully.",
      });
    } catch (error) {
      console.error(error);
      toast({
        type: "error",
        title: "Save failed",
        msg: "Could not update ticket.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function doApprove() {
    if (!ticket) return;

    setApproving(true);

    try {
      const department = draft?.department || ticket.assignedDepartment;

      if (!department) {
        toast({
          type: "warning",
          title: "Department required",
          msg: "Select a department first.",
        });
        return;
      }

      if (department !== ticket.assignedDepartment) {
        const apiId = requireBackendId(ticket);
        await updateTicketApi(apiId, {
          assignedDepartment: department,
        });
      }

      const apiId = requireBackendId(ticket);
      const updated = await approveTicketApi(apiId);

      const mergedUpdated = mergeTicketPreservingEvidence(ticket, {
        ...updated,
        assignedDepartment: department,
        department,
        handledByType: "SUPERVISOR",
        handledByName: sessionName || "-",
        handledByRole: "SUPERVISOR",
      });

      setTicket(mergedUpdated);
      setDraft(normalizeTicketForDraft(mergedUpdated));
      setEvidenceOpen(hasEvidenceFields(mergedUpdated));
      setIsEditing(false);
      notifyTicketsChanged();

      toast({
        type: "success",
        title: "Approved",
        msg: `Ticket approved${department ? ` and routed to ${department}` : ""}.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        type: "error",
        title: "Approve failed",
        msg: "Could not approve ticket.",
      });
    } finally {
      setApproving(false);
    }
  }

  async function doReject() {
    if (!ticket) return;

    setRejecting(true);

    try {
      const apiId = requireBackendId(ticket);

      const updated = await rejectTicketApi(apiId, {
        rejectedReason: rejectComment.trim(),
      });

      const mergedUpdated = mergeTicketPreservingEvidence(ticket, {
        ...updated,
        handledByType: "SUPERVISOR",
        handledByName: sessionName || "-",
        handledByRole: "SUPERVISOR",
      });

      setTicket(mergedUpdated);
      setDraft(normalizeTicketForDraft(mergedUpdated));
      setEvidenceOpen(hasEvidenceFields(mergedUpdated));
      setIsEditing(false);
      notifyTicketsChanged();

      toast({
        type: "success",
        title: "Rejected",
        msg: "Ticket rejected. No routing action will be taken.",
      });
    } catch (error) {
      console.error(error);
      toast({
        type: "error",
        title: "Reject failed",
        msg: "Could not reject ticket.",
      });
    } finally {
      setRejecting(false);
    }
  }

  async function doResolve() {
    if (!ticket) return;

    setResolving(true);

    try {
      const apiId = requireBackendId(ticket);
      const updated = await resolveTicketApi(apiId);

      const mergedUpdated = mergeTicketPreservingEvidence(ticket, {
        ...updated,
        handledByType: sessionRole,
        handledByName: sessionName || "-",
        handledByRole: sessionRole,
      });

      setTicket(mergedUpdated);
      setDraft(normalizeTicketForDraft(mergedUpdated));
      setEvidenceOpen(hasEvidenceFields(mergedUpdated));
      setIsEditing(false);
      notifyTicketsChanged();

      toast({
        type: "success",
        title: "Resolved",
        msg: "Ticket marked as resolved.",
      });
    } catch (error) {
      console.error(error);
      toast({
        type: "error",
        title: "Resolve failed",
        msg: "Could not resolve ticket.",
      });
    } finally {
      setResolving(false);
    }
  }

  async function doDelete() {
    if (!ticket) return;

    if (!canDelete) {
      toast({
        type: "warning",
        title: "Delete blocked",
        msg: "This ticket cannot be deleted in its current state.",
      });
      return;
    }

    if (!deleteComment.trim()) {
      toast({
        type: "warning",
        title: "Comment required",
        msg: "Add a delete reason.",
      });
      return;
    }

    setSaving(true);

    try {
      const apiId = requireBackendId(ticket);

      const updated = await deleteTicketApi(apiId, {
        deletedByRole: sessionRole,
        deletedByName: sessionName || "-",
        deletedReason: deleteComment.trim(),
      });

      const mergedUpdated = mergeTicketPreservingEvidence(ticket, updated);

      setTicket(mergedUpdated);
      setDraft(normalizeTicketForDraft(mergedUpdated));
      setEvidenceOpen(hasEvidenceFields(mergedUpdated));
      setIsEditing(false);
      notifyTicketsChanged();

      toast({
        type: "success",
        title: "Deleted",
        msg: "Ticket marked as DELETE.",
      });
    } catch (error) {
      console.error(error);
      toast({
        type: "error",
        title: "Delete failed",
        msg: "Could not delete ticket.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">Loading ticket…</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ fontWeight: 1000, marginBottom: 8 }}>Ticket not found</div>
          <div className="lpMuted">
            We couldn’t load this ticket. It may have been removed.
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={onBack} type="button">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const callHandledByLabel = (() => {
    const role = upper(handledByRole);
    const type = upper(handledByType);

    if (role === "VOICE_BOT" && type === "VOICE_BOT") {
      return `Voice Bot (${handledByName})`;
    }
    if (type === "VOICE_BOT_TO_HUMAN" && role === "OPERATOR") {
      return `Voice Bot → Operator (${handledByName})`;
    }
    if (type === "VOICE_BOT_TO_HUMAN" && role === "SUPERVISOR") {
      return `Voice Bot → Supervisor (${handledByName})`;
    }
    if (role === "SUPERVISOR") return `Supervisor (${handledByName})`;
    if (role === "OPERATOR") return `Operator (${handledByName})`;

    return handledByName !== "-" ? handledByName : "—";
  })();

  const showEvidence = isVoiceBotTicket || hasEvidenceFields(ticket);

  return (
    <div className="ticketPageShell">
      <div className="ticketStickyHeader">
        <div className="ticketBreadcrumb">
          {String(backTo).includes("/dashboard/my-work") ? (
            <>
              <button className="ticketCrumbLink" type="button" onClick={() => nav(backTo)}>
                My work
              </button>
              <span className="ticketCrumbSep">›</span>
              <span className="ticketCrumbCurrent">
                Ticket #{ticket.ticketNumber || ticket.id}
              </span>
            </>
          ) : (
            <>
              <button
                className="ticketCrumbLink"
                type="button"
                onClick={() => nav("/dashboard/my-work")}
              >
                Dashboard
              </button>
              <span className="ticketCrumbSep">›</span>
              <button className="ticketCrumbLink" type="button" onClick={() => nav(backTo)}>
                {listLabel}
              </button>
              <span className="ticketCrumbSep">›</span>
              <span className="ticketCrumbCurrent">
                Ticket #{ticket.ticketNumber || ticket.id}
              </span>
            </>
          )}
        </div>

        <div className="ticketHeaderRow">
          <div className="ticketHeaderTitle">
            <div className="ticketHeaderKicker">Ticket</div>
            <div className="ticketHeaderId">{ticket.ticketNumber || ticket.id}</div>
          </div>

          <div className="ticketHeaderActions">
            <button className="btn ghost" type="button" onClick={onBack}>
              Back
            </button>

            {canApprove ? (
              <button
                className="btn primary"
                type="button"
                disabled={approving || rejecting || resolving}
                onClick={doApprove}
              >
                {approving ? "Approving…" : "Approve & Route"}
              </button>
            ) : null}

            {canReject ? (
              <button
                className="btn secondary"
                type="button"
                disabled={approving || rejecting || resolving}
                onClick={doReject}
              >
                {rejecting ? "Rejecting…" : "Reject"}
              </button>
            ) : null}

            {canResolve ? (
              <button
                className="btn secondary"
                type="button"
                disabled={approving || rejecting || resolving}
                onClick={doResolve}
              >
                {resolving ? "Resolving…" : "Resolve"}
              </button>
            ) : null}

            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setIsEditing((value) => !value);
                setDraft(normalizeTicketForDraft(ticket));
                setDeptManuallySet(false);
              }}
              disabled={!canStartEdit}
            >
              {isEditing ? "Cancel edit" : "Edit"}
            </button>

            {isEditing ? (
              <button className="btn primary" type="button" disabled={!canSave} onClick={doSave}>
                {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="ticketBody">
        <div className="container">
          <div className="card ticketCard">
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span className={`metaPill ${approved ? "" : "metaPillMuted"}`}>
                Routing: {routingStatusLabel}
              </span>
              <span className="metaPill metaPillMuted">Handled by: {callHandledByLabel}</span>
              <span className="metaPill metaPillMuted">Status: {normalizedStatus}</span>

              {ticket.tone ? (
                <span className="metaPill metaPillMuted">
                  Tone: <ToneBadge tone={ticket.tone} confidence={ticket.toneConfidence} />
                </span>
              ) : null}

              {ticket.channel ? (
                <span className="metaPill metaPillMuted">Channel: {ticket.channel}</span>
              ) : null}
            </div>

            {(canReject || rejected) && (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
                  <div style={{ fontWeight: 1000, marginBottom: 8 }}>Supervisor review</div>

                  {rejected ? (
                    <div className="lpMuted" style={{ fontWeight: 800 }}>
                      Rejected — no routing action will be taken.
                      {ticket.rejectedReason ? (
                        <div style={{ marginTop: 6 }}>
                          <b>Reason:</b> {ticket.rejectedReason}
                        </div>
                      ) : null}
                    </div>
                  ) : canReject ? (
                    <>
                      <div className="lpMuted" style={{ marginBottom: 8 }}>
                        Provide an optional reason before rejecting this bot-only ticket.
                      </div>
                      <textarea
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        placeholder="Reason for rejection (optional)…"
                        disabled={rejecting || approving}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            )}

            <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
              <div className="ticketSummaryCard">
                <div className="ticketSummaryHeader">
                  <div className="ticketSummaryTitle">Ticket summary</div>
                  <div className="ticketSummaryHint">Citizen + workflow metadata</div>
                </div>

                <div className="ticketSummaryGrid">
                  <Field label="Created">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.createdAt || "-"}
                    </div>
                  </Field>
                  <Field label="Status">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {normalizedStatus || "-"}
                    </div>
                  </Field>
                  <Field label="Confidence">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.confidence || "-"}
                    </div>
                  </Field>
                  <Field label="Created by">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.createdByName || "-"}
                    </div>
                  </Field>
                  <Field label="Handled by">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.handledByName || "-"}
                    </div>
                  </Field>
                </div>

                <div className="ticketSummaryDivider" />

                <div className="ticketSummaryGrid">
                  <Field label="Name">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.name || ticket.callerName || "-"}
                    </div>
                  </Field>
                  <Field label="Phone">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.phone || ticket.phoneNumber || "-"}
                    </div>
                  </Field>
                  <Field label="Email (optional)">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.email || "-"}
                    </div>
                  </Field>
                </div>
              </div>

              {showEvidence ? (
                <div style={{ background: "#f3f4f6", padding: 12, borderRadius: 12 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontWeight: 900,
                    }}
                    onClick={() => setEvidenceOpen((value) => !value)}
                  >
                    <span>Voice Bot Evidence</span>
                    <span className="evidenceTogglePill">
                      {evidenceOpen ? "Hide" : "Show"}
                    </span>
                  </button>

                  {evidenceOpen ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {ticket.recordingUrl ? (
                        <audio controls style={{ width: "100%" }}>
                          <source src={ticket.recordingUrl} />
                          Your browser does not support audio playback.
                        </audio>
                      ) : (
                        <div className="lpMuted" style={{ fontWeight: 800 }}>
                          Audio not available.
                        </div>
                      )}

                      <div style={{ fontSize: 12, fontWeight: 1000 }}>Transcript</div>
                      <div style={{ background: "white", padding: 10, borderRadius: 10 }}>
                        {ticket.transcript || ticket.description || "-"}
                      </div>

                      {Array.isArray(ticket.sessionHistory) &&
                      ticket.sessionHistory.length > 0 ? (
                        <div className="card" style={{ marginTop: 2, background: "#fbfbff" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 900,
                                fontSize: 13,
                                color: "#111827",
                              }}
                            >
                              Conversation history
                            </div>
                            <span className="pill">Voice session</span>
                          </div>

                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            {ticket.sessionHistory.map((message, index) => (
                              <div
                                key={index}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 12,
                                  padding: 10,
                                  background: "#ffffff",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 10,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 900,
                                      fontSize: 12,
                                      color: "#0f172a",
                                    }}
                                  >
                                    {message?.speaker || "Speaker"}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "#94a3b8",
                                      fontWeight: 800,
                                    }}
                                  >
                                    {message?.at || ""}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    marginTop: 6,
                                    fontSize: 13,
                                    color: "#334155",
                                    lineHeight: 1.35,
                                  }}
                                >
                                  {message?.text || ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Field label="Category">
                <select
                  value={draft?.category || ""}
                  disabled={!isEditing || rejected || isResolved || isDeleted}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      category: e.target.value,
                    }))
                  }
                >
                  <option value="">Select category…</option>
                  {CANONICAL_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Department"
                hint={
                  !canEditDepartment
                    ? "Department changes are restricted for this ticket."
                    : ""
                }
              >
                <select
                  value={draft?.department || ""}
                  disabled={!isEditing || !canEditDepartment}
                  onChange={(e) => {
                    setDeptManuallySet(true);
                    setDraft((current) => ({
                      ...current,
                      department: e.target.value,
                      assignedDepartment: e.target.value,
                    }));
                  }}
                >
                  <option value="">Select department…</option>
                  {CANONICAL_DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Location">
                <input
                  value={draft?.location || ""}
                  disabled={!isEditing || rejected || isResolved || isDeleted}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      location: e.target.value,
                    }))
                  }
                  placeholder="Address or nearest intersection"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={draft?.description || ""}
                  disabled={!isEditing || rejected || isResolved || isDeleted}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      description: e.target.value,
                    }))
                  }
                  placeholder="What happened?"
                />
              </Field>

              <Field label="Notes (internal)">
                <textarea
                  value={draft?.notes || ""}
                  disabled={!isEditing || rejected || isResolved || isDeleted}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      notes: e.target.value,
                    }))
                  }
                  placeholder="Operator notes…"
                />
              </Field>

              {canDelete ? (
                <div style={{ borderTop: "1px solid rgba(15,23,42,0.08)", paddingTop: 12 }}>
                  <div style={{ fontWeight: 1000, marginBottom: 8 }}>Supervisor delete</div>
                  <div className="lpMuted" style={{ marginBottom: 8 }}>
                    This is a soft-delete. Ticket remains visible with status DELETE.
                  </div>
                  <textarea
                    value={deleteComment}
                    onChange={(e) => setDeleteComment(e.target.value)}
                    placeholder="Reason for delete…"
                    disabled={!isEditing}
                  />
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={saving || !isEditing}
                      onClick={doDelete}
                    >
                      {saving ? "Deleting…" : "Mark as DELETE"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="lpMuted" style={{ fontWeight: 700, fontSize: 12, marginTop: 6 }}>
                Changes are saved to the backend API. Use Back to return to your filtered list.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}