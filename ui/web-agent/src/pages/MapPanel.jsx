// src/pages/MapPanel.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const KWC_CENTER = [43.4516, -80.4925];

// Canonical 11 NLU-trained category display names (fixed order)
const CANONICAL_DISPLAY = [
  "Graffiti",
  "Illegal Sign",
  "Litter in Playground, Park or Trail",
  "Needles",
  "Parking Complaint",
  "Property Standards Complaint",
  "Pothole",
  "Sidewalk Snow Clearing",
  "Sidewalk Trip Hazard",
  "Trail Surface Maintenance",
  "Other",
];

// Map any DB category string → canonical display name
const _ALIAS_MAP = {
  "graffiti":                          "Graffiti",
  "illegal_sign":                      "Illegal Sign",
  "illegal sign":                      "Illegal Sign",
  "litter":                            "Litter in Playground, Park or Trail",
  "litter in playground, park or trail": "Litter in Playground, Park or Trail",
  "litter in a playground":            "Litter in Playground, Park or Trail",
  "litter in playground":              "Litter in Playground, Park or Trail",
  "litter in park":                    "Litter in Playground, Park or Trail",
  "litter in trail":                   "Litter in Playground, Park or Trail",
  "needles":                           "Needles",
  "syringes":                          "Needles",
  "drug paraphernalia":                "Needles",
  "parking_complaint":                 "Parking Complaint",
  "parking complaint":                 "Parking Complaint",
  "parking":                           "Parking Complaint",
  "property_standards":                "Property Standards Complaint",
  "property standards":                "Property Standards Complaint",
  "property standards complaint":      "Property Standards Complaint",
  "pothole":                           "Pothole",
  "potholes":                          "Pothole",
  "road damage":                       "Pothole",
  "sidewalk_snow":                     "Sidewalk Snow Clearing",
  "sidewalk snow":                     "Sidewalk Snow Clearing",
  "sidewalk snow clearing":            "Sidewalk Snow Clearing",
  "sidewalk_hazard":                   "Sidewalk Trip Hazard",
  "sidewalk hazard":                   "Sidewalk Trip Hazard",
  "sidewalk trip hazard":              "Sidewalk Trip Hazard",
  "trail_maintenance":                 "Trail Surface Maintenance",
  "trail maintenance":                 "Trail Surface Maintenance",
  "trail surface maintenance":         "Trail Surface Maintenance",
  "other":                             "Other",
};

// Normalise any DB category value → one of the 11 canonical display names
const normCat = s => {
  const key = (s || "").trim().toLowerCase().replace(/_/g, " ");
  if (_ALIAS_MAP[key]) return _ALIAS_MAP[key];
  // prefix/substring fallback (catches "litter in a playground…" variants)
  for (const [alias, canon] of Object.entries(_ALIAS_MAP)) {
    if (key.startsWith(alias)) return canon;
  }
  return "Other";
};

const CAT_COLORS = [
  "#6366f1","#ec4899","#14b8a6","#f59e0b","#10b981",
  "#3b82f6","#ef4444","#8b5cf6","#f97316","#06b6d4","#84cc16",
];

function heatColor(ratio) {
  if (ratio >= 0.85) return "#ef4444";
  if (ratio >= 0.65) return "#f97316";
  if (ratio >= 0.40) return "#eab308";
  if (ratio >= 0.20) return "#06b6d4";
  return "#3b82f6";
}

