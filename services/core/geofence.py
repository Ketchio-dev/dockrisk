"""Facility geofences with debounce. Polygons come from the facilities table (GeoJSON); facilities that
only have a centroid get a radius fallback and are marked low-confidence — that is simulation geometry,
not dock evidence."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime

from shapely.geometry import Point, shape

PROPERTY_RADIUS_M = 400.0
DOCK_RADIUS_M = 150.0
M_PER_DEG_LAT = 111_320.0


@dataclass
class Fence:
    facility_id: int
    name: str
    zone: str                 # property | dock
    geom: object              # shapely geometry (lon, lat)
    confidence: float
    source: str


@dataclass
class GeofenceEvent:
    ts: datetime
    unit: str
    driver_name: str | None
    facility_id: int
    facility_name: str
    zone: str
    event_type: str           # enter | exit
    lat: float
    lon: float
    confirm_pings: int
    confidence: float


def _circle(lat: float, lon: float, radius_m: float):
    import math
    dlat = radius_m / M_PER_DEG_LAT
    dlon = radius_m / (M_PER_DEG_LAT * math.cos(math.radians(lat)))
    # shapely buffer in degrees is anisotropic; scale via an ellipse approximation
    from shapely.affinity import scale
    return scale(Point(lon, lat).buffer(1.0, resolution=32), xfact=dlon, yfact=dlat, origin=(lon, lat))


class GeofenceIndex:
    def __init__(self, facility_rows):
        self.fences: list[Fence] = []
        for f in facility_rows:
            fid, name, conf, src = f["facility_id"], f["name"], f["confidence"] or 0.3, f["source"]
            if f["property_polygon_geojson"]:
                self.fences.append(Fence(fid, name, "property", shape(json.loads(f["property_polygon_geojson"])), conf, src))
            elif f["lat"] is not None:
                self.fences.append(Fence(fid, name, "property", _circle(f["lat"], f["lon"], PROPERTY_RADIUS_M), min(conf, 0.3), "radius"))
            if f["dock_polygon_geojson"]:
                self.fences.append(Fence(fid, name, "dock", shape(json.loads(f["dock_polygon_geojson"])), conf, src))
            elif f["lat"] is not None:
                self.fences.append(Fence(fid, name, "dock", _circle(f["lat"], f["lon"], DOCK_RADIUS_M), min(conf, 0.3), "radius"))

    def locate(self, lat: float, lon: float) -> list[Fence]:
        p = Point(lon, lat)
        return [f for f in self.fences if f.geom.contains(p)]


@dataclass
class _UnitState:
    inside: dict[tuple[int, str], bool] = field(default_factory=dict)
    streak: dict[tuple[int, str], int] = field(default_factory=dict)   # consecutive pings disagreeing with `inside`
    last_ts: datetime | None = None


class GeofenceTracker:
    """Emits enter/exit only after `confirm` consecutive pings agree (jitter tolerance), ignores
    out-of-order pings, and suppresses duplicate transitions."""

    def __init__(self, index: GeofenceIndex, confirm: int = 3):
        self.index = index
        self.confirm = confirm
        self.units: dict[str, _UnitState] = {}

    def update(self, unit: str, driver_name: str | None, ts: datetime, lat: float, lon: float) -> list[GeofenceEvent]:
        st = self.units.setdefault(unit, _UnitState())
        if st.last_ts and ts < st.last_ts:
            return []  # out of order: ignore, do not rewrite history
        st.last_ts = ts
        now_inside = {(f.facility_id, f.zone): f for f in self.index.locate(lat, lon)}
        events: list[GeofenceEvent] = []
        keys = set(now_inside) | set(st.inside)
        for key in keys:
            was = st.inside.get(key, False)
            is_in = key in now_inside
            if was == is_in:
                st.streak[key] = 0
                continue
            st.streak[key] = st.streak.get(key, 0) + 1
            if st.streak[key] >= self.confirm:
                st.inside[key] = is_in
                st.streak[key] = 0
                f = now_inside.get(key) or next(x for x in self.index.fences if (x.facility_id, x.zone) == key)
                events.append(GeofenceEvent(ts, unit, driver_name, key[0], f.name, key[1], "enter" if is_in else "exit",
                                            lat, lon, self.confirm, f.confidence))
        # property before dock on enter, dock before property on exit — keeps the visit state machine monotone
        events.sort(key=lambda e: (0 if e.event_type == "enter" else 1, 0 if (e.zone == "property") == (e.event_type == "enter") else 1))
        return events

    def reset(self):
        self.units.clear()
