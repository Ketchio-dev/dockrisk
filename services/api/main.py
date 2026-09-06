"""RoadStar dispatch API. One process, SQLite, engines from core/. The simulator is a separate service that
POSTs telemetry and duty changes here; the web app reads /snapshot or /stream.

    uv run uvicorn api.main:app --port 8000 --reload
"""
from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from core.analytics import exposure_summary, predict_remaining
from core.db import DB_PATH, connect, init_schema
from core.geofence import GeofenceIndex, GeofenceTracker
from core.hos import DutyEvent, PlanStep, check_plan, compute_clocks, cycle_note, departure_margin, norm_cycle, seed_history_from_snapshot
from core.matching import haversine_km, rank_candidates
from core.visits import VisitEngine

TERMINAL_STATES = ("CHARGE_READY", "REVIEW_REQUIRED")
DEMO_POLYGONS = [
    # Demo geometry: drawn against satellite imagery of a real Milton industrial block. Labeled as demo, not a verified dock.
    {"name": "Milton DC (demo geometry)", "customer": None, "city": "MILTON", "prov": "ON", "lat": 43.5290, "lon": -79.8560,
     "property": [[-79.8590, 43.5270], [-79.8530, 43.5270], [-79.8530, 43.5310], [-79.8590, 43.5310], [-79.8590, 43.5270]],
     "dock": [[-79.8572, 43.5282], [-79.8548, 43.5282], [-79.8548, 43.5298], [-79.8572, 43.5298], [-79.8572, 43.5282]],
     "gate": (43.5270, -79.8560), "source": "demo", "confidence": 0.6},
    {"name": "London DC (demo geometry)", "customer": None, "city": "LONDON", "prov": "ON", "lat": 42.9980, "lon": -81.1880,
     "property": [[-81.1910, 42.9960], [-81.1850, 42.9960], [-81.1850, 43.0000], [-81.1910, 43.0000], [-81.1910, 42.9960]],
     "dock": [[-81.1892, 42.9972], [-81.1868, 42.9972], [-81.1868, 42.9988], [-81.1892, 42.9988], [-81.1892, 42.9972]],
     "gate": (42.9960, -81.1880), "source": "demo", "confidence": 0.6},
]


class State:
    conn = None
    index: GeofenceIndex | None = None
    tracker: GeofenceTracker | None = None
    visits: VisitEngine | None = None


S = State()


def now_sim() -> datetime:
    r = S.conn.execute("SELECT sim_ts FROM sim_clock WHERE id=1").fetchone()
    return datetime.fromisoformat(r["sim_ts"]) if r else datetime.now().replace(microsecond=0)


def _poly(coords):
    return json.dumps({"type": "Polygon", "coordinates": [coords]})


def seed_facilities():
    cur = S.conn.cursor()
    if cur.execute("SELECT COUNT(*) FROM facilities").fetchone()[0]:
        return
    for d in DEMO_POLYGONS:
        cur.execute("""INSERT INTO facilities (name, customer, city, prov, lat, lon, property_polygon_geojson, dock_polygon_geojson, gate_lat, gate_lon, source, confidence)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (d["name"], d["customer"], d["city"], d["prov"], d["lat"], d["lon"], _poly(d["property"]), _poly(d["dock"]), d["gate"][0], d["gate"][1], d["source"], d["confidence"]))
    # city-centroid facilities for the busiest in-region cities: simulation geometry only (radius fallback, confidence 0.3)
    rows = cur.execute("""SELECT city, COUNT(*) n FROM (
                            SELECT UPPER(TRIM(orig_city)) city FROM orders WHERE in_region=1 UNION ALL SELECT UPPER(TRIM(dest_city)) FROM orders WHERE in_region=1)
                          GROUP BY city ORDER BY n DESC LIMIT 25""").fetchall()
    for r in rows:
        p = cur.execute("SELECT lat, lon FROM places WHERE key=? AND kind='city'", (f"{r['city']}, ON",)).fetchone()
        if p:
            cur.execute("INSERT INTO facilities (name, city, prov, lat, lon, source, confidence) VALUES (?,?,?,?,?,'centroid',0.3)",
                        (f"{r['city'].title()} (city centroid)", r["city"], "ON", p["lat"], p["lon"]))
    S.conn.commit()


def reload_geofences():
    S.index = GeofenceIndex(S.conn.execute("SELECT * FROM facilities").fetchall())
    S.tracker = GeofenceTracker(S.index, confirm=3)


def load_dotenv():
    """Minimal .env loader (KEY=VALUE lines) so the LLM extractor finds ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY.
    Existing environment wins; the file is git-ignored."""
    import os
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_dotenv()
    S.conn = connect(DB_PATH)
    init_schema(S.conn)
    seed_facilities()
    reload_geofences()
    S.visits = VisitEngine(S.conn)
    yield
    S.conn.close()


app = FastAPI(title="RoadStar Dispatch API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def rows(sql, *a):
    return [dict(r) for r in S.conn.execute(sql, a)]


def row(sql, *a):
    r = S.conn.execute(sql, a).fetchone()
    return dict(r) if r else None


# ---------------- reference data ----------------
@app.get("/health")
def health():
    return {"ok": True, "sim_ts": now_sim().isoformat(sep=" "), "db": str(DB_PATH)}


@app.get("/data-quality")
def data_quality():
    return rows("SELECT * FROM data_quality ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, rule")


@app.get("/drivers")
def drivers():
    return rows("SELECT * FROM drivers ORDER BY driver_id")


@app.get("/orders")
def orders(region: int = 1, limit: int = 200, city: str | None = None):
    sql = "SELECT * FROM orders WHERE 1=1" + (" AND in_region=1" if region else "") + (" AND (UPPER(orig_city)=? OR UPPER(dest_city)=?)" if city else "") + " ORDER BY created_time DESC LIMIT ?"
    return rows(sql, *([city.upper(), city.upper()] if city else []), limit)


@app.get("/orders/{bill_number}")
def order(bill_number: str):
    o = row("SELECT * FROM orders WHERE bill_number=?", bill_number)
    if not o:
        raise HTTPException(404, "unknown bill")
    o["legs"] = rows("SELECT leg_id, seq, driver_name, loaded, leg_dist, pickup_by_start, pickup_by_end, deliver_by_start, deliver_by_end, trailer1 FROM legs WHERE bill_number=? OR bill_root=? ORDER BY seq", bill_number, o["bill_root"])
    return o


@app.get("/legs")
def legs(bill: str | None = None, driver: str | None = None, limit: int = 200):
    sql = "SELECT * FROM legs WHERE 1=1" + (" AND (bill_number=? OR bill_root=?)" if bill else "") + (" AND driver_name=?" if driver else "") + " ORDER BY plan_depart DESC LIMIT ?"
    args = []
    if bill:
        args += [bill, bill.split("-")[0]]
    if driver:
        args.append(driver)
    return rows(sql, *args, limit)


@app.get("/facilities")
def facilities():
    out = rows("SELECT * FROM facilities ORDER BY facility_id")
    for f in out:
        for k in ("property_polygon_geojson", "dock_polygon_geojson"):
            f[k] = json.loads(f[k]) if f[k] else None
    return out


class FacilityIn(BaseModel):
    name: str
    customer: str | None = None
    city: str | None = None
    lat: float
    lon: float
    property_polygon: dict | None = None
    dock_polygon: dict | None = None
    source: str = "hand"
    confidence: float = 0.9


@app.post("/facilities")
def add_facility(f: FacilityIn):
    S.conn.execute("INSERT INTO facilities (name, customer, city, prov, lat, lon, property_polygon_geojson, dock_polygon_geojson, source, confidence) VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (f.name, f.customer, f.city, "ON", f.lat, f.lon, json.dumps(f.property_polygon) if f.property_polygon else None,
                    json.dumps(f.dock_polygon) if f.dock_polygon else None, f.source, f.confidence))
    S.conn.commit()
    reload_geofences()
    return row("SELECT * FROM facilities ORDER BY facility_id DESC LIMIT 1")


@app.get("/policies")
def policies():
    return rows("SELECT * FROM detention_policies ORDER BY policy_id")


class PolicyIn(BaseModel):
    scope: str
    customer: str | None = None
    facility_id: int | None = None
    free_time_min: int = 120
    rate_per_hour: float = 75.0
    increment_min: int = 15
    minimum_charge: float = 0
    maximum_charge: float | None = None
    billing_start_rule: str = "max_checkin_appointment"
    requires_on_time_arrival: bool = True
    on_time_grace_min: int = 15
    required_evidence: list[str] = ["geofence_entry", "geofence_exit", "driver_checkin", "appointment"]
    source: str = "manual"
    source_text: str | None = None
    confirmed_by: str | None = None


@app.post("/policies")
def add_policy(p: PolicyIn):
    S.conn.execute("""INSERT INTO detention_policies (scope, customer, facility_id, free_time_min, rate_per_hour, increment_min, minimum_charge, maximum_charge,
                      billing_start_rule, requires_on_time_arrival, on_time_grace_min, required_evidence, source, source_text, confirmed_by, created_ts)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                   (p.scope, p.customer, p.facility_id, p.free_time_min, p.rate_per_hour, p.increment_min, p.minimum_charge, p.maximum_charge,
                    p.billing_start_rule, int(p.requires_on_time_arrival), p.on_time_grace_min, json.dumps(p.required_evidence), p.source, p.source_text,
                    p.confirmed_by, now_sim().isoformat(sep=" ")))
    S.conn.commit()
    return row("SELECT * FROM detention_policies ORDER BY policy_id DESC LIMIT 1")


