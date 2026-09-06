# The Brief and the Data (received 2026-09-06)

Both landed in `/portal/documents` and `/portal/data` after the Sep 5 kickoff. Local copies in `data/portal-downloads/`.

## 1. The brief: "City Dispatch Workflow & Fleet Automation"

Source: `Hackathon_Project_Brief.pdf`, 6 pages.

**Framing.** A dispatcher at a small-to-medium regional carrier switches between ~5 disjointed systems daily — load boards (~$800/mo per device), ELD/logbooks (~$600/yr per truck), TMS (~$50/mo per user), quoting tools, maintenance and accounting. Each missed load quote is worth $1,000-$7,000; a bogged-down desk misses 1-3 jobs a day, roughly $6,000/day, $15,000-$50,000+/month. The stated goal: prove that fully integrated intelligent dispatch dashboards can be built rapidly and affordably.

**Region — this is a scope constraint, not flavour.** Southern Ontario city dispatch. Terminal hubs London ON and Milton ON. Bounded by Barrie (N), Peterborough and Pickering (E), London (W), Niagara Falls (S). 400-series corridors: 401, 403, 400.

**HOS — Canada only** (Transport Canada, south of 60°N): 13 h driving, 14 h on-duty, 16 h elapsed window since the end of the last 8+ h break, 10 h daily off-duty including an 8 h consecutive core, Cycle 1 = 70 h / 7 days, Cycle 2 = 120 h / 14 days. The US 11/14/60/70 rules from our earlier research are out of scope for the brief, though the data still carries US clocks.

### Required components

| # | Component | Required functionality |
|---|---|---|
| 1 | **Web Dispatcher Dashboard** | Production map (Google Maps, Mapbox, or Leaflet/OSM) with a **Satellite View toggle** — stated twice, so it is graded. Track & Trace: historical route breadcrumbs, distance/odometer per leg and shift, live and historical speed telematics. **Geofences and automated detention billing, flagged as the critical requirement**: timestamp dock arrival and departure, auto-calculate detention past the free 2-hour FTL allowance. Automated load-matching and HOS compliance engine. |
| 2 | **Separated Simulation Engine** | An independent script or service simulating live truck movement along Southern Ontario roads, streaming coordinates, speed, odometer and HOS state to the portal. Event generator for 401 slowdowns, dock waits and duty-cycle shifts. |
| 3 | **Driver Interface** | Mobile app or responsive web: digital ELD logbook, duty status, incoming load specs, route maps, load acceptance. |
| 4 | **Pipeline & Integration** | Multi-system consolidation — load board, ELD, TMS and detention tracking in one place. |

### Judging criteria in the brief

These are qualitative areas, and they do not match the percentage weights published on the website. Assume both are in play.

1. Workflow Speed & Financial Value ($15k-$50k/month recovery potential)
2. Geofencing & Detention Precision
3. Problem Discovery & Innovation — "did you uncover subtle edge cases, hidden industry pain points, or software bugs in standard city dispatch operations?"
4. Mapping & Track & Trace Depth
5. HOS & Regulatory Logic
6. Simulation Engine & Real-Time Sync
7. UI/UX & Usability

### The bonus focus is our original plan

> "**Edge Case / Hidden Problem Discovery (Bonus Focus):** What happens when a driver runs out of HOS while sitting in a dock queue waiting for a load? What if a truck encounters unexpected 401 highway closures? Finding and solving these real-world edge cases elevates your project score."

That is Dispatch Rescue, described by the organizers, as a scoring bonus. And the Ontario 511 live incident feed we verified on Sep 1 answers the 401-closure half of it directly.

## 2. The data: `Hackathon_Data.xlsx`, 3.8 MB, 5 sheets

This is a real TruckMate export from Road Star Trucking, not a synthetic set. Sheet and column names are TruckMate's own (`TLORDER`, `LS_*` from LEGSUMMARY). `HOME_ZONE` is `RSTAR` for 130 of 169 drivers and Milton is the top origin city, which confirms the Sep 1 research independently.

Handling: the portal marks this as non-public — anonymized drivers but **real customer names** (large consumer-goods, horticulture and automotive shippers). Keep it out of any public repo.

### Tlorder — 4,031 orders

`CREATED_TIME, BILL_NUMBER, TRIP_NUMBER, CALLNAME, ORIGCITY/PROV/PC, ACTUAL_PICKUP, PICK_UP_DRIVER(2), PICK_UP_TRIP, DESTCITY/PROV/PC, ACTUAL_DELIVERY, DELIVERY_DRIVER(2), DELIVERY_TRIP, DISTANCE, SERVICE_LEVEL, TEMP_CONTROLLED, DETAIL_LINE_ID, LEG_SEQUENCE, CURRENTLY_ASSIGNED, ROW_TIMESTAMP, INS_TIMESTAMP, LOAD_TYPE, LOAD_DESCRIPTION, WEIGHT_LBS, PALLETS, TEMPERATURE`

- ON→ON **2,109**; Southern Ontario city pairs **1,230**. Enough for the brief's region without inventing data.
- ON→US 661 (MI 141, IL 97, OH 91, KY 66) — out of the brief's scope, useful only as an "out of region" filter demo.
- Top origins: Milton 561, Whitby 341, Mississauga 288, North York 254, Brampton 240.
- Load types: Dry Van 3,366, Reefer 447, Flatbed 218.
- **No rate or revenue column.** Financial value has to be modelled from distance, empty miles and detention hours, not read off the data.

### Dispatch — 10,479 legs, 57 columns

