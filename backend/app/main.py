import os
import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.services.elexon import build_analysis, get_summary

app = FastAPI(
    title="UK Wind Forecast Intelligence API",
    description=(
        "January 2026 UK wind generation forecast analysis. The day-ahead "
        "decision cutoff is an explicitly documented modelling assumption."
    ),
    version="1.1.0",
)

_origins = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _origins.split(",") if origin.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/summary")
def summary():
    try:
        df = build_analysis()
        return get_summary(df)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/series")
def series():
    try:
        df = build_analysis().sort_values("startTime")
        df["startTime"] = df["startTime"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        df["forecast_publish_time"] = df["forecast_publish_time"].dt.strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        # Pandas' JSON encoder converts missing numeric values to JSON null.
        columns = [
            "startTime", "actual", "forecast", "forecast_publish_time", "error"
        ]
        return json.loads(df[columns].to_json(orient="records"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
