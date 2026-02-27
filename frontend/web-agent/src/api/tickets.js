// src/api/tickets.js
import { apiFetch } from "./client";

// Adjust endpoints when backend is ready.
export async function fetchTickets() {
  return await apiFetch("/tickets", { method: "GET" });
}

export async function updateTicket(ticketId, patch) {
  if (!ticketId) throw new Error("Missing ticketId for update.");
  if (!patch || typeof patch !== "object")
    throw new Error("Invalid update payload.");

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

/**
 * Soft-delete simulation (frontend-friendly).
 * Marks ticket as status: "DELETE" and attaches delete metadata.
 * NOTE: This does not persist to a real backend unless your apiFetch mock stores state.
 */
export async function deleteTicket(id, payload) {
  if (!id) throw new Error("Missing ticket id for delete.");

  const tickets = await fetchTickets();
  const index = tickets.findIndex(
    (t) => String(t.id) === String(id) || String(t.ticketNumber) === String(id)
  );

  if (index === -1) throw new Error("Ticket not found");

  const updated = {
    ...tickets[index],
    status: "DELETE",
    deleteComment: payload?.deleteComment || "",
    deletedByRole: payload?.deletedByRole || "",
    deletedByName: payload?.deletedByName || "",
  };

  // Mutates the fetched list (works only if apiFetch returns a mutable in-memory list)
  tickets[index] = updated;

  return updated;
}