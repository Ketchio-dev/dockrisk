from datetime import datetime, timedelta

from core.hos import DutyEvent
from core.matching import rank_candidates

T0 = datetime(2026, 9, 8, 12, 0)


def fresh(hours_used=2.0):
    return [DutyEvent(T0 - timedelta(days=20), "off"), DutyEvent(T0 - timedelta(hours=hours_used + 10), "off"), DutyEvent(T0 - timedelta(hours=hours_used), "driving")]


def test_ranking_prefers_close_legal_driver_and_explains_blockers():
    load = {"bill_number": "1", "orig_lat": 42.98, "orig_lon": -81.25, "dest_lat": 43.52, "dest_lon": -79.88,
            "pickup_by_end": T0 + timedelta(hours=1, minutes=30), "load_type": "Dry Van", "weight_lbs": 30000}
    cands = [
        {"driver_name": "near", "unit": "A", "lat": 43.13, "lon": -80.75, "cycle": 1, "trailer_type": "Dry Van", "trailer_capacity_lbs": 44500},
        {"driver_name": "far", "unit": "B", "lat": 43.85, "lon": -79.02, "cycle": 1, "trailer_type": "Dry Van", "trailer_capacity_lbs": 44500},
        {"driver_name": "tired", "unit": "C", "lat": 43.13, "lon": -80.75, "cycle": 1, "trailer_type": "Dry Van", "trailer_capacity_lbs": 44500},
        {"driver_name": "reefer", "unit": "D", "lat": 43.13, "lon": -80.75, "cycle": 1, "trailer_type": "Reefer", "trailer_capacity_lbs": 44500},
        {"driver_name": "small", "unit": "E", "lat": 43.13, "lon": -80.75, "cycle": 1, "trailer_type": "Dry Van", "trailer_capacity_lbs": 20000},
    ]
    logs = {"near": fresh(2), "far": fresh(2), "tired": fresh(12.5), "reefer": fresh(2), "small": fresh(2)}
    r = rank_candidates(T0, load, cands, logs)
    by = {x["driver_name"]: x for x in r}
    assert r[0]["driver_name"] == "near" and by["near"]["eligible"]
    assert not by["far"]["eligible"] and any("cannot reach pickup" in b for b in by["far"]["blockers"])
    assert not by["tired"]["eligible"] and any(b.startswith("HOS:") for b in by["tired"]["blockers"])
    assert not by["reefer"]["eligible"] and any("trailer" in b for b in by["reefer"]["blockers"])
    assert not by["small"]["eligible"] and any("exceeds trailer capacity" in b for b in by["small"]["blockers"])


def test_no_duty_history_is_a_blocker_not_a_guess():
    load = {"bill_number": "1", "orig_lat": 42.98, "orig_lon": -81.25, "dest_lat": 43.52, "dest_lon": -79.88, "pickup_by_end": None}
    r = rank_candidates(T0, load, [{"driver_name": "x", "unit": "X", "lat": 43.0, "lon": -81.2, "cycle": 1}], {})
    assert not r[0]["eligible"] and "no duty history" in r[0]["blockers"][0]
