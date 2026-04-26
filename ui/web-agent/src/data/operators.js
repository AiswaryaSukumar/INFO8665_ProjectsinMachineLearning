// src/data/operators.js

export const USERS = [
  {
    id: "op1",
    name: "Jerry",
    role: "OPERATOR",
  },
  {
    id: "op2",
    name: "Tom",
    role: "OPERATOR",
  },
  {
    id: "sup1",
    name: "Nagavalli",
    role: "SUPERVISOR",
  },
];

// Convenience exports (used in routing logic & dropdowns)

export const OPERATORS = USERS.filter((u) => u.role === "OPERATOR");
export const SUPERVISOR = USERS.find((u) => u.role === "SUPERVISOR");

// Active operators available for ticket assignment
// Mark operators as active=false to hide them from assignment dropdowns
export const ACTIVE_OPERATORS = USERS.filter(
  (u) => u.role === "OPERATOR" && u.active !== false
);

// Default human assignee name (first active operator or supervisor fallback)
export const DEFAULT_HUMAN_ASSIGNEE_NAME =
  ACTIVE_OPERATORS?.[0]?.name ?? SUPERVISOR?.name ?? "Nagavalli";
