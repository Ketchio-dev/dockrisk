# Portal submission — draft (due Sat Sep 12, 5 PM EDT)

Fields per roadstarhackathon.com/portal/submissions. Paste as-is; every number here is produced by the code in
this repo against the organizer export (`/data`, `GET /backtest`) or the synthetic sample where noted.

## Project name

DockRisk — detention & HOS exception desk for Southern Ontario city dispatch

## Elevator pitch (one sentence)

A dock delay becomes three things at once — a defensible detention charge with its evidence, a forward
hours-of-service check on the driver's next commitment, and a completed reassignment — because the operational
deadline arrives before the financial one, and today nobody is watching the first.

## Description

City dispatch loses money at the dock twice. The visible loss is detention that is never billed because the
in/out times were never captured. The invisible loss is the next load: a driver can have driving hours left
while a dock wait eats the 14-hour on-duty window, so the next pickup becomes infeasible *before* the two-hour
free time even runs out. DockRisk watches both clocks on one time axis.

Replaying the organizers' own 62-day TruckMate export through our rules: **$32k–43k a month of detention
exposure**, in a thin tail right at the two-hour line (median wait under an hour, delivery p90 2.03 h) — which is
exactly what manual logging misses. Scored out of sample (trained on the first four weeks, scored on the last
four), the 30-minute warning flagged **115 of the 126 stops that went past free time** before billing started
(recall 91 %, precision 79 %).

What is built and running:

- **Geofence + detention engine.** Property and dock polygons with debounce and jitter tolerance; a visit state
  machine (approach → entered → checked in → at dock → done → released → exited); a policy engine (free time, rate,
  increment, clock-start rule, on-time requirement) that produces replay-safe draft charges and an invoice-style
  evidence packet with the calculation in words, the event ledger with sources, GPS and duty samples.
- **Canadian HOS (SOR/2005-313)** recomputed from duty events — 13/14/16 h, 10 h off with 8 h core, Cycle 1/2 —
  and used forward: "if the driver waits the predicted N more minutes and then drives to a legal stop, what is the
  margin?" and "is the next load still feasible at arrival / if released now / after the predicted wait?"
- **Road events in the same check.** Open 401 closures (live Ontario 511 events, or the scenario's corridor event)
  become extra hours on every drive leg the engine estimates. The verdict names the road when it is the
  difference, and the clear-road margin is shown beside it.
- **Rescue.** When the next load is at risk, drivers are ranked with explicit eligibility filters and reasons
  (position and ETA to the pickup window, trailer type and capacity, HOS for the whole plan, road minutes on their
  own deadhead). One offer, the driver accepts on the companion app, the original stop keeps its detention evidence.
- **Driver companion** with the ELD-style 24-hour log grid, arrival class, check-in/door/done/released taps.
- **Dispatcher board** ranked by urgency: every truck's day on a time axis with duty segments, the free-time band,
  the detention band, the legal-stop tick and the pickup window.
- **Simulator** as a separate service: one virtual clock, OSRM road geometry, scripted dock dwell and corridor
  slowdown, deterministic replay from a seed.
- **Two AI moments, both labelled, both with a rules fallback:** a rate confirmation is read into detention terms
  with the clause under each field; the customer detention notice is drafted from the evidence packet. The engine
  computes every number; the dispatcher confirms.
- **History replay** of the whole export, anonymized, on the `/data` page.

## Technologies used

Python 3.12, FastAPI, SQLite, Shapely, pandas/openpyxl (TruckMate workbook import), httpx; Next.js 16, React 19,
Tailwind 4, Leaflet (OpenStreetMap + Esri World Imagery), IBM Plex; OSRM (road geometry), Ontario 511 API (live
events), Nominatim (geocoding); an OpenAI-compatible LLM endpoint for the two language tasks; Docker on a VPS
behind Cloudflare Tunnel for the API, Vercel for the web.

## GitHub URL

https://github.com/Ketchio-dev/dockrisk

## Demo URL

https://dockrisk.vercel.app — runs on the synthetic sample (same five-sheet shape, fictional customers) so no
organizer data is public; the numbers on screen differ from the ones above, which come from the carrier's export.

## Demo video URL

(upload `docs/demo/backup.mp4` unlisted; paste link)

## Key learnings

- **The operational deadline comes first.** In the demo scenario the next load becomes infeasible 40 minutes
  before the free time ends. Detention timers are table stakes; connecting the dock clock to the next dispatch
  decision, in time to act, is the product.
- **Check that a field varies where it should before calling it a bug.** Our first "finding" — that the export's
  leg-level `HOS_VIOLATION_AT` was dangerously stale — failed that test: it is a frozen per-driver copy, not a
  decision field. We kept the retraction in the repo. The importer joins HOS from the driver sheet and ignores the
  leg columns; the data-quality panel shows why.
- **The money is in a thin tail.** Median dwell is under an hour; p90 sits at 2.03 h. A desk that watches
  averages plans for the wrong month (July's drafted charges were nearly three times August's: $41.9k vs $15.0k).
- **Say exposure, never unbilled.** The export has no billing records. Precision in wording is what a fleet GM
  in the room grades.
- **Name what you did not build.** Axle-weight compliance is not buildable from a one-column Trucks sheet; trailer
  capacity checks are. City-centroid facilities are simulation geometry and any charge against one goes to review.
  s.76 adverse driving conditions are surfaced as "possible, review required", never applied.

## Challenges faced

- **No planned dates on 68 % of legs** (a 1980 sentinel) and no rates or revenue anywhere: financial impact is
  modelled from dwell and distance and labelled as such.
- **A single dwell per bill and stop**, not per leg — multi-leg orders otherwise inflate the count four-fold.
- **Public map tiles under a venue network:** OpenStreetMap forbids proxying, Esri imagery does not; the satellite
  layer goes through a disk-cached proxy warmed before the demo.
- **Making a simulator that survives an API restart and replays identically** (retry with backoff, one clock row
  the UI can pause, resume and reset).
- **Keeping the model out of the arithmetic:** every LLM output is checked against the engine's figures before it
  is shown, and the rules path runs when the endpoint is absent.
