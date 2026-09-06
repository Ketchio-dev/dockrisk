from datetime import datetime, timedelta

from core.hos import DutyEvent, PlanStep, check_plan, compute_clocks, departure_margin, seed_history_from_snapshot

T0 = datetime(2026, 9, 7, 6, 0)


def rested(before_h=12):
    """A driver who has been off for `before_h` hours and just came on duty at T0."""
    return [DutyEvent(T0 - timedelta(days=20), "off"), DutyEvent(T0 - timedelta(hours=before_h), "off"), DutyEvent(T0, "on_duty")]


def test_fresh_shift_has_full_clocks():
    c = compute_clocks(rested(), T0 + timedelta(minutes=1))
    assert c.shift_start == T0
    assert c.remaining_drive_h > 12.9 and c.remaining_onduty_h > 13.9
    assert c.had_24h_off_in_14d and c.can_drive_now


def test_13h_driving_cap_binds_before_14h_onduty():
    ev = rested() + [DutyEvent(T0, "driving")]
    c = compute_clocks(ev, T0 + timedelta(hours=13))
    assert c.remaining_drive_h == 0 and c.binding == "shift driving 13h"


def test_dock_waiting_is_on_duty_and_eats_the_14h_clock():
    ev = rested() + [DutyEvent(T0, "driving"), DutyEvent(T0 + timedelta(hours=6), "on_duty")]  # 6 h drive, then waiting
    c = compute_clocks(ev, T0 + timedelta(hours=14))
    assert c.shift_driving_h == 6 and c.shift_onduty_h == 14
    assert c.remaining_drive_h == 0 and c.binding == "shift on-duty 14h"  # driving time left, but on-duty exhausted


def test_16h_elapsed_window_counts_short_breaks():
    ev = rested() + [DutyEvent(T0, "driving"), DutyEvent(T0 + timedelta(hours=5), "off"),
                     DutyEvent(T0 + timedelta(hours=9), "driving")]  # 4 h break does not reset the shift
    c = compute_clocks(ev, T0 + timedelta(hours=16))
    assert c.shift_start == T0 and c.remaining_elapsed_h == 0 and c.binding == "shift elapsed 16h"


def test_8h_off_resets_the_shift():
    ev = rested() + [DutyEvent(T0, "driving"), DutyEvent(T0 + timedelta(hours=10), "off"),
                     DutyEvent(T0 + timedelta(hours=18, minutes=30), "driving")]
    c = compute_clocks(ev, T0 + timedelta(hours=19))
    assert c.shift_start == T0 + timedelta(hours=18, minutes=30) and c.shift_driving_h == 0.5


def test_cycle1_70h_in_7_days():
    ev = [DutyEvent(T0 - timedelta(days=20), "off")]
    for d in range(7):  # 10 h driving per day for 7 days = 70 h
        s = T0 - timedelta(days=7 - d)
        ev += [DutyEvent(s, "driving"), DutyEvent(s + timedelta(hours=10), "off")]
    c = compute_clocks(ev, T0, cycle=1)
    assert c.cycle_onduty_h == 70 and c.remaining_cycle_h == 0 and c.remaining_drive_h == 0


def test_cycle2_70h_without_24h_off_blocks_even_under_120():
    ev = [DutyEvent(T0 - timedelta(days=20), "off"), DutyEvent(T0 - timedelta(days=9), "off")]  # 24h+ off ends 9 days ago
    for d in range(8):  # 9 h/day for 8 days = 72 h since the 24 h off, well under 120
        s = T0 - timedelta(days=8 - d)
        ev += [DutyEvent(s, "driving"), DutyEvent(s + timedelta(hours=9), "off")]
    c = compute_clocks(ev, T0, cycle=2)
    assert c.cycle_onduty_h == 72 and c.remaining_cycle_h == 48
    assert c.remaining_cycle2_70_h == 0 and c.remaining_drive_h == 0 and "70h without 24h off" in c.binding


def test_no_24h_off_in_14_days_is_flagged():
    ev = [DutyEvent(T0 - timedelta(days=20), "off")]
    for d in range(14):
        s = T0 - timedelta(days=14 - d)
        ev += [DutyEvent(s, "driving"), DutyEvent(s + timedelta(hours=4), "off")]  # off 20 h/day, never 24
    c = compute_clocks(ev, T0)
    assert not c.had_24h_off_in_14d and not c.can_drive_now and any("s.24" in w for w in c.warnings)


