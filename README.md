# DockRisk — detention & HOS exception desk for Southern Ontario city dispatch

RoadStar Hackathon 2026 entry. A dock delay is turned into three things at once: a defensible detention
charge with its evidence, a forward Hours-of-Service check on the driver's next commitment, and a
completed reassignment before the driver runs out of hours.

The discovery underneath it: **the operational intervention deadline arrives before the financially
visible one.** A driver can have driving time left while a dock wait eats the 14 h on-duty allowance;
the next load becomes infeasible *before* the 2-hour detention threshold trips. TruckMate already rates
and bills detention — a timer is table stakes. Connecting the dock clock to the next dispatch decision,
in time to act, is the product.

## What is here

```
services/core/importer.py   TruckMate workbook (TLORDER, LEGSUMMARY, Driver, Trucks, Trailers) -> SQLite, with a data-quality report
services/core/analytics.py  historical dock dwell, conditional dwell model P(dwell>free | waited so far), exposure summary
services/core/hos.py        Canadian HOS (SOR/2005-313): 13/14/16 h, 10 h off + 8 h core, Cycle 1/2, s.24, s.76 flagged not granted
services/core/geofence.py   property + dock polygons, debounce, jitter tolerance; centroid fallback marked low-confidence
services/core/visits.py     facility-visit state machine, detention policy engine, evidence packet, replay-safe charges
services/core/matching.py   next-load rescue: eligibility filters + ranked candidates with reasons
services/core/backtest.py   history replay: charges over the export window, 30-min warning scored out of sample, anonymized
services/api/main.py        FastAPI: ingest telemetry/duty, visits, charges, exceptions, HOS, rescue, snapshot + SSE stream
services/sim/main.py        separate simulator: one virtual clock, OSRM road geometry, scripted dock dwell + 401 slowdown
apps/web                    Next.js: dispatcher dashboard (map + satellite toggle, exception inbox, three clocks) and driver ELD-companion view
docs/brief                  the organizer brief and what the data actually says (including a retracted finding)
docs/plan                   plan v2 against the real brief
docs/second-opinion         prompts and answers from other models that shaped the design
```

## History replay (backtest)

`uv run python -m core.backtest` replays every stop in the export through the detention rules: charges over the
whole window (floored to the increment, priced at the assumed rate) and the 30-minute warning scored out of sample
(model trained on the first 28 days, scored on the rest). Customer names are anonymized in the output. Served at
`GET /backtest` and shown on `/data` under *If DockRisk had been running*.


## Run

```bash
# 1. data (the organizer workbook is NOT in the repo — put it at data/portal-downloads/Hackathon_Data.xlsx)
cd services && uv sync
uv run python -m core.geocode      # once, ~8 min, Nominatim 1 req/s -> data/geo/
uv run python -m core.importer     # -> data/roadstar.db + data-quality report
uv run python -m core.analytics    # dwell history, conditional model, exposure

# 2. API
uv run uvicorn api.main:app --port 8000

# 3. web
cd ../apps/web && npm install && npm run dev      # http://localhost:3000  (driver view: /driver/<DriverName>)

# 4. simulator (separate process; --speed = sim seconds per wall second)
cd ../../services && uv run python -m sim.main --reset --speed 60
```

One command for all three: `scripts/demo.sh [speed]` (`scripts/demo.sh stop` to end).

### Run without the organizer data

The real workbook is not in the repo. `scripts/demo.sh` builds the database from
`data/sample/Hackathon_Data_SAMPLE.xlsx` when the organizer file is absent — a synthetic set in the
exact same five-sheet shape (fictional customers, generated values, the same quirks: split bills,
sentinel dates, frozen per-driver HOS copies, a thin dwell tail past two hours). Regenerate it with
`cd services && uv run python -m core.synthetic`. The numbers on screen will differ from the ones
quoted below, which come from the carrier's export.

Tests: `cd services && uv run pytest`.

## The numbers, and how to say them

From the organizers' own 62-day TruckMate export, Southern Ontario only, one dwell per (bill, stop):
**804 hours past the free 2 h across 56 days → $32k–$43k per month of detention exposure at $75–$100/h.**
Median dwell is under an hour; delivery p90 is 2.03 h — the money sits in a thin tail right at the
threshold, which is exactly what manual logging misses.

Say *exposure*. The export has no billing records, so nothing here shows what was or was not invoiced.

## Stated limits

- Prototype rules engine and duty-status view, **not a certified ELD**.
- Axle-weight compliance is not buildable: the Trucks sheet has one column. Trailer capacity checks are.
- City-centroid facilities are simulation geometry, not dock evidence; they are labeled as such and any
  charge against one goes to review.
- Leg-level HOS columns in the export are frozen per-driver copies; HOS is joined from the driver sheet.
- s.76 adverse driving conditions are surfaced as "possible, review required", never applied.
