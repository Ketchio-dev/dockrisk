"""Historical dwell analysis over the imported data.

    uv run python -m core.analytics

Materializes:
  dwell_history — one row per (bill, stop_kind): earliest dock arrival for the bill -> ACTUAL_* completion
  dwell_model   — conditional dwell model P(dwell > free | dwell > elapsed) pooled by facility/city/kind/all

Also exposes exposure_summary() for the API's financial panel. Every number carries its assumptions.
"""
from __future__ import annotations

import datetime as dt
import statistics
from collections import defaultdict

from core.db import DB_PATH, connect, init_schema

ELAPSED_POINTS = (30, 60, 90, 105, 120, 150, 180, 240)
FREE_MIN_DEFAULT = 120
CAP_MIN = 48 * 60           # dwells longer than this are treated as long-haul artifacts, not dock time
MIN_N_FOR_GRAIN = 8         # below this, fall back to a coarser grain


def _p(v):
    return dt.datetime.fromisoformat(v) if v else None


def build_dwell_history(conn) -> int:
    cur = conn.cursor()
    cur.execute("DELETE FROM dwell_history")
    # earliest arrival per bill per kind, with the appointment window from the same leg set
    arrivals: dict[tuple[str, str], dict] = {}
    for r in cur.execute("""SELECT bill_number, bill_root, det_pick_arrive, det_delv_arrive,
                                   pickup_by_start, deliver_by_start FROM legs"""):
        for kind, col, appt in (("pickup", "det_pick_arrive", "pickup_by_start"), ("delivery", "det_delv_arrive", "deliver_by_start")):
            a = _p(r[col])
            if not a:
                continue
            for key in filter(None, (r["bill_number"], str(r["bill_root"]) if r["bill_root"] else None)):
                k = (key, kind)
                if k not in arrivals or a < arrivals[k]["arrival"]:
                    arrivals[k] = {"arrival": a, "appt": _p(r[appt])}
    n = 0
    orders = cur.execute("""SELECT bill_number, bill_root, customer, orig_city, orig_prov, dest_city, dest_prov,
                                   actual_pickup, actual_delivery, in_region FROM orders""").fetchall()
    for o in orders:  # materialized first: inserting on the same cursor mid-iteration resets it
        for kind, comp_col, city, prov in (("pickup", "actual_pickup", o["orig_city"], o["orig_prov"]),
                                           ("delivery", "actual_delivery", o["dest_city"], o["dest_prov"])):
            comp = _p(o[comp_col])
            if not comp:
                continue
            hit = arrivals.get((o["bill_number"], kind)) or (arrivals.get((str(o["bill_root"]), kind)) if o["bill_root"] else None)
            if not hit:
                continue
            dwell = (comp - hit["arrival"]).total_seconds() / 60
            if dwell < 0:
                continue
            cur.execute("INSERT OR REPLACE INTO dwell_history VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                        (o["bill_number"], kind, o["customer"], (city or "").strip().upper() or None, prov,
                         hit["appt"].isoformat(sep=" ") if hit["appt"] else None,
                         hit["arrival"].isoformat(sep=" "), comp.isoformat(sep=" "),
                         round(dwell, 1), hit["arrival"].weekday(), hit["arrival"].hour, o["in_region"]))
            n += 1
    conn.commit()
    return n


def build_dwell_model(conn, free_min: int = FREE_MIN_DEFAULT) -> int:
    cur = conn.cursor()
    cur.execute("DELETE FROM dwell_model")
    rows = [dict(r) for r in cur.execute("SELECT customer, city, stop_kind, dwell_min FROM dwell_history WHERE dwell_min <= ?", (CAP_MIN,))]
    grains = {
        "facility": lambda r: f"{r['customer']}|{r['city']}|{r['stop_kind']}",
        "city": lambda r: f"{r['city']}|{r['stop_kind']}",
        "kind": lambda r: r["stop_kind"],
        "all": lambda r: "all",
    }
    n_written = 0
    for grain, keyf in grains.items():
        buckets: dict[str, list[float]] = defaultdict(list)
        for r in rows:
            buckets[keyf(r)].append(r["dwell_min"])
        for key, ds in buckets.items():
            for elapsed in ELAPSED_POINTS:
                still = [d for d in ds if d > elapsed]
                if not still:
                    continue
                remaining = sorted(d - elapsed for d in still)
                p_over = sum(1 for d in still if d > free_min) / len(still)
                p90 = remaining[min(len(remaining) - 1, int(round(0.9 * (len(remaining) - 1))))]
                cur.execute("INSERT OR REPLACE INTO dwell_model VALUES (?,?,?,?,?,?,?)",
                            (grain, key, elapsed, len(still), round(p_over, 3), round(statistics.median(remaining), 1), round(p90, 1)))
                n_written += 1
    conn.commit()
    return n_written