def test_plan_feasible_then_infeasible_when_wait_grows():
    ev = rested() + [DutyEvent(T0, "driving"), DutyEvent(T0 + timedelta(hours=9), "on_duty")]  # 9 h driven, now waiting
    now = T0 + timedelta(hours=11)  # 2 h at the dock so far: on-duty 11 h, 3 h left
    ok = departure_margin(ev, now, wait_more_h=1.0, drive_to_safe_h=1.5)
    bad = departure_margin(ev, now, wait_more_h=2.0, drive_to_safe_h=1.5)
    assert ok.feasible and ok.margin_h == 0.5
    assert not bad.feasible and bad.first_violation == "shift on-duty 14h" and bad.margin_h == -0.5


def test_adverse_conditions_is_never_applied_automatically():
    ev = rested() + [DutyEvent(T0, "driving")]
    f = check_plan(ev, T0 + timedelta(hours=12), [PlanStep("driving", 2.0, "final leg")])
    assert not f.feasible and "review required" in f.adverse_conditions_note


def test_seed_from_snapshot_reproduces_remaining_hours():
    ev = seed_history_from_snapshot(T0, remaining_cycle_h=22.36, cycle=1, on_duty_now=True, shift_onduty_so_far_h=3)
    c = compute_clocks(ev, T0, cycle=1)
    assert abs(c.remaining_cycle_h - 22.36) < 0.6
    assert c.had_24h_off_in_14d and c.shift_onduty_h == 3


# --- cases reproduced by the Sep 6 engine review ---
def test_cycle_nearly_exhausted_rejects_more_driving():
    ev = [DutyEvent(T0 - timedelta(days=20), "off")]
    for d in range(7):  # 9.857 h/day * 7 = 69 h, all inside the last 6.5 days so nothing rolls off during the plan
        s = T0 - timedelta(hours=6.5 * 24) + timedelta(hours=22 * d)
        ev += [DutyEvent(s, "driving"), DutyEvent(s + timedelta(hours=9.857), "off")]
    f = check_plan(ev, T0, [PlanStep("driving", 2.0, "one more leg")], cycle=1)
    assert not f.feasible and "cycle" in f.first_violation and f.margin_h < 0


def test_daily_13h_driving_limit_survives_an_8h_rest():
    day = datetime(2026, 9, 7, 0, 0)
    ev = [DutyEvent(day - timedelta(days=20), "off"), DutyEvent(day, "driving"), DutyEvent(day + timedelta(hours=7), "off"),
          DutyEvent(day + timedelta(hours=15), "driving")]  # 7 h, 8 h rest (shift resets), then driving again the same day
    f = check_plan(ev, day + timedelta(hours=15), [PlanStep("driving", 7.0, "second run")], cycle=1)
    assert not f.feasible and f.first_violation == "day driving 13h"


def test_on_duty_work_after_14h_is_not_a_violation_but_driving_is():
    ev = rested() + [DutyEvent(T0, "driving")]
    now = T0 + timedelta(hours=13)
    unload_only = check_plan(ev, now, [PlanStep("on_duty", 2.0, "unload")])
    then_drive = check_plan(ev, now, [PlanStep("on_duty", 2.0, "unload"), PlanStep("driving", 0.5, "to yard")])
    assert unload_only.feasible
    assert not then_drive.feasible and then_drive.at_step == "to yard"


def test_event_exactly_at_as_of_is_current_status():
    ev = rested() + [DutyEvent(T0, "driving"), DutyEvent(T0 + timedelta(hours=2), "on_duty")]
    assert compute_clocks(ev, T0 + timedelta(hours=2)).current_status == "on_duty"


def test_cycle2_seed_does_not_invent_hours():
    ev = seed_history_from_snapshot(T0, remaining_cycle_h=60, cycle=2, on_duty_now=True, shift_onduty_so_far_h=0)
    c = compute_clocks(ev, T0, cycle=2)
    assert abs(c.remaining_cycle_h - 60) < 0.2
