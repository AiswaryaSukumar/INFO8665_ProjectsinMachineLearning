// src/utils/ticketStore.js
// ------------------------------------------------------------
// Lightweight localStorage-backed ticket store for fallback use only.
// IMPORTANT:
// - No mock data seeding
// - Starts empty unless something explicitly writes into localStorage
// - Safe for pages that still reference ticketStore during transition
// ------------------------------------------------------------

import { inferDepartmentFromCategory } from "./categoryRouting";

const KEY = "insight311.tickets.v1";

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTicket(t) {
  const out = { ...(t || {}) };

  // Backward compatibility for category field names
  if (!out.category) {
    out.category =
      out.serviceCategory ||
      out.issueCategory ||
      out.issueType ||
      out.type ||
      null;
  }

  // Always keep sessionHistory present
  if (!Array.isArray(out.sessionHistory)) out.sessionHistory = [];

  // Normalize old history shapes to { at, speaker, text }
  out.sessionHistory = (out.sessionHistory || []).map((m) => {
    if (!m || typeof m !== "object") {
      return { at: "", speaker: "", text: String(m || "") };
    }

    const speaker = m.speaker || m.from || m.role || m.type || "";
    const text = m.text || m.message || m.note || m.to || "";
    const at = m.at || m.time || m.ts || "";

    return { at, speaker, text };
  });

  // Canonical department field
  if (out.department && !out.assignedDepartment) {
    out.assignedDepartment = out.department;
  }
  if (out.assignedDepartment === undefined) out.assignedDepartment = null;

  if (!out.assignedDepartment && out.category) {
    out.assignedDepartment = inferDepartmentFromCategory(out.category);
  }

  if (out.routedToDepartment === undefined) {
    out.routedToDepartment = out.routedToDepartment || null;
  }

  if (out.isDeleted === undefined) out.isDeleted = false;

  // Backward compatibility for old delete statuses
  const normalizedStatus = String(out.status || "").toUpperCase();
  if (normalizedStatus === "DELETE" || normalizedStatus === "DELETED") {
    out.isDeleted = true;
    out.status = "REJECTED";
  }

  // Only pure voice-bot tickets should default to pending approval
  const createdType = String(out.createdByType || "").toUpperCase();
  const handledRole = String(out.handledByRole || "").toUpperCase();
  const handledType = String(out.handledByType || "").toUpperCase();

  const isPureBot =
    createdType === "VOICE_BOT" &&
    handledRole === "VOICE_BOT" &&
    handledType === "VOICE_BOT";

  if (!out.routingStatus) {
    out.routingStatus = isPureBot ? "PENDING_APPROVAL" : "ROUTED";
  }

  if (!out.workflowStage) {
    out.workflowStage = isPureBot ? "PENDING_APPROVAL" : "STANDARD";
  }

  return out;
}

export function initTicketStore() {
  const existing = safeParse(localStorage.getItem(KEY) || "null", null);

  // If already initialized, keep it
  if (Array.isArray(existing)) return;

  // Start EMPTY — no mock seeding
  localStorage.setItem(KEY, JSON.stringify([]));
}

export function clearTicketStore() {
  localStorage.setItem(KEY, JSON.stringify([]));
}

export function getTickets() {
  initTicketStore();
  const arr = safeParse(localStorage.getItem(KEY) || "[]", []);
  return (Array.isArray(arr) ? arr : []).map(normalizeTicket);
}

export function setTickets(next) {
  const normalized = (next || []).map(normalizeTicket);
  localStorage.setItem(KEY, JSON.stringify(normalized));
  return normalized;
}

export function getTicketByNumber(ticketNumber) {
  const all = getTickets();
  return all.find((t) => String(t.ticketNumber) === String(ticketNumber)) || null;
}

export function updateTicketByNumber(ticketNumber, patch) {
  const all = getTickets();
  const idx = all.findIndex((t) => String(t.ticketNumber) === String(ticketNumber));

  if (idx === -1) return { ok: false, error: "Ticket not found" };

  const updated = normalizeTicket({ ...all[idx], ...patch });
  all[idx] = updated;
  setTickets(all);

  return { ok: true, ticket: updated };
}

export function approveAndRouteTicket(ticketNumber, department, approverName, approverRole) {
  const t = getTicketByNumber(ticketNumber);
  if (!t) return { ok: false, error: "Ticket not found" };

  const now = nowIso();

  const updated = {
    ...t,
    assignedDepartment: department || t.assignedDepartment || null,
    routedToDepartment: department || t.assignedDepartment || null,
    routingStatus: "APPROVED",
    workflowStage: "ROUTED_TO_DEPARTMENT",
    approvedAt: now,
    approvedByName: approverName || t.approvedByName || null,
    approvedByRole: approverRole || t.approvedByRole || null,
    status: String(t.status || "").toUpperCase() === "NEEDS_REVIEW" ? "APPROVED" : t.status,
  };

  const hist = Array.isArray(updated.sessionHistory) ? [...updated.sessionHistory] : [];
  hist.push({
    at: now,
    speaker: `${approverRole || "SUPERVISOR"} (${approverName || "Supervisor"})`,
    text: `Approved & routed to Department Queue — ${
      department || updated.assignedDepartment || "Department"
    }.`,
  });
  updated.sessionHistory = hist;

  return updateTicketByNumber(ticketNumber, updated);
}

export function rejectVoiceBotTicket(ticketNumber, reviewerName, reviewerRole, reason = "") {
  const t = getTicketByNumber(ticketNumber);
  if (!t) return { ok: false, error: "Ticket not found" };

  const now = nowIso();
  const cleanReason = String(reason || "").trim();

  const updated = {
    ...t,
    status: "REJECTED",
    routingStatus: "REJECTED",
    workflowStage: "REJECTED_BY_SUPERVISOR",
    rejectedAt: now,
    rejectedByName: reviewerName || t.rejectedByName || null,
    rejectedByRole: reviewerRole || t.rejectedByRole || null,
    rejectedReason: cleanReason || "Rejected by supervisor",
  };

  const hist = Array.isArray(updated.sessionHistory) ? [...updated.sessionHistory] : [];
  hist.push({
    at: now,
    speaker: `${reviewerRole || "SUPERVISOR"} (${reviewerName || "Supervisor"})`,
    text: cleanReason
      ? `Rejected by supervisor — ${cleanReason}.`
      : "Rejected by supervisor. No routing action will be taken.",
  });
  updated.sessionHistory = hist;

  return updateTicketByNumber(ticketNumber, updated);
}

export function markTicketDeleted(ticketNumber, deletedByName, deletedByRole, reason = "") {
  const t = getTicketByNumber(ticketNumber);
  if (!t) return { ok: false, error: "Ticket not found" };

  const now = nowIso();
  const cleanReason = String(reason || "").trim();

  const updated = {
    ...t,
    isDeleted: true,
    deletedAt: now,
    deletedByName: deletedByName || t.deletedByName || null,
    deletedByRole: deletedByRole || t.deletedByRole || null,
    deletedReason: cleanReason || "Deleted by supervisor",
    deleteComment: cleanReason || "Deleted by supervisor",
  };

  const hist = Array.isArray(updated.sessionHistory) ? [...updated.sessionHistory] : [];
  hist.push({
    at: now,
    speaker: `${deletedByRole || "SUPERVISOR"} (${deletedByName || "Supervisor"})`,
    text: cleanReason
      ? `Soft-deleted by supervisor — ${cleanReason}.`
      : "Soft-deleted by supervisor.",
  });
  updated.sessionHistory = hist;

  return updateTicketByNumber(ticketNumber, updated);
}