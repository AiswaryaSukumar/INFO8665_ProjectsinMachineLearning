// src/pages/TicketDetailsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import ToneBadge from "../components/ToneBadge";
import { useToast } from "../components/Toast";

// ✅ Prototype store (localStorage) so SAVE / APPROVE works without an API server
import {
  approveAndRouteTicket,
  getTickets,
  updateTicketByNumber,
} from "../utils/ticketStore";

import {
  CATEGORIES as CANONICAL_CATEGORIES,
  DEPARTMENTS as CANONICAL_DEPARTMENTS,
  inferDepartmentFromCategory,
} from "../utils/categoryRouting";

function Field({ label, children, hint }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 900, fontSize: 12, color: "#334155" }}>{label}</div>
      {children}
      {hint ? (
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{hint}</div>
      ) : null}
    </div>
  );
}

function normalizeTicketForDraft(t) {
  if (!t) return t;

  // ✅ IMPORTANT: use || so empty-string doesn’t block fallback
  const dept =
    t.assignedDepartment ||
    t.department ||
    inferDepartmentFromCategory(t?.category) ||
    "";

  const notes = t.notes ?? t.comments ?? "";
  const transcript = t.transcript || t.description || "";

  return { ...t, department: dept, notes, transcript };
}

function hasEvidenceFields(t) {
  if (!t) return false;
  return (
    !!t.recordingUrl ||
    !!t.transcript ||
    (Array.isArray(t.sessionHistory) && t.sessionHistory.length > 0)
  );
}

