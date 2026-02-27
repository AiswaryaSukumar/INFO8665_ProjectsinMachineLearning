import { useEffect, useMemo, useState } from "react";

import { inferDepartmentFromCategory } from "../utils/categoryRouting";

function buildCaptcha() {
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  return { a, b, answer: String(a + b) };
}

/**
 * Unified TicketForm
 * - variant="citizen": public fields + captcha (internal fields auto-filled)
 * - variant="operator": same public fields + internal fields
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
}) {
  const isCitizen = variant === "citizen";

  const [form, setForm] = useState(() => ({
    fullName: "",
    phone: "",
    email: "",
    category: initialCategory || "",
    assignedDepartment: "",
    location: "",
    description: "",

    // internal (operator-only UI; citizen auto-filled)
    priority: "Medium",
    escalation: "No",
    callerTone: "Neutral",
    channel: isCitizen ? "Web" : "Phone",
  }));

  // Captcha for citizen requests
  const [captcha, setCaptcha] = useState(() => buildCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  // Auto-derive department from category
  useEffect(() => {
    const dept = inferDepartmentFromCategory(form.category);
    setForm((prev) => ({
      ...prev,
      assignedDepartment: dept || prev.assignedDepartment || "General",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category]);

  // Citizen defaults (ensure internal fields exist, even if hidden)
  useEffect(() => {
    if (!isCitizen) return;
    setForm((prev) => ({
      ...prev,
      priority: prev.priority || "Medium",
      escalation: prev.escalation || "No",
      callerTone: prev.callerTone || "Neutral",
      channel: "Web",
    }));
  }, [isCitizen]);

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
      priority: ["Low", "Medium", "High", "Critical"],
      escalation: ["No", "Yes"],
      callerTone: ["Calm", "Neutral", "Upset", "Angry"],
      channel: ["Web", "Phone", "Email", "In-person"],
    }),
    []
  );

  const canSubmit = useMemo(() => {
    const baseOk =
      form.fullName.trim() &&
      form.phone.trim() &&
      form.category.trim() &&
      form.location.trim() &&
      form.description.trim();

    if (!baseOk) return false;

    if (!isCitizen) return true;

    return captchaAnswer.trim() && captchaAnswer.trim() === captcha.answer;
  }, [form, isCitizen, captchaAnswer, captcha.answer]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!canSubmit) return;

    const payload = {
      ...form,
      assignedDepartment:
        inferDepartmentFromCategory(form.category) ||
        form.assignedDepartment ||
        "General",

      // Helpful provenance fields
      createdByType: isCitizen ? "CITIZEN" : "OPERATOR",
      createdByName: isCitizen ? form.fullName : userName || "Operator",
      createdByRole: isCitizen
        ? "Citizen"
        : isSupervisor
        ? "Supervisor"
        : "Operator",
    };

    onSubmit?.(payload);

    // Reset citizen captcha for next submission
    if (isCitizen) {
      setCaptcha(buildCaptcha());
      setCaptchaAnswer("");
    }
  };

  return (
    <form className={`ticketForm ${className}`} onSubmit={handleSubmit}>
      <div className="tfGrid">
        <div className="tfField">
          <label>Full name *</label>
          <input
            value={form.fullName}
            onChange={(e) =>
              setForm((p) => ({ ...p, fullName: e.target.value }))
            }
            placeholder={isCitizen ? "e.g., Sabrina George" : "Caller full name"}
          />
        </div>

        <div className="tfField">
          <label>Phone number *</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="e.g., (647) 555-0111"
          />
        </div>

        <div className="tfField tfSpan2">
          <label>Email (optional)</label>
          <input
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="e.g., name@email.com"
          />
        </div>

        <div className="tfField">
          <label>Category *</label>
          <select
            value={form.category}
            onChange={(e) =>
              setForm((p) => ({ ...p, category: e.target.value }))
            }
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
          <input value={form.assignedDepartment} readOnly />
        </div>

        <div className="tfField tfSpan2">
          <label>Location *</label>
          <input
            value={form.location}
            onChange={(e) =>
              setForm((p) => ({ ...p, location: e.target.value }))
            }
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
            value={form.description}
            onChange={(e) =>
              setForm((p) => ({ ...p, description: e.target.value }))
            }
            placeholder="Describe the issue, landmarks, urgency, and any safety concerns."
          />
        </div>

        {/* Operator-only internal fields */}
        {!isCitizen && (
          <>
            <div className="tfDivider tfSpan2">
              Internal details (operator only)
            </div>

            <div className="tfField">
              <label>Priority</label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm((p) => ({ ...p, priority: e.target.value }))
                }
              >
                {internal.priority.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="tfField">
              <label>Escalation</label>
              <select
                value={form.escalation}
                onChange={(e) =>
                  setForm((p) => ({ ...p, escalation: e.target.value }))
                }
              >
                {internal.escalation.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="tfField">
              <label>Caller tone</label>
              <select
                value={form.callerTone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, callerTone: e.target.value }))
                }
              >
                {internal.callerTone.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="tfField">
              <label>Channel</label>
              <select
                value={form.channel}
                onChange={(e) =>
                  setForm((p) => ({ ...p, channel: e.target.value }))
                }
              >
                {internal.channel.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Citizen security check */}
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
