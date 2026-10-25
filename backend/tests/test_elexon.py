import pandas as pd

from app.services.elexon import UK, decision_cutoff, get_summary


def test_decision_cutoff_is_previous_day_at_configured_uk_time():
    delivery = pd.Timestamp("2026-01-31T23:00:00Z")
    cutoff = decision_cutoff(delivery).tz_convert(UK)

    assert cutoff == pd.Timestamp("2026-01-30 10:00:00", tz=UK)


def test_decision_cutoff_handles_british_summer_time():
    delivery = pd.Timestamp("2026-07-15T12:00:00Z")
    cutoff = decision_cutoff(delivery).tz_convert(UK)

    assert cutoff == pd.Timestamp("2026-07-14 10:00:00", tz=UK)


def test_summary_metrics_and_coverage():
    df = pd.DataFrame({
        "actual": [100.0, 200.0, 300.0],
        "forecast": [110.0, 180.0, 330.0],
        "error": [10.0, -20.0, 30.0],
        "absolute_error": [10.0, 20.0, 30.0],
        "squared_error": [100.0, 400.0, 900.0],
    })

    summary = get_summary(df)
    assert summary["matched_hours"] == 3
    assert summary["forecast_coverage_pct"] == 100.0
    assert summary["mae_mw"] == 20.0
    assert summary["rmse_mw"] == round((1400 / 3) ** 0.5, 2)
    assert summary["bias_mw"] == round((10 - 20 + 30) / 3, 2)
    assert summary["cutoff_is_assumption"] is True


def test_included_january_snapshot_regression():
    # Protect the verified baseline for the bundled January 2026 data snapshot.
    from app.services.elexon import build_analysis

    summary = get_summary(build_analysis())
    assert summary["actual_hours"] == 744
    assert summary["matched_hours"] == 744
    assert summary["forecast_coverage_pct"] == 100.0
    assert summary["mae_mw"] == 2122.81
    assert summary["rmse_mw"] == 2616.69
    assert summary["bias_mw"] == 1840.30
    assert summary["cutoff_is_assumption"] is True
