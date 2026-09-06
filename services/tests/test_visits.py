import json
from datetime import datetime, timedelta

import pytest

from core.db import connect, init_schema
from core.geofence import GeofenceIndex, GeofenceTracker
from core.visits import VisitEngine

# a square ~600 m across at Milton, with a smaller dock square inside
C_LAT, C_LON = 43.5183, -79.8774
def sq(lat, lon, half_m):
    dlat = half_m / 111320; dlon = half_m / (111320 * 0.725)
    return json.dumps({"type": "Polygon", "coordinates": [[[lon-dlon, lat-dlat], [lon+dlon, lat-dlat], [lon+dlon, lat+dlat], [lon-dlon, lat+dlat], [lon-dlon, lat-dlat]]]})


@pytest.fixture
def db(tmp_path):
    conn = connect(tmp_path / "t.db"); init_schema(conn)
    conn.execute("INSERT INTO facilities (facility_id, name, customer, city, prov, lat, lon, property_polygon_geojson, dock_polygon_geojson, source, confidence) VALUES (1,'Milton DC','ACME','MILTON','ON',?,?,?,?,'hand',0.9)",
                 (C_LAT, C_LON, sq(C_LAT, C_LON, 300), sq(C_LAT, C_LON, 100)))
    conn.commit()
    return conn


def drive(tracker, unit, t0, points):
    evs = []
    for i, (lat, lon) in enumerate(points):
        evs += tracker.update(unit, "Driver7", t0 + timedelta(minutes=i), lat, lon)
    return evs


def test_full_visit_produces_one_charge_with_appointment_rule(db):
    eng = VisitEngine(db); idx = GeofenceIndex(db.execute("SELECT * FROM facilities").fetchall()); tr = GeofenceTracker(idx, confirm=3)
    t = datetime(2026, 9, 8, 9, 27)
    outside = (C_LAT + 0.01, C_LON); inside = (C_LAT + 0.002, C_LON); dock = (C_LAT, C_LON)
    ctx = {"bill_number": "409008", "stop_kind": "delivery", "customer": "ACME", "appointment_start_ts": "2026-09-08 10:00:00"}
    evs = drive(tr, "B3339", t, [outside, inside, inside, inside])       # confirmed enter at 09:30
    assert [e.event_type for e in evs] == ["enter"] and evs[0].zone == "property" and evs[0].ts == t + timedelta(minutes=3)
    v = eng.on_geofence(evs[0], ctx)
    assert v["state"] == "PROPERTY_ENTERED" and v["bill_number"] == "409008"
    eng.on_driver_event(v["visit_id"], "arrival_class", t + timedelta(minutes=5), "Driver7", {"value": "on_time"})
    eng.on_driver_event(v["visit_id"], "checked_in", datetime(2026, 9, 8, 9, 40), "Driver7")
    for e in drive(tr, "B3339", datetime(2026, 9, 8, 10, 30), [dock, dock, dock]):
        eng.on_geofence(e, ctx)
    assert eng.get(v["visit_id"])["state"] == "AT_DOCK"
    eng.on_driver_event(v["visit_id"], "service_complete", datetime(2026, 9, 8, 12, 10), "Driver7")
    eng.on_driver_event(v["visit_id"], "released", datetime(2026, 9, 8, 12, 15), "Driver7")
    mid = eng.three_clocks(v["visit_id"], datetime(2026, 9, 8, 11, 30))
    assert mid["clock_start_ts"] == "2026-09-08 10:00:00" and mid["minutes_until_billable"] == 30  # clock = max(check-in 09:40, appt 10:00)
    exit_evs = drive(tr, "B3339", datetime(2026, 9, 8, 12, 17), [dock, outside, outside, outside])   # exits dock+property, confirmed 12:20
    for e in exit_evs:
        eng.on_geofence(e, ctx)
    ch = db.execute("SELECT * FROM detention_charges").fetchall()
    assert len(ch) == 1
    ch = dict(ch[0])
    assert ch["qualifying_dwell_min"] == 135 and ch["billable_min"] == 15 and ch["amount"] == 18.75   # clock 10:00 -> release 12:15 = 135 min; 15 raw, floored to the 15-min increment @ $75/h
    assert ch["physical_dwell_min"] == 170   # 09:30 -> gate exit 12:20: physical dwell runs to the exit
    assert ch["party"] == "consignee" and ch["status"] == "draft"
    ev = json.loads(ch["evidence_json"])
    assert ev["visit"]["on_time"] == 1 and any(x["source"] == "driver" for x in ev["events"])
    final = eng.get(v["visit_id"])
    assert final["state"] in ("CHARGE_READY", "REVIEW_REQUIRED")