def predict_remaining(conn, customer: str | None, city: str | None, stop_kind: str, elapsed_min: float,
                      free_min: int = FREE_MIN_DEFAULT) -> dict:
    """Conditional prediction at the nearest elapsed point at or below elapsed_min, coarsening the grain
    until n >= MIN_N_FOR_GRAIN. Always returns the grain and n it used."""
    pts = [e for e in ELAPSED_POINTS if e <= elapsed_min] or [ELAPSED_POINTS[0]]
    e = max(pts)
    candidates = [("facility", f"{customer}|{(city or '').upper()}|{stop_kind}"), ("city", f"{(city or '').upper()}|{stop_kind}"),
                  ("kind", stop_kind), ("all", "all")]
    cur = conn.cursor()
    for grain, key in candidates:
        r = cur.execute("SELECT * FROM dwell_model WHERE grain=? AND key=? AND elapsed_min=?", (grain, key, e)).fetchone()
        if r and r["n"] >= MIN_N_FOR_GRAIN:
            return {"grain": grain, "key": key, "elapsed_point_min": e, "n": r["n"], "p_over_free": r["p_over_free"],
                    "median_remaining_min": r["median_remaining_min"], "p90_remaining_min": r["p90_remaining_min"],
                    "free_min": free_min, "note": "empirical, conditional on having already waited this long; n shown"}
    return {"grain": None, "n": 0, "note": "no history at any grain"}


def exposure_summary(conn, free_min: int = FREE_MIN_DEFAULT, rate_low: float = 75.0, rate_high: float = 100.0,
                     region_only: bool = True, cap_min: int = CAP_MIN) -> dict:
    """Gross potential detention exposure under stated assumptions. Not 'unbilled': the export has no
    billing records. Per (bill, stop_kind), Ontario/region filtered, dwells over cap discarded."""
    cur = conn.cursor()
    where = "dwell_min <= ?" + (" AND in_region = 1" if region_only else "")
    rows = [dict(r) for r in cur.execute(f"SELECT stop_kind, dwell_min, arrival_ts FROM dwell_history WHERE {where}", (cap_min,))]
    if not rows:
        return {"n": 0}
    dates = [dt.datetime.fromisoformat(r["arrival_ts"]) for r in rows]
    span_days = max(1, (max(dates) - min(dates)).days)
    out: dict = {"assumptions": {"free_time_min": free_min, "rate_low": rate_low, "rate_high": rate_high,
                                 "region_only": region_only, "dwell_cap_min": cap_min,
                                 "grain": "one dwell per (bill, stop kind); arrival = earliest dock-arrival timestamp for the bill; completion = ACTUAL_PICKUP/ACTUAL_DELIVERY"},
                 "window_days": span_days, "window": [min(dates).date().isoformat(), max(dates).date().isoformat()], "by_kind": {}}
    total_billable_h = 0.0
    for kind in ("pickup", "delivery"):
        ds = sorted(r["dwell_min"] for r in rows if r["stop_kind"] == kind)
        if not ds:
            continue
        over = [d for d in ds if d > free_min]
        band = [d for d in ds if free_min - 10 < d <= free_min + 10]
        billable_h = sum(d - free_min for d in over) / 60
        total_billable_h += billable_h
        out["by_kind"][kind] = {
            "n": len(ds), "median_min": round(statistics.median(ds), 1),
            "p90_min": round(ds[int(0.9 * (len(ds) - 1))], 1),
            "over_free_n": len(over), "over_free_pct": round(100 * len(over) / len(ds), 1),
            "within_10min_of_threshold_n": len(band),
            "billable_hours": round(billable_h, 1),
        }
    # distribution for the report chart: 15-min bins to 6 h, the rest in an overflow bucket
    bin_min, max_min = 15, 360
    counts = [0] * (max_min // bin_min)
    overflow = 0
    for r in rows:
        d = r["dwell_min"]
        if d >= max_min:
            overflow += 1
        else:
            counts[int(max(0, d) // bin_min)] += 1
    out["histogram"] = {"bin_min": bin_min, "max_min": max_min, "counts": counts, "overflow": overflow, "n": len(rows)}
    scale = 30 / span_days
    out["total_billable_hours"] = round(total_billable_h, 1)
    out["monthly_exposure_low"] = round(total_billable_h * rate_low * scale)
    out["monthly_exposure_high"] = round(total_billable_h * rate_high * scale)
    out["wording"] = ("Gross potential detention exposure under the stated free-time and rate assumptions. "
                      "Billing status and contract eligibility are not in the export; this is not 'unbilled revenue'.")
    return out


def main():
    conn = connect(DB_PATH)
    init_schema(conn)
    n = build_dwell_history(conn)
    m = build_dwell_model(conn)
    print(f"dwell_history rows: {n}, dwell_model rows: {m}")
    import json
    print(json.dumps(exposure_summary(conn), indent=1))
    print("predict at 90 min, delivery, unknown facility:", predict_remaining(conn, None, None, "delivery", 90))


if __name__ == "__main__":
    main()
