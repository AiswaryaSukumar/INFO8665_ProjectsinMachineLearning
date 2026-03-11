// src/components/TicketDetailsDrawer.jsx
import { useEffect, useMemo, useState } from "react";
import ToneBadge from "./ToneBadge";
import { useToast } from "./Toast";
import SessionHistory from "./SessionHistory";

import {
  CATEGORIES as CANONICAL_CATEGORIES,
  DEPARTMENTS as CANONICAL_DEPARTMENTS,
  inferDepartmentFromCategory,
} from "../utils/categoryRouting";

function upper(value) {
  return String(value || "").toUpperCase();
}

function isResolvedTicket(ticket) {
  return upper(ticket?.status) === "RESOLVED";
}

function isDeletedTicket(ticket) {
  return upper(ticket?.status) === "DELETE";
}

function isApprovedTicket(ticket) {
  return upper(ticket?.routingStatus) === "APPROVED";
}

function isRejectedTicket(ticket) {
  const routing = upper(ticket?.routingStatus);
  const stage = upper(ticket?.workflowStage);
  return routing === "REJECTED" || stage.includes("REJECTED");
}

function isPendingSupervisorDecision(ticket) {
  const routingStatus = upper(ticket?.routingStatus || "PENDING_APPROVAL");
  const workflowStage = upper(ticket?.workflowStage);

  return (
    workflowStage === "PENDING_APPROVAL" ||
    workflowStage === "PENDING_SUPERVISOR_APPROVAL" ||
    routingStatus === "PENDING_APPROVAL"
  );
}

function isPureVoiceBotTicket(ticket) {
  const createdByType = upper(ticket?.createdByType || "OPERATOR");
  const handledByRole = upper(ticket?.handledByRole || "VOICE_BOT");
  const handledByType = upper(ticket?.handledByType || "VOICE_BOT");

  return (
    createdByType === "VOICE_BOT" &&
    handledByRole === "VOICE_BOT" &&
    handledByType === "VOICE_BOT"
  );
}

function hasEvidenceFields(ticket) {
  if (!ticket) return false;
  return (
    !!ticket.recordingUrl ||
    !!ticket.transcript ||
    (Array.isArray(ticket.sessionHistory) && ticket.sessionHistory.length > 0)
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{label}</div>
      {children}
      {hint ? (
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{hint}</div>
      ) : null}
    </div>
  );
}

function ReadValue({ value }) {
  return (
    <div
      style={{
        background: "#f8fafc",
        padding: 10,
        borderRadius: 10,
        border: "1px solid #e5e7eb",
      }}
    >
      {value || "-"}
    </div>
  );
}

