from datetime import datetime, timedelta

# SLA hours per NLU category key (must match category_mappings.json keys)
SLA_HOURS: dict[str, int] = {
    "needles":            4,
    "sidewalk_hazard":    24,
    "sidewalk_snow":      24,
    "parking_complaint":  24,
    "litter":             48,
    "pothole":            72,
    "graffiti":           120,
    "illegal_sign":       120,
    "property_standards": 168,
    "trail_maintenance":  168,
    "other":              120,
}

# Alias map: raw DB category strings → SLA key
_RAW_TO_KEY: dict[str, str] = {
    "graffiti":                              "graffiti",
    "illegal_sign":                          "illegal_sign",
    "illegal sign":                          "illegal_sign",
    "litter":                                "litter",
    "litter in playground, park or trail":   "litter",
    "litter in a playground":                "litter",
    "litter in playground":                  "litter",
    "needles":                               "needles",
    "syringes":                              "needles",
    "parking_complaint":                     "parking_complaint",
    "parking complaint":                     "parking_complaint",
    "parking":                               "parking_complaint",
    "property_standards":                    "property_standards",
    "property standards":                    "property_standards",
    "property standards complaint":          "property_standards",
    "pothole":                               "pothole",
    "potholes":                              "pothole",
    "sidewalk_snow":                         "sidewalk_snow",
    "sidewalk snow":                         "sidewalk_snow",
    "sidewalk snow clearing":                "sidewalk_snow",
    "sidewalk_hazard":                       "sidewalk_hazard",
    "sidewalk hazard":                       "sidewalk_hazard",
    "sidewalk trip hazard":                  "sidewalk_hazard",
    "trail_maintenance":                     "trail_maintenance",
    "trail maintenance":                     "trail_maintenance",
    "trail surface maintenance":             "trail_maintenance",
    "other":                                 "other",
}


def get_sla_hours(category: str | None) -> int:
    """Return SLA hours for a raw DB category string. Defaults to 120h (Other)."""
    if not category:
        return SLA_HOURS["other"]
    key = (category or "").strip().lower().replace("_", " ")
    sla_key = _RAW_TO_KEY.get(key)
    if sla_key is None:
        # prefix fallback
        for alias, mapped in _RAW_TO_KEY.items():
            if key.startswith(alias):
                sla_key = mapped
                break
    return SLA_HOURS.get(sla_key or "other", SLA_HOURS["other"])


def compute_sla_deadline(category: str | None, created_at: datetime | None = None) -> datetime:
    """Return the SLA deadline datetime for a ticket."""
    base = created_at or datetime.utcnow()
    return base + timedelta(hours=get_sla_hours(category))
