import sqlite3

from core.analytics import build_dwell_history, build_dwell_model, exposure_summary
from core.importer import main as import_main
from core.synthetic import main as synth_main


def test_synthetic_workbook_imports_and_analyzes(tmp_path):
    xlsx = tmp_path / "sample.xlsx"
    synth_main(xlsx, seed=3, n_orders=60, n_drivers=10)
    db = tmp_path / "t.db"
    import_main(xlsx, db)
    c = sqlite3.connect(db); c.row_factory = sqlite3.Row
    counts = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("drivers", "orders", "legs", "trailers", "places")}
    assert counts["drivers"] == 10 and counts["orders"] >= 60 and counts["legs"] == 120 and counts["trailers"] == 60 and counts["places"] > 30
    assert c.execute("SELECT COUNT(*) FROM orders WHERE in_region=1").fetchone()[0] == counts["orders"]   # built-in coordinates place every order
    assert c.execute("SELECT affected FROM data_quality WHERE rule='leg_hos_columns_frozen_per_driver'").fetchone()[0] == 10
    assert build_dwell_history(c) > 100 and build_dwell_model(c) > 50
    e = exposure_summary(c)
    assert e["by_kind"]["delivery"]["n"] > 50 and e["monthly_exposure_low"] > 0
