"""Import the organizer workbook (a TruckMate export) into the canonical SQLite store.

    uv run python -m core.importer

Idempotent: imported tables are cleared and rebuilt; live tables (telemetry, visits,
charges, duty events, assignments) are left alone.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

import openpyxl

from core.db import DB_PATH, ROOT, connect, init_schema
from core.geocode import norm_city

XLSX = ROOT / "data/portal-downloads/Hackathon_Data.xlsx"
GEO = ROOT / "data/geo"

# Southern Ontario per the brief: Barrie N, Peterborough/Pickering E, London W, Niagara Falls S.
REGION = {"lat_min": 42.95, "lat_max": 44.45, "lon_min": -81.45, "lon_max": -78.20}

NULLS = {None, "", "<null>", "NULL", "null"}


def nz(v):
    """Normalize the export's null spellings. Returns None for any null-ish value."""
    if v in NULLS:
        return None
    if isinstance(v, str) and v.strip() in NULLS:
        return None
    return v


def ts(v) -> str | None:
    """ISO timestamp, or None for nulls and pre-2000 sentinels (1980-01-01 etc.)."""
    v = nz(v)
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        return None if v.year < 2000 else v.replace(microsecond=0).isoformat(sep=" ")
    if isinstance(v, str):
        try:
            d = dt.datetime.fromisoformat(v.strip())
            return None if d.year < 2000 else d.isoformat(sep=" ")
        except ValueError:
            return None
    return None


def num(v) -> float | None:
    v = nz(v)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def integer(v) -> int | None:
    n = num(v)
    return None if n is None else int(n)


def boolean(v) -> int | None:
    v = nz(v)
    if v is None:
        return None
    if isinstance(v, bool):
        return int(v)
    return 1 if str(v).strip().lower() in ("true", "1", "y", "yes") else 0


def text(v) -> str | None:
    v = nz(v)
    return None if v is None else str(v).strip()


def bill_parts(v) -> tuple[str | None, int | None, str | None]:
    """'409008' -> ('409008', 409008, None); '409186-AA' -> ('409186-AA', 409186, 'AA'); 409008.0 -> ('409008', ...)."""
    v = nz(v)
    if v is None:
        return None, None, None
    if isinstance(v, (int, float)):
        return str(int(v)), int(v), None
    sv = str(v).strip()
    m = re.fullmatch(r"(\d+)(?:-([A-Za-z0-9]+))?", sv)
    if not m:
        return sv, None, None
    return sv, int(m.group(1)), (m.group(2) or None)


def dms(v: str | None, hemis_neg: str) -> float | None:
    """TruckMate position: '0433201N' -> 43 + 32/60 + 1/3600. Longitude 'W' is negative."""
    v = text(v)
    if not v:
        return None
    m = re.fullmatch(r"(\d{3})(\d{2})(\d{2})([NSEW])", v)
    if not m:
        return None
    deg, mi, se, h = int(m[1]), int(m[2]), int(m[3]), m[4]
    axis_ok = h in ("N", "S") if hemis_neg == "S" else h in ("E", "W")
    if not axis_ok or mi >= 60 or se >= 60 or deg > (90 if hemis_neg == "S" else 180):
        return None
    val = deg + mi / 60 + se / 3600
    return -val if h == hemis_neg else val


def in_region(lat, lon) -> bool:
    return (
        lat is not None and lon is not None
        and REGION["lat_min"] <= lat <= REGION["lat_max"]
        and REGION["lon_min"] <= lon <= REGION["lon_max"]
    )


def load_geo() -> tuple[dict, dict]:
    cities = json.loads((GEO / "cities.json").read_text()) if (GEO / "cities.json").exists() else {}
    postal = json.loads((GEO / "postal.json").read_text()) if (GEO / "postal.json").exists() else {}
    return cities, postal


def sheet_rows(wb, name: str):
    ws = wb[name]
    it = ws.iter_rows(values_only=True)
    header = [str(h) for h in next(it)]
    ix = {c: i for i, c in enumerate(header)}
    for r in it:
        if all(x in NULLS for x in r):
            continue
        yield ix, r


