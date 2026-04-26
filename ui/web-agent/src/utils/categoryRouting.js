// src/utils/categoryRouting.js

export const CATEGORIES = [
  "Graffiti",
  "Illegal sign",
  "Litter in a playground, park or trail",
  "Needles",
  "Parking complaint",
  "Property standards complaint",
  "Pothole",
  "Sidewalk snow clearing",
  "Sidewalk trip hazard",
  "Trail surface maintenance",

  // Expanded taxonomy
  "Noise complaint",
  "Streetlight",
  "Water leak",
  "Road debris",
  "Traffic signal",
  "Tree / fallen branch",
  "Missed garbage pickup",
  "Animal control",
  "Other",
];

export const CATEGORY_TO_DEPARTMENT = {
  "Graffiti": "Municipal Standards",
  "Illegal sign": "Bylaw Enforcement",
  "Litter in a playground, park or trail": "Parks & Recreation",
  "Needles": "Public Health",
  "Parking complaint": "Parking Enforcement",
  "Property standards complaint": "Municipal Standards",
  "Pothole": "Transportation Services",
  "Sidewalk snow clearing": "Transportation Services",
  "Sidewalk trip hazard": "Transportation Services",
  "Trail surface maintenance": "Parks & Recreation",

  "Noise complaint": "Bylaw Enforcement",
  "Streetlight": "Electrical",
  "Water leak": "Water Services",
  "Road debris": "Roads",
  "Traffic signal": "Transportation Services",
  "Tree / fallen branch": "Parks & Recreation",
  "Missed garbage pickup": "Solid Waste",
  "Animal control": "Animal Services",
  "Other": "General",
};

export const DEPARTMENTS = [
  "Transportation Services",
  "Roads",
  "Parks & Recreation",
  "Public Health",
  "Parking Enforcement",
  "Bylaw Enforcement",
  "Municipal Standards",
  "Electrical",
  "Water Services",
  "Solid Waste",
  "Animal Services",
  "General",
];

const CATEGORY_ALIASES = {
  graffiti: "Graffiti",
  "illegal sign": "Illegal sign",
  litter: "Litter in a playground, park or trail",
  needles: "Needles",
  "parking complaint": "Parking complaint",
  parking: "Parking complaint",
  "property standards complaint": "Property standards complaint",
  "property standards": "Property standards complaint",
  pothole: "Pothole",
  "sidewalk snow clearing": "Sidewalk snow clearing",
  "sidewalk trip hazard": "Sidewalk trip hazard",
  "trail surface maintenance": "Trail surface maintenance",
  "noise complaint": "Noise complaint",
  streetlight: "Streetlight",
  "water leak": "Water leak",
  "road debris": "Road debris",
  "traffic signal": "Traffic signal",
  "tree / fallen branch": "Tree / fallen branch",
  "tree fallen branch": "Tree / fallen branch",
  "missed garbage pickup": "Missed garbage pickup",
  garbage: "Missed garbage pickup",
  "missed garbage": "Missed garbage pickup",
  "animal control": "Animal control",
  other: "Other",
};

export function normalizeCategory(category) {
  const raw = String(category || "").trim();
  if (!raw) return "";

  if (CATEGORIES.includes(raw)) return raw;

  const normalizedKey = raw.toLowerCase();
  return CATEGORY_ALIASES[normalizedKey] || raw;
}

export function normalizeDepartment(department) {
  const raw = String(department || "").trim();
  if (!raw) return "";

  const exact = DEPARTMENTS.find((d) => d.toLowerCase() === raw.toLowerCase());
  return exact || raw;
}

export function inferDepartmentFromCategory(category) {
  const normalizedCategory = normalizeCategory(category);
  return CATEGORY_TO_DEPARTMENT[normalizedCategory] || "General";
}