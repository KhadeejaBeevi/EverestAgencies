import React, { useEffect, useState } from "react";
import { apiFetch } from "../../../api/apiClient";
import Banner from "../../Banner/Banner.jsx";
import "./TelecallerReport.css";


const API = "/serverphp";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};


const amt = v => "₹ " + Number(v || 0).toLocaleString("en-IN", {
  maximumFractionDigits: 2
});

const num = v => {
  const n = Number(v);
  return n === 0 ? "" : n;
};

const pct = v => {
  const n = Number(v);
  return n === 0 ? "" : `${n}%`;
};

const displayAmt = v => Number(v || 0) === 0 ? "" : amt(v);


const fm = v => {
  if (!v || v === "Unknown") return v || "-";
  const [y, m] = v.split("-");
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric"
  });
};


const fd = v => v
  ? new Date(v + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
  : "-";

  
function Card({ label, value, small }) {
  return (
    <div className="tc-kpi">
      <div>{label}</div>
      <strong>{value}</strong>
      {small && <small>{small}</small>}
    </div>
  );
}


function Bars({ data = [] }) {
  const max = Math.max(...data.map(x => Number(x.value) || 0), 1);

  return (
    <div className="tc-normal-bars">
      {data.map((x, i) => {
        const value = Number(x.value) || 0;
        const height = value === 0 ? 0 : Math.max((value / max) * 100, 4);

        return (
          <div className="tc-normal-bar-item" key={i}>
            <div className="tc-normal-value">{value === 0 ? "" : value}</div>
            <div className="tc-normal-bar-area">
              <div
                className="tc-normal-bar"
                style={{ height: `${height}%` }}
              />
            </div>
            <div className="tc-normal-label">{x.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function MonthDetails({ person, period }) {
  const origins = person.sales_origin || [];
  const billing = person.billing_months || [];

  if (!origins.length && !billing.length) return null;

  return (
    <div className="tc-month-details">
      <div className="tc-month-box">
        <h4>{period === "week" ? "Quotation / Conversion Details" : "Quotation Origin"}</h4>
        <div className="tc-month-list">
          {origins.map((x, i) => (
            <div className="tc-month-row" key={i}>
              <span>{fm(x.month)}</span>
              <b>{num(x.count)}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="tc-month-box">
        <h4>{period === "week" ? "Billing Details" : "Billing Period"}</h4>
        <div className="tc-month-list">
          {billing.map((x, i) => (
            <div className="tc-month-row" key={i}>
              <span>{fm(x.month)}</span>
              <b>{num(x.count)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const filterStyles = `
  .tc-filter { display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap; }
  .tc-filter-field { display:flex; flex-direction:column; gap:4px; }
  .tc-filter-field label { font-size:10px; font-weight:800; letter-spacing:.08em; color:#64748b; }
  .tc-filter-field select { min-width:120px; }
  .tc-refresh-btn { min-height:38px; }
  .tc-selected-period { margin-top:14px; }
  .tc-period-range { margin-top:5px; font-size:12px; color:#64748b; font-weight:600; }

  .tc-kpi {
    min-width: 200px;
    min-height: 112px;
    padding: 18px 20px;
    overflow: visible;
  }

  .tc-kpis {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
  }

  .tc-kpi strong {
    display: block;
    white-space: nowrap;
    word-break: keep-all;
    overflow-wrap: normal;
    font-size: clamp(18px, 1.5vw, 29px);
    line-height: 1.15;
    margin-top: 8px;
    letter-spacing: -0.02em;
  }

  .tc-overall-stats b {
    display: inline-block;
    white-space: nowrap;
  }

  .tc-scroll th,
  .tc-scroll td {
    vertical-align: middle;
  }

  .tc-final-table th:nth-child(5),
  .tc-final-table td:nth-child(5) {
    min-width: 160px;
    white-space: nowrap;
    text-align: right;
  }
`;

export default function TelecallerReport() {
  const now = new Date();
  const [period, setPeriod] = useState("month");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [week, setWeek] = useState(String(Math.ceil(now.getDate() / 7)));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (
    selectedPeriod = period,
    selectedYear = year,
    selectedMonth = month,
    selectedWeek = week
  ) => {
    setLoading(true);
    setError("");

    try {
      const r = await apiFetch(`${API}/telecaller_report.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_mode: selectedPeriod,
          year: selectedYear,
          month: selectedMonth,
          week: selectedWeek
        })
      });

      const j = await r.json();

      if (!r.ok || !j.success) {
        throw new Error(j.message || `HTTP ${r.status}`);
      }

      setReport(j);
    } catch (e) {
      setError(e.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(period, year, month, week);
  }, [period]);

  const handleYearChange = e => {
    const value = e.target.value;
    setYear(value);
    load(period, value, month, week);
  };

  const handleMonthChange = e => {
    const value = e.target.value;
    const daysInMonth = new Date(Number(year), Number(value), 0).getDate();
    const weekCount = Math.ceil(daysInMonth / 7);
    const nextWeek = String(Math.min(Number(week) || 1, weekCount));

    setMonth(value);
    setWeek(nextWeek);
    load(period, year, value, nextWeek);
  };

  const handleWeekChange = e => {
    const value = e.target.value;
    setWeek(value);
    load("week", year, month, value);
  };

  const s = report?.summary || {};
  const people = report?.persons || [];
  const without = report?.without_credit_bills || [];
  const broughtAndBilled = report?.brought_and_billed || [];

  // Month-wise conversion data is built from the conversion records already
  // returned by the existing API. No PHP/API change is required.
  const monthWiseConversions = (() => {
    const map = {};

    people.forEach(p => {
      (p.conversions || []).forEach(c => {
        const month = c.billing_month || c.quotation_month || "Unknown";
        if (!map[month]) {
          map[month] = { month, quotations: 0, converted: 0, withoutFollowup: 0 };
        }
        map[month].converted += 1;
      });
    });

    without.forEach(x => {
      const month = x.invoice_date
        ? x.invoice_date.slice(0, 7)
        : "Unknown";

      if (!map[month]) {
        map[month] = { month, quotations: 0, converted: 0, withoutFollowup: 0 };
      }
      map[month].withoutFollowup += 1;
    });

    people.forEach(p => {
      (p.sales_origin || []).forEach(x => {
        const month = x.month || "Unknown";
        if (!map[month]) {
          map[month] = { month, quotations: 0, converted: 0, withoutFollowup: 0 };
        }
        map[month].quotations += Number(x.count || 0);
      });
    });

    return Object.values(map).sort((a, b) => {
      if (a.month === "Unknown") return 1;
      if (b.month === "Unknown") return -1;
      return String(a.month).localeCompare(String(b.month));
    });
  })();

  return (
    <>
      <style>{filterStyles}</style>
      <Banner />
      <div className="tc-page">

      <div className="tc-head">
        <div>
          <div className="tc-eyebrow">SALES OPERATIONS</div>
          <h1>Sales Coordinator Sales Scorecard</h1>
          <p>
            Sales report based on quotation ownership, follow-up activity, conversion and billed revenue.
          </p>
        </div>

        <div className="tc-filter">
          <div className="tc-filter-field">
            <label>REPORT TYPE</label>
            <select
              value={period}
              onChange={e => {
                const value = e.target.value;
                setPeriod(value);
                load(value, year, month, week);
              }}
            >
              <option value="year">Year</option>
              <option value="month">Month</option>
              <option value="week">Week</option>
            </select>
          </div>

          <div className="tc-filter-field">
            <label>YEAR</label>
            <select value={year} onChange={handleYearChange}>
              {Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i)).map(y =>
                <option key={y} value={y}>{y}</option>
              )}
            </select>
          </div>

          {(period === "month" || period === "week") && (
            <div className="tc-filter-field">
              <label>MONTH</label>
              <select value={month} onChange={handleMonthChange}>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = String(i + 1).padStart(2, "0");
                  return (
                    <option key={m} value={m}>
                      {new Date(2000, i, 1).toLocaleDateString("en-IN", { month: "long" })}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {period === "week" && (
            <div className="tc-filter-field">
              <label>WEEK</label>
              <select value={week} onChange={handleWeekChange}>
                {(() => {
                  const daysInMonth = new Date(
                    Number(year),
                    Number(month),
                    0
                  ).getDate();

                  const weekCount = Math.ceil(daysInMonth / 7);

                  return Array.from({ length: weekCount }, (_, i) => {
                    const weekNo = String(i + 1);
                    const startDay = i * 7 + 1;
                    const endDay = Math.min((i + 1) * 7, daysInMonth);

                    return (
                      <option key={weekNo} value={weekNo}>
                        Week {weekNo} ({startDay}-{endDay})
                      </option>
                    );
                  });
                })()}
              </select>
            </div>
          )}

          <button
            className="tc-refresh-btn"
            onClick={() => load(period, year, month, week)}
          >
            {loading ? "Loading..." : "Refresh Report"}
          </button>
        </div>
      </div>

      {error && <div className="tc-error">{error}</div>}

      <div className="tc-month tc-selected-period">
        <div>
          <span>REPORT PERIOD</span>
          <b>
            {period === "year"
              ? `Year ${year}`
              : period === "month"
                ? new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric"
                  })
                : `Week ${week} — ${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric"
                  })}`}
          </b>

          <div className="tc-period-range">
            {report?.period_start && report?.period_end
              ? `${new Date(report.period_start + "T00:00:00").toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric"
                })} → ${new Date(report.period_end + "T00:00:00").toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric"
                })}`
              : period === "year"
                ? `01 Jan ${year} → 31 Dec ${year}`
                : period === "month"
                  ? `01 ${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", { month: "short" })} ${year} → ${new Date(Number(year), Number(month), 0).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                  : `Week ${week} of ${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`}
          </div>
        </div>

        <small style={{fontSize:"11px", color:"#3b82f6", fontWeight:700}}>
          {loading
            ? "Updating report…"
            : period === "year"
              ? "Full-year performance"
              : period === "month"
                ? "Monthly performance"
                : "Weekly performance"}
        </small>
      </div>

      <div className="tc-kpis">
        <Card label="Total Billed Value" value={displayAmt(s.total_billed_value)} />
        <Card label="Coordinator Sales" value={displayAmt(s.coordinator_sales_value)} />
        <Card label="Brought & Billed" value={displayAmt(s.brought_and_billed_value)} />
        <Card label="Without Coordinator Credit" value={displayAmt(s.without_coordinator_credit_value)} />
        <Card label="Billed Quotations" value={num(s.total_billed_quotations)} />
        <Card label="Coordinator Conversions" value={num(s.billed_quotations)} />
        <Card label="Conversion Rate" value={pct(s.overall_success_percentage)} />
      </div>

      <section className="tc-panel" style={{marginBottom:16}}>
        <div className="tc-section-title">
          <div>
            <h2>Sales Attribution Reconciliation</h2>
            <p className="tc-note">Every billed quotation is placed into exactly one bucket.</p>
          </div>
          <div className="tc-overall-stats">
            <div><span>Coordinator Sales</span><b>{displayAmt(s.coordinator_sales_value)}</b></div>
            <div><span>Brought & Billed</span><b>{displayAmt(s.brought_and_billed_value)}</b></div>
            <div><span>Without Credit</span><b>{displayAmt(s.without_coordinator_credit_value)}</b></div>
            <div><span>Difference</span><b>{displayAmt(s.reconciliation_difference)}</b></div>
          </div>
        </div>
        <div className="tc-note" style={{marginTop:10}}>
          Total Billed = Coordinator Sales + Brought & Billed + Without Coordinator Credit.
        </div>
      </section>

      <section className="tc-panel tc-overall-panel">
        <div className="tc-section-title">
          <div>
            <h2>{period === "week" ? "Quotation Conversion — Selected Week" : period === "year" ? "Quotation Conversion — Yearly Trend" : "Quotation Conversion — Monthly Trend"}</h2>
            <p className="tc-note">
              {period === "week" ? "Quotation origin, successful conversions and billed quotations for the selected week." : "Quotation origin, successful conversions and billed quotations without eligible follow-up."}
            </p>
          </div>

          <div className="tc-overall-stats">
            <div>
              <span>Total Quotations</span>
              <b>{num(s.total_quotations || people.reduce((n, p) => n + Number(p.unique_quotations || 0), 0))}</b>
            </div>
            <div>
              <span>Conversions</span>
              <b>{num(s.billed_quotations)}</b>
            </div>
            <div>
              <span>No Follow-up</span>
              <b>{num(s.billed_without_followup)}</b>
            </div>
          </div>
        </div>

        {monthWiseConversions.length > 0 ? (
          <div className="tc-month-conversion-chart">
            {monthWiseConversions.map((x, i) => {
              const max = Math.max(
                ...monthWiseConversions.map(m =>
                  Math.max(Number(m.quotations) || 0, Number(m.converted) || 0)
                ),
                1
              );

              const q = Number(x.quotations) || 0;
              const c = Number(x.converted) || 0;

              return (
                <div className="tc-month-chart-item" key={i}>
                  <div className="tc-month-chart-values">
                    <b>{q || ""}</b>
                    <b>{c || ""}</b>
                  </div>

                  <div className="tc-month-chart-bars">
                    <div
                      className="tc-month-chart-bar quotation"
                      style={{ height: q ? `${Math.max((q / max) * 100, 4)}%` : "0%" }}
                      title={`Quotations: ${q}`}
                    />
                    <div
                      className="tc-month-chart-bar converted"
                      style={{ height: c ? `${Math.max((c / max) * 100, 4)}%` : "0%" }}
                      title={`Conversions: ${c}`}
                    />
                  </div>

                  <div className="tc-month-chart-label">{fm(x.month)}</div>
                  <div className="tc-month-chart-detail">
                    <span>Q: <b>{q}</b></span>
                    <span>C: <b>{c}</b></span>
                    {x.withoutFollowup > 0 && (
                      <span>WF: <b>{x.withoutFollowup}</b></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="tc-empty-months">{period === "week" ? "No conversion data available for the selected week." : "No period conversion data available."}</div>
        )}

        <div className="tc-chart-legend">
          <span><i className="legend-quotation" /> Quotations</span>
          <span><i className="legend-converted" /> Conversions</span>
          <span>WF = No Follow-up</span>
        </div>
      </section>



      <section className="tc-panel">
        <h2>Coordinator Incentive Scorecard</h2>

        <div className="tc-scroll">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Sales Coordinator</th>
                <th>Brought</th>
                <th>Assigned</th>
                <th>Responsibility</th>
                <th>Calls</th>
                <th>Followed</th>
                <th>Coordinator Sales</th>
                <th>Brought & Billed</th>
                <th>Total Billed Sales</th>
                <th>Conversion Rate</th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => {
                const totalBilledSales = Number(p.coordinator_sales_value || 0) + Number(p.brought_and_billed_value || 0);
                return (
                  <tr key={p.telecaller}>
                    <td>#{p.rank}</td>
                    <td><b>{p.telecaller}</b></td>
                    <td>{num(p.brought_quotations)}</td>
                    <td>{num(p.assigned_quotations)}</td>
                    <td>{num(p.responsible_quotations)}</td>
                    <td>{num(p.calls)}</td>
                    <td>{num(p.unique_quotations)}</td>
                    <td>{displayAmt(p.coordinator_sales_value)}</td>
                    <td>{displayAmt(p.brought_and_billed_value)}</td>
                    <td><b>{displayAmt(totalBilledSales)}</b></td>
                    <td><b>{pct(p.success_percentage)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="tc-people-grid">
      {people.map(p => (
        <section className="tc-person" key={p.telecaller}>

          <div className="tc-person-head">
            <div>
              <span>RANK #{p.rank}</span>
              <h2>{p.telecaller}</h2>
            </div>

            <div className="tc-success">
              <small>SUCCESS RATE</small>
              <b>{pct(p.success_percentage)}</b>
              
            </div>
          </div>

          <div className="tc-kpis person-kpis">
            <Card label="Brought" value={num(p.brought_quotations)} />
            <Card label="Assigned" value={num(p.assigned_quotations)} />
            <Card label="Responsibility" value={num(p.responsible_quotations)} />
            <Card label="Follow-up Calls" value={num(p.calls)} />
            <Card label="Unique Followed" value={num(p.unique_quotations)} />
            <Card label="Coordinator Sales" value={displayAmt(p.coordinator_sales_value)} />
            <Card label="Brought & Billed" value={displayAmt(p.brought_and_billed_value)} />
            <Card label="Total Billed Sales" value={displayAmt(Number(p.coordinator_sales_value || 0) + Number(p.brought_and_billed_value || 0))} />
            <Card label="Lost" value={num(p.lost_quotations)} />
            <Card label="Pending" value={num(p.pending_quotations)} />
          </div>

          <div className="tc-performance-row">
            <div className="tc-chart-card tc-activity-card">
              <h3>Activity Overview</h3>
              <Bars
                data={[
                  { label: "Calls", value: p.calls },
                  { label: "Billed", value: p.billed_quotations },
                  { label: "Lost Quotations", value: p.lost_quotations },
                  { label: "Pending Quotations", value: p.pending_quotations }
                ]}
              />
            </div>

            <MonthDetails person={p} period={period} />
          </div>


        </section>
      ))}
      </div>

      <section className="tc-panel">
        <h2>Brought & Billed</h2>
        <p className="tc-note">These quotations were brought by a coordinator and billed, but had no qualifying coordinator effort before billing.</p>
        <div className="tc-scroll tc-final-table">
          <table>
            <thead>
              <tr>
                <th>Quotation</th><th>Party</th><th>Invoice Date</th><th>Invoice</th><th>Value</th><th>Brought By</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {broughtAndBilled.map((x, i) => (
                <tr key={i}>
                  <td>{x.quotation_no}</td><td>{x.party_name}</td><td>{fd(x.invoice_date)}</td><td>{x.invoice_no}</td>
                  <td>{displayAmt(x.billed_amount)}</td><td>{x.brought_by || "-"}</td><td>{x.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tc-panel">
        <h2>Billed Without Coordinator Credit</h2>
        <p className="tc-note">These quotations were billed, but no coordinator receives sales/incentive credit. The Value column is the source for the overall Without Coordinator Credit amount.</p>
        <div className="tc-scroll tc-final-table">
          <table>
            <thead>
              <tr>
                <th>Quotation</th><th>Party</th><th>Invoice Date</th><th>Invoice</th><th>Value</th><th>Attribution</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {without.map((x, i) => (
                <tr key={i}>
                  <td>{x.quotation_no}</td><td>{x.party_name}</td><td>{fd(x.invoice_date)}</td><td>{x.invoice_no}</td>
                  <td>{displayAmt(x.billed_amount)}</td><td>{x.attribution}</td><td>{x.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
    </>
  );
}
