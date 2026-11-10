import React, { useEffect, useMemo, useState } from "react";
import { callTracking } from "./KsebInvoiceTrackingModal.jsx";

/*
| PAYMENT DETAILS POP-UP (Tally ledger style)
|
| Opened from the Tracking column of the KSEB Invoices page (click the
| "Bank: ₹ ..." amount or the Payment Completed badge).
|
| Reads the Tally receipt vouchers of one invoice (action "get" of
| kseb_invoice_tracking.php) and shows them like the Tally ledger:
|
|   Invoice line          GST State Sales   Debit  (invoice amount)
|   Receipt line          (as per details)  Credit (amount settled)
|       SBI ... CA                          Dr
|       Security Deposit with KSEB ...      Dr
|       TDS @ 1% CGST / SGST, TDS Receivable, Penalty - KSEB ...  Dr
|       Agst Ref <invoice no>   NN Days     Cr
|   Ledger Summary: Debit Total / Credit Total / Closing Balance
*/

const NAVY = "#14325c";
const GREEN = "#05693a";
const BORDER = "#d9dee5";

// Deduction ledgers are named freely in Tally, so the type is worked
// out from the ledger name (only used for the totals at the top).
const DEDUCTION_TYPES = [
    { key: "GST_TDS", label: "GST TDS", test: /tds.*(cgst|sgst|igst)|(cgst|sgst|igst).*tds/i, bg: "#e6f6f4", fg: "#0f766e" },
    { key: "TDS", label: "TDS", test: /\btds\b|income\s*tax|194/i, bg: "#e8f1fb", fg: "#1d5fa8" },
    { key: "TCS", label: "TCS", test: /\btcs\b/i, bg: "#eef0ff", fg: "#4338ca" },
    { key: "SD", label: "Security Deposit", test: /security|\bsd\b|deposit|emd/i, bg: "#fff4d6", fg: "#8a6100" },
    { key: "RETENTION", label: "Retention", test: /retention|withheld/i, bg: "#fff4d6", fg: "#8a6100" },
    { key: "PENALTY", label: "Penalty / LD", test: /penal|\bld\b|liquidated|fine\b/i, bg: "#fdecec", fg: "#b42318" },
    { key: "CESS", label: "Cess", test: /cess|welfare/i, bg: "#f3eefe", fg: "#6b21a8" },
    { key: "ROUND", label: "Round Off", test: /round/i, bg: "#eef0ef", fg: "#555" }
];

const getDeductionType = (ledger) =>
    DEDUCTION_TYPES.find((type) => type.test.test(String(ledger || ""))) || {
        key: "OTHER",
        label: "Other",
        bg: "#eef0ef",
        fg: "#555"
    };

const formatAmount = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const toIsoDate = (value) => {
    const text = String(value || "").trim();
    let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    m = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);

    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

// Tally style: 3-Aug-26
const formatDate = (value) => {
    const iso = toIsoDate(value);

    if (!iso) return String(value || "");

    const [year, month, day] = iso.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return `${day}-${months[month - 1]}-${String(year).slice(-2)}`;
};

