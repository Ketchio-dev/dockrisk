# Dispatch Rescue: Pre-Kickoff Plan

RoadStar Hackathon 2026 (Sep 5 to 13, Waterloo ON). Solo entry.
Status: planning document. No application code is written before the Sep 5 kickoff.
Last updated: 2026-09-01.

Related: `docs/research/domain-research.md` (sourced industry, API, and competitor research).

---

## 1. Product definition

**One line.** When one truck in an Ontario-to-US fleet breaks down, runs late, or runs out of hours, Dispatch Rescue recomputes the whole driver / tractor / trailer plan and presents three recovery options ranked by missed deliveries, deadhead, fuel, and revenue at risk. The dispatcher approves one, and the tool drafts the driver and customer messages.

**Positioning.** A human-approved *exception recovery layer* that sits beside an existing TMS. Road Star Trucking publicly runs TMW for dispatch and PeopleNet for in-cab telematics, so the pitch is "we do not replace TMW; we help when the plan breaks." Never call it an autonomous dispatcher or a compliance system.

**What it is not.**
- Not a daily load planner or load board.
- Not a certified hours-of-service (HOS) compliance determination.
- Not dependent on any external API to run the demo.

**Why this and not plain "AI dispatch".** Research shows order-to-driver recommendation is already crowded (Optimal Dynamics, Trimble AI assignment, Fleetline, Numeo, Vooma, Alvys). Driver apps are mature (Samsara Driver, Motive Driver). Pure prediction dashboards score poorly on demo impact. The gap that looks new to a 100-truck GM is: cascade-aware recovery with explained trade-offs and fast replanning.

---

## 2. Judging alignment

| Criterion | Weight | How Dispatch Rescue scores |
|---|---|---|
| Industry impact and relevance | 25% | Targets the most painful dispatcher moment (breakdowns, delays, HOS shortfalls, cascading misses). Cross-border Ontario to US Midwest scenario mirrors Road Star's lanes. |
| Innovation and creativity | 20% | Cascade computation, three compared recovery plans with cost / deadhead / service risk, "what changed" diff. |
| Technical execution | 20% | Real constraint optimization (OR-Tools CP-SAT) plus data validation, not an LLM guessing assignments. |
| Use of provided data and APIs | 15% | All six datasets (orders, trips, freight, trucks, trailers, drivers) feed the model; the data quality report is itself a visible use of the data. Provider adapters for Samsara / Motive if credentials appear. |
| Presentation and demo | 15% | One rehearsed incident scenario with before / after timeline and measurable numbers. |

Published weights sum to **95%**, not 100%. Ask at kickoff what the remaining 5% is.

Special awards to target: Best Use of AI, Best Industry Fit, Best Innovation. Not targeting Best Mobile App.

---

## 3. Scope and priorities

Build order is P0 first. The demo must work end to end with P0 alone.

**P0 (must exist by Tue Sep 8 evening)**
1. **Data import and validation.** Load organizer CSV / JSON / SQL into the canonical schema through per-source mappers. Show a data quality report: record counts, missing fields, unlinked driver / truck / trailer IDs, unparseable timestamps, orders unusable for optimization.
2. **Fleet timeline and baseline.** Gantt-style timeline of active and upcoming trips per driver / tractor / trailer, with delivery windows and P50 / P90 completion estimates. Map is secondary.
3. **Incident injection (buttons).** Truck breakdown (N minutes), N-hour delay at a stop, driver unavailable. Shows immediate cascade: trips at risk, windows likely missed, revenue at risk, downstream trips affected.
4. **Recovery plan generation and comparison.** "Do nothing" baseline plus three plans (driver swap, tractor swap, delay lower-priority trip) compared on missed deliveries, added deadhead miles, added fuel, drivers changed, revenue at risk.

**P1 (Wed Sep 9 to Thu Sep 10)**
5. **Approve and explain.** Approving a plan updates the timeline, highlights changed assets, shows the reason for each change and the constraints it respects, and drafts driver and customer messages.
6. **Simplified cross-border HOS feasibility** with plain-language reasons (see section 6).
7. **Natural-language incident input** parsed by an LLM into a structured event.

