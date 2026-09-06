# Remote Day 1 Playbook

**Decision (2026-09-04):** participate remotely on Sat Sep 5. Attend in person on Sun Sep 13 (mandatory, presentation).

Confirmed by organizer Corey Barron in Discord on Sep 3: Saturday is not mandatory, Sep 13 is. He also said **"you will get instructions on what to build at the event."** That single line is why this playbook exists: going remote means the build brief arrives second-hand, and two assets that were free in person now have to be worked for.

## What going remote costs, and the mitigation for each

| Lost | Mitigation | Deadline |
|---|---|---|
| Joe Smelko's answer to Q1 (which exceptions dispatchers handle by hand) | Send the question list to organizers tonight, before the room fills up with people asking in person | Tonight |
| The build brief, heard live with Q&A | Ask explicitly how remote participants receive it; watch Discord 6-7 PM Sat | Tonight, then Sat 18:00 |
| Team formation (66 Luma registrants, in-person session 7:30 PM) | Not pursued. User decided on Sep 4 to go solo. See "Solo scope" below. | - |
| Prizes, giveaways, sponsor contacts | Accept the loss | - |

## Portal state that drives the plan (verified via Aside, Sep 4 evening)

- **You cannot invite anyone until you create a team.** Every row in Available Members shows "Create a team first" as the only action.
- You are still **not visible to teams** (toggle off on /portal/teams).
- 19 available members, listed with email addresses. 7 teams, of which 4 are real.

### Real teams

| Team | Members | Slots | Note |
|---|---|---|---|
| **Polavis** | Chaeyoon Kim, Hyunsoo Hwang, jung yu | **3/3 full** | Hyundai Glovis interns. Their description is already written around logistics domain expertise. Strongest visible competitor on Industry Impact (25%) and Best Industry Fit. |
| Turnaround ("Eagle Squad") | Iddy Chesire | 1/3 | Open |
| Matthew Barron's Team | Matthew Barron | 1/3 | Open. Surname suggests a possible relation to host Corey Barron. |
| new team sawaab | Sawaab anas | 1/3 | Open |

Test teams to ignore: Corey's Test Team, New Team Recreated from original user, Test Team 2.

### The 19 available members

Kaushal Khadka, Eric Chen, Stephen Rioux, Yiyang Gu, J Wong, Ruturaaj Solanki, kelsey mellor, Nicholas Kim, Daniel Frank, Slava Kostrubin, Kaung Zin Hein, Abdul Farooqi, Sujal Thapa, Daniel Tabakman, Armita Jalooli, Qazi Fabia Hoq, Summit Kabir, Saison Thiruvananthaselvan, Ramon Paulo Aunor.

Emails are in the portal table. Slava Kostrubin (slava@larphacks.ca) also appears as a registrant on both Luma events, so he is engaged with the event.

Recruiting target: **2 people**, teams cap at 3. Prefer, in order:
1. Someone who will be physically present on Sep 13 (the presentation is mandatory and in person).
2. Front-end / React, since the plan's weak spot is UI polish and Presentation is 15%.
3. Anyone with trucking, logistics, or ops background.

## Two Discord invites are in circulation

- From /portal/messages: `https://discord.gg/xY5yErmY6P`
- From /portal/teams: `https://discord.gg/MKDX2DWyV`

Join both; confirm which one carries the announcements channel.

## Tonight (Fri Sep 4)

Team recruiting is off the list. What remains:

1. **Send the organizer message** (draft below). This is now the single most important outbound action of the night, because solo + remote means losing Day 1 to a missing brief is unrecoverable.
2. **Register on Luma for the Sep 13 finale** — mandatory event, only 7 registered.
3. Re-log into Discord and read the announcements channel.

No team needs to be created. `/portal/submissions` states: *"No team assigned. A team will be auto-created when you submit."* Solo submission is supported by the platform.

## Saturday Sep 5, remote timeline (EDT)

| Time | Action |
|---|---|
| Morning | Reply to any team responses. Lock the roster if possible. |
| 16:00 | Event doors open. Watch Discord for chatter. |
| **18:00-19:00** | **Speaking block. The brief drops here.** Sit in Discord live; ask remote-participant questions in the channel as they come up. |
| 19:00-21:00 | In-person team formation runs. Post in Discord that a remote team has open slots. |
| ~21:30 | Brief is in hand. Re-aim the plan (see below), scaffold the repo, run the first importer. |

