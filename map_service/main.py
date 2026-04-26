"""
Map Service — geocoding + heatmap data endpoints.

Endpoints:
  POST /api/map/geocode   → geocode all tickets missing lat/lng (1 req/sec Nominatim)
  GET  /api/map/heatmap   → return tickets with lat/lng for heatmap rendering
  GET  /api/map/ui        → standalone heatmap test UI (HTML)
"""

import time
import logging
import requests
from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from db_service.main import get_db, Ticket

router = APIRouter()
logger = logging.getLogger("map_service")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "INSIGHT311/1.0 (insight311-showcase)"}

# KWC bounding box — post-filter to reject out-of-area results
KWC_LAT_MIN, KWC_LAT_MAX = 43.32, 43.57
KWC_LNG_MIN, KWC_LNG_MAX = -80.65, -80.28

# Try these city suffixes in order until one returns a point inside KWC
KWC_CITIES = [
    "Waterloo, Ontario, Canada",
    "Kitchener, Ontario, Canada",
    "Cambridge, Ontario, Canada",
]

# Map center for the test UI
MAP_CENTER = [43.4516, -80.4925]
MAP_ZOOM   = 12

# Minimum word count to attempt geocoding (skip garbage like "that", "Sunday")
_MIN_WORDS = 2


def _run_migration(db: Session):
    """Add lat/lng columns if they don't exist yet (PostgreSQL safe)."""
    try:
        db.execute(text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS lat FLOAT"))
        db.execute(text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS lng FLOAT"))
        db.commit()
    except Exception:
        db.rollback()


def _in_kwc(lat: float, lng: float) -> bool:
    return KWC_LAT_MIN <= lat <= KWC_LAT_MAX and KWC_LNG_MIN <= lng <= KWC_LNG_MAX


def geocode_address(address: str):
    """Try KWC cities in order; return first (lat, lng) within the KWC bounds."""
    if len(address.split()) < _MIN_WORDS:
        return None, None

    for city in KWC_CITIES:
        try:
            resp = requests.get(
                NOMINATIM_URL,
                params={
                    "q":            f"{address}, {city}",
                    "format":       "json",
                    "limit":        1,
                    "countrycodes": "ca",
                },
                headers=NOMINATIM_HEADERS,
                timeout=10,
            )
            data = resp.json()
            if data:
                lat, lng = float(data[0]["lat"]), float(data[0]["lon"])
                if _in_kwc(lat, lng):
                    return lat, lng
        except Exception as exc:
            logger.warning("Geocode failed for %r in %s: %s", address, city, exc)
        time.sleep(1.1)  # Nominatim 1 req/sec

    return None, None


@router.post("/geocode")
def geocode_tickets(db: Session = Depends(get_db)):
    """Geocode all tickets that have a location string but no lat/lng yet."""
    _run_migration(db)

    tickets = (
        db.query(Ticket)
        .filter(Ticket.location.isnot(None), Ticket.location != "", Ticket.lat.is_(None))
        .all()
    )

    processed, failed = 0, 0
    for ticket in tickets:
        lat, lng = geocode_address(ticket.location)
        if lat is not None:
            ticket.lat = lat
            ticket.lng = lng
            db.commit()
            processed += 1
            logger.info("Geocoded %s → (%.4f, %.4f)", ticket.ticket_id, lat, lng)
        else:
            failed += 1
            logger.warning("Failed to geocode %s: %r", ticket.ticket_id, ticket.location)
        time.sleep(1.1)  # Nominatim rate limit: 1 request/second

    return {"processed": processed, "failed": failed, "total": len(tickets)}


@router.get("/debug/locations")
def debug_locations(db: Session = Depends(get_db)):
    """Show all location strings + current lat/lng in DB."""
    tickets = db.query(Ticket).filter(Ticket.location.isnot(None), Ticket.location != "").all()
    return [
        {"ticket_id": t.ticket_id, "location": t.location, "lat": t.lat, "lng": t.lng}
        for t in tickets
    ]


@router.get("/debug/geocode-test")
def debug_geocode_test(address: str, db: Session = Depends(get_db)):
    """Test geocoding a single address string. Usage: ?address=123+King+St"""
    lat, lng = geocode_address(address)
    return {"address": address, "query": CITY_PREFIX + address, "lat": lat, "lng": lng}


@router.post("/reset")
def reset_geocoding(db: Session = Depends(get_db)):
    """Clear all lat/lng values so geocoding can be re-run with updated settings."""
    count = db.query(Ticket).filter(Ticket.lat.isnot(None)).update({"lat": None, "lng": None})
    db.commit()
    return {"reset": count, "message": "All coordinates cleared. Run /geocode again."}


@router.get("/heatmap")
def get_heatmap(db: Session = Depends(get_db)):
    """Return all geocoded tickets as heatmap point data."""
    _run_migration(db)

    tickets = (
        db.query(Ticket)
        .filter(Ticket.lat.isnot(None), Ticket.lng.isnot(None))
        .all()
    )

    points = [
        {
            "ticket_id": t.ticket_id,
            "location":  t.location or "",
            "category":  t.category or "Unknown",
            "status":    t.ticket_status or "",
            "severity":  t.severity or "",
            "lat":       t.lat,
            "lng":       t.lng,
        }
        for t in tickets
    ]

    return {"total": len(points), "points": points}


@router.get("/ui", response_class=HTMLResponse)
def heatmap_ui():
    """Serve standalone heatmap test UI."""
    html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>INSIGHT311 — Complaint Heatmap</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; height: 100vh; display: flex; flex-direction: column; }
    header { padding: 14px 20px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 16px; }
    header h1 { font-size: 18px; font-weight: 700; color: #f1f5f9; }
    header span { font-size: 13px; color: #94a3b8; }
    #controls { padding: 10px 16px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    button { padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
    #geocode-btn { background: #f59e0b; color: #1c1917; }
    #refresh-btn { background: #6366f1; color: white; }
    #status { font-size: 13px; color: #94a3b8; }
    #map { flex: 1; }
    #info-panel { position: absolute; bottom: 20px; right: 16px; z-index: 1000; background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px 16px; min-width: 220px; font-size: 13px; }
    #info-panel h3 { font-size: 14px; color: #f1f5f9; margin-bottom: 8px; }
    .info-row { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; border-bottom: 1px solid #334155; }
    .info-row:last-child { border-bottom: none; }
    .label { color: #94a3b8; }
    .value { color: #e2e8f0; font-weight: 600; }
  </style>
</head>
<body>
  <header>
    <h1>INSIGHT311 Complaint Heatmap</h1>
    <span id="point-count">Loading…</span>
  </header>
  <div id="controls">
    <button id="geocode-btn" onclick="runGeocode()">⚙ Geocode Missing Tickets</button>
    <button id="refresh-btn" onclick="loadHeatmap()">↻ Refresh Map</button>
    <span id="status"></span>
  </div>
  <div id="map"></div>
  <div id="info-panel">
    <h3>Legend</h3>
    <div class="info-row"><span class="label">🔵 Low density</span></div>
    <div class="info-row"><span class="label">🟡 Medium density</span></div>
    <div class="info-row"><span class="label">🔴 High density</span></div>
    <div class="info-row"><span class="label">Total Points</span><span class="value" id="total-val">—</span></div>
  </div>

  <script>
    const API = "http://localhost:8311/api/map";
    const map = L.map("map").setView([43.4516, -80.4925], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    let heatLayer = null;
    let markerLayer = L.layerGroup().addTo(map);

    async function loadHeatmap() {
      document.getElementById("status").textContent = "Loading…";
      try {
        const res = await fetch(`${API}/heatmap`);
        const data = await res.json();
        const points = data.points || [];

        document.getElementById("point-count").textContent = `${points.length} geocoded tickets`;
        document.getElementById("total-val").textContent = points.length;

        // Remove old layers
        if (heatLayer) map.removeLayer(heatLayer);
        markerLayer.clearLayers();

        if (points.length === 0) {
          document.getElementById("status").textContent = "No geocoded tickets yet. Click 'Geocode Missing Tickets' first.";
          return;
        }

        // Heatmap layer
        const heatPoints = points.map(p => [p.lat, p.lng, 1]);
        heatLayer = L.heatLayer(heatPoints, {
          radius: 35,
          blur: 25,
          maxZoom: 16,
          gradient: { 0.2: "blue", 0.5: "yellow", 0.8: "orange", 1.0: "red" },
        }).addTo(map);

        // Marker layer (click for details)
        points.forEach(p => {
          const marker = L.circleMarker([p.lat, p.lng], {
            radius: 5, color: "#6366f1", fillColor: "#818cf8", fillOpacity: 0.7, weight: 1,
          });
          marker.bindPopup(`
            <b>${p.ticket_id}</b><br>
            <b>Category:</b> ${p.category}<br>
            <b>Status:</b> ${p.status}<br>
            <b>Severity:</b> ${p.severity || "—"}<br>
            <b>Location:</b> ${p.location}
          `);
          marker.addTo(markerLayer);
        });

        // Auto-fit map to points
        const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40] });

        document.getElementById("status").textContent = `Loaded ${points.length} points.`;
      } catch (err) {
        document.getElementById("status").textContent = "Error: " + err.message;
      }
    }

    async function runGeocode() {
      const btn = document.getElementById("geocode-btn");
      btn.disabled = true;
      btn.textContent = "⏳ Geocoding…";
      document.getElementById("status").textContent = "Geocoding in progress (1 req/sec)…";
      try {
        const res = await fetch(`${API}/geocode`, { method: "POST" });
        const data = await res.json();
        document.getElementById("status").textContent =
          `Done: ${data.processed} geocoded, ${data.failed} failed out of ${data.total} tickets.`;
        await loadHeatmap();
      } catch (err) {
        document.getElementById("status").textContent = "Geocode error: " + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = "⚙ Geocode Missing Tickets";
      }
    }

    loadHeatmap();
  </script>
</body>
</html>"""
    return HTMLResponse(content=html)