**P2 (only if time remains, Fri Sep 11)**
8. Ask-the-copilot Q&A over a plan ("why not plan B?").
9. Live provider adapter (Motive test mode or Samsara) feeding vehicle locations or HOS.
10. Morning briefing summary generated from the timeline.

---

## 4. Canonical data schema

All source files are mapped into these tables. IDs are strings. Times are stored as UTC ISO-8601 plus a source timezone field; the organizer data may mix timezones.

**orders**
- `order_id`, `customer_id`, `customer_name`
- `origin_name`, `origin_city`, `origin_region`, `origin_country`, `origin_lat`, `origin_lon`
- `dest_name`, `dest_city`, `dest_region`, `dest_country`, `dest_lat`, `dest_lon`
- `pickup_window_start`, `pickup_window_end`, `delivery_window_start`, `delivery_window_end`
- `weight_lbs`, `commodity`, `equipment_required` (dry_van | reefer | flatbed | other), `temp_min_f`, `temp_max_f` (nullable)
- `revenue`, `fuel_surcharge`, `rate_type` (customer_revenue | carrier_cost | unknown)
- `priority` (1 to 5), `status`, `load_swap_permitted` (bool, default true), `team_required` (bool)

**trips**
- `trip_id`, `order_id`, `driver_id`, `tractor_id`, `trailer_id`
- `planned_start`, `planned_end`, `actual_start`, `actual_end`
- `distance_miles`, `fuel_gallons`, `status` (planned | in_progress | completed | cancelled)
- `origin_*`, `dest_*` (copied from order when the source trip lacks them)
- `crosses_border` (bool), `jurisdiction_sequence` (e.g. `CA,US`)

**freight** (one row per order or per trip leg)
- `freight_id`, `order_id`, `commodity_type`, `load_size`, `pieces`, `rate`, `delivery_window_start`, `delivery_window_end`

**trucks** (tractors)
- `tractor_id`, `make`, `model`, `year`, `fuel_type`, `max_gross_weight_lbs`, `avg_mpg`, `home_terminal`, `current_lat`, `current_lon`, `status` (available | assigned | down), `can_cross_border` (bool)

**trailers**
- `trailer_id`, `trailer_type` (dry_van | reefer | flatbed | other), `length_ft`, `max_payload_lbs`, `has_reefer_unit`, `current_lat`, `current_lon`, `status`, `attached_tractor_id` (nullable)

**drivers**
- `driver_id`, `display_name` (anonymized), `home_terminal`, `certifications` (list), `can_cross_border` (bool), `team_eligible` (bool)
- `available_from` (timestamp), `current_lat`, `current_lon`
- `remaining_drive_min`, `remaining_on_duty_min`, `remaining_cycle_min`, `hos_jurisdiction` (CA | US), `hos_source` (demo | eld | manual)

**Derived tables (created by the app)**
- `assignments`: `trip_id`, `driver_id`, `tractor_id`, `trailer_id`, `version`, `source` (baseline | plan_a | plan_b | plan_c | approved)
- `events`: `event_id`, `event_type` (breakdown | delay | driver_unavailable), `asset_id`, `location`, `delay_min`, `certainty`, `raw_text`, `created_at`
- `plans`: `plan_id`, `event_id`, `label`, `metrics_json`, `changes_json`, `explanation`
- `lane_stats`: `origin_key`, `dest_key`, `n`, `p50_min`, `p90_min`, `avg_mpg`

**Mapping rules**
- One mapper module per source (`csv`, `json`, `sql`), each producing the canonical tables and a list of validation issues.
- Unknown equipment types map to `other` and are flagged, never silently treated as dry van.
- Missing `remaining_*` HOS fields are filled from the demo scenario and marked `hos_source = demo` and shown in the UI.

---

## 5. Optimization model

