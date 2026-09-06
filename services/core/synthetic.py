"""Synthetic sample data in the organizer workbook's exact shape (sheets TLORDER-like 'Tlorder', 'Dispatch',
'Driver', 'Trucks', 'Trailers' with the same column names), so the repo runs without the non-public file.

    uv run python -m core.synthetic            # -> data/sample/Hackathon_Data_SAMPLE.xlsx
    uv run python -m core.importer --xlsx data/sample/Hackathon_Data_SAMPLE.xlsx

Numbers are shaped like the real export (Southern Ontario city pairs, dry van / reefer / flatbed mix,
dock dwell with a thin tail past two hours, split bills, sentinel dates, frozen per-driver HOS copies)
but every value is generated. Customer names are fictional.
"""
from __future__ import annotations

import argparse
import datetime as dt
import random
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/sample/Hackathon_Data_SAMPLE.xlsx"

from core.city_coords import CITY_COORDS  # noqa: E402

CITIES = {  # city: (prov, postal FSA, lat, lon) — Southern Ontario; coordinates from the shared table
    "MILTON": ("ON", "L9T", 43.5183, -79.8774), "LONDON": ("ON", "N6E", 42.9849, -81.2453), "MISSISSAUGA": ("ON", "L5T", 43.5890, -79.6441),
    "BRAMPTON": ("ON", "L6T", 43.7315, -79.7624), "GUELPH": ("ON", "N1H", 43.5448, -80.2482), "CAMBRIDGE": ("ON", "N1R", 43.3616, -80.3144),
    "KITCHENER": ("ON", "N2G", 43.4516, -80.4925), "HAMILTON": ("ON", "L8E", 43.2557, -79.8711), "WHITBY": ("ON", "L1N", 43.8975, -78.9429),
    "OSHAWA": ("ON", "L1H", 43.8971, -78.8658), "BURLINGTON": ("ON", "L7L", 43.3255, -79.7990), "OAKVILLE": ("ON", "L6H", 43.4675, -79.6877),
    "WOODSTOCK": ("ON", "N4S", 43.1306, -80.7467), "BRANTFORD": ("ON", "N3T", 43.1394, -80.2644), "TORONTO": ("ON", "M9W", 43.6532, -79.3832),
    "PICKERING": ("ON", "L1W", 43.8384, -79.0868), "BARRIE": ("ON", "L4N", 44.3894, -79.6903), "NIAGARA FALLS": ("ON", "L2E", 43.0896, -79.0849),
}
CUSTOMERS = ["NORTHBRIDGE FOODS", "MAPLE LINE PACKAGING", "GREAT LAKES AUTO PARTS", "HURON VALLEY PRODUCE", "ESCARPMENT BUILDING SUPPLY",
             "LAKESHORE BEVERAGE CO", "GOLDEN HORSESHOE LOGISTICS", "TRILLIUM PAPER", "SIMCOE COLD STORAGE", "GRAND RIVER STEEL"]
LOADS = [("Dry Van", "Packaged foods", "Ambient", 0.72), ("Reefer", "Fresh produce", "36 F", 0.18), ("Flatbed", "Steel coils", "", 0.10)]


def dwell_minutes(rng: random.Random) -> float:
    """Log-normal body with median ~35 min and a thin tail: ~10% past 120 min, a few past 8 h."""
    d = rng.lognormvariate(3.55, 0.75)
    if rng.random() < 0.02:
        d += rng.uniform(240, 900)
    return round(min(d, 2400), 1)


