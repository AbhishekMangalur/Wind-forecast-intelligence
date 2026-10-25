import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo
from datetime import timedelta
import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

UK = ZoneInfo("Europe/London")

# This is a modelling assumption, not a claim about an official market gate.
# Override with DECISION_CUTOFF_TIME=HH:MM when the business rule is confirmed.
DECISION_CUTOFF_TIME = os.getenv("DECISION_CUTOFF_TIME", "10:00")
try:
    _cutoff_hour, _cutoff_minute = (int(part) for part in DECISION_CUTOFF_TIME.split(":"))
    if not (0 <= _cutoff_hour <= 23 and 0 <= _cutoff_minute <= 59):
        raise ValueError
except (ValueError, AttributeError):
    raise ValueError("DECISION_CUTOFF_TIME must be a valid 24-hour HH:MM value")

ACTUALS_FILE = Path(
    os.getenv("ACTUALS_FILE", DATA_DIR / "actuals.json")
)
FORECASTS_FILE = Path(
    os.getenv("FORECASTS_FILE", DATA_DIR / "forecasts.json")
)


def load_json(path: Path) -> pd.DataFrame:
    with path.open() as file:
        return pd.DataFrame(json.load(file))


def load_actuals() -> pd.DataFrame:
    df = load_json(ACTUALS_FILE)

    df = df[df["fuelType"] == "WIND"].copy()
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = pd.to_numeric(
        df["generation"], errors="coerce"
    )

    df = df.dropna(subset=["startTime", "generation"])

    # Only January 2026 delivery periods.
    df = df[
        (df["startTime"] >= "2026-01-01T00:00:00Z")
        & (df["startTime"] < "2026-02-01T00:00:00Z")
    ]

    # Hourly actual = average of the two half-hourly values.
    hourly = (
        df.set_index("startTime")["generation"]
        .resample("1h")
        .agg(["mean", "count"])
        .rename(columns={
            "mean": "actual",
            "count": "actual_periods",
        })
        .reset_index()
    )

    # Require both half-hourly records for a complete hour.
    hourly.loc[hourly["actual_periods"] != 2, "actual"] = float("nan")

    return hourly


def load_forecasts() -> pd.DataFrame:
    df = load_json(FORECASTS_FILE)

    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df["generation"] = pd.to_numeric(
        df["generation"], errors="coerce"
    )

    df = df.dropna(
        subset=["startTime", "publishTime", "generation"]
    )

    return df[
        (df["startTime"] >= "2026-01-01T00:00:00Z")
        & (df["startTime"] < "2026-02-01T00:00:00Z")
    ].copy()


def decision_cutoff(delivery_time: pd.Timestamp) -> pd.Timestamp:
    """Assumed decision cutoff on the previous UK calendar day.

    The cutoff time is configurable because the assignment does not define an
    official market gate. Always compare timezone-aware publication timestamps.
    """
    delivery_local = delivery_time.tz_convert(UK)
    previous_day = delivery_local.date() - timedelta(days=1)

    cutoff_local = pd.Timestamp(
        f"{previous_day.isoformat()} {DECISION_CUTOFF_TIME}:00",
        tz=UK,
    )
    return cutoff_local.tz_convert("UTC")


def build_analysis() -> pd.DataFrame:
    actuals = load_actuals()
    forecasts = load_forecasts()

    forecasts["cutoff"] = forecasts["startTime"].map(decision_cutoff)

    # Keep only forecasts published on or before the cutoff.
    eligible = forecasts[
        forecasts["publishTime"] <= forecasts["cutoff"]
    ].copy()

    # One latest eligible forecast per hourly delivery period.
    selected = (
        eligible.sort_values("publishTime")
        .drop_duplicates(subset=["startTime"], keep="last")
        [["startTime", "publishTime", "generation"]]
        .rename(columns={
            "publishTime": "forecast_publish_time",
            "generation": "forecast",
        })
    )

    result = actuals.merge(selected, on="startTime", how="left")

    result["error"] = result["forecast"] - result["actual"]
    result["absolute_error"] = result["error"].abs()
    result["squared_error"] = result["error"] ** 2

    return result


def get_summary(df: pd.DataFrame) -> dict:
    valid = df.dropna(subset=["forecast", "actual"])

    if valid.empty:
        mae = rmse = bias = None
    else:
        mae = float(valid["absolute_error"].mean())
        rmse = float((valid["squared_error"].mean()) ** 0.5)
        bias = float(valid["error"].mean())

    return {
        "month": "2026-01",
        "actual_hours": int(df["actual"].notna().sum()),
        "hours_with_forecast": int(df["forecast"].notna().sum()),
        "matched_hours": int(len(valid)),
        "forecast_coverage_pct": round(
            100 * len(valid) / len(df), 2
        ) if len(df) else 0,
        "mae_mw": round(mae, 2) if mae is not None else None,
        "rmse_mw": round(rmse, 2) if rmse is not None else None,
        "bias_mw": round(bias, 2) if bias is not None else None,
        "cutoff_rule": f"Assumption: {DECISION_CUTOFF_TIME} Europe/London on the previous calendar day",
        "cutoff_is_assumption": True,
        "cutoff_timezone": "Europe/London",
        "cutoff_local_time": DECISION_CUTOFF_TIME,
        "forecast_selection": "Latest forecast published on or before the assumed cutoff for each delivery hour",
        "actual_aggregation": "Mean of two half-hourly actual values; incomplete hours excluded from metrics",
    }