class ExtractIn(BaseModel):
    text: str
    customer: str | None = None
    prefer_llm: bool = True


@app.post("/policies/extract")
def policies_extract(x: ExtractIn):
    """Draft detention terms from pasted rate-confirmation text. Nothing is activated until /policies/confirm."""
    from core.policy_extract import extract_terms
    ex = extract_terms(x.text, x.prefer_llm)
    return {"customer": x.customer, "source": ex.source, "provider": ex.provider, "model": ex.model, "warning": ex.warning, "terms": ex.terms.model_dump(), "source_text": x.text}


class ConfirmIn(BaseModel):
    customer: str | None = None
    facility_id: int | None = None
    terms: dict
    source: str            # extracted-llm | extracted-rules | manual
    source_text: str | None = None
    confirmed_by: str


@app.post("/policies/confirm")
def policies_confirm(c: ConfirmIn):
    t = c.terms
    scope = "facility" if c.facility_id else "customer" if c.customer else "default"
    S.conn.execute("""INSERT INTO detention_policies (scope, customer, facility_id, free_time_min, rate_per_hour, increment_min, minimum_charge, maximum_charge,
                      billing_start_rule, requires_on_time_arrival, on_time_grace_min, required_evidence, source, source_text, confirmed_by, created_ts)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                   (scope, c.customer, c.facility_id, int(t.get("free_time_min") or 120), float(t.get("rate_per_hour") or 75), int(t.get("increment_min") or 15),
                    float(t.get("minimum_charge") or 0), t.get("maximum_charge"), t.get("billing_start_rule") or "max_checkin_appointment",
                    int(bool(t.get("requires_on_time_arrival", True))), 15, json.dumps(t.get("required_evidence") or []),
                    "confirmed", c.source_text, f"{c.confirmed_by} (from {c.source})", now_sim().isoformat(sep=" ")))
    S.conn.commit()
    return row("SELECT * FROM detention_policies ORDER BY policy_id DESC LIMIT 1")


@app.get("/exposure")
def exposure(free_min: int = 120, rate_low: float = 75, rate_high: float = 100, region_only: int = 1, cap_min: int = 2880):
    return exposure_summary(S.conn, free_min, rate_low, rate_high, bool(region_only), cap_min)


@app.get("/predict")
def predict(kind: str, elapsed: float, customer: str | None = None, city: str | None = None, free_min: int = 120):
    return predict_remaining(S.conn, customer, city, kind, elapsed, free_min)


# ---------------- sim clock + ingest ----------------
class ClockIn(BaseModel):
    sim_ts: str
    speed: float = 1.0
    running: bool = True
    scenario: str | None = None
    seed: int | None = None


@app.get("/sim/clock")
def get_clock():
    return row("SELECT * FROM sim_clock WHERE id=1") or {"sim_ts": datetime.now().isoformat(sep=" "), "running": 0}


@app.post("/sim/clock")
def set_clock(c: ClockIn):
    S.conn.execute("""INSERT INTO sim_clock (id, sim_ts, speed, running, scenario, seed, updated_wall_ts) VALUES (1,?,?,?,?,?,?)
                      ON CONFLICT(id) DO UPDATE SET sim_ts=excluded.sim_ts, speed=excluded.speed, running=excluded.running,
                      scenario=COALESCE(excluded.scenario, sim_clock.scenario), seed=COALESCE(excluded.seed, sim_clock.seed), updated_wall_ts=excluded.updated_wall_ts""",
                   (c.sim_ts, c.speed, int(c.running), c.scenario, c.seed, datetime.now().isoformat(sep=" ")))
    S.conn.commit()
    return get_clock()


class ControlIn(BaseModel):
    running: bool | None = None
    speed: float | None = None


@app.post("/sim/control")
def sim_control(c: ControlIn):
    """Pause/resume and speed. The simulator polls /sim/clock each tick and honors these."""
    cur = get_clock()
    if "id" not in cur:
        raise HTTPException(409, "no scenario running")
    S.conn.execute("UPDATE sim_clock SET running=COALESCE(?, running), speed=COALESCE(?, speed), updated_wall_ts=? WHERE id=1",
                   (None if c.running is None else int(c.running), c.speed, datetime.now().isoformat(sep=" ")))
    S.conn.commit()
    return get_clock()


@app.post("/sim/reset")
def sim_reset():
    """Wipe live state (telemetry, visits, charges, duty, assignments, exceptions). Reference data stays."""
    for t in ("telemetry", "geofence_events", "stop_visits", "visit_events", "detention_charges", "duty_events", "assignments", "exceptions"):
        S.conn.execute(f"DELETE FROM {t}")
    S.conn.execute("DELETE FROM sim_clock")
    S.conn.commit()
    S.tracker.reset()
    return {"ok": True}


class Ping(BaseModel):
    sim_ts: str
    unit: str
    driver_name: str | None = None
    lat: float
    lon: float
    speed_kmh: float = 0
    heading: float | None = None
    odometer_km: float | None = None
    duty_status: str | None = None
    ignition: bool = True
    context: dict | None = None   # bill_number, stop_kind, customer, appointment_start_ts — what the unit is doing


class TelemetryBatch(BaseModel):
    pings: list[Ping]
    source: str = "sim"
    clock: ClockIn | None = None   # advance the sim clock in the same request so derived state never runs ahead of it


@app.post("/ingest/telemetry")
def ingest_telemetry(b: TelemetryBatch):
    if b.clock:
        cur = row("SELECT running, speed FROM sim_clock WHERE id=1")
        if cur:  # UI-set pause/speed win over the simulator's own values
            b.clock.running = bool(cur["running"]); b.clock.speed = cur["speed"]
        set_clock(b.clock)
    cur = S.conn.cursor()
    fired = []
    for p in b.pings:
        cur.execute("""INSERT OR IGNORE INTO telemetry (sim_ts, unit, driver_name, lat, lon, speed_kmh, heading, odometer_km, duty_status, ignition, source)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (p.sim_ts, p.unit, p.driver_name, p.lat, p.lon, p.speed_kmh, p.heading, p.odometer_km, p.duty_status, int(p.ignition), b.source))
        if cur.rowcount == 0:
            continue  # duplicate ping (replay): no side effects
        ts = datetime.fromisoformat(p.sim_ts)
        for ev in S.tracker.update(p.unit, p.driver_name, ts, p.lat, p.lon):
            cur.execute("""INSERT OR IGNORE INTO geofence_events (sim_ts, unit, driver_name, facility_id, zone, event_type, lat, lon, confirm_pings, source)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""", (p.sim_ts, p.unit, p.driver_name, ev.facility_id, ev.zone, ev.event_type, p.lat, p.lon, ev.confirm_pings, "gps"))
            v = S.visits.on_geofence(ev, p.context or current_context(p.unit))
            fired.append({"unit": p.unit, "facility": ev.facility_name, "zone": ev.zone, "event": ev.event_type, "ts": p.sim_ts, "visit_id": v["visit_id"] if v else None})
            # entering a property while driving = waiting on duty; leaving = driving again
            if p.driver_name and ev.zone == "property":
                record_duty(p.driver_name, ts, "on_duty" if ev.event_type == "enter" else "driving", "gps", f"{ev.event_type} {ev.facility_name}")
    S.conn.commit()
    refresh_exceptions()
    return {"stored": len(b.pings), "geofence_events": fired}


