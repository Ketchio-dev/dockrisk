"""The notice never invents a number: the template path carries the packet's amount and times verbatim."""
from core.notice import draft_notice, facts

PACKET = {
    "visit": {"visit_id": 7, "unit": "B3339", "driver_name": "Driver84", "bill_number": "412289-AA", "stop_kind": "delivery",
              "appointment_start_ts": "2026-09-08 10:00:00", "appointment_end_ts": None, "property_entered_ts": "2026-09-08 09:20:00",
              "checked_in_ts": "2026-09-08 09:20:00", "at_dock_ts": "2026-09-08 09:35:00", "service_complete_ts": "2026-09-08 12:05:00",
              "released_ts": "2026-09-08 12:10:00", "gate_exited_ts": "2026-09-08 12:14:00", "on_time": 1},
    "facility": {"facility_id": 1, "name": "London DC (demo geometry)", "customer": "ACME Foods", "city": "LONDON", "source": "demo", "confidence": 0.6},
    "calculation": {"policy": {"free_time_min": 120, "rate_per_hour": 75, "increment_min": 15, "billing_start_rule": "max_checkin_appointment", "source": "default"},
                    "clock_start_ts": "2026-09-08 10:00:00", "clock_end_ts": "2026-09-08 12:10:00", "physical_dwell_min": 174, "qualifying_dwell_min": 130,
                    "billable_min": 15, "billable_raw_min": 10, "amount": 18.75, "confidence": 0.6, "review_required": True,
                    "review_reasons": ["facility geometry is demo (confidence 0.6), not verified dock geometry"]},
    "events": [], "breadcrumb_points": 0, "breadcrumb_sample": [], "duty_timeline": [], "limits": [],
}


def test_template_notice_uses_the_packet_verbatim():
    d = draft_notice(PACKET, prefer_llm=False)
    assert d.source == "drafted-template" and d.warning is None
    body = d.notice.body
    for needle in ("412289-AA", "09:20", "10:00", "120 minutes free", "15 minutes are billable", "$75", "$18.75", "ACME Foods"):
        assert needle in body, needle
    assert any("demo" in c for c in d.notice.caveats) and "subject to confirmation" in body
    assert "2026-09-08" in d.notice.subject


def test_facts_name_the_party_and_the_clock_rule():
    x = facts(PACKET, None)
    assert x["party"] == "consignee" and "later of driver check-in" in x["clock_rule"] and x["left"] == "12:14"
