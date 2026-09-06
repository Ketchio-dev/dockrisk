"""Facility-visit state machine, detention policy engine, evidence packet.

States (monotone within an episode):
  FACILITY_APPROACH -> PROPERTY_ENTERED -> CHECKED_IN -> AT_DOCK -> SERVICE_COMPLETE -> RELEASED
  -> GATE_EXITED -> (CHARGE_READY | REVIEW_REQUIRED)

Every transition is appended to visit_events with source/confidence/actor. Replay-safe: the same
event stream produces the same visit and at most one charge (UNIQUE visit_id).

Three clocks per visit:
  physical dwell   = now|gate_exit - property_entered
  billing clock    = (clock_end - clock_start) - free_time, clock_start per policy.billing_start_rule
  regulatory clock = the driver's HOS margin, computed by core.hos in the API layer (not here)
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta

from core.geofence import GeofenceEvent

STATES = ["FACILITY_APPROACH", "PROPERTY_ENTERED", "CHECKED_IN", "AT_DOCK", "SERVICE_COMPLETE", "RELEASED",
          "GATE_EXITED", "CHARGE_READY", "REVIEW_REQUIRED"]
RANK = {s: i for i, s in enumerate(STATES)}
TERMINAL = {"CHARGE_READY", "REVIEW_REQUIRED"}
TS_COL = {"FACILITY_APPROACH": "approach_ts", "PROPERTY_ENTERED": "property_entered_ts", "CHECKED_IN": "checked_in_ts",
          "AT_DOCK": "at_dock_ts", "SERVICE_COMPLETE": "service_complete_ts", "RELEASED": "released_ts",
          "GATE_EXITED": "gate_exited_ts"}
MERGE_GAP_MIN = 20          # re-entry within this many minutes of a gate exit is the same visit
THRESHOLD_BAND_MIN = 10     # +/- around free time -> review, never auto-bill


def _iso(t: datetime | None) -> str | None:
    return t.isoformat(sep=" ") if t else None


def _p(v) -> datetime | None:
    return datetime.fromisoformat(v) if v else None


class VisitEngine:
    def __init__(self, conn):
        self.conn = conn

    # ---------- policy ----------
    def policy_for(self, customer: str | None, facility_id: int | None) -> dict:
        cur = self.conn.cursor()
        r = None
        if facility_id:
            r = cur.execute("SELECT * FROM detention_policies WHERE scope='facility' AND facility_id=? ORDER BY policy_id DESC", (facility_id,)).fetchone()
        if not r and customer:
            r = cur.execute("SELECT * FROM detention_policies WHERE scope='customer' AND customer=? ORDER BY policy_id DESC", (customer,)).fetchone()
        if not r:
            r = cur.execute("SELECT * FROM detention_policies WHERE scope='default' ORDER BY policy_id LIMIT 1").fetchone()
        return dict(r)

    # ---------- ledger ----------
    def _log(self, visit_id: int, ts: datetime, state_from: str | None, state_to: str, source: str,
             confidence: float | None, actor: str | None, note: str | None, received: datetime | None = None):
        cur = self.conn.cursor()
        dup = cur.execute("SELECT event_id FROM visit_events WHERE visit_id=? AND ts=? AND state_to=? AND source=? AND IFNULL(note,'')=IFNULL(?,'')",
                          (visit_id, _iso(ts), state_to, source, note)).fetchone()
        if dup:
            return dup["event_id"]
        cur.execute("INSERT INTO visit_events (visit_id, ts, received_ts, state_from, state_to, source, confidence, actor, note) VALUES (?,?,?,?,?,?,?,?,?)",
                    (visit_id, _iso(ts), _iso(received or ts), state_from, state_to, source, confidence, actor, note))
        return cur.lastrowid

    def advance(self, visit_id: int, state_to: str, ts: datetime, source: str, confidence: float | None = None,
                actor: str | None = None, note: str | None = None, received: datetime | None = None) -> dict:
        v = self.get(visit_id)
        cur_state = v["state"]
        if state_to in TS_COL and not v[TS_COL[state_to]]:
            self.conn.execute(f"UPDATE stop_visits SET {TS_COL[state_to]}=? WHERE visit_id=?", (_iso(ts), visit_id))
        if RANK[state_to] > RANK[cur_state] and cur_state not in TERMINAL:
            self.conn.execute("UPDATE stop_visits SET state=? WHERE visit_id=?", (state_to, visit_id))
        self._log(visit_id, ts, cur_state, state_to, source, confidence, actor, note, received)
        self.conn.commit()
        return self.get(visit_id)

    def get(self, visit_id: int) -> dict:
        return dict(self.conn.execute("SELECT * FROM stop_visits WHERE visit_id=?", (visit_id,)).fetchone())

    def open_visit_for(self, unit: str, facility_id: int) -> dict | None:
        r = self.conn.execute("""SELECT * FROM stop_visits WHERE unit=? AND facility_id=? AND state NOT IN ('CHARGE_READY','REVIEW_REQUIRED')
                                 ORDER BY visit_id DESC LIMIT 1""", (unit, facility_id)).fetchone()
        return dict(r) if r else None

    # ---------- geofence input ----------
    def on_geofence(self, ev: GeofenceEvent, context: dict | None = None) -> dict | None:
        """context may carry bill_number, stop_kind, customer, appointment_start_ts, appointment_end_ts."""
        ctx = context or {}
        cur = self.conn.cursor()
        if ev.zone == "property" and ev.event_type == "enter":
            v = self.open_visit_for(ev.unit, ev.facility_id)
            if not v:
                # merge a brief exit: last visit for this unit+facility that exited within MERGE_GAP_MIN
                last = cur.execute("""SELECT * FROM stop_visits WHERE unit=? AND facility_id=? AND gate_exited_ts IS NOT NULL
                                      ORDER BY visit_id DESC LIMIT 1""", (ev.unit, ev.facility_id)).fetchone()
                same_load = (not ctx.get("bill_number")) or (last and last["bill_number"] in (None, ctx.get("bill_number")))
                if last and same_load and 0 <= (ev.ts - _p(last["gate_exited_ts"])).total_seconds() / 60 <= MERGE_GAP_MIN:
                    prev_state = max((s for s in STATES[:6] if last[TS_COL[s]]), key=lambda s: RANK[s])
                    cur.execute("UPDATE stop_visits SET state=?, gate_exited_ts=NULL WHERE visit_id=?", (prev_state, last["visit_id"]))
                    self._log(last["visit_id"], ev.ts, "GATE_EXITED", prev_state, "gps", ev.confidence, None,
                              f"re-entry within {MERGE_GAP_MIN} min of exit: merged into the same visit; draft charge invalidated")
                    self.conn.execute("UPDATE detention_charges SET status='superseded' WHERE visit_id=? AND status='draft'", (last["visit_id"],))
                    self.conn.commit()
                    return self.get(last["visit_id"])
                fac = cur.execute("SELECT customer FROM facilities WHERE facility_id=?", (ev.facility_id,)).fetchone()
                customer = ctx.get("customer") or (fac["customer"] if fac else None)
                pol = self.policy_for(customer, ev.facility_id)
                cur.execute("""INSERT OR IGNORE INTO stop_visits
                               (unit, driver_name, facility_id, bill_number, stop_kind, state, appointment_start_ts, appointment_end_ts,
                                approach_ts, property_entered_ts, policy_id, confidence, episode)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)""",
                            (ev.unit, ev.driver_name, ev.facility_id, ctx.get("bill_number"), ctx.get("stop_kind", "unknown"),
                             "PROPERTY_ENTERED", ctx.get("appointment_start_ts"), ctx.get("appointment_end_ts"),
                             _iso(ev.ts), _iso(ev.ts), pol["policy_id"], ev.confidence))
                v = self.open_visit_for(ev.unit, ev.facility_id) or dict(cur.execute(
                    "SELECT * FROM stop_visits WHERE unit=? AND facility_id=? AND approach_ts=?", (ev.unit, ev.facility_id, _iso(ev.ts))).fetchone())
                self._log(v["visit_id"], ev.ts, "FACILITY_APPROACH", "PROPERTY_ENTERED", "gps", ev.confidence, None,
                          f"{ev.confirm_pings} consecutive pings inside {ev.facility_name} property")
                self.conn.commit()
                return self.get(v["visit_id"])
            return v
        v = self.open_visit_for(ev.unit, ev.facility_id)
        if not v:
            return None
        if ev.zone == "dock" and ev.event_type == "enter":
            return self.advance(v["visit_id"], "AT_DOCK", ev.ts, "gps", ev.confidence, None, "entered dock/yard zone")
        if ev.zone == "dock" and ev.event_type == "exit":
            self._log(v["visit_id"], ev.ts, v["state"], v["state"], "gps", ev.confidence, None, "left dock/yard zone")
            self.conn.commit()
            return v
        if ev.zone == "property" and ev.event_type == "exit":
            self.advance(v["visit_id"], "GATE_EXITED", ev.ts, "gps", ev.confidence, None, "left property")
            return self.finalize(v["visit_id"], ev.ts)
        return v

    # ---------- driver / dispatcher input ----------
    def on_driver_event(self, visit_id: int, kind: str, ts: datetime, actor: str, payload: dict | None = None) -> dict:
        payload = payload or {}
        v = self.get(visit_id)
        if kind == "arrival_class":  # early | on_time | late | wrong_entrance
            cls = payload.get("value")
            on_time = {"on_time": 1, "early": 1, "late": 0, "wrong_entrance": 0}.get(cls)
            self.conn.execute("UPDATE stop_visits SET on_time=? WHERE visit_id=?", (on_time, visit_id))
            self._log(visit_id, ts, v["state"], v["state"], "driver", 0.9, actor, f"driver classified arrival as {cls}")
            self.conn.commit()
            return self.get(visit_id)
        mapping = {"checked_in": "CHECKED_IN", "door_assigned": "AT_DOCK", "service_complete": "SERVICE_COMPLETE", "released": "RELEASED"}
        if kind in mapping:
            # A confirmation can be for "now" or attested for an earlier moment ("at arrival"). The attested
            # time becomes the event ts; the tap time is kept as received_ts in the ledger.
            received = ts
            at = payload.get("at")
            if at == "arrival" and v["property_entered_ts"]:
                ts = _p(v["property_entered_ts"]) + timedelta(minutes=int(payload.get("offset_min", 5)))
            elif at and at not in ("now", "arrival"):
                ts = _p(at)
            note = payload.get("note") or (f"driver attested {kind} for {ts:%H:%M} (confirmed {received:%H:%M})" if ts != received else f"driver confirmed {kind}")
            return self.advance(visit_id, mapping[kind], ts, "driver", 0.9 if ts == received else 0.75, actor, note, received=received)
        if kind == "correction":  # dispatcher moves a timestamp; original event is superseded, not deleted
            col = TS_COL[payload["state"]]
            old = self.conn.execute(f"SELECT {col} FROM stop_visits WHERE visit_id=?", (visit_id,)).fetchone()[0]
            self.conn.execute(f"UPDATE stop_visits SET {col}=? WHERE visit_id=?", (payload["ts"], visit_id))
            eid = self._log(visit_id, _p(payload["ts"]), v["state"], payload["state"], "dispatcher", 0.95, actor, f"corrected from {old}: {payload.get('reason','')}")
            self.conn.execute("UPDATE visit_events SET superseded_by=? WHERE visit_id=? AND state_to=? AND event_id<>? AND superseded_by IS NULL",
                              (eid, visit_id, payload["state"], eid))
            self.conn.commit()
            if self.get(visit_id)["state"] in TERMINAL or self.get(visit_id)["gate_exited_ts"]:
                self.finalize(visit_id, max(ts, _p(self.get(visit_id)["gate_exited_ts"]) or ts))   # a correction recomputes the charge
            return self.get(visit_id)
        raise ValueError(f"unknown driver event {kind}")

    # ---------- clocks ----------
    def compute(self, visit: dict, now: datetime) -> dict:
        pol = dict(self.conn.execute("SELECT * FROM detention_policies WHERE policy_id=?", (visit["policy_id"],)).fetchone())
        fac = dict(self.conn.execute("SELECT * FROM facilities WHERE facility_id=?", (visit["facility_id"],)).fetchone())
        entered = _p(visit["property_entered_ts"]) or _p(visit["approach_ts"])
        checked = _p(visit["checked_in_ts"]); dock = _p(visit["at_dock_ts"]); appt = _p(visit["appointment_start_ts"])
        released = _p(visit["released_ts"]); exited = _p(visit["gate_exited_ts"])
        if exited and exited > now: exited = None
        if released and released > now: released = None
        if checked and checked > now: checked = None
        if dock and dock > now: dock = None
        # physical dwell runs until the truck leaves the property; the billing clock ends per contract
        # (release by default — the customer is done with the driver; gate exit if that is the rule)
        phys_end = exited or now
        end = (exited if pol.get("billing_end_rule") == "gate_exit" else None) or released or exited or now
        closed = exited is not None or released is not None

        rule = pol["billing_start_rule"]
        if rule == "arrival":
            start = entered
        elif rule == "appointment":
            start = max(appt, entered) if (appt and entered) else (appt or entered)
        elif rule == "dock_in":
            start = dock or checked or entered
        else:  # max_checkin_appointment
            base = checked or entered
            start = max(base, appt) if appt else base

        physical = max(0.0, (phys_end - entered).total_seconds() / 60) if entered else 0.0
        qualifying = max(0.0, (end - start).total_seconds() / 60) if start else 0.0
        free = pol["free_time_min"]; inc = pol["increment_min"] or 1
        raw_billable = max(0.0, qualifying - free)
        rounding = pol.get("rounding") or "floor"
        billable = (math.ceil(raw_billable / inc) * inc if rounding == "ceil" else raw_billable if rounding == "prorate" else math.floor(raw_billable / inc) * inc)
        amount = billable / 60 * pol["rate_per_hour"]
        if pol["minimum_charge"] and billable > 0:
            amount = max(amount, pol["minimum_charge"])
        if pol["maximum_charge"]:
            amount = min(amount, pol["maximum_charge"])

        reasons: list[str] = []
        at_risk = raw_billable > 0 or abs(qualifying - free) <= THRESHOLD_BAND_MIN   # anything near or past the line
        if abs(qualifying - free) <= THRESHOLD_BAND_MIN and closed:
            reasons.append(f"within {THRESHOLD_BAND_MIN} min of the free-time threshold")
        if pol["requires_on_time_arrival"]:
            if visit["on_time"] == 0:
                reasons.append("driver not on time / wrong entrance; policy requires on-time arrival")
            elif visit["on_time"] is None and appt and entered and entered > appt + timedelta(minutes=pol["on_time_grace_min"]):
                reasons.append(f"arrived {int((entered-appt).total_seconds()/60)} min after appointment; on-time status unconfirmed")
            elif visit["on_time"] is None and at_risk:
                reasons.append("on-time status not confirmed by driver")
        if not checked and at_risk and rule == "max_checkin_appointment":
            reasons.append("no check-in confirmation; clock started at property entry")
        if closed and not exited:
            reasons.append("no gate-exit evidence; clock ended at release")
        if (fac.get("confidence") or 0) < 0.6:
            reasons.append(f"facility geometry is {fac.get('source')} (confidence {fac.get('confidence')}), not verified dock geometry")
        if physical > 48 * 60:
            reasons.append("dwell exceeds 48 h; likely not dock time")
        if closed and at_risk:
            have = {"geofence_entry": bool(entered), "geofence_exit": bool(exited), "driver_checkin": bool(checked), "appointment": bool(appt),
                    "driver_release": bool(released), "on_time": visit["on_time"] is not None}
            for req in json.loads(pol.get("required_evidence") or "[]"):
                if not have.get(req, True):
                    reasons.append(f"required evidence missing: {req}")
        if rule == "dock_in" and not dock and at_risk:
            reasons.append("policy clocks from dock-in but no dock-in evidence; used check-in/entry")
        if rule == "appointment" and appt and entered and entered > appt:
            reasons.append("policy clocks from appointment but truck arrived after it; billing start held at arrival")
        if not appt and rule in ("appointment", "max_checkin_appointment") and at_risk:
            reasons.append("no appointment on record; clock started at check-in/entry")

        conf = min(1.0, (fac.get("confidence") or 0.3) + (0.3 if checked else 0) + (0.2 if visit["on_time"] == 1 else 0) + (0.2 if exited else 0))
        return {
            "policy": {k: pol.get(k) for k in ("policy_id", "scope", "customer", "free_time_min", "rate_per_hour", "increment_min",
                                                "minimum_charge", "maximum_charge", "billing_start_rule", "billing_end_rule", "rounding", "requires_on_time_arrival", "source")},
            "clock_start_ts": _iso(start), "clock_end_ts": _iso(end), "closed": closed,
            "physical_dwell_min": round(physical, 1), "qualifying_dwell_min": round(qualifying, 1),
            "billable_min": round(billable, 1), "billable_raw_min": round(raw_billable, 1),
            "minutes_until_billable": None if raw_billable > 0 else round(free - qualifying, 1),
            "amount": round(amount, 2), "confidence": round(conf, 2),
            "review_required": bool(reasons), "review_reasons": reasons,
        }

    def finalize(self, visit_id: int, now: datetime) -> dict:
        v = self.get(visit_id)
        c = self.compute(v, now)
        state = "REVIEW_REQUIRED" if c["review_required"] else "CHARGE_READY"
        self.conn.execute("""UPDATE stop_visits SET clock_start_ts=?, physical_dwell_min=?, qualifying_dwell_min=?, billable_min=?,
                             confidence=?, review_required=?, review_reasons=?, state=? WHERE visit_id=?""",
                          (c["clock_start_ts"], c["physical_dwell_min"], c["qualifying_dwell_min"], c["billable_min"], c["confidence"],
                           int(c["review_required"]), json.dumps(c["review_reasons"]), state, visit_id))
        self._log(visit_id, now, v["state"], state, "system", c["confidence"], None,
                  f"finalized: billable {c['billable_min']} min, ${c['amount']}" + (" — review" if c["review_required"] else ""))
        party = "shipper" if v["stop_kind"] == "pickup" else "consignee" if v["stop_kind"] == "delivery" else None
        evidence = self.evidence_packet(visit_id, c)
        self.conn.execute("""INSERT INTO detention_charges
              (visit_id, bill_number, party, policy_id, physical_dwell_min, qualifying_dwell_min, billable_min, rate_per_hour, increment_min,
               amount, confidence, review_required, reason_codes, evidence_json, status, created_ts)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?)
              ON CONFLICT(visit_id) DO UPDATE SET physical_dwell_min=excluded.physical_dwell_min, qualifying_dwell_min=excluded.qualifying_dwell_min,
               billable_min=excluded.billable_min, amount=excluded.amount, confidence=excluded.confidence, review_required=excluded.review_required,
               reason_codes=excluded.reason_codes, evidence_json=excluded.evidence_json""",
                          (visit_id, v["bill_number"], party, v["policy_id"], c["physical_dwell_min"], c["qualifying_dwell_min"], c["billable_min"],
                           c["policy"]["rate_per_hour"], c["policy"]["increment_min"], c["amount"], c["confidence"], int(c["review_required"]),
                           json.dumps(c["review_reasons"]), json.dumps(evidence), _iso(now)))
        self.conn.commit()
        return dict(self.conn.execute("SELECT * FROM detention_charges WHERE visit_id=?", (visit_id,)).fetchone())

    def evidence_packet(self, visit_id: int, calc: dict | None = None) -> dict:
        v = self.get(visit_id)
        fac = dict(self.conn.execute("SELECT facility_id, name, customer, city, source, confidence FROM facilities WHERE facility_id=?", (v["facility_id"],)).fetchone())
        events = [dict(r) for r in self.conn.execute("SELECT ts, received_ts, state_from, state_to, source, confidence, actor, note, superseded_by FROM visit_events WHERE visit_id=? ORDER BY ts, event_id", (visit_id,))]
        crumbs = [dict(r) for r in self.conn.execute("""SELECT sim_ts, lat, lon, speed_kmh, duty_status FROM telemetry WHERE unit=? AND sim_ts BETWEEN ? AND ?
                                                        ORDER BY sim_ts""", (v["unit"], v["approach_ts"], v["gate_exited_ts"] or "9999"))]
        duty = [dict(r) for r in self.conn.execute("SELECT ts, status, source FROM duty_events WHERE driver_name=? AND ts BETWEEN ? AND ? ORDER BY ts",
                                                   (v["driver_name"], v["approach_ts"], v["gate_exited_ts"] or "9999"))]
        return {"visit": {k: v[k] for k in ("visit_id", "unit", "driver_name", "bill_number", "stop_kind", "appointment_start_ts", "appointment_end_ts",
                                            "property_entered_ts", "checked_in_ts", "at_dock_ts", "service_complete_ts", "released_ts", "gate_exited_ts", "on_time")},
                "facility": fac, "calculation": calc, "events": events, "breadcrumb_points": len(crumbs),
                "breadcrumb_sample": crumbs[:: max(1, len(crumbs) // 20)] if crumbs else [], "duty_timeline": duty,
                "limits": ["prototype, not a certified ELD", "billing status in TruckMate unknown", "facility geometry per source/confidence above"]}

    def three_clocks(self, visit_id: int, now: datetime) -> dict:
        v = self.get(visit_id)
        c = self.compute(v, now)
        return {"visit_id": visit_id, "state": v["state"], "unit": v["unit"], "driver_name": v["driver_name"], "facility_id": v["facility_id"],
                "bill_number": v["bill_number"], "stop_kind": v["stop_kind"],
                "physical_dwell_min": c["physical_dwell_min"], "qualifying_dwell_min": c["qualifying_dwell_min"],
                "minutes_until_billable": c["minutes_until_billable"], "billable_min": c["billable_min"], "amount_so_far": c["amount"],
                "clock_start_ts": c["clock_start_ts"], "policy": c["policy"], "review_reasons": c["review_reasons"], "confidence": c["confidence"]}
