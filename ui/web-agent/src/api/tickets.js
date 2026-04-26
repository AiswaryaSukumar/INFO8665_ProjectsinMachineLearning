// src/api/tickets.js
import { apiFetch } from "./client";
import {
  normalizeCategory,
  normalizeDepartment,
  inferDepartmentFromCategory,
} from "../utils/categoryRouting";
import {
  normalizeTicketStatus,
  TICKET_STATUSES,
} from "../utils/ticketWorkflow";

/**
 * Backend sentiment/tone -> UI tone adapter
 * UI expects one of:
 * CALM | NEUTRAL | AGITATED | ANGRY | FRUSTRATED | DISTRESSED | THREAT | ABUSIVE | UNKNOWN
 */
function mapSentimentToTone(value = "NEUTRAL") {
  const raw = String(value || "").trim().toUpperCase();

  if (!raw) return "UNKNOWN";

  // Already a valid UI tone — pass through
  if (
    ["CALM", "NEUTRAL", "AGITATED", "ANGRY", "FRUSTRATED", "DISTRESSED", "THREAT", "ABUSIVE", "UNKNOWN"].includes(raw)
  ) {
    return raw;
  }

  // Backend sentiment_label → UI tone
  if (raw === "POSITIVE") return "CALM";
  if (raw === "NEGATIVE") return "AGITATED";
  if (raw === "UPSET" || raw === "FRUSTRATED") return "AGITATED";
  if (raw === "THREATENING") return "THREAT";

  return "NEUTRAL";
}

