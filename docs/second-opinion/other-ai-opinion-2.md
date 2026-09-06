# Second opinion 2 (pasted by the user, 2026-09-06; source model not named, had web access)

Verbatim summary of the parts that change the build. Full text is in the session; the rest agreed with codex-gpt-6-astra.

## Verdict
Do not build a new all-in-one TMS. Build a **detention-and-HOS exception layer** on top of one. Loop:
qualified facility arrival → predicted detention/HOS collision → driver confirmation → dispatcher intervention → next-load reassignment → defensible detention charge.

Core insight for the pitch: **the customer's first two "free" hours are not free to the carrier — they consume the driver's legal working window before billing begins.**

## Contradictions to resolve (verified same day)
- Site schedule: **code freeze Sun Sep 13 2:00 PM** (Day 9), not Sat 5 PM. Devpost says Sun 12:00. Plan against the earliest.
- Judging weights sum to 95%. Judging page: 5 criteria, 1-5 scale; **"failed demo" is explicitly the 1/5 anchor for Presentation.**
- Resources page promises rates and truck specs that are not in the workbook.

## Product framing
- Name it an exception desk, not an AI fleet platform. Primary screen = **exception inbox**:
  `Driver 047 — Milton DC — dwell 1h 38m — billable in 22m — HOS departure margin 14m — next load at risk`
- **Three-clock model** per active visit: physical dwell / contractual billing / regulatory capacity. Not interchangeable.
- **Facility visit state machine**: EN_ROUTE → FACILITY_APPROACH → PROPERTY_ENTERED → CHECKED_IN → WAITING/AT_DOCK → SERVICE_COMPLETE → RELEASED → GATE_EXITED → REVIEW_REQUIRED | CHARGE_READY. Every transition: event ts, received ts, source (gps/driver/tms/sim/doc), confidence, actor, correction history.
- Geometry: outer property polygon, gate corridor, staging, dock polygon. Debounce, jitter tolerance, duplicate suppression, out-of-order handling, episode merging. Not a 200 m circle.
- `billing_start = max(confirmed_checkin, appointment_start)` as the **default policy**, configurable per customer: free_time, rate, increment, minimum, cap, billing_start_rule, requires_on_time_arrival, required_evidence.
- Separate fields: physical_dwell, qualifying_dwell, billable_detention, estimated_charge, collection_status. **Review band around the 2 h threshold** — do not treat 2:01 as unquestionably billable.
- Aggregation grain = **facility visit** (order, facility, stop type, unit, episode), not order. Inspect 20-30 cases by hand.
- **Conditional dwell prediction** from the 62 days: at 90 min waiting, P(D>120 | D>90), median and p90 remaining, by facility × stop type × time bucket, pooled fallback, **always show n**.
- **Next-load rescue**, not cold matching: the detained driver had a next pickup; who takes it without a new HOS/trailer/appointment failure. Output reasons; if nothing is legal, say so.
- **AI where language is messy; rules where law and money are precise.** Defensible AI feature: extract detention terms from a rate confirmation into a structured policy, dispatcher confirms before activation. Never let an LLM decide legality or compute the charge.
- Driver page asks: early/on-time/late/wrong entrance? checked in? door assigned? complete? released? confirm summary. Call it an **ELD companion / HOS simulator**, never a certified ELD.
- HOS: waiting at a dock is on-duty, never rest. Cycle 2 also has the 70 h-without-24 h-off condition and the 24 h off in the preceding 14 days. **401 closure must not auto-grant the 2 h adverse-conditions extension** — show "possible exception, eligibility not assumed, review required."
- Evidence packet at departure = draft claim: facility, order/stop, appointment window, entry/exit, driver confirmations, breadcrumb, duty timeline, policy + source, reason code, calculation, confidence, corrections, approval. The owner's question is "can I send this to the customer and collect?"

## Time allocation
35% detention/visits/evidence · 20% HOS + reassignment · 15% simulator · 10% map · 5% driver PWA · 15% testing, rehearsal, backup demo.

## Failure mode
Industry-credibility collapse from one overclaim ("loses $40k/month in unbilled detention"). Use: "gross potential exposure under stated assumptions; the product converts candidates into verified, policy-aware claims." Show assumptions in the UI, sensitivity controls, source badges. Demo: seeded deterministic scenario, one-click reset, precomputed routes, stable IDs, one dispatcher tab + one driver tab, 90-second prerecorded backup.

## Questions for the organizers, verbatim
1. What exactly do LS_DET_PICK_ARRIVE, LS_DET_DELV_ARRIVE, actual pickup, actual delivery represent operationally?
2. At Road Star, what makes detention collectible: free time, rate, increment, appointment status, cap, evidence?
3. Where would an already-billed detention charge appear in TruckMate; can we get that table or a redacted sample?
4. Is the HOS violation timestamp a predicted leg event, the driver's last violation, or a snapshot attribute? *(answered by our own test: frozen per-driver snapshot)*
5. Are the advertised rate and truck-spec datasets available separately?
6. May we display real customer names; may the workbook be committed or published?
7. Exact code-freeze time, and how a remote participant presents and answers questions?

## Suggested demo (10 min)
0-1 real-data discovery with assumptions · 1-2 one detained truck: route, dwell, billing clock, HOS margin, next pickup · 2-3:30 reset sim, truck enters hand-drawn polygon, satellite shows gate, driver confirms on-time check-in · 3:30-5 conditional dwell prediction crosses 2 h; HOS margin < route-to-safe-stop · 5-6:30 reassignment with per-candidate legality; new driver accepts on PWA · 6:30-8 release, exit, billing under confirmed policy · 8-9 evidence packet, approve/export · 9-10 architecture and stated limits (axle, certified ELD, "unbilled").

Working title suggested: **DockRisk — Detention Recovery and HOS Rescue for Regional Dispatch.**
