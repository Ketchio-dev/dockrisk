"""End-to-end through the HTTP API: synthetic workbook -> temp DB -> facility polygon -> HOS seed ->
telemetry pings entering/leaving the polygon -> driver confirmations -> draft charge -> rescue ranking."""
import json
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import api.main as m
from core.importer import main as import_main
from core.synthetic import main as synth_main

C_LAT, C_LON = 42.9980, -81.1880  # the London DC demo polygon centre


@pytest.fixture
def client(tmp_path, monkeypatch):
    xlsx = tmp_path / "s.xlsx"; db = tmp_path / "t.db"
    synth_main(xlsx, seed=5, n_orders=120, n_drivers=8)
    import_main(xlsx, db)
    monkeypatch.setattr(m, "DB_PATH", db)
    with TestClient(m.app) as c:
        yield c


def pings(unit, driver, t0, points, step_min=1, ctx=None):
    return [{"sim_ts": (t0 + timedelta(minutes=i * step_min)).isoformat(sep=" "), "unit": unit, "driver_name": driver, "lat": lat, "lon": lon,
             "speed_kmh": 0 if i else 40, "duty_status": "on_duty", "context": ctx} for i, (lat, lon) in enumerate(points)]


def test_full_visit_over_http(client):
    t0 = datetime(2026, 9, 8, 9, 27)
    drv = [d for d in client.get("/drivers").json() if d["status"] != "VACATION"][0]["name"]
    client.post("/sim/clock", json={"sim_ts": t0.isoformat(sep=" "), "speed": 60, "running": True})
    r = client.post("/hos/seed", json={"driver_name": drv, "as_of": t0.isoformat(sep=" "), "remaining_cycle_h": 30, "cycle": 1, "on_duty_now": True, "shift_onduty_so_far_h": 6})
    assert r.status_code == 200 and r.json()["source"] == "duty_log" and "seed" in r.json()["provenance"]["sources"]
    bill = client.get("/orders", params={"region": 1, "limit": 1}).json()[0]["bill_number"]
    ctx = {"bill_number": bill, "stop_kind": "delivery", "appointment_start_ts": "2026-09-08 10:00:00"}
    outside, inside, dock = (C_LAT + 0.01, C_LON), (C_LAT + 0.0012, C_LON), (C_LAT, C_LON)
    r = client.post("/ingest/telemetry", json={"pings": pings("T1", drv, t0, [outside, inside, inside, inside], ctx=ctx)})
    ev = r.json()["geofence_events"]
    assert any(e["zone"] == "property" and e["event"] == "enter" for e in ev)
    vid = [e for e in ev if e["zone"] == "property"][0]["visit_id"]
    v = client.get(f"/visits/{vid}").json()
    assert v["state"] == "PROPERTY_ENTERED" and v["bill_number"] == bill and v["clock_start_ts"] == "2026-09-08 10:00:00"
    client.post(f"/visits/{vid}/driver-event", json={"kind": "arrival_class", "actor": drv, "ts": "2026-09-08 09:35:00", "payload": {"value": "on_time"}})
    client.post(f"/visits/{vid}/driver-event", json={"kind": "checked_in", "actor": drv, "ts": "2026-09-08 09:40:00", "payload": {"at": "now"}})
    client.post("/ingest/telemetry", json={"pings": pings("T1", drv, datetime(2026, 9, 8, 10, 30), [dock, dock, dock], ctx=ctx)})
    assert client.get(f"/visits/{vid}").json()["state"] == "AT_DOCK"
    # 2 h 10 in: still no charge, exception should mention detention / next load, three clocks present
    client.post("/sim/clock", json={"sim_ts": "2026-09-08 12:10:00", "speed": 60, "running": True})
    client.post("/ingest/telemetry", json={"pings": pings("T1", drv, datetime(2026, 9, 8, 12, 10), [dock], ctx=ctx)})
    v = client.get(f"/visits/{vid}").json()
    assert v["minutes_until_billable"] is None and v["qualifying_dwell_min"] >= 130 and v["hos"] is not None
    assert "n" in v["prediction"]   # the model answers honestly: with little history at this elapsed point it reports n=0 rather than guessing
    assert client.get("/predict", params={"kind": "delivery", "elapsed": 60}).json()["n"] >= 8
    assert any(e["kind"] in ("detention_risk", "hos_margin") for e in client.get("/exceptions").json())
    client.post(f"/visits/{vid}/driver-event", json={"kind": "released", "actor": drv, "ts": "2026-09-08 12:15:00", "payload": {"at": "now"}})
    client.post("/ingest/telemetry", json={"pings": pings("T1", drv, datetime(2026, 9, 8, 12, 17), [dock, outside, outside, outside], ctx=ctx)})
    ch = client.get("/charges").json()
    assert len(ch) == 1 and ch[0]["visit_id"] == vid and ch[0]["status"] == "draft"
    assert ch[0]["qualifying_dwell_min"] == 135 and ch[0]["billable_min"] == 15 and ch[0]["amount"] == 18.75 and ch[0]["party"] == "consignee"
    packet = client.get(f"/visits/{vid}/evidence").json()
    assert packet["visit"]["on_time"] == 1 and any(e["source"] == "driver" for e in packet["events"]) and packet["breadcrumb_points"] > 5
    # replaying the same pings must not create a second visit or charge
    client.post("/ingest/telemetry", json={"pings": pings("T1", drv, t0, [outside, inside, inside, inside], ctx=ctx)})
    assert len(client.get("/charges").json()) == 1 and len(client.get("/visits", params={"open_only": 0}).json()) == 1


