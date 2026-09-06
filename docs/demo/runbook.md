# Demo runbook — 10 minutes, one exception, end to end

Rehearse this twice on Sat Sep 12 and once on Sun morning. Every number below is what the deterministic
scenario (`dock_squeeze`, seed 7) produces; if a number differs on stage, say so and keep going.

## Before the room

- `scripts/demo.sh 60` on the presentation laptop; open **two browser tabs**: `/` (dispatcher) and
  `/driver/Driver8` (the relief driver). A third tab `/driver/Driver84` (the hero) if a second screen exists.
- Satellite cache warmed: `python3 scripts/prefetch_tiles.py` the night before.
- Backup: the recorded 90-second video, and `scripts/demo.sh stop && scripts/demo.sh 60` resets everything.
- Speed: run at **×120** while talking (1 sim-minute per 0.5 s); pause with the header button whenever a
  judge asks a question. Reset from the header if anything looks wrong — it replays identically.

## 0:00–1:00 — the finding (`/data`)

"We opened the carrier's own 62-day TruckMate export. One dwell per bill and stop, Southern Ontario only:
**804 hours past the free two hours → $32k–$43k a month of gross potential detention exposure** at
$75–$100/h. Median dwell is under an hour; the p90 sits right at the two-hour line. The money is in a thin
tail — exactly what manual logging misses." Move the free-time slider to 90 min; the number moves. Say
*exposure*, never *unbilled*: the export has no billing records.

## 1:00–2:00 — one truck (`/`, click the hero card)

Reset at 07:30 if needed. By ~09:25 sim, B3339 / Driver84 enters the London DC polygon for a 10:00
appointment. Click the row: the map flies to the property and dock outlines. Point at the **day bar**: the
driver's shift on one time axis — driving in black, on-duty in grey, the hatched free-time band from the 10:00
appointment, the red **legal stop** tick, and the **pickup window** bracket for the next load. Three clocks:
physical dwell, *billable in* (clock from 10:00, not from arrival), HOS departure margin.
"At arrival, the next load was feasible: **+1h 10m** margin."

## 2:00–3:30 — the driver confirms (`/driver/Driver84`)

Tap **on time**, then **Checked in — at arrival (09:25)**. Back on the dispatcher: the review reasons on the
card shrink (no more "on-time unconfirmed / no check-in"). "The billing clock starts at the later of check-in
and appointment. The driver attests; the tap time is kept separately in the ledger."

## 3:30–5:00 — the collision of clocks

Let the sim run to ~11:20. Watch the card: **"✗ the wait so far has already made it infeasible · at arrival
+1h 10m · if released now −1h 30m"**. Inbox turns critical: *next load at risk*, *HOS departure margin*.
"Detention starts billing at 12:00. The operational deadline came first — the customer's free two hours were
never free to the carrier."

## 5:00–6:30 — rescue

Click **▶ find a relief driver (rescue)**. Candidates ranked with reasons: **Driver8 / B9001 — eligible,
89 km deadhead, ETA 13:17 before the 13:30 window, 4.1 h HOS buffer**; others blocked with the reason
("cannot reach pickup by 13:30", "busy until…"). Click **Offer load**. Switch to the Driver8 tab: the offer
appears → **Accept**. Back on dispatch: *Rescue coverage* shows **accepted ✓**, the next-load exception
resolves ("load reassigned"), the day bar gains a **relief accepted** mark, and on the map B9001 starts driving
toward London.

## 6:30–8:00 — the claim

Let the sim reach ~12:15. On the hero tab tap **Loading / unloading done** then **Released — leaving**. The
truck exits the property; a **draft detention charge** appears: qualifying 135 min → 15 billable min at the
15-min floor → **$18.75**, party consignee, review reasons listed. Click **packet ↗**: the printable claim —
policy applied, timestamps, the event ledger with sources, GPS sample, duty timeline, stated limits.
"This is what turns a calculation into money the customer will pay."

## 8:00–9:00 — where the AI is, and isn't (`/policies`)

Paste the sample rate confirmation, **Extract terms**: badge `extracted-llm · gpt-6-astra`, each term with
its clause underneath ("two (2) hours free"), *not stated → default* where the text is silent. Confirm.
"AI where language is messy; rules where law and money are precise. The model never computes a charge."
Toggle **511 live** on the map: real Ontario 511 events on the 400-series, right now.

## 9:00–10:00 — what we did not build, on purpose

Certified ELD — no. Axle-weight compliance — not buildable from a one-column Trucks sheet. "Unbilled" —
not knowable from this export. City-centroid facilities are simulation geometry and any charge against one
goes to review. Everything else is on the screen behind you. Questions.

## Recovery

| Symptom | Do |
|---|---|
| Header badge says **offline** | API died: `scripts/demo.sh 60` (keeps the web tab), then **reset** |
| Map tiles grey | Satellite toggle → cached tiles; OSM needs the network |
| Clock stopped | Header **▶ resume** (the sim idles when paused or finished) |
| Wrong numbers | **reset**; the seed replays identically |
| Anything else | Play the 90-second recording and talk over it |
