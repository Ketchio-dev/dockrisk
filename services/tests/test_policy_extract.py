from core.policy_extract import _rules, extract_terms

SAMPLE = """RATE CONFIRMATION — Lane: Milton, ON to London, ON. Rate: $650 flat.
Detention: 2 hours free time at shipper and consignee. $75.00 per hour thereafter, billed in 15-minute increments,
not to exceed $400 per stop. Detention counts from the later of driver check-in and the scheduled appointment time.
Driver must be on time for the appointment; detention is not payable if the driver is late.
Carrier must provide in/out times signed by the facility and the BOL with the invoice."""


def test_rules_parser_reads_the_sample():
    t = _rules(SAMPLE)
    assert t.free_time_min == 120 and t.rate_per_hour == 75.0 and t.increment_min == 15 and t.maximum_charge == 400.0
    assert t.billing_start_rule == "max_checkin_appointment" and t.requires_on_time_arrival is True
    assert "signed in/out times" in t.required_evidence and "BOL" in t.required_evidence
    assert set(t.applies_to) == {"shipper", "consignee"} and len(t.evidence_quotes) >= 4


def test_rules_parser_says_what_it_did_not_find():
    t = _rules("Rate: $900 flat. No detention terms listed.")
    assert t.free_time_min is None and t.rate_per_hour is None and "not stated" in (t.notes or "")


def test_extract_falls_back_and_labels_it(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "")
    ex = extract_terms(SAMPLE, prefer_llm=False)
    assert ex.source == "extracted-rules" and ex.terms.rate_per_hour == 75.0