def current_context(unit: str) -> dict:
    a = row("""SELECT a.bill_number, o.customer, o.orig_city, o.dest_city, l.pickup_by_start, l.deliver_by_start
               FROM assignments a LEFT JOIN orders o ON o.bill_number=a.bill_number
               LEFT JOIN legs l ON l.bill_number=a.bill_number
               WHERE a.unit=? AND a.status IN ('accepted','offered') ORDER BY a.assignment_id DESC LIMIT 1""", unit)
    return {"bill_number": a["bill_number"], "customer": a["customer"]} if a else {}


class DutyIn(BaseModel):
    driver_name: str
    ts: str
    status: str
    source: str = "sim"
    note: str | None = None


def record_duty(driver: str, ts: datetime, status: str, source: str, note: str | None = None):
    last = row("SELECT status FROM duty_events WHERE driver_name=? ORDER BY ts DESC LIMIT 1", driver)
    if last and last["status"] == status:
        return
    S.conn.execute("INSERT OR IGNORE INTO duty_events (driver_name, ts, status, source, note) VALUES (?,?,?,?,?)", (driver, ts.isoformat(sep=" "), status, source, note))


@app.post("/ingest/duty")
def ingest_duty(d: DutyIn):
    record_duty(d.driver_name, datetime.fromisoformat(d.ts), d.status, d.source, d.note)
    S.conn.commit()
    return {"ok": True}


class SeedDutyIn(BaseModel):
    driver_name: str
    as_of: str
    remaining_cycle_h: float
    cycle: int = 1
    on_duty_now: bool = True
    shift_onduty_so_far_h: float = 0.0


@app.post("/hos/seed")
def seed_duty(s: SeedDutyIn):
    """Seed a duty history that reproduces the export snapshot. Labeled source='seed'."""
    S.conn.execute("DELETE FROM duty_events WHERE driver_name=? AND source='seed'", (s.driver_name,))
    for e in seed_history_from_snapshot(datetime.fromisoformat(s.as_of), s.remaining_cycle_h, norm_cycle(s.cycle), s.on_duty_now, s.shift_onduty_so_far_h):
        S.conn.execute("INSERT OR IGNORE INTO duty_events (driver_name, ts, status, source, note) VALUES (?,?,?,?,?)",
                       (s.driver_name, e.ts.isoformat(sep=" "), e.status, "seed", "seeded from export snapshot REMAINING_HOURS_CAN_*"))
    S.conn.commit()
    return hos(s.driver_name)


# ---------------- HOS ----------------
def duty_log(driver: str) -> list[DutyEvent]:
    return [DutyEvent(datetime.fromisoformat(r["ts"]), r["status"]) for r in rows("SELECT ts, status FROM duty_events WHERE driver_name=? ORDER BY ts", driver)]


def duty_provenance(driver: str) -> dict:
    src = [r["source"] for r in rows("SELECT DISTINCT source FROM duty_events WHERE driver_name=?", driver)]
    return {"sources": src, "history": "seeded from export snapshot + simulated events" if "seed" in src else "recorded events",
            "note": "synthetic scenario history, not verified availability" if "seed" in src else None}


