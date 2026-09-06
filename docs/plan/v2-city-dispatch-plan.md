# Plan v2: City Dispatch, rebuilt on the real brief

Supersedes the scheduling and feature sections of `dispatch-rescue-plan.md`. That document's research, HOS section and constraint modelling still hold; its 8-day schedule and hero screen do not.

Written 2026-09-06. **Deadline: the site schedule (verified Sep 6) says code freeze Sun Sep 13 2:00 PM, Devpost says Sun 12:00 PM.** We build to be done Saturday night and treat Sunday morning as packaging only. Presentation **Sun Sep 13 from 2:00 PM, Spur Innovation Center** (doors 12:00, judging 4:00, awards 5:00).

## 1. What we are building

**A city dispatch desk for Southern Ontario that turns one dock delay into three things at once: a defensible detention charge with its evidence, a forward HOS check on the driver's next commitment, and a completed reassignment before the driver's hours run out.**

The discovery claim underneath it, sharpened by the Sep 6 second opinion: **the operational intervention deadline arrives before the financially visible one.** A driver can have hours of driving time left while a dock wait eats the on-duty allowance; the next load becomes infeasible *before* the 2-hour detention threshold trips. TruckMate already rates and bills detention — a timer is table stakes. What it does not do is connect the dock clock to the next dispatch decision in time to act.

Four required components from the brief, plus one bonus layer the brief itself asks for.

| # | Component | Ours |
|---|---|---|
| 1 | Web dispatcher dashboard | Live Southern Ontario map with satellite toggle, fleet list, load board, per-truck track & trace |
| 2 | Separated simulation engine | Standalone service replaying the 10,479 historical legs as live telemetry, with injected 401 events |
| 3 | Driver interface | Responsive web ELD logbook, duty status, load accept/reject, route view |
| 4 | Pipeline & integration | One importer collapsing TLORDER + LEGSUMMARY + driver HOS + trailers into a single store |
| **5** | **Exception recovery (bonus focus)** | HOS-shortfall and 401-closure detection with recovery options — the brief's own bonus criterion |

## 2. The three things that make it not a generic dashboard

*Item 1 was rewritten on Sep 6 afternoon after the "stale clock" finding failed its pressure test.*

Everything in section 1 is what every team will build, because the brief tells them to. These are not in the brief:

1. **HOS recomputed, not copied.** The export's leg-level HOS columns are frozen per-driver copies (see findings, retracted item 1). We compute 13/14/16 h daily limits and the Cycle 1/2 projection from duty state and show it beside TruckMate's own 70 h projection from the driver board. Where they agree, that is credibility; where they differ, that is the pre-dispatch audit.
2. **Measured exposure, not quoted money.** The brief guesses $15k-$50k/month. We show $30,302-$40,403/month of detention *exposure* computed from their own 62 days, with the method and its limits on screen — the export has no billing records, so we never say "unbilled".
3. **Live 401 disruption.** Ontario 511 is a real feed with no API key, verified Sep 1. The brief asks "what if a truck encounters unexpected 401 closures?" as a hypothetical. We answer it against the live 401 during the demo.

## 3. Architecture

```
apps/web        Next.js — dispatcher dashboard + driver responsive view
                Leaflet + OSM tiles, Esri World Imagery for satellite toggle
services/api    FastAPI — importer, HOS engine, geofence + detention, matching (eligibility filters + ranking; OR-Tools only if coupled reassignment demands it)
services/sim    Standalone Python service — telemetry replay + event generator
data/roadstar.db  SQLite (DuckDB for the analytics views)
```

Kept deliberately boring: no auth, no queue, no container orchestration, one process per box. The simulator is a separate service because the brief requires it to be separate.

**Data handling.** `Hackathon_Data.xlsx` contains real customer names and is marked non-public. It stays in `data/portal-downloads/`, git-ignored. The repo ships the importer and a synthetic sample, never the file.

## 3b. Status — end of Day 2 (Sun Sep 6)

Built and verified in a browser: importer + data-quality report, dwell analytics + conditional model + exposure, Canadian HOS engine (11 tests), geofence tracker + visit state machine + detention policy engine + evidence packet (5 tests), next-load rescue ranking (2 tests), FastAPI with SSE, standalone simulator on OSRM geometry with a scripted "dock_squeeze" scenario, dispatcher dashboard (map with satellite toggle, exception inbox, three-clock cards, charges, rescue panel) and driver ELD-companion view. The P0 loop in section 5 runs end to end: rescue → offer → driver accepts → exception resolves. Days 3-4 targets (geofence/detention, simulator) are therefore already met; the schedule below is now: Mon = hand-drawn facility polygons against satellite imagery + policy extraction from a rate confirmation (the one LLM feature) + track-and-trace panel (odometer/speed per leg); Tue = simulator realism (speed profiles, dock queue vs dock, GPS gaps) and demo-day caching; Wed = buffer + check-in; Thu = driver view polish, mobile layout, evidence export; Fri = deck, video draft, freeze.

## 4. Schedule

Today is Day 2. Six and a half working days to freeze.