export default function TicketDetailsPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { ticketNumber } = useParams();
  const { toast } = useToast();

  const [ticket, setTicket] = useState(() => loc.state?.ticket || null);
  const [loading, setLoading] = useState(!loc.state?.ticket);
  const [isEditing, setIsEditing] = useState(false);

  const [draft, setDraft] = useState(() => normalizeTicketForDraft(loc.state?.ticket || null));

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deleteComment, setDeleteComment] = useState("");
  const [deptManuallySet, setDeptManuallySet] = useState(false);

  // ✅ Evidence accordion (reduces crowding)
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const sessionRole = (localStorage.getItem("userRole") || "OPERATOR").toUpperCase();
  const sessionName = (localStorage.getItem("userName") || "").trim();
  const canStaffAct = sessionRole === "OPERATOR" || sessionRole === "SUPERVISOR";

  const backTo = loc.state?.backTo || loc.state?.from || "/dashboard/my-work";
  const listLabel = String(backTo).includes("/dashboard/overview") ? "Overview" : "My work";

  const onBack = () => {
    if (loc.state?.backTo) return nav(loc.state.backTo);
    if (loc.state?.from) return nav(loc.state.from);
    return nav("/dashboard/my-work");
  };

  // ✅ FIX: hydrate the “full ticket” even if a thin ticket was passed in state
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const stateTicket = loc.state?.ticket || null;

      // If we got a ticket via navigation AND it already has evidence/full fields, don’t refetch.
      // But if it’s “thin” (missing evidence fields), we DO refetch.
      const shouldHydrate = !stateTicket || !hasEvidenceFields(stateTicket);

      if (!shouldHydrate) {
        setTicket(stateTicket);
        setDraft(normalizeTicketForDraft(stateTicket));
        setLoading(false);
        return;
      }

      setLoading(true);

      // ✅ Always hydrate from local prototype store
      const list = getTickets();
      if (cancelled) return;

      const found =
        list.find((t) => String(t.ticketNumber) === String(ticketNumber)) ||
        list.find((t) => String(t.id) === String(ticketNumber)) ||
        null;

      const merged = found ? { ...(stateTicket || {}), ...found } : stateTicket;
      setTicket(merged || null);
      setDraft(normalizeTicketForDraft(merged || null));

      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketNumber]);

  useEffect(() => {
    if (!ticket) return;
    setDraft(normalizeTicketForDraft(ticket));

    // ✅ if evidence exists, open by default (so it never “looks missing”)
    setEvidenceOpen(hasEvidenceFields(ticket));
  }, [ticket]);

  // ✅ If category changes, infer department (unless user manually picked)
  useEffect(() => {
    if (!draft) return;
    if (deptManuallySet) return;

    const c = String(draft.category || "").trim();
    if (!c) return;

    const inferred = inferDepartmentFromCategory(c);
    if (!inferred) return;

    setDraft((d) => ({ ...d, department: inferred }));
  }, [draft?.category, deptManuallySet]);

  const routingStatus = useMemo(
    () => String(ticket?.routingStatus || "PENDING_APPROVAL").toUpperCase(),
    [ticket]
  );
  const workflowStage = useMemo(
    () => String(ticket?.workflowStage || "").toUpperCase(),
    [ticket]
  );

  const approved = routingStatus === "APPROVED";
  const rejected = routingStatus === "REJECTED";
  const isResolved = String(ticket?.status || "").toUpperCase() === "RESOLVED";
  const isDeleted = String(ticket?.status || "").toUpperCase() === "DELETE";

  const createdByType = ticket?.createdByType || "OPERATOR";
  const createdByName = ticket?.createdByName || "-";
  const isVoiceBotTicket = String(createdByType).toUpperCase() === "VOICE_BOT";

  const handledByRole = ticket?.handledByRole || (isVoiceBotTicket ? "VOICE_BOT" : "OPERATOR");
  const handledByName = ticket?.handledByName || createdByName || "-";
  const handledByType = ticket?.handledByType || (isVoiceBotTicket ? "VOICE_BOT" : "OPERATOR");

  const isPureVoiceBot =
    String(createdByType).toUpperCase() === "VOICE_BOT" &&
    String(handledByRole || "VOICE_BOT").toUpperCase() === "VOICE_BOT" &&
    String(handledByType || "VOICE_BOT").toUpperCase() === "VOICE_BOT";

  const canApprove =
    sessionRole === "SUPERVISOR" &&
    isPureVoiceBot &&
    (workflowStage === "PENDING_SUPERVISOR_APPROVAL" || routingStatus === "PENDING_APPROVAL") &&
    !approved &&
    !rejected &&
    !isResolved;

  const canEditDepartment =
    canStaffAct && !isResolved && (!isPureVoiceBot || sessionRole === "SUPERVISOR");

  const canDelete =
    sessionRole === "SUPERVISOR" &&
    !isResolved &&
    !isDeleted &&
    String(handledByName || "").trim().toLowerCase() === sessionName.toLowerCase();

  async function doSave() {
    if (!draft) return;
    setSaving(true);

    try {
      const payload = {
        ...draft,
        assignedDepartment: draft.department || null,
        updatedByRole: sessionRole,
        updatedByName: sessionName || "-",
      };

      const res = updateTicketByNumber(draft.ticketNumber, payload);
      if (!res.ok) throw new Error(res.error || "Save failed");
      setTicket(res.ticket);
      setIsEditing(false);

      toast({ type: "success", title: "Saved", msg: "Ticket updated successfully." });
    } catch (e) {
      console.error(e);
      toast({ type: "error", title: "Save failed", msg: "Could not update ticket." });
    } finally {
      setSaving(false);
    }
  }

  async function doApprove() {
    if (!ticket) return;
    setApproving(true);

    try {
      const dept = draft?.department || ticket.assignedDepartment;
      if (!dept) {
        toast({ type: "warning", title: "Department required", msg: "Select a department first." });
        return;
      }

      const res = approveAndRouteTicket(ticket.ticketNumber, dept, sessionName || "-", sessionRole);
      if (!res.ok) throw new Error(res.error || "Approve failed");
      setTicket(res.ticket);
      toast({ type: "success", title: "Approved & Routed", msg: `✅ Routed to ${dept}.` });
    } catch (e) {
      console.error(e);
      toast({ type: "error", title: "Approve failed", msg: "Could not approve ticket." });
    } finally {
      setApproving(false);
    }
  }

  async function doDelete() {
    if (!ticket) return;

    if (!deleteComment.trim()) {
      toast({ type: "warning", title: "Comment required", msg: "Add a delete reason." });
      return;
    }

    setSaving(true);

    try {
      const patch = {
        status: "DELETE",
        deletedAt: new Date().toISOString(),
        deletedByRole: sessionRole,
        deletedByName: sessionName || "-",
        deletedReason: deleteComment,
        deleteComment,
      };

      const res = updateTicketByNumber(ticket.ticketNumber, patch);
      if (!res.ok) throw new Error(res.error || "Delete failed");
      setTicket(res.ticket);
      setIsEditing(false);

      toast({ type: "success", title: "Deleted", msg: "Ticket marked as DELETE." });
    } catch (e) {
      console.error(e);
      toast({ type: "error", title: "Delete failed", msg: "Could not delete ticket." });
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
          <div className="lpMuted">We couldn’t load this ticket. It may have been removed.</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={onBack} type="button">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const callHandledByLabel = (() => {
    const r = String(handledByRole || "").toUpperCase();
    const t = String(handledByType || "").toUpperCase();

    if (r === "VOICE_BOT" && t === "VOICE_BOT") return `Voice Bot (${handledByName})`;
    if (t === "VOICE_BOT_TO_HUMAN" && r === "OPERATOR") return `Voice Bot → Operator (${handledByName})`;
    if (t === "VOICE_BOT_TO_HUMAN" && r === "SUPERVISOR") return `Voice Bot → Supervisor (${handledByName})`;
    if (r === "SUPERVISOR") return `Supervisor (${handledByName})`;
    if (r === "OPERATOR") return `Operator (${handledByName})`;

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
              <span className="ticketCrumbCurrent">Ticket #{ticket.ticketNumber || ticket.id}</span>
            </>
          ) : (
            <>
              <button className="ticketCrumbLink" type="button" onClick={() => nav("/dashboard/my-work")}>
                Dashboard
              </button>
              <span className="ticketCrumbSep">›</span>
              <button className="ticketCrumbLink" type="button" onClick={() => nav(backTo)}>
                {listLabel}
              </button>
              <span className="ticketCrumbSep">›</span>
              <span className="ticketCrumbCurrent">Ticket #{ticket.ticketNumber || ticket.id}</span>
            </>
          )}
        </div>

        <div className="ticketHeaderRow">
          <div className="ticketHeaderTitle">
            <div className="ticketHeaderKicker">Ticket</div>
            <div className="ticketHeaderId">{ticket.ticketNumber || ticket.id}</div>
          </div>

          <div className="ticketHeaderActions">
            <button className="btn" type="button" onClick={onBack}>
              Back
            </button>

            {canApprove ? (
              <button className="btn primary" type="button" disabled={approving} onClick={doApprove}>
                {approving ? "Approving…" : "Approve & Route"}
              </button>
            ) : null}

            <button
              className="btn"
              type="button"
              onClick={() => {
                setIsEditing((v) => !v);
                setDraft(normalizeTicketForDraft(ticket));
                setDeptManuallySet(false);
              }}
              disabled={!canStaffAct || isResolved || isDeleted}
            >
              {isEditing ? "Cancel edit" : "Edit"}
            </button>

            {isEditing ? (
              <button className="btn primary" type="button" disabled={saving} onClick={doSave}>
                {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="ticketBody">
        <div className="container">
          <div className="card ticketCard">
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span className={`metaPill ${approved ? "" : "metaPillMuted"}`}>Routing: {routingStatus}</span>
              <span className="metaPill metaPillMuted">Handled by: {callHandledByLabel}</span>

              {ticket.tone ? (
                <span className="metaPill metaPillMuted">
                  Tone: <ToneBadge tone={ticket.tone} />
                </span>
              ) : null}

              {ticket.channel ? <span className="metaPill metaPillMuted">Channel: {ticket.channel}</span> : null}
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
              {/* Top summary */}
              <div className="ticketSummaryCard">
                <div className="ticketSummaryHeader">
                  <div className="ticketSummaryTitle">Ticket summary</div>
                  <div className="ticketSummaryHint">Citizen + workflow metadata</div>
                </div>

                {/* Row 1: workflow/meta */}
                <div className="ticketSummaryGrid">
                  <Field label="Created">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.createdAt || "-"}
                    </div>
                  </Field>
                  <Field label="Status">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.status || "-"}
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

                {/* Row 2: citizen/contact */}
                <div className="ticketSummaryGrid">
                  <Field label="Name">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.name || "-"}
                    </div>
                  </Field>
                  <Field label="Phone">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.phone || "-"}
                    </div>
                  </Field>
                  <Field label="Email (optional)">
                    <div className="lpMuted" style={{ fontWeight: 900 }}>
                      {ticket.email || "-"}
                    </div>
                  </Field>
                </div>
              </div>

              {/* ✅ Evidence (accordion + auto-open if present) */}
              {showEvidence ? (
                <div style={{ background: "#f3f4f6", padding: 12, borderRadius: 12 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontWeight: 900,
                    }}
                    onClick={() => setEvidenceOpen((v) => !v)}
                  >
                    <span>Voice Bot Evidence</span>
                    <span className="evidenceTogglePill">{evidenceOpen ? "Hide" : "Show"}</span>
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

                      {Array.isArray(ticket.sessionHistory) && ticket.sessionHistory.length > 0 ? (
                        <div className="card" style={{ marginTop: 2, background: "#fbfbff" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>
                              Conversation history
                            </div>
                            <span className="pill">Voice session</span>
                          </div>

                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            {ticket.sessionHistory.map((m, i) => (
                              <div
                                key={i}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 12,
                                  padding: 10,
                                  background: "#ffffff",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ fontWeight: 900, fontSize: 12, color: "#0f172a" }}>
                                    {m?.speaker || "Speaker"}
                                  </div>
                                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 800 }}>
                                    {m?.at || ""}
                                  </div>
                                </div>

                                <div style={{ marginTop: 6, fontSize: 13, color: "#334155", lineHeight: 1.35 }}>
                                  {m?.text || ""}
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

              {/* Editable fields */}
              <Field label="Category">
                <select
                  value={draft?.category || ""}
                  disabled={!isEditing}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                >
                  <option value="">Select category…</option>
                  {CANONICAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Department"
                hint={!canEditDepartment ? "Department changes are restricted for this ticket." : ""}
              >
                <select
                  value={draft?.department || ""}
                  disabled={!isEditing || !canEditDepartment}
                  onChange={(e) => {
                    setDeptManuallySet(true);
                    setDraft((d) => ({ ...d, department: e.target.value }));
                  }}
                >
                  <option value="">Select department…</option>
                  {CANONICAL_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Location">
                <input
                  value={draft?.location || ""}
                  disabled={!isEditing}
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  placeholder="Address or nearest intersection"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={draft?.description || ""}
                  disabled={!isEditing}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="What happened?"
                />
              </Field>

              <Field label="Notes (internal)">
                <textarea
                  value={draft?.notes || ""}
                  disabled={!isEditing}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
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
                  <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                    <button className="btn" type="button" disabled={saving || !isEditing} onClick={doDelete}>
                      {saving ? "Deleting…" : "Mark as DELETE"}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* small hint (replaces ticket footer text) */}
              <div className="lpMuted" style={{ fontWeight: 700, fontSize: 12, marginTop: 6 }}>
                Changes are saved to the demo store. Use Back to return to your filtered list.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ REMOVED ticketFooter to avoid double-footer with DashboardLayout */}
    </div>
  );
}
