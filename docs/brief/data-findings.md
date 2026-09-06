# What the data says that nobody told us

Original analysis of `Hackathon_Data.xlsx`, run 2026-09-06. Every number below is reproducible from the organizers' own file. Method notes are included because a judge who works in freight will ask.

The window is **62 days, 2026-06-26 to 2026-08-28**.

---

## Finding 1 — RETRACTED: the "stale HOS clock" is an export artifact, not a production bug

*First version of this finding (2026-09-06 morning) claimed `Dispatch.HOS_VIOLATION_AT` was dangerously stale on 80% of legs. A pressure test the same afternoon showed that reading was wrong. Kept here so the correction is visible.*

What the pressure test showed:

- All 129 drivers with legs carry **one identical `HOS_VIOLATION_AT` value on every one of their legs** — 129 of 129 have exactly one distinct value. Across 9,556 consecutive leg pairs it never moves forward or backward.
- Only 7.5% of leg values match the same driver's row on the `Driver` sheet, so it is not even a live join — it is a denormalized per-driver copy frozen at some earlier point.
- On the `Driver` sheet, `HOS_VIOLATION_AT − DUTY_AT` clusters at exactly **70.0 h** (26 drivers). The field is a *projected* time at which the driver would hit the Cycle 1 70-hour limit, computed from when they went on duty. That is a reasonable, live-looking value on the driver board.

So a dispatcher never reads HOS off the leg table; they read the driver board, where `REMAINING_HOURS_CAN_7/8/14` and this projection are maintained. The 2023 timestamps on 2026 legs are a stale denormalized column in the export, not a decision-making field.

Had this gone on stage as "your TMS has an HOS bug," the fleet GM in the room would have corrected it in one sentence and every number after it would have been discounted.

**What survives, and it is smaller but real:**
1. Leg-level HOS columns in this export cannot be trusted. **The importer must join HOS from the `Driver` sheet and ignore `Dispatch.REMAINING_HOURS` / `HOS_VIOLATION_AT`.** That is a data-quality rule, and it goes in the data-quality panel with the evidence above.
2. `HOS_VIOLATION_AT = DUTY_AT + 70 h` tells us how TruckMate represents the Cycle 1 projection. Our HOS engine should produce the same quantity (plus the 13/14/16 h daily limits it does not show), so the two can be compared on screen.
3. The method — check whether a field varies where it should vary before calling it a bug — is the right test to run on every other "finding" below. Finding 3 passed it (dwell varies per bill); Finding 2 is a sentinel and needs no test.

## Finding 2 — 68% of legs have no expected date at all

`LS_EXPECTED_DATE` is the sentinel `1980-01-01` on **7,163 of 10,479 legs (68.4%)**. `LS_PLANNED_DEPARTURE` is sentinel on another 507 (4.8%).

Planning fields exist in the schema and are simply not filled. Any feature that assumes a planned-versus-actual comparison across the whole set will silently produce garbage. Ours has to fall back to `PLAN_DEPART` / `LS_SCHEDULED_ARRIVAL` and say so.

## Finding 3 — Detention exposure is $30k-$40k per month, and it lands inside the brief's own estimate

Method: dock dwell = `ACTUAL_PICKUP` (or `ACTUAL_DELIVERY`) minus the earliest `LS_DET_PICK_ARRIVE` (or `LS_DET_DELV_ARRIVE`) for that bill. One dwell per order, not per leg — multi-leg orders otherwise inflate the count four-fold. Ontario origins/destinations only, matching the brief's region. Dwells over 48 h discarded as long-haul artifacts rather than dock time.

| | Pickup docks | Delivery docks |
|---|---:|---:|
| Distinct Ontario orders matched | 2,035 | 2,340 |
| Median dwell | 0.56 h | 0.69 h |
| p90 dwell | 1.25 h | **2.03 h** |
| Orders over the free 2 h | 94 (4.6%) | 244 (10.4%) |
| Billable hours past the threshold | 357 h | 478 h |

**Combined: 835 billable hours in 62 days — $30,302 to $40,403 per month at $75-$100/h.**

The brief claims a $15k-$50k/month recovery opportunity. We measured $30k-$40k/month of **detention exposure**, independently, from their own 62 days. That is the strongest single line available for the pitch, and it is defensible only if stated carefully: the export has no billing records, so it cannot show what was or was not invoiced, and "actual pickup/delivery" may be a status entry rather than a physical departure. The stage sentence is: *"Using an arrival-to-completion proxy and a two-hour allowance, these records contain 835 excess hours across 62 days — roughly $30-40k per month of potential detention exposure at illustrative rates. Billing status and contract eligibility are not in this export."*

Note the shape, not just the total: median dwell is well under an hour, and p90 at the delivery dock is 2.03 h — right on the threshold. The money is in a thin tail, which is precisely why manual logging misses it. A dispatcher does not notice the 4% of stops that quietly cross the line.

## Finding 4 — A third of legs run empty, but only an eighth of the distance

Ontario-origin legs: **2,890 empty vs 5,511 loaded — 34.4% of legs.** But empty distance is 88,430 against 656,146 loaded, so **11.9% of distance**.

Both numbers are true and they say different things. Quoting only the 34.4% would be the kind of overclaim a fleet operator spots immediately. The honest read: most empty legs are short repositioning moves, not wasted long hauls.

Top empty lanes:

| From | To | Empty legs |
|---|---|---:|
| Milton, ON | Milton, ON | **568** |
| Oshawa, ON | Whitby, ON | 162 |
| Milton, ON | Mississauga, ON | 117 |
| London, ON | London, ON | 97 |
| Campbellville, ON | Milton, ON | 80 |
| Milton, ON | Brampton, ON | 72 |
| Milton, ON | Brampton, ON | 56 |

568 empty Milton-to-Milton legs is yard and local repositioning around the home terminal. Oshawa to Whitby is 15 km. These are exactly the short city-dispatch moves the brief is about, and they are the realistic target for proximity-based backhaul matching — not the glamorous long-haul pairing.

## Finding 5 — Truck specs do not exist

The `Trucks` sheet has 131 rows and one column, `TRUCK_NUMBER`. The brief asks for "Automated HOS & Axle-Weight Compliance" pre-dispatch audits cross-referencing truck weight limits.

**Axle-weight compliance cannot be built from this data.** Trailer capacity exists (`Trailers.CAPACITY_LBS`), so a load-versus-trailer-capacity check is possible; a tractor axle-weight check is not. Teams that build toward the brief's wording without opening the Trucks sheet will discover this late. We should implement the trailer-capacity check, label the axle-weight gap explicitly in the UI, and say so in the demo — naming a limit you found is worth more than faking a feature.

---

## What these turn into

| Finding | Product surface |
|---|---|
| 1 — leg-level HOS is a stale copy | Importer joins HOS from the `Driver` sheet and ignores the leg columns; the data-quality panel shows why. The demo opens on Finding 3 instead. |
| 2 — missing expected dates | The data-quality panel. Show the 68.4% honestly rather than hiding it. |
| 3 — $30k-$40k/mo detention exposure | The geofence and detention engine, and the financial headline of the pitch — worded as exposure, never as unbilled revenue. |
| 4 — empty legs | Proximity backhaul matching, scoped to short city moves where it is actually real. |
| 5 — no truck specs | A stated limitation in the UI, and a question for the organizers. |