def test_replay_is_idempotent(db):
    eng = VisitEngine(db); idx = GeofenceIndex(db.execute("SELECT * FROM facilities").fetchall())
    t = datetime(2026, 9, 8, 9, 0); outside = (C_LAT + 0.01, C_LON); inside = (C_LAT + 0.002, C_LON)
    def run():
        tr = GeofenceTracker(idx, confirm=3)
        for e in drive(tr, "B1", t, [outside, inside, inside, inside]):
            eng.on_geofence(e, {"stop_kind": "pickup"})
        eng.on_driver_event(1, "checked_in", t + timedelta(minutes=4), "D")
        for e in drive(tr, "B1", t + timedelta(hours=3), [inside, outside, outside, outside]):
            eng.on_geofence(e, {"stop_kind": "pickup"})
    run(); run()
    assert db.execute("SELECT COUNT(*) FROM stop_visits").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM detention_charges").fetchone()[0] == 1
    n_events = db.execute("SELECT COUNT(*) FROM visit_events").fetchone()[0]
    run()
    assert db.execute("SELECT COUNT(*) FROM visit_events").fetchone()[0] == n_events


def test_near_threshold_and_unconfirmed_on_time_go_to_review(db):
    eng = VisitEngine(db); idx = GeofenceIndex(db.execute("SELECT * FROM facilities").fetchall()); tr = GeofenceTracker(idx, confirm=1)
    t = datetime(2026, 9, 8, 8, 0); outside = (C_LAT + 0.01, C_LON); inside = (C_LAT + 0.002, C_LON)
    for e in drive(tr, "B2", t, [inside]):
        v = eng.on_geofence(e, {"stop_kind": "delivery", "appointment_start_ts": "2026-09-08 08:00:00"})
    for e in drive(tr, "B2", t + timedelta(minutes=125), [outside]):
        eng.on_geofence(e, {})
    ch = dict(db.execute("SELECT * FROM detention_charges").fetchone())
    reasons = json.loads(ch["reason_codes"])
    assert ch["review_required"] == 1 and any("threshold" in r for r in reasons) and any("on-time" in r for r in reasons)
    assert eng.get(v["visit_id"])["state"] == "REVIEW_REQUIRED"


def test_jitter_does_not_flap_and_brief_exit_merges(db):
    eng = VisitEngine(db); idx = GeofenceIndex(db.execute("SELECT * FROM facilities").fetchall()); tr = GeofenceTracker(idx, confirm=3)
    t = datetime(2026, 9, 8, 8, 0); outside = (C_LAT + 0.01, C_LON); inside = (C_LAT + 0.002, C_LON)
    evs = drive(tr, "B3", t, [inside, inside, inside, outside, inside, outside, inside, inside])  # single-ping flickers
    assert [e.event_type for e in evs] == ["enter"]
    for e in evs:
        v = eng.on_geofence(e, {"stop_kind": "pickup"})
    evs2 = drive(tr, "B3", t + timedelta(hours=1), [outside, outside, outside])  # real exit
    for e in evs2:
        eng.on_geofence(e, {})
    assert eng.get(v["visit_id"])["gate_exited_ts"] is not None
    evs3 = drive(tr, "B3", t + timedelta(hours=1, minutes=10), [inside, inside, inside])  # back within 20 min: merged
    for e in evs3:
        eng.on_geofence(e, {"stop_kind": "pickup"})
    assert db.execute("SELECT COUNT(*) FROM stop_visits").fetchone()[0] == 1
    assert eng.get(v["visit_id"])["gate_exited_ts"] is None and eng.get(v["visit_id"])["state"] == "PROPERTY_ENTERED"


def test_centroid_facility_is_flagged_low_confidence(db):
    db.execute("INSERT INTO facilities (facility_id, name, city, prov, lat, lon, source, confidence) VALUES (2,'London yard','LONDON','ON',42.9849,-81.2453,'centroid',0.3)"); db.commit()
    eng = VisitEngine(db); idx = GeofenceIndex(db.execute("SELECT * FROM facilities").fetchall()); tr = GeofenceTracker(idx, confirm=1)
    t = datetime(2026, 9, 8, 8, 0)
    for e in drive(tr, "B4", t, [(42.9849, -81.2453)]):
        v = eng.on_geofence(e, {"stop_kind": "delivery"})
    for e in drive(tr, "B4", t + timedelta(hours=3), [(43.05, -81.2453)]):
        eng.on_geofence(e, {})
    reasons = json.loads(dict(db.execute("SELECT * FROM detention_charges").fetchone())["reason_codes"])
    assert any("not verified dock geometry" in r for r in reasons)
