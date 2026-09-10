"""SQLite store for the canonical schema. One file, WAL mode, no ORM.

Grain rules that downstream engines rely on:
- orders: one row per bill string (split bills like '409186-AA' are distinct rows; bill_root joins them)
- legs: one row per LEGSUMMARY leg
- stop_visits: one row per (unit, facility, visit episode) — the detention grain
- visit_events: append-only ledger of state transitions with provenance
- detention_charges: at most one per visit (UNIQUE), replay-safe
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "roadstar.db"

DDL = """
CREATE TABLE IF NOT EXISTS drivers (
  driver_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, email TEXT, home_zone TEXT, driver_type TEXT, pay_type TEXT,
  cycle INTEGER, cycle_zone TEXT, status TEXT, active_in_disp INTEGER,
  current_duty INTEGER, duty_at TEXT, hos_violation_at TEXT,
  remaining_hours REAL, remaining_can_7 REAL, remaining_can_8 REAL, remaining_can_14 REAL,
  remaining_us_7 REAL, remaining_us_8 REAL, dot_clock_remain REAL,
  lat REAL, lon REAL, last_loc TEXT, last_loc_date TEXT, last_sat_zone TEXT,
  last_trip INTEGER, current_trip INTEGER, next_trip INTEGER,
  final_dest_zone TEXT, final_dest_desc TEXT, deliver_by TEXT,
  assigned_unit TEXT, default_unit TEXT, other_code TEXT, terminal_zone TEXT,
  eta_zone TEXT, eta_date TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  bill_number TEXT PRIMARY KEY,               -- '409008' or split '409186-AA'
  bill_root INTEGER, bill_suffix TEXT,
  trip_number INTEGER, created_time TEXT, customer TEXT,
  orig_city TEXT, orig_prov TEXT, orig_pc TEXT,
  dest_city TEXT, dest_prov TEXT, dest_pc TEXT,
  actual_pickup TEXT, actual_delivery TEXT,
  pickup_driver TEXT, pickup_driver2 TEXT, delivery_driver TEXT, delivery_driver2 TEXT,
  pickup_trip INTEGER, delivery_trip INTEGER,
  distance REAL, service_level TEXT, temp_controlled INTEGER,
  detail_line_id INTEGER, leg_sequence INTEGER, currently_assigned INTEGER,
  load_type TEXT, load_description TEXT, weight_lbs REAL, pallets INTEGER, temperature TEXT,
  orig_lat REAL, orig_lon REAL, dest_lat REAL, dest_lon REAL,
  in_region INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_trip ON orders(trip_number);
CREATE INDEX IF NOT EXISTS idx_orders_root ON orders(bill_root);

CREATE TABLE IF NOT EXISTS legs (
  leg_id INTEGER PRIMARY KEY,
  trip_number INTEGER, bill_number TEXT, bill_root INTEGER, seq INTEGER, driver_name TEXT,
  from_zone TEXT, to_zone TEXT, loaded TEXT, leg_status TEXT,
  leg_dist REAL, leg_wgt REAL,
  expected_date TEXT, status TEXT, ltl_status TEXT,
  origin_zone TEXT, dest_zone TEXT, pickup_by TEXT, deliver_by TEXT, active_leg INTEGER,
  trailer1 TEXT, trailer2 TEXT,
  origin_desc TEXT, dest_desc TEXT, eta_desc TEXT, current_desc TEXT, lego_desc TEXT, legd_desc TEXT,
  extra_stops INTEGER, plan_depart TEXT, planned_departure TEXT, scheduled_arrival TEXT,
  num_pu INTEGER, num_del INTEGER, num_total INTEGER, pay_mt_legs INTEGER,
  pickup_by_start TEXT, pickup_by_end TEXT, deliver_by_start TEXT, deliver_by_end TEXT,
  last_fb_status TEXT, det_pick_arrive TEXT, det_delv_arrive TEXT, last_fb_status_date TEXT,
  num_legs INTEGER,
  remaining_hours_export REAL, hos_violation_at_export TEXT,   -- frozen copies; never use for decisions
  dangerous_goods INTEGER, temp_controlled INTEGER,
  load_type TEXT, load_description TEXT, weight_lbs REAL, pallets INTEGER, temperature TEXT,
  from_lat REAL, from_lon REAL, to_lat REAL, to_lon REAL
);
CREATE INDEX IF NOT EXISTS idx_legs_trip ON legs(trip_number);
CREATE INDEX IF NOT EXISTS idx_legs_bill ON legs(bill_number);
CREATE INDEX IF NOT EXISTS idx_legs_root ON legs(bill_root);
CREATE INDEX IF NOT EXISTS idx_legs_driver ON legs(driver_name);

CREATE TABLE IF NOT EXISTS trucks (truck_number TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS trailers (
  trailer_number TEXT PRIMARY KEY, trailer_type TEXT,
  capacity_lbs REAL, length_ft REAL, inside_height_ft REAL, width_in REAL
);

CREATE TABLE IF NOT EXISTS places (
  key TEXT PRIMARY KEY, kind TEXT NOT NULL, lat REAL, lon REAL, display TEXT
);

CREATE TABLE IF NOT EXISTS data_quality (
  rule TEXT PRIMARY KEY, affected INTEGER, total INTEGER, pct REAL, severity TEXT, note TEXT
);

-- Historical dock dwell, one row per (bill, stop_kind). Source of the exposure number and the
-- conditional dwell model. arrival = earliest LS_DET_*_ARRIVE for the bill; completion = ACTUAL_*.
CREATE TABLE IF NOT EXISTS dwell_history (
  bill_number TEXT NOT NULL, stop_kind TEXT NOT NULL,     -- pickup | delivery
  customer TEXT, city TEXT, prov TEXT,
  appointment_ts TEXT, arrival_ts TEXT NOT NULL, completion_ts TEXT NOT NULL,
  dwell_min REAL NOT NULL, weekday INTEGER, hour INTEGER,
  in_region INTEGER,
  PRIMARY KEY (bill_number, stop_kind)
);
CREATE INDEX IF NOT EXISTS idx_dwell_cust ON dwell_history(customer, city, stop_kind);

-- Conditional dwell model: P(dwell > threshold | dwell > elapsed), pooled by grain. n always shown.
CREATE TABLE IF NOT EXISTS dwell_model (
  grain TEXT NOT NULL,           -- 'facility' | 'city' | 'kind' | 'all'
  key TEXT NOT NULL,             -- e.g. 'ACME FOODS|STONEY CREEK|delivery'
  elapsed_min INTEGER NOT NULL,  -- 60, 90, 105
  n INTEGER NOT NULL,
  p_over_free REAL,              -- P(dwell > 120 | dwell > elapsed)
  median_remaining_min REAL, p90_remaining_min REAL,
  PRIMARY KEY (grain, key, elapsed_min)
);

-- Facilities: dock geofences. source='centroid' rows are city centroids for simulation only and are
-- NOT dock evidence; source='hand' rows were drawn against satellite imagery.
CREATE TABLE IF NOT EXISTS facilities (
  facility_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, customer TEXT, city TEXT, prov TEXT,
  lat REAL, lon REAL,
  property_polygon_geojson TEXT,   -- outer boundary: entering starts FACILITY_APPROACH -> PROPERTY_ENTERED
  dock_polygon_geojson TEXT,       -- yard/dock: entering -> AT_DOCK candidate
  gate_lat REAL, gate_lon REAL,
  source TEXT NOT NULL DEFAULT 'centroid',
  confidence REAL DEFAULT 0.3
);

-- Detention policy. scope='default' is the brief's 2 h / illustrative rate; customer/facility rows
-- override. source records where the terms came from (extracted by an LLM from a rate confirmation,
-- then confirmed by a dispatcher, or hand-entered).
CREATE TABLE IF NOT EXISTS detention_policies (
  policy_id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,                   -- default | customer | facility
  customer TEXT, facility_id INTEGER,
  free_time_min INTEGER NOT NULL DEFAULT 120,
  rate_per_hour REAL NOT NULL DEFAULT 75.0,
  increment_min INTEGER NOT NULL DEFAULT 15,
  minimum_charge REAL DEFAULT 0, maximum_charge REAL,
  billing_start_rule TEXT NOT NULL DEFAULT 'max_checkin_appointment',  -- | arrival | appointment | dock_in
  billing_end_rule TEXT NOT NULL DEFAULT 'release',                     -- | gate_exit
  rounding TEXT NOT NULL DEFAULT 'floor',                               -- floor | ceil | prorate
  requires_on_time_arrival INTEGER NOT NULL DEFAULT 1,
  on_time_grace_min INTEGER NOT NULL DEFAULT 15,
  required_evidence TEXT,                -- json list
  source TEXT NOT NULL DEFAULT 'default',  -- default | extracted | confirmed | manual
  source_text TEXT, confirmed_by TEXT, created_ts TEXT
);

-- Sim clock: single row. The API reads sim time from here so every clock agrees.
CREATE TABLE IF NOT EXISTS sim_clock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sim_ts TEXT NOT NULL, speed REAL NOT NULL DEFAULT 1.0, running INTEGER NOT NULL DEFAULT 0,
  scenario TEXT, seed INTEGER, updated_wall_ts TEXT,
  -- 1 between a reset and the simulator writing the rebuilt clock. Without it a reader
  -- cannot tell a rebuilt scenario from a stale one, and a deleted row would make every
  -- caller fall back to wall-clock time.
  resetting INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sim_ts TEXT NOT NULL, unit TEXT NOT NULL, driver_name TEXT,
  lat REAL, lon REAL, speed_kmh REAL, heading REAL, odometer_km REAL,
  duty_status TEXT, ignition INTEGER, source TEXT NOT NULL DEFAULT 'sim',
  UNIQUE(source, unit, sim_ts)                          -- replay-safe: the same ping cannot land twice
);
CREATE INDEX IF NOT EXISTS idx_tel_unit_ts ON telemetry(unit, sim_ts);

-- Raw geofence crossings from pings, after debounce. Visits are built from these plus driver/TMS events.
CREATE TABLE IF NOT EXISTS geofence_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sim_ts TEXT NOT NULL, unit TEXT NOT NULL, driver_name TEXT,
  facility_id INTEGER NOT NULL, zone TEXT NOT NULL,      -- property | dock
  event_type TEXT NOT NULL,                             -- enter | exit
  lat REAL, lon REAL, confirm_pings INTEGER, source TEXT NOT NULL DEFAULT 'gps',
  UNIQUE(source, unit, facility_id, zone, event_type, sim_ts)
);
CREATE INDEX IF NOT EXISTS idx_gf_unit_ts ON geofence_events(unit, sim_ts);