function mapScoreToConfidence(scoreValue) {
  const score = Number(scoreValue);
  if (Number.isNaN(score)) return "";
  if (score >= 0.7) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

/**
 * Canonical backend -> UI ticket adapter
 * Single source of truth for ticket shape in the frontend.
 */
export function mapBackendTicketToUi(ticket) {
  if (!ticket || typeof ticket !== "object") return ticket;

  const ticketId = ticket.ticket_id ?? ticket.id ?? "";
  const callerName = ticket.caller_name ?? ticket.name ?? "";
  const phoneNumber = ticket.phone_number ?? ticket.phone ?? "";

  const normalizedCategory = normalizeCategory(ticket.category ?? "");
  const normalizedDepartment =
    normalizeDepartment(
      ticket.department ??
        ticket.assigned_department ??
        ticket.assignedDepartment ??
        ""
    ) ||
    inferDepartmentFromCategory(normalizedCategory) ||
    "";

  const channel = ticket.channel ?? "";

  const inferredCreatedByType =
    String(channel).toUpperCase() === "VOICE"
      ? "VOICE_BOT"
      : String(channel).toUpperCase() === "WEB"
      ? "CITIZEN"
      : "OPERATOR";

  const createdByType =
    ticket.created_by_type ?? ticket.createdByType ?? inferredCreatedByType;

  // Confidence: explicit string → score-derived fallback
  const explicitConfidence =
    ticket.confidence ??
    ticket.priority_confidence ??
    ticket.classification_confidence;

  let normalizedConfidence = String(explicitConfidence ?? "").trim().toUpperCase();
  if (!normalizedConfidence) {
    normalizedConfidence = mapScoreToConfidence(
      ticket.sentiment_score ?? ticket.sentimentScore
    );
  }

  const ticketForStatus = { ...ticket, confidence: normalizedConfidence };
  const normalizedStatus = normalizeTicketStatus(ticketForStatus);

  // Tone: prefer explicit tone field, fall back to sentiment_label
  const rawTone = ticket.tone ?? ticket.callerTone ?? ticket.sentiment_label ?? "NEUTRAL";
  const normalizedTone = mapSentimentToTone(rawTone);
  const normalizedToneConfidence =
    String(ticket.tone_confidence ?? "").trim().toUpperCase() ||
    mapScoreToConfidence(ticket.sentiment_score ?? ticket.sentimentScore);

  return {
    // canonical ids
    id: ticketId,
    ticketId,
    ticketNumber: ticket.ticket_number ?? ticket.ticketNumber ?? ticketId,

    // UI-friendly aliases
    name: callerName,
    phone: phoneNumber,
    callerName,
    phoneNumber,

    // core fields
    category: normalizedCategory,
    description: ticket.description ?? "",
    location: ticket.location ?? "",
    severity: ticket.severity ?? "",
    channel,

    // status / routing
    status: normalizedStatus,
    ticketStatus: normalizedStatus,
    assignedDepartment: normalizedDepartment,
    department: normalizedDepartment,
    departmentStatus: ticket.department_status ?? ticket.departmentStatus ?? "",
    routingStatus: ticket.routing_status ?? ticket.routingStatus ?? "",
    workflowStage: ticket.workflow_stage ?? ticket.workflowStage ?? "",

    // timestamps / session
    sessionId: ticket.session_id ?? ticket.sessionId ?? "",
    sessionHistory: Array.isArray(ticket.session_history)
      ? ticket.session_history
      : Array.isArray(ticket.sessionHistory)
      ? ticket.sessionHistory
      : [],
    createdAt: ticket.created_at ?? ticket.createdAt ?? "",
    updatedAt: ticket.updated_at ?? ticket.updatedAt ?? "",

    // ownership / actors
    createdByType,
    createdByName:
      ticket.created_by_name ??
      ticket.createdByName ??
      (String(createdByType).toUpperCase() === "VOICE_BOT"
        ? "INSIGHT VoiceBot"
        : ""),
    createdByRole:
      ticket.created_by_role ??
      ticket.createdByRole ??
      (String(createdByType).toUpperCase() === "VOICE_BOT" ? "SYSTEM" : "OPERATOR"),

    handledByType:
      ticket.handled_by_type ??
      ticket.handledByType ??
      (String(createdByType).toUpperCase() === "VOICE_BOT" ? "VOICE_BOT" : ""),
    handledByName:
      ticket.handled_by_name ??
      ticket.handledByName ??
      (String(createdByType).toUpperCase() === "VOICE_BOT" ? "INSIGHT VoiceBot" : ""),
    handledByRole:
      ticket.handled_by_role ??
      ticket.handledByRole ??
      (String(createdByType).toUpperCase() === "VOICE_BOT" ? "VOICE_BOT" : ""),

    // tone / caller mood
    tone: normalizedTone,
    callerTone: normalizedTone,
    toneConfidence: normalizedToneConfidence,
    toneSource: ticket.tone_source ?? ticket.toneSource ?? "",

    // ticket confidence
    confidence: normalizedConfidence,
    confidenceScores: ticket.confidence_scores ?? ticket.confidenceScores ?? null,
    confidenceAlert: ticket.confidence_alert ?? ticket.confidenceAlert ?? "",
    alertedFields: ticket.alerted_fields ?? ticket.alertedFields ?? [],

    // raw ML sentiment values
    sentimentScore: ticket.sentiment_score ?? ticket.sentimentScore ?? null,
    sentimentLabel: ticket.sentiment_label ?? ticket.sentimentLabel ?? "",
    sentimentFlag: ticket.sentiment_flag ?? ticket.sentimentFlag ?? "",

    // priority & escalation
    priority: ticket.priority ?? "",
    escalation: ticket.escalation ?? "",

    // optional metadata
    notes: ticket.notes ?? ticket.comments ?? "",
    transcript: ticket.transcript ?? ticket.description ?? "",
    recordingUrl: ticket.recording_url ?? ticket.recordingUrl ?? "",
    approvedAt: ticket.approved_at ?? ticket.approvedAt ?? "",
    rejectedReason: ticket.rejected_reason ?? ticket.rejectedReason ?? "",
    deletedReason: ticket.deleted_reason ?? ticket.deletedReason ?? "",

    // SLA tracking
    slaDeadline: ticket.sla_deadline ?? ticket.slaDeadline ?? null,
    isOverdue: ticket.is_overdue ?? ticket.isOverdue ?? false,
    // False report
    isFalseReport: ticket.is_false_report ?? ticket.isFalseReport ?? false,

    // keep raw object for debugging
    _raw: ticket,
  };
}

/**
 * UI patch -> backend patch adapter
 */
function mapUiPatchToBackend(patch = {}) {
  const updates = {};

  if ("status" in patch) updates.ticket_status = patch.status;
  if ("ticketStatus" in patch) updates.ticket_status = patch.ticketStatus;

  if ("assignedDepartment" in patch) updates.department = patch.assignedDepartment;
  if ("department" in patch) updates.department = patch.department;
  if ("departmentStatus" in patch) updates.department_status = patch.departmentStatus;

  if ("category" in patch) updates.category = patch.category;
  if ("location" in patch) updates.location = patch.location;
  if ("description" in patch) updates.description = patch.description;
  if ("severity" in patch) updates.severity = patch.severity;
  if ("channel" in patch) updates.channel = patch.channel;

  if ("name" in patch) updates.caller_name = patch.name;
  if ("callerName" in patch) updates.caller_name = patch.callerName;
  if ("phone" in patch) updates.phone_number = patch.phone;
  if ("phoneNumber" in patch) updates.phone_number = patch.phoneNumber;

  if ("sessionId" in patch) updates.session_id = patch.sessionId;
  if ("routingStatus" in patch) updates.routing_status = patch.routingStatus;
  if ("workflowStage" in patch) updates.workflow_stage = patch.workflowStage;

  if ("handledByType" in patch) updates.handled_by_type = patch.handledByType;
  if ("handledByName" in patch) updates.handled_by_name = patch.handledByName;
  if ("handledByRole" in patch) updates.handled_by_role = patch.handledByRole;

  if ("createdByType" in patch) updates.created_by_type = patch.createdByType;
  if ("createdByName" in patch) updates.created_by_name = patch.createdByName;
  if ("createdByRole" in patch) updates.created_by_role = patch.createdByRole;

  if ("tone" in patch) updates.tone = patch.tone;
  if ("toneConfidence" in patch) updates.tone_confidence = patch.toneConfidence;
  if ("toneSource" in patch) updates.tone_source = patch.toneSource;
  if ("priority" in patch) updates.priority = patch.priority;
  if ("escalation" in patch) updates.escalation = patch.escalation;
  if ("confidence" in patch) updates.confidence = patch.confidence;

  if ("notes" in patch) updates.notes = patch.notes;
  if ("transcript" in patch) updates.transcript = patch.transcript;
  if ("recordingUrl" in patch) updates.recording_url = patch.recordingUrl;
  if ("sessionHistory" in patch) updates.session_history = patch.sessionHistory;
  if ("rejectedReason" in patch) updates.rejected_reason = patch.rejectedReason;
  if ("deletedReason" in patch) updates.deleted_reason = patch.deletedReason;

  const body = {};
  if (Object.keys(updates).length > 0) body.updates = updates;
  return body;
}

/**
 * UI create payload -> backend create payload adapter
 */
function mapUiCreateToBackend(payload = {}) {
  const backendPayload = {};

  const normalizedCategory = normalizeCategory(payload.category ?? "");
  const normalizedDepartment =
    normalizeDepartment(payload.assignedDepartment ?? payload.department ?? "") ||
    inferDepartmentFromCategory(normalizedCategory) ||
    "";

  if (normalizedCategory) backendPayload.category = normalizedCategory;
  if (normalizedDepartment) backendPayload.department = normalizedDepartment;
  if ("departmentStatus" in payload) backendPayload.department_status = payload.departmentStatus;

  if ("location" in payload) backendPayload.location = payload.location ?? "";
  if ("description" in payload) backendPayload.description = payload.description ?? "";
  if ("severity" in payload) backendPayload.severity = payload.severity ?? "MEDIUM";
  if ("channel" in payload) backendPayload.channel = payload.channel ?? "WEB";

  if ("name" in payload) backendPayload.caller_name = payload.name ?? "";
  if ("callerName" in payload) backendPayload.caller_name = payload.callerName ?? backendPayload.caller_name ?? "";
  if ("phone" in payload) backendPayload.phone_number = payload.phone ?? "";
  if ("phoneNumber" in payload) backendPayload.phone_number = payload.phoneNumber ?? backendPayload.phone_number ?? "";

  if ("status" in payload) backendPayload.ticket_status = payload.status;
  if ("ticketStatus" in payload) backendPayload.ticket_status = payload.ticketStatus;
  if ("sessionId" in payload) backendPayload.session_id = payload.sessionId;
  if ("routingStatus" in payload) backendPayload.routing_status = payload.routingStatus;
  if ("workflowStage" in payload) backendPayload.workflow_stage = payload.workflowStage;

  if ("createdByType" in payload) backendPayload.created_by_type = payload.createdByType;
  if ("createdByName" in payload) backendPayload.created_by_name = payload.createdByName;
  if ("createdByRole" in payload) backendPayload.created_by_role = payload.createdByRole;
  if ("handledByType" in payload) backendPayload.handled_by_type = payload.handledByType;
  if ("handledByName" in payload) backendPayload.handled_by_name = payload.handledByName;
  if ("handledByRole" in payload) backendPayload.handled_by_role = payload.handledByRole;

  if ("tone" in payload) backendPayload.tone = payload.tone ?? "";
  if ("toneConfidence" in payload) backendPayload.tone_confidence = payload.toneConfidence;
  if ("toneSource" in payload) backendPayload.tone_source = payload.toneSource ?? "OPERATOR";
  if ("priority" in payload) backendPayload.priority = payload.priority ?? "";
  if ("escalation" in payload) backendPayload.escalation = payload.escalation ?? "NONE";
  if ("confidence" in payload) backendPayload.confidence = payload.confidence;

  if ("notes" in payload) backendPayload.notes = payload.notes ?? "";
  if ("transcript" in payload) backendPayload.transcript = payload.transcript ?? "";
  if ("recordingUrl" in payload) backendPayload.recording_url = payload.recordingUrl ?? "";
  if ("sessionHistory" in payload) backendPayload.session_history = payload.sessionHistory ?? [];

  return backendPayload;
}

export async function fetchTickets(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("ticket_status", params.status);
  if (params.channel) query.set("channel", params.channel);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await apiFetch(`/tickets/${suffix}`, { method: "GET" });

  const tickets = Array.isArray(data?.tickets)
    ? data.tickets
    : Array.isArray(data)
    ? data
    : [];

  return tickets.map(mapBackendTicketToUi);
}

export async function fetchTicket(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId.");
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}`, { method: "GET" });
  return mapBackendTicketToUi(data);
}

export async function createTicket(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid create payload.");
  const backendPayload = mapUiCreateToBackend(payload);
  const data = await apiFetch(`/tickets/`, {
    method: "POST",
    body: JSON.stringify(backendPayload),
  });
  return data ? mapBackendTicketToUi(data) : null;
}

export async function updateTicket(ticketId, patch) {
  if (!ticketId) throw new Error("Missing ticketId for update.");
  if (!patch || typeof patch !== "object") throw new Error("Invalid update payload.");
  const backendPatch = mapUiPatchToBackend(patch);
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}`, {
    method: "PUT",
    body: JSON.stringify(backendPatch),
  });
  return data ? mapBackendTicketToUi(data) : null;
}

