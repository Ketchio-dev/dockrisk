from datetime import datetime, timedelta

from core.hos import DutyEvent
from core.matching import rank_candidates
from core.road import Closure

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


def test_a_closure_on_the_deadhead_can_turn_a_reachable_pickup_into_a_missed_window():
    # pickup in London, window closes in 65 minutes; the candidate sits in Woodstock, ~45 min away on a clear road
    load = {"bill_number": "1", "orig_lat": 42.98, "orig_lon": -81.25, "dest_lat": 43.52, "dest_lon": -79.88,
            "pickup_by_end": T0 + timedelta(minutes=65), "load_type": "Dry Van", "weight_lbs": 30000}
    cand = [{"driver_name": "w", "unit": "W", "lat": 43.13, "lon": -80.75, "cycle": 1, "trailer_type": "Dry Van", "trailer_capacity_lbs": 44500}]
    clear = rank_candidates(T0, load, cand, {"w": fresh(2)})[0]
    assert clear["eligible"] and clear["road_extra_h"] == 0
    # a collision zone across the 401 between them, traffic at 30 %
    blocked = rank_candidates(T0, load, cand, {"w": fresh(2)}, closures=[Closure("c", 43.05, -81.0, 15, 0.3, "401 EB collision")])[0]
    assert blocked["road_extra_h"] > 0.3 and blocked["road_events"] == ["401 EB collision"]
    assert not blocked["eligible"] and any("cannot reach pickup" in b for b in blocked["blockers"])
    assert any(r.startswith("road: +") for r in blocked["reasons"])


def test_dock_history_rides_beside_the_verdict_without_changing_it():
    """A rescue that clears the rule can still be tight once the docks are what they have been.

    The plan budgets a flat 45 minutes to load and 45 to unload. In the carrier's own history a
    Mississauga pickup runs 40 minutes at the median and nearly two hours at the ninetieth
    percentile, so a candidate with hours to spare on paper may have very little on a bad day.
    That belongs beside the verdict, not inside it: the eligibility decision stays reproducible
    and rule-based, and the history is advice a dispatcher can weigh.
    """
    load = {"bill_number": "1", "orig_city": "MISSISSAUGA", "dest_city": "MILTON",
            "orig_lat": 42.98, "orig_lon": -81.25, "dest_lat": 43.52, "dest_lon": -79.88,
            "pickup_by_end": T0 + timedelta(hours=3), "load_type": "Dry Van", "weight_lbs": 30000}
    cands = [{"driver_name": "near", "unit": "A", "lat": 43.13, "lon": -80.75, "cycle": 1,
              "trailer_type": "Dry Van", "trailer_capacity_lbs": 44500}]
    logs = {"near": fresh(9.0)}                      # nine hours in: enough slack to pass, not much

    baseline = rank_candidates(T0, load, cands, logs)[0]

    def est(city, kind):
        return {"grain": "city", "n": 200, "median_min": 40.0, "p90_min": 150.0, "note": "test"}

    withdock = rank_candidates(T0, load, cands, logs, service_est=est)[0]

    # the verdict is untouched by the estimate
    assert withdock["eligible"] == baseline["eligible"]
    assert withdock["hos_margin_h"] == baseline["hos_margin_h"]

    d = withdock["dock"]
    assert d["allowance_min"] == 45 and d["pickup"]["n"] == 200
    # 150-minute docks at both ends eat into the buffer the flat allowance left
    assert d["scenarios"]["busy"]["margin_h"] < d["scenarios"]["typical"]["margin_h"]
    assert d["scenarios"]["busy"]["load_min"] == 150 and d["scenarios"]["typical"]["load_min"] == 40
    assert "not a probability" in d["wording"]          # never sold as "90% safe"

    # and with no history at all the field is simply absent
    assert rank_candidates(T0, load, cands, logs, service_est=lambda c, k: None)[0]["dock"] is None
