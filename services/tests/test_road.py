from core.road import Closure, leg_delay

# London (42.98, -81.25) -> Milton (43.52, -79.88): about 130 km straight, the demo corridor
LONDON, MILTON = (42.98, -81.25), (43.52, -79.88)
CAMBRIDGE = Closure("c1", 43.39, -80.35, 12, 0.45, "401 WB collision")


def test_closure_on_the_corridor_adds_time_proportional_to_the_chord():
    d = leg_delay(*LONDON, *MILTON, [CAMBRIDGE], kmh=75)
    assert d["closures"] == [CAMBRIDGE]
    # a 12 km radius circle straddling the line: about 24 km x 1.25 road factor inside, driven at 45 %
    assert 20 < d["affected_km"] < 32
    expect = d["affected_km"] / (75 * 0.45) - d["affected_km"] / 75
    assert abs(d["extra_h"] - expect) < 1e-3
    assert 0.3 < d["extra_h"] < 0.55


def test_closure_off_the_corridor_costs_nothing():
    barrie = Closure("c2", 44.39, -79.69, 8, 0.45)
    d = leg_delay(*LONDON, *MILTON, [barrie], kmh=75)
    assert d == {"extra_h": 0.0, "affected_km": 0.0, "closures": []}


def test_overlapping_closures_count_once_at_the_worst_factor():
    same_spot_milder = Closure("c3", 43.39, -80.35, 12, 0.7)
    both = leg_delay(*LONDON, *MILTON, [CAMBRIDGE, same_spot_milder], kmh=75)
    alone = leg_delay(*LONDON, *MILTON, [CAMBRIDGE], kmh=75)
    assert both["extra_h"] == alone["extra_h"]
    assert both["closures"][0] is CAMBRIDGE


def test_leg_starting_inside_a_closure_is_slowed_from_the_first_kilometre():
    d = leg_delay(43.39, -80.35, *MILTON, [CAMBRIDGE], kmh=75)
    assert d["affected_km"] > 10 and d["extra_h"] > 0


def test_speed_factor_of_one_is_not_a_closure():
    d = leg_delay(*LONDON, *MILTON, [Closure("x", 43.39, -80.35, 12, 1.0)], kmh=75)
    assert d["extra_h"] == 0.0 and d["closures"] == []