@app.get("/hos/{driver}")
def hos(driver: str, as_of: str | None = None):
    d = row("SELECT * FROM drivers WHERE name=?", driver)
    if not d:
        raise HTTPException(404, "unknown driver")
    t = datetime.fromisoformat(as_of) if as_of else now_sim()
    log = duty_log(driver)
    if not log:
        return {"driver": driver, "source": "export_snapshot", "as_of": d["duty_at"], "cycle": d["cycle"],
                "remaining_can_7": d["remaining_can_7"], "remaining_can_8": d["remaining_can_8"], "remaining_can_14": d["remaining_can_14"],
                "note": "No duty history in this system yet; these are TruckMate's snapshot balances, not recomputed clocks."}
    c = compute_clocks(log, t, norm_cycle(d["cycle"]))
    return {"driver": driver, "source": "duty_log", "provenance": duty_provenance(driver), "cycle": norm_cycle(d["cycle"]), "cycle_note": cycle_note(d["cycle"]),
            "clocks": c.as_dict(), "export_snapshot": {"remaining_can_7": d["remaining_can_7"], "duty_at": d["duty_at"]}}


class PlanIn(BaseModel):
    steps: list[dict]  # {status, hours, label}
    as_of: str | None = None


@app.post("/hos/{driver}/check")
def hos_check(driver: str, p: PlanIn):
    d = row("SELECT cycle FROM drivers WHERE name=?", driver)
    log = duty_log(driver)
    if not log:
        raise HTTPException(409, "no duty history for driver; seed first")
    f = check_plan(log, datetime.fromisoformat(p.as_of) if p.as_of else now_sim(), [PlanStep(s["status"], s["hours"], s.get("label", "")) for s in p.steps], norm_cycle((d or {}).get("cycle")))
    return {"feasible": f.feasible, "margin_h": f.margin_h, "binding": f.binding, "first_violation": f.first_violation, "at_step": f.at_step,
            "adverse_conditions_note": f.adverse_conditions_note, "clocks_after": f.clocks_after.as_dict()}


# ---------------- visits, charges, exceptions ----------------
def drive_to_safe_h(facility_id: int) -> float:
    f = row("SELECT lat, lon FROM facilities WHERE facility_id=?", facility_id)
    term = row("SELECT lat, lon FROM facilities WHERE city='MILTON' ORDER BY confidence DESC LIMIT 1") or {"lat": 43.5183, "lon": -79.8774}
    km = haversine_km(f["lat"], f["lon"], term["lat"], term["lon"]) if f else 60
    return round(max(0.25, km / 75.0 + 0.15), 2)


def visit_detail(visit_id: int, now: datetime) -> dict:
    v = S.visits.get(visit_id)
    clocks = S.visits.three_clocks(visit_id, now)
    fac = row("SELECT facility_id, name, customer, city, source, confidence FROM facilities WHERE facility_id=?", v["facility_id"])
    elapsed = clocks["physical_dwell_min"]
    pred = predict_remaining(S.conn, v.get("bill_number") and (row("SELECT customer FROM orders WHERE bill_number=?", v["bill_number"]) or {}).get("customer"),
                             fac["city"] if fac else None, v["stop_kind"] if v["stop_kind"] in ("pickup", "delivery") else "delivery", elapsed) if v["state"] not in TERMINAL_STATES else None
    hos_margin = None
    if v["driver_name"] and duty_log(v["driver_name"]) and v["state"] not in TERMINAL_STATES:
        wait_more = (pred or {}).get("median_remaining_min") or 30
        d = row("SELECT cycle FROM drivers WHERE name=?", v["driver_name"])
        f = departure_margin(duty_log(v["driver_name"]), now, wait_more / 60, drive_to_safe_h(v["facility_id"]), norm_cycle((d or {}).get("cycle")))
        hos_margin = {"wait_more_min": wait_more, "drive_to_safe_h": drive_to_safe_h(v["facility_id"]), "margin_h": f.margin_h, "binding": f.binding,
                      "feasible": f.feasible, "first_violation": f.first_violation}
    nxt = row("""SELECT a.bill_number, o.orig_city, o.dest_city, o.orig_lat, o.orig_lon, o.dest_lat, o.dest_lon,
                        COALESCE(json_extract(a.reason_json,'$.pickup_by_start'), l.pickup_by_start) pickup_by_start,
                        COALESCE(json_extract(a.reason_json,'$.pickup_by_end'), l.pickup_by_end) pickup_by_end
                 FROM assignments a LEFT JOIN orders o ON o.bill_number=a.bill_number LEFT JOIN legs l ON l.bill_number=a.bill_number
                 WHERE a.driver_name=? AND a.status IN ('offered','accepted') AND a.bill_number<>IFNULL(?, '') ORDER BY a.assignment_id DESC LIMIT 1""",
              v["driver_name"], v["bill_number"])
    if nxt and hos_margin and nxt.get("orig_lat"):
        # the actual next commitment: drive to its pickup, load, line-haul, unload — with vs without the predicted extra wait
        f = row("SELECT lat, lon FROM facilities WHERE facility_id=?", v["facility_id"])
        to_pick = haversine_km(f["lat"], f["lon"], nxt["orig_lat"], nxt["orig_lon"]) * 1.25 / 75.0
        haul = (haversine_km(nxt["orig_lat"], nxt["orig_lon"], nxt["dest_lat"], nxt["dest_lon"]) * 1.25 / 75.0) if nxt.get("dest_lat") else 1.5
        d = row("SELECT cycle FROM drivers WHERE name=?", v["driver_name"])
        def plan(wait_h, as_of):
            steps = ([PlanStep("on_duty", wait_h, "remaining dock wait")] if wait_h > 0 else []) + [
                PlanStep("driving", to_pick, "to next pickup"), PlanStep("on_duty", 0.75, "load"), PlanStep("driving", haul, "line haul"), PlanStep("on_duty", 0.75, "unload")]
            return check_plan(duty_log(v["driver_name"]), as_of, steps, norm_cycle((d or {}).get("cycle")))
        entered = datetime.fromisoformat(v["property_entered_ts"] or v["approach_ts"])
        at_arrival = plan(0, entered)                                   # baseline: had the truck been released on arrival
        without = plan(0, now)                                          # released right now
        with_wait = plan(hos_margin["wait_more_min"] / 60, now)         # released after the predicted remaining wait
        pc = lambda f: {"feasible": f.feasible, "margin_h": f.margin_h, "breaks_at": f.at_step, "binding": f.binding}
        verdict = ("infeasible even at arrival — not a detention problem" if not at_arrival.feasible
                   else "the wait so far has already made it infeasible" if not without.feasible
                   else "the predicted remaining wait makes it infeasible" if not with_wait.feasible
                   else "feasible")
        hos_margin["next_load"] = {"at_arrival": pc(at_arrival), "without_more_wait": pc(without), "with_predicted_wait": pc(with_wait),
                                   "drive_to_pickup_h": round(to_pick, 2), "line_haul_h": round(haul, 2), "verdict": verdict}
        nxt = {k: nxt[k] for k in ("bill_number", "orig_city", "dest_city", "pickup_by_start", "pickup_by_end")}
    return {**clocks, "facility": fac, "events": rows("SELECT * FROM visit_events WHERE visit_id=? ORDER BY ts, event_id", visit_id),
            "prediction": pred, "hos": hos_margin, "next_load": nxt,
            "timestamps": {k: v[k] for k in ("appointment_start_ts", "approach_ts", "property_entered_ts", "checked_in_ts", "at_dock_ts", "service_complete_ts", "released_ts", "gate_exited_ts")},
            "on_time": v["on_time"], "review_required": v["review_required"]}


