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