def main(xlsx: Path = XLSX, db_path: Path = DB_PATH) -> None:
    if not xlsx.exists():
        sys.exit(f"workbook not found: {xlsx}")
    cities, postal = load_geo()

    def city_ll(city, prov):
        if not city or prov != "ON":
            return None, None
        hit = cities.get(f"{str(city).strip().upper()}, ON")
        return (hit["lat"], hit["lon"]) if hit else (None, None)

    def pc_ll(pc):
        pc = (text(pc) or "").replace(" ", "").upper()
        hit = postal.get(pc)
        return (hit["lat"], hit["lon"]) if hit else (None, None)

    conn = connect(db_path)
    init_schema(conn)
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    cur = conn.cursor()
    for t in ("drivers", "orders", "legs", "trucks", "trailers", "places", "data_quality", "dwell_history", "dwell_model"):
        cur.execute(f"DELETE FROM {t}")

    dq: dict[str, list] = {}  # rule -> [affected, total, severity, note]

    def bump(rule, hit, sev, note):
        e = dq.setdefault(rule, [0, 0, sev, note])
        e[0] += int(bool(hit))
        e[1] += 1

    # ---- Drivers ----
    for ix, r in sheet_rows(wb, "Driver"):
        g = lambda c: r[ix[c]]  # noqa: E731
        lat = dms(g("POSLAT"), "S")
        lon = dms(g("POSLONG"), "W")
        bump("driver_no_position", lat is None, "info", "Driver rows without a parseable POSLAT/POSLONG")
        bump("driver_no_status", text(g("STATUS")) is None, "info", "Driver rows with blank STATUS")
        cur.execute(
            """INSERT INTO drivers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                integer(g("DRIVER_ID")), text(g("FIRST_NAME")) or f"Driver{integer(g('DRIVER_ID'))}", text(g("EMAIL")),
                text(g("HOME_ZONE")), text(g("DRIVER_TYPE")), text(g("PAY_TYPE")),
                integer(g("DRIVER_CYCLE")), text(g("DRIVER_CYCLE_ZONE")), text(g("STATUS")), boolean(g("ACTIVE_IN_DISP")),
                integer(g("CURRENT_DUTY")), ts(g("DUTY_AT")), ts(g("HOS_VIOLATION_AT")),
                num(g("REMAINING_HOURS")), num(g("REMAINING_HOURS_CAN_7")), num(g("REMAINING_HOURS_CAN_8")),
                num(g("REMAINING_HOURS_CAN_14")), num(g("REMAINING_HOURS_US_7")), num(g("REMAINING_HOURS_US_8")),
                num(g("DOT_CLOCK_REMAIN_HOURS")),
                lat, lon, text(g("LAST_SAT_LOC")), ts(g("LAST_LOC_DATE")), text(g("LAST_SAT_ZONE")),
                integer(g("LAST_TRIP")), integer(g("CURRENT_TRIP")), integer(g("NEXT_TRIP")),
                text(g("FINAL_DESTINATION")), text(g("FINAL_DESTINATION_DESC")), ts(g("DELIVER_BY")),
                text(g("ASSIGNED_PUNIT")), text(g("DEFAULT_PUNIT")), text(g("OTHER_CODE")), text(g("TERMINAL_ZONE")),
                text(g("ETA_ZONE")), ts(g("ETA_DATE")),
            ),
        )

    # ---- Orders (TLORDER) ----
    for ix, r in sheet_rows(wb, "Tlorder"):
        g = lambda c: r[ix[c]]  # noqa: E731
        bill, root, suffix = bill_parts(g("BILL_NUMBER"))
        if bill is None:
            continue
        olat, olon = pc_ll(g("ORIGPC"))
        if olat is None:
            olat, olon = city_ll(g("ORIGCITY"), text(g("ORIGPROV")))
        dlat, dlon = pc_ll(g("DESTPC"))
        if dlat is None:
            dlat, dlon = city_ll(g("DESTCITY"), text(g("DESTPROV")))
        region = int(in_region(olat, olon) and in_region(dlat, dlon))
        bump("order_split_bill", suffix is not None, "info", "Orders that are split bills (BILL_NUMBER with a -XX suffix)")
        bump("order_no_rate_column", True, "warn", "The export has no rate/revenue column at all; financials are modelled, not read")
        bump("order_missing_actual_pickup", ts(g("ACTUAL_PICKUP")) is None, "warn", "Orders without an ACTUAL_PICKUP timestamp")
        bump("order_missing_actual_delivery", ts(g("ACTUAL_DELIVERY")) is None, "warn", "Orders without an ACTUAL_DELIVERY timestamp")
        bump("order_ungeocoded", olat is None or dlat is None, "info", "Orders where an endpoint could not be geocoded (city or postal code)")
        cur.execute(
            "INSERT OR REPLACE INTO orders VALUES (" + ",".join("?" * 36) + ")",
            (
                bill, root, suffix, integer(g("TRIP_NUMBER")), ts(g("CREATED_TIME")), text(g("CALLNAME")),
                text(g("ORIGCITY")), text(g("ORIGPROV")), text(g("ORIGPC")),
                text(g("DESTCITY")), text(g("DESTPROV")), text(g("DESTPC")),
                ts(g("ACTUAL_PICKUP")), ts(g("ACTUAL_DELIVERY")),
                text(g("PICK_UP_DRIVER")), text(g("PICK_UP_DRIVER2")), text(g("DELIVERY_DRIVER")), text(g("DELIVERY_DRIVER2")),
                integer(g("PICK_UP_TRIP")), integer(g("DELIVERY_TRIP")),
                num(g("DISTANCE")), text(g("SERVICE_LEVEL")), boolean(g("TEMP_CONTROLLED")),
                integer(g("DETAIL_LINE_ID")), integer(g("LEG_SEQUENCE")), boolean(g("CURRENTLY_ASSIGNED")),
                text(g("LOAD_TYPE")), text(g("LOAD_DESCRIPTION")), num(g("WEIGHT_LBS")), integer(g("PALLETS")), text(g("TEMPERATURE")),
                olat, olon, dlat, dlon, region,
            ),
        )

    multi = cur.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    dq["order_rows_collapsed_into_bills"] = [4031 - multi if multi else 0, 4031, "info",
                                             "TLORDER rows beyond one per bill (multi-row bills: later detail line wins)"]
    names = cur.execute("SELECT COUNT(*), COUNT(DISTINCT name) FROM drivers").fetchone()
    dq["driver_name_not_unique"] = [names[0] - names[1], names[0], "error" if names[0] != names[1] else "info",
                                    "Driver names are the join key to legs/telemetry; must be unique in this export"]

    # ---- Legs (LEGSUMMARY) ----
    per_driver_hos: dict[str, set] = {}
    leg_rows = 0
    for ix, r in sheet_rows(wb, "Dispatch"):
        g = lambda c: r[ix[c]]  # noqa: E731
        leg_id = integer(g("LS_LEG_ID"))
        leg_rows += 1
        if leg_id is None:
            continue
        drv = text(g("NAME"))
        hv = ts(g("HOS_VIOLATION_AT"))
        if drv:
            per_driver_hos.setdefault(drv, set()).add(hv)
        fz = norm_city(g("LEGO_ZONE_DESC")); tz = norm_city(g("LEGD_ZONE_DESC"))
        flat, flon = city_ll(*fz) if fz else (None, None)
        tlat, tlon = city_ll(*tz) if tz else (None, None)
        bump("leg_expected_date_sentinel", ts(g("LS_EXPECTED_DATE")) is None and nz(g("LS_EXPECTED_DATE")) is not None,
             "warn", "LS_EXPECTED_DATE is the 1980-01-01 sentinel (planning field unused)")
        bump("leg_planned_departure_sentinel", ts(g("LS_PLANNED_DEPARTURE")) is None and nz(g("LS_PLANNED_DEPARTURE")) is not None,
             "warn", "LS_PLANNED_DEPARTURE is a pre-2000 sentinel")
        bump("leg_no_trailer", text(g("LS_TRAILER1")) is None, "info", "Legs with no trailer assigned")
        bump("leg_empty", text(g("LS_MT_LOADED")) == "E", "info", "Legs flagged empty (E) — deadhead or repositioning")
        bump("leg_has_pickup_arrival", ts(g("LS_DET_PICK_ARRIVE")) is not None, "info", "Legs with a pickup dock arrival timestamp")
        bump("leg_has_delivery_arrival", ts(g("LS_DET_DELV_ARRIVE")) is not None, "info", "Legs with a delivery dock arrival timestamp")
        lbill, lroot, _ = bill_parts(g("LS_FREIGHT"))
        cur.execute(
            "INSERT OR REPLACE INTO legs VALUES (" + ",".join("?" * 58) + ")",
            (
                leg_id, integer(g("TRIP_NUMBER")), lbill, lroot, integer(g("LS_LEG_SEQ")), drv,
                text(g("LS_FROM_ZONE")), text(g("LS_TO_ZONE")), text(g("LS_MT_LOADED")), text(g("LS_LEG_STAT")),
                num(g("LS_LEG_DIST")), num(g("LS_LEG_WGT")),
                ts(g("LS_EXPECTED_DATE")), text(g("STATUS")), text(g("LTL_STATUS")),
                text(g("ORIGIN_ZONE")), text(g("DESTINATION_ZONE")), ts(g("PICKUP_BY")), ts(g("DELIVER_BY")), integer(g("LS_ACTIVE_LEG")),
                text(g("LS_TRAILER1")), text(g("LS_TRAILER2")),
                text(g("ORIG_ZONE_DESC")), text(g("DEST_ZONE_DESC")), text(g("ETA_ZONE_DESC")), text(g("CURRENT_ZONE_DESC")),
                text(g("LEGO_ZONE_DESC")), text(g("LEGD_ZONE_DESC")),
                integer(g("EXTRA_STOPS")), ts(g("PLAN_DEPART")), ts(g("LS_PLANNED_DEPARTURE")), ts(g("LS_SCHEDULED_ARRIVAL")),
                integer(g("LS_NUM_PU")), integer(g("LS_NUM_DEL")), integer(g("LS_NUM_TOTAL")), boolean(g("LS_PAY_DRIVER_MT_LEGS")),
                ts(g("LS_PICKUP_BY")), ts(g("LS_PICKUP_BY_END")), ts(g("LS_DELIVER_BY")), ts(g("LS_DELIVER_BY_END")),
                text(g("LAST_FB_STATUS")), ts(g("LS_DET_PICK_ARRIVE")), ts(g("LS_DET_DELV_ARRIVE")), ts(g("LS_LAST_FB_STATUS_DATE")),
                integer(g("LS_NUM_LEGS")),
                num(g("REMAINING_HOURS")), hv,
                boolean(g("LS_DANGEROUS_GOODS")), boolean(g("LS_TEMP_CONTROLLED")),
                text(g("LOAD_TYPE")), text(g("LOAD_DESCRIPTION")), num(g("WEIGHT_LBS")), integer(g("PALLETS")), text(g("TEMPERATURE")),
                flat, flon, tlat, tlon,
            ),
        )
    # The leg-level HOS columns are frozen per-driver copies (verified Sep 6): record that as a rule.
    kept = cur.execute("SELECT COUNT(*) FROM legs").fetchone()[0]
    dq["leg_rows_dropped_or_duplicate"] = [leg_rows - kept, leg_rows, "warn", "LEGSUMMARY rows without a leg id or with a duplicate leg id"]
    frozen = sum(1 for s in per_driver_hos.values() if len(s) == 1)
    dq["leg_hos_columns_frozen_per_driver"] = [
        frozen, len(per_driver_hos), "error",
        "Drivers whose HOS_VIOLATION_AT is identical on every leg — leg-level HOS is a stale copy; join HOS from drivers instead",
    ]

    # ---- Trucks / Trailers ----
    for ix, r in sheet_rows(wb, "Trucks"):
        tn = text(r[ix["TRUCK_NUMBER"]])
        if tn:
            cur.execute("INSERT OR REPLACE INTO trucks VALUES (?)", (tn,))
    dq["truck_specs_absent"] = [cur.execute("SELECT COUNT(*) FROM trucks").fetchone()[0],
                                cur.execute("SELECT COUNT(*) FROM trucks").fetchone()[0], "error",
                                "Trucks sheet has only TRUCK_NUMBER — no capacity/axle/fuel data; axle-weight compliance is not buildable"]
    for ix, r in sheet_rows(wb, "Trailers"):
        g = lambda c: r[ix[c]]  # noqa: E731
        tn = text(g("TRAILER_NUMBER"))
        if tn:
            cur.execute("INSERT OR REPLACE INTO trailers VALUES (?,?,?,?,?,?)",
                        (tn, text(g("TRAILER_TYPE")), num(g("CAPACITY_LBS")), num(g("LENGTH_FT")),
                         num(g("INSIDE_HEIGHT_FT")), num(g("WIDTH_IN"))))

    # ---- Places from the geocode cache ----
    for k, v in cities.items():
        if v:
            cur.execute("INSERT OR REPLACE INTO places VALUES (?,?,?,?,?)", (k, "city", v["lat"], v["lon"], v.get("display")))
    for k, v in postal.items():
        if v:
            cur.execute("INSERT OR REPLACE INTO places VALUES (?,?,?,?,?)", (k, "postal", v["lat"], v["lon"], v.get("display")))

    # ---- Data quality table ----
    for rule, (aff, tot, sev, note) in dq.items():
        cur.execute("INSERT OR REPLACE INTO data_quality VALUES (?,?,?,?,?,?)",
                    (rule, aff, tot, round(100.0 * aff / tot, 1) if tot else 0.0, sev, note))

    conn.commit()
    counts = {t: cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("drivers", "orders", "legs", "trucks", "trailers", "places")}
    region_n = cur.execute("SELECT COUNT(*) FROM orders WHERE in_region=1").fetchone()[0]
    print(json.dumps({"db": str(db_path), "counts": counts, "orders_in_region": region_n}, indent=1))
    print("data_quality:")
    for row in cur.execute("SELECT rule, affected, total, pct, severity FROM data_quality ORDER BY severity, rule"):
        print(f"  [{row['severity']:5}] {row['rule']:38} {row['affected']:6}/{row['total']:<6} {row['pct']:5.1f}%")
    conn.close()


if __name__ == "__main__":
    main()