## Scope: build capacity is not the constraint

Decided Sep 4: solo, but the full scope in `dispatch-rescue-plan.md` stands. Code volume is not the limiting factor, so nothing gets cut for headcount reasons.

**Everything in the original plan stays P0-P1**, and three things previously treated as optional move back in because they map directly onto prizes:

| Addition | Why |
|---|---|
| Natural-language incident parsing ("truck 17 is down 3 hours outside London") | **Best Use of AI**. Also a better demo beat than clicking a button. |
| Multiple incident types — breakdown, detention, HOS shortfall, missed appointment | Shows the engine generalizes instead of demoing one hardcoded path. |
| A real mobile view of the dispatcher timeline and approval flow | **Best Mobile App** is a separate award. A responsive second surface is a cheap second shot at a prize, and the organizers are running a mobile-app workshop during the week. |
| A visible data-quality / validation panel over the organizers' real data | **Use of Provided Data & APIs, 15%**. Judges can see the real files being read. |
| Motive test-mode API adapter, if the key comes through | Same 15% category. Optional, behind a feature flag. |

**What actually binds, now that capacity does not:**

1. **The brief is unknown until Saturday 7 PM.** No amount of capacity fixes that. This is why the organizer message tonight matters.
2. **The organizers' data may never arrive.** Data Sets, API Docs and AI Credits are all empty as of Sep 4. The demo dataset generator has to be good enough to carry the whole demo on its own.
3. **Your hours, not build hours.** Decisions, judging what the demo should show, testing, recording, and rehearsing all need you specifically.
4. **The Sep 13 presentation is 10-15 minutes, live, alone.** Budget real rehearsal time on Sep 12-13. This is 15% of the score and cannot be delegated.
5. **Polavis are three logistics-industry interns.** Depth of domain reasoning is the axis to beat them on — `docs/research/` is the asset, so make it visible in the demo and the deck.

**Architecture unchanged:** Next.js + FastAPI + OR-Tools CP-SAT + DuckDB/SQLite, LLM for parsing and explanation only.

## Re-aiming: what survives any brief

The Dispatch Rescue plan is now a bet, not a decision. Ship the core first; it is brief-agnostic.

**Survives regardless of what they ask for:**
- Canonical schema and importer (orders, trips, drivers, tractors, trailers, stops)
- Canada + US HOS rule engine with explanations
- OSRM distance matrix and cached routes
- Ontario 511 live incident feed
- Data quality / validation report
- Next.js shell with a fleet timeline view

**Committed only after the brief:** the CP-SAT objective, the incident taxonomy, the hero screen.

New top of the pivot ladder, above the three steps in `dispatch-rescue-plan.md` section 11:

> **Step 0. Whatever the Saturday brief specifies.** If the brief names a concrete problem, that problem wins over Dispatch Rescue. Keep the core, change the objective and the hero screen.

## Draft: message to organizers (portal /portal/messages + Discord DM)

> Hi Corey and Joe,
>
> I'm participating remotely and won't be at Prohibition Warehouse on Saturday, so two things:
>
> 1. How will the build instructions from Saturday's session reach remote participants — Discord, the dashboard, or a recording? I want to start at the same time as everyone in the room.
>
> 2. A question for Joe, if he has a minute: in the last month, what were the two exception situations your dispatchers handled manually most often — breakdowns, detention, HOS shortfalls, missed appointments, or empty miles? And which of those costs the most? I'd rather build against a real recurring problem than a guess.
>
> Also, still hoping for an ETA on the data sets and API keys — the Data Sets, API Docs and AI Credits pages are all empty right now.
>
> Thanks, and good luck with the turnout tomorrow.
> Junsu Park

## Open items

- Confirm which Discord invite is live.
- Confirm whether remote participants present over Zoom on Sep 13 or must attend Spur Innovation Center in person (Luma says 12:00-18:00; the site schedule says presentations 1 PM, awards 5 PM).
