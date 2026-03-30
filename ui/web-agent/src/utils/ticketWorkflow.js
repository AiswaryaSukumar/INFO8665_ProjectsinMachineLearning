// src/utils/ticketWorkflow.js

/**
 * Canonical frontend workflow helpers for INSIGHT-311.
 *
 * Canonical active/terminal statuses used in the UI:
 * - NEW
 * - NEEDS_REVIEW
 * - APPROVED
 * - REJECTED
 * - RESOLVED
 * - DELETE
 *
 * Business rule:
 * - created by Voice Bot + handled by Voice Bot => NEEDS_REVIEW
 * - created by Voice Bot + handled by human => NEW
 * - created by human => NEW unless explicitly terminal/approved/etc.
 *
 * IMPORTANT:
 * - No frontend reliance on IN_PROGRESS
 * - REJECTED / RESOLVED / DELETE are terminal
 */

export const TICKET_STATUSES = {
  NEW: "NEW",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RESOLVED: "RESOLVED",
  DELETE: "DELETE",
};

export const TERMINAL_STATUSES = new Set([
  TICKET_STATUSES.REJECTED,
  TICKET_STATUSES.RESOLVED,
  TICKET_STATUSES.DELETE,
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

export function isDeletedTicket(ticket = {}) {
  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );
  return !!ticket?.isDeleted || rawStatus === TICKET_STATUSES.DELETE;
}

export function isVoiceBotTicket(ticket = {}) {
  const createdByType = normalizeWorkflowValue(
    ticket.created_by_type ?? ticket.createdByType
  );
  const channel = normalizeChannelValue(ticket.channel);
  const createdByName = String(ticket.createdByName || "").toLowerCase();

  return (
    createdByType === "VOICE_BOT" ||
    channel === "PHONE" && createdByName.includes("voicebot")
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
  const createdByName = String(ticket.createdByName || "").toLowerCase();

  const createdLooksBot =
    createdByType === "VOICE_BOT" || createdByName.includes("voicebot");

  return (
    createdLooksBot &&
    handledByType === "VOICE_BOT" &&
    handledByRole === "VOICE_BOT"
  );
}

export function isPendingSupervisorDecision(ticket = {}) {
  const routingStatus = normalizeWorkflowValue(
    ticket.routing_status ?? ticket.routingStatus
  );
  const workflowStage = normalizeWorkflowValue(
    ticket.workflow_stage ?? ticket.workflowStage
  );

  return (
    workflowStage === "PENDING_APPROVAL" ||
    workflowStage === "PENDING_SUPERVISOR_APPROVAL" ||
    routingStatus === "PENDING_APPROVAL"
  );
}

export function normalizeTicketStatus(ticketOrStatus) {
  if (typeof ticketOrStatus === "string") {
    const raw = normalizeWorkflowValue(ticketOrStatus);

    if (raw === TICKET_STATUSES.DELETE) return TICKET_STATUSES.DELETE;
    if (raw === TICKET_STATUSES.RESOLVED) return TICKET_STATUSES.RESOLVED;
    if (raw === TICKET_STATUSES.REJECTED) return TICKET_STATUSES.REJECTED;
    if (raw === TICKET_STATUSES.APPROVED) return TICKET_STATUSES.APPROVED;
    if (raw === TICKET_STATUSES.NEEDS_REVIEW) return TICKET_STATUSES.NEEDS_REVIEW;
    return TICKET_STATUSES.NEW;
  }

  const ticket = ticketOrStatus ?? {};

  const rawStatus = normalizeWorkflowValue(
    ticket.ticket_status ?? ticket.ticketStatus ?? ticket.status
  );

  // Preserve terminal/explicit states first
  if (isDeletedTicket(ticket) || rawStatus === TICKET_STATUSES.DELETE) {
    return TICKET_STATUSES.DELETE;
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

  // Pure bot-only tickets stay in NEEDS_REVIEW only while pending
  if (isPureVoiceBotTicket(ticket) && isPendingSupervisorDecision(ticket)) {
    return TICKET_STATUSES.NEEDS_REVIEW;
  }

  // Explicit NEW remains NEW
  if (rawStatus === TICKET_STATUSES.NEW) {
    return TICKET_STATUSES.NEW;
  }

  // If backend still sends NEEDS_REVIEW for non-pure-bot tickets,
  // normalize that back to NEW for frontend consistency
  if (rawStatus === TICKET_STATUSES.NEEDS_REVIEW) {
    return isPureVoiceBotTicket(ticket)
      ? TICKET_STATUSES.NEEDS_REVIEW
      : TICKET_STATUSES.NEW;
  }

  // Fallback:
  // anything non-terminal and non-approved becomes NEW
  return TICKET_STATUSES.NEW;
}

export function isTerminalStatus(ticketOrStatus) {
  return TERMINAL_STATUSES.has(normalizeTicketStatus(ticketOrStatus));
}

export function canApproveTicket(ticket = {}) {
  return (
    isPureVoiceBotTicket(ticket) &&
    isPendingSupervisorDecision(ticket) &&
    normalizeTicketStatus(ticket) === TICKET_STATUSES.NEEDS_REVIEW &&
    !isTerminalStatus(ticket)
  );
}

export function canRejectTicket(ticket = {}) {
  return (
    isPureVoiceBotTicket(ticket) &&
    isPendingSupervisorDecision(ticket) &&
    normalizeTicketStatus(ticket) === TICKET_STATUSES.NEEDS_REVIEW &&
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
    resolve: canResolveTicket(ticket),
    delete: canDeleteTicket(ticket),
    terminal: isTerminalStatus(ticket),
  };
}

export function getWorkflowBadgeLabel(ticket = {}) {
  return normalizeTicketStatus(ticket);
}