**Decision.** For each trip in the planning horizon (next 24 to 48 hours), choose a (driver, tractor, trailer) triple or mark the trip as delayed / unserved.

**Hard constraints (never violated)**
- Pickup before delivery; trip cannot start before the driver, tractor, and trailer are free and physically able to reach the origin.
- No double-booking of any driver, tractor, or trailer (interval no-overlap per resource, including deadhead travel time between consecutive trips).
- Order weight within tractor gross limit and trailer payload limit.
- Equipment match: reefer freight requires a reefer trailer; temp ranges respected.
- Required certifications present; cross-border trips require `can_cross_border` on driver and tractor.
- Required drive time plus deadhead within `remaining_drive_min`; on-duty within `remaining_on_duty_min`.
- Trips marked `load_swap_permitted = false` keep their trailer.
- A delivery window that is physically unreachable is a failure, not a stretched schedule.

**Soft penalties (minimized, weighted)**
- Missed delivery windows (largest weight), late minutes.
- Revenue at risk (order revenue times probability of miss).
- Added deadhead miles and added fuel (from `avg_mpg`).
- Number of changed assignments, driver changes, trailer swaps.
- Service probability below threshold (from P90 estimate).
- Lower-priority trips delayed.

**Objective.** Weighted sum. Weights are constants in one config file and shown in the UI so a judge can see the trade-off. Do not collapse the objective to "minimum distance".

**Solver.** OR-Tools CP-SAT with boolean assignment variables and optional interval variables per resource. Scale is 8 to 20 trips, so pairwise sequencing implications are fine. Fallback if CP-SAT causes trouble: exhaustive search over swaps limited to the affected assets, which is small at this scale.

**Distances and times.** Precomputed matrix between all locations. Demo uses haversine times a 1.2 road factor; use OSRM if reachable. Border crossing adds a fixed buffer (configurable, default 60 min). Facility dwell adds a per-stop buffer (default 90 min).

---

## 6. Simplified HOS feasibility

Inputs per driver are explicit remaining minutes, not reconstructed logs. The check compares the required drive and on-duty time for a candidate assignment against those remaining minutes and the daily caps below, and produces a sentence such as "Driver D12 cannot take T7: needs 6.5 h of driving, has 4.2 h remaining today (Canada Cycle 1)."

| Rule | Canada (south of 60, Cycle 1) | US (FMCSA property) |
|---|---|---|
| Max driving per day | 13 h | 11 h |
| Max on-duty per day / window | 14 h on duty | 14 h window |
| Daily off-duty | 10 h (8 consecutive) | 10 h consecutive |
| Break | none required by rule | 30 min after 8 h driving |
| Cycle | 70 h / 7 days | 60 h / 7 days or 70 h / 8 days |
| Reset | 36 h off | 34 h off |

Sources are in the research document, section 3.

UI disclaimer on every HOS statement: **"Operational planning estimate, not a certified compliance determination."**

---

## 7. Risk estimate (P50 / P90)

- Group historical trips by lane (`origin_key`, `dest_key`). If at least 5 samples, P50 and P90 of actual duration. Otherwise distance divided by an average speed (default 50 mph) plus a 25% buffer, flagged as "low confidence".
- Service probability for a trip = share of the lane distribution that arrives before the window end, given the planned start.
- No machine learning model in the MVP. This is deliberate: small data plus explainability beats a claimed accuracy figure.

---

## 8. Architecture and stack

- **Frontend:** Next.js (App Router), timeline component (Gantt), map (MapLibre or Leaflet), comparison table.
- **Backend:** Python FastAPI service: importers, validation, lane stats, optimization, plan diff.
- **Data:** DuckDB (analytics over CSV / JSON / SQL dumps) or SQLite. No external database required.
- **Optimization:** OR-Tools CP-SAT.
- **AI:** one LLM provider behind a small interface, used for (a) event text to structured JSON, (b) plan explanations from a structured diff, (c) driver / customer message drafts, (d) optional Q&A. The LLM never decides assignments. Use organizer AI credits if they arrive; otherwise own key.
- **Provider adapters:** `OrderProvider` (csv | json | sql | truckmate), `TelemetryProvider` (demo | samsara | motive), `HOSProvider` (demo | motive | samsara). Only `demo` and file-based providers are required for submission.
- **Deployment:** simplest path is a single Vercel project hosting the Next.js app and the FastAPI service as Python functions (Vercel supports Python with a 5 GB package limit, which fits OR-Tools). Alternative: Docker Compose locally plus a screen recording. A public demo URL is a submission field, so prefer deployed.

