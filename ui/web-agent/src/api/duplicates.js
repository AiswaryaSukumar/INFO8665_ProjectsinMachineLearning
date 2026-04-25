import { apiFetch } from "./client";

function normalizeTicketSummary(ticket = {}) {
  return {
    id: ticket.id || ticket.ticket_id || "",
    ticketId: ticket.ticket_id || ticket.id || "",
    location: ticket.location || "",
    description: ticket.description || "",
    caller: ticket.caller || "",
    phone: ticket.phone || "",
    status: ticket.status || "",
    category: ticket.category || "",
    createdAt: ticket.created_at || ticket.createdAt || "",
    updatedAt: ticket.updated_at || ticket.updatedAt || "",
  };
}

function normalizeScore(value) {
  const score = Number(value ?? 0);
  if (!Number.isFinite(score)) return 0;
  return score > 0 && score <= 1 ? score * 100 : score;
}

export function normalizeDuplicateCandidate(candidate = {}) {
  return {
    id: candidate.duplicate_id || candidate.id || "",
    status: String(candidate.status || "pending").toLowerCase(),
    category: candidate.category || "",
    matchScore: normalizeScore(candidate.match_score ?? candidate.matchScore),
    categoryScore: normalizeScore(candidate.category_score ?? candidate.categoryScore),
    locationScore: normalizeScore(candidate.location_score ?? candidate.locationScore),
    textScore: normalizeScore(candidate.text_score ?? candidate.textScore),
    timeScore: normalizeScore(candidate.time_score ?? candidate.timeScore),
    reasonCodes: candidate.reason_codes || candidate.reasonCodes || [],
    detectedAt: candidate.detected_at || candidate.detectedAt || "",
    reviewedAt: candidate.reviewed_at || candidate.reviewedAt || "",
    reviewedBy: candidate.reviewed_by || candidate.reviewedBy || "",
    ticketId: candidate.ticket_id || candidate.ticketId || "",
    candidateTicketId: candidate.candidate_ticket_id || candidate.candidateTicketId || "",
    original: normalizeTicketSummary(candidate.original || {}),
    duplicate: normalizeTicketSummary(candidate.duplicate || {}),
  };
}

export async function fetchDuplicates(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await apiFetch(`/duplicates/${suffix}`, { method: "GET" });
  const duplicates = Array.isArray(data?.duplicates) ? data.duplicates : [];
  return duplicates.map(normalizeDuplicateCandidate);
}

export async function mergeDuplicate(duplicateId, reviewedBy = "") {
  const data = await apiFetch(`/duplicates/${encodeURIComponent(duplicateId)}/merge`, {
    method: "POST",
    body: JSON.stringify({ reviewed_by: reviewedBy }),
  });
  return normalizeDuplicateCandidate(data);
}

export async function dismissDuplicate(duplicateId, reviewedBy = "") {
  const data = await apiFetch(`/duplicates/${encodeURIComponent(duplicateId)}/dismiss`, {
    method: "POST",
    body: JSON.stringify({ reviewed_by: reviewedBy }),
  });
  return normalizeDuplicateCandidate(data);
}