function InputField({ label, value, onChange, disabled = false, type = "text" }) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </Field>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled = false,
  placeholder = "",
  rows = 4,
}) {
  return (
    <Field label={label}>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options = [],
  placeholder = "",
  disabled = false,
  hint = "",
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function TicketDetailsDrawer({
  open,
  ticket,
  onClose,
  mode = "operator",
  sessionRole = "OPERATOR",
  sessionName = "",
  role = "Operator",
  onApprove,
  onReject,
  onUpdate,
  onDelete,
  readOnly = false,
}) {
  const { toast } = useToast();

  const isCitizen = mode === "citizen";
  const isReadOnly = !!readOnly || mode === "readonly";

  const roleUpper = upper(
    sessionRole || (role === "Supervisor" ? "SUPERVISOR" : "OPERATOR")
  );
  const sessionNameClean = String(sessionName || "").trim();
  const canStaffAct = roleUpper === "OPERATOR" || roleUpper === "SUPERVISOR";

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(ticket || null);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [deptManuallySet, setDeptManuallySet] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [deleteComment, setDeleteComment] = useState("");

  useEffect(() => {
    setIsEditing(false);
    setDraft(ticket || null);
    setSaving(false);
    setApproving(false);
    setRejecting(false);
    setDeleting(false);
    setDeptManuallySet(false);
    setRejectComment("");
    setDeleteComment("");
  }, [ticket?.id, ticket?.ticketNumber]);

  const safeTicket = ticket || draft;
  if (!open || !safeTicket) return null;

  const routingStatus = upper(safeTicket.routingStatus || "PENDING_APPROVAL");
  const approved = isApprovedTicket(safeTicket);
  const rejected = isRejectedTicket(safeTicket);
  const isResolved = isResolvedTicket(safeTicket);
  const isDeleted = isDeletedTicket(safeTicket);
  const routingStatusLabel = isDeleted ? "DELETED" : routingStatus;

  const createdByType = safeTicket.createdByType || "OPERATOR";
  const createdByName = safeTicket.createdByName || "-";
  const isVoiceBotTicket = upper(createdByType) === "VOICE_BOT";

  const handledByRole =
    safeTicket.handledByRole || (isVoiceBotTicket ? "VOICE_BOT" : "OPERATOR");
  const handledByName = safeTicket.handledByName || createdByName || "-";
  const handledByType =
    safeTicket.handledByType || (isVoiceBotTicket ? "VOICE_BOT" : "OPERATOR");

  const isTransferredFromBot = upper(handledByType) === "VOICE_BOT_TO_HUMAN";
  const isPureVoiceBot = isPureVoiceBotTicket(safeTicket);

  const canApprove =
    !isCitizen &&
    !isReadOnly &&
    typeof onApprove === "function" &&
    roleUpper === "SUPERVISOR" &&
    isPureVoiceBot &&
    isPendingSupervisorDecision(safeTicket) &&
    !approved &&
    !rejected &&
    !isResolved &&
    !isDeleted;

  const canReject =
    !isCitizen &&
    !isReadOnly &&
    typeof onReject === "function" &&
    roleUpper === "SUPERVISOR" &&
    isPureVoiceBot &&
    isPendingSupervisorDecision(safeTicket) &&
    !approved &&
    !rejected &&
    !isResolved &&
    !isDeleted;

  const canEditDepartment =
    !isCitizen &&
    !isReadOnly &&
    typeof onUpdate === "function" &&
    canStaffAct &&
    !isResolved &&
    !isDeleted &&
    (!isPureVoiceBot || roleUpper === "SUPERVISOR");

  const canDelete =
    !isCitizen &&
    !isReadOnly &&
    typeof onDelete === "function" &&
    roleUpper === "SUPERVISOR" &&
    !isResolved &&
    !isDeleted;

  const canEdit =
    !isCitizen &&
    !isReadOnly &&
    typeof onUpdate === "function" &&
    canStaffAct &&
    !isResolved &&
    !isDeleted &&
    (!isPureVoiceBot || roleUpper === "SUPERVISOR");

  const callHandledByLabel = useMemo(() => {
    const handledRole = upper(handledByRole);
    const handledType = upper(handledByType);

    if (handledRole === "VOICE_BOT" && handledType === "VOICE_BOT") {
      return `Voice Bot (${handledByName})`;
    }
    if (handledType === "VOICE_BOT_TO_HUMAN" && handledRole === "OPERATOR") {
      return `Voice Bot → Operator (${handledByName})`;
    }
    if (handledType === "VOICE_BOT_TO_HUMAN" && handledRole === "SUPERVISOR") {
      return `Voice Bot → Supervisor (${handledByName})`;
    }
    if (handledRole === "SUPERVISOR") return `Supervisor (${handledByName})`;
    if (handledRole === "OPERATOR") return `Operator (${handledByName})`;
    return handledByName !== "-" ? handledByName : "—";
  }, [handledByName, handledByRole, handledByType]);

  useEffect(() => {
    if (!isEditing || !draft || deptManuallySet) return;

    const category = String(draft.category || "").trim();
    if (!category) return;

    const inferred = inferDepartmentFromCategory(category);
    if (!inferred) return;

    setDraft((prev) => ({
      ...prev,
      assignedDepartment: inferred,
    }));
  }, [draft?.category, isEditing, deptManuallySet]);

  const updateDraft = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!draft?.category || !draft?.description) {
      toast.error("Category and Description are required.");
      return;
    }

    const patch = {
      name: draft.name || "",
      phone: draft.phone || "",
      email: draft.email || "",
      location: draft.location || "",
      category: draft.category || "",
      status: draft.status || "NEW",
      description: draft.description || "",
      comments: draft.comments || "",
      notes: draft.notes || draft.comments || "",
      ...(isVoiceBotTicket ? { confidence: draft.confidence || "MEDIUM" } : {}),
      ...(canEditDepartment
        ? { assignedDepartment: draft.assignedDepartment || null }
        : {}),
    };

    try {
      setSaving(true);
      await Promise.resolve(onUpdate?.(safeTicket.id, patch));
      setIsEditing(false);
      toast.success("Ticket updated.");
    } catch (error) {
      toast.error(error?.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const approveAndRoute = async () => {
    if (!canApprove) return;

    try {
      setApproving(true);
      await Promise.resolve(onApprove?.(safeTicket.id));
    } catch (error) {
      toast.error(error?.message || "Approve failed.");
    } finally {
      setApproving(false);
    }
  };

  const rejectAndHold = async () => {
    if (!canReject) return;

    try {
      setRejecting(true);
      await Promise.resolve(onReject?.(safeTicket.id, rejectComment.trim()));
      toast.success("Ticket rejected.");
      setRejectComment("");
      onClose?.();
    } catch (error) {
      toast.error(error?.message || "Reject failed.");
    } finally {
      setRejecting(false);
    }
  };

  const deleteTicket = async () => {
    if (!canDelete) return;

    if (!deleteComment.trim()) {
      toast.error("Please add a supervisor comment before deleting.");
      return;
    }

    try {
      setDeleting(true);
      await Promise.resolve(
        onDelete?.(safeTicket.id, {
          status: "DELETE",
          deletedAt: new Date().toISOString(),
          deletedByRole: "SUPERVISOR",
          deletedByName: sessionNameClean || handledByName,
          deletedReason: deleteComment.trim(),
          deleteComment: deleteComment.trim(),
        })
      );
      toast.success("Ticket marked as DELETE.");
      setDeleteComment("");
      onClose?.();
    } catch (error) {
      toast.error(error?.message || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const cancel = () => {
    setDraft(ticket || safeTicket);
    setIsEditing(false);
    setDeptManuallySet(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "92vw",
          height: "100%",
          background: "white",
          padding: 16,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Ticket Details</h3>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {safeTicket.ticketNumber || safeTicket.id}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {canEdit && !isEditing ? (
              <button
                className="btn ghost"
                onClick={() => setIsEditing(true)}
                disabled={saving || approving || rejecting || deleting}
                type="button"
              >
                Edit
              </button>
            ) : null}

            {canEdit && isEditing ? (
              <>
                <button
                  className="btn primary"
                  onClick={save}
                  disabled={saving || approving || rejecting || deleting}
                  type="button"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn ghost"
                  onClick={cancel}
                  disabled={saving || approving || rejecting || deleting}
                  type="button"
                >
                  Cancel
                </button>
              </>
            ) : null}

            <button
              className="btn ghost"
              onClick={onClose}
              disabled={saving || approving || rejecting || deleting}
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <Field label="Ticket #">
            <ReadValue value={safeTicket.ticketNumber} />
          </Field>

          <Field label="Created">
            <ReadValue value={safeTicket.createdAt} />
          </Field>

          {!isCitizen && (
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                Call Handling (Voice Bot → Human)
              </div>

              <div style={{ fontSize: 13 }}>
                <b>Created By:</b> {isVoiceBotTicket ? "Voice Bot" : "Human"} ({createdByName})
              </div>

              <div style={{ fontSize: 13, marginTop: 6 }}>
                <b>Call Handled By:</b> {callHandledByLabel}
              </div>

              {isTransferredFromBot ? (
                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                  Transferred from Voice Bot to a human handler.
                </div>
              ) : null}

              {safeTicket.escalatedToName ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13 }}>
                    <b>Escalated To:</b> {safeTicket.escalatedToName}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Reason: {safeTicket.escalationReason || "-"}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!isCitizen && canStaffAct && isPureVoiceBot ? (
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                Routing & Approval (Human-in-the-Loop)
              </div>

              <div style={{ fontSize: 13 }}>
                <b>Routing status:</b> {routingStatusLabel}
              </div>

              <div style={{ fontSize: 13, marginTop: 10 }}>
                <b>Approved at:</b> {safeTicket.approvedAt || "-"}
              </div>

              {(canApprove || canReject) ? (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {canApprove ? (
                    <button
                      className="btn primary"
                      onClick={approveAndRoute}
                      disabled={saving || approving || rejecting || deleting}
                      type="button"
                      style={{ width: "100%" }}
                    >
                      {approving ? "Approving…" : "Approve & Route"}
                    </button>
                  ) : null}

                  {canReject ? (
                    <>
                      <textarea
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        placeholder="Reason for rejection (optional)"
                        rows={3}
                        disabled={saving || approving || rejecting || deleting}
                      />
                      <button
                        className="btn secondary"
                        onClick={rejectAndHold}
                        disabled={saving || approving || rejecting || deleting}
                        type="button"
                        style={{ width: "100%" }}
                      >
                        {rejecting ? "Rejecting…" : "Reject"}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {approved ? (
                <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                  Routed to {safeTicket.assignedDepartment || "department"} ✓
                </div>
              ) : null}

              {rejected ? (
                <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                  Rejected — no routing action will be taken.
                  {safeTicket.rejectedReason ? (
                    <div style={{ marginTop: 6 }}>
                      <b>Reason:</b> {safeTicket.rejectedReason}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isDeleted ? (
                <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                  Deleted — no further workflow action is available.
                </div>
              ) : null}

              {roleUpper !== "SUPERVISOR" && !approved && !rejected && !isResolved && !isDeleted ? (
                <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                  Supervisor approval required — bot-only tickets do not appear in the operator queue.
                </div>
              ) : null}

              {isResolved ? (
                <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                  Resolved ticket — read-only approval.
                </div>
              ) : null}
            </div>
          ) : null}

          {!isCitizen && canStaffAct ? (
            <div style={{ background: "#fef2f2", padding: 12, borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                Supervisor Deletion
              </div>

              {isDeleted ? (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  This ticket was marked as <b>DELETE</b>.
                  {safeTicket.deletedByName ? (
                    <>
                      {" "}Deleted by <b>{safeTicket.deletedByName}</b>
                      {safeTicket.deletedAt ? ` at ${safeTicket.deletedAt}` : ""}.
                    </>
                  ) : null}
                  {safeTicket.deletedReason || safeTicket.deleteComment ? (
                    <div style={{ marginTop: 6 }}>
                      <b>Reason:</b> {safeTicket.deletedReason || safeTicket.deleteComment}
                    </div>
                  ) : null}
                </div>
              ) : canDelete ? (
                <>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Use this only if the ticket is irrelevant or invalid. A comment is required.
                  </div>

                  <textarea
                    value={deleteComment}
                    onChange={(e) => setDeleteComment(e.target.value)}
                    placeholder="Reason for deletion (required)"
                    rows={3}
                    disabled={deleting || saving || approving || rejecting}
                    style={{ marginTop: 8 }}
                  />

                  <button
                    className="btn secondary"
                    type="button"
                    onClick={deleteTicket}
                    disabled={deleting || saving || approving || rejecting}
                    style={{ width: "100%", marginTop: 8 }}
                  >
                    {deleting ? "Deleting…" : "Mark as DELETE"}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Supervisor can mark this ticket as DELETE.
                </div>
              )}
            </div>
          ) : null}

          {!isCitizen && !isResolved ? (
            <Field label="Caller Tone (Inferred)">
              <ToneBadge tone={safeTicket.tone} confidence={safeTicket.toneConfidence} />
            </Field>
          ) : null}

          <Field label="Channel">
            <ReadValue value={safeTicket.channel} />
          </Field>

          {isEditing ? (
            <>
              <InputField
                label="Name"
                value={draft?.name}
                onChange={(value) => updateDraft("name", value)}
                disabled={saving || approving || rejecting || deleting}
              />

              <InputField
                label="Phone"
                value={draft?.phone}
                onChange={(value) => updateDraft("phone", value)}
                disabled={saving || approving || rejecting || deleting}
              />

              <InputField
                label="Email (optional)"
                value={draft?.email}
                onChange={(value) => updateDraft("email", value)}
                disabled={saving || approving || rejecting || deleting}
              />
            </>
          ) : !isCitizen ? (
            <>
              <Field label="Name">
                <ReadValue value={safeTicket.name} />
              </Field>
              <Field label="Phone">
                <ReadValue value={safeTicket.phone} />
              </Field>
              <Field label="Email (optional)">
                <ReadValue value={safeTicket.email} />
              </Field>
            </>
          ) : null}

          {isEditing ? (
            <InputField
              label="Location"
              value={draft?.location}
              onChange={(value) => updateDraft("location", value)}
              disabled={saving || approving || rejecting || deleting}
            />
          ) : (
            <Field label="Location">
              <ReadValue value={safeTicket.location} />
            </Field>
          )}

          {isEditing ? (
            <SelectField
              label="Category"
              value={draft?.category}
              onChange={(value) => {
                updateDraft("category", value);
                if (!deptManuallySet) {
                  updateDraft("assignedDepartment", inferDepartmentFromCategory(value));
                }
              }}
              options={CANONICAL_CATEGORIES}
              placeholder="-- Select --"
              disabled={saving || approving || rejecting || deleting}
            />
          ) : (
            <Field label="Category">
              <ReadValue value={safeTicket.category} />
            </Field>
          )}

          {!isCitizen && canStaffAct ? (
            <SelectField
              label="Assigned Department"
              value={
                (isEditing ? draft?.assignedDepartment : safeTicket.assignedDepartment) || ""
              }
              onChange={(value) => {
                setDeptManuallySet(true);
                updateDraft("assignedDepartment", value);
              }}
              options={CANONICAL_DEPARTMENTS}
              placeholder="-- Select --"
              disabled={!isEditing || !canEditDepartment || saving || approving || rejecting || deleting}
              hint={
                !canEditDepartment
                  ? "Department changes are restricted for this ticket."
                  : isPureVoiceBot && roleUpper !== "SUPERVISOR"
                  ? "Supervisor-only for bot-only tickets."
                  : ""
              }
            />
          ) : null}

          {isEditing ? (
            <>
              <SelectField
                label="Status"
                value={draft?.status}
                onChange={(value) => updateDraft("status", value)}
                options={["NEW", "NEEDS_REVIEW", "IN_PROGRESS", "ESCALATED", "RESOLVED"]}
                disabled={saving || approving || rejecting || deleting}
              />

              {isVoiceBotTicket ? (
                <SelectField
                  label="Confidence"
                  value={draft?.confidence}
                  onChange={(value) => updateDraft("confidence", value)}
                  options={["LOW", "MEDIUM", "HIGH"]}
                  disabled={saving || approving || rejecting || deleting}
                />
              ) : null}
            </>
          ) : (
            <>
              <Field label="Status">
                <ReadValue value={safeTicket.status} />
              </Field>
              {isVoiceBotTicket ? (
                <Field label="Confidence">
                  <ReadValue value={safeTicket.confidence} />
                </Field>
              ) : null}
            </>
          )}

          {hasEvidenceFields(safeTicket) && !isCitizen ? (
            <div style={{ background: "#f3f4f6", padding: 12, borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                Voice Bot Evidence
              </div>

              {safeTicket.recordingUrl ? (
                <audio controls style={{ width: "100%" }}>
                  <source src={safeTicket.recordingUrl} type="audio/wav" />
                  Your browser does not support audio playback.
                </audio>
              ) : (
                <div className="lpMuted" style={{ fontWeight: 700 }}>
                  Audio not available.
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <Field label="Transcript">
                  <ReadValue value={safeTicket.transcript || safeTicket.description} />
                </Field>
              </div>

              {Array.isArray(safeTicket.sessionHistory) && safeTicket.sessionHistory.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <SessionHistory items={safeTicket.sessionHistory} />
                </div>
              ) : null}
            </div>
          ) : null}

          {isEditing ? (
            <TextAreaField
              label="Description"
              value={draft?.description || ""}
              onChange={(value) => updateDraft("description", value)}
              disabled={saving || approving || rejecting || deleting}
              placeholder="Describe the issue"
              rows={5}
            />
          ) : (
            <Field label="Description">
              <ReadValue value={safeTicket.description} />
            </Field>
          )}

          {isEditing ? (
            <TextAreaField
              label="Comments"
              value={draft?.comments || ""}
              onChange={(value) => updateDraft("comments", value)}
              disabled={saving || approving || rejecting || deleting}
              placeholder="Internal comments"
              rows={4}
            />
          ) : (
            <Field label="Comments">
              <ReadValue value={safeTicket.comments} />
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}