// src/components/TicketForm.jsx
import { useEffect, useMemo, useState } from "react";
import StatusBadge from "./StatusBadge";
import { useToast } from "./Toast";

// ✅ routing helper (same rules as voice-bot handoff)
import { SUPERVISOR } from "../data/operators";
import { decideHandoffTarget } from "../utils/routing";

function readSession() {
  return {
    userName: localStorage.getItem("userName") || "Unknown",
    userRole: (localStorage.getItem("userRole") || "OPERATOR").toUpperCase(),
  };
}

// ✅ Department inference for MANUAL tickets
function inferDepartmentFromCategory(category = "") {
  const c = String(category || "").toLowerCase();

  // match your current prototype rules
  if (c.includes("pothole") || c.includes("road")) return "Roads";
  if (c.includes("waste") || c.includes("garbage") || c.includes("pickup")) return "Waste";
  if (c.includes("streetlight") || c.includes("lighting") || c.includes("light")) return "Lighting";

  // example: parking complaint -> General (you can change later)
  if (c.includes("parking")) return "General";

  return "General";
}

export default function TicketForm({
  form,
  setForm,
  onSubmit,

  // ✅ NEW (from IntakePage)
  draftTicketNumber,
  onConsumeDraftNumber, // kept for compatibility, but NOT called here (avoid double increment)
}) {
  const { toast } = useToast();

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // ✅ session info (set by LoginPage)
  const [userName, setUserName] = useState("Unknown");
  const [userRole, setUserRole] = useState("OPERATOR");

  // ✅ OPTIONAL: Manual escalation controls (operators can request supervisor)
  const [requestSupervisor, setRequestSupervisor] = useState(false);

  // ✅ prevent overwriting department after user manually sets it
  const [deptManuallySet, setDeptManuallySet] = useState(false);

  const DEPARTMENTS = ["Roads", "Waste", "Lighting", "General"];

  useEffect(() => {
    const s = readSession();
    setUserName(s.userName);
    setUserRole(s.userRole);

    const onSessionChanged = () => {
      const next = readSession();
      setUserName(next.userName);
      setUserRole(next.userRole);
    };

    window.addEventListener("session-changed", onSessionChanged);
    return () => window.removeEventListener("session-changed", onSessionChanged);
  }, []);

  // If supervisor is logged in, escalation toggle is irrelevant
  useEffect(() => {
    if (String(userRole).toUpperCase() === "SUPERVISOR") {
      setRequestSupervisor(false);
    }
  }, [userRole]);

  // Keep channel aligned with role (nice UX consistency)
  useEffect(() => {
    const roleUpper = String(userRole || "").toUpperCase();
    setForm((prev) => ({
      ...prev,
      channel:
        roleUpper === "SUPERVISOR"
          ? "phone (supervisor manual intake)"
          : "phone (human operator)",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  const resetForm = () => {
    setRequestSupervisor(false);
    setDeptManuallySet(false);

    setForm((prev) => ({
      ...prev,
      name: "",
      phone: "",
      location: "",
      category: "",
      assignedDepartment: "", // ✅ clear department too
      description: "",
      priority: "MEDIUM",
      status: "NEW",
      confidence: "MEDIUM", // kept silently (UI hides for manual lane)
      channel:
        String(userRole || "").toUpperCase() === "SUPERVISOR"
          ? "phone (supervisor manual intake)"
          : "phone (human operator)",

      tone: "UNKNOWN",
      toneConfidence: "OPERATOR",
      toneSource: "HUMAN",
    }));
  };

  const ticketDraft = useMemo(() => {
    return {
      category: form.category,
      priority: form.priority,
      tone: form.tone,
      toneLabel: form.tone,
    };
  }, [form.category, form.priority, form.tone]);

  const handleSubmit = () => {
    if (!form.description || !form.category) {
      toast.warning("Please ensure at least Category + Description are filled.");
      return;
    }

    const roleUpper = String(userRole || "").toUpperCase();

    // ✅ Manual lane is ALWAYS human-created (no dropdown)
    const createdByType = "OPERATOR";
    const createdByName = userName;
    const createdByRole = roleUpper;

    // ✅ Default handler is ALWAYS the logged-in staff member (no operator dropdown)
    let handledByType = "OPERATOR";
    let handledByRole = roleUpper;
    let handledByName = userName;

    let escalatedToRole = null;
    let escalatedToName = null;
    let escalationReason = null;

    const supervisorName = SUPERVISOR?.name || "Nagavalli";

    // Operators may request supervisor; supervisors already handle it themselves
    const decision = decideHandoffTarget({
      ticketDraft,
      requestSupervisor: roleUpper === "OPERATOR" ? !!requestSupervisor : false,
      supervisorName,
      operatorName: handledByName,
    });

    if (decision?.handledByRole === "SUPERVISOR") {
      handledByRole = "SUPERVISOR";
      handledByName = decision.handledByName || supervisorName;

      escalatedToRole = decision.escalation?.escalatedToRole || "SUPERVISOR";
      escalatedToName = decision.escalation?.escalatedToName || handledByName;
      escalationReason = decision.escalation?.escalationReason || "Escalated";
    }

    const enhancedForm = {
      ...form,

      // ✅ RESERVED ticket number (shown at top of form)
      ticketNumber: draftTicketNumber,

      createdByType,
      createdByName,
      createdByRole,

      handledByType,
      handledByRole,
      handledByName,

      escalatedToRole,
      escalatedToName,
      escalationReason,

      channel:
        handledByRole === "SUPERVISOR"
          ? "phone (human operator → supervisor)"
          : roleUpper === "SUPERVISOR"
          ? "phone (supervisor manual intake)"
          : "phone (human operator)",

      // manual lane has no bot evidence
      recordingUrl: null,
      transcript: null,

      // ✅ ensure HUMAN tickets always get a department (auto if blank)
      assignedDepartment:
        form.assignedDepartment || inferDepartmentFromCategory(form.category),
    };

    onSubmit?.(enhancedForm);
  };

  const roleUpper = String(userRole || "").toUpperCase();
  const isSupervisor = roleUpper === "SUPERVISOR";

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        Manual Ticket Intake ({isSupervisor ? "Supervisor" : "Operator"})
      </h3>

      {/* ✅ Draft Ticket number shown at top */}
      <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
        Draft Ticket #: <b>{draftTicketNumber || "-"}</b>
      </div>

      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
        Manual intake is always created and handled by the logged-in staff member.
      </p>

      <p style={{ fontSize: 12, color: "#6b7280", marginTop: -2 }}>
        Logged in as: <b>{userName}</b> ({roleUpper})
      </p>

      <div className="row grid2">
        <div>
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Citizen name (optional)"
          />
        </div>
        <div>
          <label>Phone</label>
          <input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="Citizen phone"
          />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Location</label>
        <input
          value={form.location}
          onChange={(e) => update("location", e.target.value)}
          placeholder="Address / intersection / landmark"
        />
      </div>

      <div className="row grid2" style={{ marginTop: 10 }}>
        <div>
          <label>Category</label>
          <select
            value={form.category}
            onChange={(e) => {
              const nextCategory = e.target.value;
              update("category", nextCategory);

              // ✅ auto-populate department unless user manually set it
              if (!deptManuallySet) {
                update("assignedDepartment", inferDepartmentFromCategory(nextCategory));
              }
            }}
          >
            <option value="">-- Select --</option>
            <option>Road - Pothole</option>
            <option>Waste - Missed Pickup</option>
            <option>Streetlight</option>
            <option>Noise</option>
            <option>Water Leak</option>
            <option>Parking complaint</option>
          </select>
        </div>

        <div>
          <label>Priority</label>
          <select value={form.priority} onChange={(e) => update("priority", e.target.value)}>
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
            <option>URGENT</option>
          </select>
        </div>
      </div>

      {/* ✅ Department dropdown (manual lane) */}
      <div style={{ marginTop: 10 }}>
        <label>Department</label>
        <select
          value={form.assignedDepartment || ""}
          onChange={(e) => {
            setDeptManuallySet(true);
            update("assignedDepartment", e.target.value);
          }}
        >
          <option value="">-- Select --</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          Auto-filled from category for human tickets. You can override if needed.
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Description</label>
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Describe the issue as reported by the citizen"
        />
      </div>

      {/* ✅ Escalation (manual lane) */}
      {!isSupervisor && (
        <div style={{ marginTop: 12, background: "#f9fafb", padding: 10, borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            Escalation (Manual Lane)
          </div>

          <label style={{ display: "block", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={requestSupervisor}
              onChange={(e) => setRequestSupervisor(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Request Supervisor ({SUPERVISOR?.name || "Nagavalli"})
          </label>

          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
            Current handler: <b>{userName}</b>
          </div>
        </div>
      )}

      <div className="row grid2" style={{ marginTop: 10 }}>
        <div>
          <label>Channel</label>
          <input value={form.channel} readOnly />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label>Status</label>
            <div style={{ marginTop: 6 }}>
              <StatusBadge value={form.status} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Caller Tone (Operator Observed)</label>
        <select
          value={form.tone || "UNKNOWN"}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              tone: e.target.value,
              toneSource: "HUMAN",
              toneConfidence: "OPERATOR",
            }))
          }
        >
          <option value="UNKNOWN">😐 Unknown</option>
          <option value="CALM">🙂 Calm</option>
          <option value="AGITATED">😟 Agitated</option>
          <option value="ANGRY">😡 Angry</option>
          <option value="THREAT">⚠️ Threat</option>
          <option value="ABUSIVE">🚫 Abusive</option>
        </select>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={handleSubmit} type="button">
          Create Ticket (Manual)
        </button>

        <button className="btn" onClick={resetForm} type="button">
          Reset Form
        </button>
      </div>
    </div>
  );
}