-- The detention grain. state follows the facility-visit state machine.
CREATE TABLE IF NOT EXISTS stop_visits (
  visit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit TEXT NOT NULL, driver_name TEXT, facility_id INTEGER NOT NULL,
  bill_number TEXT, stop_kind TEXT,                     -- pickup | delivery | unknown
  state TEXT NOT NULL DEFAULT 'FACILITY_APPROACH',
  appointment_start_ts TEXT, appointment_end_ts TEXT,
  approach_ts TEXT, property_entered_ts TEXT, checked_in_ts TEXT, at_dock_ts TEXT,
  service_complete_ts TEXT, released_ts TEXT, gate_exited_ts TEXT,
  on_time INTEGER,                                      -- 1 | 0 | NULL unknown
  policy_id INTEGER,
  clock_start_ts TEXT,                                  -- per policy billing_start_rule
  physical_dwell_min REAL, qualifying_dwell_min REAL, billable_min REAL,
  confidence REAL, review_required INTEGER DEFAULT 0, review_reasons TEXT,   -- json list
  prediction_json TEXT,                                 -- latest conditional dwell prediction
  episode INTEGER NOT NULL DEFAULT 1,
  UNIQUE(unit, facility_id, episode, approach_ts)
);
CREATE INDEX IF NOT EXISTS idx_visits_state ON stop_visits(state);
-- at most one open visit per unit per facility: duplicate reconstructed visits cannot charge twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_visit ON stop_visits(unit, facility_id) WHERE state NOT IN ('CHARGE_READY','REVIEW_REQUIRED');

