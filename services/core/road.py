"""Road events on a leg: how much longer a drive takes because of the closures between here and there.

A closure is a circle (lat, lon, radius_km) with a speed factor (0.45 = traffic moves at 45 % of normal).
A leg is the straight line between two points, which is what every other estimate in the engine uses
(great-circle x 1.25). The extra time is the length of the leg inside each circle, driven at the slowed speed,
minus the same length at normal speed. Overlapping circles count once at the worst factor.

This is the missing half of the brief's bonus question: the dock queue eats the driver's day, and the 401
closure eats what is left. Both are hours; both go into the same forward check."""
from __future__ import annotations

import math
from dataclasses import dataclass

KM_PER_DEG_LAT = 111.32


@dataclass(frozen=True)
class Closure:
    id: str
    lat: float
    lon: float
    radius_km: float
    speed_factor: float          # 0 < f <= 1; 1 means no slowdown
    title: str = ""


def _to_xy(lat: float, lon: float, lat0: float) -> tuple[float, float]:
    """Local flat projection in km around latitude lat0: fine at the size of Southern Ontario."""
    return (lon * KM_PER_DEG_LAT * math.cos(math.radians(lat0)), lat * KM_PER_DEG_LAT)


def _chord_inside(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], r: float) -> tuple[float, float]:
    """The parameter interval [t0, t1] of segment a->b (t in [0,1]) inside the circle (c, r); empty -> (0, 0)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    fx, fy = a[0] - c[0], a[1] - c[1]
    A = dx * dx + dy * dy
    if A == 0:
        return (0.0, 1.0) if fx * fx + fy * fy <= r * r else (0.0, 0.0)
    B = 2 * (fx * dx + fy * dy)
    C = fx * fx + fy * fy - r * r
    disc = B * B - 4 * A * C
    if disc <= 0:
        return (0.0, 0.0)
    s = math.sqrt(disc)
    t0, t1 = max(0.0, (-B - s) / (2 * A)), min(1.0, (-B + s) / (2 * A))
    return (t0, t1) if t1 > t0 else (0.0, 0.0)


def leg_delay(a_lat: float, a_lon: float, b_lat: float, b_lon: float, closures: list[Closure], kmh: float, road_factor: float = 1.25) -> dict:
    """Extra hours on the leg a->b at nominal `kmh` because of `closures`, and which closures touched it.

    Returns {"extra_h": float, "affected_km": float, "closures": [Closure, ...]} with the closures that intersect
    the leg, worst first. The leg is straight-line x road_factor, the same estimate the rest of the engine uses."""
    if not closures or None in (a_lat, a_lon, b_lat, b_lon):
        return {"extra_h": 0.0, "affected_km": 0.0, "closures": []}
    lat0 = (a_lat + b_lat) / 2
    a, b = _to_xy(a_lat, a_lon, lat0), _to_xy(b_lat, b_lon, lat0)
    length = math.hypot(b[0] - a[0], b[1] - a[1]) * road_factor
    # slowest factor per parameter interval: merge intervals, taking the min factor where they overlap
    hits: list[tuple[float, float, float, Closure]] = []
    for c in closures:
        if not (0 < c.speed_factor < 1):
            continue
        t0, t1 = _chord_inside(a, b, _to_xy(c.lat, c.lon, lat0), c.radius_km)
        if t1 > t0:
            hits.append((t0, t1, c.speed_factor, c))
    if not hits:
        return {"extra_h": 0.0, "affected_km": 0.0, "closures": []}
    # sweep the breakpoints; in each elementary interval the factor is the min over covering closures
    cuts = sorted({t for h in hits for t in (h[0], h[1])})
    extra_h = 0.0
    affected = 0.0
    for lo, hi in zip(cuts, cuts[1:]):
        f = min((h[2] for h in hits if h[0] <= lo and h[1] >= hi), default=1.0)
        if f < 1:
            km = (hi - lo) * length
            affected += km
            extra_h += km / (kmh * f) - km / kmh
    touched = sorted({h[3] for h in hits}, key=lambda c: c.speed_factor)
    return {"extra_h": round(extra_h, 3), "affected_km": round(affected, 1), "closures": touched}
