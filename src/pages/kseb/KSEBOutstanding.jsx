import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { apiFetch } from "../../api/apiClient";

import * as XLSX from "xlsx";

const API = "/serverphp";

/*
  KSEB Outstanding

  1. Donut (left)      : pending balance by distribution.
  2. Ledger list       : click a distribution to list its ledgers (areas).
  3. Ledger report     : click a ledger for a Tally style ledger display —
                         transactions with running balance, ledger summary,
                         pending bills and ageing analysis.
                         "Detailed" (or a click on a row) explodes the
                         voucher like Tally: its other ledgers and the bill
                         allocations of this ledger.
*/

// =========================================================
// HELPERS
// =========================================================

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatInputDate = (date) => {
    const d = new Date(date);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
};

const financialYearStart = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

    return `${year}-04-01`;
};

const formatAmount = (value) =>
    "₹" +
    Number(value || 0).toLocaleString("en-IN", {
        maximumFractionDigits: 0,
    });

// Tally style: 4,93,830.00
const formatTally = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const formatDrCr = (value) =>
    `${formatTally(Math.abs(value))} ${value < 0 ? "Cr" : "Dr"}`;

// Tally style: 16-Apr-26
const formatTallyDate = (value) => {
    if (!value) return "";

    const [y, m, d] = String(value).split("-");

    return y && m && d ? `${Number(d)}-${MONTHS[Number(m) - 1]}-${y.slice(2)}` : value;
};