@app.get("/visits")
def visits(open_only: int = 1):
    now = now_sim()
    sql = "SELECT visit_id FROM stop_visits" + (" WHERE state NOT IN ('CHARGE_READY','REVIEW_REQUIRED')" if open_only else "") + " ORDER BY visit_id DESC"
    out = [visit_detail(r["visit_id"], now) for r in rows(sql)]
    def urgency(d):
        m = (d["hos"] or {}).get("margin_h")
        mtb = d["minutes_until_billable"]
        return (m if m is not None else 99, -1 if mtb is None else mtb)
    return sorted(out, key=urgency)


@app.get("/visits/{visit_id}")
def visit(visit_id: int):
    return visit_detail(visit_id, now_sim())


class DriverEventIn(BaseModel):
    kind: str            # arrival_class | checked_in | door_assigned | service_complete | released | correction
    actor: str
    ts: str | None = None
    payload: dict | None = None


@app.post("/visits/{visit_id}/driver-event")
def visit_driver_event(visit_id: int, e: DriverEventIn):
    S.visits.on_driver_event(visit_id, e.kind, datetime.fromisoformat(e.ts) if e.ts else now_sim(), e.actor, e.payload)
    refresh_exceptions()
    return visit_detail(visit_id, now_sim())


@app.post("/visits/{visit_id}/finalize")
def visit_finalize(visit_id: int):
    ch = S.visits.finalize(visit_id, now_sim())
    ch["evidence"] = json.loads(ch.pop("evidence_json"))
    return ch


@app.get("/visits/{visit_id}/evidence")
def visit_evidence(visit_id: int):
    return S.visits.evidence_packet(visit_id, S.visits.compute(S.visits.get(visit_id), now_sim()))


@app.get("/charges")
def charges():
    out = rows("SELECT c.*, f.name facility_name FROM detention_charges c JOIN stop_visits v ON v.visit_id=c.visit_id JOIN facilities f ON f.facility_id=v.facility_id ORDER BY c.charge_id DESC")
    for c in out:
        c["reason_codes"] = json.loads(c["reason_codes"] or "[]")
        c.pop("evidence_json", None)
    return out


class ApproveIn(BaseModel):
    actor: str
    status: str = "approved"   # approved | disputed


@app.post("/charges/{charge_id}/approve")
def approve_charge(charge_id: int, a: ApproveIn):
    S.conn.execute("UPDATE detention_charges SET status=?, approved_by=?, approved_ts=? WHERE charge_id=?", (a.status, a.actor, now_sim().isoformat(sep=" "), charge_id))
    S.conn.commit()
    return row("SELECT charge_id, status, approved_by, approved_ts, amount FROM detention_charges WHERE charge_id=?", charge_id)


def upsert_exception(kind: str, severity: str, unit: str | None, driver: str | None, visit_id: int | None, bill: str | None, title: str, detail: dict, actions: list):
    if kind == "closure" and detail.get("id"):
        ex = row("SELECT exception_id FROM exceptions WHERE kind='closure' AND status='open' AND json_extract(detail_json,'$.id')=?", str(detail["id"]))
    else:
        ex = row("SELECT exception_id FROM exceptions WHERE kind=? AND IFNULL(visit_id,-1)=IFNULL(?,-1) AND IFNULL(unit,'')=IFNULL(?,'') AND status='open'", kind, visit_id, unit)
    ts = now_sim().isoformat(sep=" ")
    if ex:
        S.conn.execute("UPDATE exceptions SET sim_ts=?, severity=?, title=?, detail_json=?, proposed_actions_json=? WHERE exception_id=?",
                       (ts, severity, title, json.dumps(detail), json.dumps(actions), ex["exception_id"]))
    else:
        S.conn.execute("INSERT INTO exceptions (sim_ts, kind, severity, unit, driver_name, visit_id, bill_number, title, detail_json, proposed_actions_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
                       (ts, kind, severity, unit, driver, visit_id, bill, title, json.dumps(detail), json.dumps(actions)))


