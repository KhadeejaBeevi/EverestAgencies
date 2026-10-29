import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { apiFetch } from "../../api/apiClient";

import * as XLSX from "xlsx";

const API = "/serverphp";

/*
  KSEB Outstanding

  1. Donut (left)      : pending balance by distribution.
  2. Ledger list       : click a distribution to list its ledgers (areas).
     Receipts list     : "Receipts" lists every receipt allocation of the
                         distribution, with the bill it was set against.
  3. Ledger report     : click a ledger for a Tally style ledger display —
                         transactions with running balance, ledger summary,
                         pending bills and ageing analysis.
                         "Detailed" (or a click on a row) explodes the
                         voucher like Tally: its other ledgers and the bill
                         allocations of this ledger.
                         A click on "Opening Balance" shows its break up.

  Opening bills (is_opening, from the Tally XML) are the bill-wise break
  down of the opening balance: they are listed under pending bills, but
  not as transactions — the opening balance already holds them. The
  server also sends them per ledger as opening_breakup (every bill
  pending on 1st April, and what is left of it now), shown under the
  Opening Balance row.

  Receipts come from kseb_receipts. That export has the bill date but not
  the bill number, so the server matches each receipt to the bill of that
  date; when no bill is found it is listed with the On Account amounts
  ("bill not identified") and still counts in the net outstanding.
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

// Zero amounts are left blank, like Tally.
const isZero = (value) => Math.abs(Number(value || 0)) < 0.005;

const formatAmount = (value) =>
    isZero(value)
        ? ""
        : "₹" +
          Number(value).toLocaleString("en-IN", {
              maximumFractionDigits: 0,
          });

// Tally style: 4,93,830.00
const formatTally = (value) =>
    isZero(value)
        ? ""
        : Number(value).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

const formatDrCr = (value) =>
    isZero(value) ? "" : `${formatTally(Math.abs(value))} ${value < 0 ? "Cr" : "Dr"}`;

// Amount with its side written after it ("1,000.00 Dr"), blank for zero.
const withSide = (value, side) => (isZero(value) ? "" : `${formatTally(value)} ${side}`);

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

// On Account line: plain On Account, an advance (receipt New Ref), or a
// receipt whose bill (by bill date) the server could not identify.
const onAccountParticulars = (l) => {
    if (l.unmatched) {
        return l.bill_date
            ? `Agst Ref (bill of ${formatTallyDate(l.bill_date)} not identified)`
            : "Agst Ref (bill not identified)";
    }

    if (l.bill_type === "New Ref") return "New Ref (advance)";

    return "On Account";
};

// receipts[].adjusted_to -> label / colour
const ADJUSTED_TO = {
    bill: { label: "Bill", color: "#166534" },
    opening: { label: "Opening bill", color: "#166534" },
    older: { label: "Older bill", color: "#64748B" },
    advance: { label: "Advance", color: "#7C3AED" },
    on_account: { label: "On Account", color: "#7C3AED" },
    not_identified: { label: "Bill not identified", color: "#B45309" },
};

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

// Section heading inside the ledger report ("Ledger Details" ...),
// the same as the Ageing Analysis heading.
const tHeading = {
    padding: "4px 8px",
    fontSize: "14px",
    fontWeight: "800",
    color: "#1F2937",
    textAlign: "left",
    borderBottom: "1px solid #94A3B8",
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
const formatQty = (value) =>
    Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });

// Stock items of a sales voucher (Tally invoice lines).
const VoucherItems = ({ items }) => {
    const total = items.reduce((t, it) => t + it.amount, 0);
    const head = { ...tDetail, fontWeight: "700", borderBottom: "1px solid #CBD5E1", padding: "2px 8px" };
    const headRight = { ...head, textAlign: "right" };

    return (
        <table style={{ borderCollapse: "collapse", margin: "2px 0 6px 24px", minWidth: "640px" }}>
            <thead>
                <tr>
                    <th style={{ ...head, textAlign: "left" }}>Name of Item</th>
                    <th style={{ ...head, textAlign: "left" }}>HSN</th>
                    <th style={headRight}>Quantity</th>
                    <th style={headRight}>Rate</th>
                    <th style={{ ...head, textAlign: "left" }}>per</th>
                    <th style={headRight}>Disc %</th>
                    <th style={headRight}>GST %</th>
                    <th style={headRight}>Amount</th>
                </tr>
            </thead>
            <tbody>
                {items.map((it, i) => (
                    <tr key={i}>
                        <td style={{ ...tDetail, whiteSpace: "normal", maxWidth: "320px" }}>{it.item}</td>
                        <td style={{ ...tDetail, color: "#64748B" }}>{it.hsn}</td>
                        <td style={tDetailRight}>
                            {it.qty !== null ? `${formatQty(it.qty)}${it.unit ? ` ${it.unit}` : ""}` : ""}
                        </td>
                        <td style={tDetailRight}>{it.rate !== null ? formatTally(it.rate) : ""}</td>
                        <td style={tDetail}>{it.unit}</td>
                        <td style={tDetailRight}>{it.discount ? formatQty(it.discount) : ""}</td>
                        <td style={tDetailRight}>{it.gst_rate ? formatQty(it.gst_rate) : ""}</td>
                        <td style={tDetailRight}>{formatTally(it.amount)}</td>
                    </tr>
                ))}
                {items.length > 1 && (
                    <tr>
                        <td colSpan={7} style={{ ...tDetailRight, fontWeight: "700" }}>Items Total</td>
                        <td style={{ ...tDetailRight, fontWeight: "700", borderTop: "1px solid #94A3B8" }}>
                            {formatTally(total)}
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
};

const VoucherDetails = ({ detail }) => (
    <>
    {detail.items?.length > 0 && <VoucherItems items={detail.items} />}
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
                        title={l.derived ? "Ledger name not in the Tally export - worked out from the voucher" : ""}
                    >
                        {l.ledger}
                    </td>
                    <td colSpan={3} />
                    <td style={{ ...tDetailRight, color: l.derived ? "#64748B" : "#1F2937" }}>
                        {withSide(l.amount, l.dr_cr)}
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
                        {withSide(a.amount, a.dr_cr)}
                    </td>
                    <td colSpan={2} />
                </tr>
            ))}
        </tbody>
    </table>
    </>
);

// =========================================================
// OPENING BALANCE BREAK UP (Tally XML)
// =========================================================

/*
  Every bill pending on 1st April (Tally "LOB Report"), which together
  make the opening balance, with what is still pending of each now.
  breakup = opening_breakup[ledger] from the server, or null.
*/
const OpeningBreakup = ({ breakup, openingBalance, openingDate, source }) => {
    const sourceLabel = source.updated
        ? `Tally LOB Report • ${source.source === "tally" ? "fetched from Tally" : "saved copy"} ${formatTallyDate(
              source.updated.slice(0, 10)
          )} ${source.updated.slice(11, 16)}`
        : "Tally LOB Report";

    if (!breakup || !breakup.bills?.length) {
        return (
            <div style={{ fontSize: "12px", color: "#64748B", padding: "6px 8px 10px 24px" }}>
                No bill-wise break up of the opening balance for this ledger in the Tally XML ({sourceLabel}).
                Use "Refresh from Tally" to fetch it again.
            </div>
        );
    }

    // Opening balance (salesdatalatest33) the bills should add up to.
    const difference = openingBalance !== null ? openingBalance - breakup.total : 0;

    return (
        <div style={{ margin: "2px 0 10px 24px", border: "1px solid #CBD5E1", background: "#F8FAFC" }}>
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: "6px",
                    padding: "4px 8px",
                    borderBottom: "1px solid #CBD5E1",
                    fontSize: "12px",
                }}
            >
                <strong>Opening Balance Break Up as on {formatTallyDate(openingDate)}</strong>
                <span style={{ color: "#64748B" }}>{sourceLabel}</span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr>
                        <th style={{ ...tHead, background: "transparent" }}>Date</th>
                        <th style={{ ...tHead, background: "transparent" }}>Bill / Invoice Reference No.</th>
                        <th style={{ ...tHeadRight, background: "transparent" }}>Credit Period</th>
                        <th style={{ ...tHead, background: "transparent", fontStyle: "italic" }}>Due on</th>
                        <th style={{ ...tHeadRight, background: "transparent" }}>Opening Amount</th>
                        <th style={{ ...tHeadRight, background: "transparent" }}>Pending Now</th>
                    </tr>
                </thead>
                <tbody>
                    {breakup.bills.map((b, i) => (
                        <tr key={`${b.bill_ref}-${i}`}>
                            <td style={tCellRight}>{formatTallyDate(b.bill_date)}</td>
                            <td style={{ ...tCell, fontStyle: b.is_on_account ? "italic" : "normal" }}>{b.bill_ref}</td>
                            <td style={tCellRight}>{!b.is_on_account && b.credit_days ? `${b.credit_days} Days` : ""}</td>
                            <td style={{ ...tCell, fontStyle: "italic" }}>
                                {b.is_on_account ? "" : formatTallyDate(b.due_date)}
                            </td>
                            <td style={tCellRight}>{formatDrCr(b.amount)}</td>
                            <td style={{ ...tCellRight, color: b.balance !== null && Math.abs(b.balance) < 1 ? "#166534" : "#1F2937" }}>
                                {b.balance === null ? "" : Math.abs(b.balance) < 1 ? "Cleared" : formatDrCr(b.balance)}
                            </td>
                        </tr>
                    ))}

                    <tr>
                        <td style={tCell} />
                        <td style={{ ...tCell, fontWeight: "800" }}>Total ({breakup.bills.length} entries)</td>
                        <td style={tCell} />
                        <td style={tCell} />
                        <td style={{ ...tCellRight, fontWeight: "800", borderTop: "1px solid #94A3B8" }}>
                            {formatDrCr(breakup.total)}
                        </td>
                        <td style={{ ...tCell, borderTop: "1px solid #94A3B8" }} />
                    </tr>
                </tbody>
            </table>

            {Math.abs(difference) >= 1 && (
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#B45309", padding: "4px 8px 6px" }}>
                    The bills add up to {formatDrCr(breakup.total)}, the opening balance is {formatDrCr(openingBalance)}{" "}
                    (difference {formatDrCr(difference)}).
                </div>
            )}
        </div>
    );
};

