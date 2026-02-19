// src/components/TicketDetailsDrawer.jsx
import { useEffect, useMemo, useState } from "react";
import ToneBadge from "./ToneBadge";
import { useToast } from "./Toast";
import SessionHistory from "./SessionHistory"; // ✅ NEW (Task 502)

export default function TicketDetailsDrawer({
  open,
  ticket,
  onClose,
  mode = "operator",
  role = "Operator", // backward compat only
  onApprove,
  onUpdate,
}) {
  if (!open || !ticket) return null;

  const { toast } = useToast();

  const isCitizen = mode === "citizen";
  const routingStatus = String(ticket.routingStatus || "PENDING_APPROVAL").toUpperCase();
  const approved = routingStatus === "APPROVED";
  const rejected = routingStatus === "REJECTED";
  const isResolved = String(ticket.status || "").toUpperCase() === "RESOLVED";

  // ✅ session-based permissions
  const sessionRole = (
    localStorage.getItem("userRole") || (role === "Supervisor" ? "SUPERVISOR" : "OPERATOR")
  ).toUpperCase();

  const canStaffAct = sessionRole === "OPERATOR" || sessionRole === "SUPERVISOR";

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
  const canApprove =
    !isCitizen &&
    sessionRole === "SUPERVISOR" &&
    isPureVoiceBot &&
    routingStatus === "PENDING_APPROVAL" &&
    !approved &&
    !rejected &&
    !isResolved;

  // ✅ Department can be edited only by staff, not RESOLVED,
  // and for bot-only tickets it should effectively be Supervisor-only
  const canEditDepartment =
    !isCitizen && canStaffAct && !isResolved && (!isPureVoiceBot || sessionRole === "SUPERVISOR");

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(ticket);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    setDraft(ticket);
    setSaving(false);
    setApproving(false);
  }, [ticket?.id]); // ✅ reset on new ticket

  // ✅ EDIT permission: for bot-only tickets, Supervisor only
  const canEdit = useMemo(
    () =>
      !isCitizen &&
      canStaffAct &&
      !isResolved &&
      (!isPureVoiceBot || sessionRole === "SUPERVISOR"),
    [isCitizen, canStaffAct, isResolved, isPureVoiceBot, sessionRole]
  );

  const updateDraft = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  const DEPARTMENTS = ["Roads", "Waste", "Lighting", "General"];

  const CATEGORIES = [
    "Graffiti",
    "Illegal sign",
    "Litter in a playground, park or trail",
    "Needles",
    "Noise complaint",
    "Parking complaint",
    "Property standards complaint",
    "Pothole",
    "Sidewalk snow clearing",
    "Sidewalk trip hazard",
    "Trail surface maintenance",
    "Other",
  ];

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

      // optimistic UI
      onUpdate?.(ticket.id, patch);

      // await parent (if async)
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
      toast.success("Approved & routed.");
    } catch (e) {
      toast.error(e?.message || "Approve failed.");
    } finally {
      setApproving(false);
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
              onChange={(v) => updateDraft("category", v)}
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
                  onChange={(v) => updateDraft("assignedDepartment", v)}
                  options={DEPARTMENTS}
                  placeholder="-- Select --"
                  disabled={!isEditing || !canEditDepartment || saving || approving}
                />

                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Department can be edited in <b>Edit</b> mode (except RESOLVED).
                  {isPureVoiceBot && sessionRole !== "SUPERVISOR" ? (
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
                    Approved — routed to {ticket.assignedDepartment || "department"}.
                  </div>
                )}

                {rejected && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                    Rejected — no routing action will be taken.
                  </div>
                )}

                {sessionRole !== "SUPERVISOR" && !approved && !rejected && !isResolved && (
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
