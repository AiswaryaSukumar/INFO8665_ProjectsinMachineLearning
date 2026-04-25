// src/utils/ticketWorkflow.js

/**
 * Canonical frontend workflow helpers for INSIGHT-311.
 *
 * Canonical statuses used in the UI:
 * - NEW
 * - NEEDS_REVIEW
 * - SUBMITTED          (backend stt_oct_NLU — normalizes to NEW/NEEDS_REVIEW based on confidence)
 * - APPROVED
 * - REJECTED
 * - RESOLVED           (stt_oct_NLU — terminal)
 * - DELETE             (stt_oct_NLU — terminal, backend key)
 * - DELETED            (Integration alias — maps to DELETE)
 * - ESCALATED          (Integration — terminal)
 *
 * Business rules:
 * - REJECTED / RESOLVED / DELETE / DELETED / ESCALATED are terminal
 * - Active ticket confidence: LOW → NEEDS_REVIEW, MEDIUM/HIGH → NEW
 * - Pure Voice Bot tickets (bot-created & bot-handled) default to NEEDS_REVIEW
 */

export const TICKET_STATUSES = {
  NEW: "NEW",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RESOLVED: "RESOLVED",
  DELETE: "DELETE",
  DELETED: "DELETED",
  ESCALATED: "ESCALATED",
};

export const TERMINAL_STATUSES = new Set([
  TICKET_STATUSES.REJECTED,
  TICKET_STATUSES.RESOLVED,
  TICKET_STATUSES.DELETE,
  TICKET_STATUSES.DELETED,
  TICKET_STATUSES.ESCALATED,
]);