// =========================================================
// LEDGER SECURITY DEPOSITS (Ledger Details > Security Deposit)
// =========================================================

/* Deposit entries of one ledger, oldest first: every deposit taken from
   a KSEB receipt or paid by us (Payment), and every refund. Debit = a
   deposit held by KSEB, Credit = refunded. */
const depositEntries = (deposits) =>
    deposits
        .flatMap((d) =>
            (d.lines || []).map((l) => ({
                date: l.date,
                deposit_ledger: d.deposit_ledger,
                bill_ref: d.bill_ref,
                credit_days: d.credit_days,
                voucher_type: l.voucher_type,
                voucher_no: l.voucher_no || "",
                bill_type: l.bill_type,
                debit: l.amount > 0 ? l.amount : 0,
                credit: l.amount < 0 ? -l.amount : 0,
                ledgers: l.ledgers || [],
            }))
        )
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

/*
  Security deposits in the same layout as the supply chain ledger:
  Date, Particulars (deposit ledger and reference), Voucher Type / No.,
  Debit, Credit and running Balance (what KSEB holds). A click explodes
  the voucher (its ledgers and the deposit's bill allocation).
  Like the supply chain ledger, entries before fromDate (1st April) are
  not listed: they make the Opening Balance (deposits still held then).
*/
const LedgerDepositEntries = ({ deposits, detailed, fromDate }) => {
    const [toggled, setToggled] = useState(() => new Set());

    const toggle = (key) =>
        setToggled((prev) => {
            const next = new Set(prev);

            if (next.has(key)) next.delete(key);
            else next.add(key);

            return next;
        });

    const all = depositEntries(deposits);
    const opening = all
        .filter((e) => String(e.date) < fromDate)
        .reduce((t, e) => t + e.debit - e.credit, 0);
    const entries = all.filter((e) => String(e.date) >= fromDate);
    let running = opening;
    const rows = entries.map((e) => {
        running += e.debit - e.credit;

        return { ...e, balance: running };
    });
    const debits = entries.reduce((t, e) => t + e.debit, 0);
    const credits = entries.reduce((t, e) => t + e.credit, 0);
    const closing = opening + debits - credits;

    return (
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
                    <tr>
                        <td style={tCell}>{formatTallyDate(fromDate)}</td>
                        <td style={{ ...tCell, fontWeight: "800", letterSpacing: "3px" }}>Opening Balance</td>
                        <td style={tCell} />
                        <td style={tCell} />
                        <td style={{ ...tCellRight, color: "#1D4ED8", fontWeight: "700" }}>
                            {opening > 0 ? formatTally(opening) : ""}
                        </td>
                        <td style={{ ...tCellRight, color: "#1D4ED8", fontWeight: "700" }}>
                            {opening < 0 ? formatTally(-opening) : ""}
                        </td>
                        <td style={tCellRight} />
                    </tr>

                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={7} style={{ ...tCell, padding: "12px 8px", color: "#64748B" }}>
                                {all.length ? "No security deposit entries in this period." : "No security deposits for this ledger."}
                            </td>
                        </tr>
                    )}

                    {rows.map((e, i) => {
                        const key = `dep-${i}`;
                        const expanded = detailed !== toggled.has(key);

                        return (
                            <React.Fragment key={key}>
                                <tr
                                    onClick={() => toggle(key)}
                                    style={{
                                        cursor: "pointer",
                                        background: expanded && !detailed ? "#E2E8F0" : "transparent",
                                    }}
                                >
                                    <td style={tCellRight}>{formatTallyDate(e.date)}</td>
                                    <td style={{ ...tCell, fontWeight: "700" }}>
                                        {e.deposit_ledger}
                                        {e.bill_ref && (
                                            <span style={{ fontWeight: "400", color: "#64748B", fontSize: "11px", marginLeft: "8px" }}>
                                                {e.bill_ref}
                                            </span>
                                        )}
                                    </td>
                                    <td style={tCell}>{e.voucher_type}</td>
                                    <td style={tCell}>{e.voucher_no}</td>
                                    <td style={tCellRight}>{formatTally(e.debit)}</td>
                                    <td style={tCellRight}>{formatTally(e.credit)}</td>
                                    <td style={{ ...tCellRight, fontStyle: "italic" }}>{formatDrCr(e.balance)}</td>
                                </tr>

                                {expanded && (
                                    <tr>
                                        <td />
                                        <td colSpan={6} style={{ padding: "0 8px" }}>
                                            <VoucherDetails
                                                detail={{
                                                    items: [],
                                                    others: e.ledgers.filter(
                                                        (l) => ledgerKey(l.ledger) !== ledgerKey(e.deposit_ledger)
                                                    ),
                                                    allocations: [
                                                        {
                                                            bill_type: e.bill_type,
                                                            bill_ref: e.bill_ref,
                                                            credit_days: e.credit_days,
                                                            amount: e.debit || e.credit,
                                                            dr_cr: e.debit ? "Dr" : "Cr",
                                                        },
                                                    ],
                                                }}
                                            />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>

                {all.length > 0 && (
                    <tfoot>
                        <tr style={{ borderTop: "1px solid #94A3B8" }}>
                            <td style={{ ...tCell, paddingTop: "6px" }} />
                            <td colSpan={6} style={{ ...tCell, ...tSection, paddingTop: "6px" }}>
                                Ledger Summary
                            </td>
                        </tr>
                        <tr>
                            <td style={tCell} />
                            <td style={{ ...tCell, fontWeight: "700" }}>Opening Balance</td>
                            <td style={tCell} />
                            <td style={tCell} />
                            <td style={{ ...tCellRight, fontWeight: "700", color: "#1D4ED8" }}>
                                {opening > 0 ? formatTally(opening) : ""}
                            </td>
                            <td style={{ ...tCellRight, fontWeight: "700", color: "#1D4ED8" }}>
                                {opening < 0 ? formatTally(-opening) : ""}
                            </td>
                            <td style={{ ...tCellRight, fontWeight: "700", color: "#1D4ED8" }}>{formatDrCr(opening)}</td>
                        </tr>
                        <tr>
                            <td style={tCell} />
                            <td style={{ ...tCell, fontWeight: "700" }}>Debit Total / Credit Total</td>
                            <td style={tCell} />
                            <td style={tCell} />
                            <td style={{ ...tCellRight, fontWeight: "700" }}>{formatTally(debits)}</td>
                            <td style={{ ...tCellRight, fontWeight: "700" }}>{formatTally(credits)}</td>
                            <td style={tCellRight} />
                        </tr>
                        <tr style={{ borderTop: "1px solid #94A3B8" }}>
                            <td style={tCell} />
                            <td style={{ ...tCell, fontWeight: "700" }}>Closing Balance (held by KSEB)</td>
                            <td style={tCell} />
                            <td style={tCell} />
                            <td style={tCellRight} />
                            <td style={tCellRight} />
                            <td style={{ ...tCellRight, fontWeight: "800", color: "#0B2545" }}>
                                {formatDrCr(closing)}
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
};

// =========================================================
// LEDGER REPORT (Tally Bird-Eye-View style)
// =========================================================

const LedgerReport = ({ ledger, vouchers, fromDate, asOf, openingSource }) => {
    // Detailed = every voucher exploded (Tally Alt+F5). A click on a row
    // flips just that row.
    const [detailed, setDetailed] = useState(false);
    const [toggled, setToggled] = useState(() => new Set());
    // Opening balance break up shown under the Opening Balance row.
    const [showOpening, setShowOpening] = useState(false);
    // Bill-wise details tab: pending / overdue / all.
    const [billTab, setBillTab] = useState("pending");
    // Ledger Details tab: supply chain (the ledger) / security deposit.
    const [ledgerTab, setLedgerTab] = useState("supply");

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

            // Opening bill: already inside the opening balance, so only
            // what came against it this year is a transaction.
            const billLine = b.is_opening ? null : (b.lines || []).find(isBillLine);
            // Actual Tally voucher type (e.g. "GST Sales B2B"), not a fixed "Sales".
            const voucherType = b.voucher_type || billLine?.voucher_type || "Sales";

            if (!b.is_opening) {
                entries.push({
                    date: b.bill_date,
                    particulars:
                        b.particulars || b.sales_ledger || billLine?.particulars || billLine?.ledger || voucherType,
                    voucher_type: voucherType,
                    voucher_no: b.voucher_no || b.bill_ref,
                    sales_id: billLine?.sales_id || "",
                    debit: Math.max(b.bill_amount, 0),
                    credit: Math.max(-b.bill_amount, 0),
                    order: 0,
                });
            }

            (b.lines || []).forEach((l) => {
                // Skip the bill's own line, it is already listed above.
                if (billLine && isBillLine(l)) return;

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

        // On Account of the opening bills (Tally XML) is part of the
        // opening balance too, not a transaction.
        ledger.onAccountLines
            .filter((l) => inPeriod(l.date) && l.voucher_type !== "Opening Balance")
            .forEach((l) => {
                entries.push({
                    date: l.date,
                    particulars: onAccountParticulars(l),
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
            const items = v.items || [];

            if (!others.length && !allocations.length && !items.length) return;

            e.detail = { others, allocations, items };

            if (others.length) {
                /* Like Tally, particulars = the ledger on the other side
                   (the bank on a receipt, the sales ledger on a sale), not
                   e.g. another KSEB office paid in the same receipt. */
                const ownSide = e.debit > 0 ? "Dr" : "Cr";
                const opposite = others.filter((l) => l.dr_cr !== ownSide);
                const pick =
                    opposite.find((l) => l.bank) ||
                    opposite.find((l) => !l.derived) ||
                    opposite[0] ||
                    others.find((l) => !l.derived) ||
                    others[0];

                e.particulars = pick.ledger;
                e.particularsDetailed = others.length > 1 ? "(as per details)" : pick.ledger;
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

        // Every bill (Tally's bill-wise details, cleared ones too) with the
        // details of its sales voucher (items, ledgers, bill allocations).
        // Opening bills have no voucher here.
        const allBills = [...ledger.bills]
            .sort(
                (a, b) =>
                    String(a.bill_date).localeCompare(String(b.bill_date)) ||
                    String(a.bill_ref).localeCompare(String(b.bill_ref), undefined, { numeric: true })
            )
            .map((b) => {
                const billLine = b.is_opening
                    ? null
                    : (b.lines || []).find(
                          (l) =>
                              l.amount > 0 &&
                              l.sales_id &&
                              ((l.voucher_no && l.voucher_no === b.voucher_no) || l.date === b.bill_date)
                      );
                const v = billLine ? vouchers[billLine.sales_id] : null;

                if (!v) return b;

                const detail = {
                    others: (v.ledgers || []).filter((l) => ledgerKey(l.ledger) !== own),
                    allocations: (v.allocations || []).filter((a) => ledgerKey(a.ledger) === own),
                    items: v.items || [],
                };

                return detail.others.length || detail.allocations.length || detail.items.length
                    ? { ...b, detail }
                    : b;
            });

        // Pending = something still open on the bill (Dr or Cr).
        const pendingBills = allBills.filter((b) => Math.abs(b.balance) >= 1);

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
            allBills,
            pendingBills,
            // Like Tally's "On Account Details" line: money not set against
            // a bill, Dr + / Cr - (ledger.onAccount is + = received).
            onAccount: -ledger.onAccount,
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

    /* Bill-wise details of the selected tab:
       pending = still open (Dr or Cr), overdue = open Dr bills past
       their due date, all = every bill, cleared ones too (like Tally). */
    const overdueBills = report.pendingBills.filter((b) => b.balance > 0 && b.overdue_days > 0);
    const shownBills =
        billTab === "all" ? report.allBills : billTab === "overdue" ? overdueBills : report.pendingBills;
    const shownOpening = shownBills.reduce((t, b) => t + b.bill_amount, 0);
    const shownPending = shownBills.reduce((t, b) => t + b.balance, 0);
    // On Account is not a bill and never overdue.
    const showOnAccount = billTab !== "overdue" && Math.abs(report.onAccount) >= 1;
    const billTabs = [
        { key: "pending", label: "Pending", count: report.pendingBills.length },
        { key: "overdue", label: "Overdue", count: overdueBills.length },
        { key: "all", label: "All", count: report.allBills.length },
    ];

    // Number of security deposits (deposit ledger + reference).
    const depositCount = (ledger.deposits || []).length;

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
                Balance: report.hasOpening && !isZero(e.balance) ? e.balance : "",
                Narration: e.narration || "",
            });

            // Exploded lines go in "Details" so Debit / Credit still total.
            if (expanded) {
                (e.detail.items || []).forEach((it) => {
                    ledgerRows.push({
                        Particulars: `      ${it.item}${it.hsn ? ` (HSN ${it.hsn})` : ""}`,
                        Details: [
                            it.qty !== null ? `${formatQty(it.qty)} ${it.unit}`.trim() : "",
                            it.rate !== null ? `@ ${formatTally(it.rate)}` : "",
                            it.discount ? `Disc ${it.discount}%` : "",
                            it.gst_rate ? `GST ${it.gst_rate}%` : "",
                            `= ${formatTally(it.amount)}`,
                        ]
                            .filter(Boolean)
                            .join(" "),
                    });
                });

                e.detail.others.forEach((l) => {
                    ledgerRows.push({
                        Particulars: `    ${l.ledger}${l.derived ? " (not in export)" : ""}`,
                        Details: withSide(l.amount, l.dr_cr),
                    });
                });

                e.detail.allocations.forEach((a) => {
                    ledgerRows.push({
                        Particulars: `  ${a.bill_type} ${a.bill_ref}${a.credit_days ? ` ${a.credit_days} Days` : ""}`,
                        Details: withSide(a.amount, a.dr_cr),
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
                        Balance: report.hasOpening && !isZero(report.opening) ? report.opening : "",
                    },
                    ...ledgerRows,
                ],
                {
                    header: ["Date", "Particulars", "Voucher Type", "Voucher No", "Debit", "Credit", "Balance", "Narration", "Details"],
                }
            ),
            "Ledger"
        );

        if (ledger.openingBreakup?.bills?.length) {
            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet([
                    ...ledger.openingBreakup.bills.map((b) => ({
                        Date: formatTallyDate(b.bill_date),
                        "Bill Ref": b.bill_ref,
                        "Credit Days": b.is_on_account ? "" : b.credit_days,
                        "Due On": b.is_on_account ? "" : formatTallyDate(b.due_date),
                        "Opening Amount": b.amount,
                        "Pending Now": b.balance === null ? "" : Math.abs(b.balance) < 1 ? "Cleared" : b.balance,
                    })),
                    { "Bill Ref": "TOTAL", "Opening Amount": ledger.openingBreakup.total },
                ]),
                "Opening Break Up"
            );
        }

        // Security deposit entries of this ledger: opening balance as on
        // fromDate, then this period's entries (same as the screen).
        if (depositCount) {
            const all = depositEntries(ledger.deposits || []);
            let held = all
                .filter((e) => String(e.date) < fromDate)
                .reduce((t, e) => t + e.debit - e.credit, 0);

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet([
                    {
                        Date: formatTallyDate(fromDate),
                        "Security Deposit Ledger": "Opening Balance",
                        Balance: isZero(held) ? "" : held,
                    },
                    ...all
                        .filter((e) => String(e.date) >= fromDate)
                        .map((e) => {
                            held += e.debit - e.credit;

                            return {
                                Date: formatTallyDate(e.date),
                                "Security Deposit Ledger": e.deposit_ledger,
                                Reference: e.bill_ref,
                                "Voucher Type": e.voucher_type,
                                "Voucher No": e.voucher_no,
                                Debit: e.debit || "",
                                Credit: e.credit || "",
                                Balance: isZero(held) ? "" : held,
                            };
                        }),
                ]),
                "Security Deposits"
            );
        }

        // Bill-wise details of the selected tab.
        const pendingRows = shownBills.map((b) => ({
            Date: formatTallyDate(b.bill_date),
            "Bill Ref": b.bill_ref,
            "Opening Amount": b.bill_amount,
            "Pending Amount": Math.abs(b.balance) < 1 ? "Cleared" : b.balance,
            "Due On": formatTallyDate(b.due_date),
            "Days Overdue": b.overdue_days > 0 ? b.overdue_days : "",
        }));

        if (showOnAccount) {
            pendingRows.push({
                Date: formatTallyDate(asOf),
                "Bill Ref": "On Account Details",
                "Opening Amount": report.onAccount,
                "Pending Amount": report.onAccount,
            });
        }

        pendingRows.push({
            "Bill Ref": "TOTALS",
            "Opening Amount": shownOpening + (showOnAccount ? report.onAccount : 0),
            "Pending Amount": shownPending + (showOnAccount ? report.onAccount : 0),
        });

        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.json_to_sheet(pendingRows),
            `Bill-wise (${billTabs.find((t) => t.key === billTab).label})`
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
            <div
                style={{
                    ...tHeading,
                    paddingTop: "10px",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: "14px",
                }}
            >
                <span>Ledger Details</span>
                <span style={{ display: "flex", gap: "6px" }}>
                    <button
                        type="button"
                        onClick={() => setLedgerTab("supply")}
                        style={{ ...buttonStyle(ledgerTab === "supply"), padding: "3px 12px", fontSize: "12px" }}
                    >
                        Supply Chain
                    </button>
                    <button
                        type="button"
                        onClick={() => setLedgerTab("deposits")}
                        style={{ ...buttonStyle(ledgerTab === "deposits"), padding: "3px 12px", fontSize: "12px" }}
                    >
                        Security Deposit{depositCount ? ` (${depositCount})` : ""}
                    </button>
                </span>
            </div>
            {ledgerTab === "deposits" ? (
                <LedgerDepositEntries deposits={ledger.deposits || []} detailed={detailed} fromDate={fromDate} />
            ) : (
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
                            the real opening balance comes from Tally. A click shows
                            the bill-wise break up (Tally XML). */}
                        <tr
                            onClick={() => setShowOpening((s) => !s)}
                            title="Click to see the opening balance break up"
                            style={{ cursor: "pointer", background: showOpening ? "#E2E8F0" : "transparent" }}
                        >
                            <td style={tCell}>{formatTallyDate(fromDate)}</td>
                            <td style={{ ...tCell, fontWeight: "800", letterSpacing: "3px" }}>
                                <span style={{ display: "inline-block", width: "14px", letterSpacing: 0, color: "#64748B" }}>
                                    {showOpening ? "▾" : "▸"}
                                </span>
                                Opening Balance
                            </td>
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

                        {showOpening && (
                            <tr>
                                <td colSpan={7} style={{ padding: "0 8px" }}>
                                    <OpeningBreakup
                                        breakup={ledger.openingBreakup}
                                        openingBalance={report.hasOpening ? report.opening : null}
                                        openingDate={fromDate}
                                        source={openingSource}
                                    />
                                </td>
                            </tr>
                        )}

                        {report.entries.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ ...tCell, padding: "6px 8px", color: "#64748B" }}>
                                    No transactions in this period.
                                </td>
                            </tr>
                        )}

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

                    {/* LEDGER SUMMARY, like Tally: each amount right aligned under
                        its own column (same cells as the rows above), the label
                        in Particulars. */}
                    <tfoot>
                        <tr style={{ borderTop: "1px solid #94A3B8" }}>
                            <td style={{ ...tCell, paddingTop: "6px" }} />
                            <td colSpan={6} style={{ ...tCell, ...tSection, paddingTop: "6px" }}>
                                Ledger Summary
                            </td>
                        </tr>
                        {[
                            {
                                label: "Opening Balance",
                                debit: report.hasOpening && report.opening > 0 ? report.opening : 0,
                                credit: report.hasOpening && report.opening < 0 ? -report.opening : 0,
                                balance: report.hasOpening ? formatDrCr(report.opening) : "",
                                color: "#1D4ED8",
                            },
                            {
                                label: "Debit Total / Credit Total",
                                debit: report.debits,
                                credit: report.credits,
                                balance: "",
                                color: "#1F2937",
                            },
                            {
                                label: "Closing Balance",
                                debit: 0,
                                credit: 0,
                                balance: report.hasOpening ? formatDrCr(report.closing) : "",
                                color: "#0B2545",
                                bold: true,
                            },
                        ].map((r) => (
                            <tr
                                key={r.label}
                                style={{ borderTop: r.bold ? "1px solid #94A3B8" : "none" }}
                            >
                                <td style={tCell} />
                                <td style={{ ...tCell, fontWeight: "700" }}>{r.label}</td>
                                <td style={tCell} />
                                <td style={tCell} />
                                <td style={{ ...tCellRight, fontWeight: "700", color: r.color }}>{formatTally(r.debit)}</td>
                                <td style={{ ...tCellRight, fontWeight: "700", color: r.color }}>
                                    {formatTally(r.credit)}
                                </td>
                                <td style={{ ...tCellRight, fontWeight: r.bold ? "800" : "700", color: r.color }}>{r.balance}</td>
                            </tr>
                        ))}

                        {Math.abs(report.unmatched) >= 1 && (
                            <tr>
                                <td colSpan={7} style={{ ...tCell, whiteSpace: "normal", padding: "4px 8px", fontSize: "12px", fontWeight: "700", color: "#B45309" }}>
                                    {formatDrCr(report.unmatched)} of the closing balance is not in the bills below
                                    (opening bills or receipts missing from the data)
                                </td>
                            </tr>
                        )}
                    </tfoot>
                </table>
            </div>
            )}

            {/* BILL-WISE DETAILS: Pending / Overdue / All */}
            <div
                style={{
                    ...tHeading,
                    paddingTop: "10px",
                    marginTop: "10px",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    // Tabs right next to the heading.
                    justifyContent: "flex-start",
                    gap: "14px",
                }}
            >
                <span>Bill-wise Details</span>
                <span style={{ display: "flex", gap: "6px" }}>
                    {billTabs.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setBillTab(t.key)}
                            style={{ ...buttonStyle(billTab === t.key), padding: "3px 12px", fontSize: "12px" }}
                        >
                            {t.label}
                            {t.count ? ` (${t.count})` : ""}
                        </button>
                    ))}
                </span>
            </div>
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
                        {shownBills.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ ...tCell, padding: "12px 8px", color: "#64748B" }}>
                                    {billTab === "overdue" ? "No overdue bills." : billTab === "all" ? "No bills." : "No pending bills."}
                                </td>
                            </tr>
                        )}

                        {shownBills.map((b) => {
                            const highlight = oldestOverdue && b === oldestOverdue;
                            const overdue = b.overdue_days > 0;
                            // Cleared bills (All tab) in grey, like Tally's settled bills.
                            const cleared = Math.abs(b.balance) < 1;

                            // Click a bill to explode its sales voucher.
                            const key = `bill|${b.bill_ref}`;
                            const expanded = Boolean(b.detail) && detailed !== toggled.has(key);

                            return (
                                <React.Fragment key={`${b.bill_ref}|${b.bill_date}`}>
                                <tr
                                    onClick={b.detail ? () => toggleRow(key) : undefined}
                                    title={b.detail ? "Click to see the bill details" : ""}
                                    style={{
                                        cursor: b.detail ? "pointer" : "default",
                                        color: cleared ? "#64748B" : "inherit",
                                        background: highlight ? "#FBBF24" : expanded && !detailed ? "#E2E8F0" : "transparent",
                                    }}
                                >
                                    <td style={{ ...tCellRight, fontWeight: overdue ? "700" : "400" }}>
                                        {formatTallyDate(b.bill_date)}
                                    </td>
                                    <td style={tCell}>
                                        {b.detail && (
                                            <span style={{ display: "inline-block", width: "14px", color: "#64748B" }}>
                                                {expanded ? "▾" : "▸"}
                                            </span>
                                        )}
                                        {b.bill_ref}
                                    </td>
                                    <td style={tCellRight}>{formatDrCr(b.bill_amount)}</td>
                                    <td style={{ ...tCellRight, fontWeight: overdue ? "800" : "400" }}>
                                        {formatDrCr(b.balance)}
                                    </td>
                                    <td style={{ ...tCell, fontStyle: "italic" }}>{formatTallyDate(b.due_date)}</td>
                                    <td style={{ ...tCellRight, fontStyle: "italic" }}>{overdue ? b.overdue_days : ""}</td>
                                </tr>

                                {expanded && (
                                    <tr>
                                        <td />
                                        <td colSpan={5} style={{ padding: "0 8px" }}>
                                            <VoucherDetails detail={b.detail} />
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                            );
                        })}

                        {showOnAccount && (
                            <>
                                <tr>
                                    <td style={tCell} />
                                    <td style={{ ...tCell, fontWeight: "700", paddingLeft: "20px" }}>Sub Total</td>
                                    <td style={{ ...tCellRight, borderTop: "1px solid #94A3B8" }}>
                                        {formatDrCr(shownOpening)}
                                    </td>
                                    <td style={{ ...tCellRight, borderTop: "1px solid #94A3B8" }}>
                                        {formatDrCr(shownPending)}
                                    </td>
                                    <td style={tCell} />
                                    <td style={tCell} />
                                </tr>
                                <tr>
                                    <td style={{ ...tCellRight, fontWeight: "700", fontStyle: "italic" }}>
                                        {formatTallyDate(asOf)}
                                    </td>
                                    <td style={{ ...tCell, fontStyle: "italic" }}>On Account Details</td>
                                    <td style={{ ...tCellRight, fontStyle: "italic" }}>{formatDrCr(report.onAccount)}</td>
                                    <td style={{ ...tCellRight, fontWeight: "800" }}>{formatDrCr(report.onAccount)}</td>
                                    <td style={tCell} />
                                    <td style={tCell} />
                                </tr>
                            </>
                        )}

                        <tr>
                            <td style={{ ...tCell, paddingTop: "14px" }} />
                            <td style={{ ...tCell, ...tSection, paddingTop: "14px" }}>TOTALS</td>
                            <td style={{ ...tCellRight, paddingTop: "14px", borderTop: "1px solid #94A3B8" }}>
                                {formatDrCr(shownOpening + (showOnAccount ? report.onAccount : 0))}
                            </td>
                            <td style={{ ...tCellRight, paddingTop: "14px", fontWeight: "800", borderTop: "1px solid #94A3B8" }}>
                                {formatDrCr(shownPending + (showOnAccount ? report.onAccount : 0))}
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
                                <th key={s.label} style={{ ...tHead, textAlign: "right" }}>
                                    {s.label}
                                </th>
                            ))}
                            <th style={{ ...tHead, textAlign: "right" }}>On Account</th>
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
                                        style={{ ...tCell, textAlign: "right", color: "#1D4ED8", borderBottom: "1px solid #E2E8F0" }}
                                    >
                                        {Math.abs(v) >= 1 ? formatDrCr(v) : ""}
                                    </td>
                                ))}
                                <td style={{ ...tCell, textAlign: "right", color: "#7C3AED", borderBottom: "1px solid #E2E8F0" }}>
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
// RECEIPTS LIST
// =========================================================

