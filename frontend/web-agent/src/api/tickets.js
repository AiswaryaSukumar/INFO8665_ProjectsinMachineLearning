// src/api/tickets.js
import { apiFetch } from "./client";

// Adjust endpoints when backend is ready.
export async function fetchTickets() {
  return await apiFetch("/tickets", { method: "GET" });
}

export async function updateTicket(ticketId, patch) {
  if (!ticketId) throw new Error("Missing ticketId for update.");
  if (!patch || typeof patch !== "object") throw new Error("Invalid update payload.");

  return await apiFetch(`/tickets/${encodeURIComponent(ticketId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function approveTicket(ticketId) {
  if (!ticketId) throw new Error("Missing ticketId for approval.");

  return await apiFetch(`/tickets/${encodeURIComponent(ticketId)}/approve`, {
    method: "POST",
  });
}