Repo layout (created on Day 1, not before):
```
apps/web          Next.js UI
services/api      FastAPI: importers, validation, optimizer, plans
packages/schema   canonical schema (pydantic + TS types), shared fixtures
data/samples      demo scenario data (synthetic, safe to commit)
data/private      organizer data (git-ignored; do not share publicly)
docs/             research, plan, pitch
```

---

## 9. Demo scenario specification

Modeled on Road Star's real lanes (Ontario to US Midwest, dry van plus reefer).

**Initial state**
- 8 active or upcoming trips from southern Ontario (Milton, Cambridge, London, Windsor) to US Midwest (Chicago, Detroit, Indianapolis, Columbus).
- Fleet: 8 tractors, 5 dry van trailers, 3 reefer trailers, 8 drivers. 6 drivers cross-border capable, 2 domestic only.
- Every trip has pickup and delivery windows. 4 trips have a following trip already planned for the same driver.
- Revenue per order between 1,800 and 3,400 CAD.

**Incident**
Truck 17, carrying reefer freight to Chicago, breaks down near London, Ontario. Estimated repair: 3 hours.

**Expected system output**
- Cascade: current trip at risk plus Truck 17's driver's next trip at risk. Two windows likely missed. Revenue at risk about 5,200 CAD.
- Plan A (driver and trailer swap with a nearby reefer-capable, cross-border driver): 0 missed, about 18 added deadhead miles, 2 drivers changed.
- Plan B (tractor replacement from terminal): 0 missed, about 31 added miles, 1 driver changed.
- Plan C (delay a lower-priority domestic trip): 1 missed, about 6 added miles, about 1,400 CAD at risk.
- Approval of Plan A: timeline redraws, changed assets highlighted, driver and customer messages drafted.

Numbers are computed from the sample data at demo time and labelled "demo dataset". The sample data is generated by a script so the scenario is reproducible.

---

## 10. Eight-day schedule (all times EDT)

| Day | Date | Plan | Fixed events |
|---|---|---|---|
| 0 | before Sep 5 | Prep only (section 12). No app code. | |
| 1 | Sat Sep 5 | Kickoff. Ask the section 13 questions, collect data and credentials, join Discord. Evening: repo scaffold, canonical schema, first importer, data quality report on real data. | Kickoff 4 to 9 PM, Prohibition Warehouse |
| 2 | Sun Sep 6 | Mappers for real CSV / JSON / SQL. Demo dataset generator. Timeline UI skeleton with baseline assignments. | Standup 10 AM (optional), office hours 1 PM |
| 3 | Mon Sep 7 | Optimization core: model, hard constraints, CP-SAT solve, "do nothing" evaluation, distance matrix. | Standup 10 AM, **Trucking APIs and data workshop 3 PM** |
| 4 | Tue Sep 8 | Incident buttons, cascade display, plan A / B / C generation, comparison table. **End of day: P0 demo works end to end.** | Standup 10 AM, office hours 1 PM |
| 5 | Wed Sep 9 | Buffer. Simplified HOS check with explanations, P50 / P90, polish data quality screen. Decide on pivot ladder step if data is bad. | **Final progress check-in 5 PM** |
| 6 | Thu Sep 10 | Approval flow, timeline diff, LLM explanations and messages, natural-language event parsing. | Standup 10 AM, office hours 1 PM |
| 7 | Fri Sep 11 | Polish, deploy, draft video recording, slides. Freeze features. | **Demo prep workshop 3 PM** |
| 8 | Sat Sep 12 | Morning: bug fixes only. Afternoon: final video, portal submission, Devpost submission. | **Code freeze and submission 5 PM** |
| 9 | Sun Sep 13 | Rehearse twice, present live (10 to 15 min). | Presentations from 1 PM, judging 4 PM, awards 5 PM, Spur Innovation Center |

