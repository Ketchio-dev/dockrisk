"""Standalone fleet telemetry simulator. Separate process from the API, talks to it over HTTP only.

    uv run python -m sim.main --scenario dock_squeeze --speed 60 --reset

One deterministic virtual clock drives everything. Trucks follow real road geometry from OSRM (cached),
stop inside facility polygons for scripted dwell times, and stream pings to /ingest/telemetry. Scenario
events (dock wait extension, 401 slowdown) are scripted by sim time, so a reset replays identically.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
ROUTES = ROOT / "data/geo/routes.json"
OSRM = "https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson"

LINEHAUL_KMH = 82.0
LOCAL_KMH = 32.0
LOCAL_RADIUS_KM = 3.0
GPS_JITTER_M = 4.0


def haversine_km(a, b):
    lat1, lon1 = a; lat2, lon2 = b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def route(a, b) -> list[tuple[float, float]]:
    """(lat, lon) polyline from a to b via OSRM, cached on disk. Falls back to a straight line."""
    key = f"{a[0]:.4f},{a[1]:.4f};{b[0]:.4f},{b[1]:.4f}"
    cache = json.loads(ROUTES.read_text()) if ROUTES.exists() else {}
    if key in cache:
        return [tuple(p) for p in cache[key]]
    try:
        r = httpx.get(OSRM.format(lat1=a[0], lon1=a[1], lat2=b[0], lon2=b[1]), timeout=20).json()
        pts = [(lat, lon) for lon, lat in r["routes"][0]["geometry"]["coordinates"]]
    except Exception as e:
        print(f"!! OSRM unavailable for {key}: {e} — using a straight line (visible on the map; do not demo like this)", flush=True)
        pts = [a, b]
    cache[key] = pts
    ROUTES.parent.mkdir(parents=True, exist_ok=True)
    ROUTES.write_text(json.dumps(cache))
    return pts


@dataclass
class Stop:
    facility: dict
    stop_kind: str
    bill_number: str | None
    appointment: datetime | None
    dwell_min: float               # scripted dwell inside the dock zone
    customer: str | None = None
    auto_driver_events: bool = True   # background trucks confirm check-in/release themselves


@dataclass
class Truck:
    unit: str
    driver: str
    cycle: int
    remaining_cycle_h: float
    shift_onduty_so_far_h: float
    stops: list[Stop]
    pos: tuple[float, float]
    odometer_km: float = 0.0
    path: list[tuple[float, float]] = field(default_factory=list)
    path_i: int = 0
    seg_frac: float = 0.0
    state: str = "en_route"          # en_route | at_facility | done
    dwell_left_s: float = 0.0
    stop_i: int = 0
    visit_id: int | None = None
    checked_in: bool = False
    speed_kmh: float = 0.0
    heading: float = 0.0
    duty: str = "driving"
    slow_factor: float = 1.0
    park_at: tuple[float, float] | None = None   # where to go after the last stop (yard); None = 3 km north of the last stop
    parked_pings: int = 0


class Sim:
    def __init__(self, api: str, speed: float, tick_s: int, seed: int):
        self.api = api.rstrip("/")
        self.speed = speed
        self.tick = tick_s
        self.rng = random.Random(seed)
        self.seed = seed
        self.http = httpx.Client(timeout=30)
        self.trucks: list[Truck] = []
        self.events: list[tuple[datetime, str, dict]] = []
        self.t: datetime = datetime(2026, 9, 8, 7, 30)
        self.closure: dict | None = None

    # ---------- API helpers (survive an API restart: retry connection errors and 5xx for up to ~90 s) ----------
    def _retry(self, fn, what):
        delay, waited = 0.5, 0.0
        while True:
            try:
                r = fn()
                if r.status_code >= 500:
                    raise httpx.HTTPStatusError(f"{r.status_code}", request=r.request, response=r)
                r.raise_for_status()
                return r.json()
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.HTTPStatusError) as e:
                if isinstance(e, httpx.HTTPStatusError) and e.response is not None and e.response.status_code < 500:
                    raise
                if waited >= 90:
                    raise
                if waited == 0:
                    print(f"!! API unreachable ({what}): {type(e).__name__} — retrying", flush=True)
                time.sleep(delay)
                waited += delay
                delay = min(delay * 1.6, 5.0)

    def get(self, path, **params):
        return self._retry(lambda: self.http.get(f"{self.api}{path}", params=params), f"GET {path}")

    def post(self, path, body):
        return self._retry(lambda: self.http.post(f"{self.api}{path}", json=body), f"POST {path}")

    # ---------- scenario ----------
    def build_dock_squeeze(self):
        """Hero: a driver with thin hours delivers to the London DC for a 10:00 appointment, the dock holds
        the truck ~2h50, and a next pickup in Kitchener at 13:30 is on the board. Five background trucks
        run short city legs between centroid facilities."""
        fac = {f["name"]: f for f in self.get("/facilities")}
        by_city = {}
        rank = {"demo": 0, "hand": 0, "osm": 1, "centroid": 9}
        for f in sorted(fac.values(), key=lambda x: rank.get(x["source"], 5)):   # real geometry first, centroids last
            by_city.setdefault(f["city"], f)
        milton, london = fac["Milton DC (demo geometry)"], fac["London DC (demo geometry)"]
        drivers = self.get("/drivers")
        units = ["B3339", "B8269", "B4102", "B5570", "B6011", "B7234", "B9001", "B9002"]
        # hero driver: pick the real driver with the lowest positive remaining_can_7
        cands = sorted((d for d in drivers if d["remaining_can_7"] and 4 <= d["remaining_can_7"] <= 12 and d["lat"]), key=lambda d: d["remaining_can_7"])
        hero = cands[0] if cands else drivers[0]
        others = [d for d in drivers if d["name"] != hero["name"] and d["remaining_can_7"] and d["remaining_can_7"] > 30 and d["lat"]][:5]
        day = self.t.replace(hour=0, minute=0)
        orders = [o for o in self.get("/orders", region=1, limit=1000) if o["orig_lat"] and o["dest_lat"]]
        used: set[str] = set()
        def pick_bill(o_city, d_city):
            for cond in (lambda o: (o["orig_city"] or "").upper() == o_city and (o["dest_city"] or "").upper() == d_city,
                         lambda o: (o["orig_city"] or "").upper() == o_city,
                         lambda o: (o["dest_city"] or "").upper() == d_city,
                         lambda o: True):
                for o in orders:
                    if o["bill_number"] not in used and cond(o):
                        used.add(o["bill_number"])
                        return o
            return orders[0]
        hero_bill = pick_bill("MILTON", "LONDON")
        next_bill = pick_bill("LONDON", "KITCHENER")
        self.trucks.append(Truck(
            unit=units[0], driver=hero["name"], cycle=hero["cycle"] or 1, remaining_cycle_h=hero["remaining_can_7"],
            shift_onduty_so_far_h=7.25,  # 7.25 h on duty before this run: the next load is feasible at arrival and dies during the dock wait
            stops=[Stop(london, "delivery", hero_bill["bill_number"], day + timedelta(hours=10), dwell_min=170, customer=hero_bill["customer"], auto_driver_events=False)],
            pos=(milton["lat"], milton["lon"]), park_at=(london["lat"] + 0.025, london["lon"] - 0.02)))
        self.hero = self.trucks[0]
        self.hero_next = next_bill
        # background trucks: two short legs each between centroid cities
        cities = [c for c in ("MISSISSAUGA", "BRAMPTON", "GUELPH", "CAMBRIDGE", "WHITBY", "OSHAWA", "HAMILTON", "BURLINGTON", "OAKVILLE", "KITCHENER") if c in by_city]
        def appt_after(start_pos, dest, t0, extra_min=15):
            """Appointment = expected arrival (great-circle x1.3 at 75 km/h) + slack, rounded up to the quarter hour."""
            km = haversine_km(start_pos, dest) * 1.3
            eta = t0 + timedelta(hours=km / 75.0, minutes=extra_min)
            return eta.replace(minute=(eta.minute // 15) * 15, second=0) + timedelta(minutes=15)
        for i, d in enumerate(others):
            a, b = cities[(2 * i) % len(cities)], cities[(2 * i + 1) % len(cities)]
            bill = pick_bill(a, b)
            start = (by_city[cities[(2 * i + 3) % len(cities)]]["lat"], by_city[cities[(2 * i + 3) % len(cities)]]["lon"])
            fa, fb = by_city[a], by_city[b]
            t_pick = appt_after(start, (fa["lat"], fa["lon"]), self.t)
            t_delv = appt_after((fa["lat"], fa["lon"]), (fb["lat"], fb["lon"]), t_pick + timedelta(minutes=40 + 10 * i))
            self.trucks.append(Truck(
                unit=units[i + 1], driver=d["name"], cycle=d["cycle"] or 1, remaining_cycle_h=d["remaining_can_7"], shift_onduty_so_far_h=1.0 + i * 0.5,
                stops=[Stop(fa, "pickup", bill["bill_number"], t_pick, dwell_min=40 + 10 * i, customer=bill["customer"]),
                       Stop(fb, "delivery", bill["bill_number"], t_delv, dwell_min=35 + 15 * i, customer=bill["customer"])],
                pos=start))
        # relief trucks on standby (no stops): the rescue candidates. Parked at centroid facilities near the corridor.
        relief_cities = [c for c in ("WOODSTOCK", "CAMBRIDGE", "KITCHENER", "GUELPH") if c in by_city][:2]
        fresh = [d for d in drivers if d["name"] not in {t.driver for t in self.trucks} and d["remaining_can_7"] and d["remaining_can_7"] > 45][:2]
        for i, (c, d) in enumerate(zip(relief_cities, fresh)):
            f = by_city[c]
            self.trucks.append(Truck(unit=units[6 + i] if len(units) > 6 + i else f"R{i+1}", driver=d["name"], cycle=d["cycle"] or 1, remaining_cycle_h=d["remaining_can_7"],
                                     shift_onduty_so_far_h=0.5 + i, stops=[], pos=(f["lat"] + 0.02, f["lon"] + 0.02), state="standby"))
        # scripted events. The corridor slowdown is taken from a REAL Ontario 511 incident on the 401/403 between
        # Milton and London when one exists right now; otherwise a synthetic one, labeled as such.
        live = []
        try:
            live = [i for i in self.get("/incidents", min_severity="lane")["incidents"] if any(h in i["road"] for h in ("401", "403"))
                    and 42.9 <= i["lat"] <= 43.7 and -81.4 <= i["lon"] <= -79.7]
        except Exception:
            pass
        live.sort(key=lambda i: (0 if i["severity"] == "severe" else 1))
        if live:
            i = live[0]
            # its own id namespace: the API's live-511 poller owns ids that match the feed, and prunes them by proximity
            ev = {"title": f"[511 live] {i['road']} {i['direction'] or ''}: {i['description'][:90]}", "factor": 0.45 if i["severity"] == "severe" else 0.7,
                  "lat": i["lat"], "lon": i["lon"], "radius_km": 8, "source": f"scenario corridor event, from {i['source']}", "id": f"scenario:{i['id']}"}
        else:
            ev = {"title": "HWY 401 WB near Cambridge: collision, 2 lanes blocked (simulated — no live 511 incident on the corridor right now)",
                  "factor": 0.45, "lat": 43.39, "lon": -80.35, "radius_km": 12, "source": "simulated", "id": "scenario:cambridge"}
        self.events = [(self.t + timedelta(minutes=25), "closure", ev)]

    def seed_api(self, reset: bool):
        if reset:
            self.post("/sim/reset", {})
        self.post("/sim/clock", {"sim_ts": self.t.isoformat(sep=" "), "speed": self.speed, "running": True, "scenario": "dock_squeeze", "seed": self.seed})
        for tr in self.trucks:
            self.post("/hos/seed", {"driver_name": tr.driver, "as_of": self.t.isoformat(sep=" "), "remaining_cycle_h": tr.remaining_cycle_h,
                                    "cycle": tr.cycle, "on_duty_now": True, "shift_onduty_so_far_h": tr.shift_onduty_so_far_h})
            self.post("/ingest/duty", {"driver_name": tr.driver, "ts": self.t.isoformat(sep=" "), "status": "driving" if tr.stops else "on_duty", "source": "sim", "note": "departed" if tr.stops else "standby at yard"})
            for st in tr.stops:
                if st.bill_number:
                    self.post("/assignments", {"bill_number": st.bill_number, "driver_name": tr.driver, "unit": tr.unit, "status": "accepted",
                                               "reason": {"source": "sim scenario", "stop": st.stop_kind}})
            if tr.stops:
                tr.path = route(tr.pos, (tr.stops[0].facility["lat"], tr.stops[0].facility["lon"]))
        # the hero's NEXT load: on the board, pickup window 13:00-13:30 in Kitchener
        day = self.t.replace(hour=0, minute=0)
        self.post("/assignments", {"bill_number": self.hero_next["bill_number"], "driver_name": self.hero.driver, "unit": self.hero.unit, "status": "accepted",
                                   "reason": {"source": "sim scenario", "note": "next load after the London delivery",
                                              "pickup_by_start": (day + timedelta(hours=13)).isoformat(sep=" "), "pickup_by_end": (day + timedelta(hours=13, minutes=30)).isoformat(sep=" ")}})

    # ---------- motion ----------
    def step_truck(self, tr: Truck, dt_s: float) -> dict | None:
        if tr.state == "done":
            return None
        if tr.state == "standby":
            tr.speed_kmh, tr.duty = 0.0, "on_duty"
            return self.ping(tr, Stop({}, "standby", None, None, 0))
        stop = tr.stops[tr.stop_i] if tr.stop_i < len(tr.stops) else Stop({}, "yard", None, None, 0)
        if tr.state == "at_facility":
            tr.speed_kmh = 0.0
            tr.duty = "on_duty"
            tr.dwell_left_s -= dt_s
            # background trucks confirm check-in shortly after arrival, and release at the end
            if stop.auto_driver_events and tr.visit_id and not tr.checked_in and tr.dwell_left_s < stop.dwell_min * 60 - 300:
                self.post(f"/visits/{tr.visit_id}/driver-event", {"kind": "arrival_class", "actor": tr.driver, "ts": self.t.isoformat(sep=" "), "payload": {"value": "on_time"}})
                self.post(f"/visits/{tr.visit_id}/driver-event", {"kind": "checked_in", "actor": tr.driver, "ts": self.t.isoformat(sep=" ")})
                tr.checked_in = True
            if tr.dwell_left_s <= 0:
                if stop.auto_driver_events and tr.visit_id:
                    self.post(f"/visits/{tr.visit_id}/driver-event", {"kind": "released", "actor": tr.driver, "ts": self.t.isoformat(sep=" ")})
                tr.stop_i += 1
                tr.checked_in = False
                tr.visit_id = None
                if tr.stop_i >= len(tr.stops):
                    # leave the property so the visit finalizes, then park and go off duty
                    dest = tr.park_at or (tr.pos[0] + 0.03, tr.pos[1])
                    tr.path = route(tr.pos, dest)
                    tr.path_i, tr.seg_frac, tr.state, tr.duty = 0, 0.0, "to_yard", "driving"
                    return self.ping(tr, stop)
                nxt = tr.stops[tr.stop_i]
                tr.path = route(tr.pos, (nxt.facility["lat"], nxt.facility["lon"]))
                tr.path_i, tr.seg_frac, tr.state, tr.duty = 0, 0.0, "en_route", "driving"
            return self.ping(tr, stop)
        if tr.state == "parked":
            tr.parked_pings += 1
            tr.speed_kmh, tr.duty = 0.0, "off"
            if tr.parked_pings > 6:
                tr.state = "done"
            return self.ping(tr, Stop({}, "parked", None, None, 0))
        # en_route / to_yard: advance along the polyline
        dest = tr.path[-1] if tr.state == "to_yard" else (stop.facility["lat"], stop.facility["lon"])
        near = haversine_km(tr.pos, dest) < LOCAL_RADIUS_KM
        base = LOCAL_KMH if near else LINEHAUL_KMH
        factor = tr.slow_factor if self.closure and haversine_km(tr.pos, (self.closure["lat"], self.closure["lon"])) < self.closure["radius_km"] else 1.0
        v = base * factor * (0.95 + 0.1 * self.rng.random())
        remaining_km = v * dt_s / 3600
        while remaining_km > 0 and tr.path_i < len(tr.path) - 1:
            a, b = tr.path[tr.path_i], tr.path[tr.path_i + 1]
            seg = haversine_km(a, b)
            left = seg * (1 - tr.seg_frac)
            if remaining_km >= left:
                remaining_km -= left
                tr.odometer_km += left
                tr.path_i += 1
                tr.seg_frac = 0.0
                tr.pos = b
            else:
                tr.seg_frac += remaining_km / seg if seg else 1
                tr.odometer_km += remaining_km
                tr.pos = (a[0] + (b[0] - a[0]) * tr.seg_frac, a[1] + (b[1] - a[1]) * tr.seg_frac)
                tr.heading = (math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) + 360) % 360
                remaining_km = 0
        tr.speed_kmh = v
        if tr.path_i >= len(tr.path) - 1:
            tr.pos = dest
            if tr.state == "to_yard":
                tr.state, tr.speed_kmh, tr.duty = "parked", 0.0, "off"
                self.post("/ingest/duty", {"driver_name": tr.driver, "ts": self.t.isoformat(sep=" "), "status": "off", "source": "sim", "note": "parked at yard, end of run"})
            else:
                # arrived: park in the dock zone and start the scripted dwell
                tr.state = "at_facility"
                tr.dwell_left_s = stop.dwell_min * 60
                tr.speed_kmh = 0.0
                tr.duty = "on_duty"
        return self.ping(tr, stop)

    def ping(self, tr: Truck, stop: Stop) -> dict:
        j = GPS_JITTER_M / 111320
        return {"sim_ts": self.t.isoformat(sep=" "), "unit": tr.unit, "driver_name": tr.driver,
                "lat": tr.pos[0] + self.rng.uniform(-j, j), "lon": tr.pos[1] + self.rng.uniform(-j, j),
                "speed_kmh": round(tr.speed_kmh, 1), "heading": round(tr.heading, 0), "odometer_km": round(tr.odometer_km, 2),
                "duty_status": tr.duty, "ignition": tr.state != "done",
                "context": {"bill_number": stop.bill_number, "stop_kind": stop.stop_kind, "customer": stop.customer,
                            "appointment_start_ts": stop.appointment.isoformat(sep=" ") if stop.appointment else None}}

    def dispatch_relief(self):
        """Standby trucks that accepted a rescue offer start driving to the pickup; the load's origin
        becomes a pickup stop and its destination a delivery stop."""
        for tr in self.trucks:
            if tr.state != "standby":
                continue
            acc = [a for a in self.get("/assignments", driver=tr.driver, active=1) if a["status"] == "accepted"]
            if not acc:
                continue
            a = acc[0]
            try:
                o = self.get(f"/orders/{a['bill_number']}")
            except httpx.HTTPStatusError as e:
                # an accepted assignment for a bill the export does not have: nothing to drive to; leave the truck on standby
                print(f"[{self.t:%H:%M}] !! {tr.unit} accepted {a['bill_number']} but the order is unknown ({e.response.status_code}); staying on standby", flush=True)
                continue
            fac_o = {"facility_id": None, "name": f"{o['orig_city']} pickup", "lat": o["orig_lat"], "lon": o["orig_lon"], "city": o["orig_city"]}
            fac_d = {"facility_id": None, "name": f"{o['dest_city']} delivery", "lat": o["dest_lat"], "lon": o["dest_lon"], "city": o["dest_city"]}
            pbe = a.get("pickup_by_end")
            tr.stops = [Stop(fac_o, "pickup", a["bill_number"], datetime.fromisoformat(a["pickup_by_start"]) if a.get("pickup_by_start") else None, dwell_min=45, customer=o.get("customer")),
                        Stop(fac_d, "delivery", a["bill_number"], None, dwell_min=40, customer=o.get("customer"))]
            tr.stop_i, tr.path_i, tr.seg_frac = 0, 0, 0.0
            tr.path = route(tr.pos, (fac_o["lat"], fac_o["lon"]))
            tr.state, tr.duty = "en_route", "driving"
            self.post("/ingest/duty", {"driver_name": tr.driver, "ts": self.t.isoformat(sep=" "), "status": "driving", "source": "sim", "note": f"rescue: en route to pickup {a['bill_number']}"})
            print(f"[{self.t:%H:%M}] {tr.unit} {tr.driver} accepted {a['bill_number']} -> driving to {o['orig_city']} (pickup by {pbe})", flush=True)

    def fire_events(self):
        while self.events and self.events[0][0] <= self.t:
            _, kind, e = self.events.pop(0)
            if kind == "closure":
                self.closure = e
                for tr in self.trucks:
                    tr.slow_factor = e["factor"]
                self.post("/exceptions", {"kind": "closure", "severity": "warn", "title": e["title"],
                                          "detail": {"id": e.get("id"), "lat": e["lat"], "lon": e["lon"], "radius_km": e["radius_km"], "speed_factor": e["factor"], "source": e.get("source", "simulated")},
                                          "proposed_actions": ["re-estimate ETAs for trucks in the corridor",
                                                               "s.76 adverse conditions: possible 2 h extension — eligibility not assumed, review required"]})

    def control(self) -> str:
        """Read the shared clock row. Returns 'run', 'pause' or 'reset' (row missing => the UI reset the scenario)."""
        try:
            c = self.get("/sim/clock")
        except Exception:
            return "run"
        if "id" not in c:
            return "reset"
        if c.get("speed") and float(c["speed"]) != self.speed:
            self.speed = float(c["speed"])
            print(f"[{self.t:%H:%M}] speed -> x{self.speed}", flush=True)
        return "run" if c.get("running") else "pause"

    def rebuild(self, reset: bool):
        """Start the scenario over from t0 with the same seed: identical replay."""
        self.rng = random.Random(self.seed)
        self.trucks = []
        self.closure = None
        self.t = datetime(2026, 9, 8, 7, 30)
        self.build_dock_squeeze()
        self.seed_api(reset)
        print(f"[{self.t:%H:%M}] scenario rebuilt (seed {self.seed})", flush=True)

    def run(self, max_sim_hours: float):
        end = self.t + timedelta(hours=max_sim_hours)
        wall_per_tick = self.tick / self.speed
        n = 0
        while True:
            if self.t >= end or not any(tr.state not in ("done", "standby") for tr in self.trucks):
                # finished: idle until the UI resets, so the demo can be replayed without restarting the process
                self.post("/sim/clock", {"sim_ts": self.t.isoformat(sep=" "), "speed": self.speed, "running": False})
                print("scenario finished — waiting for reset", flush=True)
                while self.control() != "reset":
                    time.sleep(1.0)
                self.rebuild(reset=False)
                end = self.t + timedelta(hours=max_sim_hours)
                continue
            t0 = time.time()
            state = self.control() if n % 2 == 0 else "run"
            if state == "reset":
                self.rebuild(reset=False)
                end = self.t + timedelta(hours=max_sim_hours)
                continue
            if state == "pause":
                time.sleep(0.5)
                continue
            wall_per_tick = self.tick / self.speed
            self.fire_events()
            if n % 4 == 0:
                self.dispatch_relief()
            pings = [p for p in (self.step_truck(tr, self.tick) for tr in self.trucks) if p]
            if pings:
                res = self.post("/ingest/telemetry", {"pings": pings, "source": "sim",
                                                      "clock": {"sim_ts": self.t.isoformat(sep=" "), "speed": self.speed, "running": True}})
                for ev in res.get("geofence_events", []):
                    tr = next(x for x in self.trucks if x.unit == ev["unit"])
                    if ev["zone"] == "property" and ev["event"] == "enter":
                        tr.visit_id = ev["visit_id"]
                    print(f"[{self.t:%H:%M}] {ev['unit']} {ev['event']} {ev['zone']} @ {ev['facility']} (visit {ev['visit_id']})", flush=True)
            self.t += timedelta(seconds=self.tick)
            n += 1
            if n % 20 == 0:
                print(f"[{self.t:%H:%M}] " + " | ".join(f"{tr.unit}:{tr.state[:3]} {tr.speed_kmh:.0f}km/h" for tr in self.trucks), flush=True)
            time.sleep(max(0.0, wall_per_tick - (time.time() - t0)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--scenario", default="dock_squeeze")
    ap.add_argument("--speed", type=float, default=60.0, help="sim seconds per wall second")
    ap.add_argument("--tick", type=int, default=30, help="sim seconds per ping")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--hours", type=float, default=7.0, help="sim hours per replay; the process then waits for a UI reset")
    ap.add_argument("--reset", action="store_true")
    a = ap.parse_args()
    sim = Sim(a.api, a.speed, a.tick, a.seed)
    sim.build_dock_squeeze()
    sim.seed_api(a.reset)
    print(f"scenario {a.scenario}: {len(sim.trucks)} trucks, hero {sim.hero.driver}/{sim.hero.unit}, start {sim.t}, speed x{a.speed}", flush=True)
    sim.run(a.hours)


if __name__ == "__main__":
    main()
