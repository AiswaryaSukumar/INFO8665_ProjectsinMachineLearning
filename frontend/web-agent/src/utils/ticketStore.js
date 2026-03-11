// src/utils/ticketStore.js
// ------------------------------------------------------------
// Lightweight localStorage-backed ticket store for the prototype.
// Keeps TicketDetailsPage, IntakePage, and StatusLookupPage consistent
// even when API_BASE is not configured.
// ------------------------------------------------------------

import { mockTickets } from "../mock/mockTickets";
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
  const out = { ...t };

  // ✅ Some legacy sources use different keys
  if (!out.category) {
    out.category =
      out.serviceCategory ||
      out.issueCategory ||
      out.issueType ||
      out.type ||
      null;
  }

  // Always present (drawer + details page expects this).
  if (!Array.isArray(out.sessionHistory)) out.sessionHistory = [];

  // ✅ Backward compatibility: some older code stored history as {type/from/to/...}.
  // Normalize everything to {at, speaker, text} so TicketDetailsPage can render it.
  out.sessionHistory = (out.sessionHistory || []).map((m) => {
    if (!m || typeof m !== "object") {
      return { at: "", speaker: "", text: String(m || "") };
    }
    const speaker = m.speaker || m.from || m.role || m.type || "";
    const text = m.text || m.message || m.note || m.to || "";
    const at = m.at || m.time || m.ts || "";
    return { at, speaker, text };
  });

  // Canonical department field in this project is assignedDepartment.
  if (out.department && !out.assignedDepartment) out.assignedDepartment = out.department;
  if (out.assignedDepartment === undefined) out.assignedDepartment = null;

  // ✅ If department is missing but category exists, derive department.
  if (!out.assignedDepartment && out.category) {
    out.assignedDepartment = inferDepartmentFromCategory(out.category);
  }

  // Helpful for the Approval column label
  if (out.routedToDepartment === undefined) {
    out.routedToDepartment = out.routedToDepartment || null;
  }

  // ✅ Default routing status should not mark every ticket as pending approval.
  // Only bot-only tickets should be pending approval; everything else is treated as routed.
  const createdType = String(out.createdByType || "").toUpperCase();
  const handledRole = String(out.handledByRole || "").toUpperCase();
  const handledType = String(out.handledByType || "").toUpperCase();
  const isPureBot =
    createdType === "VOICE_BOT" &&
    handledRole === "VOICE_BOT" &&
    handledType === "VOICE_BOT";

  if (!out.routingStatus) out.routingStatus = isPureBot ? "PENDING_APPROVAL" : "ROUTED";
  if (!out.workflowStage) out.workflowStage = isPureBot ? "PENDING_APPROVAL" : "STANDARD";

  return out;
}

export function initTicketStore() {
  const existing = safeParse(localStorage.getItem(KEY) || "null", null);
  if (Array.isArray(existing) && existing.length) return;
  const seeded = (mockTickets || []).map(normalizeTicket);
  localStorage.setItem(KEY, JSON.stringify(seeded));
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

    // Once approved, move bot-only NEEDS_REVIEW into IN_PROGRESS by default.
    status: String(t.status || "").toUpperCase() === "NEEDS_REVIEW" ? "IN_PROGRESS" : t.status,
  };

  // ✅ Append session history in the SAME format the TicketDetails UI expects
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

// ✅ Option B: dedicated soft-delete helper for cleaner store logic
export function markTicketDeleted(ticketNumber, deletedByName, deletedByRole, reason = "") {
  const t = getTicketByNumber(ticketNumber);
  if (!t) return { ok: false, error: "Ticket not found" };

  const now = nowIso();
  const cleanReason = String(reason || "").trim();

  const updated = {
    ...t,
    status: "DELETE",
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
      ? `Marked as DELETE — ${cleanReason}.`
      : "Marked as DELETE by supervisor.",
  });
  updated.sessionHistory = hist;

  return updateTicketByNumber(ticketNumber, updated);
}