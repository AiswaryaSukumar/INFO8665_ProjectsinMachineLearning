import { useEffect, useMemo, useState } from "react";
import { inferDepartmentFromCategory } from "../utils/categoryRouting";

function buildCaptcha() {
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  return { a, b, answer: String(a + b) };
}

function normalizeFormShape(raw = {}, isCitizen = false, initialCategory = "") {
  return {
    name: raw.name ?? raw.fullName ?? "",
    fullName: raw.fullName ?? raw.name ?? "",
    phone: raw.phone ?? "",
    email: raw.email ?? "",
    category: raw.category ?? initialCategory ?? "",
    assignedDepartment: raw.assignedDepartment ?? raw.department ?? "",
    location: raw.location ?? "",
    description: raw.description ?? "",

    priority: raw.priority ?? "MEDIUM",
    escalation: raw.escalation ?? "NO",
    callerTone: raw.callerTone ?? raw.tone ?? "NEUTRAL",
    tone: raw.tone ?? raw.callerTone ?? "NEUTRAL",
    toneConfidence: raw.toneConfidence ?? "LOW",
    toneSource: raw.toneSource ?? "HUMAN",
    status: raw.status ?? "NEW",
    confidence: raw.confidence ?? "MEDIUM",
    channel: raw.channel ?? (isCitizen ? "WEB" : "PHONE"),
  };
}

/**
 * Unified TicketForm
 * - Supports controlled parent form via form/setForm
 * - Aligns tone values to ToneBadge
 * - Aligns channel values to canonical workflow/API values
 * - Keeps citizen/operator public fields consistent
 */