| Day | Date | Target | Fixed |
|---|---|---|---|
| **2** | **Sun Sep 6** | Repo scaffold. Importer: xlsx to SQLite, canonical schema. Map shell with satellite toggle rendering real driver positions from `POSLAT`/`POSLONG`. | — |
| 3 | Mon Sep 7 | **Geofence + detention engine** — the critical requirement. Dock polygons around the top facilities, arrival/departure timestamping, 2 h threshold, billing table. Claim Spur AI credits at spuric.com. | Standup 10 AM, **APIs workshop 3 PM** |
| 4 | Tue Sep 8 | **Simulation engine.** Replay legs as live telemetry: coordinates, speed, odometer, HOS burn. Ontario 511 event injection. Dashboard consumes the stream. | Standup 10 AM, office hours 1 PM |
| 5 | Wed Sep 9 | **Canadian HOS engine** (13/14/16/10, Cycle 1 and 2) + load matching + the stale-clock detector. **End of day: P0 runs end to end.** | **Progress check-in 5 PM** |
| 6 | Thu Sep 10 | **Driver interface** — responsive ELD logbook, duty status, load accept. Track & trace: breadcrumbs, odometer, speed. | Standup 10 AM, office hours 1 PM |
| 7 | Fri Sep 11 | Exception recovery layer. Data-quality panel. Financial dashboard. Polish, deploy. **Feature freeze at midnight.** | **Demo prep workshop 3 PM** |
| 8 | Sat Sep 12 | Morning: bugs only. Afternoon: 3-5 min video, portal submission, Devpost. Treat 5 PM as our own freeze. | Self-imposed freeze |
| 9 | Sun Sep 13 | Morning: final packaging only. Rehearse twice. Present. | Official freeze 2:00 PM (Devpost 12:00). Doors 12:00, presentations 2:00 |

Every day ends with something that runs. Anything not demoable by Thursday night is cut.

## 5. P0, the part that must exist

If everything else fails, this is the demo:

1. Import the real file, show the fleet on a Southern Ontario map, satellite toggle working
2. Simulator drives a truck along a real 401 route in real time
3. It arrives at a dock geofence; the timestamp lands in the database; the clock starts at the later of arrival and appointment; a draft detention charge appears with its evidence (raw pings, rule applied, calculation)
4. The forward HOS check shows the driver's next load is infeasible before the detention threshold even trips; the audit blocks it with the reason
5. Dispatcher reassigns to an eligible driver; the driver view receives it and accepts; both assignments update; the original stop keeps its detention evidence
6. The financial panel shows the measured exposure with the method

Constraints on the fixture, per the second opinion: about six active trucks, a handful of manually validated facility polygons (city centroids are not dock evidence), one simulation clock driving telemetry, HOS, detention and both interfaces. Reset and replay must yield the same state and the same single charge — no duplicates.

That is one exception, shown completely, and it touches every judging criterion.

## 6. Mapped against the brief's judging criteria

| Criterion | Where it is earned |
|---|---|
| Workflow Speed & Financial Value | Measured detention figure; matching that removes manual check calls |
| Geofencing & Detention Precision | Day 3, the critical requirement, built first for a reason |
| Problem Discovery & Innovation | Findings 3 and 4 (the detention tail, the short-hop empty legs), the missing truck specs, and the retraction itself — showing a judge which "bug" we tested and threw out |
| Mapping & Track & Trace Depth | Satellite toggle, breadcrumbs, odometer, speed telemetry |
| HOS & Regulatory Logic | Canadian 13/14/16/10 + Cycle 1/2, recomputed rather than trusted |
| Simulation Engine & Real-Time Sync | Separate service, live stream, 511 events |
| UI/UX & Usability | Dispatcher and driver as two real surfaces, not one page with a toggle |

Also live: the site's published percentage weights (Industry Impact 25, Innovation 20, Technical Execution 20, Use of Provided Data & APIs 15, Presentation 15). The measured-from-their-data approach serves both rubrics at once.

## 7. Risks

| Risk | Response |
|---|---|
| Simulator eats two days | Timebox to Tuesday. Fallback: pre-recorded telemetry replayed from a table. It still satisfies "separate service". |
| Satellite tiles rate-limited on demo day | Cache tiles for the demo bounding box on Friday. |
| 511 feed down during the demo | Snapshot a real incident on Friday and replay it. Say that on stage. |
| OSRM public server slow | Precompute the demo distance matrix and ship it. |
| Detention method challenged by a freight judge | Method is on screen and in the doc. Median, p90 and the discard rule stated. |
| Solo, no cover for a sick day | Wednesday is load-bearing buffer. Do not spend it on features. |

## 8. Open questions for the organizers

1. `Trucks` has only `TRUCK_NUMBER` — are power unit specs coming? Axle-weight compliance in the brief is not buildable without them.
2. On the `Driver` sheet, `HOS_VIOLATION_AT` sits exactly 70 h after `DUTY_AT` for most drivers — is that the Cycle 1 projection, and is it what your dispatchers actually read? (We have already established the leg-level copy of it is frozen.)
3. No rate or revenue column. Should financial impact be modelled at standard market rates, or is rate data coming?
4. Detention: is $75-$100/h the right assumption for Road Star's FTL lanes?
5. Do remote participants present in person on Sep 13, or is there a Zoom path?
6. **TruckMate already has detention rating, warnings and billing. What stops Road Star from getting the benefit today** — missing telemetry, configuration, disputed evidence, notification, staff workflow? The answer decides what the product actually is.
7. What exactly do `ACTUAL_PICKUP` / `ACTUAL_DELIVERY` and `LS_DET_*_ARRIVE` record — physical arrival and departure, or a status entry? Validate three or four concrete records.
8. May real customer names appear in the presentation and video? They are in the data; the portal says non-public.