Rules of thumb: every day ends with a runnable demo. Anything not demoable by Thursday night is cut.

---

## 11. Pivot ladder

**Step 0 (added Sep 4, overrides everything below). Whatever the Saturday brief specifies.** Corey Barron confirmed on Discord that participants "will get instructions on what to build at the event." If the Sep 5 brief names a concrete problem, that problem wins over Dispatch Rescue. Keep the core (schema, importer, HOS engine, routing, validation, UI shell) and change the objective and the hero screen. See `remote-day1-playbook.md`.

Steps 1-3 below apply only if the brief leaves the problem open. Decide by the Wed Sep 9 check-in.

1. **Data links well and includes times, equipment, and some HOS or location:** Dispatch Rescue as specified.
2. **Data is static plans without HOS or telemetry:** Dispatch Preflight. Same import and validation, same constraint engine, but the product is "lint the plan before departure and suggest minimal fixes." Feature 1 becomes the hero screen.
3. **Data links badly:** Data Quality and Feasibility Auditor. The validation report, cross-table linking diagnostics, and feasibility checks become the product, with a small demo of Rescue on synthetic data.

All three share the same code, so no rewrite is needed to move down the ladder.

---

## 12. Pre-kickoff checklist (allowed prep, no app code)

- [ ] Create a Motive developer account and a test-mode API key; note whether a dummy fleet needs support.
- [ ] Optional: apply to the Samsara partner program (5 to 7 business day approval). Drop it if it does not arrive by Sep 8.
- [ ] Download and inspect column names: Kaggle "Logistics Operations Database" (synthetic ops data; needs Kaggle login).
- [x] DT-CARGO sample copied to `data/public/dt-cargo/` (2026-09-01): `tracks.csv` (about 100k tracks: track_id, vehicle_id, tour_id, start/stop time, distance, avg/max speed, signal-loss stats, home_base, long_haul, rest_area, service_area_fuel flags) and `fleet.csv` (54 vehicles: gross weight, mass with trailer, axle class). European 2021 data under ODbL; useful for motion features only, not for orders.
- [x] Ontario 511 API verified (2026-09-01): no key needed, JSON, 10 calls per 60 s. `https://511on.ca/api/v2/get/event` (517 events with lat/lon, roadway, lanes affected), `.../truckrestareas` (121), `.../inspectionstations` (32 with lat/lon). Good live-disruption feed for the Ontario legs of the demo.
- [x] OSRM public server reachable (2026-09-01): route and table endpoints work; Milton ON to Chicago about 490 mi / 9.2 h. Use `/table/v1/driving` for the distance matrix; keep a cached copy in case the public server is slow on demo day.
- [x] Ontario MTO "Value of Goods 2016" road-link CSV saved to `data/public/mto/` (2026-09-01): per-highway-link AADTT16 truck volumes and value of goods. Map layer or density prior only.
- [ ] Prepare the pitch story: "Monday 7 AM, one dispatcher, 88 trucks, 40 appointments across the border."
- [ ] Portal login session expired on 2026-09-01 evening; log in again before checking organizer replies on /portal/messages.
- [x] Dev environment verified (2026-09-01): Node 26.8, Python 3.12 via uv, OR-Tools 9.15 (CP-SAT solves), DuckDB 1.5, FastAPI 0.141, Pydantic 2.13.
- [ ] Draft the slide skeleton (problem, incident, plans, approval, tech, impact).
- [ ] Reply from organizers on the portal message (data set file, API timing).

---

## 13. Questions for Sep 5

Ask Joe Smelko first, in this order.