const formatCompact = (value) => {
    const amount = Number(value || 0);

    if (Math.abs(amount) >= 10000000) return `₹${(amount / 10000000).toFixed(1)} Cr`;
    if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(1)} L`;
    if (Math.abs(amount) >= 1000) return `₹${(amount / 1000).toFixed(1)} K`;

    return `₹${Math.round(amount)}`;
};

const daysBetween = (from, to) => {
    if (!from || !to) return 0;

    return Math.round((new Date(to) - new Date(from)) / 86400000);
};

const isPending = (b) => b.status === "pending" || b.status === "part";

// Same ledger name match as the server (case / extra spaces ignored).
const ledgerKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

const DONUT_COLORS = [
    "#F59E0B", "#16A34A", "#2563EB", "#DC2626",
    "#9333EA", "#0891B2", "#7C3AED", "#CA8A04",
];

// Same slabs as Tally's Ageing Analysis.
const AGEING_SLABS = [
    { label: "< 30 days", max: 30 },
    { label: "30 - 60 days", max: 60 },
    { label: "60 - 90 days", max: 90 },
    { label: "90 - 120 days", max: 120 },
    { label: "120 - 180 days", max: 180 },
    { label: "180 - 270 days", max: 270 },
    { label: "270 - 365 days", max: 365 },
    { label: "365 - 730 days", max: 730 },
    { label: "> 730 days", max: Infinity },
];

const slabIndex = (days) => AGEING_SLABS.findIndex((s) => days < s.max);

// =========================================================
// STYLES
// =========================================================

const cardStyle = {
    background: "#FFFFFF",
    borderRadius: "12px",
    padding: "14px 16px",
    boxShadow: "0 1px 4px rgba(15,23,42,0.08)",
    border: "1px solid #E2E8F0",
};

const labelStyle = {
    color: "#64748B",
    fontSize: "11px",
    fontWeight: "800",
    letterSpacing: "0.5px",
};

const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid #CBD5E1",
    fontSize: "13px",
    background: "#FFFFFF",
    color: "#1F2937",
    boxSizing: "border-box",
};

const thStyle = {
    padding: "10px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: "800",
    color: "#FFFFFF",
    background: "#123B6D",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
};

const thRight = { ...thStyle, textAlign: "right" };

const tdStyle = {
    padding: "9px 10px",
    fontSize: "13px",
    borderBottom: "1px solid #E2E8F0",
    verticalAlign: "top",
};

const tdRight = {
    ...tdStyle,
    textAlign: "right",
    whiteSpace: "nowrap",
};

const buttonStyle = (active) => ({
    padding: "8px 14px",
    borderRadius: "8px",
    border: active ? "1px solid #123B6D" : "1px solid #CBD5E1",
    background: active ? "#123B6D" : "#FFFFFF",
    color: active ? "#FFFFFF" : "#1F2937",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
});

const linkStyle = {
    border: "none",
    background: "none",
    padding: 0,
    color: "#1D4ED8",
    cursor: "pointer",
    fontSize: "13px",
};

const emptyStyle = {
    padding: "30px",
    textAlign: "center",
    color: "#64748B",
};

// Tally ledger display styles
const tHead = {
    padding: "4px 8px",
    fontSize: "12px",
    fontWeight: "600",
    color: "#1F2937",
    borderBottom: "1px solid #94A3B8",
    textAlign: "left",
    whiteSpace: "nowrap",
    background: "#FFFFFF",
};

const tHeadRight = { ...tHead, textAlign: "right" };

const tCell = {
    padding: "2px 8px",
    fontSize: "12.5px",
    whiteSpace: "nowrap",
};

const tCellRight = { ...tCell, textAlign: "right" };

const tSection = {
    fontSize: "13px",
    fontWeight: "800",
    letterSpacing: "3px",
    color: "#0B2545",
};

const tBox = {
    display: "inline-block",
    minWidth: "160px",
    padding: "1px 8px",
    border: "1px solid #CBD5E1",
    fontWeight: "700",
};

// Exploded voucher lines (under a ledger row)
const tDetail = {
    padding: "0 8px",
    fontSize: "12px",
    whiteSpace: "nowrap",
};

const tDetailRight = { ...tDetail, textAlign: "right" };

// =========================================================
// DONUT
// =========================================================

// Pending balance per distribution. Click a slice / row to select it.
const DistributionDonut = ({ data, selected, onSelect }) => {
    const total = data.reduce((t, d) => t + d.value, 0);
    const size = 220;
    const center = size / 2;
    const radius = 78;
    const innerRadius = 44;

    if (!total) {
        return <div style={{ ...emptyStyle, padding: "40px 10px" }}>No pending outstanding.</div>;
    }

    let cursor = -Math.PI / 2;

    const slices = data.map((item) => {
        const fraction = item.value / total;
        // A single full slice cannot be drawn as one arc, so stop just short.
        const angle = Math.min(fraction * Math.PI * 2, Math.PI * 2 - 0.0001);
        const start = cursor;
        const end = cursor + angle;

        cursor = start + fraction * Math.PI * 2;

        const point = (r, a) => `${center + r * Math.cos(a)} ${center + r * Math.sin(a)}`;
        const largeArc = angle > Math.PI ? 1 : 0;

        return {
            ...item,
            percentage: (fraction * 100).toFixed(2),
            d: [
                `M ${point(radius, start)}`,
                `A ${radius} ${radius} 0 ${largeArc} 1 ${point(radius, end)}`,
                `L ${point(innerRadius, end)}`,
                `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${point(innerRadius, start)}`,
                "Z",
            ].join(" "),
        };
    });

    const isAll = selected === "all";
    const selectedValue = isAll ? total : data.find((d) => d.name === selected)?.value || 0;
    // "DISTRIBUTION SOUTH" -> "SOUTH" so it fits inside the ring.
    const centerLabel = isAll ? "Overall" : selected.replace(/^DISTRIBUTION\s+/i, "").slice(0, 12);

    return (
        <div style={{ display: "grid", gap: "12px", justifyItems: "center" }}>
            <div style={{ width: size, height: size, maxWidth: "100%" }}>
                <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
                    {slices.map((item) => (
                        <path
                            key={item.name}
                            d={item.d}
                            fill={item.fill}
                            stroke="#FFFFFF"
                            strokeWidth={3}
                            opacity={isAll || selected === item.name ? 1 : 0.32}
                            style={{ cursor: "pointer", transition: "opacity .18s ease" }}
                            onClick={() => onSelect(item.name)}
                        >
                            <title>
                                {item.name}: {formatAmount(item.value)} ({item.percentage}%)
                            </title>
                        </path>
                    ))}

                    <text x={center} y={center - 8} textAnchor="middle" fontSize="12" fill="#64748B">
                        {centerLabel}
                    </text>
                    <text x={center} y={center + 18} textAnchor="middle" fontSize="18" fontWeight="800" fill="#0B2545">
                        {formatCompact(selectedValue)}
                    </text>
                </svg>
            </div>

            <div style={{ display: "grid", gap: "10px", width: "100%" }}>
                {slices.map((item) => {
                    const active = selected === item.name;

                    return (
                        <button
                            key={item.name}
                            type="button"
                            onClick={() => onSelect(item.name)}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "12px 1fr auto",
                                gap: "10px",
                                alignItems: "center",
                                border: active ? "1px solid #BFDBFE" : "1px solid #E2E8F0",
                                background: active ? "#EFF6FF" : "#FFFFFF",
                                borderRadius: "10px",
                                padding: "10px 12px",
                                cursor: "pointer",
                                textAlign: "left",
                            }}
                        >
                            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: item.fill }} />
                            <span>
                                <strong style={{ fontSize: "13px" }}>{item.name}</strong>
                                <span style={{ display: "block", color: "#64748B", fontSize: "12px", marginTop: "2px" }}>
                                    {formatAmount(item.value)} • {item.ledgers} ledgers
                                </span>
                            </span>
                            <strong style={{ fontSize: "13px" }}>{item.percentage}%</strong>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// =========================================================
// VOUCHER DETAILS (Tally "explode")
// =========================================================

/*
  The voucher's other ledgers and this ledger's bill allocations, like
  Tally's detailed ledger view. Lines the Tally export does not carry
  (bank / TDS / round off on receipts, the sales ledger and GST on
  sales) are worked out by the server and shown in grey italics.
*/
const VoucherDetails = ({ detail }) => (
    <table style={{ borderCollapse: "collapse", margin: "0 0 6px 0" }}>
        <tbody>
            {detail.others.map((l, i) => (
                <tr key={`l${i}`}>
                    <td
                        style={{
                            ...tDetail,
                            paddingLeft: "24px",
                            fontWeight: l.derived ? "400" : "600",
                            fontStyle: l.derived ? "italic" : "normal",
                            color: l.derived ? "#64748B" : "#1F2937",
                        }}
                        title={l.derived ? "Not in the Tally export - worked out from the voucher total" : ""}
                    >
                        {l.ledger}
                    </td>
                    <td colSpan={3} />
                    <td style={{ ...tDetailRight, color: l.derived ? "#64748B" : "#1F2937" }}>
                        {formatTally(l.amount)} {l.dr_cr}
                    </td>
                </tr>
            ))}

            {detail.allocations.map((a, i) => (
                <tr key={`a${i}`}>
                    <td style={{ ...tDetail, paddingLeft: "8px" }}>
                        {a.bill_type}
                        <span style={{ marginLeft: "8px", fontSize: "11px" }}>{a.bill_ref}</span>
                    </td>
                    <td style={tDetailRight}>{a.credit_days ? `${a.credit_days} Days` : ""}</td>
                    <td style={tDetailRight}>
                        {formatTally(a.amount)} {a.dr_cr}
                    </td>
                    <td colSpan={2} />
                </tr>
            ))}
        </tbody>
    </table>
);

// =========================================================
// LEDGER REPORT (Tally Bird-Eye-View style)
// =========================================================

const LedgerReport = ({ ledger, vouchers, fromDate, asOf }) => {
    // Detailed = every voucher exploded (Tally Alt+F5). A click on a row
    // flips just that row.
    const [detailed, setDetailed] = useState(false);
    const [toggled, setToggled] = useState(() => new Set());

    const toggleRow = (key) =>
        setToggled((prev) => {
            const next = new Set(prev);

            if (next.has(key)) next.delete(key);
            else next.add(key);

            return next;
        });

    const switchMode = () => {
        setDetailed((d) => !d);
        setToggled(new Set());
    };

    const report = useMemo(() => {
        const entries = [];

        ledger.bills.forEach((b) => {
            // The bill's own voucher line, if the data includes it.
            const isBillLine = (l) =>
                l.amount > 0 &&
                ((l.voucher_no && l.voucher_no === b.voucher_no) ||
                    (l.date === b.bill_date && Math.abs(l.amount - b.bill_amount) < 1));

            const billLine = (b.lines || []).find(isBillLine);
            // Actual Tally voucher type (e.g. "GST Sales B2B"), not a fixed "Sales".
            const voucherType = b.voucher_type || billLine?.voucher_type || "Sales";

            entries.push({
                date: b.bill_date,
                particulars:
                    b.particulars || b.sales_ledger || billLine?.particulars || billLine?.ledger || voucherType,
                voucher_type: voucherType,
                voucher_no: b.voucher_no || b.bill_ref,
                sales_id: billLine?.sales_id || "",
                debit: b.bill_amount,
                credit: 0,
                order: 0,
            });

            (b.lines || []).forEach((l) => {
                // Skip the bill's own line, it is already listed above.
                if (isBillLine(l)) return;

                entries.push({
                    date: l.date,
                    particulars: `Agst Ref ${b.bill_ref}`,
                    narration: l.narration,
                    voucher_type: l.voucher_type,
                    voucher_no: l.voucher_no,
                    sales_id: l.sales_id || "",
                    debit: l.amount > 0 ? l.amount : 0,
                    credit: l.amount < 0 ? -l.amount : 0,
                    order: 1,
                });
            });
        });

        // Lines before the period are already inside the opening balance.
        const inPeriod = (date) => !date || String(date) >= fromDate;

        ledger.onAccountLines.filter((l) => inPeriod(l.date)).forEach((l) => {
            entries.push({
                date: l.date,
                particulars: "On Account",
                narration: l.narration,
                voucher_type: l.voucher_type,
                voucher_no: l.voucher_no,
                sales_id: l.sales_id || "",
                debit: l.amount > 0 ? l.amount : 0,
                credit: l.amount < 0 ? -l.amount : 0,
                order: 1,
            });
        });

        ledger.older.filter((r) => inPeriod(r.date)).forEach((r) => {
            entries.push({
                date: r.date,
                particulars: `Agst Ref ${r.bill_ref} (previous bill)`,
                narration: r.narration,
                voucher_type: r.voucher_type,
                voucher_no: r.voucher_no,
                sales_id: r.sales_id || "",
                debit: r.amount > 0 ? r.amount : 0,
                credit: r.amount < 0 ? -r.amount : 0,
                order: 1,
            });
        });

        // The data can carry the same voucher line more than once (e.g. a
        // receipt against a previous bill repeated per import row). Keep
        // one copy of each identical line.
        const seen = new Set();
        const unique = entries.filter((e) => {
            const key = [e.date, e.particulars, e.voucher_type, e.voucher_no || "", e.sales_id, e.debit, e.credit, e.narration || ""].join("|");

            if (seen.has(key)) return false;

            seen.add(key);

            return true;
        });

        // Like Tally: one row per voucher. A receipt against two bills of
        // this ledger becomes one row with the net amount.
        const merged = [];
        const bySalesId = new Map();

        unique.forEach((e) => {
            if (!e.sales_id) {
                merged.push(e);
                return;
            }

            const m = bySalesId.get(e.sales_id);

            if (!m) {
                const copy = { ...e };

                bySalesId.set(e.sales_id, copy);
                merged.push(copy);
                return;
            }

            const net = m.debit - m.credit + e.debit - e.credit;

            m.debit = net > 0 ? net : 0;
            m.credit = net < 0 ? -net : 0;
            m.order = Math.min(m.order, e.order);
            m.voucher_no = m.voucher_no || e.voucher_no;
            m.narration = m.narration || e.narration;

            if (m.particulars !== e.particulars) m.particulars = "(as per details)";
        });

        // Voucher details: other ledgers of the voucher, and the bill
        // allocations of this ledger. Particulars show the other ledger
        // like Tally ("(as per details)" when exploded with several).
        const own = ledgerKey(ledger.party);

        merged.forEach((e) => {
            const v = e.sales_id ? vouchers[e.sales_id] : null;

            if (!v) return;

            const others = (v.ledgers || []).filter((l) => ledgerKey(l.ledger) !== own);
            const allocations = (v.allocations || []).filter((a) => ledgerKey(a.ledger) === own);

            if (!others.length && !allocations.length) return;

            e.detail = { others, allocations };

            if (others.length) {
                e.particulars = others[0].ledger;
                e.particularsDetailed = others.length > 1 ? "(as per details)" : others[0].ledger;
            }
        });

        merged.sort(
            (a, b) => String(a.date).localeCompare(String(b.date)) || a.order - b.order
        );

        const debits = merged.reduce((t, e) => t + e.debit, 0);
        const credits = merged.reduce((t, e) => t + e.credit, 0);

        // What is still pending on bills less money not set against any bill.
        const pendingClosing =
            ledger.bills.reduce((t, b) => t + b.balance, 0) - ledger.onAccount;

        // Use the ledger's real opening balance (from Tally) when the server
        // sends it; otherwise work it back from the pending bills.
        const hasOpening = ledger.openingBalance !== null;
        const opening = hasOpening ? ledger.openingBalance : pendingClosing - debits + credits;
        const closing = opening + debits - credits;
        // Old bills still pending (or vouchers missing from the data).
        const unmatched = hasOpening ? closing - pendingClosing : 0;

        let running = opening;

        merged.forEach((e) => {
            running += e.debit - e.credit;
            e.balance = running;
        });

        const pendingBills = ledger.bills
            .filter((b) => Math.abs(b.balance) >= 1)
            .sort((a, b) => String(a.bill_date).localeCompare(String(b.bill_date)));

        const byBill = AGEING_SLABS.map(() => 0);
        const byDue = AGEING_SLABS.map(() => 0);

        pendingBills.forEach((b) => {
            byBill[slabIndex(Math.max(0, daysBetween(b.bill_date, asOf)))] += b.balance;
            byDue[slabIndex(Math.max(0, b.overdue_days || 0))] += b.balance;
        });

        return {
            entries: merged,
            debits,
            credits,
            opening,
            closing,
            hasOpening,
            unmatched,
            pendingBills,
            pendingOpening: pendingBills.reduce((t, b) => t + b.bill_amount, 0),
            pendingTotal: pendingBills.reduce((t, b) => t + b.balance, 0),
            byBill,
            byDue,
        };
    }, [ledger, vouchers, fromDate, asOf]);

    const rowKey = (e, i) => e.sales_id || `row-${i}`;
    const isExpanded = (e, i) => Boolean(e.detail) && detailed !== toggled.has(rowKey(e, i));

    const oldestOverdue = report.pendingBills.reduce(
        (max, b) => (b.overdue_days > (max?.overdue_days || 0) ? b : max),
        null
    );

    const exportLedger = () => {
        const workbook = XLSX.utils.book_new();

        const ledgerRows = [];

        report.entries.forEach((e, i) => {
            const expanded = isExpanded(e, i);

            ledgerRows.push({
                Date: formatTallyDate(e.date),
                Particulars: expanded ? e.particularsDetailed || e.particulars : e.particulars,
                "Voucher Type": e.voucher_type,
                "Voucher No": e.voucher_no || "",
                Debit: e.debit || "",
                Credit: e.credit || "",
                Balance: report.hasOpening ? e.balance : "",
                Narration: e.narration || "",
            });

            // Exploded lines go in "Details" so Debit / Credit still total.
            if (expanded) {
                e.detail.others.forEach((l) => {
                    ledgerRows.push({
                        Particulars: `    ${l.ledger}${l.derived ? " (not in export)" : ""}`,
                        Details: `${formatTally(l.amount)} ${l.dr_cr}`,
                    });
                });

                e.detail.allocations.forEach((a) => {
                    ledgerRows.push({
                        Particulars: `  ${a.bill_type} ${a.bill_ref}${a.credit_days ? ` ${a.credit_days} Days` : ""}`,
                        Details: `${formatTally(a.amount)} ${a.dr_cr}`,
                    });
                });
            }
        });

        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.json_to_sheet(
                [
                    {
                        Date: formatTallyDate(fromDate),
                        Particulars: "Opening Balance",
                        Balance: report.hasOpening ? report.opening : "",
                    },
                    ...ledgerRows,
                ],
                {
                    header: ["Date", "Particulars", "Voucher Type", "Voucher No", "Debit", "Credit", "Balance", "Narration", "Details"],
                }
            ),
            "Ledger"
        );

        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.json_to_sheet(
                report.pendingBills.map((b) => ({
                    Date: formatTallyDate(b.bill_date),
                    "Bill Ref": b.bill_ref,
                    "Opening Amount": b.bill_amount,
                    "Pending Amount": b.balance,
                    "Due On": formatTallyDate(b.due_date),
                    "Days Overdue": b.overdue_days > 0 ? b.overdue_days : "",
                }))
            ),
            "Pending Bills"
        );

        XLSX.writeFile(workbook, `${ledger.party.replace(/[\\/:*?"<>|]/g, "_")}_${asOf}.xlsx`);
    };

    return (
        <div style={{ background: "#FFFFFF", fontFamily: "Arial, Helvetica, sans-serif", color: "#111827" }}>
            {/* TITLE BAR */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 10px",
                    background: "#8DB4E2",
                    fontSize: "12px",
                    fontWeight: "700",
                }}
            >
                <span>Everest Agencies</span>
                <span style={{ display: "flex", gap: "6px" }}>
                    <button
                        type="button"
                        onClick={switchMode}
                        title="Show every voucher with its ledgers and bill references (Tally Alt+F5)"
                        style={{ ...buttonStyle(detailed), padding: "2px 10px", fontSize: "11px" }}
                    >
                        {detailed ? "Condensed" : "Detailed"}
                    </button>
                    <button
                        type="button"
                        onClick={exportLedger}
                        style={{ ...buttonStyle(false), padding: "2px 10px", fontSize: "11px" }}
                    >
                        Export Excel
                    </button>
                </span>
            </div>

            {/* LEDGER HEADER */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: "6px",
                    padding: "6px 10px",
                    borderBottom: "1px solid #CBD5E1",
                }}
            >
                <div>
                    <span style={{ fontSize: "12px", marginRight: "10px" }}>Ledger :</span>
                    <strong style={{ fontSize: "16px" }}>{ledger.party}</strong>
                    <div style={{ fontSize: "12px", fontWeight: "700", marginTop: "2px" }}>
                        {ledger.distribution}
                        {ledger.executive ? ` • Executive: ${ledger.executive}` : ""}
                    </div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <strong style={{ fontSize: "13px" }}>
                        {formatTallyDate(fromDate)} to {formatTallyDate(asOf)}
                    </strong>
                    <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                        Click an entry to see its details
                    </div>
                </div>
            </div>

            {/* TRANSACTIONS */}
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
                    <thead>
                        <tr>
                            <th style={tHead}>Date</th>
                            <th style={{ ...tHead, letterSpacing: "3px" }}>Particulars</th>
                            <th style={tHead}>Voucher Type</th>
                            <th style={tHead}>Voucher No.</th>
                            <th style={tHeadRight}>Debit</th>
                            <th style={tHeadRight}>Credit</th>
                            <th style={{ ...tHeadRight, letterSpacing: "3px" }}>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Opening, running and closing balance are left blank until
                            the real opening balance comes from Tally. */}
                        <tr>
                            <td style={tCell}>{formatTallyDate(fromDate)}</td>
                            <td style={{ ...tCell, fontWeight: "800", letterSpacing: "3px" }}>Opening Balance</td>
                            <td style={tCell} />
                            <td style={tCell} />
                            <td style={{ ...tCellRight, color: "#1D4ED8", fontWeight: "700" }}>
                                {report.hasOpening && report.opening >= 0 ? formatTally(report.opening) : ""}
                            </td>
                            <td style={{ ...tCellRight, color: "#1D4ED8", fontWeight: "700" }}>
                                {report.hasOpening && report.opening < 0 ? formatTally(-report.opening) : ""}
                            </td>
                            <td style={tCellRight} />
                        </tr>
                        <tr>
                            <td colSpan={7} style={{ height: "10px" }} />
                        </tr>

                        {report.entries.map((e, i) => {
                            const expanded = isExpanded(e, i);

                            return (
                                <React.Fragment key={rowKey(e, i)}>
                                    <tr
                                        title={e.narration || ""}
                                        onClick={e.detail ? () => toggleRow(rowKey(e, i)) : undefined}
                                        style={{
                                            cursor: e.detail ? "pointer" : "default",
                                            background: expanded && !detailed ? "#E2E8F0" : "transparent",
                                        }}
                                    >
                                        <td style={tCellRight}>{formatTallyDate(e.date)}</td>
                                        <td style={{ ...tCell, fontWeight: "700" }}>
                                            {expanded ? e.particularsDetailed || e.particulars : e.particulars}
                                            {e.narration && !expanded && (
                                                <span style={{ fontWeight: "400", color: "#64748B", fontSize: "11px", marginLeft: "8px" }}>
                                                    {e.narration.length > 50 ? `${e.narration.slice(0, 49)}…` : e.narration}
                                                </span>
                                            )}
                                        </td>
                                        <td style={tCell}>{e.voucher_type}</td>
                                        <td style={tCell}>{e.voucher_no || ""}</td>
                                        <td style={tCellRight}>{e.debit ? formatTally(e.debit) : ""}</td>
                                        <td style={tCellRight}>{e.credit ? formatTally(e.credit) : ""}</td>
                                        <td style={{ ...tCellRight, fontStyle: "italic" }}>
                                            {report.hasOpening ? formatDrCr(e.balance) : ""}
                                        </td>
                                    </tr>

                                    {expanded && (
                                        <tr>
                                            <td />
                                            <td colSpan={6} style={{ padding: "0 8px" }}>
                                                <VoucherDetails detail={e.detail} />
                                                {e.narration && (
                                                    <div style={{ fontSize: "11px", color: "#64748B", padding: "0 8px 6px 8px" }}>
                                                        {e.narration}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* LEDGER SUMMARY */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px 24px",
                    alignItems: "center",
                    padding: "8px 10px",
                    marginTop: "10px",
                    borderTop: "1px solid #CBD5E1",
                    borderBottom: "1px solid #CBD5E1",
                    fontSize: "13px",
                }}
            >
                <span style={tSection}>Ledger Summary</span>
                <span>
                    <strong>Opening Balance </strong>
                    <span style={{ ...tBox, color: "#1D4ED8", minHeight: "1.2em", verticalAlign: "middle" }}>
                        {report.hasOpening ? formatDrCr(report.opening) : ""}
                    </span>
                </span>
                <span>
                    <strong>Debits Totals </strong>
                    <span style={{ ...tBox, color: "#1D4ED8" }}>{formatTally(report.debits)} Dr</span>
                </span>
                <span>
                    <strong>Credits Totals </strong>
                    <span style={{ ...tBox, color: "#DC2626" }}>{formatTally(report.credits)} Cr</span>
                </span>
                <span>
                    <strong>Closing Balance </strong>
                    <span style={{ ...tBox, color: "#1D4ED8", minHeight: "1.2em", verticalAlign: "middle" }}>
                        {report.hasOpening ? formatDrCr(report.closing) : ""}
                    </span>
                </span>
                {Math.abs(report.unmatched) >= 1 && (
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#B45309" }}>
                        {formatDrCr(report.unmatched)} of the closing balance is not in the bills below
                        (previous-year bills still pending)
                    </span>
                )}
            </div>

            {/* PENDING BILLS */}
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
                    <thead>
                        <tr>
                            <th style={tHead}>Date</th>
                            <th style={{ ...tHead, letterSpacing: "3px" }}>Bill / Invoice Reference No.</th>
                            <th style={tHeadRight}>Opening Amount</th>
                            <th style={{ ...tHeadRight, fontWeight: "800" }}>Pending Amount</th>
                            <th style={{ ...tHead, fontStyle: "italic" }}>Due on</th>
                            <th style={{ ...tHeadRight, fontStyle: "italic" }}>Days Overdue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {report.pendingBills.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ ...tCell, padding: "12px 8px", color: "#64748B" }}>
                                    No pending bills.
                                </td>
                            </tr>
                        )}

                        {report.pendingBills.map((b) => {
                            const highlight = oldestOverdue && b === oldestOverdue;
                            const overdue = b.overdue_days > 0;

                            return (
                                <tr key={b.bill_ref} style={{ background: highlight ? "#FBBF24" : "transparent" }}>
                                    <td style={{ ...tCellRight, fontWeight: overdue ? "700" : "400" }}>
                                        {formatTallyDate(b.bill_date)}
                                    </td>
                                    <td style={tCell}>{b.bill_ref}</td>
                                    <td style={tCellRight}>{formatDrCr(b.bill_amount)}</td>
                                    <td style={{ ...tCellRight, fontWeight: overdue ? "800" : "400" }}>
                                        {formatDrCr(b.balance)}
                                    </td>
                                    <td style={{ ...tCell, fontStyle: "italic" }}>{formatTallyDate(b.due_date)}</td>
                                    <td style={{ ...tCellRight, fontStyle: "italic" }}>{overdue ? b.overdue_days : ""}</td>
                                </tr>
                            );
                        })}

                        <tr>
                            <td style={{ ...tCell, paddingTop: "14px" }} />
                            <td style={{ ...tCell, ...tSection, paddingTop: "14px" }}>TOTALS</td>
                            <td style={{ ...tCellRight, paddingTop: "14px", borderTop: "1px solid #94A3B8" }}>
                                {formatDrCr(report.pendingOpening)}
                            </td>
                            <td style={{ ...tCellRight, paddingTop: "14px", fontWeight: "800", borderTop: "1px solid #94A3B8" }}>
                                {formatDrCr(report.pendingTotal)}
                            </td>
                            <td style={tCell} />
                            <td style={tCell} />
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* AGEING ANALYSIS */}
            <div style={{ overflowX: "auto", marginTop: "10px", borderTop: "1px solid #CBD5E1" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px" }}>
                    <thead>
                        <tr>
                            <th style={{ ...tHead, fontSize: "14px", fontWeight: "800" }}>Ageing Analysis</th>
                            {AGEING_SLABS.map((s) => (
                                <th key={s.label} style={{ ...tHead, textAlign: "center" }}>
                                    {s.label}
                                </th>
                            ))}
                            <th style={{ ...tHead, textAlign: "center" }}>On Account</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            { label: "--- By Bill Date", values: report.byBill },
                            { label: "--- By Due Date", values: report.byDue },
                        ].map((row) => (
                            <tr key={row.label}>
                                <td style={{ ...tCellRight, fontWeight: "800", fontStyle: "italic", borderBottom: "1px solid #E2E8F0" }}>
                                    {row.label}
                                </td>
                                {row.values.map((v, i) => (
                                    <td
                                        key={i}
                                        style={{ ...tCell, textAlign: "center", color: "#1D4ED8", borderBottom: "1px solid #E2E8F0" }}
                                    >
                                        {Math.abs(v) >= 1 ? formatDrCr(v) : ""}
                                    </td>
                                ))}
                                <td style={{ ...tCell, textAlign: "center", color: "#7C3AED", borderBottom: "1px solid #E2E8F0" }}>
                                    {ledger.onAccount ? formatDrCr(-ledger.onAccount) : ""}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// =========================================================
// PAGE
// =========================================================

const KSEBOutstanding = () => {
    const fromDate = financialYearStart();
    const asOf = formatInputDate(new Date());

    const [bills, setBills] = useState([]);
    const [onAccount, setOnAccount] = useState([]);
    const [olderReceipts, setOlderReceipts] = useState([]);
    const [openingBalances, setOpeningBalances] = useState({});
    const [vouchers, setVouchers] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [distribution, setDistribution] = useState("all");
    const [selectedParty, setSelectedParty] = useState(null);
    const [search, setSearch] = useState("");

    // =====================================================
    // LOAD
    // =====================================================

    const loadOutstanding = async () => {
        setLoading(true);
        setError("");

        try {
            const params = new URLSearchParams({
                from_date: fromDate,
                to_date: asOf,
                as_of: asOf,
            });

            const response = await apiFetch(
                `${API}/get_kseb_outstanding.php?${params.toString()}`
            );

            const result = await response.json();

            if (result.success === false) {
                throw new Error(result.message || "Failed to load KSEB outstanding");
            }

            setBills(Array.isArray(result.bills) ? result.bills : []);
            setOnAccount(Array.isArray(result.on_account) ? result.on_account : []);
            setOlderReceipts(Array.isArray(result.older_receipts) ? result.older_receipts : []);
            // { "<ledger name>": amount } — Dr positive, Cr negative.
            // From salesdatalatest33 Ledger.$OpeningBalance (as on 1st April).
            setOpeningBalances(
                result.opening_balances && typeof result.opening_balances === "object"
                    ? result.opening_balances
                    : {}
            );
            // { "<Sales ID>": { ledgers, allocations, ... } } — Tally voucher details.
            setVouchers(
                result.vouchers && typeof result.vouchers === "object" ? result.vouchers : {}
            );
        } catch (err) {
            setError(err.message || "Failed to load KSEB outstanding");
            setBills([]);
            setOnAccount([]);
            setOlderReceipts([]);
            setOpeningBalances({});
            setVouchers({});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOutstanding();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // =====================================================
    // LEDGERS
    // =====================================================

    const ledgers = useMemo(() => {
        const map = new Map();

        const getRow = (party, src) => {
            if (!map.has(party)) {
                map.set(party, {
                    party,
                    distribution: src.distribution || "Unassigned",
                    executive: src.executive || "",
                    billed: 0,
                    pending: 0,
                    pendingCount: 0,
                    overdue: 0,
                    excess: 0,
                    onAccount: 0,
                    maxOverdue: 0,
                    bills: [],
                    onAccountLines: [],
                    older: [],
                    openingBalance: (() => {
                        const value = openingBalances[party] ?? openingBalances[String(party).trim()];

                        return value !== undefined && value !== null ? Number(value) : null;
                    })(),
                });
            }

            return map.get(party);
        };

        bills.forEach((b) => {
            const row = getRow(b.party, b);

            row.bills.push(b);
            row.billed += b.bill_amount;

            if (isPending(b)) {
                row.pending += b.balance;
                row.pendingCount++;

                if (b.overdue_days > 0) row.overdue += b.balance;

                row.maxOverdue = Math.max(row.maxOverdue, b.overdue_days);
            } else if (b.status === "excess") {
                row.excess += -b.balance;
            }
        });

        onAccount.forEach((o) => {
            const row = getRow(o.party, o);

            row.onAccount += o.amount;
            row.onAccountLines = o.lines || [];
        });

        olderReceipts.forEach((r) => {
            if (map.has(r.party)) map.get(r.party).older.push(r);
        });

        return [...map.values()]
            .map((r) => ({ ...r, net: r.pending - r.onAccount - r.excess }))
            .sort((a, b) => b.net - a.net || b.billed - a.billed);
    }, [bills, onAccount, olderReceipts, openingBalances]);

    const donutData = useMemo(() => {
        const totals = new Map();

        ledgers.forEach((l) => {
            const t = totals.get(l.distribution) || { value: 0, ledgers: 0 };

            t.value += l.pending;
            t.ledgers++;
            totals.set(l.distribution, t);
        });

        const colorOrder = [...totals.keys()].sort();

        return [...totals.entries()]
            .filter(([, t]) => t.value > 0)
            .map(([name, t]) => ({
                name,
                value: t.value,
                ledgers: t.ledgers,
                fill: DONUT_COLORS[colorOrder.indexOf(name) % DONUT_COLORS.length],
            }))
            .sort((a, b) => b.value - a.value);
    }, [ledgers]);

    const donutTotal = donutData.reduce((t, d) => t + d.value, 0);

    const listedLedgers = useMemo(() => {
        const term = search.trim().toLowerCase();

        return ledgers.filter(
            (l) =>
                (distribution === "all" || l.distribution === distribution) &&
                (!term || l.party.toLowerCase().includes(term))
        );
    }, [ledgers, distribution, search]);

    const listTotal = useMemo(
        () =>
            listedLedgers.reduce(
                (t, l) => ({
                    pending: t.pending + l.pending,
                    overdue: t.overdue + l.overdue,
                    onAccount: t.onAccount + l.onAccount,
                    net: t.net + l.net,
                }),
                { pending: 0, overdue: 0, onAccount: 0, net: 0 }
            ),
        [listedLedgers]
    );

    const ledger = ledgers.find((l) => l.party === selectedParty) || null;

    const selectDistribution = (name) => {
        setDistribution(name);
        setSelectedParty(null);
        setSearch("");
    };

    // =====================================================
    // RENDER
    // =====================================================

    return (
        <div style={{ minHeight: "100vh", background: "#F4F7FB", color: "#1F2937" }}>
            <Banner />

            <style>{`
                @media (max-width: 1000px) {
                    .kseb-os-layout { grid-template-columns: 1fr !important; }
                    .kseb-os-sidebar { position: static !important; }
                }
            `}</style>

            <div
                className="kseb-os-layout"
                style={{
                    padding: "16px",
                    maxWidth: "1700px",
                    margin: "0 auto",
                    display: "grid",
                    gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
                    gap: "16px",
                    alignItems: "start",
                }}
            >
                {/* =============================================
                    SIDEBAR: DISTRIBUTION DONUT
                ============================================== */}

                <div className="kseb-os-sidebar" style={{ ...cardStyle, padding: "18px", position: "sticky", top: "12px" }}>
                    <div style={{ fontSize: "14px", fontWeight: "800", color: "#0B2545" }}>
                        KSEB Outstanding
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748B", margin: "3px 0 8px" }}>
                        Pending as on {formatTallyDate(asOf)} • click a distribution to see its ledgers.
                    </div>

                    {loading ? (
                        <div style={emptyStyle}>Loading...</div>
                    ) : (
                        <DistributionDonut data={donutData} selected={distribution} onSelect={selectDistribution} />
                    )}

                    <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #E2E8F0" }}>
                        <div style={labelStyle}>OUTSTANDING SHARE</div>
                        <div style={{ fontSize: "30px", fontWeight: "800", marginTop: "4px", color: "#0B2545" }}>
                            {(donutTotal
                                ? ((distribution === "all"
                                      ? donutTotal
                                      : donutData.find((d) => d.name === distribution)?.value || 0) /
                                      donutTotal) *
                                  100
                                : 0
                            ).toFixed(2)}
                            %
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => selectDistribution("all")}
                        style={{ ...buttonStyle(distribution === "all"), width: "100%", marginTop: "14px" }}
                    >
                        Overall (All Distributions)
                    </button>
                </div>

                {/* =============================================
                    RIGHT: LEDGER LIST  /  LEDGER REPORT
                ============================================== */}

                <div style={{ minWidth: 0 }}>
                    {error && (
                        <div
                            style={{
                                marginBottom: "12px",
                                padding: "10px 14px",
                                borderRadius: "8px",
                                background: "#FEE2E2",
                                color: "#991B1B",
                                fontSize: "13px",
                                fontWeight: "600",
                            }}
                        >
                            {error}
                        </div>
                    )}

                    {/* BREADCRUMB */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "13px" }}>
                        <button
                            type="button"
                            onClick={() => selectDistribution("all")}
                            style={{ ...linkStyle, fontWeight: distribution === "all" && !ledger ? "800" : "600" }}
                        >
                            All Distributions
                        </button>

                        {distribution !== "all" && (
                            <>
                                <span style={{ color: "#94A3B8" }}>›</span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedParty(null)}
                                    style={{ ...linkStyle, fontWeight: ledger ? "600" : "800" }}
                                >
                                    {distribution}
                                </button>
                            </>
                        )}

                        {ledger && (
                            <>
                                <span style={{ color: "#94A3B8" }}>›</span>
                                <strong>{ledger.party}</strong>
                                <div style={{ flex: 1 }} />
                                <button type="button" onClick={() => setSelectedParty(null)} style={buttonStyle(false)}>
                                    ← Back to ledgers
                                </button>
                            </>
                        )}
                    </div>

                    {ledger ? (
                        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                            <LedgerReport
                                key={ledger.party}
                                ledger={ledger}
                                vouchers={vouchers}
                                fromDate={fromDate}
                                asOf={asOf}
                            />
                        </div>
                    ) : (
                        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "12px",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "12px 14px",
                                    borderBottom: "1px solid #E2E8F0",
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: "15px", fontWeight: "800", color: "#0B2545" }}>
                                        {distribution === "all" ? "All Ledgers" : distribution}
                                    </div>
                                    <div style={{ fontSize: "12px", color: "#64748B" }}>
                                        {listedLedgers.length} ledgers • click a ledger for its ledger report
                                    </div>
                                </div>

                                <input
                                    type="text"
                                    value={search}
                                    placeholder="Search ledger..."
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{ ...inputStyle, width: "240px" }}
                                />
                            </div>

                            <div style={{ overflow: "auto", maxHeight: "75vh" }}>
                                {loading ? (
                                    <div style={emptyStyle}>Loading KSEB outstanding...</div>
                                ) : listedLedgers.length ? (
                                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "820px" }}>
                                        <thead>
                                            <tr>
                                                <th style={thStyle}>KSEB Ledger</th>
                                                {distribution === "all" && <th style={thStyle}>Distribution</th>}
                                                <th style={thRight}>Pending Bills</th>
                                                <th style={thRight}>Pending</th>
                                                <th style={thRight}>Overdue</th>
                                                <th style={thRight}>On Account</th>
                                                <th style={thRight}>Net Outstanding</th>
                                                <th style={thRight}>Oldest Overdue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {listedLedgers.map((l) => (
                                                <tr
                                                    key={l.party}
                                                    onClick={() => {
                                                        setSelectedParty(l.party);
                                                        window.scrollTo({ top: 0 });
                                                    }}
                                                    style={{ cursor: "pointer" }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = "#EFF6FF")}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                                                >
                                                    <td style={{ ...tdStyle, fontWeight: "700" }}>
                                                        {l.party}
                                                        {l.executive && (
                                                            <div style={{ fontSize: "11px", color: "#64748B", fontWeight: "500" }}>
                                                                {l.executive}
                                                            </div>
                                                        )}
                                                    </td>
                                                    {distribution === "all" && <td style={tdStyle}>{l.distribution}</td>}
                                                    <td style={tdRight}>{l.pendingCount}</td>
                                                    <td style={{ ...tdRight, color: "#B91C1C", fontWeight: "700" }}>
                                                        {formatAmount(l.pending)}
                                                    </td>
                                                    <td style={{ ...tdRight, color: "#EA580C" }}>
                                                        {l.overdue ? formatAmount(l.overdue) : "-"}
                                                    </td>
                                                    <td style={{ ...tdRight, color: "#7C3AED" }}>
                                                        {l.onAccount ? formatAmount(l.onAccount) : "-"}
                                                    </td>
                                                    <td style={{ ...tdRight, fontWeight: "800", color: "#0B2545" }}>
                                                        {formatAmount(l.net)}
                                                    </td>
                                                    <td style={tdRight}>{l.maxOverdue > 0 ? `${l.maxOverdue} d` : "-"}</td>
                                                </tr>
                                            ))}

                                            <tr style={{ background: "#E2E8F0" }}>
                                                <td style={{ ...tdStyle, fontWeight: "800" }}>TOTAL</td>
                                                {distribution === "all" && <td style={tdStyle} />}
                                                <td style={tdRight} />
                                                <td style={{ ...tdRight, fontWeight: "800", color: "#B91C1C" }}>
                                                    {formatAmount(listTotal.pending)}
                                                </td>
                                                <td style={{ ...tdRight, fontWeight: "800", color: "#EA580C" }}>
                                                    {formatAmount(listTotal.overdue)}
                                                </td>
                                                <td style={{ ...tdRight, fontWeight: "800", color: "#7C3AED" }}>
                                                    {formatAmount(listTotal.onAccount)}
                                                </td>
                                                <td style={{ ...tdRight, fontWeight: "800", color: "#0B2545" }}>
                                                    {formatAmount(listTotal.net)}
                                                </td>
                                                <td style={tdRight} />
                                            </tr>
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={emptyStyle}>No ledgers found.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default KSEBOutstanding;
