# Design system — what we copied, and from whom

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