def refresh_exceptions():
    now = now_sim()
    open_ids = [r["visit_id"] for r in rows("SELECT visit_id FROM stop_visits WHERE state NOT IN ('CHARGE_READY','REVIEW_REQUIRED')")]
    for vid in open_ids:
        d = visit_detail(vid, now)
        unit, drv, bill, facn = d["unit"], d["driver_name"], d["bill_number"], (d["facility"] or {}).get("name")
        mtb = d["minutes_until_billable"]
        pred = d["prediction"] or {}
        if mtb is not None and mtb <= 30 and (pred.get("p_over_free") or 0) >= 0.5:
            upsert_exception("detention_risk", "warn", unit, drv, vid, bill,
                             f"{drv or unit} at {facn}: billable in {int(mtb)} min, P(over free time) {pred['p_over_free']:.0%} (n={pred['n']})",
                             {"minutes_until_billable": mtb, "prediction": pred}, ["notify customer free time expiring", "start evidence collection"])
        elif mtb is None and d["billable_min"] >= 0 and d["qualifying_dwell_min"] > (d["policy"]["free_time_min"]):
            raw = d["qualifying_dwell_min"] - d["policy"]["free_time_min"]
            upsert_exception("detention_risk", "info", unit, drv, vid, bill, f"{drv or unit} at {facn}: detention accruing, {raw:.0f} min past free time (${raw/60*d['policy']['rate_per_hour']:.0f} at ${d['policy']['rate_per_hour']:.0f}/h)",
                             {"minutes_past_free": raw, "billable_min_rounded": d["billable_min"]}, ["confirm release time with driver", "collect evidence"])
        h = d["hos"]
        if h and h["margin_h"] < 0.5:
            sev = "critical" if h["margin_h"] < 0 else "warn"
            upsert_exception("hos_margin", sev, unit, drv, vid, bill,
                             f"{drv}: departure margin {h['margin_h']:+.1f} h after predicted wait ({h['wait_more_min']:.0f} min) + {h['drive_to_safe_h']} h to a legal stop — {h['binding']}",
                             h, ["direct driver to safe parking now" if h["margin_h"] >= 0 else "no legal continuation: escalate", "reassign next load"])
        nxt = d["next_load"]
        if nxt and h:
            nl = h.get("next_load") or {}
            late = False
            if nxt.get("pickup_by_end"):
                eta = now + timedelta(minutes=(pred.get("median_remaining_min") or 30)) + timedelta(hours=nl.get("drive_to_pickup_h") or h["drive_to_safe_h"])
                late = eta > datetime.fromisoformat(nxt["pickup_by_end"])
            infeasible = nl and not nl["with_predicted_wait"]["feasible"]
            if late or infeasible:
                why = nl.get("verdict") if infeasible else "would miss the pickup window"
                upsert_exception("next_load_at_risk", "critical" if infeasible else "warn", unit, drv, vid, nxt["bill_number"],
                                 f"{drv}: next load {nxt['bill_number']} ({nxt['orig_city']} -> {nxt['dest_city']}) pickup by {(nxt.get('pickup_by_end') or '')[11:16]} — {why}",
                                 {"next": nxt, "feasibility": nl, "late": late}, ["find a relief driver (rescue)", "request revised appointment"])
    # resolve next-load exceptions whose load is no longer on that driver
    for e in rows("SELECT exception_id, driver_name, bill_number FROM exceptions WHERE status='open' AND kind='next_load_at_risk'"):
        still = row("SELECT 1 FROM assignments WHERE bill_number=? AND driver_name=? AND status IN ('offered','accepted')", e["bill_number"], e["driver_name"])
        if not still:
            S.conn.execute("UPDATE exceptions SET status='resolved', resolved_ts=?, resolution='load reassigned' WHERE exception_id=?", (now.isoformat(sep=" "), e["exception_id"]))
    # live severe 511 incidents become inbox items only when a tracked truck is within 15 km — otherwise they are map markers
    fleet_pos = rows("""SELECT t.unit, t.lat, t.lon FROM telemetry t JOIN (SELECT unit, MAX(sim_ts) m FROM telemetry GROUP BY unit) x ON x.unit=t.unit AND x.m=t.sim_ts""")
    scored = []
    for inc in [i for i in fetch_incidents() if i["severity"] == "severe"]:
        dists = sorted((haversine_km(f["lat"], f["lon"], inc["lat"], inc["lon"]), f["unit"]) for f in fleet_pos)
        near = [u for d, u in dists if d <= 15]
        if near:
            scored.append((dists[0][0], inc, near))
    # inbox gets at most the 3 closest live closures; everything else stays a map marker
    open_ids = {row("SELECT json_extract(detail_json,'$.id') i FROM exceptions WHERE exception_id=?", e["exception_id"])["i"]
                for e in rows("SELECT exception_id FROM exceptions WHERE status='open' AND kind='closure'")}
    for d, inc, near in sorted(scored, key=lambda x: x[0])[:3]:
        title = f"[511 live] {inc['road']} {inc['direction'] or ''}: {inc['description'][:100]} — {d:.0f} km from {', '.join(near[:3])}"
        upsert_exception("closure", "warn" if d <= 5 else "info", near[0], None, None, None, title,
                         {"id": str(inc["id"]), "lat": inc["lat"], "lon": inc["lon"], "radius_km": 8, "source": inc["source"], "lanes": inc["lanes"], "full_closure": inc["full_closure"], "near_units": near},
                         ["re-estimate ETAs for trucks in the corridor", "s.76 adverse conditions: possible 2 h extension — eligibility not assumed, review required"])
    keep = {str(inc["id"]) for _, inc, _ in sorted(scored, key=lambda x: x[0])[:3]}
    for e in rows("SELECT exception_id, json_extract(detail_json,'$.id') i, json_extract(detail_json,'$.source') src FROM exceptions WHERE status='open' AND kind='closure'"):
        if e["src"] and "511" in str(e["src"]) and e["i"] and e["i"] not in keep:
            S.conn.execute("UPDATE exceptions SET status='resolved', resolved_ts=?, resolution='no longer near a tracked truck' WHERE exception_id=?", (now.isoformat(sep=" "), e["exception_id"]))
    S.conn.execute("""UPDATE exceptions SET status='resolved', resolved_ts=?, resolution='expired' WHERE status='open' AND kind='closure'
                      AND julianday(?) - julianday(sim_ts) > 2.0/24""", (now.isoformat(sep=" "), now.isoformat(sep=" ")))
    # resolve exceptions whose visit closed
    S.conn.execute("""UPDATE exceptions SET status='resolved', resolved_ts=?, resolution='visit closed' WHERE status='open' AND visit_id IS NOT NULL
                      AND visit_id IN (SELECT visit_id FROM stop_visits WHERE state IN ('CHARGE_READY','REVIEW_REQUIRED'))""", (now.isoformat(sep=" "),))
    S.conn.commit()


@app.get("/exceptions")
def exceptions(status: str = "open"):
    out = rows("SELECT * FROM exceptions WHERE status=? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, sim_ts DESC", status)
    for e in out:
        e["detail"] = json.loads(e.pop("detail_json") or "{}")
        e["proposed_actions"] = json.loads(e.pop("proposed_actions_json") or "[]")
    return out


class ExceptionIn(BaseModel):
    kind: str
    severity: str = "warn"
    unit: str | None = None
    driver_name: str | None = None
    bill_number: str | None = None
    title: str
    detail: dict = {}
    proposed_actions: list[str] = []


@app.post("/exceptions")
def post_exception(e: ExceptionIn):
    upsert_exception(e.kind, e.severity, e.unit, e.driver_name, None, e.bill_number, e.title, e.detail, e.proposed_actions)
    S.conn.commit()
    return {"ok": True}


class ResolveIn(BaseModel):
    resolution: str
    status: str = "resolved"


@app.post("/exceptions/{exception_id}/resolve")
def resolve_exception(exception_id: int, r: ResolveIn):
    S.conn.execute("UPDATE exceptions SET status=?, resolved_ts=?, resolution=? WHERE exception_id=?", (r.status, now_sim().isoformat(sep=" "), r.resolution, exception_id))
    S.conn.commit()
    return {"ok": True}


# ---------------- assignments + rescue ----------------
class AssignIn(BaseModel):
    bill_number: str
    driver_name: str
    unit: str | None = None
    status: str = "offered"
    reason: dict | None = None


