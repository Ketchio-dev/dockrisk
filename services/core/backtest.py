"""Replay the carrier's own history through the detention rules.

    uv run python -m core.backtest

The question a judge asks is "would this have worked on real data?". The 62-day export has, per stop, the
dock-arrival time, the appointment window and the completion time — enough to replay two of DockRisk's three
outputs for every historical stop, under stated rules:

  1. the 30-minutes-before-billing warning: at 90 minutes on the clock, the conditional model (trained only on
     stops BEFORE a cutoff date) says P(this stop exceeds free time); we warn if P >= threshold. Scored against
     what actually happened on the stops AFTER the cutoff.
  2. the draft charge: qualifying dwell from the later of dock arrival and appointment to completion, minus
     free time, floored to the increment, priced at the rate. Charges need no model, so they are replayed over
     the whole window; the warning is scored only after the cutoff.

What cannot be replayed, and is said so in the output: hours-of-service collisions (the export has no duty
logs, only a snapshot per driver), driver check-in and release times (not in the export; the clock starts at
arrival), and contract eligibility (no rate confirmations). Customer names are anonymized in every output.
"""
from __future__ import annotations

import datetime as dt
import math
import statistics
from collections import defaultdict

from core.analytics import CAP_MIN, MIN_N_FOR_GRAIN
from core.db import DB_PATH, connect, init_schema

APPT_SANITY_H = 12  # an "appointment" more than this far from the arrival is a planning placeholder, not a booking


def _p(v: str | None) -> dt.datetime | None:
    return dt.datetime.fromisoformat(v) if v else None


def _qualifying(r: dict) -> tuple[float, bool]:
    """Use the same appointment-adjusted target for training and scoring."""
    arrival, comp, appt = _p(r['arrival_ts']), _p(r['completion_ts']), _p(r['appointment_ts'])
    if appt and abs((appt - arrival).total_seconds()) > APPT_SANITY_H * 3600:
        appt = None
    start = max(arrival, appt) if appt else arrival
    return max(0.0, (comp - start).total_seconds() / 60), bool(appt)


def _p_over(train: list[dict], r: dict, elapsed: float, free_min: int) -> tuple[float | None, str, int]:
    """P(dwell > free | dwell > elapsed) from the training rows, coarsening facility -> city -> kind -> all."""
    ladder = (("facility", lambda x: (x["customer"], x["city"], x["stop_kind"])),
              ("city", lambda x: (x["city"], x["stop_kind"])),
              ("kind", lambda x: (x["stop_kind"],)),
              ("all", lambda x: ()))
    for grain, keyf in ladder:
        key = keyf(r)
        still = [x["dwell_min"] for x in train if keyf(x) == key and x["dwell_min"] > elapsed]
        if len(still) >= MIN_N_FOR_GRAIN:
            return sum(1 for d in still if d > free_min) / len(still), grain, len(still)
    return None, "none", 0