export default function MapPanel({ isFR = false }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const heatGroupRef = useRef(null);
  const markGroupRef = useRef(null);
  const allPointsRef  = useRef([]);        // full unfiltered dataset
  const rawPointsRef  = useRef([]);        // filtered dataset (used by zoom handler)
  const ratioMapRef   = useRef(new Map()); // ticket_id → density ratio (always from ALL points)

  const [status,       setStatus]       = useState(isFR ? "Chargement…" : "Loading…");
  const [pointCount,   setPointCount]   = useState(null);
  const [geocoding,    setGeocoding]    = useState(false);
  const [categories,   setCategories]   = useState([]);   // sorted unique categories
  const [selectedCats, setSelectedCats] = useState(null); // null = All; Set = filter

  // ── Recompute density ratios from ALL points (call on load + zoom) ────────
  const recomputeRatios = useCallback((allPoints, zoom) => {
    if (!allPoints.length) return;
    const sigma = 0.009 * Math.pow(2, 12 - zoom);
    const densities = allPoints.map(p =>
      allPoints.reduce((sum, q) => {
        const d2 = (q.lat - p.lat) ** 2 + (q.lng - p.lng) ** 2;
        return sum + Math.exp(-0.5 * d2 / (sigma * sigma));
      }, 0)
    );
    const maxD = Math.max(...densities, 1);
    const map  = new Map();
    allPoints.forEach((p, i) => map.set(p.ticket_id, Math.min(1, densities[i] / maxD)));
    ratioMapRef.current = map;
  }, []);

  // ── Render heat blobs for a subset — colours come from pre-computed ratios ─
  const renderHeat = useCallback((points) => {
    if (!heatGroupRef.current) return;
    heatGroupRef.current.clearLayers();
    if (!points.length) return;

    points.forEach(p => {
      const ratio   = ratioMapRef.current.get(p.ticket_id) ?? 0;
      const col     = heatColor(ratio);
      const radius  = Math.round(13 + ratio * 37);
      const opacity = 0.55 + ratio * 0.45;

      L.circleMarker([p.lat, p.lng], {
        pane: "heatPane", radius: radius + 16,
        color: "none", fillColor: col,
        fillOpacity: opacity * 0.35, interactive: false,
      }).addTo(heatGroupRef.current);

      L.circleMarker([p.lat, p.lng], {
        pane: "heatPane", radius,
        color: "none", fillColor: col,
        fillOpacity: opacity, interactive: false,
      }).addTo(heatGroupRef.current);
    });
  }, []);

  // ── Redraw markers for a given point list ─────────────────────────────────
  const renderMarkers = useCallback((points) => {
    if (!markGroupRef.current) return;
    markGroupRef.current.clearLayers();
    points.forEach(p => {
      L.circleMarker([p.lat, p.lng], {
        pane: "markerPane", radius: 4,
        color: "#1e293b", fillColor: "#fff", fillOpacity: 0.9, weight: 1.5,
      })
        .bindPopup(
          `<b>${p.ticket_id}</b><br>` +
          `<b>${isFR ? "Catégorie" : "Category"}:</b> ${normCat(p.category)}<br>` +
          `<b>${isFR ? "Statut" : "Status"}:</b> ${p.status}<br>` +
          `<b>${isFR ? "Sévérité" : "Severity"}:</b> ${p.severity || "—"}<br>` +
          `<b>${isFR ? "Emplacement" : "Location"}:</b> ${p.location}`
        )
        .addTo(markGroupRef.current);
    });
  }, [isFR]);

  // ── Initial data load ─────────────────────────────────────────────────────
  const loadHeatmap = useCallback(async () => {
    if (!mapRef.current) return;
    setStatus(isFR ? "Chargement des données…" : "Loading data…");
    try {
      const res    = await fetch("/api/map/heatmap");
      const data   = await res.json();
      const points = data.points || [];

      allPointsRef.current = points;
      rawPointsRef.current = points;
      setPointCount(points.length);

      if (points.length === 0) {
        heatGroupRef.current.clearLayers();
        markGroupRef.current.clearLayers();
        setStatus(isFR ? "Aucun point géocodé. Cliquez sur Géocoder." : "No geocoded tickets yet. Click 'Geocode Missing' first.");
        return;
      }

      // Always show the fixed 11 NLU-trained categories (regardless of what's in DB)
      setCategories(CANONICAL_DISPLAY);
      setSelectedCats(null); // reset to "All" on reload

      // Ratios always computed from full dataset
      recomputeRatios(points, mapRef.current.getZoom());
      renderHeat(points);
      renderMarkers(points);

      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      setStatus(isFR ? `${points.length} points chargés.` : `${points.length} points loaded.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }, [isFR, recomputeRatios, renderHeat, renderMarkers]);

  // ── Re-render when category filter changes ────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || allPointsRef.current.length === 0) return;

    const filtered = selectedCats === null
      ? allPointsRef.current
      : allPointsRef.current.filter(p => selectedCats.has(normCat(p.category)));

    rawPointsRef.current = filtered;
    // Ratios stay fixed (full dataset) — only which points are drawn changes
    renderHeat(filtered);
    renderMarkers(filtered);
    setPointCount(filtered.length);
  }, [selectedCats, renderHeat, renderMarkers]);

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(KWC_CENTER, 12);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    map.createPane("heatPane");
    const overlayZ = parseInt(window.getComputedStyle(map.getPane("overlayPane")).zIndex) || 400;
    const heatPane = map.getPane("heatPane");
    heatPane.style.zIndex        = String(overlayZ - 1);
    heatPane.style.filter        = "blur(16px)";
    heatPane.style.opacity       = "0.65";
    heatPane.style.pointerEvents = "none";

    heatGroupRef.current = L.layerGroup().addTo(map);
    markGroupRef.current = L.layerGroup().addTo(map);

    map.on("zoomend", () => {
      if (allPointsRef.current.length > 0) {
        // Recompute ratios from full dataset at new zoom, then redraw filtered subset
        recomputeRatios(allPointsRef.current, map.getZoom());
        renderHeat(rawPointsRef.current);
      }
    });

    loadHeatmap();
    return () => { map.remove(); mapRef.current = null; };
  }, [loadHeatmap, renderHeat, recomputeRatios]);

  // ── Category toggle logic ─────────────────────────────────────────────────
  const toggleCat = useCallback((cat) => {
    setSelectedCats(prev => {
      if (prev === null) {
        // "All" → select only this one
        return new Set([cat]);
      }
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
        // If nothing left, revert to "All"
        return next.size === 0 ? null : next;
      } else {
        next.add(cat);
        return next;
      }
    });
  }, []);

  const selectAll = useCallback(() => setSelectedCats(null), []);

  const isAllSelected = selectedCats === null;

  // ── Geocode ───────────────────────────────────────────────────────────────
  const runGeocode = async () => {
    setGeocoding(true);
    setStatus(isFR ? "Géocodage en cours (1 req/s)…" : "Geocoding in progress (1 req/s)…");
    try {
      const res  = await fetch("/api/map/geocode", { method: "POST" });
      const data = await res.json();
      setStatus(isFR
        ? `Terminé : ${data.processed} géocodés, ${data.failed} échoués sur ${data.total}.`
        : `Done: ${data.processed} geocoded, ${data.failed} failed out of ${data.total}.`);
      await loadHeatmap();
    } catch (err) {
      setStatus(`Geocode error: ${err.message}`);
    } finally {
      setGeocoding(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div id="complaint-map" style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>

      {/* Top controls */}
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderRadius: "10px 10px 0 0", marginBottom: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
            🗺 {isFR ? "Carte des plaintes" : "Complaint Heatmap"}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {isFR
              ? "Densité des signalements civils — Kitchener / Waterloo / Cambridge."
              : "Civil complaint density by area — Kitchener / Waterloo / Cambridge."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {pointCount !== null && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>{pointCount} pts</span>
          )}
          <button className="btn" onClick={loadHeatmap} style={{ fontSize: 12, padding: "7px 14px" }}>
            ↻ {isFR ? "Actualiser" : "Refresh"}
          </button>
          <button className="btn primary" onClick={runGeocode} disabled={geocoding} style={{ fontSize: 12, padding: "7px 14px" }}>
            {geocoding ? "⏳ …" : `⚙ ${isFR ? "Géocoder" : "Geocode Missing"}`}
          </button>
        </div>
      </div>

      {/* Category filter bar */}
      {categories.length > 0 && (
        <div style={{
          background: "#f8fafc", border: "1px solid #e5e7eb", borderTop: "none",
          padding: "7px 14px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginRight: 2, whiteSpace: "nowrap" }}>
            {isFR ? "Catégorie :" : "Category:"}
          </span>

          {/* All button */}
          <button
            onClick={selectAll}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 999, border: "1.5px solid",
              cursor: "pointer", fontWeight: isAllSelected ? 700 : 400,
              background: isAllSelected ? "#1e293b" : "#fff",
              color:      isAllSelected ? "#fff"    : "#374151",
              borderColor: isAllSelected ? "#1e293b" : "#d1d5db",
            }}
          >
            {isFR ? "Tous" : "All"}
          </button>

          {/* Per-category buttons */}
          {categories.map((cat, idx) => {
            const active = !isAllSelected && selectedCats.has(cat);
            const col    = CAT_COLORS[idx % CAT_COLORS.length];
            return (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 999, border: "1.5px solid",
                  cursor: "pointer", fontWeight: active ? 700 : 400,
                  background:  active ? col  : "#fff",
                  color:       active ? "#fff" : "#374151",
                  borderColor: active ? col  : "#d1d5db",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Status bar */}
      <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderTop: "none", padding: "6px 16px", fontSize: 12, color: "#6b7280" }}>
        {status}
      </div>

      {/* Map */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 480, border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 10px 10px" }} />

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, padding: "10px 0", alignItems: "center", fontSize: 12, color: "#6b7280" }}>
        <span style={{ fontWeight: 700, color: "#374151" }}>{isFR ? "Légende" : "Legend"}:</span>
        {[
          ["#3b82f6", isFR ? "Faible"     : "Low"],
          ["#06b6d4", isFR ? "Bas"        : "Low-mid"],
          ["#eab308", isFR ? "Moyen"      : "Medium"],
          ["#f97316", isFR ? "Élevé"      : "High"],
          ["#ef4444", isFR ? "Très élevé" : "Very High"],
        ].map(([col, label]) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: col, display: "inline-block" }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11 }}>
          {isFR ? "Cliquer sur un marqueur pour voir les détails." : "Click a marker for ticket details."}
        </span>
      </div>
    </div>
  );
}
