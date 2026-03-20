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
  const normalizedStatus = normalizeTicketStatus(ticket);

  return {
    // canonical ids
    id: ticketId,
    ticketId,
    ticketNumber: ticket.ticket_number ?? ticket.ticketNumber ?? ticketId,

    // UI-friendly aliases used across current pages/components
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
      (String(createdByType).toUpperCase() === "VOICE_BOT"
        ? "SYSTEM"
        : "OPERATOR"),

    handledByType: ticket.handled_by_type ?? ticket.handledByType ?? "",
    handledByName: ticket.handled_by_name ?? ticket.handledByName ?? "",
    handledByRole: ticket.handled_by_role ?? ticket.handledByRole ?? "",

    // optional metadata expected by detail page / queue logic
    confidence: ticket.confidence ?? "",
    notes: ticket.notes ?? ticket.comments ?? "",
    transcript: ticket.transcript ?? ticket.description ?? "",
    recordingUrl: ticket.recording_url ?? ticket.recordingUrl ?? "",
    approvedAt: ticket.approved_at ?? ticket.approvedAt ?? "",
    rejectedReason: ticket.rejected_reason ?? ticket.rejectedReason ?? "",
    deletedReason: ticket.deleted_reason ?? ticket.deletedReason ?? "",

    // keep raw object for debugging
    _raw: ticket,
  };
}

/**
 * UI patch -> backend patch adapter
 */
function mapUiPatchToBackend(patch = {}) {
  const backendPatch = {};

  if ("status" in patch) backendPatch.ticket_status = patch.status;
  if ("ticketStatus" in patch) backendPatch.ticket_status = patch.ticketStatus;

  if ("assignedDepartment" in patch) {
    backendPatch.department = patch.assignedDepartment;
  }
  if ("department" in patch) backendPatch.department = patch.department;

  if ("category" in patch) backendPatch.category = patch.category;
  if ("location" in patch) backendPatch.location = patch.location;
  if ("description" in patch) backendPatch.description = patch.description;
  if ("severity" in patch) backendPatch.severity = patch.severity;
  if ("channel" in patch) backendPatch.channel = patch.channel;

  if ("name" in patch) backendPatch.caller_name = patch.name;
  if ("callerName" in patch) backendPatch.caller_name = patch.callerName;

  if ("phone" in patch) backendPatch.phone_number = patch.phone;
  if ("phoneNumber" in patch) backendPatch.phone_number = patch.phoneNumber;

  if ("sessionId" in patch) backendPatch.session_id = patch.sessionId;
  if ("routingStatus" in patch) backendPatch.routing_status = patch.routingStatus;
  if ("workflowStage" in patch) backendPatch.workflow_stage = patch.workflowStage;
  if ("handledByType" in patch) backendPatch.handled_by_type = patch.handledByType;
  if ("handledByName" in patch) backendPatch.handled_by_name = patch.handledByName;
  if ("handledByRole" in patch) backendPatch.handled_by_role = patch.handledByRole;

  if ("createdByType" in patch) backendPatch.created_by_type = patch.createdByType;
  if ("createdByName" in patch) backendPatch.created_by_name = patch.createdByName;
  if ("createdByRole" in patch) backendPatch.created_by_role = patch.createdByRole;

  if ("sessionHistory" in patch) backendPatch.session_history = patch.sessionHistory;
  if ("notes" in patch) backendPatch.notes = patch.notes;
  if ("transcript" in patch) backendPatch.transcript = patch.transcript;
  if ("recordingUrl" in patch) backendPatch.recording_url = patch.recordingUrl;

  if ("rejectedReason" in patch) backendPatch.rejected_reason = patch.rejectedReason;
  if ("deletedReason" in patch) backendPatch.deleted_reason = patch.deletedReason;

  return backendPatch;
}

/**
 * UI create payload -> backend create payload adapter
 * Keeps create mapping centralized so all submission paths use the same contract.
 */