export default function TicketForm({
  variant = "operator",
  userName,
  isSupervisor,
  initialCategory,
  onSubmit,
  onCancel,
  submitLabel,
  className = "",

  // controlled form support from IntakePage
  form: externalForm,
  setForm: externalSetForm,
  draftTicketNumber,
  onConsumeDraftNumber,
}) {
  const isCitizen = variant === "citizen";

  const [internalForm, setInternalForm] = useState(() =>
    normalizeFormShape({}, isCitizen, initialCategory)
  );

  const form = externalForm
    ? normalizeFormShape(externalForm, isCitizen, initialCategory)
    : internalForm;

  const setForm = (updater) => {
    if (typeof updater !== "function") return;

    if (externalSetForm) {
      externalSetForm((prev) => {
        const normalizedPrev = normalizeFormShape(prev, isCitizen, initialCategory);
        const next = updater(normalizedPrev);
        return normalizeFormShape(next, isCitizen, initialCategory);
      });
      return;
    }

    setInternalForm((prev) => {
      const normalizedPrev = normalizeFormShape(prev, isCitizen, initialCategory);
      const next = updater(normalizedPrev);
      return normalizeFormShape(next, isCitizen, initialCategory);
    });
  };

  const [captcha, setCaptcha] = useState(() => buildCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  useEffect(() => {
    if (!initialCategory) return;
    setForm((prev) => ({
      ...prev,
      category: prev.category || initialCategory,
    }));
  }, [initialCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const dept = inferDepartmentFromCategory(form.category);
    if (!dept && form.assignedDepartment) return;

    setForm((prev) => ({
      ...prev,
      assignedDepartment: dept || prev.assignedDepartment || "General",
    }));
  }, [form.category]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isCitizen) return;

    setForm((prev) => ({
      ...prev,
      priority: prev.priority || "MEDIUM",
      escalation: prev.escalation || "NO",
      callerTone: prev.callerTone || prev.tone || "NEUTRAL",
      tone: prev.tone || prev.callerTone || "NEUTRAL",
      channel: "WEB",
      status: prev.status || "NEW",
      confidence: prev.confidence || "MEDIUM",
      toneConfidence: prev.toneConfidence || "LOW",
      toneSource: prev.toneSource || "HUMAN",
    }));
  }, [isCitizen]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(
    () => [
      "Pothole",
      "Graffiti",
      "Parking",
      "Snow clearing",
      "Sidewalk trip hazard",
      "Litter",
      "Needles",
      "Trail surface maintenance",
      "Other",
    ],
    []
  );

  const internal = useMemo(
    () => ({
      priority: [
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" },
        { value: "CRITICAL", label: "Critical" },
      ],
      escalation: [
        { value: "NO", label: "No" },
        { value: "YES", label: "Yes" },
      ],
      callerTone: [
        { value: "UNKNOWN", label: "Unknown" },
        { value: "CALM", label: "Calm" },
        { value: "NEUTRAL", label: "Neutral" },
        { value: "AGITATED", label: "Agitated" },
        { value: "ANGRY", label: "Angry" },
        { value: "THREAT", label: "Threat" },
        { value: "ABUSIVE", label: "Abusive" },
      ],
      channel: [
        { value: "WEB", label: "Web form" },
        { value: "PHONE", label: "Phone" },
        { value: "EMAIL", label: "Email" },
        { value: "IN_PERSON", label: "In-person" },
      ],
    }),
    []
  );

  const canSubmit = useMemo(() => {
    const baseOk =
      String(form.name || form.fullName || "").trim() &&
      String(form.phone || "").trim() &&
      String(form.category || "").trim() &&
      String(form.location || "").trim() &&
      String(form.description || "").trim();

    if (!baseOk) return false;
    if (!isCitizen) return true;

    return captchaAnswer.trim() && captchaAnswer.trim() === captcha.answer;
  }, [form, isCitizen, captchaAnswer, captcha.answer]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const resolvedDepartment =
      inferDepartmentFromCategory(form.category) ||
      form.assignedDepartment ||
      "General";

    const resolvedName = form.name || form.fullName || "";

    const payload = {
      ...form,

      // keep both naming styles for current mixed pages
      name: resolvedName,
      fullName: resolvedName,

      assignedDepartment: resolvedDepartment,
      department: resolvedDepartment,

      // tone alignment
      tone: form.tone || form.callerTone || "UNKNOWN",
      callerTone: form.callerTone || form.tone || "UNKNOWN",
      toneConfidence: form.toneConfidence || "LOW",
      toneSource: form.toneSource || "HUMAN",

      // canonical channel value
      channel: form.channel || (isCitizen ? "WEB" : "PHONE"),

      // helpful provenance
      createdByType: isCitizen ? "CITIZEN" : "OPERATOR",
      createdByName: isCitizen ? resolvedName : userName || "Operator",
      createdByRole: isCitizen
        ? "Citizen"
        : isSupervisor
        ? "Supervisor"
        : "Operator",
    };

    onSubmit?.(payload);

    if (isCitizen) {
      setCaptcha(buildCaptcha());
      setCaptchaAnswer("");
    }

    onConsumeDraftNumber?.();
  };

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "name" || key === "fullName") {
        next.name = value;
        next.fullName = value;
      }

      if (key === "callerTone" || key === "tone") {
        next.callerTone = value;
        next.tone = value;
      }

      return next;
    });
  };

  return (
    <form className={`ticketForm ${className}`} onSubmit={handleSubmit}>
      <div className="tfGrid">
        {draftTicketNumber ? (
          <div className="tfField tfSpan2">
            <label>Draft ticket number</label>
            <input value={draftTicketNumber} readOnly />
          </div>
        ) : null}

        <div className="tfField">
          <label>Full name *</label>
          <input
            value={form.name || form.fullName || ""}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder={isCitizen ? "e.g., Sabrina George" : "Caller full name"}
          />
        </div>

        <div className="tfField">
          <label>Phone number *</label>
          <input
            value={form.phone || ""}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="e.g., (647) 555-0111"
          />
        </div>

        <div className="tfField tfSpan2">
          <label>Email (optional)</label>
          <input
            value={form.email || ""}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="e.g., name@email.com"
          />
        </div>

        <div className="tfField">
          <label>Category *</label>
          <select
            value={form.category || ""}
            onChange={(e) => updateField("category", e.target.value)}
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="tfField">
          <label>Department (auto)</label>
          <input value={form.assignedDepartment || ""} readOnly />
        </div>

        <div className="tfField tfSpan2">
          <label>Location *</label>
          <input
            value={form.location || ""}
            onChange={(e) => updateField("location", e.target.value)}
            placeholder={
              isCitizen
                ? 'e.g., "123 University Ave near Phillip St intersection"'
                : "Closest street address or intersection"
            }
          />
        </div>

        <div className="tfField tfSpan2">
          <label>Description *</label>
          <textarea
            rows={5}
            value={form.description || ""}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Describe the issue, landmarks, urgency, and any safety concerns."
          />
        </div>

        {!isCitizen && (
          <>
            <div className="tfDivider tfSpan2">Internal details (operator only)</div>

            <div className="tfField">
              <label>Priority</label>
              <select
                value={form.priority || "MEDIUM"}
                onChange={(e) => updateField("priority", e.target.value)}
              >
                {internal.priority.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="tfField">
              <label>Escalation</label>
              <select
                value={form.escalation || "NO"}
                onChange={(e) => updateField("escalation", e.target.value)}
              >
                {internal.escalation.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="tfField">
              <label>Caller tone</label>
              <select
                value={form.callerTone || form.tone || "NEUTRAL"}
                onChange={(e) => updateField("callerTone", e.target.value)}
              >
                {internal.callerTone.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="tfField">
              <label>Channel</label>
              <select
                value={form.channel || "PHONE"}
                onChange={(e) => updateField("channel", e.target.value)}
              >
                {internal.channel.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {isCitizen && (
          <div className="tfCaptcha tfSpan2">
            <div className="tfCaptchaLeft">
              <div className="tfCaptchaTitle">Security Check</div>
              <div className="tfCaptchaQ">
                What is {captcha.a} + {captcha.b}?
              </div>
            </div>
            <div className="tfCaptchaRight">
              <input
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="Answer"
              />
              <button
                type="button"
                className="btn mid"
                onClick={() => {
                  setCaptcha(buildCaptcha());
                  setCaptchaAnswer("");
                }}
              >
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="tfActions">
        <button className="btn primary" type="submit" disabled={!canSubmit}>
          {submitLabel || (isCitizen ? "Submit Request" : "Create Ticket")}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}