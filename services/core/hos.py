"""Canadian Hours of Service (SOR/2005-313, south of 60°N) — the parts a dispatcher needs before
assigning a load. Deterministic, no I/O. Everything here is a prototype rules engine, not a
certified ELD.

Implemented:
  s.12  13 h driving per work shift, 14 h on-duty per work shift
  s.13  16 h elapsed since the end of the last >= 8 h consecutive off-duty period (work shift)
  s.14  10 h off-duty per day incl. an 8 h consecutive core (rolling-24 h simplification, reported as a
        warning not a block — the regulation's "day" is a carrier-designated 24 h period)
  s.12  daily (carrier-designated 24 h day, midnight here) 13 h driving / 14 h on-duty
  s.25  at least 24 consecutive hours off-duty within the preceding 14 days
  s.26  Cycle 1: 70 h on-duty in 7 days; reset by 36 h consecutive off
  s.27  Cycle 2: 120 h on-duty in 14 days AND no driving after 70 h on-duty without 24 h consecutive
        off; reset by 72 h consecutive off
  s.76  adverse driving conditions: up to 2 h extension — NEVER applied automatically; exposed as a
        "possible exception, review required" flag

Not implemented (disclosed, not faked): split sleeper-berth (s.18), off-duty deferral (s.16),
ferry/emergency provisions, north-of-60 rules, oil-well service.

Duty statuses: 'off', 'sleeper', 'driving', 'on_duty'. Waiting at a dock is 'on_duty'.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

OFF = {"off", "sleeper"}
ON = {"driving", "on_duty"}

SHIFT_DRIVE_H = 13.0
SHIFT_ONDUTY_H = 14.0
SHIFT_ELAPSED_H = 16.0
CORE_REST_H = 8.0
DAILY_OFF_H = 10.0
CYCLE = {1: {"hours": 70.0, "days": 7, "reset_h": 36.0}, 2: {"hours": 120.0, "days": 14, "reset_h": 72.0}}
CYCLE2_70_H = 70.0
ADVERSE_EXT_H = 2.0


def norm_cycle(v) -> int:
    """TruckMate exports DRIVER_CYCLE as a day window (7 / 8 / 14), not Canadian Cycle 1 / 2.
    7 -> Cycle 1 (70 h / 7 d). 14 -> Cycle 2 (120 h / 14 d). 8 is a US window; treat as Cycle 1 for Ontario.
    Pair with cycle_note() so the mapping is never silent."""
    try:
        v = int(v)
    except (TypeError, ValueError):
        return 1
    return 2 if v in (2, 14) else 1


def cycle_note(v) -> str | None:
    try:
        v = int(v)
    except (TypeError, ValueError):
        return "export cycle unknown; assumed Canadian Cycle 1 — verify with the carrier"
    if v in (1, 2):
        return None
    if v == 7:
        return "export DRIVER_CYCLE=7 read as Canadian Cycle 1 (70 h / 7 d)"
    if v == 14:
        return "export DRIVER_CYCLE=14 read as Canadian Cycle 2 (120 h / 14 d)"
    return f"export DRIVER_CYCLE={v} is a US-style window; treated as Canadian Cycle 1 for Ontario — verify"


@dataclass(frozen=True)
class DutyEvent:
    ts: datetime
    status: str  # off | sleeper | driving | on_duty

    def __post_init__(self):
        if self.status not in OFF | ON:
            raise ValueError(f"bad duty status {self.status!r}")


@dataclass
class Segment:
    start: datetime
    end: datetime
    status: str

    @property
    def hours(self) -> float:
        return max(0.0, (self.end - self.start).total_seconds() / 3600)


@dataclass
class Clocks:
    """State of every clock as of `as_of`. remaining_* are the binding numbers a dispatcher reads."""
    as_of: datetime
    cycle: int
    current_status: str
    shift_start: datetime | None
    shift_driving_h: float
    shift_onduty_h: float
    shift_elapsed_h: float
    off_last_24h: float
    core_rest_last_24h: float
    cycle_onduty_h: float
    cycle_onduty_since_24off_h: float | None  # cycle 2 only
    had_24h_off_in_14d: bool
    remaining_drive_h: float
    remaining_onduty_h: float
    remaining_elapsed_h: float
    remaining_cycle_h: float
    remaining_cycle2_70_h: float | None
    binding: str  # which clock produced remaining_drive_h
    signed_margins: dict = field(default_factory=dict)   # unclamped; negative = over the limit
    day_driving_h: float = 0.0
    day_onduty_h: float = 0.0
    warnings: list[str] = field(default_factory=list)
    unsupported: list[str] = field(default_factory=lambda: [
        "split sleeper-berth (s.18)", "off-duty deferral (s.16)", "north of 60°N", "ferry/emergency provisions",
    ])

    @property
    def can_drive_now(self) -> bool:
        return self.remaining_drive_h > 0 and self.had_24h_off_in_14d

    def as_dict(self) -> dict:
        d = self.__dict__.copy()
        for k in ("as_of", "shift_start"):
            d[k] = d[k].isoformat(sep=" ") if d[k] else None
        d["can_drive_now"] = self.can_drive_now
        return d


def _segments(events: list[DutyEvent], as_of: datetime, horizon_days: int = 14) -> list[Segment]:
    """Turn status-change events into contiguous segments clipped to [as_of - horizon, as_of]."""
    if not events:
        return []
    ev = sorted(events, key=lambda e: e.ts)
    start_clip = as_of - timedelta(days=horizon_days)
    segs: list[Segment] = []
    for i, e in enumerate(ev):
        end = ev[i + 1].ts if i + 1 < len(ev) else as_of
        if end <= start_clip or e.ts > as_of:
            continue
        segs.append(Segment(max(e.ts, start_clip), min(end, as_of), e.status))
    return segs


def recent_segments(events: list[DutyEvent], as_of: datetime, hours: float = 24.0) -> list[dict]:
    """Duty segments of the last `hours`, as plain dicts, for drawing a day bar or an ELD-style log grid."""
    out = []
    for s in _segments(events, as_of, horizon_days=max(1, int(hours // 24) + 1)):
        a = max(s.start, as_of - timedelta(hours=hours))
        if a < s.end:
            out.append({"status": s.status, "start": a.isoformat(sep=" "), "end": s.end.isoformat(sep=" ")})
    return out


def _longest_consecutive_off(segs: list[Segment], min_h: float) -> list[tuple[datetime, datetime]]:
    """All maximal runs of OFF segments lasting >= min_h. Adjacent off/sleeper merge."""
    runs: list[tuple[datetime, datetime]] = []
    cur: tuple[datetime, datetime] | None = None
    for s in segs:
        if s.status in OFF:
            cur = (cur[0], s.end) if cur and cur[1] == s.start else (s.start, s.end)
        else:
            if cur and (cur[1] - cur[0]).total_seconds() / 3600 >= min_h:
                runs.append(cur)
            cur = None
    if cur and (cur[1] - cur[0]).total_seconds() / 3600 >= min_h:
        runs.append(cur)
    return runs


def _hours(segs: list[Segment], statuses: set[str], since: datetime | None = None) -> float:
    tot = 0.0
    for s in segs:
        if s.status not in statuses:
            continue
        a = max(s.start, since) if since else s.start
        if a < s.end:
            tot += (s.end - a).total_seconds() / 3600
    return tot


def compute_clocks(events: list[DutyEvent], as_of: datetime, cycle: int = 1) -> Clocks:
    if cycle not in CYCLE:
        raise ValueError("cycle must be 1 or 2")
    segs = _segments(events, as_of)
    current = segs[-1].status if segs else "off"
    segs = [x for x in segs if x.end > x.start] or segs

    # Work shift: starts at the end of the last >= 8 h consecutive off period.
    core_runs = _longest_consecutive_off(segs, CORE_REST_H)
    if core_runs:
        shift_start = core_runs[-1][1]
        if shift_start >= as_of:  # currently in a long rest: no shift open
            shift_start = None
    else:
        shift_start = segs[0].start if segs else None

    if shift_start:
        shift_driving = _hours(segs, {"driving"}, shift_start)
        shift_onduty = _hours(segs, ON, shift_start)
        shift_elapsed = (as_of - shift_start).total_seconds() / 3600
    else:
        shift_driving = shift_onduty = shift_elapsed = 0.0

    # s.12 daily limits on the carrier-designated day (midnight boundary here)
    dday = as_of.replace(hour=0, minute=0, second=0, microsecond=0)
    day_driving = _hours(segs, {"driving"}, dday)
    day_onduty = _hours(segs, ON, dday)

    # Daily rest (rolling 24 h simplification).
    day_start = as_of - timedelta(hours=24)
    off_24 = _hours(segs, OFF, day_start)
    core_24 = 0.0
    for a, b in _longest_consecutive_off(segs, 0.0):
        a2 = max(a, day_start)
        if a2 < b:
            core_24 = max(core_24, (b - a2).total_seconds() / 3600)

    # Cycle.
    c = CYCLE[cycle]
    cyc_start = as_of - timedelta(days=c["days"])
    cycle_onduty = _hours(segs, ON, cyc_start)
    # Reset: 36 h (cycle 1) / 72 h (cycle 2) consecutive off inside the window zeroes the count before it.
    resets = [r for r in _longest_consecutive_off(segs, c["reset_h"]) if r[1] > cyc_start]
    if resets:
        cycle_onduty = _hours(segs, ON, resets[-1][1])

    runs_24 = [r for r in _longest_consecutive_off(segs, 24.0) if r[1] > as_of - timedelta(days=14)]
    had_24 = bool(runs_24)
    since_24off = None
    if cycle == 2:
        since_24off = _hours(segs, ON, runs_24[-1][1]) if runs_24 else _hours(segs, ON, cyc_start)

    # signed margins (negative = already over); remaining_* below are clamped for display
    signed = {
        "shift driving 13h": SHIFT_DRIVE_H - shift_driving,
        "shift on-duty 14h": SHIFT_ONDUTY_H - shift_onduty,
        "shift elapsed 16h": (SHIFT_ELAPSED_H - shift_elapsed) if shift_start else SHIFT_ELAPSED_H,
        "day driving 13h": SHIFT_DRIVE_H - day_driving,
        "day on-duty 14h": SHIFT_ONDUTY_H - day_onduty,
        f"cycle {cycle} {int(c['hours'])}h/{c['days']}d": c["hours"] - cycle_onduty,
    }
    rem_c2_70 = None
    if cycle == 2:
        signed["cycle 2: 70h without 24h off"] = CYCLE2_70_H - (since_24off or 0.0)
        rem_c2_70 = max(0.0, signed["cycle 2: 70h without 24h off"])
    rem = {k: max(0.0, v) for k, v in signed.items()}
    binding = min(signed, key=signed.get)

    warnings: list[str] = []
    if not had_24:
        warnings.append("no 24 h consecutive off-duty in the preceding 14 days (s.24) — cannot drive")
    if shift_start and off_24 < DAILY_OFF_H:
        warnings.append(f"only {off_24:.1f} h off in the last 24 h; s.14 requires 10 h (rolling-24 h simplification)")
    if shift_start and core_24 < CORE_REST_H and shift_elapsed > 16:
        warnings.append("no 8 h consecutive rest in the last 24 h")

    return Clocks(
        as_of=as_of, cycle=cycle, current_status=current, shift_start=shift_start,
        shift_driving_h=round(shift_driving, 2), shift_onduty_h=round(shift_onduty, 2),
        shift_elapsed_h=round(shift_elapsed, 2), off_last_24h=round(off_24, 2), core_rest_last_24h=round(core_24, 2),
        cycle_onduty_h=round(cycle_onduty, 2),
        cycle_onduty_since_24off_h=None if since_24off is None else round(since_24off, 2),
        had_24h_off_in_14d=had_24,
        remaining_drive_h=round(min(rem.values()), 2),
        remaining_onduty_h=round(min(rem["shift on-duty 14h"], rem["day on-duty 14h"], rem[f"cycle {cycle} {int(c['hours'])}h/{c['days']}d"]), 2),
        remaining_elapsed_h=round(rem["shift elapsed 16h"], 2),
        remaining_cycle_h=round(rem[f"cycle {cycle} {int(c['hours'])}h/{c['days']}d"], 2),
        remaining_cycle2_70_h=None if rem_c2_70 is None else round(rem_c2_70, 2),
        binding=binding, signed_margins={k: round(v, 2) for k, v in signed.items()},
        day_driving_h=round(day_driving, 2), day_onduty_h=round(day_onduty, 2), warnings=warnings,
    )


@dataclass
class PlanStep:
    status: str   # driving | on_duty | off | sleeper
    hours: float
    label: str = ""


@dataclass
class Feasibility:
    feasible: bool
    margin_h: float                 # smallest remaining across all clocks at the end of the plan (negative = violation)
    binding: str
    first_violation: str | None
    at_step: str | None
    clocks_after: Clocks
    adverse_conditions_note: str


def check_plan(events: list[DutyEvent], as_of: datetime, plan: list[PlanStep], cycle: int = 1) -> Feasibility:
    """Walk the plan forward from as_of, appending its steps to the duty log. Dock waiting must be passed as
    'on_duty'. Limits prohibit DRIVING, not continued non-driving work: an on-duty step never violates by
    itself, but a driving step is illegal if any driving clock is already exhausted when it starts or
    becomes exhausted before it ends. Margins are signed (unclamped)."""
    ev = list(events)
    t = as_of
    first_v = at = None
    worst_margin = float("inf")
    worst_binding = ""

    def drive_margins(c: Clocks) -> dict:
        return dict(c.signed_margins)

    for step in plan:
        if step.status == "driving":
            c0 = compute_clocks(ev, t, cycle)
            m0 = drive_margins(c0)
            k0 = min(m0, key=m0.get)
            if m0[k0] <= 0 and first_v is None:
                first_v, at = k0, step.label or f"{step.status} {step.hours}h"
        ev.append(DutyEvent(t, step.status))
        t = t + timedelta(hours=step.hours)
        c = compute_clocks(ev, t, cycle)
        m = drive_margins(c)
        if step.status == "driving":
            k = min(m, key=m.get)
            if m[k] < worst_margin:
                worst_margin, worst_binding = m[k], k
            if m[k] < 0 and first_v is None:
                first_v, at = k, step.label or f"{step.status} {step.hours}h"
        elif step.status == "on_duty":
            # not a violation, but it consumes the clocks: track the margin the NEXT driving step would see
            m2 = {kk: vv for kk, vv in m.items() if kk != "shift driving 13h" and kk != "day driving 13h"}
            k = min(m2, key=m2.get)
            if m2[k] < worst_margin:
                worst_margin, worst_binding = m2[k], k
    final = compute_clocks(ev, t, cycle)
    if worst_margin == float("inf"):
        worst_margin, worst_binding = final.remaining_drive_h, final.binding
    return Feasibility(
        feasible=first_v is None and final.had_24h_off_in_14d,
        margin_h=round(worst_margin, 2), binding=worst_binding,
        first_violation=first_v, at_step=at, clocks_after=final,
        adverse_conditions_note=(
            "s.76 adverse driving conditions may allow up to 2 h extension of the driving, on-duty and elapsed "
            "limits ONLY if the condition was not known and could not reasonably have been known before departure, "
            "the trip could normally have been completed, and the mandatory 8 h rest still follows; must be recorded. "
            "Eligibility is not assumed here — dispatcher/driver review required."
        ),
    )


def departure_margin(events: list[DutyEvent], as_of: datetime, wait_more_h: float, drive_to_safe_h: float,
                     cycle: int = 1) -> Feasibility:
    """The 'three clocks' question: if the driver waits `wait_more_h` more at the dock (on duty) and then
    needs `drive_to_safe_h` to reach a legal stop, what is the margin?"""
    plan = [PlanStep("on_duty", wait_more_h, "remaining dock wait"), PlanStep("driving", drive_to_safe_h, "drive to legal stop")]
    return check_plan(events, as_of, plan, cycle)


def seed_history_from_snapshot(as_of: datetime, remaining_cycle_h: float, cycle: int, on_duty_now: bool,
                               shift_onduty_so_far_h: float = 0.0) -> list[DutyEvent]:
    """Build a plausible duty history that reproduces an exported snapshot (REMAINING_HOURS_CAN_7 etc.).
    Spreads (cycle_hours - remaining) of on-duty time over the prior days as 10 h shifts with 14 h off,
    guaranteeing a 24 h off block ~8 days back so s.24 is satisfied. For simulation seeding only."""
    c = CYCLE[cycle]
    used = max(0.0, c["hours"] - remaining_cycle_h - shift_onduty_so_far_h)
    ev: list[DutyEvent] = []
    t = as_of - timedelta(hours=shift_onduty_so_far_h) - timedelta(hours=CORE_REST_H + 2)  # end of last rest
    # today's shift so far
    if shift_onduty_so_far_h > 0:
        ev.append(DutyEvent(as_of - timedelta(hours=shift_onduty_so_far_h), "on_duty" if on_duty_now else "driving"))
    day_h = 10.0
    day_cursor = t
    while used > 0.05:
        h = min(day_h, used)
        end = day_cursor
        start = end - timedelta(hours=h)
        ev.append(DutyEvent(start, "driving"))
        ev.append(DutyEvent(end, "off"))
        used -= h
        day_cursor = start - timedelta(hours=24 - h)  # 24 h day: h on, rest off
    # an off period of >= 30 h precedes the first block (satisfies s.25 when it ends inside 14 days),
    # and the log opens with 'off' well before any window. No extra on-duty time is invented.
    ev.append(DutyEvent(day_cursor - timedelta(hours=30), "off"))
    ev.append(DutyEvent(as_of - timedelta(days=20), "off"))
    return sorted(ev, key=lambda e: e.ts)