def main(out: Path = OUT, seed: int = 11, n_orders: int = 260, n_drivers: int = 36):
    rng = random.Random(seed)
    wb = openpyxl.Workbook()
    cities = list(CITIES)

    # ---- Drivers ----
    ws = wb.active; ws.title = "Driver"
    dcols = ["DRIVER_ID", "HOME_ZONE", "DRIVER_TYPE", "PAY_TYPE", "EMAIL", "FIRST_NAME", "DRIVER_CYCLE", "DRIVER_CYCLE_ZONE", "REMAINING_HOURS", "CUMULATIVE_HOURS",
             "DAYS_7", "DAYS_8", "DAYS_14", "HOURS_UPDATED", "REMAINING_HOURS_CAN_7", "REMAINING_HOURS_CAN_8", "REMAINING_HOURS_CAN_14", "REMAINING_HOURS_US_7", "REMAINING_HOURS_US_8",
             "CURRENT_DUTY", "DUTY_AT", "HOS_VIOLATION_AT", "HOS_CUMULATIVE_HOURS", "ALT_DRIVER_CYCLE", "ALT_DRIVER_CYCLE_ZONE", "CURRENT_DRIVER_CYCLE", "CURRENT_DRIVER_CYCLE_ZONE",
             "DOT_CLOCK_REMAIN_HOURS", "LAST_SAT_ZONE", "LAST_SAT_DATE", "LAST_SAT_LOC", "POSLAT", "POSLONG", "MSG_NR", "ACTIVE_IN_DISP", "STATUS", "TERMINAL_ZONE", "LAST_TRIP",
             "CURRENT_TRIP", "NEXT_TRIP", "FINAL_DESTINATION", "FINAL_DESTINATION_DESC", "DELIVER_BY", "ASSIGNED_PUNIT", "DEFAULT_PUNIT", "OTHER_CODE", "ETA_ZONE", "ETA_DATE", "LAST_LOC_DATE", "ETA_ZONE_DESC"]
    ws.append(dcols)
    now = dt.datetime(2026, 9, 1, 6, 0)

    def dms(v: float, pos: str, neg: str) -> str:
        h = pos if v >= 0 else neg; v = abs(v); d = int(v); m = int((v - d) * 60); s_ = int(round(((v - d) * 60 - m) * 60))
        return f"{d:03d}{m:02d}{s_:02d}{h}"

    drivers = []
    for i in range(1, n_drivers + 1):
        city = rng.choice(["MILTON"] * 6 + cities)
        _, _, lat, lon = CITIES[city]
        rem7 = round(rng.uniform(4, 70), 2)
        duty_at = now - dt.timedelta(hours=rng.uniform(0, 9))
        status = rng.choice(["AVAIL", "AVAIL", "DISP", "ASSGN", "DEPSHIP", "VACATION"])
        drivers.append({"id": i, "name": f"Driver{i}", "rem7": rem7, "city": city})
        ws.append([i, "RSTAR", "C", "V", f"Driver{i}@email.com", f"Driver{i}", 7, "C", rem7, None, None, None, None, now.isoformat(sep=" "),
                   rem7, round(rem7 * 0.9, 2), round(min(120, rem7 + 40), 2), rem7, rem7, 1 if status != "VACATION" else 0, duty_at.isoformat(sep=" "),
                   (duty_at + dt.timedelta(hours=70)).isoformat(sep=" "), None, 7, None, 7, "C", None, "RSTAR", now.isoformat(sep=" "), f"0.2M W of {city}, ON",
                   dms(lat + rng.uniform(-0.01, 0.01), "N", "S"), dms(lon + rng.uniform(-0.01, 0.01), "E", "W"), rng.randint(1, 900), True, status, "RSTAR",
                   600000 + i, 0, 0, "RSTAR", "MILTON, ON", None, f"B{3000 + i}", f"B{3000 + i}", rng.choice(["COMPANY", "LOCAL"]), None, "1980-01-01 00:00:00", now.isoformat(sep=" "), None])

    # ---- Trucks / Trailers ----
    wt = wb.create_sheet("Trucks"); wt.append(["TRUCK_NUMBER"])
    for i in range(1, n_drivers + 5):
        wt.append([f"B{3000 + i}"])
    wtr = wb.create_sheet("Trailers"); wtr.append(["TRAILER_NUMBER", "TRAILER_TYPE", "CAPACITY_LBS", "LENGTH_FT", "INSIDE_HEIGHT_FT", "WIDTH_IN"])
    for i in range(1, 61):
        t = "Dry Van" if i <= 40 else "Reefer" if i <= 52 else "Flatbed"
        wtr.append([f"{'DV' if t == 'Dry Van' else 'RF' if t == 'Reefer' else 'FB'}{i:03d}", t, 44500 if t != "Flatbed" else 48000, 53, 8.5 if t != "Flatbed" else 0, 98 if t != "Flatbed" else 102])

    # ---- Orders + Legs ----
    wo = wb.create_sheet("Tlorder")
    ocols = ["CREATED_TIME", "BILL_NUMBER", "TRIP_NUMBER", "CALLNAME", "ORIGCITY", "ORIGPROV", "ORIGPC", "ACTUAL_PICKUP", "PICK_UP_DRIVER", "PICK_UP_DRIVER2", "PICK_UP_TRIP",
             "DESTCITY", "DESTPROV", "DESTPC", "ACTUAL_DELIVERY", "DELIVERY_DRIVER", "DELIVERY_DRIVER2", "DELIVERY_TRIP", "DISTANCE", "SERVICE_LEVEL", "TEMP_CONTROLLED",
             "TRIP_NUMBER_1", "BILL_NUMBER_1", "DETAIL_LINE_ID", "LEG_SEQUENCE", "CURRENTLY_ASSIGNED", "ROW_TIMESTAMP", "INS_TIMESTAMP", "LOAD_TYPE", "LOAD_DESCRIPTION", "WEIGHT_LBS", "PALLETS", "TEMPERATURE"]
    wo.append(ocols)
    wd = wb.create_sheet("Dispatch")
    lcols = ["LS_FREIGHT", "TRIP_NUMBER", "LS_LEG_ID", "LS_LEG_SEQ", "NAME", "LS_FROM_ZONE", "LS_TO_ZONE", "LS_MT_LOADED", "LS_LEG_STAT", "LS_LEG_DIST", "LS_LEG_WGT", "LS_EXPECTED_DATE",
             "STATUS", "LTL_STATUS", "ORIGIN_ZONE", "DESTINATION_ZONE", "PICKUP_BY", "DELIVER_BY", "LS_ACTIVE_LEG", "LS_TRAILER1", "LS_TRAILER2", "LS_FREIGHT_1", "LS_FREIGHT2", "LS_FREIGHT3", "LS_FREIGHT4",
             "ORIG_ZONE_DESC", "DEST_ZONE_DESC", "ETA_ZONE_DESC", "CURRENT_ZONE_DESC", "LEGO_ZONE_DESC", "LEGD_ZONE_DESC", "EXTRA_STOPS", "PLAN_DEPART", "LS_PLANNED_DEPARTURE", "LS_SCHEDULED_ARRIVAL",
             "LS_NUM_PU", "LS_NUM_DEL", "LS_NUM_TOTAL", "LS_PAY_DRIVER_MT_LEGS", "LS_PICKUP_BY", "LS_PICKUP_BY_END", "LS_DELIVER_BY", "LS_DELIVER_BY_END", "LAST_FB_STATUS", "LS_DET_PICK_ARRIVE",
             "LS_DET_DELV_ARRIVE", "LS_LAST_FB_STATUS_DATE", "LS_NUM_LEGS", "REMAINING_HOURS", "HOS_VIOLATION_AT", "LS_DANGEROUS_GOODS", "LS_TEMP_CONTROLLED", "LOAD_TYPE", "LOAD_DESCRIPTION", "WEIGHT_LBS", "PALLETS", "TEMPERATURE"]
    wd.append(lcols)
    start = dt.datetime(2026, 7, 1)
    leg_id = 1_700_000
    frozen_hos = {d["name"]: (dt.datetime(2023, 11, 30) + dt.timedelta(hours=d["id"] * 7)).isoformat(sep=" ") for d in drivers}
    for n in range(n_orders):
        bill_root = 500000 + n
        split = rng.random() < 0.25
        suffixes = ["-AA", "-AB"] if split else [""]
        o_city = rng.choice(["MILTON"] * 4 + cities); d_city = rng.choice([c for c in cities if c != o_city])
        lt, desc, temp, _ = rng.choices(LOADS, weights=[w for *_, w in LOADS])[0]
        cust = rng.choice(CUSTOMERS)
        created = start + dt.timedelta(days=rng.uniform(0, 55), hours=rng.uniform(6, 18))
        drv = rng.choice(drivers)
        trip = 700000 + n
        appt_pick = (created + dt.timedelta(days=rng.randint(1, 3))).replace(minute=0, second=0)
        arr_pick = appt_pick - dt.timedelta(minutes=rng.uniform(5, 70))
        dwell_p = dwell_minutes(rng)
        done_pick = max(appt_pick, arr_pick) + dt.timedelta(minutes=dwell_p)
        km = 1.3 * 111 * ((CITIES[o_city][2] - CITIES[d_city][2]) ** 2 + ((CITIES[o_city][3] - CITIES[d_city][3]) * 0.73) ** 2) ** 0.5
        arr_delv = done_pick + dt.timedelta(hours=km / 75 + rng.uniform(0.2, 1.0))
        appt_delv = (arr_delv + dt.timedelta(minutes=rng.uniform(0, 60))).replace(minute=0, second=0)
        dwell_d = dwell_minutes(rng)
        done_delv = max(appt_delv, arr_delv) + dt.timedelta(minutes=dwell_d)
        weight = rng.randint(8000, 44000); pallets = rng.randint(8, 26)
        for k, suf in enumerate(suffixes):
            bill = f"{bill_root}{suf}"
            wo.append([created.isoformat(sep=" "), bill, trip, cust, o_city, "ON", f"{CITIES[o_city][1]} {rng.randint(1,9)}{rng.choice('ABCEGHJKLMNPRSTVWXYZ')}{rng.randint(1,9)}",
                       done_pick.isoformat(sep=" "), drv["name"][:4].upper(), "<null>", trip, d_city, "ON", f"{CITIES[d_city][1]} {rng.randint(1,9)}{rng.choice('ABCEGHJKLMNPRSTVWXYZ')}{rng.randint(1,9)}",
                       done_delv.isoformat(sep=" "), drv["name"][:4].upper(), "<null>", trip, round(km / 1.609, 1), "REG" if lt != "Flatbed" else "FLAT", lt == "Reefer",
                       trip, bill, 660000 + n * 2 + k, k + 1, False, (done_delv + dt.timedelta(hours=2)).isoformat(sep=" "), created.isoformat(sep=" "), lt, desc, weight // len(suffixes), pallets // len(suffixes), temp])
        # legs: empty reposition -> loaded pickup -> loaded delivery
        trailer = f"{'DV' if lt == 'Dry Van' else 'RF' if lt == 'Reefer' else 'FB'}{rng.randint(1, 40 if lt == 'Dry Van' else 12 if lt == 'Reefer' else 8):03d}" if lt != "Reefer" else f"RF{rng.randint(41, 52):03d}"
        home = drv["city"]
        legs = [("E", home, o_city, None, None), ("L", o_city, d_city, arr_pick, arr_delv)]
        for seq, (mt, fz, tz, det_p, det_d) in enumerate(legs, 1):
            leg_id += 1
            dist = round(1.3 * 111 * ((CITIES[fz][2] - CITIES[tz][2]) ** 2 + ((CITIES[fz][3] - CITIES[tz][3]) * 0.73) ** 2) ** 0.5 / 1.609, 1)
            wd.append([f"{bill_root}{suffixes[0]}" if mt == "L" else "<null>", trip, leg_id, seq, drv["name"], fz[:3] + "ZN", tz[:3] + "ZN", mt, "FINISHED", dist, weight if mt == "L" else 0,
                       "1980-01-01 00:00:00" if rng.random() < 0.68 else appt_pick.isoformat(sep=" "), "COMPLETE", "DELVNG", o_city[:3] + "ZN", d_city[:3] + "ZN",
                       appt_pick.date().isoformat() + " 00:00:00", appt_delv.date().isoformat() + " 00:00:00", seq, trailer if mt == "L" or rng.random() < 0.6 else "<null>", "<null>",
                       f"{bill_root}{suffixes[0]}" if mt == "L" else "<null>", "<null>", "<null>", "<null>", f"{o_city}, ON", f"{d_city}, ON", f"{d_city}, ON", f"{tz}, ON", f"{fz}, ON", f"{tz}, ON",
                       "<null>", (arr_pick - dt.timedelta(hours=2)).isoformat(sep=" "), (arr_pick - dt.timedelta(hours=2)).isoformat(sep=" ") if rng.random() > 0.05 else "1980-01-01 00:00:00",
                       arr_delv.isoformat(sep=" "), 1, 1, 1, mt == "E", appt_pick.isoformat(sep=" "), (appt_pick + dt.timedelta(hours=2)).isoformat(sep=" "),
                       appt_delv.isoformat(sep=" "), (appt_delv + dt.timedelta(hours=2)).isoformat(sep=" "), "COMPLETE",
                       det_p.isoformat(sep=" ") if det_p else "<null>", det_d.isoformat(sep=" ") if det_d else "<null>", done_delv.isoformat(sep=" "), 2,
                       drv["rem7"], frozen_hos[drv["name"]], False, lt == "Reefer", lt, desc, weight, pallets, temp])
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f"wrote {out} — {n_orders} orders ({sum(1 for _ in range(0))}), {leg_id - 1_700_000} legs, {n_drivers} drivers, 60 trailers; seed {seed}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT)); ap.add_argument("--seed", type=int, default=11); ap.add_argument("--orders", type=int, default=260)
    a = ap.parse_args()
    main(Path(a.out), a.seed, a.orders)