1. What were the two exception situations your dispatchers handled manually most often in the last month?
2. Among breakdowns, detention, HOS shortfalls, missed appointments, and empty miles, which costs you the most?
3. Is a relay (another driver or tractor taking over a load mid-route) actually allowed in your operation?
4. Are your trailers mostly drop-and-hook or live load / unload?
5. Does the provided data include current locations, planned versus actual times, remaining HOS, and trailer status?
6. Is `rate` in the freight data customer revenue or carrier cost, and does it include fuel surcharge?
7. Are orders, trips, drivers, trucks, and trailers linked by shared IDs?
8. Is there any penalty or service priority data for missed windows?
9. Are the Samsara / TruckMate / Motive / DAT / Loadlink APIs confirmed, or should we plan on files only?
10. The published judging weights sum to 95%. What is the remaining 5%?
11. How do remote participants present on Sep 13 if they cannot attend in person?

The answer to question 1 outranks this plan. If the operators describe a different recurring incident, that incident becomes the headline demo.

---

## 14. Video (3 to 5 min) and live presentation (10 to 15 min)

**Video outline**
- 0:00 to 0:25 Problem: one late truck cascades into the driver's and equipment's next trips.
- 0:25 to 0:55 Initial fleet timeline, 8 trips, all green.
- 0:55 to 1:20 Incident: Truck 17 breakdown, 180 minutes. Cascade appears.
- 1:20 to 2:30 Plans A / B / C side by side; click one to see reasons, constraints, trade-offs.
- 2:30 to 3:20 Approve Plan A; timeline redraws; driver and customer messages.
- 3:20 to 4:10 Under the hood: six datasets into a constraint engine; LLM only parses and explains.
- 4:10 to 4:30 Impact on the demo dataset: 2 missed deliveries to 0, 18 deadhead miles, 5,200 CAD protected.

**Live presentation additions**
- Open with the operators' own answer to question 1 if it matches.
- Show the data quality report on the real organizer data for 60 seconds.
- Show the HOS explanation sentence and the disclaimer.
- Close with what would be needed to run this beside TMW and PeopleNet (adapters, not a replacement).

---

## 15. Traps a real dispatcher would call out

Design decisions that address each:
- Nearest truck is not best: the objective includes the replacement asset's next trip and revenue.
- Driver, tractor, and trailer are three separate assets with separate availability.
- Not every load can be swapped: `load_swap_permitted`, sealed / temperature-controlled flags, customer approval.
- Map ETA is not delivery time: dwell, border, and rest buffers are explicit and configurable.
- Dry van, reefer, and team runs differ: `equipment_required`, `team_required` in the schema, even if team logic is minimal in the MVP.
- Dispatchers know things the data does not: every recommendation has reasons, assumptions, side effects, a reject button, and a recorded reject reason.

---

## 16. Submission checklist (portal fields, due Sat Sep 12, 5 PM EDT)

Portal form: project name, technologies used, description, elevator pitch, GitHub URL, demo URL, demo video URL, pitch deck URL, key learnings, challenges faced. Submit on roadstarhackathon.com/portal/submissions (a team is auto-created on submit) and mirror on Devpost.

- [ ] Public GitHub repo, README with 60-second run instructions and the scenario.
- [ ] Deployed demo URL loads the sample scenario without credentials.
- [ ] Video uploaded (unlisted is fine) and linked.
- [ ] Slide deck link (Google Slides or PDF in Drive).
- [ ] Organizer data excluded from the repo (`data/private` git-ignored).
- [ ] All numbers labelled "demo dataset" where applicable; HOS disclaimer visible.

---

## 17. Open items and unverified claims

- Remaining 5% of judging weight: unknown.
- Whether provided data will include actual arrival times, remaining HOS, or locations: unknown until Sep 5 or the Sep 7 workshop.
- API and AI credit availability: all listed as "To Secure" on Sep 1.
- Remote presentation format on Sep 13: unanswered in FAQ.
- Luma attendee count reported by a second-opinion AI: not verified.