@app.post("/assignments")
def assign(a: AssignIn):
    ts = now_sim().isoformat(sep=" ")
    if a.status in ("offered", "accepted"):
        S.conn.execute("UPDATE assignments SET status='superseded', updated_ts=? WHERE bill_number=? AND status IN ('proposed','offered','accepted')", (ts, a.bill_number))
    S.conn.execute("INSERT INTO assignments (bill_number, driver_name, unit, status, reason_json, created_ts, updated_ts) VALUES (?,?,?,?,?,?,?)",
                   (a.bill_number, a.driver_name, a.unit, a.status, json.dumps(a.reason or {}), ts, ts))
    S.conn.commit()
    refresh_exceptions()
    return row("SELECT * FROM assignments ORDER BY assignment_id DESC LIMIT 1")


@app.get("/assignments")
def list_assignments(driver: str | None = None, active: int = 1):
    sql = """SELECT a.*, o.orig_city, o.dest_city, o.customer, o.load_type, o.weight_lbs,
                    COALESCE(json_extract(a.reason_json,'$.pickup_by_start'), l.pickup_by_start) pickup_by_start,
                    COALESCE(json_extract(a.reason_json,'$.pickup_by_end'), l.pickup_by_end) pickup_by_end, l.deliver_by_start
             FROM assignments a LEFT JOIN orders o ON o.bill_number=a.bill_number LEFT JOIN legs l ON l.bill_number=a.bill_number WHERE 1=1"""
    sql += " AND a.driver_name=?" if driver else ""
    sql += " AND a.status IN ('proposed','offered','accepted')" if active else ""
    return rows(sql + " GROUP BY a.assignment_id ORDER BY a.assignment_id DESC", *([driver] if driver else []))


class AssignmentStatusIn(BaseModel):
    status: str   # accepted | rejected
    actor: str


@app.post("/assignments/{assignment_id}/status")
def assignment_status(assignment_id: int, s: AssignmentStatusIn):
    S.conn.execute("UPDATE assignments SET status=?, updated_ts=? WHERE assignment_id=?", (s.status, now_sim().isoformat(sep=" "), assignment_id))
    S.conn.commit()
    refresh_exceptions()
    return row("SELECT * FROM assignments WHERE assignment_id=?", assignment_id)


@app.get("/rescue/{bill_number}")
def rescue(bill_number: str, exclude_driver: str | None = None):
    """Rank drivers who could take this load instead. Uses latest telemetry position, duty logs, assigned trailer type."""
    now = now_sim()
    o = row("SELECT * FROM orders WHERE bill_number=?", bill_number)
    if not o:
        raise HTTPException(404, "unknown bill")
    l = row("SELECT pickup_by_end, trailer1 FROM legs WHERE bill_number=? ORDER BY seq LIMIT 1", bill_number) or {}
    a = row("SELECT json_extract(reason_json,'$.pickup_by_end') pbe FROM assignments WHERE bill_number=? ORDER BY assignment_id DESC LIMIT 1", bill_number) or {}
    pbe = a.get("pbe") or l.get("pickup_by_end")
    load = {"bill_number": bill_number, "orig_lat": o["orig_lat"], "orig_lon": o["orig_lon"], "dest_lat": o["dest_lat"], "dest_lon": o["dest_lon"],
            "pickup_by_end": datetime.fromisoformat(pbe) if pbe else None,
            "load_type": o["load_type"], "weight_lbs": o["weight_lbs"], "distance_km": (o["distance"] or 0) * 1.609 if o["distance"] else None}
    cands = []
    for t in rows("""SELECT t.unit, t.driver_name, t.lat, t.lon, t.duty_status FROM telemetry t
                     JOIN (SELECT unit, MAX(sim_ts) m FROM telemetry GROUP BY unit) x ON x.unit=t.unit AND x.m=t.sim_ts"""):
        d = row("SELECT cycle, status FROM drivers WHERE name=?", t["driver_name"]) or {}
        tr = row("SELECT tr.trailer_type, tr.capacity_lbs FROM legs l JOIN trailers tr ON tr.trailer_number=l.trailer1 WHERE l.driver_name=? ORDER BY l.plan_depart DESC LIMIT 1", t["driver_name"]) or {}
        busy = row("""SELECT v.visit_id, v.stop_kind, f.city, v.property_entered_ts FROM stop_visits v JOIN facilities f ON f.facility_id=v.facility_id
                      WHERE v.unit=? AND v.state IN ('PROPERTY_ENTERED','CHECKED_IN','AT_DOCK','SERVICE_COMPLETE')""", t["unit"])
        busy_until = None
        if busy:
            elapsed = (now - datetime.fromisoformat(busy["property_entered_ts"])).total_seconds() / 60
            pr = predict_remaining(S.conn, None, busy["city"], busy["stop_kind"] if busy["stop_kind"] in ("pickup", "delivery") else "delivery", elapsed)
            busy_until = now + timedelta(minutes=pr.get("median_remaining_min") or 30)
        cands.append({"driver_name": t["driver_name"], "unit": t["unit"], "lat": t["lat"], "lon": t["lon"], "status": d.get("status"), "cycle": norm_cycle(d.get("cycle")),
                      "trailer_type": tr.get("trailer_type"), "trailer_capacity_lbs": tr.get("capacity_lbs"), "busy_until": busy_until})
    logs = {c["driver_name"]: duty_log(c["driver_name"]) for c in cands}
    ranked = rank_candidates(now, load, cands, logs, exclude={exclude_driver} if exclude_driver else set())
    return {"bill_number": bill_number, "load": {k: (v.isoformat(sep=" ") if isinstance(v, datetime) else v) for k, v in load.items()},
            "candidates": ranked, "note": "eligibility filters + ranking with reasons; no legal candidate means exactly that"}


# ---------------- Ontario 511 live incidents ----------------
_INC_CACHE: dict = {"ts": None, "data": []}
REGION = {"lat_min": 42.95, "lat_max": 44.45, "lon_min": -81.45, "lon_max": -78.20}
HWYS = ("401", "403", "400", "QEW", "407", "410", "427", "404", "409", "406", "402")


