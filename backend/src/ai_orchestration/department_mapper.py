from typing import Optional, Dict

# Mapping of categories to departments
CATEGORY_DEPARTMENT_MAPPING = {
    "pothole": "Transportation Services",
    "graffiti": "Public Use Facilities",
    "illegal_sign": "Municipal Licensing and Standards",
    "litter": "Solid Waste Management",
    "needles": "Public Health",
    "parking_complaint": "Police Services (Parking Enforcement)",
    "sidewalk_snow": "Transportation Services",
    "sidewalk_hazard": "Transportation Services",
    "trail_maintenance": "Parks, Forestry and Recreation",
    "property_standards": "Municipal Licensing and Standards",
    "emergency": "Emergency Services",
    "other": "311 General Support"
}

# Ambiguous cases or aliases can be mapped here
CATEGORY_ALIASES = {
    "garbage": "litter",
    "trash": "litter",
    "snow": "sidewalk_snow",
    "ice": "sidewalk_snow",
    "hole": "pothole",
}

def auto_assign_department(category: str, nlu_confidence: float) -> Optional[str]:
    """Assigns department based on category. Falls back to General Support if mapping failed."""
    if not category:
        return None
        
    normalized_category = category.lower().strip()
    
    # Check aliases
    if normalized_category in CATEGORY_ALIASES:
        normalized_category = CATEGORY_ALIASES[normalized_category]
        
    return CATEGORY_DEPARTMENT_MAPPING.get(normalized_category, "311 General Support")
