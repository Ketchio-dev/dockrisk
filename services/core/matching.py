"""Next-load rescue: the detained driver had a next pickup; who can take it without a new HOS,
trailer or appointment failure? Explicit eligibility filters and a ranked list with reasons.
No optimizer — the judges see reasons, not objective values."""
from __future__ import annotations

import math
from datetime import datetime, timedelta

from core.hos import DutyEvent, PlanStep, check_plan

AVG_KMH = 75.0
SERVICE_H = 0.75


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    if None in (lat1, lon1, lat2, lon2):
        return float("inf")
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def rank_candidates(now: datetime, load: dict, candidates: list[dict], duty_logs: dict[str, list[DutyEvent]],
                    exclude: set[str] = frozenset()) -> list[dict]:
    """load: {bill_number, orig_lat, orig_lon, dest_lat, dest_lon, pickup_by_end, load_type, weight_lbs, distance_km}
    candidates: [{driver_name, unit, lat, lon, status, cycle, trailer_type, trailer_capacity_lbs, busy_until}]"""
    out = []
    for c in candidates:
        if c["driver_name"] in exclude:
            continue
        reasons, hard_fail = [], []
        dead_km = haversine_km(c.get("lat"), c.get("lon"), load.get("orig_lat"), load.get("orig_lon"))
        if dead_km == float("inf"):
            hard_fail.append("no known position")
            dead_km = 9999
        dead_km = dead_km * 1.25 if dead_km < 9000 else dead_km   # same road factor as the loaded leg
        dead_h = dead_km / AVG_KMH
        # line-haul estimate: great-circle x 1.25 road factor. The export's DISTANCE is trip-level and often multi-stop.
        gc = haversine_km(load.get("orig_lat"), load.get("orig_lon"), load.get("dest_lat"), load.get("dest_lon"))
        loaded_km = gc * 1.25 if gc != float("inf") else (load.get("distance_km") or 200)
        loaded_h = loaded_km / AVG_KMH
        if c.get("status") in ("VACATION", "OFF", "SICK"):
            hard_fail.append(f"driver status {c['status']}")
        if c.get("busy_until") and c["busy_until"] > now:
            hard_fail.append(f"busy until {c['busy_until'].strftime('%H:%M')}")
        lt, tt = (load.get("load_type") or "").lower(), (c.get("trailer_type") or "").lower()
        if lt and tt and lt.split()[0] not in tt:
            hard_fail.append(f"trailer {c['trailer_type']} vs load {load['load_type']}")
        else:
            reasons.append(f"trailer {c.get('trailer_type') or 'unknown'} ok")
        cap = c.get("trailer_capacity_lbs")
        if cap and load.get("weight_lbs") and load["weight_lbs"] > cap:
            hard_fail.append(f"{int(load['weight_lbs'])} lb exceeds trailer capacity {int(cap)} lb")
        eta = now + timedelta(hours=dead_h)
        pb = load.get("pickup_by_end")
        if pb and eta > pb:
            hard_fail.append(f"cannot reach pickup by {pb.strftime('%H:%M')} (ETA {eta.strftime('%H:%M')})")
        else:
            reasons.append(f"deadhead {dead_km:.0f} km, ETA {eta.strftime('%H:%M')}" + (f" before {pb.strftime('%H:%M')}" if pb else ""))
        plan = [PlanStep("driving", dead_h, "deadhead"), PlanStep("on_duty", SERVICE_H, "load"),
                PlanStep("driving", loaded_h, "line haul"), PlanStep("on_duty", SERVICE_H, "unload")]
        log = duty_logs.get(c["driver_name"])
        if log:
            f = check_plan(log, now, plan, c.get("cycle") or 1)
            if not f.feasible:
                hard_fail.append(f"HOS: {f.first_violation} breaks at '{f.at_step}' (margin {f.margin_h:+.1f} h)")
            else:
                reasons.append(f"HOS ok, {f.margin_h:.1f} h buffer after delivery ({f.binding})")
            margin = f.margin_h
        else:
            hard_fail.append("no duty history; HOS unknown")
            margin = -99
        out.append({"driver_name": c["driver_name"], "unit": c.get("unit"), "eligible": not hard_fail,
                    "deadhead_km": round(dead_km, 1), "eta": eta.isoformat(sep=" "), "hos_margin_h": margin,
                    "reasons": reasons, "blockers": hard_fail,
                    "score": (0 if hard_fail else 1) * 1000 - dead_km + 10 * max(0, min(margin, 5))})
    out.sort(key=lambda x: -x["score"])
    return out