/*
  Every receipt allocation (newest first) with the bill it was set
  against. A receipt against several bills shows one row per bill.
  Click a row for that ledger's report.
*/
const ReceiptsTable = ({ receipts, showDistribution, onOpenLedger }) => {
    const total = receipts.reduce((t, r) => t + r.amount, 0);

    return (
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
            <thead>
                <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>KSEB Ledger</th>
                    {showDistribution && <th style={thStyle}>Distribution</th>}
                    <th style={thStyle}>Against Bill</th>
                    <th style={thStyle}>Bill Date</th>
                    <th style={thStyle}>Adjusted To</th>
                    <th style={thRight}>Bill Balance</th>
                    <th style={thRight}>Received</th>
                </tr>
            </thead>
            <tbody>
                {receipts.map((r, i) => {
                    const adjusted = ADJUSTED_TO[r.adjusted_to] || { label: r.adjusted_to, color: "#1F2937" };

                    return (
                        <tr
                            key={`${r.sales_id}-${r.bill_ref}-${i}`}
                            onClick={() => onOpenLedger(r.party)}
                            style={{ cursor: "pointer" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#EFF6FF")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                        >
                            <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatTallyDate(r.date)}</td>
                            <td style={{ ...tdStyle, fontWeight: "700" }}>
                                {r.party}
                                {r.executive && (
                                    <div style={{ fontSize: "11px", color: "#64748B", fontWeight: "500" }}>{r.executive}</div>
                                )}
                            </td>
                            {showDistribution && <td style={tdStyle}>{r.distribution}</td>}
                            <td style={tdStyle}>{r.bill_ref}</td>
                            <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatTallyDate(r.bill_date)}</td>
                            <td style={{ ...tdStyle, color: adjusted.color, fontWeight: "700" }}>
                                {adjusted.label}
                                {r.narration && (
                                    <div style={{ fontSize: "11px", color: "#64748B", fontWeight: "500" }}>{r.narration}</div>
                                )}
                            </td>
                            <td style={tdRight}>
                                {r.bill_balance === null || r.bill_balance === undefined
                                    ? ""
                                    : Math.abs(r.bill_balance) < 1
                                      ? "Cleared"
                                      : formatAmount(r.bill_balance)}
                            </td>
                            <td style={{ ...tdRight, color: "#166534", fontWeight: "700" }}>{formatAmount(r.amount)}</td>
                        </tr>
                    );
                })}

                <tr style={{ background: "#E2E8F0" }}>
                    <td style={{ ...tdStyle, fontWeight: "800" }}>TOTAL</td>
                    <td style={tdStyle} />
                    {showDistribution && <td style={tdStyle} />}
                    <td style={tdStyle} />
                    <td style={tdStyle} />
                    <td style={tdStyle} />
                    <td style={tdRight} />
                    <td style={{ ...tdRight, fontWeight: "800", color: "#166534" }}>{formatAmount(total)}</td>
                </tr>
            </tbody>
        </table>
    );
};