-- Append-only provenance ledger for visit transitions.
CREATE TABLE IF NOT EXISTS visit_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  ts TEXT NOT NULL, received_ts TEXT NOT NULL,
  state_from TEXT, state_to TEXT NOT NULL,
  source TEXT NOT NULL,                                 -- gps | driver | tms | sim | document | dispatcher
  confidence REAL, actor TEXT, note TEXT,
  superseded_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_vev_visit ON visit_events(visit_id, ts);

CREATE TABLE IF NOT EXISTS detention_charges (
  charge_id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL UNIQUE,                     -- one charge per visit, replay-safe
  bill_number TEXT, party TEXT,                         -- shipper | consignee
  policy_id INTEGER,
  physical_dwell_min REAL, qualifying_dwell_min REAL, billable_min REAL,
  rate_per_hour REAL, increment_min INTEGER, amount REAL,
  confidence REAL, review_required INTEGER DEFAULT 0, reason_codes TEXT,   -- json list
  evidence_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',                 -- draft | approved | disputed | exported
  approved_by TEXT, approved_ts TEXT, created_ts TEXT
);

CREATE TABLE IF NOT EXISTS duty_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_name TEXT NOT NULL, ts TEXT NOT NULL,
  status TEXT NOT NULL,                                 -- off | sleeper | driving | on_duty
  source TEXT NOT NULL DEFAULT 'sim',                   -- sim | driver | tms | seed
  note TEXT,
  UNIQUE(driver_name, ts, status, source)
);
CREATE INDEX IF NOT EXISTS idx_duty_driver_ts ON duty_events(driver_name, ts);

