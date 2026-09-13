# Portal submission — submitted and verified

Form destination: https://roadstarhackathon.com/portal/submissions

**Submission status:** submitted and verified. The portal displays **DockRisk — Submitted**, with the submission time **Sep 13, 2026, 12:43 PM** (America/Toronto). The record remained after a page refresh. The portal created **Junsu Park's Team**, with one member. The GitHub, Live Demo, Video, and Pitch Deck links were checked directly in the submitted record and match the final URLs below. Evidence is saved in `.demo-logs/portal-submitted.txt`, `.demo-logs/portal-submitted.png`, `.demo-logs/portal-submitted-reloaded.txt`, and `.demo-logs/portal-submitted-reloaded.png`.

The five English prose fields below match the text saved by the portal's Update Submission action and verified by reading them back from the UI. Humanizer editing is complete; the Submitted status and original Sep 13, 2026, 12:43 PM submission time remain unchanged. Link-status notes are preparation notes, not text to paste into the form.

## Project name

DockRisk

## Elevator pitch

DockRisk shows dispatchers when a dock wait puts the next load at risk. They can compare relief drivers, offer a reassignment, and prepare detention charge drafts with the evidence attached.

## Description

A truck can still be within its free waiting allowance at a dock when the driver's next load no longer fits the hours available. We built DockRisk to make that conflict visible. The dispatch board shows the detention clock beside the next-load plan, with a map and a list ordered by urgency. A dispatcher can check each truck's duty timeline, waiting time, and warning reasons, then compare relief drivers and send an offer. The driver accepts or declines in the companion app.

The app records geofence and visit events, applies the configured detention terms, and prepares charge drafts. Each draft includes the calculation, the sources of its timestamps, and any reasons it needs review. Forward hours checks use the demo's seeded duty events, estimated road delays, and waiting time. Relief candidates are checked for availability, pickup timing, trailer compatibility, capacity, and hours. Their results include reasons and historical dock-time scenarios with sample sizes.

AI helps extract proposed terms from contracts and draft editable customer notices. The dispatcher confirms the terms. The rules engine calculates durations, amounts, and whether a plan fits the available hours; notice drafting has a template fallback. A separate simulator shares one scenario clock with the engine and web app.

We analysed 56 days of the organizer's TruckMate export. Counting physical time at a stop beyond a two-hour free allowance gives an estimated $32,322 to $43,095 per month at assumed rates of $75 to $100 per hour. In a separate replay, we adjusted qualifying time for appointments, used $75 per hour, and rounded down to 15-minute increments. That produced $57,638 in potential draft charges over 56 days, or about $30,877 per 30 days. The export has no invoices or contract rates, so these estimates cannot tell us how much was unpaid or could be collected.

We also trained a detention warning model on earlier completed stops and tested it on a later period. It warned before billing began on 115 of 126 overruns: 91% recall and 79% precision. Of its 145 warnings, 30 were false alarms; it missed 11 overruns. Compared with warning on every eligible stop, that is 17 fewer false alarms and 11 more misses. This test measures detention warnings. HOS conflicts and live predictions for the next load still need their own validation.

GPS and duty events in the demo are simulated, and the driver companion is not a certified ELD. The prototype creates charge records and notice drafts; it does not send customer emails or connect to an invoicing system. A carrier pilot would need verified duty logs, contracts, and dispatch outcomes to test it in operation.

## Technologies used

The backend uses Python 3.12, FastAPI, SQLite, Shapely, pandas/openpyxl, and httpx. The web app uses Next.js 16, React 19, Tailwind 4, Leaflet, and IBM Plex. External services provide OSRM road geometry, Ontario 511 events, Nominatim geocoding, and an OpenAI-compatible endpoint for language tasks. The web app runs on Vercel; the API runs in Docker on a VPS behind Cloudflare Tunnel.

## GitHub URL

https://github.com/Ketchio-dev/dockrisk

## Demo URL

https://dockrisk.vercel.app

The public demo uses a separate synthetic sample with fictional customers. Its names, counts, and amounts differ from the organizer-data analysis above. Other visitors can change the shared simulation state.

## Demo video URL

https://youtu.be/MQjygr_Ms6Q

**Link status — verified final upload:** the revised 3:02 captioned film is Unlisted. Upload checks and playback have been verified. It combines prepared prototype captures with the corrected narration and subtitles.

The current presentation uses the separate approximately 90-second `docs/demo/backup.mp4` recording as the primary demonstration on **slide 9 only**, with live presenter narration. That recording is a different asset from the revised 3:02 submission film linked above.

## Pitch deck URL

https://drive.google.com/file/d/1jNckVV1RI5o1IwJMCqs_j0brUNdBnzkD/view

**Link status — verified final PDF:** use this PDF URL in the portal's Pitch Deck URL field. The Drive preview has 16 pages, including the large recorded-demo poster on page 9. Sharing is anyone with the link, Viewer. The PDF does not play the recorded demo.

Final PPTX download:

https://drive.google.com/file/d/1CfwSAcBgjlEAAQQRUWHLHvM6_X1-k5Rm/view

**Link status — verified final PPTX:** the uploaded file has been replaced with the final deck version and is shared as anyone with the link, Viewer.

The current local deck files are `docs/demo/deck/dockrisk-deck-revised.pptx` and `docs/demo/deck/dockrisk-deck-revised.pdf`. The presentation proceeds through slides 1–8, the approximately 90-second recorded demo on slide 9, and slides 10–16. The app is optional for Q&A.

## Key learnings

At 11:23, the next-load plan was already infeasible, with 37 minutes of free time left before billing began at noon. That is time remaining until billing, not a measured gap between two deadlines. It shows the conflict in one scenario; it does not tell us how often it happens across the fleet.

We initially read the leg-level HOS values incorrectly. They are frozen copies of each driver's values, and we documented the correction. Evaluating operations properly would require duty-event history, which the export does not contain.

The long stops deserve a closer look. Thirty-eight stops lasted more than six hours and accounted for roughly half the hours beyond free time. We need to understand what happened at those stops and which contract terms apply before treating them as collectible claims. More broadly, assumed rates and clock rules let us explain an estimate, but invoices and contracts are needed to establish what can be collected.

Some checks also need data we do not have. The Trucks sheet has one column of truck numbers, so it cannot support an axle-weight check. Facility locations estimated from city centroids need review, as do uncertain timestamps. Candidate rankings and historical dock-time scenarios still need validation in a carrier pilot.

## Challenges faced

The export had missing planned dates, placeholder dates, and no rate or billing records. We had to keep assumptions separate from observed results and count one dwell per bill and stop so that orders with multiple legs did not duplicate waiting time.

We also had to keep track of where each geofence or driver event came from, including missing or uncertain evidence. The simulator and engine needed a shared clock that stayed consistent through pause, resume, and reset, while external road inputs could change between runs.

For the language features, we kept numerical calculations in code and made notices editable. A template fallback keeps a draft available for review when the model is unavailable.