const daysBetween = (from, to) => {
    const a = toIsoDate(from);
    const b = toIsoDate(to);

    if (!a || !b) return null;

    return Math.round(
        (new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000
    );
};

// inline = true: shown inside the invoice table (expanded row) instead
// of a pop-up window.
const KsebPaymentDetailsModal = ({ invoice, onClose, inline = false }) => {
    const invoiceNo = String(
        invoice?.invoice_no || invoice?.VoucherNumber || ""
    ).trim();
    const invoiceDate = String(
        invoice?.invoice_date || invoice?.Date || ""
    ).trim();
    const partyName = String(
        invoice?.party_name || invoice?.PartyLedgerName || ""
    ).trim();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [details, setDetails] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError("");

            try {
                const result = await callTracking({
                    action: "get",
                    invoice_no: invoiceNo,
                    invoice_date: invoiceDate,
                    invoice_amount: invoice?.invoice_amount ?? ""
                });

                if (!cancelled) setDetails(result);
            } catch (err) {
                if (!cancelled) setError(err.message || "Could not load payment details");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        if (invoiceNo) load();

        return () => {
            cancelled = true;
        };
    }, [invoiceNo, invoiceDate, invoice?.invoice_amount]);

    // Close with Escape.
    useEffect(() => {
        if (inline) return undefined;

        const onKey = (event) => {
            if (event.key === "Escape") onClose();
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, inline]);

    const receipts = useMemo(
        () => (Array.isArray(details?.receipts) ? details.receipts : []),
        [details]
    );

    const invoiceAmount = Number(
        details?.invoice_amount ?? invoice?.invoice_amount ?? 0
    );
    const received = Number(details?.received_amount || 0);
    const bankAmount = Number(details?.bank_amount || 0);
    const deductionsTotal = Number(details?.deductions_amount || 0);
    const balance = Math.max(invoiceAmount - received, 0);
    const isPaid =
        Boolean(details?.closed) || (invoiceAmount > 0 && balance <= 1);

    // Credit total = everything settled by receipts that reached the bank.
    const creditTotal = receipts
        .filter((r) => r.credited_to_bank)
        .reduce((sum, r) => sum + Number(r.settled_amount || 0), 0);

    // Totals per deduction type (TDS, Security Deposit, Penalty ...).
    const typeTotals = useMemo(() => {
        const totals = {};

        receipts
            .filter((r) => r.credited_to_bank)
            .forEach((r) => {
                (r.deductions || []).forEach((d) => {
                    const type = getDeductionType(d.ledger);

                    if (!totals[type.key]) totals[type.key] = { ...type, amount: 0 };
                    totals[type.key].amount += Number(d.amount || 0);
                });
            });

        return Object.values(totals).filter((t) => Math.abs(t.amount) >= 0.005);
    }, [receipts]);

    // Detail lines of one receipt: bank account(s), then deductions.
    const getReceiptLines = (r) => {
        const lines = [];

        if (Array.isArray(r.bank_lines) && r.bank_lines.length) {
            r.bank_lines.forEach((b) =>
                lines.push({ ledger: b.ledger, amount: Number(b.amount || 0) })
            );
        } else if (Number(r.bank_amount || 0) !== 0) {
            // Older server file: one line with this invoice's bank share.
            lines.push({
                ledger: (r.bank_accounts || []).join(", ") || "Bank",
                amount: Number(r.bank_amount || 0)
            });
        }

        (r.deductions || []).forEach((d) =>
            lines.push({ ledger: d.ledger, amount: Number(d.amount || 0) })
        );

        // Share of a multi-invoice voucher can leave a few paise.
        const listed = lines.reduce((sum, l) => sum + l.amount, 0);
        const diff = Math.round((Number(r.settled_amount || 0) - listed) * 100) / 100;

        if (Math.abs(diff) >= 0.01) {
            lines.push({ ledger: "Rounding difference", amount: diff });
        }

        return lines.filter((l) => Math.abs(l.amount) >= 0.005);
    };

    // ---------- styles ----------
    const cell = {
        padding: "6px 10px",
        borderBottom: `1px solid ${BORDER}`,
        borderRight: `1px solid ${BORDER}`,
        fontSize: "12px",
        textAlign: "left",
        verticalAlign: "middle",
        overflowWrap: "anywhere"
    };
    const num = {
        ...cell,
        textAlign: "right",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums"
    };
    const head = {
        ...cell,
        background: "#f1f4f8",
        color: NAVY,
        fontWeight: 700,
        fontSize: "11px",
        whiteSpace: "nowrap"
    };
    const detailCell = {
        padding: "5px 12px",
        borderBottom: `1px solid ${BORDER}`,
        borderRight: `1px solid ${BORDER}`,
        fontSize: "11.5px",
        textAlign: "left",
        background: "#fbfcfd"
    };

    const drcr = (amount, side) => (
        <>
            {formatAmount(Math.abs(amount))} <span style={{ fontWeight: 400 }}>{side}</span>
        </>
    );

    // ---------- receipt block ----------
    const renderReceipt = (r, index) => {
        const lines = getReceiptLines(r);
        const days = daysBetween(invoiceDate, r.date);

        return (
            <React.Fragment key={`${r.voucher_id}-${index}`}>
                <tr style={{ background: "#e3e8ef" }}>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{formatDate(r.date)}</td>
                    <td style={{ ...cell, fontWeight: 700 }}>
                        (as per details)
                        {!r.credited_to_bank && (
                            <span style={{ marginLeft: "6px", fontSize: "10px", fontWeight: 700, color: "#b42318" }}>
                                NOT CREDITED TO BANK
                            </span>
                        )}
                    </td>
                    <td style={cell}>Receipt</td>
                    <td style={cell}>{r.voucher_id || ""}</td>
                    <td style={num} />
                    <td style={num}>{formatAmount(r.settled_amount)}</td>
                </tr>

                <tr>
                    <td style={{ ...cell, background: "#fbfcfd" }} />
                    <td colSpan={5} style={{ padding: 0, borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}` }}>
                        {/* Width follows the longest ledger name, so each
                            amount sits right next to its name. */}
                        <table style={{ minWidth: 0, width: "auto", maxWidth: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                                {lines.map((line, i) => (
                                    <tr key={i}>
                                        <td style={{ ...detailCell, fontWeight: 700 }}>{line.ledger}</td>
                                        <td style={{ ...detailCell, textAlign: "right", whiteSpace: "nowrap" }} />
                                        <td style={{ ...detailCell, textAlign: "right", whiteSpace: "nowrap", minWidth: "110px" }}>
                                            {drcr(line.amount, "Dr")}
                                        </td>
                                    </tr>
                                ))}
                                <tr>
                                    <td style={{ ...detailCell, color: "#444", whiteSpace: "nowrap" }}>
                                        Agst Ref&nbsp;&nbsp;{invoiceNo}
                                    </td>
                                    <td style={{ ...detailCell, textAlign: "right", whiteSpace: "nowrap", color: "#444" }}>
                                        {days !== null ? `${days} Days` : ""}
                                    </td>
                                    <td style={{ ...detailCell, textAlign: "right", whiteSpace: "nowrap" }}>
                                        {drcr(r.settled_amount, "Cr")}
                                    </td>
                                </tr>
                                {r.voucher_invoice_count > 1 && (
                                    <tr>
                                        <td colSpan={3} style={{ ...detailCell, fontSize: "10.5px", color: "#777" }}>
                                            One bank credit of ₹ {formatAmount(r.voucher_bank_amount)} paid{" "}
                                            {r.voucher_invoice_count} invoices (₹ {formatAmount(r.voucher_bills_total)}).
                                            Amounts above are this invoice's share.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </td>
                </tr>
            </React.Fragment>
        );
    };

    const panel = (
            <div
                className="kseb-pay-panel"
                role={inline ? "region" : "dialog"}
                aria-label="Payment details"
                style={{
                    // Inline: sits on the right, under the Tracking column.
                    marginLeft: inline ? "auto" : 0,
                    textAlign: "left",
                    width: "100%",
                    maxWidth: inline ? "860px" : "980px",
                    background: "#fff",
                    borderRadius: inline ? "6px" : "10px",
                    border: inline ? "1px solid #cbd8d0" : "none",
                    boxShadow: inline ? "none" : "0 10px 40px rgba(0,0,0,0.25)",
                    overflow: "hidden",
                    boxSizing: "border-box"
                }}
            >
                {/* Global table rules elsewhere in the app (margin, padding,
                    centred text, row hover colours) must not change this panel. */}
                <style>{`
                    .kseb-pay-panel { text-align: left; }
                    .kseb-pay-panel table {
                        margin: 0 !important;
                        min-width: 0 !important;
                        font-family: inherit;
                        display: table !important;
                        white-space: normal;
                    }
                    .kseb-pay-panel th,
                    .kseb-pay-panel td { text-align: inherit; }
                    .kseb-pay-panel tbody tr:hover,
                    .kseb-pay-panel tbody tr:nth-child(even) { background: transparent; }
                `}</style>

                {/* Header */}
                <div
                    style={{
                        padding: inline ? "8px 12px" : "12px 16px",
                        background: GREEN,
                        color: "#fff",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px"
                    }}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: inline ? "14px" : "16px", fontWeight: 800 }}>Payment Details</div>
                        <div style={{ fontSize: "12px", opacity: 0.9, marginTop: "2px", overflowWrap: "anywhere" }}>
                            {invoiceNo}
                            {invoiceDate ? ` • ${formatDate(invoiceDate)}` : ""}
                            {partyName ? ` • ${partyName}` : ""}
                        </div>
                    </div>
                    {details && (
                        <span
                            style={{
                                padding: "3px 9px",
                                borderRadius: "10px",
                                fontSize: "11px",
                                fontWeight: 800,
                                background: "#fff",
                                color: isPaid ? GREEN : "#b35c00",
                                whiteSpace: "nowrap"
                            }}
                        >
                            {isPaid ? "Fully Paid" : received > 0 ? "Part Paid" : "Not Paid"}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            border: "none",
                            background: "transparent",
                            color: "#fff",
                            fontSize: "20px",
                            lineHeight: 1,
                            cursor: "pointer"
                        }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ padding: inline ? "10px 12px 12px" : "14px 16px 18px" }}>
                    {loading && (
                        <div style={{ padding: "30px", textAlign: "center", color: GREEN, fontWeight: 600 }}>
                            Loading payment details...
                        </div>
                    )}

                    {!loading && error && (
                        <div style={{ padding: "12px", background: "#fdecec", color: "#b42318", borderRadius: "6px", fontSize: "13px" }}>
                            {error}
                        </div>
                    )}

                    {!loading && !error && details && (
                        <>
                            {/* Quick totals */}
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "12px", fontWeight: 700 }}>
                                <span style={{ padding: "4px 9px", borderRadius: "6px", background: "#eef6f1", color: GREEN }}>
                                    Credited to Bank: ₹ {formatAmount(bankAmount)}
                                </span>
                                {typeTotals.map((t) => (
                                    <span key={t.key} style={{ padding: "4px 9px", borderRadius: "6px", background: t.bg, color: t.fg }}>
                                        {t.label}: ₹ {formatAmount(t.amount)}
                                    </span>
                                ))}
                                {deductionsTotal > 0 && (
                                    <span style={{ padding: "4px 9px", borderRadius: "6px", background: "#f4f4f4", color: "#444" }}>
                                        Total Deductions: ₹ {formatAmount(deductionsTotal)}
                                    </span>
                                )}
                            </div>

                            {/* Ledger */}
                            <div style={{ marginTop: "12px", border: `1px solid ${BORDER}`, borderRight: "none", borderBottom: "none" }}>
                                <table style={{ minWidth: 0, width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
                                    <colgroup>
                                        <col style={{ width: "74px" }} />
                                        <col />
                                        <col style={{ width: "98px" }} />
                                        <col style={{ width: "128px" }} />
                                        <col style={{ width: "100px" }} />
                                        <col style={{ width: "100px" }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th style={head}>Date</th>
                                            <th style={{ ...head, textAlign: "left" }}>Particulars</th>
                                            <th style={{ ...head, textAlign: "left" }}>Vch Type</th>
                                            <th style={{ ...head, textAlign: "left" }}>Vch No.</th>
                                            <th style={{ ...head, textAlign: "right" }}>Debit</th>
                                            <th style={{ ...head, textAlign: "right" }}>Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Invoice */}
                                        <tr>
                                            <td style={{ ...cell, whiteSpace: "nowrap" }}>{formatDate(invoiceDate)}</td>
                                            <td style={{ ...cell, fontWeight: 700 }}>
                                                {invoice?.sales_ledger || "Sales"}
                                            </td>
                                            <td style={cell}>{invoice?.voucher_type || "Sales"}</td>
                                            <td style={cell}>{invoiceNo}</td>
                                            <td style={num}>{formatAmount(invoiceAmount)}</td>
                                            <td style={num} />
                                        </tr>

                                        {receipts.map(renderReceipt)}

                                        {receipts.length === 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ ...cell, textAlign: "center", color: "#777", padding: "18px" }}>
                                                    No receipt vouchers found in Tally for this invoice.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Ledger Summary */}
                            <div style={{ marginTop: "10px" }}>
                                <table style={{ minWidth: 0, width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
                                    <colgroup>
                                        <col />
                                        <col style={{ width: "100px" }} />
                                        <col style={{ width: "100px" }} />
                                        <col style={{ width: "130px" }} />
                                    </colgroup>
                                    <tbody>
                                        <tr>
                                            <td colSpan={4} style={{ padding: "6px 10px", fontWeight: 800, letterSpacing: "2px", color: NAVY, textAlign: "left", borderBottom: `1px solid ${BORDER}` }}>
                                                Ledger Summary
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style={{ ...cell, borderRight: "none" }}>Debit Total / Credit Total</td>
                                            <td style={{ ...num, fontWeight: 700, borderRight: "none" }}>{formatAmount(invoiceAmount)}</td>
                                            <td style={{ ...num, fontWeight: 700, borderRight: "none" }}>{formatAmount(creditTotal)}</td>
                                            <td style={{ ...num, borderRight: "none" }} />
                                        </tr>
                                        <tr>
                                            <td style={{ ...cell, borderRight: "none" }}>Closing Balance (pending)</td>
                                            <td style={{ ...num, borderRight: "none" }} />
                                            <td style={{ ...num, borderRight: "none" }} />
                                            <td style={{ ...num, fontWeight: 800, fontSize: "13px", color: balance > 0 ? "#b42318" : GREEN, borderRight: "none" }}>
                                                {balance > 0 ? drcr(balance, "Dr") : "Nil"}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
    );

    if (inline) return panel;

    return (
        <div
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                zIndex: 2000000,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: "40px 12px",
                overflowY: "auto",
                boxSizing: "border-box"
            }}
        >
            {panel}
        </div>
    );
};

export default KsebPaymentDetailsModal;


