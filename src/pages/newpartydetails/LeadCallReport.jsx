import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { apiFetch } from "../../api/apiClient";
import { BackToLeadGen } from "./LeadGenReportGuard";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = "/serverphp";

// =========================================================
// DATE HELPERS
// =========================================================

const formatInputDate = (date) => {
  const d = new Date(date);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDate = (value) => {
  if (!value) return "-";

  const [y, m, d] = value.split("-");

  return y && m && d ? `${d}-${m}-${y}` : value;
};

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const quickRanges = () => {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  return [
    { label: "Today", from: today, to: today },
    { label: "This Week", from: monday, to: today },
    {
      label: "This Month",
      from: new Date(today.getFullYear(), today.getMonth(), 1),
      to: today,
    },
    {
      label: "Last Month",
      from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      to: new Date(today.getFullYear(), today.getMonth(), 0),
    },
  ];
};

const STAGE_STYLES = {
  Billed: "bg-green-600 text-white",
  Quoted: "bg-blue-600 text-white",
  Enquiry: "bg-amber-500 text-white",
  Called: "bg-gray-200 text-gray-700",
};

const STATUS_STYLES = {
  Open: "bg-green-600",
  Closed: "bg-red-600",
  "Update Details": "bg-orange-500",
  "Sorry Call": "bg-purple-600",
  "Hidden Party": "bg-blue-800",
  "Do Not Call": "bg-gray-600",
};

const EMPTY_SUMMARY = {
  total_calls: 0,
  leads_called: 0,
  new_leads: 0,
  sorry_calls: 0,
  enquiries: 0,
  quoted: 0,
  billed: 0,
  converted: 0,
  billed_value: 0,
  enquiry_rate: 0,
  conversion_rate: 0,
  avg_calls_per_lead: 0,
};

const LeadCallReport = () => {
  const today = new Date();

  // =========================================================
  // STATES
  // =========================================================

  const [fromDate, setFromDate] = useState(
    formatInputDate(new Date(today.getFullYear(), today.getMonth(), 1))
  );
  const [toDate, setToDate] = useState(formatInputDate(today));
  const [selectedCaller, setSelectedCaller] = useState("all");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [statusBreakdown, setStatusBreakdown] = useState({});
  const [callers, setCallers] = useState([]);
  const [allCallers, setAllCallers] = useState([]);
  const [daily, setDaily] = useState([]);
  const [leads, setLeads] = useState([]);

  const [stageFilter, setStageFilter] = useState("all");
  const [search, setSearch] = useState("");

  // =========================================================
  // LOAD REPORT
  // =========================================================

  const loadReport = async (from = fromDate, to = toDate, caller = selectedCaller) => {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch(`${API}/lead_call_report.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_date: from,
          to_date: to,
          caller,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Failed to load call report");
      }

      setSummary({ ...EMPTY_SUMMARY, ...(result.summary || {}) });
      setStatusBreakdown(result.status_breakdown || {});
      setCallers(Array.isArray(result.callers) ? result.callers : []);
      setDaily(Array.isArray(result.daily) ? result.daily : []);
      setLeads(Array.isArray(result.leads) ? result.leads : []);

      // Keep previously seen names so the dropdown does not shrink
      // when a single caller is selected.
      setAllCallers((prev) =>
        Array.from(
          new Set([...(prev || []), ...(result.all_callers || [])])
        ).sort((a, b) => a.localeCompare(b))
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load call report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyRange = (range) => {
    const from = formatInputDate(range.from);
    const to = formatInputDate(range.to);

    setFromDate(from);
    setToDate(to);
    loadReport(from, to, selectedCaller);
  };

  // =========================================================
  // DERIVED DATA
  // =========================================================

  const maxDailyCalls = useMemo(
    () => Math.max(1, ...daily.map((d) => d.calls)),
    [daily]
  );

  const statusList = useMemo(
    () =>
      Object.entries(statusBreakdown).sort((a, b) => b[1] - a[1]),
    [statusBreakdown]
  );

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();

    return leads.filter((lead) => {
      if (stageFilter !== "all" && lead.stage !== stageFilter) return false;

      if (!q) return true;

      return (
        (lead.party_name || "").toLowerCase().includes(q) ||
        (lead.group_name || "").toLowerCase().includes(q) ||
        (lead.callers || []).join(" ").toLowerCase().includes(q)
      );
    });
  }, [leads, stageFilter, search]);

  const funnel = [
    { label: "Leads Called", value: summary.leads_called, color: "bg-slate-500" },
    { label: "Enquiries", value: summary.enquiries, color: "bg-amber-500" },
    { label: "Quoted", value: summary.quoted, color: "bg-blue-600" },
    { label: "Billed", value: summary.billed, color: "bg-green-600" },
  ];

  // =========================================================
  // DOWNLOADS (EXCEL / PDF)
  // =========================================================

  const fileName = `Lead-Call-Report_${fromDate}_to_${toDate}`;

  const callerLabel =
    selectedCaller === "all" ? "All Callers" : selectedCaller;

  const summaryRows = () => [
    ["Period", `${formatDate(fromDate)} to ${formatDate(toDate)}`],
    ["Caller", callerLabel],
    ["Calls Made", summary.total_calls],
    ["Leads Called", summary.leads_called],
    ["New Leads Added", summary.new_leads],
    ["Avg Calls per Lead", summary.avg_calls_per_lead],
    ["Enquiries", summary.enquiries],
    ["Enquiry %", `${summary.enquiry_rate}%`],
    ["Leads Quoted", summary.quoted],
    ["Leads Billed", summary.billed],
    ["Billed Value", Number(summary.billed_value || 0)],
    ["Conversion %", `${summary.conversion_rate}%`],
    ...(summary.sorry_calls !== null
      ? [["Sorry Calls (caller not recorded)", summary.sorry_calls]]
      : []),
  ];

  const callerHead = [
    "Caller",
    "Calls",
    "Leads Called",
    "Enquiries",
    "Quoted",
    "Billed",
    "Billed Value",
    "Enquiry %",
    "Conversion %",
    "Last Call",
  ];

  const callerRows = () =>
    callers.map((c) => [
      c.caller,
      c.calls,
      c.leads_called,
      c.enquiries,
      c.quoted,
      c.billed,
      Number(c.billed_value || 0),
      `${c.enquiry_rate}%`,
      `${c.conversion_rate}%`,
      formatDate(c.last_call),
    ]);

  const leadHead = [
    "Party",
    "Group",
    "Added By",
    "Lead Added",
    "Called By",
    "Calls",
    "Last Call",
    "Last Status",
    "Enquiry",
    "Stage",
    "First Quotation",
    "First Invoice",
    "Billed Value",
  ];

  const leadRows = () =>
    filteredLeads.map((l) => [
      l.party_name,
      l.group_name || "",
      l.added_by || "",
      formatDate(l.created_at),
      (l.callers || []).join(", "),
      l.calls,
      formatDate(l.last_call),
      l.do_not_call || l.last_status === "Hidden Party"
        ? "Do Not Call"
        : l.last_status || "",
      l.enquired ? "Yes" : "No",
      l.stage,
      l.first_quotation ? formatDate(l.first_quotation) : "",
      l.first_invoice ? formatDate(l.first_invoice) : "",
      Number(l.billed_value || 0),
    ]);

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();

    const addSheet = (name, rows, widths) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet("Summary", [["Lead GEN Call & Conversion Report"], [], ...summaryRows()], [34, 28]);
    addSheet("Caller-wise", [callerHead, ...callerRows()], [20, 8, 12, 10, 8, 8, 14, 10, 12, 12]);
    addSheet(
      "Daily Calls",
      [["Date", "Calls", "Enquiries"], ...daily.map((d) => [formatDate(d.date), d.calls, d.enquiries])],
      [12, 8, 10]
    );
    addSheet("Leads", [leadHead, ...leadRows()], [30, 16, 14, 12, 24, 7, 12, 14, 8, 9, 14, 14, 13]);

    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const downloadPdf = () => {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const money = (v) => `Rs. ${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const headStyles = { fillColor: [29, 78, 216], textColor: 255, fontStyle: "bold" };

    pdf.setFontSize(16);
    pdf.text("Lead GEN Call & Conversion Report", 14, 15);
    pdf.setFontSize(10);
    pdf.text(
      `Period: ${formatDate(fromDate)} to ${formatDate(toDate)}    Caller: ${callerLabel}    Generated: ${formatDate(formatInputDate(new Date()))}`,
      14,
      22
    );

    autoTable(pdf, {
      startY: 27,
      head: [["Summary", "Value"]],
      body: summaryRows().slice(2).map(([k, v]) => [k, k === "Billed Value" ? money(v) : v]),
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles,
      tableWidth: 110,
    });

    autoTable(pdf, {
      startY: pdf.lastAutoTable.finalY + 8,
      head: [callerHead],
      body: callerRows().map((r) => r.map((v, i) => (i === 6 ? money(v) : v))),
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles,
    });

    autoTable(pdf, {
      startY: pdf.lastAutoTable.finalY + 8,
      head: [leadHead],
      body: leadRows().map((r) => r.map((v, i) => (i === 12 ? (v ? money(v) : "-") : v))),
      theme: "grid",
      styles: { fontSize: 7.5 },
      headStyles,
    });

    pdf.save(`${fileName}.pdf`);
  };

  // =========================================================
  // RENDER
  // =========================================================

  const kpis = [
    { label: "Calls Made", value: summary.total_calls, sub: `${summary.avg_calls_per_lead} per lead` },
    { label: "Leads Called", value: summary.leads_called, sub: `${summary.new_leads} new leads added` },
    { label: "Enquiries", value: summary.enquiries, sub: `${summary.enquiry_rate}% of leads called` },
    { label: "Quoted", value: summary.quoted, sub: "leads with a sales order" },
    { label: "Billed", value: summary.billed, sub: formatMoney(summary.billed_value) },
    { label: "Conversion", value: `${summary.conversion_rate}%`, sub: `${summary.converted} leads quoted or billed` },
  ];

  return (
    <div className="min-h-screen bg-blue-100 flex flex-col">
      <Banner />

      <div className="bg-gradient-to-r from-blue-600 to-blue-400 py-3 sm:py-4 px-4 sm:px-6 shadow-md">
        <h1 className="text-white text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-center tracking-wide">
          Lead GEN Call &amp; Conversion Report
        </h1>
      </div>

      <div className="flex-1 p-2 sm:p-4 md:p-6 overflow-x-hidden">
        <div className="max-w-7xl mx-auto space-y-4">
          <BackToLeadGen />

          {/* =================================================
              FILTERS
          ================================================== */}

          <div className="bg-white rounded-xl shadow p-3 sm:p-4">
            <div className="flex flex-col lg:flex-row lg:items-end gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                <label className="text-sm font-medium text-gray-700">
                  From
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm font-medium text-gray-700">
                  To
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm font-medium text-gray-700">
                  Caller
                  <select
                    value={selectedCaller}
                    onChange={(e) => setSelectedCaller(e.target.value)}
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="all">All Callers</option>
                    {allCallers.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => loadReport()}
                  disabled={loading}
                  className="flex-1 lg:flex-none bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white px-5 py-2 rounded text-sm font-semibold"
                >
                  {loading ? "Loading..." : "Show Report"}
                </button>

                <button
                  type="button"
                  onClick={downloadExcel}
                  disabled={loading || (!callers.length && !leads.length)}
                  className="flex-1 lg:flex-none bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-5 py-2 rounded text-sm font-semibold"
                >
                  ⬇ Excel
                </button>

                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={loading || (!callers.length && !leads.length)}
                  className="flex-1 lg:flex-none bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-5 py-2 rounded text-sm font-semibold"
                >
                  ⬇ PDF
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {quickRanges().map((range) => (
                <button
                  key={range.label}
                  type="button"
                  onClick={() => applyRange(range)}
                  className="px-3 py-1 rounded-full border border-blue-300 text-blue-700 text-xs sm:text-sm hover:bg-blue-50"
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* =================================================
              KPI CARDS
          ================================================== */}

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl shadow p-3 sm:p-4">
                <div className="text-xs sm:text-sm text-gray-500 font-medium">
                  {kpi.label}
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-800 mt-1">
                  {kpi.value}
                </div>
                <div className="text-xs text-gray-500 mt-1">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* =================================================
              FUNNEL + STATUS
          ================================================== */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <h2 className="font-semibold text-gray-800 mb-3">Conversion Funnel</h2>

              <div className="space-y-3">
                {funnel.map((step) => {
                  const pct = summary.leads_called
                    ? Math.round((step.value * 100) / summary.leads_called)
                    : 0;

                  return (
                    <div key={step.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{step.label}</span>
                        <span className="font-semibold text-gray-800">
                          {step.value}{" "}
                          <span className="text-gray-500 font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded">
                        <div
                          className={`h-3 rounded ${step.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <h2 className="font-semibold text-gray-800 mb-3">Call Outcome (Status)</h2>

              {statusList.length === 0 ? (
                <p className="text-sm text-gray-500">No calls in this period.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {statusList.map(([status, count]) => (
                    <div
                      key={status}
                      className={`${STATUS_STYLES[status] || "bg-slate-500"} text-white rounded-lg px-3 py-2 text-sm`}
                    >
                      <span className="font-bold text-lg mr-2">{count}</span>
                      {status === "Hidden Party" ? "Do Not Call" : status}
                    </div>
                  ))}
                </div>
              )}

              {summary.sorry_calls !== null && (
                <p className="text-sm text-gray-600 mt-3">
                  Sorry calls logged: <b>{summary.sorry_calls}</b>
                  <span className="text-gray-400"> (caller not recorded)</span>
                </p>
              )}
            </div>
          </div>

          {/* =================================================
              CALLER-WISE TABLE
          ================================================== */}

          <div className="bg-white rounded-xl shadow p-4">
            <h2 className="font-semibold text-gray-800 mb-3">Caller-wise Performance</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border border-gray-200">
                <thead className="bg-blue-50 text-gray-700">
                  <tr>
                    <th className="border p-2 text-left">Caller</th>
                    <th className="border p-2 text-right">Calls</th>
                    <th className="border p-2 text-right">Leads Called</th>
                    <th className="border p-2 text-right">Enquiries</th>
                    <th className="border p-2 text-right">Quoted</th>
                    <th className="border p-2 text-right">Billed</th>
                    <th className="border p-2 text-right">Billed Value</th>
                    <th className="border p-2 text-right">Enquiry %</th>
                    <th className="border p-2 text-right">Conversion %</th>
                    <th className="border p-2 text-left whitespace-nowrap">Last Call</th>
                  </tr>
                </thead>
                <tbody>
                  {callers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="border p-4 text-center text-gray-500">
                        {loading ? "Loading..." : "No calls found for this period."}
                      </td>
                    </tr>
                  ) : (
                    callers.map((c) => (
                      <tr key={c.caller} className="hover:bg-gray-50">
                        <td className="border p-2 font-medium">{c.caller}</td>
                        <td className="border p-2 text-right">{c.calls}</td>
                        <td className="border p-2 text-right">{c.leads_called}</td>
                        <td className="border p-2 text-right">{c.enquiries}</td>
                        <td className="border p-2 text-right">{c.quoted}</td>
                        <td className="border p-2 text-right">{c.billed}</td>
                        <td className="border p-2 text-right whitespace-nowrap">
                          {formatMoney(c.billed_value)}
                        </td>
                        <td className="border p-2 text-right">{c.enquiry_rate}%</td>
                        <td className="border p-2 text-right font-semibold">
                          {c.conversion_rate}%
                        </td>
                        <td className="border p-2 whitespace-nowrap">
                          {formatDate(c.last_call)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* =================================================
              DAILY CALLS
          ================================================== */}

          <div className="bg-white rounded-xl shadow p-4">
            <h2 className="font-semibold text-gray-800 mb-3">Daily Calls</h2>

            {daily.length === 0 ? (
              <p className="text-sm text-gray-500">No calls in this period.</p>
            ) : (
              <div className="space-y-1.5">
                {daily.map((d) => (
                  <div key={d.date} className="flex items-center gap-2 text-xs sm:text-sm">
                    <span className="w-20 sm:w-24 shrink-0 text-gray-600">
                      {formatDate(d.date)}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 rounded">
                      <div
                        className="h-4 bg-blue-500 rounded"
                        style={{ width: `${(d.calls * 100) / maxDailyCalls}%` }}
                      />
                    </div>
                    <span className="w-24 sm:w-32 shrink-0 text-right text-gray-700">
                      <b>{d.calls}</b> calls
                      {d.enquiries > 0 && (
                        <span className="text-amber-600"> · {d.enquiries} enq</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* =================================================
              LEAD DETAIL
          ================================================== */}

          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h2 className="font-semibold text-gray-800">
                Leads Called ({filteredLeads.length})
              </h2>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search party / group / caller"
                  className="border rounded px-3 py-1.5 text-sm"
                />
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm"
                >
                  <option value="all">All Stages</option>
                  <option value="Billed">Billed</option>
                  <option value="Quoted">Quoted</option>
                  <option value="Enquiry">Enquiry</option>
                  <option value="Called">Called only</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-xs sm:text-sm border border-gray-200">
                <thead className="bg-blue-50 text-gray-700 sticky top-0">
                  <tr>
                    <th className="border p-2 text-left">Party</th>
                    <th className="border p-2 text-left">Group</th>
                    <th className="border p-2 text-left">Called By</th>
                    <th className="border p-2 text-right">Calls</th>
                    <th className="border p-2 text-left whitespace-nowrap">Last Call</th>
                    <th className="border p-2 text-left">Last Status</th>
                    <th className="border p-2 text-left">Stage</th>
                    <th className="border p-2 text-left whitespace-nowrap">Quotation</th>
                    <th className="border p-2 text-left whitespace-nowrap">Invoice</th>
                    <th className="border p-2 text-right whitespace-nowrap">Billed Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="border p-4 text-center text-gray-500">
                        No leads to show.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="border p-2 font-medium">
                          {lead.party_name}
                          <div className="text-[11px] text-gray-500 font-normal">
                            Added {formatDate(lead.created_at)}
                            {lead.added_by ? ` by ${lead.added_by}` : ""}
                          </div>
                        </td>
                        <td className="border p-2">{lead.group_name || "-"}</td>
                        <td className="border p-2">{(lead.callers || []).join(", ")}</td>
                        <td className="border p-2 text-right">{lead.calls}</td>
                        <td className="border p-2 whitespace-nowrap">
                          {formatDate(lead.last_call)}
                        </td>
                        <td className="border p-2 whitespace-nowrap">
                          {lead.do_not_call
                            ? "Do Not Call"
                            : lead.last_status === "Hidden Party"
                              ? "Do Not Call"
                              : lead.last_status || "-"}
                        </td>
                        <td className="border p-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${STAGE_STYLES[lead.stage]}`}
                          >
                            {lead.stage}
                          </span>
                        </td>
                        <td className="border p-2 whitespace-nowrap">
                          {lead.quotations
                            ? `${lead.quotations} · ${formatDate(lead.first_quotation)}`
                            : "-"}
                        </td>
                        <td className="border p-2 whitespace-nowrap">
                          {lead.invoices
                            ? `${lead.invoices} · ${formatDate(lead.first_invoice)}`
                            : "-"}
                        </td>
                        <td className="border p-2 text-right whitespace-nowrap">
                          {lead.billed_value ? formatMoney(lead.billed_value) : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Calls = notes saved on New Lead GEN parties. Enquiry = call saved
              with "Enquiry: Yes". Quoted / Billed = the lead has a sales order /
              GST sales invoice in Tally dated on or after the day the lead was
              added. Conversion % = leads quoted or billed ÷ leads called.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadCallReport;
