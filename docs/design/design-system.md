# Design system — what we copied, and from whom, and what is ours

Restyled 2026-09-06 after the first pass looked like every LLM-generated dashboard (dark slate, cyan
accents, stacked cards, tracked-uppercase headers, glyph buttons, 10-px text). References were pulled
from real product screens, not templates.

## References and what each contributed

| Product | Screen | What we took |
|---|---|---|
| **Motive** (KeepTruckin) | Dispatch — In Progress table | The information architecture of a dispatch desk: white canvas, one row per truck/job, a small gray label above each value ("AT LAST STOP" / "Stale for 8d 19h"), hairline row rules, a single blue accent for actions, status as text with a sub-line rather than a coloured pill. |
| **Stripe** (Express dashboard) | Home | Typographic restraint: big semibold tabular numbers, sentence-case headings, gray secondary text, one brand colour used only for buttons and links, tables separated by rules and whitespace, no card borders. |
| **Uber Freight** (carrier app) | Loads for you | The driver card: a large price/number first, a vertical stop timeline with dots, a single metadata line in gray, full-width actions. |
| Onfleet, project44 | Command center, Movement | Confirmed the pattern: light canvas, list ↔ map synchronised, exception queue ranked by cost; nothing else copied. |

Screens are in the session scratchpad (`design-refs/`); they are vendor marketing/product pages and are not
redistributed here.

## Information architecture (second pass, same night)

Who reads the dispatcher screen: a dispatcher scanning for the few trucks about to become a problem; a judge
at 4 m for ten minutes; nobody reads paragraphs. The product's object is **a truck whose two deadlines are
converging** (billing clock vs hours-of-service), and the action is a reassignment. So:

- **One board, not two lists.** The old layout described the same truck twice (an "Exceptions" row and an
  "At facilities" row). Now every truck with telemetry is one row, **ranked by urgency** (hours to a legal
  stop, then minutes to billable, then moving/stopped). The alert is the row's status word, not a separate
  item. Only the selected (or, if none, the most urgent) row is open; the rest are one line of aligned numbers.
- **Deadlines first.** Column order is *Billable in · Hours to a legal stop · Waiting*; the binding deadline
  is ink, the other is gray. Physical dwell is context and comes last. When the truck is early for its
  appointment the first column says *starts 11:15* instead of a running timer.
- **Road events are a strip**, not alerts: Ontario 511 items near a truck sit in a three-line "Road" block
  under the board; on the map, only severe events show at region zoom, lane closures from zoom 10.
- **Expanded row carries the whole pitch**: the story timeline, three large numbers, the next-load verdict
  with the three margins (at arrival / if released now / after the predicted wait), the empirical dwell
  prediction with its n, the review reasons, and one blue button.
- **Driver app**: the facility block comes first when the driver is at one; a single filled button is the
  next expected action.

## Secondary surfaces (same night, third pass)

- **Evidence packet** reads as an invoice-style document: the amount first (40 px), a three-line
  calculation table (physical dwell, qualifying dwell, free time — each with its rule in words), a
  "Needs review before billing" block with a left bar, a time-only timeline, a ledger with human event
  names and "Reported by" (GPS geofence / Driver app / Engine), then GPS and duty samples. Dates appear
  once, in the header. The engine's evidence keys are humanized ("driver check-in", not `driver_checkin`).
- **Data** is a report, not a rules dump: one headline, assumption chips with sliders behind *Adjust*, a
  two-row shape table, one line on what the file is, findings grouped by consequence.
- **Drivers index** is a list of rows in ink (names are not links in colour; the whole row is the link).
- **Rescue modal** ranks candidates with the numbers in the headline and the reasons underneath; blockers
  in red text; one *Offer load* button per eligible row; nothing wraps.
- **Map**: closure rings are thin, dashed, and capped at 2.5 km; trucks get a permanent label when selected.
- **Board** opens the top row only when it needs attention (a visit, or a warn/bad status); a quiet fleet
  shows compact rows only.

## Tokens (`apps/web/src/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#F7F7F5` | page background (warm off-white) |
| `--surface` | `#FFFFFF` | panels, header |
| `--rule` / `--rule-strong` | `#E6E7EA` / `#D1D5DB` | hairlines, button borders |
| `--ink` / `--ink-2` / `--ink-3` / `--ink-4` | `#111827` / `#4B5563` / `#6B7280` / `#9CA3AF` | text hierarchy |
| `--accent` | `#1D4ED8` | the only action colour: links, primary button |
| `--bad` / `--warn` / `--ok` | `#B91C1C` / `#B45309` / `#15803D` | status words and 2-px left bars — never fills |
| `--series-1` | `#2A78D6` | chart line (validated light-surface palette) |
| font | Inter via `next/font`, `tnum` on | body 14 px, secondary 12 px, labels 11 px, big numbers 22–26 px semibold |

## Rules