export function normalizeWorkflowValue(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function normalizeChannelValue(value) {
  const raw = normalizeWorkflowValue(value);

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

export function isRejectedTicket(ticket = {}) {
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  const routingStatus = normalizeWorkflowValue(
    ticket.routing_status ?? ticket.routingStatus
  );
  const workflowStage = normalizeWorkflowValue(
    ticket.workflow_stage ?? ticket.workflowStage
  );

  return (
    rawStatus === TICKET_STATUSES.REJECTED ||
    routingStatus === "REJECTED" ||
    workflowStage === "REJECTED" ||
    workflowStage === "REJECTED_BY_SUPERVISOR" ||
    workflowStage.includes("REJECTED")
  );
}

export function isApprovedTicket(ticket = {}) {
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  const routingStatus = normalizeWorkflowValue(
    ticket.routing_status ?? ticket.routingStatus
  );
  const workflowStage = normalizeWorkflowValue(
    ticket.workflow_stage ?? ticket.workflowStage
  );

  return (
    rawStatus === TICKET_STATUSES.APPROVED ||
    routingStatus === "APPROVED" ||
    workflowStage === "APPROVED_BY_SUPERVISOR" ||
    workflowStage === "ROUTED_TO_DEPARTMENT"
  );
}

export function isResolvedTicket(ticket = {}) {
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  const workflowStage = normalizeWorkflowValue(
    ticket.workflow_stage ?? ticket.workflowStage
  );

  return (
    rawStatus === TICKET_STATUSES.RESOLVED ||
    workflowStage === "COMPLETED"
  );
}

export function isEscalatedTicket(ticket = {}) {
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  const workflowStage = normalizeWorkflowValue(
    ticket.workflow_stage ?? ticket.workflowStage
  );

  return (
    rawStatus === TICKET_STATUSES.ESCALATED ||
    workflowStage === "ESCALATED"
  );
}

export function isDeletedTicket(ticket = {}) {
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  return (
    !!ticket?.isDeleted ||
    rawStatus === TICKET_STATUSES.DELETE ||
    rawStatus === TICKET_STATUSES.DELETED
  );
}

export function isVoiceBotTicket(ticket = {}) {
  const createdByType = normalizeWorkflowValue(
    ticket.created_by_type ?? ticket.createdByType
  );
  const channel = normalizeChannelValue(ticket.channel);
  const createdByName = String(ticket.createdByName || "").toLowerCase();

  return (
    createdByType === "VOICE_BOT" ||
    (channel === "PHONE" && createdByName.includes("voicebot"))
  );
}

export function isPureVoiceBotTicket(ticket = {}) {
  const createdByType = normalizeWorkflowValue(
    ticket.created_by_type ?? ticket.createdByType
  );
  const handledByType = normalizeWorkflowValue(
    ticket.handled_by_type ?? ticket.handledByType
  );
  const handledByRole = normalizeWorkflowValue(
    ticket.handled_by_role ?? ticket.handledByRole
  );
  const workflowStage = normalizeWorkflowValue(
    ticket.workflow_stage ?? ticket.workflowStage
  );
  const routingStatus = normalizeWorkflowValue(
    ticket.routing_status ?? ticket.routingStatus
  );
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  const createdByName = String(ticket.createdByName || "").toLowerCase();

  const createdLooksBot =
    createdByType === "VOICE_BOT" || createdByName.includes("voicebot");

  const strict =
    createdLooksBot &&
    handledByType === "VOICE_BOT" &&
    handledByRole === "VOICE_BOT";

  // Migration-safe fallback when handledBy* fields are not yet persisted
  const inferred =
    createdLooksBot &&
    (workflowStage === "PENDING_APPROVAL" ||
      workflowStage === "PENDING_SUPERVISOR_APPROVAL" ||
      routingStatus === "PENDING_APPROVAL" ||
      rawStatus === TICKET_STATUSES.NEEDS_REVIEW ||
      rawStatus === TICKET_STATUSES.SUBMITTED);

  return strict || inferred;
}

// Safe version: treats SUBMITTED tickets with low/no confidence as pure bot tickets
export function isPureVoiceBotTicketSafe(ticket = {}) {
  const confidence = normalizeWorkflowValue(ticket.confidence);
  if (isPureVoiceBotTicket(ticket)) return true;
  // SUBMITTED with no explicit confidence → treat as needs-review bot ticket
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  return rawStatus === TICKET_STATUSES.SUBMITTED && (!confidence || confidence === "LOW");
}

export function isPendingSupervisorDecision(ticket = {}) {
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  const routingStatus = normalizeWorkflowValue(
    ticket.routing_status ?? ticket.routingStatus
  );
  const workflowStage = normalizeWorkflowValue(
    ticket.workflow_stage ?? ticket.workflowStage
  );

  return (
    rawStatus === TICKET_STATUSES.NEEDS_REVIEW ||
    rawStatus === TICKET_STATUSES.SUBMITTED ||
    workflowStage === "PENDING_APPROVAL" ||
    workflowStage === "PENDING_SUPERVISOR_APPROVAL" ||
    routingStatus === "PENDING_APPROVAL"
  );
}

export function normalizeTicketStatus(ticketOrStatus) {
  if (typeof ticketOrStatus === "string") {
    const raw = normalizeWorkflowValue(ticketOrStatus);

    if (raw === TICKET_STATUSES.DELETE || raw === TICKET_STATUSES.DELETED) return TICKET_STATUSES.DELETE;
    if (raw === TICKET_STATUSES.ESCALATED) return TICKET_STATUSES.ESCALATED;
    if (raw === TICKET_STATUSES.RESOLVED) return TICKET_STATUSES.RESOLVED;
    if (raw === TICKET_STATUSES.REJECTED) return TICKET_STATUSES.REJECTED;
    if (raw === TICKET_STATUSES.APPROVED) return TICKET_STATUSES.APPROVED;
    if (raw === TICKET_STATUSES.NEEDS_REVIEW) return TICKET_STATUSES.NEEDS_REVIEW;
    // SUBMITTED normalizes to NEEDS_REVIEW (awaiting supervisor review)
    if (raw === TICKET_STATUSES.SUBMITTED) return TICKET_STATUSES.NEEDS_REVIEW;
    return TICKET_STATUSES.NEW;
  }

  const ticket = ticketOrStatus ?? {};

  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );

  const confidence = normalizeWorkflowValue(ticket.confidence);

  // Terminal states first — order matters
  if (isDeletedTicket(ticket) || rawStatus === TICKET_STATUSES.DELETE || rawStatus === TICKET_STATUSES.DELETED) {
    return TICKET_STATUSES.DELETE;
  }

  if (isEscalatedTicket(ticket) || rawStatus === TICKET_STATUSES.ESCALATED) {
    return TICKET_STATUSES.ESCALATED;
  }

  if (isResolvedTicket(ticket) || rawStatus === TICKET_STATUSES.RESOLVED) {
    return TICKET_STATUSES.RESOLVED;
  }

  if (isRejectedTicket(ticket) || rawStatus === TICKET_STATUSES.REJECTED) {
    return TICKET_STATUSES.REJECTED;
  }

  if (isApprovedTicket(ticket) || rawStatus === TICKET_STATUSES.APPROVED) {
    return TICKET_STATUSES.APPROVED;
  }

  // Active tickets: explicit NEEDS_REVIEW or SUBMITTED → NEEDS_REVIEW
  if (rawStatus === TICKET_STATUSES.NEEDS_REVIEW || rawStatus === TICKET_STATUSES.SUBMITTED) {
    return TICKET_STATUSES.NEEDS_REVIEW;
  }

  // Confidence-driven: low confidence → needs review
  if (confidence === "LOW") {
    return TICKET_STATUSES.NEEDS_REVIEW;
  }

  // Pure voice bot ticket pending approval → NEEDS_REVIEW
  if (isPureVoiceBotTicket(ticket) && isPendingSupervisorDecision(ticket)) {
    return TICKET_STATUSES.NEEDS_REVIEW;
  }

  return TICKET_STATUSES.NEW;
}

export function normalizeTicketStatusLabel(status) {
  const s = normalizeWorkflowValue(status);
  if (s === TICKET_STATUSES.DELETE || s === TICKET_STATUSES.DELETED) return "DELETED";
  return s || TICKET_STATUSES.NEW;
}

export function isTerminalStatus(ticketOrStatus) {
  return TERMINAL_STATUSES.has(normalizeTicketStatus(ticketOrStatus));
}

export function canApproveTicket(ticket = {}) {
  const status = normalizeTicketStatus(ticket);
  return (
    (status === TICKET_STATUSES.NEW || status === TICKET_STATUSES.NEEDS_REVIEW) &&
    !isTerminalStatus(ticket)
  );
}

export function canRejectTicket(ticket = {}) {
  const status = normalizeTicketStatus(ticket);
  return (
    (status === TICKET_STATUSES.NEEDS_REVIEW || status === TICKET_STATUSES.NEW) &&
    !isTerminalStatus(ticket)
  );
}

export function canEscalateTicket(ticket = {}) {
  const status = normalizeTicketStatus(ticket);
  return (
    (status === TICKET_STATUSES.NEEDS_REVIEW || status === TICKET_STATUSES.NEW) &&
    !isTerminalStatus(ticket)
  );
}

export function canResolveTicket(ticket = {}) {
  const status = normalizeTicketStatus(ticket);
  return status === TICKET_STATUSES.NEW || status === TICKET_STATUSES.APPROVED;
}

export function canDeleteTicket(ticket = {}) {
  return !isTerminalStatus(ticket);
}

export function getAllowedActions(ticket = {}) {
  return {
    approve: canApproveTicket(ticket),
    reject: canRejectTicket(ticket),
    escalate: canEscalateTicket(ticket),
    resolve: canResolveTicket(ticket),
    delete: canDeleteTicket(ticket),
    terminal: isTerminalStatus(ticket),
  };
}

export function getWorkflowBadgeLabel(ticket = {}) {
  return normalizeTicketStatusLabel(normalizeTicketStatus(ticket));
}

// Department status workflow (Integration feature)
export const DEPARTMENT_STATUSES = {
  NOT_STARTED: "NOT_STARTED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  ON_HOLD: "ON_HOLD",
  COMPLETED: "COMPLETED",
};

export function normalizeDepartmentStatus(value) {
  const raw = normalizeWorkflowValue(value);
  if (Object.values(DEPARTMENT_STATUSES).includes(raw)) return raw;
  return raw || DEPARTMENT_STATUSES.NOT_STARTED;
}