def test_rescue_ranks_a_standby_driver_and_explains_blockers(client):
    t0 = datetime(2026, 9, 8, 12, 0)
    client.post("/sim/clock", json={"sim_ts": t0.isoformat(sep=" "), "speed": 60, "running": True})
    d1, d2 = [d["name"] for d in client.get("/drivers").json() if d["status"] != "VACATION"][:2]
    bill = client.get("/orders", params={"region": 1, "limit": 1}).json()[0]["bill_number"]
    o = client.get(f"/orders/{bill}").json()
    for name, unit, lat, lon, rem in ((d1, "S1", o["orig_lat"] + 0.05, o["orig_lon"], 50), (d2, "S2", o["orig_lat"] + 1.2, o["orig_lon"] + 1.5, 3)):
        client.post("/hos/seed", json={"driver_name": name, "as_of": t0.isoformat(sep=" "), "remaining_cycle_h": rem, "cycle": 1, "on_duty_now": True, "shift_onduty_so_far_h": 1})
        client.post("/ingest/telemetry", json={"pings": [{"sim_ts": t0.isoformat(sep=" "), "unit": unit, "driver_name": name, "lat": lat, "lon": lon, "speed_kmh": 0, "duty_status": "on_duty"}]})
    client.post("/assignments", json={"bill_number": bill, "driver_name": "Nobody", "unit": "X", "status": "accepted",
                                      "reason": {"pickup_by_start": "2026-09-08 13:00:00", "pickup_by_end": "2026-09-08 14:00:00"}})
    r = client.get(f"/rescue/{bill}").json()
    by = {c["driver_name"]: c for c in r["candidates"]}
    assert by[d1]["eligible"], by[d1]["blockers"]
    assert "HOS ok" in " ".join(by[d1]["reasons"])
    assert not by[d2]["eligible"] and by[d2]["blockers"]
    off = client.post("/assignments", json={"bill_number": bill, "driver_name": d1, "unit": "S1", "status": "offered", "reason": {"via": "rescue"}}).json()
    acc = client.post(f"/assignments/{off['assignment_id']}/status", json={"status": "accepted", "actor": d1}).json()
    assert acc["status"] == "accepted"
    active = [a for a in client.get("/assignments").json() if a["bill_number"] == bill and a["status"] == "accepted"]
    assert [a["driver_name"] for a in active] == [d1]   # the previous holder was superseded
