import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  Wind,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";
import "./App.css";

const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const number = (value, digits = 0) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : Number(value).toLocaleString("en-GB", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });

const shortTime = (value) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

const shortDate = (value) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/London",
  });

function MetricCard({ label, value, unit, detail, icon: Icon, tone }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone || ""}`}>
          <Icon size={19} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        <span className="metric-unit">{unit}</span>
        <span className="metric-detail">{detail}</span>
      </div>
    </article>
  );
}

function App() {
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState("7");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [summaryResponse, seriesResponse] = await Promise.all([
        fetch(`${API}/api/summary`),
        fetch(`${API}/api/series`),
      ]);

      if (!summaryResponse.ok || !seriesResponse.ok) {
        throw new Error("The API returned an error. Check that the backend is running.");
      }

      const summaryData = await summaryResponse.json();
      const seriesData = await seriesResponse.json();

      setSummary(summaryData);
      setSeries(seriesData);
    } catch (err) {
      setError(
        `${err.message} Make sure FastAPI is running at ${API}.`
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const chartData = useMemo(() => {
    const valid = series.filter(
      (row) => row.actual != null && row.forecast != null
    );
    const count = range === "all" ? valid.length : Number(range) * 24;

    return valid.slice(-count).map((row) => ({
      ...row,
      label: shortTime(row.startTime),
      date: shortDate(row.startTime),
      error: Number(row.forecast) - Number(row.actual),
    }));
  }, [series, range]);

  const errorData = useMemo(() => {
    return chartData.map((row) => ({
      ...row,
      shortLabel: new Date(row.startTime).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      }),
    }));
  }, [chartData]);

  const latest = chartData[chartData.length - 1];
  const latestError = latest ? latest.forecast - latest.actual : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Wind size={23} /></div>
          <div>
            <strong>WindScope</strong>
            <span>ENERGY INTELLIGENCE</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <div className="nav-item active">
          <Activity size={18} />
          <span>Forecast overview</span>
        </div>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <div>
            <strong>Data connection</strong>
            <span>{error ? "Connection issue" : "Elexon dataset snapshot"}</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <div className="eyebrow">UK POWER MARKET / WIND</div>
            <h1>Forecast intelligence</h1>
            <p>Understand forecast accuracy and wind generation performance.</p>
          </div>
          <button className="refresh-button" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spinning" : ""} />
            {loading ? "Loading…" : "Refresh data"}
          </button>
        </header>

        {error && (
          <div className="error-banner">
            <AlertCircle size={19} />
            <div>
              <strong>Unable to load dashboard data</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        <div className="section-heading">
          <div>
            <h2>January 2026 overview</h2>
            <p>Hourly wind generation · All timestamps displayed in UK local time</p>
          </div>
          <div className="data-pill">
            <span className="live-dot" />
            {loading ? "Loading" : error ? "Disconnected" : "API connected"}
          </div>
        </div>

        <section className="metrics-grid">
          <MetricCard
            label="Mean absolute error"
            value={number(summary?.mae_mw, 2)}
            unit="MW"
            detail="Average absolute difference"
            icon={Activity}
            tone="blue"
          />
          <MetricCard
            label="Root mean squared error"
            value={number(summary?.rmse_mw, 2)}
            unit="MW"
            detail="Penalises larger misses"
            icon={Wind}
            tone="purple"
          />
          <MetricCard
            label="Forecast bias"
            value={number(summary?.bias_mw, 2)}
            unit="MW"
            detail={
              summary?.bias_mw > 0
                ? "Forecasts higher than actuals"
                : "Forecasts lower than actuals"
            }
            icon={summary?.bias_mw >= 0 ? ArrowUpRight : ArrowDownRight}
            tone="orange"
          />
          <MetricCard
            label="Forecast coverage"
            value={number(summary?.forecast_coverage_pct, 2)}
            unit="%"
            detail={`${number(summary?.matched_hours)} matched hours`}
            icon={CheckCircle2}
            tone="green"
          />
        </section>

        <section className="panel chart-panel">
          <div className="panel-header">
            <div>
              <h3>Actual vs forecast generation</h3>
              <p>Compare delivered wind generation with the selected day-ahead forecast.</p>
            </div>
            <select
              aria-label="Chart time range"
              value={range}
              onChange={(event) => setRange(event.target.value)}
              className="range-select"
            >
              <option value="1">Last 24 hours</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="all">Full month</option>
            </select>
          </div>

          <div className="chart-legend-note">
            <span><i className="legend-line actual-line" /> Actual generation</span>
            <span><i className="legend-line forecast-line" /> Day-ahead forecast</span>
          </div>

          <div className="chart-area">
            {loading ? (
              <div className="chart-message">Loading generation data…</div>
            ) : chartData.length === 0 ? (
              <div className="chart-message">No matched hourly data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#e9edf3" strokeDasharray="3 3" vertical={false} />
                  <XAxis
  dataKey="startTime"
  tickFormatter={(value) =>
    new Date(value).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "Europe/London",
    })
  }
  interval="preserveStartEnd"
  minTickGap={45}
  tick={{ fill: "#7c8798", fontSize: 11 }}
  axisLine={false}
  tickLine={false}
/>
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: "#7c8798", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                  <Tooltip
                    labelFormatter={(v) => shortTime(v)}
                    formatter={(v, name) => [
                      `${number(v, 1)} MW`,
                      name === "actual" ? "Actual" : "Forecast",
                    ]}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e4e9f0",
                      boxShadow: "0 8px 24px #1c2c4414",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="actual"
                    stroke="#16866b"
                    strokeWidth={2.3}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="forecast"
                    stroke="#5377e8"
                    strokeWidth={2.1}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="chart-footer">
            <span>{number(chartData.length)} matched hourly observations shown</span>
            <span>Units: MW</span>
          </div>
        </section>

        <section className="lower-grid">
          <div className="panel error-panel">
            <div className="panel-header">
              <div>
                <h3>Forecast error</h3>
                <p>Forecast minus actual generation. Positive values indicate over-forecasting.</p>
              </div>
            </div>
            <div className="error-chart">
              {chartData.length === 0 ? (
                <div className="chart-message">Error data will appear when the API loads.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={errorData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="#e9edf3" strokeDasharray="3 3" vertical={false} />
                    <XAxis
  dataKey="startTime"
  tickFormatter={(value) =>
    new Date(value).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "Europe/London",
    })
  }
  interval="preserveStartEnd"
  minTickGap={45}
  tick={{ fill: "#7c8798", fontSize: 11 }}
  axisLine={false}
  tickLine={false}
/>
                    <YAxis
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      tick={{ fill: "#7c8798", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />
                    <Tooltip
                      labelFormatter={shortTime}
                      formatter={(v) => [`${number(v, 1)} MW`, "Forecast error"]}
                    />
                    <ReferenceLine y={0} stroke="#8d98a8" />
                    <Bar dataKey="error" fill="#e9a23b" maxBarSize={9} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="panel latest-panel">
            <div className="panel-header">
              <div>
                <h3>Latest matched hour</h3>
                <p>Most recent observation in the selected range.</p>
              </div>
            </div>
            {latest ? (
              <>
                <div className="latest-date">{shortTime(latest.startTime)} UK time</div>
                <div className="comparison-row">
                  <span>Actual generation</span>
                  <strong>{number(latest.actual)} MW</strong>
                </div>
                <div className="comparison-row">
                  <span>Forecast generation</span>
                  <strong>{number(latest.forecast)} MW</strong>
                </div>
                <div className="latest-error">
                  <span>Forecast error</span>
                  <strong className={latestError > 0 ? "positive" : latestError < 0 ? "negative" : ""}>
                    {latestError > 0 ? "+" : ""}{number(latestError)} MW
                  </strong>
                </div>
              </>
            ) : (
              <div className="chart-message">No latest observation available.</div>
            )}
          </div>
        </section>

        <section className="panel methodology-panel">
          <div className="methodology-title">
            <div className="methodology-icon"><AlertCircle size={19} /></div>
            <div>
              <h3>Methodology & interpretation</h3>
              <p>Read these assumptions alongside the accuracy metrics.</p>
            </div>
          </div>
          <div className="methodology-grid">
            <div>
              <strong>Actual generation</strong>
              <p>Half-hourly WIND records are averaged into hourly values. Both half-hourly records are required for a complete hour.</p>
            </div>
            <div>
              <strong>Forecast selection</strong>
              <p>The latest forecast published on or before 10:00 UK time on the previous day is selected for each delivery hour.</p>
            </div>
            <div>
              <strong>Metric definitions</strong>
              <p>MAE is the mean absolute error; RMSE penalises larger errors; bias is the mean of forecast minus actual.</p>
            </div>
            <div>
              <strong>Decision-cutoff caveat</strong>
              <p>The 10:00 cutoff is a working assumption and should be verified against the applicable market rules before operational use.</p>
            </div>
          </div>
        </section>

        <footer className="page-footer">
          <span>WindScope · UK Wind Forecast Intelligence</span>
          <span>Analysis period: January 2026 · Data source: Elexon BMRS</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