def fetch_incidents() -> list[dict]:
    """Live Ontario 511 events inside the Southern Ontario region on 400-series highways. Cached 60 s (the
    feed allows 10 calls / 60 s). Each event carries a severity class we derive: 'severe' = collision or a
    full mainline closure; 'lane' = lanes affected; 'minor' = ramps and nightly maintenance."""
    import httpx
    now_wall = datetime.now()
    if _INC_CACHE["ts"] and (now_wall - _INC_CACHE["ts"]).total_seconds() < 60:
        return _INC_CACHE["data"]
    try:
        raw = httpx.get("https://511on.ca/api/v2/get/event", timeout=15).json()
    except Exception:
        return _INC_CACHE["data"]
    out = []
    for e in raw:
        lat, lon = e.get("Latitude"), e.get("Longitude")
        if lat is None or not (REGION["lat_min"] <= lat <= REGION["lat_max"] and REGION["lon_min"] <= lon <= REGION["lon_max"]):
            continue
        road = e.get("RoadwayName") or ""
        if not any(h in road for h in HWYS):
            continue
        desc = e.get("Description") or ""
        is_ramp = "ramp" in desc.lower()
        if e.get("EventType") == "accidentsAndIncidents" or (e.get("IsFullClosure") and not is_ramp):
            sev = "severe"
        elif e.get("LanesAffected") and not is_ramp:
            sev = "lane"
        else:
            sev = "minor"
        out.append({"id": e.get("ID"), "type": e.get("EventType"), "subtype": e.get("EventSubType"), "road": road, "direction": e.get("DirectionOfTravel"),
                    "lat": lat, "lon": lon, "description": desc[:220], "lanes": e.get("LanesAffected"), "full_closure": bool(e.get("IsFullClosure")),
                    "severity": sev, "updated": e.get("LastUpdated"), "source": "Ontario 511 (live)"})
    _INC_CACHE.update(ts=now_wall, data=out)
    return out


@app.get("/incidents")
def incidents(min_severity: str = "minor"):
    rank = {"minor": 0, "lane": 1, "severe": 2}
    data = [i for i in fetch_incidents() if rank[i["severity"]] >= rank.get(min_severity, 0)]
    return {"count": len(data), "fetched_at": _INC_CACHE["ts"].isoformat(sep=" ") if _INC_CACHE["ts"] else None, "incidents": data,
            "note": "Ontario 511 open data, region-filtered to 400-series highways; severity classes are ours"}


# ---------------- snapshot + stream ----------------
@app.get("/snapshot")
def snapshot():
    now = now_sim()
    fleet = rows("""SELECT t.unit, t.driver_name, t.lat, t.lon, t.speed_kmh, t.heading, t.odometer_km, t.duty_status, t.sim_ts FROM telemetry t
                    JOIN (SELECT unit, MAX(sim_ts) m FROM telemetry GROUP BY unit) x ON x.unit=t.unit AND x.m=t.sim_ts""")
    for f in fleet:
        v = row("SELECT visit_id, state, facility_id FROM stop_visits WHERE unit=? AND state NOT IN ('CHARGE_READY','REVIEW_REQUIRED') ORDER BY visit_id DESC LIMIT 1", f["unit"])
        f["visit"] = v
        log = duty_log(f["driver_name"]) if f["driver_name"] else []
        if log:
            d = row("SELECT cycle FROM drivers WHERE name=?", f["driver_name"]) or {}
            c = compute_clocks(log, now, norm_cycle(d.get("cycle")))
            f["hos"] = {"remaining_drive_h": c.remaining_drive_h, "remaining_onduty_h": c.remaining_onduty_h, "remaining_elapsed_h": c.remaining_elapsed_h, "binding": c.binding, "status": c.current_status,
                        "provenance": duty_provenance(f["driver_name"])["history"], "cycle_note": cycle_note(d.get("cycle"))}
    return {"sim": get_clock(), "fleet": fleet, "visits": visits(1), "exceptions": exceptions("open"),
            "charges": charges()[:20], "assignments": list_assignments(None, 1)[:50]}


@app.get("/trace/{unit}")
def trace(unit: str, since: str | None = None, points: int = 120):
    """Track & trace for one unit: distance and time from telemetry, speed series (downsampled), stops timeline."""
    pings = rows("SELECT sim_ts, lat, lon, speed_kmh, odometer_km, duty_status FROM telemetry WHERE unit=? AND sim_ts >= ? ORDER BY sim_ts", unit, since or "0000")
    if not pings:
        raise HTTPException(404, "no telemetry for unit")
    moving = [p for p in pings if (p["speed_kmh"] or 0) > 3]
    t0, t1 = datetime.fromisoformat(pings[0]["sim_ts"]), datetime.fromisoformat(pings[-1]["sim_ts"])
    span_h = max(0.0, (t1 - t0).total_seconds() / 3600)
    # time buckets from consecutive pings
    move_h = stop_h = 0.0
    for a, b in zip(pings, pings[1:]):
        dt = (datetime.fromisoformat(b["sim_ts"]) - datetime.fromisoformat(a["sim_ts"])).total_seconds() / 3600
        if (a["speed_kmh"] or 0) > 3:
            move_h += dt
        else:
            stop_h += dt
    odo0 = next((p["odometer_km"] for p in pings if p["odometer_km"] is not None), None)
    odo1 = next((p["odometer_km"] for p in reversed(pings) if p["odometer_km"] is not None), None)
    dist = round((odo1 - odo0), 1) if odo0 is not None and odo1 is not None else None
    step = max(1, len(pings) // points)
    series = [{"t": p["sim_ts"][11:16], "kmh": round(p["speed_kmh"] or 0), "duty": p["duty_status"]} for p in pings[::step]]
    visits = rows("""SELECT v.visit_id, f.name facility, v.stop_kind, v.state, v.property_entered_ts, v.gate_exited_ts, v.physical_dwell_min, v.billable_min
                     FROM stop_visits v JOIN facilities f ON f.facility_id=v.facility_id WHERE v.unit=? ORDER BY v.approach_ts""", unit)
    for v in visits:
        if v["physical_dwell_min"] is None and v["property_entered_ts"]:
            v["physical_dwell_min"] = round((now_sim() - datetime.fromisoformat(v["property_entered_ts"])).total_seconds() / 60, 1)
    return {"unit": unit, "driver_name": pings[-1].get("driver_name") if "driver_name" in pings[-1].keys() else None,
            "window": [pings[0]["sim_ts"], pings[-1]["sim_ts"]], "span_h": round(span_h, 2),
            "distance_km": dist, "moving_h": round(move_h, 2), "stopped_h": round(stop_h, 2),
            "avg_moving_kmh": round(sum(p["speed_kmh"] for p in moving) / len(moving), 1) if moving else 0,
            "max_kmh": round(max((p["speed_kmh"] or 0) for p in pings), 1), "pings": len(pings),
            "speed_series": series, "stops": visits,
            "source": "simulated telemetry" if all(True for _ in [0]) else "telemetry"}


@app.get("/breadcrumbs/{unit}")
def breadcrumbs(unit: str, since: str | None = None, limit: int = 2000):
    return rows("SELECT sim_ts, lat, lon, speed_kmh, duty_status FROM telemetry WHERE unit=? AND sim_ts >= ? ORDER BY sim_ts LIMIT ?", unit, since or "0000", limit)


@app.get("/stream")
async def stream():
    async def gen():
        while True:
            yield {"event": "snapshot", "data": json.dumps(snapshot(), default=str)}
            await asyncio.sleep(1.0)
    return EventSourceResponse(gen())