function mapUiCreateToBackend(payload = {}) {
  const backendPayload = {};

  // Core fields
  const normalizedCategory = normalizeCategory(payload.category ?? "");
  const normalizedDepartment =
    normalizeDepartment(
      payload.assignedDepartment ?? payload.department ?? ""
    ) ||
    inferDepartmentFromCategory(normalizedCategory) ||
    "";

  if (normalizedCategory) backendPayload.category = normalizedCategory;
  if (normalizedDepartment) backendPayload.department = normalizedDepartment;

  if ("location" in payload) backendPayload.location = payload.location ?? "";
  if ("description" in payload) {
    backendPayload.description = payload.description ?? "";
  }
  if ("severity" in payload) backendPayload.severity = payload.severity ?? "MEDIUM";
  if ("channel" in payload) backendPayload.channel = payload.channel ?? "PHONE";

  // Caller identity
  if ("name" in payload) backendPayload.caller_name = payload.name ?? "";
  if ("callerName" in payload) {
    backendPayload.caller_name =
      payload.callerName ?? backendPayload.caller_name ?? "";
  }

  if ("phone" in payload) backendPayload.phone_number = payload.phone ?? "";
  if ("phoneNumber" in payload) {
    backendPayload.phone_number =
      payload.phoneNumber ?? backendPayload.phone_number ?? "";
  }

  // Lifecycle / routing
  if ("status" in payload) backendPayload.ticket_status = payload.status;
  if ("ticketStatus" in payload) {
    backendPayload.ticket_status = payload.ticketStatus;
  }

  if ("sessionId" in payload) backendPayload.session_id = payload.sessionId;
  if ("routingStatus" in payload) {
    backendPayload.routing_status = payload.routingStatus;
  }
  if ("workflowStage" in payload) {
    backendPayload.workflow_stage = payload.workflowStage;
  }

  // Ownership / actor metadata
  if ("createdByType" in payload) {
    backendPayload.created_by_type = payload.createdByType;
  }
  if ("createdByName" in payload) {
    backendPayload.created_by_name = payload.createdByName;
  }
  if ("createdByRole" in payload) {
    backendPayload.created_by_role = payload.createdByRole;
  }

  if ("handledByType" in payload) {
    backendPayload.handled_by_type = payload.handledByType;
  }
  if ("handledByName" in payload) {
    backendPayload.handled_by_name = payload.handledByName;
  }
  if ("handledByRole" in payload) {
    backendPayload.handled_by_role = payload.handledByRole;
  }

  // Optional metadata used by UI / workflow
  if ("notes" in payload) backendPayload.notes = payload.notes ?? "";
  if ("transcript" in payload) backendPayload.transcript = payload.transcript ?? "";
  if ("recordingUrl" in payload) {
    backendPayload.recording_url = payload.recordingUrl ?? "";
  }
  if ("sessionHistory" in payload) {
    backendPayload.session_history = payload.sessionHistory ?? [];
  }

  return backendPayload;
}

export async function fetchTickets(params = {}) {
  const query = new URLSearchParams();

  if (params.status) query.set("ticket_status", params.status);
  if (params.channel) query.set("channel", params.channel);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await apiFetch(`/tickets/${suffix}`, { method: "GET" });

  const tickets = Array.isArray(data?.tickets) ? data.tickets : [];
  return tickets.map(mapBackendTicketToUi);
}

export async function fetchTicket(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId.");
  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}`, {
    method: "GET",
  });
  return mapBackendTicketToUi(data);
}

export async function createTicket(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid create payload.");
  }

  const backendPayload = mapUiCreateToBackend(payload);

  const data = await apiFetch(`/tickets/`, {
    method: "POST",
    body: JSON.stringify(backendPayload),
  });

  return data ? mapBackendTicketToUi(data) : null;
}

export async function updateTicket(ticketId, patch) {
  if (!ticketId) throw new Error("Missing ticketId for update.");
  if (!patch || typeof patch !== "object") {
    throw new Error("Invalid update payload.");
  }

  const backendPatch = mapUiPatchToBackend(patch);

  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}`, {
    method: "PUT",
    body: JSON.stringify(backendPatch),
  });

  return data ? mapBackendTicketToUi(data) : null;
}

/**
 * Workflow actions
 * IMPORTANT:
 * Use dedicated backend action endpoints wherever available.
 */

export async function approveTicket(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId for approve.");

  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/approve`, {
    method: "POST",
  });

  return data ? mapBackendTicketToUi(data) : null;
}

export async function rejectTicket(ticketId, payload = {}) {
  if (!ticketId) throw new Error("Missing ticketId for reject.");

  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/reject`, {
    method: "POST",
    body: JSON.stringify({
      rejected_reason: payload.rejectedReason || "",
    }),
  });

  return data ? mapBackendTicketToUi(data) : null;
}

export async function resolveTicket(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId for resolve.");

  const data = await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/resolve`, {
    method: "POST",
  });

  return data ? mapBackendTicketToUi(data) : null;
}

/**
 * Soft delete remains a governed generic update because backend does not yet
 * expose a dedicated /delete endpoint.
 */
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