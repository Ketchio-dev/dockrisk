"""Real building footprints for the demo facilities, from OpenStreetMap via Overpass.

    uv run python -m core.osm_facilities

For each busy in-region city, fetch warehouse/industrial buildings near the city centroid, pick the
largest footprint, and store it as a facility: dock polygon = the building outline, property polygon
= the outline buffered ~60 m. Labels are anonymized ("Stoney Creek DC-1"), never customer names.
source='osm', confidence 0.7 — real geometry, but not verified against the carrier's actual customer.
"""
from __future__ import annotations

import json
import time

import httpx
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union

from core.db import DB_PATH, connect, init_schema

OVERPASS = "https://overpass-api.de/api/interpreter"
UA = "roadstar-hackathon-dispatch/0.1"
RADIUS_M = 6000
PER_CITY = 1


def query(lat: float, lon: float) -> list[dict]:
    q = f"""[out:json][timeout:25];
    ( way["building"~"warehouse|industrial"](around:{RADIUS_M},{lat},{lon});
      way["landuse"="industrial"]["building"](around:{RADIUS_M},{lat},{lon}); );
    out body geom 60;"""
    r = httpx.post(OVERPASS, data={"data": q}, headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    return r.json().get("elements", [])


def main():
    conn = connect(DB_PATH)
    init_schema(conn)
    cur = conn.cursor()
    cities = cur.execute("""SELECT city, COUNT(*) n FROM (
                              SELECT UPPER(TRIM(orig_city)) city FROM orders WHERE in_region=1 UNION ALL SELECT UPPER(TRIM(dest_city)) FROM orders WHERE in_region=1)
                            GROUP BY city ORDER BY n DESC LIMIT 12""").fetchall()
    added = 0
    for c in cities:
        p = cur.execute("SELECT lat, lon FROM places WHERE key=? AND kind='city'", (f"{c['city']}, ON",)).fetchone()
        if not p:
            continue
        if cur.execute("SELECT 1 FROM facilities WHERE city=? AND source='osm'", (c["city"],)).fetchone():
            continue
        try:
            els = query(p["lat"], p["lon"])
        except Exception as e:
            print(f"{c['city']}: overpass failed ({e})", flush=True)
            time.sleep(3)
            continue
        polys = []
        for el in els:
            pts = [(g["lon"], g["lat"]) for g in el.get("geometry", [])]
            if len(pts) >= 4:
                poly = Polygon(pts)
                if poly.is_valid and poly.area > 0:
                    polys.append((poly.area, poly, el.get("tags", {})))
        polys.sort(key=lambda x: -x[0])
        for i, (area, poly, tags) in enumerate(polys[:PER_CITY]):
            # property = building buffered ~60 m (degrees: lat 1e-5 ~ 1.1 m); dock = building outline
            prop = poly.buffer(0.00055)
            cen = poly.centroid
            name = f"{c['city'].title()} DC-{i + 1}"
            cur.execute("""INSERT INTO facilities (name, customer, city, prov, lat, lon, property_polygon_geojson, dock_polygon_geojson, gate_lat, gate_lon, source, confidence)
                           VALUES (?,?,?,?,?,?,?,?,?,?,'osm',0.7)""",
                        (name, None, c["city"], "ON", cen.y, cen.x, json.dumps(mapping(prop)), json.dumps(mapping(poly)),
                         prop.exterior.coords[0][1], prop.exterior.coords[0][0]))
            added += 1
            print(f"{name}: building {area * 1.2e10:.0f} m2 ({tags.get('building')}, {tags.get('name', 'unnamed')}) at {cen.y:.4f},{cen.x:.4f}", flush=True)
        time.sleep(1.5)
    conn.commit()
    print(f"added {added} OSM-footprint facilities")


if __name__ == "__main__":
    main()
