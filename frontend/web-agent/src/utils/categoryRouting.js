// src/utils/categoryRouting.js

// Canonical 311 categories (locked list for this prototype)
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

  // Expanded taxonomy (matches mock + voice tickets)
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

// Rule-based mapping: category -> department
// (Keep these names stable so routing + UI are consistent.)
export const CATEGORY_TO_DEPARTMENT = {
  "Graffiti": "Municipal Standards",
  "Illegal sign": "Bylaw Enforcement",
  "Litter in a playground, park or trail": "Parks & Recreation",
  "Needles": "Public Health",
  "Parking complaint": "Parking Enforcement",
  "Property standards complaint": "Municipal Standards",
  "Pothole": "Roads",
  "Sidewalk snow clearing": "Transportation Services",
  "Sidewalk trip hazard": "Transportation Services",
  "Trail surface maintenance": "Parks & Recreation",

  // Expanded mapping
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
  "Roads",
  "Transportation Services",
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

export function inferDepartmentFromCategory(category) {
  const key = String(category || "").trim();
  return CATEGORY_TO_DEPARTMENT[key] || "General";
}