def replay(conn, free_min: int = 120, rate: float = 75.0, increment_min: int = 15, warn_lead_min: int = 30,
           threshold: float = 0.5, region_only: bool = True, cap_min: int = CAP_MIN, train_days: int = 28) -> dict:
    cur = conn.cursor()
    where = "dwell_min <= ?" + (" AND in_region = 1" if region_only else "")
    rows = [dict(r) for r in cur.execute(f"""SELECT bill_number, stop_kind, customer, city, appointment_ts, arrival_ts, completion_ts, dwell_min
                                             FROM dwell_history WHERE {where} ORDER BY arrival_ts""", (cap_min,))]
    if not rows:
        return {"n": 0}
    t_first = _p(rows[0]["arrival_ts"]); t_last = _p(rows[-1]["arrival_ts"])
    cutoff = t_first + dt.timedelta(days=train_days)
    # A stop that has arrived but not completed at cutoff has no known target yet.
    train = [{**r, "dwell_min": _qualifying(r)[0]} for r in rows if _p(r["completion_ts"]) < cutoff]
    test = [r for r in rows if _p(r["arrival_ts"]) >= cutoff]
    pending = [r for r in rows if _p(r["arrival_ts"]) < cutoff <= _p(r["completion_ts"])]

    # anonymize customers in order of first appearance; the export carries real names
    alias: dict[str, str] = {}
    def anon(c: str | None) -> str:
        if not c:
            return "Unknown customer"
        return alias.setdefault(c, f"Customer {chr(65 + len(alias))}" if len(alias) < 26 else f"Customer {len(alias) + 1}")

    warn_at = free_min - warn_lead_min
    tp = fp = fn = tn = 0
    still_at_warn = 0
    charges: list[dict] = []
    by_place: dict[tuple, dict] = defaultdict(lambda: {"n": 0, "over": 0, "billable_h": 0.0, "amount": 0.0, "dwells": []})
    by_week: dict[str, dict] = defaultdict(lambda: {"n": 0, "over": 0, "amount": 0.0})
    appt_used = appt_missing = 0
    for r in rows:
        in_test = _p(r["arrival_ts"]) >= cutoff
        arrival = _p(r["arrival_ts"])
        qualifying, appointment_known = _qualifying(r)
        if appointment_known:
            appt_used += 1
        else:
            appt_missing += 1
        over = qualifying > free_min
        billable_raw = max(0.0, qualifying - free_min)
        billable = math.floor(billable_raw / increment_min) * increment_min
        amount = billable / 60 * rate
        wk = (arrival - dt.timedelta(days=arrival.weekday())).date().isoformat()
        place = (anon(r["customer"]), r["city"] or "?", r["stop_kind"])
        by_place[place]["n"] += 1; by_week[wk]["n"] += 1; by_place[place]["dwells"].append(qualifying)
        if over:
            by_place[place]["over"] += 1; by_week[wk]["over"] += 1
        if billable > 0:
            by_place[place]["billable_h"] += billable / 60; by_place[place]["amount"] += amount; by_week[wk]["amount"] += amount
            charges.append({"amount": amount, "billable_min": billable, "qualifying_min": round(qualifying, 1), "appointment_known": appointment_known})
        # the warning decision exists only for stops still on the clock at the warning point, and is scored out of sample
        if in_test and qualifying > warn_at:
            still_at_warn += 1
            p, _grain, _n = _p_over(train, r, warn_at, free_min)
            warned = p is not None and p >= threshold
            if warned and over: tp += 1
            elif warned and not over: fp += 1
            elif not warned and over: fn += 1
            else: tn += 1

    amounts = [c["amount"] for c in charges]
    top = sorted(by_place.items(), key=lambda kv: -kv[1]["amount"])[:8]
    days_test = max(1, (t_last - cutoff).days)
    days_all = max(1, (t_last - t_first).days)
    return {
        "n_total": len(rows), "n_train": len(train), "n_test": len(test), "n_pending_at_cutoff": len(pending),
        "window": [t_first.date().isoformat(), t_last.date().isoformat()], "cutoff": cutoff.date().isoformat(), "test_days": days_test,
        "rules": {"free_time_min": free_min, "rate_per_hour": rate, "increment_min": increment_min, "clock_start": "later of dock arrival and appointment (arrival when no sane appointment)",
                  "warning_at_min": warn_at, "warning_lead_min": warn_lead_min, "threshold": threshold, "region_only": region_only, "dwell_cap_min": cap_min},
        "warning": {
            "decisions": still_at_warn, "warned": tp + fp, "exceeded": tp + fn,
            "true_positive": tp, "false_positive": fp, "false_negative": fn, "true_negative": tn,
            "precision": round(tp / (tp + fp), 3) if tp + fp else None, "recall": round(tp / (tp + fn), 3) if tp + fn else None,
            "lead_min": warn_lead_min,
            "note": "trained only on stops completed before cutoff; appointment-adjusted duration in both training and scoring; facility/city/kind baseline, not the live shift model",
            "baseline_always_warn": {
                "warned": still_at_warn, "true_positive": tp + fn, "false_positive": fp + tn,
                "precision": round((tp + fn) / still_at_warn, 3) if still_at_warn else None,
                "recall": 1.0 if tp + fn else None,
            },
        },
        "charges": {
            "days": days_all,
            "n": len(charges), "stops_over_free": sum(1 for r in rows if _qualifying(r)[0] > free_min),
            "billable_hours": round(sum(c["billable_min"] for c in charges) / 60, 1), "amount": round(sum(amounts)),
            "amount_per_30d": round(sum(amounts) * 30 / days_all), "median_charge": round(statistics.median(amounts)) if amounts else 0,
            "busiest_week": max(by_week.items(), key=lambda kv: kv[1]["amount"])[0] if by_week else None,
            "with_appointment": sum(1 for c in charges if c["appointment_known"]), "without_appointment": sum(1 for c in charges if not c["appointment_known"]),
            "appointments_used": appt_used, "appointments_missing": appt_missing,
        },
        # a place whose typical over-free stop lasts many hours is probably a drop or an overnight, not dock detention: flagged for review
        "top_places": [{"customer": k[0], "city": k[1], "stop_kind": k[2], "stops": v["n"], "over_free": v["over"], "billable_hours": round(v["billable_h"], 1), "amount": round(v["amount"]),
                        "median_over_h": round(statistics.median([d for d in v["dwells"] if d > free_min]) / 60, 1) if v["over"] else None,
                        "review": "typical stop past free time runs many hours: likely drops or overnights, review before billing" if v["over"] and statistics.median([d for d in v["dwells"] if d > free_min]) > 6 * 60 else None}
                       for k, v in top],
        "by_week": [{"week": k, **{kk: (round(vv) if kk == "amount" else vv) for kk, vv in v.items()}} for k, v in sorted(by_week.items())],
        "not_replayed": ["hours-of-service collisions (no duty logs in the export, only a per-driver snapshot)",
                         "driver check-in and release times (not in the export; the clock starts at dock arrival or the appointment)",
                         "contract eligibility and rates (no rate confirmations; rate assumed)",
                         "gate-exit times (completion timestamp used as the clock end)"],
        "wording": "A replay of the carrier's own stops through DockRisk's rules with an out-of-sample warning model. Gross potential charges under stated assumptions, not unbilled revenue.",
    }


def main():
    import json
    conn = connect(DB_PATH)
    init_schema(conn)
    out = replay(conn)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