CREATE TABLE IF NOT EXISTS assignments (
  assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number TEXT NOT NULL, driver_name TEXT NOT NULL, unit TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',              -- proposed | offered | accepted | rejected | superseded
  reason_json TEXT, created_ts TEXT, updated_ts TEXT
);

CREATE TABLE IF NOT EXISTS exceptions (
  exception_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sim_ts TEXT NOT NULL, kind TEXT NOT NULL,             -- detention_risk | hos_margin | next_load_at_risk | closure | data_quality
  severity TEXT NOT NULL,                               -- info | warn | critical
  unit TEXT, driver_name TEXT, visit_id INTEGER, bill_number TEXT,
  title TEXT NOT NULL, detail_json TEXT,
  proposed_actions_json TEXT,
  status TEXT NOT NULL DEFAULT 'open',                  -- open | acknowledged | resolved | dismissed
  resolved_ts TEXT, resolution TEXT
);
CREATE INDEX IF NOT EXISTS idx_exc_status ON exceptions(status, severity);
"""


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# Columns added after a table shipped. CREATE TABLE IF NOT EXISTS leaves an existing table
# alone, so a database made before the column existed needs the ALTER spelled out.
ADDED_COLUMNS = [("sim_clock", "resetting", "INTEGER NOT NULL DEFAULT 0")]


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(DDL)
    for table, column, decl in ADDED_COLUMNS:
        have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
        if column not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
    conn.execute(
        """INSERT OR IGNORE INTO detention_policies
           (policy_id, scope, free_time_min, rate_per_hour, increment_min, billing_start_rule,
            requires_on_time_arrival, on_time_grace_min, required_evidence, source, created_ts)
           VALUES (1, 'default', 120, 75.0, 15, 'max_checkin_appointment', 1, 15,
                   '["geofence_entry","geofence_exit","driver_checkin","appointment"]', 'default',
                   strftime('%Y-%m-%d %H:%M:%S','now'))"""
    )
    conn.commit()