// =========================================================
// SECURITY DEPOSITS LIST
// =========================================================

/*
  Security deposits / retention held by KSEB, one row per KSEB ledger,
  deposit ledger and reference (LPO): deposited, refunded and the
  balance still held. Click a row for that ledger's report.
*/
const DepositsTable = ({ deposits, showDistribution, onOpenLedger, canOpen }) => {
    const total = (field) => deposits.reduce((t, d) => t + d[field], 0);

    return (
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1000px" }}>
            <thead>
                <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>KSEB Ledger</th>
                    {showDistribution && <th style={thStyle}>Distribution</th>}
                    <th style={thStyle}>Security Deposit Ledger</th>
                    <th style={thStyle}>Reference</th>
                    <th style={thRight}>Credit Period</th>
                    <th style={thStyle}>Due on</th>
                    <th style={thRight}>Deposited</th>
                    <th style={thRight}>Refunded</th>
                    <th style={thRight}>Balance</th>
                </tr>
            </thead>
            <tbody>
                {deposits.map((d, i) => {
                    const clickable = canOpen(d.party);

                    return (
                        <tr
                            key={`${d.party}|${d.deposit_ledger}|${d.bill_ref}|${i}`}
                            onClick={clickable ? () => onOpenLedger(d.party) : undefined}
                            style={{ cursor: clickable ? "pointer" : "default" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#EFF6FF")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                        >
                            <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatTallyDate(d.date)}</td>
                            <td style={{ ...tdStyle, fontWeight: "700" }}>
                                {d.party}
                                {d.executive && (
                                    <div style={{ fontSize: "11px", color: "#64748B", fontWeight: "500" }}>{d.executive}</div>
                                )}
                            </td>
                            {showDistribution && <td style={tdStyle}>{d.distribution}</td>}
                            <td style={tdStyle}>{d.deposit_ledger}</td>
                            <td style={tdStyle}>{d.bill_ref}</td>
                            <td style={tdRight}>{d.credit_days ? `${d.credit_days} Days` : ""}</td>
                            <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatTallyDate(d.due_date)}</td>
                            <td style={tdRight}>{formatAmount(d.deposited)}</td>
                            <td style={{ ...tdRight, color: "#166534" }}>{formatAmount(d.refunded)}</td>
                            <td style={{ ...tdRight, fontWeight: "700", color: "#0B2545" }}>{formatAmount(d.balance)}</td>
                        </tr>
                    );
                })}

                <tr style={{ background: "#E2E8F0" }}>
                    <td style={{ ...tdStyle, fontWeight: "800" }}>TOTAL</td>
                    <td style={tdStyle} />
                    {showDistribution && <td style={tdStyle} />}
                    <td style={tdStyle} />
                    <td style={tdStyle} />
                    <td style={tdRight} />
                    <td style={tdStyle} />
                    <td style={{ ...tdRight, fontWeight: "800" }}>{formatAmount(total("deposited"))}</td>
                    <td style={{ ...tdRight, fontWeight: "800", color: "#166534" }}>{formatAmount(total("refunded"))}</td>
                    <td style={{ ...tdRight, fontWeight: "800", color: "#0B2545" }}>{formatAmount(total("balance"))}</td>
                </tr>
            </tbody>
        </table>
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
    const [receipts, setReceipts] = useState([]);
    const [openingBalances, setOpeningBalances] = useState({});
    const [openingBreakup, setOpeningBreakup] = useState({});
    // Security deposits held by KSEB (deposit ledger + LPO reference).
    const [securityDeposits, setSecurityDeposits] = useState([]);
    const [vouchers, setVouchers] = useState({});
    const [warnings, setWarnings] = useState([]);
    // Where the opening bills (Tally XML) came from, and when.
    const [openingSource, setOpeningSource] = useState({ source: "", updated: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [distribution, setDistribution] = useState("all");
    const [selectedParty, setSelectedParty] = useState(null);
    const [search, setSearch] = useState("");
    // "ledgers", "receipts" or "deposits" list on the right.
    const [view, setView] = useState("ledgers");

    // =====================================================
    // LOAD
    // =====================================================

    // refresh = ask Tally again even when the server's saved XML is recent.
    const loadOutstanding = async (refresh = false) => {
        setLoading(true);
        setError("");

        try {
            const params = new URLSearchParams({
                from_date: fromDate,
                to_date: asOf,
                as_of: asOf,
            });

            if (refresh) params.set("refresh", "1");

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
            // Every receipt allocation (kseb_receipts) with the bill it went to.
            setReceipts(Array.isArray(result.receipts) ? result.receipts : []);
            // { "<ledger name>": amount } — Dr positive, Cr negative.
            // From salesdatalatest33 Ledger.$OpeningBalance (as on 1st April).
            setOpeningBalances(
                result.opening_balances && typeof result.opening_balances === "object"
                    ? result.opening_balances
                    : {}
            );
            // { "<ledger name>": { total, xml_total, bills } } — opening
            // balance break up from the Tally XML (LOB Report).
            setOpeningBreakup(
                result.opening_breakup && typeof result.opening_breakup === "object"
                    ? result.opening_breakup
                    : {}
            );
            setSecurityDeposits(Array.isArray(result.security_deposits) ? result.security_deposits : []);
            // { "<Sales ID>": { ledgers, allocations, ... } } — Tally voucher details.
            setVouchers(
                result.vouchers && typeof result.vouchers === "object" ? result.vouchers : {}
            );
            // Missing receipts, Tally offline, opening bills not matching ...
            setWarnings(Array.isArray(result.warnings) ? result.warnings : []);
            setOpeningSource({
                source: result.opening_bills_source || "",
                updated: result.opening_bills_updated || "",
            });
        } catch (err) {
            setError(err.message || "Failed to load KSEB outstanding");
            setBills([]);
            setOnAccount([]);
            setOlderReceipts([]);
            setReceipts([]);
            setOpeningBalances({});
            setOpeningBreakup({});
            setSecurityDeposits([]);
            setVouchers({});
            setWarnings([]);
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

        // Break up by ledger key, so a small difference in the name
        // (case / spaces) still finds it.
        const breakupByKey = new Map(
            Object.entries(openingBreakup).map(([name, value]) => [ledgerKey(name), value])
        );

        const getRow = (party, src) => {
            if (!map.has(party)) {
                const breakup = breakupByKey.get(ledgerKey(party)) || null;

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
                    received: 0,
                    maxOverdue: 0,
                    bills: [],
                    onAccountLines: [],
                    older: [],
                    // Security deposits held by KSEB for this ledger.
                    deposits: [],
                    openingBreakup: breakup,
                    // salesdatalatest33 first; else the Tally XML total
                    // (the bills pending on 1st April add up to it).
                    openingBalance: (() => {
                        const value = openingBalances[party] ?? openingBalances[String(party).trim()];

                        if (value !== undefined && value !== null) return Number(value);

                        if (breakup) return Number(breakup.xml_total ?? breakup.total);

                        return null;
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

        receipts.forEach((r) => {
            getRow(r.party, r).received += r.amount;
        });

        securityDeposits.forEach((d) => {
            getRow(d.party, d).deposits.push(d);
        });

        return [...map.values()]
            .map((r) => ({ ...r, net: r.pending - r.onAccount - r.excess }))
            .sort((a, b) => b.net - a.net || b.billed - a.billed);
    }, [bills, onAccount, olderReceipts, receipts, openingBalances, openingBreakup, securityDeposits]);

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
                    received: t.received + l.received,
                    onAccount: t.onAccount + l.onAccount,
                    net: t.net + l.net,
                }),
                { pending: 0, overdue: 0, received: 0, onAccount: 0, net: 0 }
            ),
        [listedLedgers]
    );

    const listedReceipts = useMemo(() => {
        const term = search.trim().toLowerCase();

        return receipts.filter(
            (r) =>
                (distribution === "all" || r.distribution === distribution) &&
                (!term || r.party.toLowerCase().includes(term) || String(r.bill_ref).toLowerCase().includes(term))
        );
    }, [receipts, distribution, search]);

    // Received this year in the selected distribution (sidebar).
    const receivedTotal = useMemo(
        () =>
            receipts
                .filter((r) => distribution === "all" || r.distribution === distribution)
                .reduce((t, r) => t + r.amount, 0),
        [receipts, distribution]
    );

    const ledger = ledgers.find((l) => l.party === selectedParty) || null;

    const selectDistribution = (name) => {
        setDistribution(name);
        setSelectedParty(null);
        setSearch("");
    };

    const openLedger = (party) => {
        setSelectedParty(party);
        window.scrollTo({ top: 0 });
    };

    const listedDeposits = useMemo(() => {
        const term = search.trim().toLowerCase();

        return securityDeposits.filter(
            (d) =>
                (distribution === "all" || d.distribution === distribution) &&
                (!term ||
                    d.party.toLowerCase().includes(term) ||
                    String(d.deposit_ledger).toLowerCase().includes(term) ||
                    String(d.bill_ref).toLowerCase().includes(term))
        );
    }, [securityDeposits, distribution, search]);

    // A deposit row opens its ledger report when that ledger is listed.
    const canOpenLedger = (party) => ledgers.some((l) => l.party === party);

    const exportDeposits = () => {
        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.json_to_sheet(
                listedDeposits.map((d) => ({
                    Date: formatTallyDate(d.date),
                    "KSEB Ledger": d.party,
                    Executive: d.executive,
                    Distribution: d.distribution,
                    "Security Deposit Ledger": d.deposit_ledger,
                    Reference: d.bill_ref,
                    "Credit Days": d.credit_days || "",
                    "Due On": formatTallyDate(d.due_date),
                    Deposited: d.deposited || "",
                    Refunded: d.refunded || "",
                    Balance: d.balance || "",
                }))
            ),
            "Security Deposits"
        );

        XLSX.writeFile(
            workbook,
            `KSEB_Security_Deposits_${(distribution === "all" ? "All" : distribution).replace(/[\\/:*?"<>|]/g, "_")}_${asOf}.xlsx`
        );
    };

    const exportReceipts = () => {
        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.json_to_sheet(
                listedReceipts.map((r) => ({
                    Date: formatTallyDate(r.date),
                    "KSEB Ledger": r.party,
                    Executive: r.executive,
                    Distribution: r.distribution,
                    "Against Bill": r.bill_ref,
                    "Bill Date": formatTallyDate(r.bill_date),
                    "Adjusted To": ADJUSTED_TO[r.adjusted_to]?.label || r.adjusted_to,
                    "Bill Balance": r.bill_balance ?? "",
                    Received: r.amount,
                    Note: r.narration || "",
                }))
            ),
            "Receipts"
        );

        XLSX.writeFile(
            workbook,
            `KSEB_Receipts_${(distribution === "all" ? "All" : distribution).replace(/[\\/:*?"<>|]/g, "_")}_${asOf}.xlsx`
        );
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

                    <div style={{ marginTop: "12px" }}>
                        <div style={labelStyle}>RECEIVED SINCE {formatTallyDate(fromDate).toUpperCase()}</div>
                        <div style={{ fontSize: "22px", fontWeight: "800", marginTop: "4px", color: "#166534" }}>
                            {formatCompact(receivedTotal)}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => selectDistribution("all")}
                        style={{ ...buttonStyle(distribution === "all"), width: "100%", marginTop: "14px" }}
                    >
                        Overall (All Distributions)
                    </button>

                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => loadOutstanding(true)}
                        title="Fetch the opening bills (LOB Report) from Tally again"
                        style={{ ...buttonStyle(false), width: "100%", marginTop: "8px", opacity: loading ? 0.6 : 1 }}
                    >
                        {loading ? "Loading..." : "Refresh from Tally"}
                    </button>

                    {openingSource.updated && (
                        <div style={{ fontSize: "11px", color: "#64748B", marginTop: "8px", textAlign: "center" }}>
                            Opening bills: {openingSource.source === "tally" ? "Tally" : "saved copy"},{" "}
                            {formatTallyDate(openingSource.updated.slice(0, 10))} {openingSource.updated.slice(11, 16)}
                        </div>
                    )}
                </div>

                {/* =============================================
                    RIGHT: LEDGER / RECEIPTS LIST  /  LEDGER REPORT
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

                    {warnings.length > 0 && (
                        <div
                            style={{
                                marginBottom: "12px",
                                padding: "10px 14px",
                                borderRadius: "8px",
                                background: "#FEF3C7",
                                color: "#92400E",
                                fontSize: "12px",
                                fontWeight: "600",
                                display: "grid",
                                gap: "4px",
                            }}
                        >
                            {warnings.map((w) => (
                                <div key={w}>{w}</div>
                            ))}
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
                                    ← Back to {view === "receipts" ? "receipts" : view === "deposits" ? "security deposits" : "ledgers"}
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
                                openingSource={openingSource}
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
                                        {view === "receipts"
                                            ? `${listedReceipts.length} receipt entries • click one for its ledger report`
                                            : view === "deposits"
                                              ? `${listedDeposits.length} security deposits • click one for its ledger report`
                                              : `${listedLedgers.length} ledgers • click a ledger for its ledger report`}
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                                    <button type="button" onClick={() => setView("ledgers")} style={buttonStyle(view === "ledgers")}>
                                        Ledgers
                                    </button>
                                    <button type="button" onClick={() => setView("receipts")} style={buttonStyle(view === "receipts")}>
                                        Receipts
                                    </button>
                                    <button type="button" onClick={() => setView("deposits")} style={buttonStyle(view === "deposits")}>
                                        Security Deposit
                                    </button>
                                    {view === "receipts" && (
                                        <button
                                            type="button"
                                            onClick={exportReceipts}
                                            disabled={!listedReceipts.length}
                                            style={buttonStyle(false)}
                                        >
                                            Export Excel
                                        </button>
                                    )}
                                    {view === "deposits" && (
                                        <button
                                            type="button"
                                            onClick={exportDeposits}
                                            disabled={!listedDeposits.length}
                                            style={buttonStyle(false)}
                                        >
                                            Export Excel
                                        </button>
                                    )}

                                    <input
                                        type="text"
                                        value={search}
                                        placeholder={
                                            view === "receipts"
                                                ? "Search ledger / bill..."
                                                : view === "deposits"
                                                  ? "Search ledger / reference..."
                                                  : "Search ledger..."
                                        }
                                        onChange={(e) => setSearch(e.target.value)}
                                        style={{ ...inputStyle, width: "240px" }}
                                    />
                                </div>
                            </div>

                            <div style={{ overflow: "auto", maxHeight: "75vh" }}>
                                {loading ? (
                                    <div style={emptyStyle}>Loading KSEB outstanding...</div>
                                ) : view === "deposits" ? (
                                    listedDeposits.length ? (
                                        <DepositsTable
                                            deposits={listedDeposits}
                                            showDistribution={distribution === "all"}
                                            onOpenLedger={openLedger}
                                            canOpen={canOpenLedger}
                                        />
                                    ) : (
                                        <div style={emptyStyle}>No security deposits found.</div>
                                    )
                                ) : view === "receipts" ? (
                                    listedReceipts.length ? (
                                        <ReceiptsTable
                                            receipts={listedReceipts}
                                            showDistribution={distribution === "all"}
                                            onOpenLedger={openLedger}
                                        />
                                    ) : (
                                        <div style={emptyStyle}>No receipts found.</div>
                                    )
                                ) : listedLedgers.length ? (
                                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
                                        <thead>
                                            <tr>
                                                <th style={thStyle}>KSEB Ledger</th>
                                                {distribution === "all" && <th style={thStyle}>Distribution</th>}
                                                <th style={thRight}>Pending Bills</th>
                                                <th style={thRight}>Pending</th>
                                                <th style={thRight}>Overdue</th>
                                                <th style={thRight}>Received</th>
                                                <th style={thRight}>On Account</th>
                                                <th style={thRight}>Net Outstanding</th>
                                                <th style={thRight}>Oldest Overdue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {listedLedgers.map((l) => (
                                                <tr
                                                    key={l.party}
                                                    onClick={() => openLedger(l.party)}
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
                                                    <td style={tdRight}>{l.pendingCount || ""}</td>
                                                    <td style={{ ...tdRight, color: "#B91C1C", fontWeight: "700" }}>
                                                        {formatAmount(l.pending)}
                                                    </td>
                                                    <td style={{ ...tdRight, color: "#EA580C" }}>
                                                        {formatAmount(l.overdue)}
                                                    </td>
                                                    <td style={{ ...tdRight, color: "#166534" }}>
                                                        {formatAmount(l.received)}
                                                    </td>
                                                    <td style={{ ...tdRight, color: "#7C3AED" }}>
                                                        {formatAmount(l.onAccount)}
                                                    </td>
                                                    <td style={{ ...tdRight, fontWeight: "800", color: "#0B2545" }}>
                                                        {formatAmount(l.net)}
                                                    </td>
                                                    <td style={tdRight}>{l.maxOverdue > 0 ? `${l.maxOverdue} d` : ""}</td>
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
                                                <td style={{ ...tdRight, fontWeight: "800", color: "#166534" }}>
                                                    {formatAmount(listTotal.received)}
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