The centre of gravity. `LS_LEG_ID, LS_LEG_SEQ, NAME, LS_FROM_ZONE, LS_TO_ZONE, LS_MT_LOADED, LS_LEG_STAT, LS_LEG_DIST, LS_LEG_WGT, PICKUP_BY, DELIVER_BY, LS_PICKUP_BY(_END), LS_DELIVER_BY(_END), PLAN_DEPART, LS_PLANNED_DEPARTURE, LS_SCHEDULED_ARRIVAL, LS_TRAILER1/2, ORIG/DEST/ETA/CURRENT/LEGO/LEGD_ZONE_DESC, EXTRA_STOPS, LS_NUM_PU/DEL/TOTAL/LEGS, LAST_FB_STATUS, LS_LAST_FB_STATUS_DATE, LS_DET_PICK_ARRIVE, LS_DET_DELV_ARRIVE, REMAINING_HOURS, HOS_VIOLATION_AT, LS_DANGEROUS_GOODS, LS_TEMP_CONTROLLED, LOAD_TYPE, WEIGHT_LBS, PALLETS, TEMPERATURE`

- **`LS_DET_PICK_ARRIVE` filled on 6,725 legs, `LS_DET_DELV_ARRIVE` on 6,744.** These are dock arrival timestamps — the raw material for the critical detention-billing requirement, already present.
- `REMAINING_HOURS` and `HOS_VIOLATION_AT` filled on 9,685 legs.
- `LS_TRAILER1` filled on 9,123.
- **Loaded 6,756 vs empty 3,723 — 35.5% of legs run empty.** This is the headline number for the pitch and it comes straight from their own data.
- Every leg is `FINISHED`. The set is historical; nothing is live or planned, which is exactly why the brief asks for a simulator.

### Driver — 169 rows, 50 columns

- **`REMAINING_HOURS_CAN_7 / CAN_8 / CAN_14` and `REMAINING_HOURS_US_7 / US_8`** — separate Canadian and US HOS clocks per driver, pre-computed.
- `CURRENT_DUTY, DUTY_AT, HOS_VIOLATION_AT, DOT_CLOCK_REMAIN_HOURS, DRIVER_CYCLE` (7-day for 94 drivers, 8-day for 37).
- **`POSLAT` / `POSLONG` on 127 drivers**, in DDMMSS format (`0433201N`, `0795300W`), plus `LAST_SAT_LOC` as text ("0.21M W of MILTON, ON") and `LAST_SAT_DATE`.
- `STATUS`: AVAIL 30, DEPSHIP 26, ASSGN 19, DISP 17, VACATION 12, DEPCONS 10, ARRSHIP 6, blank 38.
- `LAST_TRIP / CURRENT_TRIP / NEXT_TRIP`, `FINAL_DESTINATION`, `DELIVER_BY`, `ASSIGNED_PUNIT`, `DEFAULT_PUNIT`, `ETA_ZONE(_DESC)`, `ETA_DATE`.
- Anonymized as `Driver1`, `Driver1@email.com`.

### Trucks — 131 rows, 1 column

`TRUCK_NUMBER` only (`B3339`, `B8269`). The resources page promised capacities and fuel types; they are not here. Axle-weight compliance, which the brief mentions, cannot be done from this sheet — either derive limits from trailer capacity or ask.

### Trailers — 425 rows

`TRAILER_NUMBER, TRAILER_TYPE, CAPACITY_LBS, LENGTH_FT, INSIDE_HEIGHT_FT, WIDTH_IN`. Clean and sufficient.

## 3. Gap analysis against `dispatch-rescue-plan.md`

**Carries over unchanged:** the domain research, the Canadian HOS engine (section 6), OSRM routing and distance matrices, the Ontario 511 incident feed, the canonical schema and importer approach, the load-matching constraint engine, and the whole exception-recovery concept — now reframed as the brief's scored bonus focus rather than the headline.

**Must be added — none of these are in the current plan:**

| Gap | Why it matters |
|---|---|
| Map with satellite toggle | Named twice in the brief and is its own judging criterion. Our plan had a timeline view and no map. Leaflet + Esri World Imagery covers it without an API key. |
| Geofence engine + detention billing | The stated critical requirement, and its own judging criterion. Data is ready (6,725 / 6,744 dock timestamps, 2-hour free threshold). |
| Separated simulation engine | A required component and its own judging criterion. Replays historical legs as live telemetry — coordinates, speed, odometer, HOS burn — and injects 401 delays and dock waits. |
| Driver mobile interface with ELD logbook | A required component; also lines up with the Best Mobile App award and the midweek mobile workshop. |
| Track & trace: breadcrumbs, odometer, speed | Its own judging criterion. |

**Drops out:** US HOS as a headline feature (the brief is Canada-only), and cross-border as the demo scenario. The 661 US orders become an out-of-region filter case at most.

**Newly answered from our Sep 5 question list:** rate data does not exist (Q6), orders/trips/drivers/trailers do link by shared IDs (Q7), and no penalty or service-priority field is present (Q8).

## 4. Other kickoff facts

- Slides (`Presentation1.pptx`, 23 slides): prize pool $3,000 — grand $2,000+, **$500 each for 2nd and 3rd** plus swag. They explicitly want a Log Book App, a Dispatch App, an All-in-One Mobile App, and a Dashboard.
- **AI credits come from Spur Innovation via `spuric.com`, active from Monday Sep 7.** The portal's own AI Credits page still shows zero.
- The portal's API Docs and Tools pages are still empty, and the public resources page no longer lists Samsara / TruckMate / Motive / DAT / Loadlink at all. Live trucking API integrations are effectively off the table; the simulator replaces them.
- Devpost participants 50; Luma records 78 attended the kickoff.
