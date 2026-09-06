# Second opinion: Codex CLI gpt-6-astra, UI + demo review (2026-09-06 night)

Source-only review of apps/web. Adopted the same night: assignment status visible on dispatch, sim controls (pause/speed/reset) on the dashboard, map fly-to on selection + return-to-region, legend wording, RescuePanel effect/loading/error, formatter rounding, raw-JSON modal removed, larger text. Queued for Mon-Tue: story progression strip, charge approval gated on blockers, policy clause beside each term, exposure wording split (modeled vs this run), snapshot freshness indicator, timezone label, 10-minute runbook rehearsal.

---

The three-clock story is strong, but the UI currently hides the payoff: driver acceptance never appears on dispatch, and simulation controls are absent from the reviewed pages. Those are the highest-value fixes before Sep 13.

Source review only; I did not run the app or change files. Paths below are relative to `src/`.

**Fleet GM: top five, ordered**

1. `components/Panels.tsx:RescuePanel` + `app/page.tsx:Dispatcher` — Show persistent **Offered → Accepted/Declined** status, assigned driver, and pickup ETA from `snap.assignments`. Currently “offered → driver app” is only local state. A GM needs proof the load has coverage.
2. `components/Panels.tsx:VisitCard` — Promote the next-load comparison into a large “At arrival / Released now / After predicted wait” strip with signed margins and plain-language reasons. This is the evidence that detention caused the operational loss.
3. `components/Panels.tsx:ExceptionInbox` — Prioritize unresolved actionable exceptions by urgency, pin the hero, and provide one explicit primary action. Current rendering follows API order and identifies rescue actions by matching prose.
4. `components/Panels.tsx:ChargesList` — Include bill/unit identity, show all review blockers, and require their acknowledgement before approval. A facility name, unexplained confidence number, and one-click approval provide weak financial control.
5. `app/page.tsx:Dispatcher` + `app/data/page.tsx:DataPage` — Separate modeled monthly exposure from this run’s draft charge and accepted rescue. Use consistent “gross potential exposure” wording; enforce low rate ≤ high rate. Potential exposure is not recovered revenue.

**UI/UX and Presentation judge: top five, ordered**

1. `app/page.tsx:Dispatcher` — Add a visible story progression: **Arrival → Waiting → Load at risk → Rescue accepted → Draft claim**. Keep the hero’s three clocks visible throughout.
2. `app/globals.css` + `Panels.tsx:Clock/VisitCard` — Increase critical text from 10–11px, strengthen contrast, and make the dispatcher layout responsive. Give secondary pages an explicit dark background: currently light system theme can put pale text on white.
3. `components/FleetMap.tsx:FleetMap` — Selecting an exception should pan/zoom to the truck and London property/dock boundaries. Regional zoom 8 hides the precision being judged; provide a return-to-region control.
4. `components/Panels.tsx:ChargesList` + `app/evidence/[visitId]/page.tsx:Evidence` — Make the printable packet the primary evidence destination. Lead with calculation, policy provenance, and missing documents; keep the ledger below.
5. `app/policies/page.tsx:Policies` — Present source clause beside each extracted term; distinguish unknown from false/default, allow correction of required evidence, and show successful activation. This makes human confirmation demonstrable.

**Demo-risk engineer: top five, ordered**

1. `app/page.tsx:Dispatcher` — Add Reset, Pause, speed, and deterministic milestone controls backed by verified simulator operations. Reset must clear assignments, charges, driver events, and local selections while restoring known initial conditions.
2. `app/page.tsx:useSnapshot` + `lib/api.ts:api` — Fetch an initial snapshot, expose connection/freshness/error states, and provide bounded timeouts and retry. Silent failures currently resemble an empty or frozen operation.
3. `components/Panels.tsx:RescuePanel` — Move fetching out of render into an effect; add loading/error/empty states, pending-button locking, and duplicate-offer protection. Revalidate eligibility when submitting.
4. `components/FleetMap.tsx` + `components/TracePanel.tsx` — Clear old selection data immediately, show feed timestamps, and label stale/cached 511 results. Rehearse tile/API failure with an explicitly labeled fallback.
5. `lib/api.ts:fmtH/fmtMin/hhmm` — Normalize rounded minutes and display an explicit Ontario timezone consistently. Current formatters can produce “0h 60m”; timestamp slicing does no timezone conversion.

**What dispatchers could misread or distrust**

The map legend says “moving,” although green does not check speed; “HOS margin <1.5h” actually checks remaining on-duty hours. Missing snapshots read as “Nothing open.” Predicted infeasibility can look like a current violation. GPS evidence can look sufficient despite contractual signed-document requirements.

**Missing ten-minute runbook**

- **0–2:** Reset, select hero, show 10:00 appointment and feasible arrival margin. Say: “This load was workable.”
- **2–4:** Advance through waiting checkpoints; explain each clock and feasibility change.
- **4–6:** Open rescue, offer standby, accept in a preopened driver tab; show dispatch acknowledgement.
- **6–8:** Advance through actual gate exit; open draft packet and explain billing.
- **8–9:** Show one policy clause and one 511 event with source/time.
- **9–10:** State measured outcome; retain recovery buffer.

Rehearse exact drivers, checkpoints, expected amounts, reset behavior, and a labeled recorded fallback.

**Cut:** The raw-JSON evidence modal; it duplicates the packet and interrupts the business story.
