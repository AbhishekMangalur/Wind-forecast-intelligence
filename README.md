# WindScope — UK Wind Forecast Intelligence

A full-stack analytics dashboard comparing UK wind generation forecasts with observed generation for **January 2026**. It is designed as a day-ahead decision-support prototype for an energy buyer: it evaluates the forecast that would have been available before a specified decision cutoff, rather than selecting a later forecast with hindsight.

> **Important methodology caveat:** the default decision cutoff of **10:00 Europe/London on the previous calendar day is an explicit modelling assumption**, not a claim that Elexon or the UK electricity market defines 10:00 as the official purchasing deadline. The assignment does not provide a specific cutoff. Confirm the business decision time with the assignment owner or market stakeholder before presenting it as an operational rule. The cutoff can be configured with `DECISION_CUTOFF_TIME`.

## What it does

- Loads Elexon BMRS `FUELHH` actual generation and filters to `fuelType == WIND`.
- Aggregates the two half-hourly actual records into an hourly mean; an hour without both records is treated as incomplete.
- Loads all available `WINDFOR` forecast versions for January 2026 delivery hours.
- For each delivery hour, calculates the assumed decision cutoff in UK local time, including GMT/BST timezone handling.
- Selects the latest forecast published **on or before** that cutoff. Forecasts published after the cutoff are excluded to avoid look-ahead bias.
- Joins forecast and actual values by delivery timestamp and calculates MAE, RMSE, mean bias and coverage.
- Exposes a FastAPI API consumed by the React/Vite dashboard.

## Results for the included data snapshot

| Measure | Result | Interpretation |
|---|---:|---|
| Actual hours | 744 | Complete January hourly actuals |
| Matched hours | 744 | Actual and eligible forecast both present |
| Forecast coverage | 100% | Matched hours / actual hours |
| MAE | 2,122.81 MW | Mean absolute forecast error |
| RMSE | 2,616.69 MW | Gives larger errors more influence |
| Mean bias | +1,840.30 MW | Forecast minus actual; positive means over-forecasting |

These results are reproducible for the included JSON snapshot and current cutoff assumption. They should not be described as proof of financial impact; estimating purchasing cost or balancing exposure would require additional market prices, volumes and settlement assumptions.

## Architecture

```text
Elexon BMRS JSON snapshot
        |
        v
FastAPI + Pandas (backend)
  - validate/filter timestamps
  - aggregate actuals hourly
  - cutoff-aware forecast selection
  - metrics and JSON endpoints
        |
        v
React + Vite + Recharts (frontend)
  - KPI cards
  - actual vs forecast series
  - forecast error visualization
```

## Repository structure

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── services/elexon.py
│   ├── data/
│   │   ├── actuals.json
│   │   └── forecasts.json
│   ├── tests/test_elexon.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                  # Existing Vite React application + Docker/Nginx config
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Run locally without Docker

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend endpoints:

- Health: <http://127.0.0.1:8000/api/health>
- Summary: <http://127.0.0.1:8000/api/summary>
- Hourly series: <http://127.0.0.1:8000/api/series>
- Interactive API docs: <http://127.0.0.1:8000/docs>

### Frontend

In a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env` with:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Then run:

```bash
npm run dev
```

Open <http://localhost:5173>.

## Run with Docker Compose

The supplied compose file expects the existing Vite React source and `package-lock.json` in `frontend/`. The frontend Dockerfile and Nginx configuration are already provided. From the repository root:

```bash
docker compose up --build -d
docker compose ps
```

Open <http://localhost:5173>. Check the API at <http://localhost:8000/api/health> and <http://localhost:8000/api/summary>.

View logs or stop the stack:

```bash
docker compose logs -f backend frontend
docker compose down
```

Configuration can be placed in a root `.env` file, starting from `.env.example`. Do not commit `.env` or API keys. `VITE_API_BASE_URL` is compiled into the browser bundle, so it must be a URL the user's browser can reach; a Docker service name such as `http://backend:8000` will not work in the browser.

## Tests

Run backend unit tests:

```bash
cd backend
python -m pip install -r requirements.txt
PYTHONPATH=. pytest -q
```

The tests cover cutoff calculation in winter and summer UK time and the summary metric formulas. Before submission, also manually verify the health, summary and series endpoints and check that the charts load without browser-console errors.

## Methodology and assumptions

### Delivery timestamps

Timestamps are parsed as UTC for reliable matching. The decision cutoff is built in `Europe/London` local time and then converted to UTC. This handles the UK's seasonal clock changes without hard-coding a UTC offset.

### Cutoff and forecast selection

For each hourly delivery timestamp, the implementation uses the previous UK calendar day at `DECISION_CUTOFF_TIME` (default `10:00`). It filters to forecast versions with `publishTime <= cutoff` and takes the latest eligible version for that delivery hour. This is a **proxy decision rule** chosen for this analysis; it is not independently verified as an official market gate. A defensible production version should use the actual buyer's decision deadline and document its source.

The `WINDFOR` dataset contains multiple forecast versions for a delivery hour. Selecting the latest eligible version makes the evaluation time-aware and avoids using later updates that were not available at the assumed decision point.

### Actual generation aggregation

The actual dataset is half-hourly. The project takes the arithmetic mean of the two half-hourly values within an hour. Hours with anything other than two records are marked incomplete and excluded from error metrics. This is the defined analytical aggregation used in this project; it should be aligned with the business definition of hourly generation if the dashboard is used operationally.

### Metrics

- **MAE**: mean of `abs(forecast - actual)`; typical absolute error in MW.
- **RMSE**: square root of the mean squared error; larger errors have greater influence.
- **Bias**: mean of `forecast - actual`; positive means forecasts were high on average.
- **Coverage**: matched actual/forecast hours divided by actual hours.

Coverage describes data availability, not forecast quality. A high coverage value does not mean the forecast is accurate.

## Data sources

- Elexon BMRS API dataset documentation: <https://developer.data.elexon.co.uk/> (`FUELHH` actual generation and `WINDFOR` wind forecasts).
- Elexon Wind Generation overview: <https://www.elexon.co.uk/bsc/operational-information/wind-generation/>
- Included JSON files are a local snapshot used for reproducibility. For a refresh, download the relevant January 2026 actual and all forecast-version records from the Elexon BMRS API, then rerun the API.

## Deployment notes

The app is containerized for local reproducibility. For public deployment, host the FastAPI backend and React static frontend separately or deploy the Docker Compose stack on a container host. Set `DECISION_CUTOFF_TIME` and `FRONTEND_ORIGINS` on the backend. Set the frontend's `VITE_API_BASE_URL` to the public HTTPS API base URL **at build time**. Add the frontend's deployed origin to `FRONTEND_ORIGINS`. Verify HTTPS, CORS, health checks and all three API endpoints after deployment.

Do not claim that the app is deployed until the public URL has been tested.

## AI tools disclosure

If AI tools were used while developing this project, disclose them accurately in the final repository (for example, “ChatGPT was used to help review implementation, explain metrics and draft documentation; the author ran the code and validated the results”). Edit this statement to match the tools actually used and the work personally verified. Do not claim that AI-generated code or outputs were independently tested unless you ran those tests yourself.

## Limitations / next improvements

- The cutoff time is an assumption and must be confirmed with the intended buyer/market process.
- The analysis covers one historical month and does not establish future forecast performance.
- Forecast errors alone do not estimate cost; price and settlement data would be needed.
- Consider adding date-range controls, error thresholds, missing-data indicators and automated data refresh if the prototype is extended.
