// src/utils/ticketNumber.js

const KEY = "insight311_ticket_seq_v1";
const YEAR = "2026"; // keep fixed for prototype; can switch to new Date().getFullYear() later

function pad6(n) {
  return String(n).padStart(6, "0");
}

/**
 * Initialize the sequence if missing.
 * Pass a starting number like 1234 to start from 0001234.
 */
export function initTicketSequence(startAt = 1) {
  const existing = Number(localStorage.getItem(KEY));
  if (!existing || Number.isNaN(existing) || existing < startAt) {
    localStorage.setItem(KEY, String(startAt));
  }
}

/**
 * Peek the next ticket number WITHOUT consuming it.
 * Use this for "Draft Ticket # ..." display in the form.
 */
export function peekNextTicketNumber() {
  const seq = Number(localStorage.getItem(KEY) || "1");
  return `311-${YEAR}-${pad6(seq)}`;
}

/**
 * Consume and return the next ticket number (increments the counter).
 * Use this when you want to officially reserve it.
 */
export function consumeNextTicketNumber() {
  const seq = Number(localStorage.getItem(KEY) || "1");
  const ticketNumber = `311-${YEAR}-${pad6(seq)}`;
  localStorage.setItem(KEY, String(seq + 1));
  return ticketNumber;
}

/**
 * Utility: make sure the counter is always ahead of your existing data.
 * Example: if your mock tickets include 311-2026-000120, call ensureSequenceAtLeast(121)
 */
export function ensureSequenceAtLeast(minNext) {
  const current = Number(localStorage.getItem(KEY) || "1");
  if (current < minNext) {
    localStorage.setItem(KEY, String(minNext));
  }
}
