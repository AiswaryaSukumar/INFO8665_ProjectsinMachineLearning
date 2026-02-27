// src/components/TicketDetailsDrawer.jsx
import { useEffect, useMemo, useState } from "react";
import ToneBadge from "./ToneBadge";
import { useToast } from "./Toast";
import SessionHistory from "./SessionHistory"; // ✅ NEW (Task 502)

import {
  CATEGORIES as CANONICAL_CATEGORIES,
  DEPARTMENTS as CANONICAL_DEPARTMENTS,
  inferDepartmentFromCategory,
} from "../utils/categoryRouting";

export default function TicketDetailsDrawer({
  open,
  ticket,
  onClose,
  mode = "operator",
  // ✅ "OPERATOR" | "SUPERVISOR" (passed from IntakePage)
  sessionRole = "OPERATOR",
  // ✅ optional, but used for supervisor-only delete guard
  sessionName = "",
  role = "Operator", // backward compat only
  onApprove,
  onUpdate,
  onDelete,
  readOnly = false,
}) {
  if (!open || !ticket) return null;

  const { toast } = useToast();

  const isCitizen = mode === "citizen";
  const isReadOnly = !!readOnly || mode === "readonly";
  const routingStatus = String(ticket.routingStatus || "PENDING_APPROVAL").toUpperCase();
  const workflowStage = String(ticket.workflowStage || "").toUpperCase();
  const approved = routingStatus === "APPROVED";
  const rejected = routingStatus === "REJECTED";
  const isResolved = String(ticket.status || "").toUpperCase() === "RESOLVED";

  // ✅ session-based permissions (prefer passed-in sessionRole; keep backward compat via `role`)
  const roleUpper = String(
    sessionRole || (role === "Supervisor" ? "SUPERVISOR" : "OPERATOR")
  ).toUpperCase();

  const sessionNameClean = String(sessionName || "").trim();

  const canStaffAct = roleUpper === "OPERATOR" || roleUpper === "SUPERVISOR";

  const createdByType = ticket.createdByType || "OPERATOR";
  const createdByName = ticket.createdByName || "-";
  const isVoiceBotTicket = String(createdByType).toUpperCase() === "VOICE_BOT";

  const handledByRole = ticket.handledByRole || (isVoiceBotTicket ? "VOICE_BOT" : "OPERATOR");
  const handledByName = ticket.handledByName || createdByName || "-";
  const handledByType = ticket.handledByType || (isVoiceBotTicket ? "VOICE_BOT" : "OPERATOR");

  const isTransferredFromBot = String(handledByType).toUpperCase() === "VOICE_BOT_TO_HUMAN";

  const callHandledByLabel = (() => {
    const r = String(handledByRole || "").toUpperCase();
    const t = String(handledByType || "").toUpperCase();

    if (r === "VOICE_BOT" && t === "VOICE_BOT") return `Voice Bot (${handledByName})`;
    if (t === "VOICE_BOT_TO_HUMAN" && r === "OPERATOR")
      return `Voice Bot → Operator (${handledByName})`;
    if (t === "VOICE_BOT_TO_HUMAN" && r === "SUPERVISOR")
      return `Voice Bot → Supervisor (${handledByName})`;
    if (r === "SUPERVISOR") return `Supervisor (${handledByName})`;
    if (r === "OPERATOR") return `Operator (${handledByName})`;
    return handledByName !== "-" ? handledByName : "—";
  })();

  // ✅ Pure bot-only call (created by voice bot AND handled by voice bot)
  const isPureVoiceBot =
    String(createdByType).toUpperCase() === "VOICE_BOT" &&
    String(handledByRole || "VOICE_BOT").toUpperCase() === "VOICE_BOT" &&
    String(handledByType || "VOICE_BOT").toUpperCase() === "VOICE_BOT";

  // ✅ APPROVE RULE: Supervisor ONLY for bot-only tickets
  // Enterprise: approval is driven by an explicit workflow stage (with legacy fallback).
  const canApprove =
    !isCitizen &&
    !isReadOnly &&
    typeof onApprove === "function" &&
    roleUpper === "SUPERVISOR" &&
    isPureVoiceBot &&
    (workflowStage === "PENDING_APPROVAL" || workflowStage === "PENDING_SUPERVISOR_APPROVAL" || routingStatus === "PENDING_APPROVAL") &&
    !approved &&
    !rejected &&
    !isResolved;


  // ✅ Department can be edited only by staff, not RESOLVED,
  // and for bot-only tickets it should effectively be Supervisor-only
  const canEditDepartment =
    !isCitizen &&
    !isReadOnly &&
    typeof onUpdate === "function" &&
    canStaffAct &&
    !isResolved &&
    (!isPureVoiceBot || roleUpper === "SUPERVISOR");

  const isDeleted = String(ticket?.status || "").toUpperCase() === "DELETE";

  // ✅ DELETE RULE: Supervisor can mark a ticket as DELETE (soft-delete) with a required comment.
  // Ticket remains visible in the list with status DELETE.
  const canDelete =
    !isCitizen &&
    !isReadOnly &&
    typeof onDelete === "function" &&
    roleUpper === "SUPERVISOR" &&
    !isResolved &&
    !isDeleted &&
    String(handledByName || "").trim().toLowerCase() === sessionNameClean.toLowerCase();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(ticket);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const [deptManuallySet, setDeptManuallySet] = useState(false);

  const [deleteComment, setDeleteComment] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    setDraft(ticket);
    setSaving(false);
    setApproving(false);
    setDeptManuallySet(false);
    setDeleteComment("");
  }, [ticket?.id]); // ✅ reset on new ticket

  // ✅ EDIT permission: for bot-only tickets, Supervisor only
  const canEdit = useMemo(
    () =>
      !isCitizen &&
      !isReadOnly &&
      typeof onUpdate === "function" &&
      canStaffAct &&
      !isResolved &&
      (!isPureVoiceBot || roleUpper === "SUPERVISOR"),
    [isCitizen, isReadOnly, onUpdate, canStaffAct, isResolved, isPureVoiceBot, roleUpper]
  );

  const updateDraft = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  const DEPARTMENTS = CANONICAL_DEPARTMENTS;
  const CATEGORIES = CANONICAL_CATEGORIES;

  // ✅ toast + optimistic update + rollback
  const save = async () => {
    if (!draft.category || !draft.description) {
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
      ...(isVoiceBotTicket ? { confidence: draft.confidence || "MEDIUM" } : {}),
      ...(canEditDepartment
        ? { assignedDepartment: draft.assignedDepartment ? draft.assignedDepartment : null }
        : {}),
    };

    const before = { ...ticket };

    try {
      setSaving(true);

      // ✅ Call once (supports sync or async parents)
      await Promise.resolve(onUpdate?.(ticket.id, patch));

      setIsEditing(false);
      toast.success("Ticket updated.");
    } catch (e) {
      onUpdate?.(ticket.id, before);
      toast.error(e?.message || "Update failed. Changes were rolled back.");
    } finally {
      setSaving(false);
    }
  };

  // ✅ toast + await parent approve
  const approveAndRoute = async () => {
    try {
      setApproving(true);
      await Promise.resolve(onApprove?.(ticket.id));
      // Success toast is shown by the parent (IntakePage) so it can include routing details.
    } catch (e) {
      toast.error(e?.message || "Approve failed.");
    } finally {
      setApproving(false);
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
        onDelete?.(ticket.id, {
          status: "DELETE",
          deletedAt: new Date().toISOString(),
          deletedByRole: "SUPERVISOR",
          deletedByName: sessionNameClean || handledByName,
          deletedReason: deleteComment.trim(),
          deleteComment: deleteComment.trim(), // backward compat
        })
      );
      toast.success("Ticket marked as DELETE.");
      setDeleteComment("");
      onClose?.();
    } catch (e) {
      toast.error(e?.message || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const cancel = () => {
    setDraft(ticket);
    setIsEditing(false);
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
            <div style={{ fontSize: 12, color: "#6b7280" }}>{ticket.ticketNumber}</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {canEdit && !isEditing && (
              <button
                className="btn"
                onClick={() => setIsEditing(true)}
                disabled={saving || approving}
                type="button"
              >
                Edit
              </button>
            )}

            {canEdit && isEditing && (
              <>
                <button
                  className="btn primary"
                  onClick={save}
                  disabled={saving || approving}
                  type="button"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn"
                  onClick={cancel}
                  disabled={saving || approving}
                  type="button"
                >
                  Cancel
                </button>
              </>
            )}

            <button className="btn" onClick={onClose} disabled={saving || approving} type="button">
              Close
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <Field label="Ticket #" value={ticket.ticketNumber} />
          <Field label="Created" value={ticket.createdAt} />

          {!isCitizen &&
            (isEditing ? (
              <>
                <InputField label="Name" value={draft.name} onChange={(v) => updateDraft("name", v)} />
                <InputField
                  label="Phone"
                  value={draft.phone}
                  onChange={(v) => updateDraft("phone", v)}
                />
                <InputField
                  label="Email (optional)"
                  value={draft.email}
                  onChange={(v) => updateDraft("email", v)}
                />
              </>
            ) : (
              <>
                <Field label="Name" value={ticket.name} />
                <Field label="Phone" value={ticket.phone} />
                <Field label="Email (optional)" value={ticket.email || "-"} />
              </>
            ))}

          {isEditing ? (
            <InputField
              label="Location"
              value={draft.location}
              onChange={(v) => updateDraft("location", v)}
            />
          ) : (
            <Field label="Location" value={ticket.location} />
          )}

          {isEditing ? (
            <SelectField
              label="Category"
              value={draft.category}
              onChange={(v) => {
                updateDraft("category", v);
                // ✅ auto-populate department from category unless user manually overrides
                if (!deptManuallySet) {
                  updateDraft("assignedDepartment", inferDepartmentFromCategory(v));
                }
              }}
              options={CATEGORIES}
              placeholder="-- Select --"
              disabled={saving || approving}
            />
          ) : (
            <Field label="Category" value={ticket.category} />
          )}

          {!isCitizen && canStaffAct && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Assigned Department
              </div>

              <div style={{ background: "#f9fafb", padding: 10, borderRadius: 8 }}>
                <SelectField
                  label="Department"
                  value={(isEditing ? draft.assignedDepartment : ticket.assignedDepartment) || ""}
                  onChange={(v) => {
                    setDeptManuallySet(true);
                    updateDraft("assignedDepartment", v);
                  }}
                  options={DEPARTMENTS}
                  placeholder="-- Select --"
                  disabled={!isEditing || !canEditDepartment || saving || approving}
                />

                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Department can be edited in <b>Edit</b> mode (except RESOLVED).
                  {isPureVoiceBot && roleUpper !== "SUPERVISOR" ? (
                    <> Supervisor-only for bot-only tickets.</>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {isEditing ? (
            <>
              <SelectField
                label="Status"
                value={draft.status}
                onChange={(v) => updateDraft("status", v)}
                options={["NEW", "NEEDS_REVIEW", "IN_PROGRESS", "ESCALATED", "RESOLVED"]}
                disabled={saving || approving}
              />

              {isVoiceBotTicket && (
                <SelectField
                  label="Confidence"
                  value={draft.confidence}
                  onChange={(v) => updateDraft("confidence", v)}
                  options={["LOW", "MEDIUM", "HIGH"]}
                  disabled={saving || approving}
                />
              )}
            </>
          ) : (
            <>
              <Field label="Status" value={ticket.status} />
              {isVoiceBotTicket && <Field label="Confidence" value={ticket.confidence} />}
            </>
          )}

          {!isCitizen && (
            <div style={{ background: "#f9fafb", padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Call Handling (Voice Bot → Human)
              </div>

              <div style={{ fontSize: 13 }}>
                <b>Created By:</b> {isVoiceBotTicket ? "Voice Bot" : "Human"} ({createdByName})
              </div>

              <div style={{ fontSize: 13, marginTop: 6 }}>
                <b>Call Handled By:</b> {callHandledByLabel}
              </div>

              {isTransferredFromBot && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                  Transferred from Voice Bot to a human handler.
                </div>
              )}

              {ticket.escalatedToName && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13 }}>
                    <b>Escalated To:</b> {ticket.escalatedToName}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Reason: {ticket.escalationReason || "-"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ✅ Routing/Approval section: show for staff on bot-only tickets (Supervisor approves) */}
          {!isCitizen && canStaffAct && isPureVoiceBot && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Routing & Approval (Human-in-the-Loop)
              </div>

              <div style={{ background: "#f9fafb", padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 13 }}>
                  <b>Routing status:</b> {ticket.routingStatus || "PENDING_APPROVAL"}
                </div>

                <div style={{ fontSize: 13, marginTop: 10 }}>
                  <b>Approved at:</b> {ticket.approvedAt || "-"}
                </div>

                {canApprove && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn primary"
                      onClick={approveAndRoute}
                      title="Supervisor approval required before routing"
                      style={{ width: "100%" }}
                      disabled={saving || approving}
                      type="button"
                    >
                      {approving ? "Approving…" : "Approve & Route"}
                    </button>
                  </div>
                )}

                {approved && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                    Routed to {ticket.assignedDepartment || "department"} ✓
                  </div>
                )}

                {rejected && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                    Rejected — no routing action will be taken.
                  </div>
                )}

                {roleUpper !== "SUPERVISOR" && !approved && !rejected && !isResolved && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                    Supervisor approval required — bot-only tickets do not appear in the operator
                    queue.
                  </div>
                )}

                {isResolved && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                    Resolved ticket — read-only approval.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ✅ Supervisor soft-delete (keeps ticket visible with status DELETE) */}
          {!isCitizen && canStaffAct && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Supervisor Deletion
              </div>

              <div style={{ background: "#fef2f2", padding: 10, borderRadius: 8 }}>
                {isDeleted ? (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    This ticket was marked as <b>DELETE</b>.
                    {ticket.deletedByName ? (
                      <>
                        {" "}Deleted by <b>{ticket.deletedByName}</b>
                        {ticket.deletedAt ? ` at ${ticket.deletedAt}` : ""}.
                      </>
                    ) : null}
                    {ticket.deletedReason || ticket.deleteComment ? (
                      <div style={{ marginTop: 6 }}>
                        <b>Reason:</b> {ticket.deletedReason || ticket.deleteComment}
                      </div>
                    ) : null}
                  </div>
                ) : canDelete ? (
                  <>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Use this only if the ticket is irrelevant / invalid. A comment is required.
                    </div>

                    <textarea
                      value={deleteComment}
                      onChange={(e) => setDeleteComment(e.target.value)}
                      placeholder="Reason for deletion (required)"
                      style={{
                        width: "100%",
                        minHeight: 70,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        marginTop: 8,
                      }}
                      disabled={deleting || saving || approving}
                    />

                    <button
                      className="btn"
                      type="button"
                      onClick={deleteTicket}
                      disabled={deleting || saving || approving}
                      style={{ width: "100%", marginTop: 8, borderColor: "#fecaca" }}
                      title="Marks ticket as DELETE (soft-delete)"
                    >
                      {deleting ? "Deleting…" : "Mark as DELETE"}
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Only the assigned supervisor can mark this ticket as DELETE.
                  </div>
                )}
              </div>
            </div>
          )}

          {!isCitizen && !isResolved && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Caller Tone (Inferred)
              </div>
              <ToneBadge tone={ticket.tone} confidence={ticket.toneConfidence} />
            </div>
          )}

          <Field label="Channel" value={ticket.channel} />

          {!isCitizen && String(ticket.createdByType || "").toUpperCase() === "VOICE_BOT" && (
            <div style={{ background: "#f3f4f6", padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Voice Bot Evidence
              </div>

              <audio controls style={{ width: "100%" }}>
                <source src={ticket.recordingUrl} type="audio/wav" />
                Your browser does not support audio playback.
              </audio>

              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>Transcript</div>
              <div style={{ marginTop: 6, background: "white", padding: 10, borderRadius: 8 }}>
                {ticket.transcript || "-"}
              </div>

              {/* ✅ NEW: Task 502 session history */}
              {Array.isArray(ticket.sessionHistory) && ticket.sessionHistory.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <SessionHistory items={ticket.sessionHistory} />
                </div>
              )}
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Description</div>

            {isEditing ? (
              <textarea
                value={draft.description || ""}
                onChange={(e) => updateDraft("description", e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 110,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "white",
                }}
                disabled={saving || approving}
              />
            ) : (
              <div style={{ background: "#f3f4f6", padding: 10, borderRadius: 8 }}>
                {ticket.description}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Comments</div>

            {isEditing ? (
              <textarea
                value={draft.comments || ""}
                onChange={(e) => updateDraft("comments", e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 80,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "white",
                }}
                disabled={saving || approving}
              />
            ) : (
              <div style={{ background: "#f9fafb", padding: 10, borderRadius: 8 }}>
                {ticket.comments || "-"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ background: "#f9fafb", padding: 10, borderRadius: 8 }}>{value || "-"}</div>
    </div>
  );
}

function InputField({ label, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "white",
        }}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options = [], placeholder, disabled = false }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: disabled ? "#f3f4f6" : "white",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.9 : 1,
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
