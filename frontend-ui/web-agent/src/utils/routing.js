// src/utils/routing.js

export const HIGH_RISK_CATEGORIES = new Set([
  "SAFETY",
  "FIRE",
  "MEDICAL",
  "POLICE",
  "GAS LEAK",
  "VIOLENCE",
  "HAZARD",
  "EMERGENCY",
]);

export function normalizeCategory(cat) {
  return String(cat || "")
    .trim()
    .toUpperCase();
}

export function isAngryOrThreatTone(ticket) {
  const tone = String(ticket?.toneLabel || ticket?.tone || "").toUpperCase();
  // adapt these to whatever your model outputs
  const angrySet = new Set(["ANGRY", "FRUSTRATED", "THREAT", "ABUSIVE", "HOSTILE"]);
  if (angrySet.has(tone)) return true;

  // if you have a score (optional)
  const score = ticket?.toneScore ?? ticket?.sentimentScore;
  if (typeof score === "number" && score <= -0.6) return true;

  return false;
}

export function isHighRiskCategory(ticket) {
  const cat = normalizeCategory(ticket?.category);
  return HIGH_RISK_CATEGORIES.has(cat);
}

export function isSlaAtRisk(ticket) {
  // Use whatever you have. This is intentionally safe & flexible.
  // Examples:
  // - ticket.priority === "URGENT"
  // - ticket.slaMinutesRemaining <= 15
  const pr = String(ticket?.priority || "").toUpperCase();
  if (pr === "URGENT") return true;

  const mins = ticket?.slaMinutesRemaining;
  if (typeof mins === "number" && mins <= 15) return true;

  return false;
}

/**
 * Decide where a Voice Bot handoff should go.
 * Default: Operator
 * Escalation triggers: requestSupervisor OR highRisk OR angryThreat OR slaRisk
 */
export function decideHandoffTarget({
  ticketDraft,
  requestSupervisor = false,
  supervisorName = "Nagavalli",
  operatorName = null,
}) {
  const highRisk = isHighRiskCategory(ticketDraft);
  const angryThreat = isAngryOrThreatTone(ticketDraft);
  const slaRisk = isSlaAtRisk(ticketDraft);

  const shouldEscalate = requestSupervisor || highRisk || angryThreat || slaRisk;

  if (shouldEscalate) {
    return {
      handledByType: "VOICE_BOT_TO_HUMAN",
      handledByRole: "SUPERVISOR",
      handledByName: supervisorName,
      escalation: {
        escalatedToRole: "SUPERVISOR",
        escalatedToName: supervisorName,
        escalationReason: requestSupervisor
          ? "Citizen requested supervisor"
          : highRisk
          ? "High-risk category"
          : angryThreat
          ? "Angry/threat tone"
          : "SLA at risk",
      },
    };
  }

  // Normal transfer: to operator (Jerry/Tom). If operatorName not passed, keep null and let UI pick later.
  return {
    handledByType: "VOICE_BOT_TO_HUMAN",
    handledByRole: "OPERATOR",
    handledByName: operatorName || "",
    escalation: null,
  };
}