1. **Colour is status, not decoration.** Values are ink; only state words and left bars carry red/amber/green. One blue for actions.
2. **Rows, not cards.** Sections are a heading + a hairline; items are rows separated by rules. No rings, no glass, no shadows except on floating map controls and modals.
3. **Labels are small, gray, sentence case.** No tracked uppercase.
4. **Numbers are tabular and large where they matter** (three clocks, driver hours, amounts); everything else 12–14 px.
5. **Buttons are text.** Quiet by default (white, 1-px border); exactly one filled primary per view — the next expected action.
6. **Story as a timeline**, not pills: dots on a line, the current node ringed, times beneath.
7. **Map on a light base**: OSM tiles unproxied; property outlines ink, dock outlines amber; trucks as small filled circles with a white ring (blue moving, gray stopped, amber at a facility, red under 1.5 h on-duty).
8. **Title-case city names** from the data for display; keep bill numbers and units as-is in tabular figures.

## Before / after

Before: dark slate, cyan/amber/green values, stacked bordered cards, uppercase-tracked section headers,
`▶ ↺ ❚❚ ✓` in buttons. After: see `/` and `/driver/Driver84` with the scenario at ~11:00 — white header
with text controls, exceptions as rows with a red bar and one blue button, a thin story timeline and three
quiet numbers per visit, a charges table with fixed columns, and a driver page that reads like a load app.

## Fourth pass — an identity, not a restyle (2026-09-06, night)

The third pass left a competent light UI that still read as generated: Inter, Tailwind greys, one blue,
default OpenStreetMap colours, and a vocabulary of numbers where a dispatcher thinks in a *day*. The
diagnosis was not "wrong tokens" but "no signature". So this pass added one object the product owns and
rebuilt the type around the subject.

**The day bar** (`components/DayBar.tsx`). One truck's shift on a time axis: duty segments as the ground
(driving black, on-duty grey, off pale), the visit's free time as a hatched band from the billing clock start,
detention as an amber band, the legal stop as a red tick, the next pickup window as a bracket, `now` as an ink
line. It is the three clocks as one picture — the operational deadline and the financial one converging on the
same axis. Compact rows draw it 8 px tall with no labels; the open row adds mark labels above, an hour axis,
and band labels below, on separate lines so nothing collides. Labels past 82 % of the axis hang left. The
axis adapts: 15-minute ticks under three hours (evidence packet), hourly under nine, else two-hourly.
The snapshot now carries `shift_start` and the last 24 h of duty `segments` per truck for it.

**The log grid** (`LogGrid`). The driver app draws the four-line, 24-hour duty graph every driver has read
since paper logbooks (off / sleeper / driving / on duty, a stepped line). This is the one detail only this
subject has; it costs nothing and it is how a driver checks the app is telling the truth.

**Type: IBM Plex, three widths.** Plex Sans for reading, Plex Sans Condensed SemiBold for instrument numbers
(the three clocks at 30 px, the driver's hours at 32 px, the data headline at 52 px, the header clock at 22),
Plex Mono for identifiers (bill numbers, units, ledger times, the rate-confirmation textarea). Plex was drawn
for hardware and documentation; it reads as engineered rather than as a startup. Section headings are the
condensed cut at 15 px, sentence case.

**Colour.** Warm neutrals biased toward the ink (canvas `#F3F2EE`, ink `#1A1A17`, greys `#4A4944 / #75746C /
#A5A49B`, rules `#E3E1DA`). The primary button is ink, not blue; links are ink with a hairline underline. Blue
(`#2A78D6`) survives only on the map and in charts, for what moves. Status colours stay red / amber / green as
text and 2-px bars. A new `--money #E9A23B` is the detention band and the past-free-time bars in the histogram.

**Map.** OpenStreetMap tiles desaturated with a CSS filter on the tile pane (CARTO's grey basemap now
watermarks without a key; OSM may not be proxied). Trucks are glyphs: an arrow rotated to the heading when
moving, a square when stopped, a ringed dot at a facility. The selected truck gets an ink label tag.

**Mark and header.** An 18-px mark — a building with one open bay door — before the wordmark in the condensed
cut; the header is an instrument strip: scenario clock large, date and time zone small, text controls, a
live dot, the exposure figure, and a four-word nav with the current page underlined in ink.

**Data page** gained the dwell histogram: 15-minute bins to six hours, bars past the free-time line in amber,
the line labelled with the count past it. The report's thesis ("the money is in a thin tail at the two-hour
line") is now a picture before it is a sentence.

**Evidence packet** opens with the visit on the same bar (free band from the clock start, ticks for every
event, the appointment labelled), then the calculation in words.

Removed: the five-dot story strip (the bar carries arrival, waiting, risk and rescue as marks and bands),
Inter, `rounded-lg`, the blue primary, the violet "extracted-llm" chip.

Tokens table above is superseded by `apps/web/src/app/globals.css`.