export async function approveTicket(ticketId, actorInfo = {}) {
  if (!ticketId) throw new Error("Missing ticketId for approve.");
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/approve`, {
    method: "POST",
    body: JSON.stringify({
      handled_by_type: actorInfo.handledByType || "SUPERVISOR",
      handled_by_name: actorInfo.handledByName || "",
      handled_by_role: actorInfo.handledByRole || "SUPERVISOR",
    }),
  });
  return data ? mapBackendTicketToUi(data) : null;
}

export async function rejectTicket(ticketId, payload = {}) {
  if (!ticketId) throw new Error("Missing ticketId for reject.");
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ rejected_reason: payload.rejectedReason || "" }),
  });
  return data ? mapBackendTicketToUi(data) : null;
}

export async function escalateTicket(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId for escalate.");
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/escalate`, { method: "POST" });
  return data ? mapBackendTicketToUi(data) : null;
}

export async function resolveTicket(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId for resolve.");
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/resolve`, { method: "POST" });
  return data ? mapBackendTicketToUi(data) : null;
}

export async function markFalseReport(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId.");
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/false-report`, { method: "POST" });
  return data ? mapBackendTicketToUi(data) : null;
}

export async function unmarkFalseReport(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId.");
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/false-report`, { method: "DELETE" });
  return data ? mapBackendTicketToUi(data) : null;
}

export async function fetchPenalties() {
  return apiFetch(`/tickets/penalties/list`, { method: "GET" });
}

export async function deleteTicket(ticketId, payload = {}) {
  return updateTicket(ticketId, {
    status: TICKET_STATUSES.DELETE,
    workflowStage: "DELETED",
    handledByType: payload.deletedByRole || "SUPERVISOR",
    handledByName: payload.deletedByName || "",
    handledByRole: payload.deletedByRole || "SUPERVISOR",
    deletedReason: payload.deletedReason || "",
  });
}
