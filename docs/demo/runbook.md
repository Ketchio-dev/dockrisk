# Demo runbook — 10 minutes, one exception, end to end

Rehearse this twice on Sat Sep 12 and once on Sun morning. Every number below is what the deterministic
scenario (`dock_squeeze`, seed 7) produces; if a number differs on stage, say so and keep going.

## The AI moments, named

Two places, both labeled on screen, both with a deterministic fallback so the demo cannot die on a proxy:
`/policies` reads a rate confirmation into terms with the quoted clause under each field; the evidence packet's
**Draft the notice** button writes the customer letter from the packet. Say the sentence once: *"The model reads
and writes language. The engine computes every number, and the dispatcher confirms before anything leaves."*

## Before the room

- `scripts/demo.sh 60` on the presentation laptop; open **two browser tabs**: `/` (dispatcher) and
  `/driver/Driver8` (the relief driver). A third tab `/driver/Driver84` (the hero) if a second screen exists.
- Satellite cache warmed: `python3 scripts/prefetch_tiles.py` the night before.
- Backup: `docs/demo/backup.mp4` (90 s, nine captioned beats; regenerate with `scripts/record_backup.sh` against
  a running stack), and `scripts/demo.sh stop && scripts/demo.sh 60` resets everything.
- Speed: run at **×120** while talking (1 sim-minute per 0.5 s); pause with the header button whenever a
  judge asks a question. Reset from the header if anything looks wrong — it replays identically.

## 0:00–1:00 — the finding (`/data`)

"We opened the carrier's own 56-day TruckMate export and replayed every Southern Ontario stop through the
rules. **257 detention charges, 768 billable hours, $57.6k at $75/h — about $31k a month** — and July was
nearly three times August, so this is bursty, not steady." Scroll to *If DockRisk had been running*: "The
30-minute warning, trained on the first four weeks and scored on the last four: **115 of the 126 stops that
went over free time were flagged half an hour before billing started** — recall 91 %, precision 79 %."
Point at the histogram: median wait is under an hour; the money is in the thin tail past the two-hour line.
Say *exposure* / *gross potential charges*, never *unbilled*: the export has no billing records. Say what
was not replayed: hours-of-service (no duty logs in the export), check-in and release times, contract
eligibility.

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

## 3:30–5:00 — the collision of clocks, and the road

Let the sim run to ~11:20. Watch the row: **"The wait so far has already made it infeasible · margin at
arrival +1h 10m · if released now −1h 30m"**. Status word turns red: *Next load at risk*. Below it, an amber
line: **"Road: +N min through HWY 401 Eastbound"** — the corridor event that fired at 07:55 (a live 511 item
when one is on the 401/403, otherwise the simulated Cambridge collision, labelled). "Two things ate this
driver's day: a dock and a highway. The engine adds both to the same forward check. When the road alone is
the difference, the verdict says so: *the road delay on top of the predicted wait makes it infeasible* — and
the clear-road margin is right there." That sentence is the brief's bonus paragraph, answered.

## 5:00–6:30 — rescue

Click **Find a relief driver**. Candidates ranked with reasons: **Driver8 / B9001 — eligible, ~110 km
deadhead, ETA before the 13:30 window, HOS buffer**, and on the same line **(+3 min road)** — each candidate
pays for the closures on *its own* deadhead, so a farther truck behind the 410 shows +26 min and a blocker.
Others blocked with the reason ("cannot reach pickup by 13:30", "busy until…").

**Say the dock line out loud — it is the strongest thing on this screen.** Under each candidate:
`docks at 45 min each → 1h 59m · as usual here (70/20 min) → 1h 59m · busy (156/64 min) → −0h 11m · n=86`.
The plan budgets a flat 45 minutes a dock. This lane's own history says a pickup there runs 70 minutes
typically and 156 at the ninetieth percentile — and costed that way that candidate is eleven minutes
**past** a legal stop, not two hours clear of one. Four of seven flip. If asked: the eligibility verdict
stays on the fixed allowance (a rule, reproducible, what a dispatcher is accountable to); the history is
advice, carries its sample size, and two p90 docks in a row is a stress test, not "90% safe".

Click **Offer load**. Switch
to the Driver8 tab: the offer appears → **Accept**. Back on dispatch: *Relief accepted* on the row, the
next-load exception resolves ("load reassigned"), the day bar gains a **relief accepted** mark, and on the
map B9001 starts driving toward London.

## 6:30–8:00 — the claim

Let the sim reach ~12:15. On the hero tab tap **Loading done** then **Released, leaving**. The
truck exits the property; a **draft detention charge** appears: qualifying 135 min → 15 billable min at the
15-min floor → **$18.75**, party consignee, review reasons listed. Click **Packet**: the printable claim —
policy applied, timestamps, the event ledger with sources, GPS sample, duty timeline, stated limits.
"This is what turns a calculation into money the customer will pay."

## 8:00–9:00 — where the AI is, and isn't (`/policies`)

Paste the sample rate confirmation, **Extract terms**: the label reads *Read by the model · gpt-6-astra*, each
term with its clause underneath ("two (2) hours free"), *not stated — default* in amber where the text is silent. Confirm.
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
| Map tiles grey | It fixes itself: six misses and the map switches to the cached satellite layer and says so. If it has not yet, press **Satellite**. |
| **The venue wifi is dead** | Nothing to do. Drilled with every external request blocked: board, day bar, verdict, hours, 511 items, charges, evidence, `/data` and the driver view all render — they are local. Only street tiles need the internet, and the satellite fallback covers them (3,105 tiles cached, all 37 facilities at close zoom). Re-drill any time with `cd apps/web && node scripts/offline-drill.mjs`. |
| Clock stopped | Header **Resume** (the sim idles when paused or finished) |
| Wrong numbers | **reset**; the seed replays identically |
| Anything else | Play the 90-second recording and talk over it |
