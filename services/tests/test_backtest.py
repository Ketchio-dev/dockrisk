"""The history replay: trained before the cutoff, scored after it, charges floored to the increment."""
import sqlite3

from core.analytics import build_dwell_history
from core.backtest import replay
from core.importer import main as import_main
from core.synthetic import main as synth_main


def test_replay_is_out_of_sample_and_arithmetic_is_consistent(tmp_path):
    xlsx = tmp_path / "s.xlsx"; db = tmp_path / "t.db"
    synth_main(xlsx, seed=11, n_orders=400, n_drivers=12)
    import_main(xlsx, db)
    c = sqlite3.connect(db); c.row_factory = sqlite3.Row
    assert build_dwell_history(c) > 300
    out = replay(c, train_days=21)
    assert out["n_train"] + out["n_test"] == out["n_total"] and out["n_test"] > 50
    w = out["warning"]
    assert w["true_positive"] + w["false_positive"] + w["false_negative"] + w["true_negative"] == w["decisions"]
    assert w["precision"] is None or 0 <= w["precision"] <= 1
    ch = out["charges"]
    assert ch["n"] <= ch["stops_over_free"]                      # a charge needs at least one full increment
    assert abs(ch["amount"] - ch["billable_hours"] * 75) <= 5   # floored minutes x rate, nothing else (hours are rounded to 0.1)
    assert all("Customer" in p["customer"] or p["customer"] == "Unknown customer" for p in out["top_places"])  # never a real name
    assert out["not_replayed"] and "hours-of-service" in out["not_replayed"][0]
