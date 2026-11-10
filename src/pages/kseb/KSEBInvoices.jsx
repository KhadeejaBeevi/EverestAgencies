import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { apiFetch } from "../../api/apiClient.js";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import KsebInvoiceTrackingModal, {
    openKsebDocument
} from "./KsebInvoiceTrackingModal.jsx";
import KsebPaymentDetailsModal from "./KsebPaymentDetailsModal.jsx";

const API = "/serverphp";

// Background of the Invoice No / PO Number cell when that document
// is attached.
const ATTACHED_BG = "#d9f3ee"; // soft teal
// Thin teal stripe on the left edge of that cell.
const ATTACHED_ACCENT = "inset 3px 0 0 #14a38b";

// The page opens on the current month ("1" = January ... "12" = December).
const getCurrentMonth = () => String(new Date().getMonth() + 1);

const KSEBInvoices = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
    const [sortOrder, setSortOrder] = useState("newest");
    const [amountSort, setAmountSort] = useState("default");
    const [viewMode, setViewMode] = useState("party");
    // all | not_paid (not fully credited to the bank)
    //     | sanctioned (Payment Sanctioned, money not yet credited) | paid
    const [paymentFilter, setPaymentFilter] = useState("all");
    // all | missing_any | missing_po | missing_invoice | missing_both | attached
    // (Other Documents are not checked)
    const [documentFilter, setDocumentFilter] = useState("all");

    const [expandedInvoice, setExpandedInvoice] = useState(null);
    const [expandedParty, setExpandedParty] = useState(null);

    const [exportOpen, setExportOpen] = useState(false);

    // Documents + KSEB tracking (kseb_invoice_tracking.php)
    const [trackingSummary, setTrackingSummary] = useState({});
    const [trackingSteps, setTrackingSteps] = useState([]);
    // Security Deposit is due for refund this many days after the
    // receipt date (the server sends its own value).
    const [sdRefundDays, setSdRefundDays] = useState(540);
    // Security Deposit paid by DD (Payment vouchers) and refunds,
    // per PO number (kseb_invoice_tracking.php -> po_deposits).
    const [poDeposits, setPoDeposits] = useState({});
    const [trackingInvoice, setTrackingInvoice] = useState(null);
    const [trackingDocType, setTrackingDocType] = useState("PO");
    const [openingDocId, setOpeningDocId] = useState(null);
    // Invoice whose payment breakdown (bank, TDS, SD ...) is expanded.
    const [expandedPayment, setExpandedPayment] = useState(null);

    const togglePayment = (invoiceNo) =>
        setExpandedPayment((previous) =>
            previous === invoiceNo ? null : invoiceNo
        );

    const [screenWidth, setScreenWidth] = useState(
        typeof window !== "undefined" ? window.innerWidth : 1200
    );

    useEffect(() => {
        // The tracking summary is loaded after the invoices
        // (it needs the invoice amounts to check the receipts).
        fetchInvoices();
    }, []);

    useEffect(() => {
        const handleResize = () => setScreenWidth(window.innerWidth);

        window.addEventListener("resize", handleResize);

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Close export dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest(".kseb-export-wrapper")) {
                setExportOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const fetchInvoices = async () => {
        setLoading(true);

        try {
            const response = await apiFetch(
                `${API}/kseb_payment.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({})
                }
            );

            const result = await response.json();

            console.log("KSEB Invoice API Response:", result);

            if (Array.isArray(result)) {
                setData(result);
                fetchTrackingSummary(result);
            } else if (result && Array.isArray(result.data)) {
                setData(result.data);
                fetchTrackingSummary(result.data);
            } else {
                console.error(
                    "Invalid KSEB invoice API response:",
                    result
                );
                setData([]);
            }
        } catch (error) {
            console.error("KSEB invoice fetch error:", error);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    // Sends every invoice number + amount, so the server can compare
    // them with the bank credits in kseb_receipts and mark fully paid
    // invoices as Payment Completed automatically.
    const fetchTrackingSummary = async (rows = data) => {
        const invoices = (Array.isArray(rows) ? rows : [])
            .map((row) => ({
                invoice_no: getInvoiceNo(row),
                amount: Number(row?.invoice_amount || 0)
            }))
            .filter((invoice) => invoice.invoice_no);

        try {
            const response = await apiFetch(
                `${API}/kseb_invoice_tracking.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        action: "summary",
                        invoices
                    })
                }
            );

            const result = await response.json();

            if (result && result.success) {
                setTrackingSummary(
                    result.data && typeof result.data === "object"
                        ? result.data
                        : {}
                );
                setTrackingSteps(
                    Array.isArray(result.steps) ? result.steps : []
                );

                if (Number(result.sd_refund_days) > 0) {
                    setSdRefundDays(Number(result.sd_refund_days));
                }

                setPoDeposits(
                    result.po_deposits &&
                        typeof result.po_deposits === "object"
                        ? result.po_deposits
                        : {}
                );
            }
        } catch (error) {
            // The invoice list still works without tracking.
            console.error("KSEB tracking summary error:", error);
        }
    };

    const getTracking = (invoiceNo) =>
        trackingSummary[
            String(invoiceNo || "").trim().toLowerCase()
        ] || null;

    // Payment status from the tracking summary (receipts credited to bank).
    const getPaymentStatus = (row) => {
        const tracking = getTracking(getInvoiceNo(row));

        return tracking?.current_step === "PAYMENT_COMPLETED"
            ? "paid"
            : "not_paid";
    };

    // "Payment Sanctioned" step saved, but the money is not yet fully
    // credited to the bank (paid invoices are not counted here).
    const isPaymentSanctioned = (row) => {
        if (getPaymentStatus(row) === "paid") return false;

        const tracking = getTracking(getInvoiceNo(row));

        if (Array.isArray(tracking?.step_keys)) {
            return tracking.step_keys.includes("PAYMENT_SANCTIONED");
        }

        return tracking?.current_step === "PAYMENT_SANCTIONED";
    };

    const matchesPaymentFilter = (row) => {
        switch (paymentFilter) {
            case "paid":
                return getPaymentStatus(row) === "paid";
            case "not_paid":
                return getPaymentStatus(row) !== "paid";
            case "sanctioned":
                return isPaymentSanctioned(row);
            case "sd_overdue":
                return getSdInfo(row).hasOverdue;
            default:
                return true;
        }
    };

    // Security Deposit of one invoice (see sdByInvoice below):
    // deducted by KSEB from the receipt + paid by us by DD, less refunds.
    // Overdue = still held more than sdRefundDays after it was kept.
    // A DD shared by several invoices of the same PO is counted once
    // in the totals (on the oldest invoice).
    const getSdInfo = (row) => {
        const rows =
            sdByInvoice[getInvoiceNo(row).toLowerCase()] || [];

        let total = 0;
        let overdueAmount = 0;
        let overdueDays = 0;
        let nextDueDate = "";
        let firstDate = "";
        let hasOverdue = false;

        rows.forEach((item) => {
            const held = Math.max(item.amount - item.refunded, 0);
            const overdue = held > 0.5 && item.daysKept > sdRefundDays;

            if (!firstDate || item.date < firstDate) firstDate = item.date;

            if (overdue) {
                hasOverdue = true;
                overdueDays = Math.max(
                    overdueDays,
                    item.daysKept - sdRefundDays
                );
            } else if (
                held > 0.5 &&
                (!nextDueDate || item.dueDate < nextDueDate)
            ) {
                nextDueDate = item.dueDate;
            }

            if (!item.shared) {
                total += item.amount;

                if (overdue) overdueAmount += held;
            }
        });

        return {
            total,
            overdueAmount,
            overdueDays,
            hasOverdue,
            nextDueDate,
            firstDate,
            rows,
            count: rows.length
        };
    };

    const getPaymentStatusLabel = (row) =>
        getPaymentStatus(row) === "paid"
            ? "Paid"
            : isPaymentSanctioned(row)
                ? "Payment Sanctioned"
                : "Not Paid";

    // PO / Invoice document uploaded? (Other Documents do not matter.)
    // A PO uploaded on another invoice with the same PO number counts.
    const hasPoDocument = (row) => getPoDocuments(row).length > 0;

    const hasInvoiceDocument = (row) =>
        Array.isArray(row?.invoice_documents) &&
        row.invoice_documents.length > 0;

    const matchesDocumentFilter = (row) => {
        const hasPo = hasPoDocument(row);
        const hasInvoice = hasInvoiceDocument(row);

        switch (documentFilter) {
            case "missing_any":
                return !hasPo || !hasInvoice;
            case "missing_po":
                return !hasPo;
            case "missing_invoice":
                return !hasInvoice;
            case "missing_both":
                return !hasPo && !hasInvoice;
            case "attached":
                return hasPo && hasInvoice;
            case "same_po":
                return getSamePoInvoices(row).length > 0;
            default:
                return true;
        }
    };

    // Amount still to be received for one invoice.
    const getBalanceAmount = (row) => {
        if (getPaymentStatus(row) === "paid") return 0;

        const tracking = getTracking(getInvoiceNo(row));

        return Math.max(
            Number(row?.invoice_amount || 0) -
                Number(tracking?.received_amount || 0),
            0
        );
    };

    const normalizeDate = (value) => {
        if (!value) return "";

        const text = String(value).trim();

        const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

        if (ymd) {
            return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
        }

        const dmy = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);

        if (dmy) {
            return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
        }

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) return "";

        return `${d.getFullYear()}-${String(
            d.getMonth() + 1
        ).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const formatDate = (value) => {
        const normalized = normalizeDate(value);

        if (!normalized) {
            return value || "";
        }

        const d = new Date(`${normalized}T00:00:00`);

        if (Number.isNaN(d.getTime())) {
            return value || "";
        }

        return d.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };

    const formatAmount = (value) => {
        const number = Number(value || 0);

        if (!Number.isFinite(number)) {
            return "0.00";
        }

        return number.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const getPartyName = (row) =>
        String(
            row?.party_name ||
            row?.PartyLedgerName ||
            "Unknown Party"
        ).trim();

    const getInvoiceNo = (row) =>
        String(
            row?.invoice_no ||
            row?.VoucherNumber ||
            ""
        ).trim();

    const getInvoiceDate = (row) =>
        row?.invoice_date ||
        row?.Date ||
        "";

    const getMonthNumber = (value) => {
        const normalized = normalizeDate(value);

        if (!normalized) return null;

        const parts = normalized.split("-").map(Number);

        if (parts.length !== 3) return null;

        return parts[1];
    };

    // =========================================================
    // SAME PO NUMBER
    // =========================================================
    //
    // "LPO/6112/2024-25/00001, dt 24-5-24" and
    // "LPO/6112/2024-25/00001 dt 24-5-2024" are the same PO:
    // the date part, spaces and case are ignored. Values without
    // any digit (e.g. "Teli Order") are not treated as PO numbers.

    const getPoKey = (row) => {
        let text = String(row?.order_no || "").toLowerCase();

        text = text.split(/[\s,.(]*\b(?:dt|dtd|dated|date)\b/)[0];
        text = text.replace(/\s+/g, "").replace(/[.,;:/-]+$/, "");

        return /\d/.test(text) ? text : "";
    };

    // PO key -> every invoice row with that PO number
    const poGroups = useMemo(() => {
        const groups = {};

        data.forEach((row) => {
            const key = getPoKey(row);

            if (key) {
                (groups[key] = groups[key] || []).push(row);
            }
        });

        return groups;
    }, [data]);

    /*
    | Security Deposit rows per invoice (key = invoice no, lower case):
    |   Deducted  kept back by KSEB from a receipt of this invoice
    |   PAID      paid by us (Payment voucher: DD / bank) against the PO
    |   BG        bank guarantee given against the PO
    | Refunds of a PO are set against its deposits, oldest first.
    */
    const sdByInvoice = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const invoiceKey = (row) => getInvoiceNo(row).toLowerCase();

        const makeRow = (sd, source) => {
            const date = normalizeDate(sd.date);

            if (!date) return null;

            const kept = new Date(`${date}T00:00:00`);
            const due = new Date(kept);
            due.setDate(due.getDate() + sdRefundDays);

            return {
                source,
                ledger: sd.ledger || "",
                voucherNo: sd.voucher_no || "",
                amount: Number(sd.amount || 0),
                refunded: 0,
                date,
                dueDate: normalizeDate(due),
                daysKept: Math.max(
                    Math.floor((today - kept) / 86400000),
                    0
                ),
                shared: false
            };
        };

        const map = {};

        data.forEach((row) => {
            const tracking = trackingSummary[invoiceKey(row)];

            map[invoiceKey(row)] = (
                Array.isArray(tracking?.security_deposits)
                    ? tracking.security_deposits
                    : []
            )
                .map((sd) => makeRow(sd, "Deducted"))
                .filter(Boolean);
        });

        Object.entries(poGroups).forEach(([poKey, invoices]) => {
            const deposit = poDeposits[poKey];

            if (!deposit) return;

            const sorted = [...invoices].sort((a, b) =>
                normalizeDate(getInvoiceDate(a)).localeCompare(
                    normalizeDate(getInvoiceDate(b))
                )
            );

            const ddRows = (Array.isArray(deposit.paid) ? deposit.paid : [])
                .map((sd) => makeRow(sd, sd.kind === "BG" ? "BG" : "PAID"))
                .filter(Boolean);

            // Refunds: oldest deposit of this PO first.
            let pool = Number(deposit.refunded || 0);

            [
                ...ddRows,
                ...sorted.flatMap((row) => map[invoiceKey(row)] || [])
            ]
                .sort((a, b) => a.date.localeCompare(b.date))
                .forEach((item) => {
                    const take = Math.min(pool, item.amount);

                    item.refunded = take;
                    pool -= take;
                });

            sorted.forEach((row, index) => {
                const key = invoiceKey(row);

                map[key] = [
                    ...(map[key] || []),
                    ...ddRows.map((item) => ({
                        ...item,
                        shared: index > 0
                    }))
                ].sort((a, b) => a.date.localeCompare(b.date));
            });
        });

        return map;
    }, [data, trackingSummary, poDeposits, poGroups, sdRefundDays]);

    // Other invoices with the same PO number.
    const getSamePoInvoices = (row) => {
        const key = getPoKey(row);
        const invoiceNo = getInvoiceNo(row).toLowerCase();

        if (!key) return [];

        return (poGroups[key] || []).filter(
            (other) =>
                getInvoiceNo(other).toLowerCase() !== invoiceNo
        );
    };

    // PO documents of this invoice + those uploaded on other
    // invoices with the same PO number (marked __fromInvoice).
    const getPoDocuments = (row) => {
        const own = Array.isArray(row?.po_documents)
            ? row.po_documents
            : [];

        const seen = new Set(own.map((doc) => doc.id));
        const shared = [];

        getSamePoInvoices(row).forEach((other) => {
            (Array.isArray(other.po_documents)
                ? other.po_documents
                : []
            ).forEach((doc) => {
                if (!seen.has(doc.id)) {
                    seen.add(doc.id);
                    shared.push({
                        ...doc,
                        __fromInvoice: getInvoiceNo(other)
                    });
                }
            });
        });

        return [...own, ...shared];
    };

    const filteredData = useMemo(() => {
        const search = String(searchTerm || "")
            .trim()
            .toLowerCase();

        let result = [...data];

        if (search) {
            const numericSearch = search.replace(/\D/g, "");

            result = result.filter((row) => {
                const fullText = JSON.stringify(row || {}).toLowerCase();

                if (fullText.includes(search)) {
                    return true;
                }

                if (numericSearch) {
                    const allDigits = JSON.stringify(row || {}).replace(
                        /\D/g,
                        ""
                    );

                    if (allDigits.includes(numericSearch)) {
                        return true;
                    }
                }

                return false;
            });
        }

        if (selectedMonth !== "all") {
            result = result.filter(
                (row) =>
                    getMonthNumber(getInvoiceDate(row)) ===
                    Number(selectedMonth)
            );
        }

        if (documentFilter !== "all") {
            result = result.filter(matchesDocumentFilter);
        }

        if (paymentFilter !== "all") {
            result = result.filter(matchesPaymentFilter);
        }

        if (
            amountSort === "highest" ||
            amountSort === "lowest"
        ) {
            result.sort((a, b) => {
                const amountA = Number(a?.invoice_amount || 0);
                const amountB = Number(b?.invoice_amount || 0);

                return amountSort === "highest"
                    ? amountB - amountA
                    : amountA - amountB;
            });
        } else {
            result.sort((a, b) => {
                const dateA =
                    new Date(getInvoiceDate(a)).getTime() || 0;

                const dateB =
                    new Date(getInvoiceDate(b)).getTime() || 0;

                if (dateA !== dateB) {
                    return sortOrder === "newest"
                        ? dateB - dateA
                        : dateA - dateB;
                }

                return sortOrder === "newest"
                    ? getInvoiceNo(b).localeCompare(
                        getInvoiceNo(a),
                        undefined,
                        {
                            numeric: true,
                            sensitivity: "base"
                        }
                    )
                    : getInvoiceNo(a).localeCompare(
                        getInvoiceNo(b),
                        undefined,
                        {
                            numeric: true,
                            sensitivity: "base"
                        }
                    );
            });
        }

        return result;
    }, [
        data,
        searchTerm,
        selectedMonth,
        sortOrder,
        amountSort,
        paymentFilter,
        documentFilter,
        trackingSummary,
        poGroups,
        sdRefundDays,
        sdByInvoice
    ]);

    const groupedDisplayData = useMemo(() => {
        const rows = [...filteredData];

        const getPartyKey = (row) =>
            getPartyName(row)
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();

        const getDateKey = (row) =>
            normalizeDate(getInvoiceDate(row));

        rows.sort((a, b) => {
            if (
                amountSort === "highest" ||
                amountSort === "lowest"
            ) {
                const amountA = Number(
                    a?.invoice_amount || 0
                );

                const amountB = Number(
                    b?.invoice_amount || 0
                );

                return amountSort === "highest"
                    ? amountB - amountA
                    : amountA - amountB;
            }

            if (viewMode === "party") {
                const partyCompare = getPartyKey(a).localeCompare(
                    getPartyKey(b),
                    undefined,
                    {
                        sensitivity: "base"
                    }
                );

                if (partyCompare !== 0) {
                    return partyCompare;
                }
            } else {
                const dateA = getDateKey(a);
                const dateB = getDateKey(b);

                if (dateA !== dateB) {
                    return sortOrder === "newest"
                        ? dateB.localeCompare(dateA)
                        : dateA.localeCompare(dateB);
                }
            }

            const dateA =
                new Date(getInvoiceDate(a)).getTime() || 0;

            const dateB =
                new Date(getInvoiceDate(b)).getTime() || 0;

            if (dateA !== dateB) {
                return sortOrder === "newest"
                    ? dateB - dateA
                    : dateA - dateB;
            }

            return getInvoiceNo(a).localeCompare(
                getInvoiceNo(b),
                undefined,
                {
                    numeric: true,
                    sensitivity: "base"
                }
            );
        });

        let previousGroup = null;
        let groupIndex = 0;

        return rows.map((row) => {
            const group =
                viewMode === "party"
                    ? getPartyKey(row)
                    : getDateKey(row);

            if (group !== previousGroup) {
                groupIndex++;
                previousGroup = group;
            }

            return {
                ...row,
                __groupBg:
                    groupIndex % 2 === 1
                        ? "#f7fbf8"
                        : "#f4f7ff"
            };
        });
    }, [
        filteredData,
        viewMode,
        sortOrder,
        amountSort
    ]);

    const totals = useMemo(() => {
        let invoiceAmount = 0;
        let balanceAmount = 0;
        let notPaidCount = 0;
        let missingDocsCount = 0;
        let sanctionedCount = 0;
        let sanctionedAmount = 0;
        let sdOverdueCount = 0;
        let sdOverdueAmount = 0;

        filteredData.forEach((row) => {
            invoiceAmount += Number(
                row?.invoice_amount || 0
            );

            if (!hasPoDocument(row) || !hasInvoiceDocument(row)) {
                missingDocsCount++;
            }

            if (getPaymentStatus(row) !== "paid") {
                notPaidCount++;
                balanceAmount += getBalanceAmount(row);
            }

            if (isPaymentSanctioned(row)) {
                sanctionedCount++;
                sanctionedAmount += getBalanceAmount(row);
            }

            const sd = getSdInfo(row);

            if (sd.overdueAmount > 0) {
                sdOverdueCount++;
                sdOverdueAmount += sd.overdueAmount;
            }
        });

        return {
            invoiceCount: filteredData.length,
            invoiceAmount,
            notPaidCount,
            balanceAmount,
            missingDocsCount,
            sanctionedCount,
            sanctionedAmount,
            sdOverdueCount,
            sdOverdueAmount
        };
    }, [filteredData, trackingSummary, sdRefundDays, sdByInvoice]);

    const clearFilters = () => {
        setSearchTerm("");
        setSelectedMonth(getCurrentMonth());
        setSortOrder("newest");
        setAmountSort("default");
        setViewMode("party");
        setPaymentFilter("all");
        setDocumentFilter("all");
    };

    const toggleInvoice = (invoiceNo) => {
        setExpandedInvoice((previous) =>
            previous === invoiceNo ? null : invoiceNo
        );
    };

    const toggleParty = (invoiceNo) => {
        setExpandedParty((previous) =>
            previous === invoiceNo ? null : invoiceNo
        );
    };

    const getItemTotal = (items) => {
        if (!Array.isArray(items)) return 0;

        return items.reduce(
            (sum, item) =>
                sum + Number(item?.amount || 0),
            0
        );
    };

    // =========================================================
    // EXPORT HELPERS
    // =========================================================

    const getExportMonthName = () => {
        const months = {
            "1": "January",
            "2": "February",
            "3": "March",
            "4": "April",
            "5": "May",
            "6": "June",
            "7": "July",
            "8": "August",
            "9": "September",
            "10": "October",
            "11": "November",
            "12": "December"
        };

        return selectedMonth === "all"
            ? "All_Months"
            : months[selectedMonth] || "Selected_Month";
    };

    const cleanExportValue = (value) => {
        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        if (Array.isArray(value)) {
            return value
                .map((item) =>
                    typeof item === "object"
                        ? JSON.stringify(item)
                        : String(item)
                )
                .join(", ");
        }

        if (typeof value === "object") {
            return JSON.stringify(value);
        }

        return String(value);
    };

    // =========================================================
    // EXCEL EXPORT
    // =========================================================

    const exportToExcel = () => {
        if (!filteredData.length) {
            alert("No invoice data available to export.");
            return;
        }

        const invoiceRows = [];
        const itemRows = [];

        filteredData.forEach((row, index) => {
            const invoiceNo = getInvoiceNo(row);

            invoiceRows.push({
                "S.No": index + 1,
                "Invoice Date": formatDate(
                    getInvoiceDate(row)
                ),
                "Invoice No": invoiceNo,
                "KSEB Party": getPartyName(row),
                "Mailing Name": cleanExportValue(
                    row.mailing_name
                ),
                "Address": cleanExportValue(
                    row.mailing_address
                ),
                "Mobile": cleanExportValue(
                    row.mobile
                ),
                "PO Number": cleanExportValue(
                    row.order_no
                ),
                "Reference": cleanExportValue(
                    row.reference
                ),
                "Invoice Amount": Number(
                    row.invoice_amount || 0
                ),
                "Voucher Type": cleanExportValue(
                    row.voucher_type
                ),
                "Sales Ledger": cleanExportValue(
                    row.sales_ledger
                ),
                "Godown": cleanExportValue(
                    row.godown
                ),
                "Enquiry No": cleanExportValue(
                    row.enquiry_no
                ),
                "Narration": cleanExportValue(
                    row.narration
                ),
                "Same PO Invoices": getSamePoInvoices(row)
                    .map((other) => getInvoiceNo(other))
                    .join(", "),
                "PO Document": hasPoDocument(row)
                    ? "Attached"
                    : "Not Attached",
                "Invoice Document": hasInvoiceDocument(row)
                    ? "Attached"
                    : "Not Attached",
                "Payment Status": getPaymentStatusLabel(row),
                "Balance to Receive": getBalanceAmount(row),
                "Tracking Status":
                    getTracking(invoiceNo)?.current_step_label ||
                    "Bill Generated",
                "Credited to Bank": Number(
                    getTracking(invoiceNo)?.bank_amount || 0
                ),
                "Deductions (SD / TDS)": Number(
                    getTracking(invoiceNo)?.deductions_amount || 0
                ),
                "Bank Account": cleanExportValue(
                    getTracking(invoiceNo)?.bank_accounts
                ),
                "Security Deposit": getSdInfo(row).total,
                "SD Overdue Amount": getSdInfo(row).overdueAmount,
                "SD Overdue By (Days)":
                    getSdInfo(row).overdueDays || "",
                "SD Refund Due": getSdInfo(row).nextDueDate
                    ? formatDate(getSdInfo(row).nextDueDate)
                    : ""
            });

            if (Array.isArray(row.items)) {
                row.items.forEach((item, itemIndex) => {
                    itemRows.push({
                        "Invoice No": invoiceNo,
                        "Invoice Date": formatDate(
                            getInvoiceDate(row)
                        ),
                        "KSEB Party": getPartyName(row),
                        "#": itemIndex + 1,
                        "Item": cleanExportValue(
                            item.item_name
                        ),
                        "Alias": cleanExportValue(
                            item.item_alias
                        ),
                        "Quantity": Number(
                            item.quantity || 0
                        ),
                        "Rate": Number(
                            item.rate || 0
                        ),
                        "Discount": Number(
                            item.discount || 0
                        ),
                        "Amount": Number(
                            item.amount || 0
                        ),
                        "Note": cleanExportValue(
                            item.temp_description
                        ),
                        "Description": cleanExportValue(
                            item.description
                        ),
                        "Godown": cleanExportValue(
                            item.godown
                        )
                    });
                });
            }
        });

        const workbook = XLSX.utils.book_new();

        // Invoice sheet
        const invoiceSheet =
            XLSX.utils.json_to_sheet(invoiceRows);

        invoiceSheet["!cols"] = [
            { wch: 7 },
            { wch: 15 },
            { wch: 22 },
            { wch: 35 },
            { wch: 30 },
            { wch: 45 },
            { wch: 16 },
            { wch: 20 },
            { wch: 20 },
            { wch: 18 },
            { wch: 18 },
            { wch: 25 },
            { wch: 20 },
            { wch: 20 },
            { wch: 40 },
            { wch: 30 },
            { wch: 14 },
            { wch: 16 },
            { wch: 14 },
            { wch: 18 },
            { wch: 24 },
            { wch: 18 },
            { wch: 20 },
            { wch: 30 }
        ];

        XLSX.utils.book_append_sheet(
            workbook,
            invoiceSheet,
            "Invoices"
        );

        // Item sheet
        if (itemRows.length > 0) {
            const itemSheet =
                XLSX.utils.json_to_sheet(itemRows);

            itemSheet["!cols"] = [
                { wch: 22 },
                { wch: 15 },
                { wch: 35 },
                { wch: 7 },
                { wch: 40 },
                { wch: 25 },
                { wch: 12 },
                { wch: 15 },
                { wch: 15 },
                { wch: 18 },
                { wch: 35 },
                { wch: 50 },
                { wch: 20 }
            ];

            XLSX.utils.book_append_sheet(
                workbook,
                itemSheet,
                "Items"
            );
        }

        // Summary sheet
        const summaryRows = [
            {
                "Report": "KSEB Invoices"
            },
            {
                "Filter Month": getExportMonthName()
            },
            {
                "Search": searchTerm || "None"
            },
            {
                "Total Invoices": totals.invoiceCount
            },
            {
                "Total Invoice Value": totals.invoiceAmount
            },
            {
                "Payment Filter": {
                    all: "All Payments",
                    not_paid: "Not Paid",
                    sanctioned: "Payment Sanctioned",
                    sd_overdue: "Security Deposit Overdue",
                    paid: "Paid"
                }[paymentFilter]
            },
            {
                "Document Filter": {
                    all: "All Documents",
                    missing_any: "PO or Invoice Not Attached",
                    missing_po: "PO Not Attached",
                    missing_invoice: "Invoice Not Attached",
                    missing_both: "Both Not Attached",
                    attached: "PO + Invoice Attached",
                    same_po: "Same PO Number"
                }[documentFilter]
            },
            {
                "PO / Invoice Not Attached": totals.missingDocsCount
            },
            {
                "Not Paid Invoices": totals.notPaidCount
            },
            {
                "Payment Sanctioned Invoices": totals.sanctionedCount
            },
            {
                "Payment Sanctioned - Balance": totals.sanctionedAmount
            },
            {
                "SD Overdue Invoices": totals.sdOverdueCount
            },
            {
                "SD Overdue Amount": totals.sdOverdueAmount
            },
            {
                "Balance to Receive": totals.balanceAmount
            }
        ];

        const summarySheet =
            XLSX.utils.json_to_sheet(summaryRows);

        summarySheet["!cols"] = [
            { wch: 25 },
            { wch: 40 }
        ];

        XLSX.utils.book_append_sheet(
            workbook,
            summarySheet,
            "Summary"
        );

        const fileName =
            `KSEB_Invoices_${getExportMonthName()}.xlsx`;

        XLSX.writeFile(workbook, fileName);

        setExportOpen(false);
    };

    // =========================================================
    // PDF EXPORT
    // =========================================================

    const exportToPDF = () => {
        if (!filteredData.length) {
            alert("No invoice data available to export.");
            return;
        }

        const doc = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: "a4"
        });

        const pageWidth =
            doc.internal.pageSize.getWidth();

        const pageHeight =
            doc.internal.pageSize.getHeight();

        const reportTitle =
            selectedMonth === "all"
                ? "KSEB Invoices"
                : `KSEB Invoices - ${getExportMonthName()}`;

        // Header
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(reportTitle, 14, 14);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");

        doc.text(
            `Total Invoices: ${totals.invoiceCount}`,
            14,
            21
        );

        doc.text(
            `Invoice Value: Rs. ${formatAmount(
                totals.invoiceAmount
            )}`,
            70,
            21
        );

        if (searchTerm) {
            doc.text(
                `Search: ${searchTerm}`,
                145,
                21
            );
        }

        const invoiceTableRows = filteredData.map(
            (row, index) => [
                index + 1,
                formatDate(getInvoiceDate(row)),
                getInvoiceNo(row),
                getPartyName(row),
                cleanExportValue(row.order_no),
                cleanExportValue(row.reference),
                `Rs. ${formatAmount(
                    row.invoice_amount
                )}`,
                cleanExportValue(row.voucher_type)
            ]
        );

        autoTable(doc, {
            startY: 27,
            head: [
                [
                    "S.No",
                    "Invoice Date",
                    "Invoice No",
                    "KSEB Party",
                    "PO Number",
                    "Reference",
                    "Invoice Amount",
                    "Voucher Type"
                ]
            ],
            body: invoiceTableRows,
            theme: "grid",
            styles: {
                fontSize: 7,
                cellPadding: 2,
                overflow: "linebreak",
                valign: "middle"
            },
            headStyles: {
                fontSize: 7,
                fontStyle: "bold",
                halign: "center"
            },
            columnStyles: {
                0: {
                    cellWidth: 10,
                    halign: "center"
                },
                1: {
                    cellWidth: 25,
                    halign: "center"
                },
                2: {
                    cellWidth: 35
                },
                3: {
                    cellWidth: 55
                },
                4: {
                    cellWidth: 32
                },
                5: {
                    cellWidth: 32
                },
                6: {
                    cellWidth: 32,
                    halign: "right"
                },
                7: {
                    cellWidth: 25
                }
            },
            margin: {
                left: 10,
                right: 10
            }
        });

        // =====================================================
        // Detailed invoice/item section
        // =====================================================

        filteredData.forEach((row) => {
            const invoiceNo = getInvoiceNo(row);
            const items = Array.isArray(row.items)
                ? row.items
                : [];

            if (!items.length) {
                return;
            }

            doc.addPage();

            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");

            doc.text(
                `Invoice Details - ${invoiceNo}`,
                12,
                14
            );

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");

            doc.text(
                `Date: ${formatDate(
                    getInvoiceDate(row)
                )}`,
                12,
                21
            );

            doc.text(
                `Party: ${getPartyName(row)}`,
                12,
                27
            );

            doc.text(
                `Invoice Amount: Rs. ${formatAmount(
                    row.invoice_amount
                )}`,
                pageWidth - 80,
                21
            );

            const itemRows = items.map(
                (item, itemIndex) => [
                    itemIndex + 1,
                    cleanExportValue(
                        item.item_name
                    ),
                    cleanExportValue(
                        item.item_alias
                    ),
                    formatAmount(item.quantity),
                    formatAmount(item.rate),
                    formatAmount(item.discount),
                    formatAmount(item.amount),
                    cleanExportValue(
                        item.temp_description
                    ),
                    cleanExportValue(
                        item.description
                    ),
                    cleanExportValue(
                        item.godown
                    )
                ]
            );

            autoTable(doc, {
                startY: 33,
                head: [
                    [
                        "#",
                        "Item",
                        "Alias",
                        "Qty",
                        "Rate",
                        "Discount",
                        "Amount",
                        "Note",
                        "Description",
                        "Godown"
                    ]
                ],
                body: itemRows,
                theme: "grid",
                styles: {
                    fontSize: 6.5,
                    cellPadding: 1.8,
                    overflow: "linebreak",
                    valign: "top"
                },
                headStyles: {
                    fontSize: 6.5,
                    fontStyle: "bold",
                    halign: "center"
                },
                columnStyles: {
                    0: {
                        cellWidth: 7,
                        halign: "center"
                    },
                    1: {
                        cellWidth: 43
                    },
                    2: {
                        cellWidth: 25
                    },
                    3: {
                        cellWidth: 15,
                        halign: "right"
                    },
                    4: {
                        cellWidth: 20,
                        halign: "right"
                    },
                    5: {
                        cellWidth: 20,
                        halign: "right"
                    },
                    6: {
                        cellWidth: 23,
                        halign: "right"
                    },
                    7: {
                        cellWidth: 35
                    },
                    8: {
                        cellWidth: 50
                    },
                    9: {
                        cellWidth: 22
                    }
                },
                margin: {
                    left: 8,
                    right: 8
                }
            });

            let detailsY =
                (doc.lastAutoTable?.finalY || 33) + 8;

            // Prevent details from being pushed outside page
            if (detailsY > pageHeight - 35) {
                doc.addPage();
                detailsY = 15;
            }

            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");

            doc.text(
                `Item Total: Rs. ${formatAmount(
                    getItemTotal(items)
                )}`,
                pageWidth - 70,
                detailsY
            );

            detailsY += 7;

            doc.setFont("helvetica", "normal");

            const details = [];

            if (row.mailing_name) {
                details.push(
                    `Mailing Name: ${row.mailing_name}`
                );
            }

            if (row.mailing_address) {
                details.push(
                    `Address: ${row.mailing_address}`
                );
            }

            if (row.mobile) {
                details.push(
                    `Mobile: ${row.mobile}`
                );
            }

            if (row.order_no) {
                details.push(
                    `PO Number: ${row.order_no}`
                );
            }

            if (row.reference) {
                details.push(
                    `Reference: ${row.reference}`
                );
            }

            if (row.sales_ledger) {
                details.push(
                    `Sales Ledger: ${row.sales_ledger}`
                );
            }

            if (row.godown) {
                details.push(
                    `Godown: ${row.godown}`
                );
            }

            if (row.enquiry_no) {
                details.push(
                    `Enquiry No: ${row.enquiry_no}`
                );
            }

            if (row.narration) {
                details.push(
                    `Narration: ${row.narration}`
                );
            }

            details.forEach((detail) => {
                if (detailsY > pageHeight - 10) {
                    doc.addPage();
                    detailsY = 15;
                }

                const wrapped =
                    doc.splitTextToSize(
                        detail,
                        pageWidth - 25
                    );

                doc.text(
                    wrapped,
                    12,
                    detailsY
                );

                detailsY +=
                    wrapped.length * 4 + 2;
            });
        });

        // Page numbers
        const totalPages =
            doc.internal.getNumberOfPages();

        for (
            let page = 1;
            page <= totalPages;
            page++
        ) {
            doc.setPage(page);

            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");

            doc.text(
                `KSEB Invoices | Page ${page} of ${totalPages}`,
                pageWidth / 2,
                pageHeight - 6,
                {
                    align: "center"
                }
            );
        }

        const fileName =
            `KSEB_Invoices_${getExportMonthName()}.pdf`;

        doc.save(fileName);

        setExportOpen(false);
    };

    const thStyle = {
        padding: "8px",
        border: "1px solid #d9d9d9",
        background: "#05693a",
        color: "#fff",
        textAlign: "center",
        fontWeight: "700",
        whiteSpace: "nowrap",
        position: "sticky",
        top: 0,
        zIndex: 10
    };

    const tdStyle = {
        padding:
            screenWidth < 700
                ? "5px"
                : screenWidth < 1100
                    ? "6px"
                    : "8px",
        border: "1px solid #ddd",
        verticalAlign: "middle",
        overflow: "hidden",
        overflowWrap: "anywhere"
    };

    const renderBanner = () => <Banner />;

    const openTracking = (row, docType = "PO") => {
        setTrackingDocType(docType);
        setTrackingInvoice(row);
    };

    // After an upload / delete in the pop-up, put the new document
    // lists on that invoice row so the table updates without a reload.
    const updateRowDocuments = (invoiceNo, documents) => {
        if (!Array.isArray(documents)) return;

        const key = String(invoiceNo || "").trim().toLowerCase();
        const oldestFirst = [...documents].reverse();

        const lists = {
            po_documents: oldestFirst.filter(
                (doc) => doc.doc_type === "PO"
            ),
            invoice_documents: oldestFirst.filter(
                (doc) => doc.doc_type === "INVOICE"
            ),
            other_documents: oldestFirst.filter(
                (doc) =>
                    doc.doc_type !== "PO" &&
                    doc.doc_type !== "INVOICE"
            )
        };

        setData((previous) =>
            previous.map((row) =>
                getInvoiceNo(row).toLowerCase() === key
                    ? { ...row, ...lists }
                    : row
            )
        );

        setTrackingInvoice((previous) =>
            previous ? { ...previous, ...lists } : previous
        );
    };

    const handleOpenDocument = async (doc) => {
        setOpeningDocId(doc.id);

        try {
            await openKsebDocument(doc);
        } catch (error) {
            alert(error.message || "Could not open the document");
        } finally {
            setOpeningDocId(null);
        }
    };

    // All attachments of one invoice in a single column:
    // PO (own + same PO number), Invoice, then Other Documents.
    const renderAttachmentsCell = (row) => {
        const poDocs = getPoDocuments(row);
        const invoiceDocs = Array.isArray(row?.invoice_documents)
            ? row.invoice_documents
            : [];
        const otherDocs = Array.isArray(row?.other_documents)
            ? row.other_documents
            : [];

        const list = [...poDocs, ...invoiceDocs, ...otherDocs];

        // Upload opens on the first missing type (PO, then Invoice).
        const uploadType = poDocs.length === 0
            ? "PO"
            : invoiceDocs.length === 0
                ? "INVOICE"
                : "DD";

        const typeTag = (doc) => {
            if (doc.doc_type === "PO") return "PO";
            if (doc.doc_type === "INVOICE") return "INV";

            return String(doc.doc_type || "DOC")
                .replace(/_/g, " ")
                .slice(0, 6);
        };

        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    alignItems: "stretch"
                }}
            >
                {list.map((doc) => {
                    const isPdf = String(doc.mime_type || "").includes(
                        "pdf"
                    );

                    return (
                        <button
                            key={`${doc.id}-${doc.__fromInvoice || ""}`}
                            type="button"
                            title={`${doc.doc_type_label}: ${doc.original_name}${
                                doc.remarks ? `\n${doc.remarks}` : ""
                            }${
                                doc.__fromInvoice
                                    ? `\nSame PO - uploaded on ${doc.__fromInvoice}`
                                    : ""
                            }`}
                            disabled={openingDocId === doc.id}
                            onClick={() => handleOpenDocument(doc)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                width: "100%",
                                padding: "3px 5px",
                                border: doc.__fromInvoice
                                    ? "1px dashed #9db8a8"
                                    : "1px solid #d5e3db",
                                borderRadius: "4px",
                                background: "#f7fbf9",
                                color: "#05693a",
                                fontSize: "10px",
                                fontWeight: "700",
                                textAlign: "left",
                                cursor: "pointer",
                                minWidth: 0
                            }}
                        >
                            <span
                                style={{
                                    flexShrink: 0,
                                    minWidth: "26px",
                                    padding: "0 3px",
                                    borderRadius: "3px",
                                    fontSize: "8px",
                                    textAlign: "center",
                                    background: "#05693a",
                                    color: "#fff"
                                }}
                            >
                                {typeTag(doc)}
                            </span>
                            <span
                                style={{
                                    flexShrink: 0,
                                    padding: "0 3px",
                                    borderRadius: "3px",
                                    fontSize: "8px",
                                    background: isPdf
                                        ? "#fdecec"
                                        : "#e8f1fb",
                                    color: isPdf
                                        ? "#b42318"
                                        : "#1d5fa8"
                                }}
                            >
                                {isPdf ? "PDF" : "IMG"}
                            </span>
                            {doc.__fromInvoice && (
                                <span
                                    style={{
                                        flexShrink: 0,
                                        padding: "0 3px",
                                        borderRadius: "3px",
                                        fontSize: "8px",
                                        background: "#fff4d6",
                                        color: "#8a6100"
                                    }}
                                >
                                    SAME PO
                                </span>
                            )}
                            <span
                                style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    minWidth: 0
                                }}
                            >
                                {openingDocId === doc.id
                                    ? "Opening..."
                                    : doc.original_name}
                            </span>
                        </button>
                    );
                })}

                <button
                    type="button"
                    onClick={() => openTracking(row, uploadType)}
                    style={{
                        alignSelf: "center",
                        padding: "2px 8px",
                        border: "1px dashed #05693a",
                        borderRadius: "4px",
                        background: "#fff",
                        color: "#05693a",
                        fontSize: "10px",
                        fontWeight: "700",
                        cursor: "pointer"
                    }}
                >
                    + Upload
                </button>
            </div>
        );
    };

    // Security Deposit column: amount kept back by KSEB, the date it was
    // kept (receipt date), the refund due date and overdue / due-in days.
    const renderSdCell = (row) => {
        const sd = getSdInfo(row);

        // No Security Deposit: leave the cell empty.
        if (!sd.rows.length) {
            return null;
        }

        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    alignItems: "stretch",
                    lineHeight: 1.35
                }}
            >
                {sd.rows.map((item, index) => {
                    const held = Math.max(item.amount - item.refunded, 0);
                    const refunded = held <= 0.5;
                    const overdue = !refunded && item.daysKept > sdRefundDays;
                    // Last 90 days before the due date: warn in amber.
                    const nearDue =
                        !overdue &&
                        !refunded &&
                        item.daysKept > sdRefundDays - 90;
                    const percent = Math.min(
                        (item.daysKept / sdRefundDays) * 100,
                        100
                    );
                    const barColor = refunded
                        ? "#9ca3af"
                        : overdue
                            ? "#d92d20"
                            : nearDue
                                ? "#e0a100"
                                : "#05693a";

                    return (
                        <div
                            key={index}
                            title={[
                                item.ledger,
                                item.source === "Deducted"
                                    ? `Deducted by KSEB from the receipt on ${formatDate(item.date)}`
                                    : `Paid by us on ${formatDate(item.date)}${item.voucherNo ? ` (voucher ${item.voucherNo})` : ""}`,
                                `Refund due ${formatDate(item.dueDate)} (${sdRefundDays} days)`,
                                item.refunded > 0
                                    ? `Refunded ₹ ${formatAmount(item.refunded)}`
                                    : "",
                                item.shared
                                    ? "Same PO - counted on the oldest invoice of this PO"
                                    : ""
                            ]
                                .filter(Boolean)
                                .join("\n")}
                            style={{
                                textAlign: "center",
                                opacity: item.shared ? 0.75 : 1
                            }}
                        >
                            {/* Deducted by KSEB from the receipt, or paid by
                                us (payment / bank guarantee - not told apart). */}
                            <span
                                style={{
                                    display: "inline-block",
                                    marginBottom: "2px",
                                    padding: "0 5px",
                                    borderRadius: "3px",
                                    fontSize: "8.5px",
                                    fontWeight: "700",
                                    letterSpacing: "0.3px",
                                    background:
                                        item.source === "Deducted"
                                            ? "#f3f4f6"
                                            : "#e8f1fb",
                                    color:
                                        item.source === "Deducted"
                                            ? "#4b5563"
                                            : "#1d5fa8"
                                }}
                            >
                                {item.source === "Deducted"
                                    ? "DEDUCTED BY KSEB"
                                    : "PAID BY US"}
                                {item.shared ? " · SAME PO" : ""}
                            </span>

                            <div
                                style={{
                                    fontWeight: "700",
                                    color: overdue ? "#b42318" : "#1f2937",
                                    textDecoration: refunded
                                        ? "line-through"
                                        : "none"
                                }}
                            >
                                ₹ {formatAmount(item.amount)}
                            </div>

                            <div
                                style={{
                                    fontSize: "10px",
                                    color: "#6b7280",
                                    marginTop: "1px"
                                }}
                            >
                                {formatDate(item.date)} →{" "}
                                {formatDate(item.dueDate)}
                            </div>

                            {/* Days kept out of 540 */}
                            <div
                                style={{
                                    height: "4px",
                                    margin: "5px 4px 3px",
                                    borderRadius: "2px",
                                    background: "#e5e7eb",
                                    overflow: "hidden"
                                }}
                            >
                                <div
                                    style={{
                                        width: `${percent}%`,
                                        height: "100%",
                                        background: barColor
                                    }}
                                />
                            </div>

                            {refunded ? (
                                <span
                                    style={{
                                        fontSize: "10px",
                                        fontWeight: "700",
                                        color: "#6b7280"
                                    }}
                                >
                                    Refunded
                                </span>
                            ) : overdue ? (
                                <span
                                    style={{
                                        display: "inline-block",
                                        padding: "1px 7px",
                                        borderRadius: "10px",
                                        fontSize: "9.5px",
                                        fontWeight: "700",
                                        background: "#fef3f2",
                                        color: "#b42318",
                                        border: "1px solid #fecdca"
                                    }}
                                >
                                    Overdue · {item.daysKept} days
                                </span>
                            ) : (
                                <span
                                    style={{
                                        fontSize: "10px",
                                        fontWeight: "700",
                                        color: nearDue ? "#a15c00" : "#05693a"
                                    }}
                                >
                                    {item.daysKept} / {sdRefundDays} days
                                </span>
                            )}

                            {!refunded && item.refunded > 0 && (
                                <div
                                    style={{
                                        fontSize: "9.5px",
                                        color: "#6b7280"
                                    }}
                                >
                                    Refunded ₹ {formatAmount(item.refunded)}
                                    {" "}· held ₹ {formatAmount(held)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderTrackingCell = (row, invoiceNo) => {
        const tracking = getTracking(invoiceNo);
        const totalSteps =
            tracking?.total_steps || trackingSteps.length || 0;
        const doneSteps = tracking?.done_steps || 1;
        const isPaid =
            tracking?.current_step === "PAYMENT_COMPLETED";
        // Every invoice is a generated bill, so "Bill Generated"
        // is the first step even before anything else is marked.
        const label =
            tracking?.current_step_label ||
            trackingSteps[0]?.label ||
            "Bill Generated";

        // From kseb_receipts: part of the invoice settled by receipts
        // that were credited to the bank, and the bank credit itself.
        const received = Number(tracking?.received_amount || 0);
        const bankAmount = Number(tracking?.bank_amount || 0);
        const deductions = Number(tracking?.deductions_amount || 0);
        const bankAccounts = Array.isArray(tracking?.bank_accounts)
            ? tracking.bank_accounts
            : [];
        const invoiceAmount = Number(
            tracking?.invoice_amount || row?.invoice_amount || 0
        );
        const isPartPaid = !isPaid && received > 0;
        const canExpand = isPaid || bankAmount > 0;
        const isExpanded = expandedPayment === invoiceNo;

        const bankTitle = bankAmount > 0
            ? [
                `Invoice: ₹ ${formatAmount(invoiceAmount)}`,
                `Credited to bank: ₹ ${formatAmount(bankAmount)}`,
                bankAccounts.length
                    ? `Bank: ${bankAccounts.join(", ")}`
                    : "",
                deductions > 0
                    ? `Deductions (SD / TDS): ₹ ${formatAmount(deductions)}`
                    : "",
                isPartPaid
                    ? `Balance: ₹ ${formatAmount(
                        Math.max(invoiceAmount - received, 0)
                    )}`
                    : ""
            ]
                .filter(Boolean)
                .join("\n")
            : "";

        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px"
                }}
            >
                {/* Paid (or part paid) invoices: click the tag to
                    expand the payment details under the invoice. */}
                <span
                    title={
                        canExpand
                            ? `${bankTitle}${bankTitle ? "\n\n" : ""}Click to ${
                                isExpanded ? "hide" : "see"
                            } payment details`
                            : totalSteps
                                ? `${doneSteps} of ${totalSteps} steps done`
                                : ""
                    }
                    role={canExpand ? "button" : undefined}
                    onClick={
                        canExpand
                            ? () => togglePayment(invoiceNo)
                            : undefined
                    }
                    style={{
                        cursor: canExpand ? "pointer" : "default",
                        display: "inline-block",
                        maxWidth: "100%",
                        padding: "2px 7px",
                        borderRadius: "10px",
                        fontSize: "10px",
                        fontWeight: "700",
                        whiteSpace: "normal",
                        lineHeight: 1.3,
                        background: isPaid
                            ? "#05693a"
                            : tracking?.current_step
                                ? "#fff4d6"
                                : "#eef0ef",
                        color: isPaid
                            ? "#fff"
                            : tracking?.current_step
                                ? "#8a6100"
                                : "#777"
                    }}
                >
                    {label}
                    {canExpand && (isExpanded ? " ▲" : " ▼")}
                </span>

                <button
                    type="button"
                    onClick={() => openTracking(row, "PO")}
                    style={{
                        padding: "3px 10px",
                        border: "1px solid #05693a",
                        borderRadius: "4px",
                        background: "#fff",
                        color: "#05693a",
                        fontSize: "10px",
                        fontWeight: "700",
                        cursor: "pointer"
                    }}
                >
                    Tracking
                </button>
            </div>
        );
    };

    return (
        <>
            <style>{`
                html,
                body,
                #root {
                    overflow: hidden;
                }

                .kseb-invoice-table-container {
                    scrollbar-width: thin;
                }

                .kseb-invoice-table-container::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }

                .kseb-invoice-table-container::-webkit-scrollbar-thumb {
                    background: #aaa;
                    border-radius: 5px;
                }

                .kseb-item-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }

                .kseb-item-table th {
                    padding: 7px;
                    background: #eaf3ee;
                    border: 1px solid #d0ddd5;
                    text-align: center;
                    color: #05693a;
                    white-space: nowrap;
                }

                .kseb-item-table td {
                    padding: 7px;
                    border: 1px solid #ddd;
                    vertical-align: top;
                }

                .kseb-export-wrapper {
                    position: relative;
                    display: inline-block;
                }

                .kseb-export-button {
                    height: 36px;
                    padding: 0 14px;
                    border: 1px solid #05693a;
                    background: #05693a;
                    color: #fff;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 700;
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                }

                .kseb-export-button:hover {
                    background: #04572f;
                }

                .kseb-export-menu {
                    position: absolute;
                    top: calc(100% + 5px);
                    right: 0;
                    min-width: 180px;
                    background: #fff;
                    border: 1px solid #d0d0d0;
                    border-radius: 7px;
                    box-shadow: 0 5px 18px rgba(0,0,0,0.15);
                    padding: 5px;
                    z-index: 1000;
                }

                .kseb-export-menu button {
                    width: 100%;
                    border: none;
                    background: #fff;
                    padding: 10px 12px;
                    text-align: left;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    color: #333;
                }

                .kseb-export-menu button:hover {
                    background: #eef6f1;
                    color: #05693a;
                }

                @media (max-width: 700px) {
                    .kseb-item-table {
                        font-size: 10px;
                    }

                    .kseb-item-table th,
                    .kseb-item-table td {
                        padding: 5px;
                    }

                    .kseb-export-menu {
                        right: auto;
                        left: 0;
                    }
                }
            `}</style>

            {renderBanner()}

            <div
                style={{
                    padding:
                        screenWidth < 700
                            ? "10px"
                            : "20px",
                    boxSizing: "border-box",
                    width: "100%"
                }}
            >
                <div
                    style={{
                        position: "sticky",
                        top: "65px",
                        zIndex: 100,
                        background: "#fff",
                        padding:
                            screenWidth < 700
                                ? "8px 0"
                                : "10px 0",
                        borderBottom:
                            "1px solid #ddd"
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent:
                                "space-between",
                            gap: "12px",
                            flexWrap:
                                screenWidth < 900
                                    ? "wrap"
                                    : "nowrap"
                        }}
                    >
                        <h2
                            style={{
                                margin: 0,
                                color: "#05693a",
                                fontSize:
                                    screenWidth < 700
                                        ? "20px"
                                        : "25px",
                                fontWeight: "700",
                                flex: 1,
                                textAlign:
                                    screenWidth < 900
                                        ? "left"
                                        : "center",
                                order:
                                    screenWidth < 900
                                        ? 1
                                        : 2
                            }}
                        >
                            KSEB Invoices
                        </h2>

                        <div
                            style={{
                                display: "flex",
                                alignItems:
                                    "center",
                                gap: "8px",
                                order:
                                    screenWidth < 900
                                        ? 2
                                        : 1,
                                marginLeft:
                                    screenWidth < 900
                                        ? 0
                                        : "auto"
                            }}
                        >
                            {/* PARTY / DATE SWITCH */}
                            <div
                                style={{
                                    display:
                                        "inline-flex",
                                    alignItems:
                                        "center",
                                    padding: "3px",
                                    background:
                                        "#eef3f0",
                                    border:
                                        "1px solid #c8d8cf",
                                    borderRadius:
                                        "8px",
                                    gap: "3px"
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        setViewMode(
                                            "party"
                                        )
                                    }
                                    style={{
                                        height:
                                            "30px",
                                        padding:
                                            "0 13px",
                                        border:
                                            "none",
                                        borderRadius:
                                            "6px",
                                        background:
                                            viewMode ===
                                            "party"
                                                ? "#05693a"
                                                : "transparent",
                                        color:
                                            viewMode ===
                                            "party"
                                                ? "#fff"
                                                : "#333",
                                        fontSize:
                                            "12px",
                                        fontWeight:
                                            "700",
                                        cursor:
                                            "pointer"
                                    }}
                                >
                                    Party Wise
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setViewMode(
                                            "date"
                                        )
                                    }
                                    style={{
                                        height:
                                            "30px",
                                        padding:
                                            "0 13px",
                                        border:
                                            "none",
                                        borderRadius:
                                            "6px",
                                        background:
                                            viewMode ===
                                            "date"
                                                ? "#05693a"
                                                : "transparent",
                                        color:
                                            viewMode ===
                                            "date"
                                                ? "#fff"
                                                : "#333",
                                        fontSize:
                                            "12px",
                                        fontWeight:
                                            "700",
                                        cursor:
                                            "pointer"
                                    }}
                                >
                                    Date Wise
                                </button>
                            </div>

                            {/* EXPORT DROPDOWN */}
                            <div className="kseb-export-wrapper">
                                <button
                                    type="button"
                                    className="kseb-export-button"
                                    onClick={() =>
                                        setExportOpen(
                                            (previous) =>
                                                !previous
                                        )
                                    }
                                >
                                    <span>⇩</span>
                                    <span>
                                        Export
                                    </span>
                                    <span
                                        style={{
                                            fontSize:
                                                "10px"
                                        }}
                                    >
                                        ▼
                                    </span>
                                </button>

                                {exportOpen && (
                                    <div className="kseb-export-menu">
                                        <button
                                            type="button"
                                            onClick={
                                                exportToExcel
                                            }
                                        >
                                            📊 Export to Excel
                                        </button>

                                        <button
                                            type="button"
                                            onClick={
                                                exportToPDF
                                            }
                                        >
                                            📄 Export to PDF
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* FILTERS */}
                    <div
                        style={{
                            display: "flex",
                            alignItems:
                                "center",
                            gap: "8px",
                            flexWrap: "wrap",
                            marginTop: "10px"
                        }}
                    >
                        <input
                            type="text"
                            placeholder="Search Invoice / Party / Item / Order / Mobile..."
                            value={searchTerm}
                            onChange={(e) =>
                                setSearchTerm(
                                    e.target.value
                                )
                            }
                            style={{
                                width:
                                    screenWidth < 700
                                        ? "100%"
                                        : "340px",
                                height: "36px",
                                padding:
                                    "7px 10px",
                                border:
                                    "1px solid #ccc",
                                borderRadius:
                                    "6px",
                                fontSize:
                                    "13px",
                                boxSizing:
                                    "border-box"
                            }}
                        />

                        <select
                            value={
                                selectedMonth
                            }
                            onChange={(e) =>
                                setSelectedMonth(
                                    e.target.value
                                )
                            }
                            style={{
                                height: "36px",
                                padding:
                                    "0 10px",
                                border:
                                    "1px solid #ccc",
                                borderRadius:
                                    "6px",
                                fontSize:
                                    "13px"
                            }}
                        >
                            <option value="all">
                                All Months
                            </option>
                            <option value="4">
                                April
                            </option>
                            <option value="5">
                                May
                            </option>
                            <option value="6">
                                June
                            </option>
                            <option value="7">
                                July
                            </option>
                            <option value="8">
                                August
                            </option>
                            <option value="9">
                                September
                            </option>
                            <option value="10">
                                October
                            </option>
                            <option value="11">
                                November
                            </option>
                            <option value="12">
                                December
                            </option>
                            <option value="1">
                                January
                            </option>
                            <option value="2">
                                February
                            </option>
                            <option value="3">
                                March
                            </option>
                        </select>

                        <select
                            value={sortOrder}
                            onChange={(e) =>
                                setSortOrder(
                                    e.target.value
                                )
                            }
                            style={{
                                height: "36px",
                                padding:
                                    "0 10px",
                                border:
                                    "1px solid #ccc",
                                borderRadius:
                                    "6px",
                                fontSize:
                                    "13px"
                            }}
                        >
                            <option value="newest">
                                New → Old
                            </option>
                            <option value="oldest">
                                Old → New
                            </option>
                        </select>

                        <select
                            value={amountSort}
                            onChange={(e) =>
                                setAmountSort(
                                    e.target.value
                                )
                            }
                            style={{
                                height: "36px",
                                padding:
                                    "0 10px",
                                border:
                                    "1px solid #ccc",
                                borderRadius:
                                    "6px",
                                fontSize:
                                    "13px"
                            }}
                        >
                            <option value="default">
                                Invoice Amount
                            </option>
                            <option value="highest">
                                Highest → Lowest
                            </option>
                            <option value="lowest">
                                Lowest → Highest
                            </option>
                        </select>

                        <select
                            value={paymentFilter}
                            onChange={(e) =>
                                setPaymentFilter(
                                    e.target.value
                                )
                            }
                            style={{
                                height: "36px",
                                padding:
                                    "0 10px",
                                border:
                                    paymentFilter !== "all"
                                        ? "1px solid #b35c00"
                                        : "1px solid #ccc",
                                borderRadius:
                                    "6px",
                                fontSize:
                                    "13px",
                                fontWeight:
                                    paymentFilter !== "all"
                                        ? "700"
                                        : "400"
                            }}
                        >
                            <option value="all">
                                All Payments
                            </option>
                            <option value="not_paid">
                                Not Paid
                            </option>
                            <option value="sanctioned">
                                Payment Sanctioned
                            </option>
                            <option value="sd_overdue">
                                Security Deposit Overdue
                            </option>
                            <option value="paid">
                                Paid
                            </option>
                        </select>

                        <select
                            value={documentFilter}
                            onChange={(e) =>
                                setDocumentFilter(
                                    e.target.value
                                )
                            }
                            style={{
                                height: "36px",
                                padding:
                                    "0 10px",
                                border:
                                    documentFilter !== "all"
                                        ? "1px solid #b35c00"
                                        : "1px solid #ccc",
                                borderRadius:
                                    "6px",
                                fontSize:
                                    "13px",
                                fontWeight:
                                    documentFilter !== "all"
                                        ? "700"
                                        : "400"
                            }}
                        >
                            <option value="all">
                                All Documents
                            </option>
                            <option value="missing_any">
                                PO or Invoice Not Attached
                            </option>
                            <option value="missing_po">
                                PO Not Attached
                            </option>
                            <option value="missing_invoice">
                                Invoice Not Attached
                            </option>
                            <option value="missing_both">
                                Both Not Attached
                            </option>
                            <option value="attached">
                                PO + Invoice Attached
                            </option>
                            <option value="same_po">
                                Same PO Number
                            </option>
                        </select>

                        <button
                            onClick={
                                clearFilters
                            }
                            style={{
                                height: "36px",
                                padding:
                                    "0 12px",
                                border:
                                    "1px solid #ccc",
                                background:
                                    "#f8f9fa",
                                borderRadius:
                                    "6px",
                                cursor:
                                    "pointer",
                                fontSize:
                                    "13px",
                                fontWeight:
                                    "600"
                            }}
                        >
                            Clear
                        </button>
                    </div>

                    {/* TOTALS */}
                    <div
                        style={{
                            display: "flex",
                            alignItems:
                                "center",
                            gap: "8px",
                            flexWrap: "wrap",
                            marginTop: "10px"
                        }}
                    >
                        <div
                            style={{
                                padding:
                                    "5px 10px",
                                borderRadius:
                                    "5px",
                                background:
                                    "#eef3f0",
                                fontSize:
                                    "12px",
                                fontWeight:
                                    "700",
                                color:
                                    "#05693a"
                            }}
                        >
                            Total Invoices:{" "}
                            {
                                totals.invoiceCount
                            }
                        </div>

                        <div
                            style={{
                                padding:
                                    "5px 10px",
                                borderRadius:
                                    "5px",
                                background:
                                    "#edf8f1",
                                fontSize:
                                    "12px",
                                fontWeight:
                                    "700",
                                color:
                                    "#198754"
                            }}
                        >
                            Invoice Value: ₹{" "}
                            {formatAmount(
                                totals.invoiceAmount
                            )}
                        </div>

                        {totals.missingDocsCount > 0 && (
                            <button
                                type="button"
                                title="Show only invoices without a PO or Invoice document"
                                onClick={() =>
                                    setDocumentFilter(
                                        "missing_any"
                                    )
                                }
                                style={{
                                    padding:
                                        "5px 10px",
                                    border: "none",
                                    borderRadius:
                                        "5px",
                                    background:
                                        "#fff4e5",
                                    fontSize:
                                        "12px",
                                    fontWeight:
                                        "700",
                                    color:
                                        "#b35c00",
                                    cursor:
                                        "pointer"
                                }}
                            >
                                PO / Invoice Not Attached:{" "}
                                {totals.missingDocsCount}
                            </button>
                        )}

                        {totals.notPaidCount > 0 && (
                            <button
                                type="button"
                                title="Show only invoices not fully paid"
                                onClick={() =>
                                    setPaymentFilter(
                                        "not_paid"
                                    )
                                }
                                style={{
                                    padding:
                                        "5px 10px",
                                    border: "none",
                                    borderRadius:
                                        "5px",
                                    background:
                                        "#fdecec",
                                    fontSize:
                                        "12px",
                                    fontWeight:
                                        "700",
                                    color:
                                        "#b42318",
                                    cursor:
                                        "pointer"
                                }}
                            >
                                Not Paid:{" "}
                                {totals.notPaidCount}
                                {" "}· Balance: ₹{" "}
                                {formatAmount(
                                    totals.balanceAmount
                                )}
                            </button>
                        )}

                        {totals.sdOverdueCount > 0 && (
                            <button
                                type="button"
                                title={`Security Deposit not refunded ${sdRefundDays} days after the receipt`}
                                onClick={() =>
                                    setPaymentFilter(
                                        "sd_overdue"
                                    )
                                }
                                style={{
                                    padding:
                                        "5px 10px",
                                    border: "none",
                                    borderRadius:
                                        "5px",
                                    background:
                                        "#b42318",
                                    fontSize:
                                        "12px",
                                    fontWeight:
                                        "700",
                                    color: "#fff",
                                    cursor:
                                        "pointer"
                                }}
                            >
                                SD Overdue:{" "}
                                {totals.sdOverdueCount}
                                {" "}· ₹{" "}
                                {formatAmount(
                                    totals.sdOverdueAmount
                                )}
                            </button>
                        )}

                        {totals.sanctionedCount > 0 && (
                            <button
                                type="button"
                                title="Show only invoices with payment sanctioned but not yet credited to the bank"
                                onClick={() =>
                                    setPaymentFilter(
                                        "sanctioned"
                                    )
                                }
                                style={{
                                    padding:
                                        "5px 10px",
                                    border: "none",
                                    borderRadius:
                                        "5px",
                                    background:
                                        "#e8f1fb",
                                    fontSize:
                                        "12px",
                                    fontWeight:
                                        "700",
                                    color:
                                        "#1d5fa8",
                                    cursor:
                                        "pointer"
                                }}
                            >
                                Payment Sanctioned:{" "}
                                {totals.sanctionedCount}
                                {" "}· ₹{" "}
                                {formatAmount(
                                    totals.sanctionedAmount
                                )}
                            </button>
                        )}

                        {selectedMonth !==
                            "all" && (
                            <div
                                style={{
                                    padding:
                                        "5px 10px",
                                    borderRadius:
                                        "5px",
                                    background:
                                        "#fff4e5",
                                    fontSize:
                                        "12px",
                                    fontWeight:
                                        "700",
                                    color:
                                        "#b35c00"
                                }}
                            >
                                Export filter:{" "}
                                {
                                    getExportMonthName()
                                }
                            </div>
                        )}
                    </div>
                </div>

                {loading && (
                    <div
                        style={{
                            padding:
                                "20px",
                            textAlign:
                                "center",
                            fontWeight:
                                "600",
                            color:
                                "#05693a"
                        }}
                    >
                        Loading KSEB Invoices...
                    </div>
                )}

                {!loading &&
                    filteredData.length ===
                    0 && (
                        <div
                            style={{
                                padding:
                                    "40px 20px",
                                textAlign:
                                    "center",
                                color: "#777",
                                fontSize:
                                    "14px"
                            }}
                        >
                            No KSEB invoices
                            found.
                        </div>
                    )}

                {!loading &&
                    filteredData.length >
                    0 && (
                        <div
                            className="kseb-invoice-table-container"
                            style={{
                                width: "100%",
                                overflowX:
                                    "auto",
                                overflowY:
                                    "auto",
                                marginTop:
                                    "10px",
                                height:
                                    "calc(100vh - 245px)",
                                minHeight:
                                    "300px",
                                boxSizing:
                                    "border-box",
                                position:
                                    "relative"
                            }}
                        >
                            <table
                                style={{
                                    width: "100%",
                                    minWidth:
                                        "1465px",
                                    tableLayout:
                                        "fixed",
                                    borderCollapse:
                                        "separate",
                                    borderSpacing:
                                        0,
                                    fontSize:
                                        screenWidth <
                                        700
                                            ? "9px"
                                            : screenWidth <
                                                1100
                                                ? "10px"
                                                : "12px"
                                }}
                            >
                                <thead>
                                    <tr>
                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "50px"
                                            }}
                                        >
                                            S.No
                                        </th>

                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "95px"
                                            }}
                                        >
                                            Invoice Date
                                        </th>

                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "180px"
                                            }}
                                        >
                                            Invoice No
                                        </th>

                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "250px"
                                            }}
                                        >
                                            KSEB Party
                                        </th>

                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "150px"
                                            }}
                                        >
                                            PO Number
                                        </th>

                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "150px"
                                            }}
                                        >
                                            Invoice Amount
                                        </th>

                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "260px"
                                            }}
                                        >
                                            Attachments
                                        </th>
                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "130px"
                                            }}
                                        >
                                            Security Deposit
                                        </th>
                                        <th
                                            style={{
                                                ...thStyle,
                                                width:
                                                    "140px"
                                            }}
                                        >
                                            Tracking
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {groupedDisplayData.map(
                                        (
                                            row,
                                            index
                                        ) => {
                                            const invoiceNo =
                                                getInvoiceNo(
                                                    row
                                                );

                                            const partyName =
                                                getPartyName(
                                                    row
                                                );

                                            const isExpanded =
                                                expandedInvoice ===
                                                invoiceNo;

                                            const items =
                                                Array.isArray(
                                                    row.items
                                                )
                                                    ? row.items
                                                    : [];

                                            const isPartyExpanded =
                                                expandedParty ===
                                                invoiceNo;

                                            const hasAddress =
                                                Boolean(
                                                    row.mailing_name ||
                                                    row.mailing_address ||
                                                    row.mobile
                                                );

                                            return (
                                                <React.Fragment
                                                    key={`${invoiceNo}-${index}`}
                                                >
                                                    <tr
                                                        style={{
                                                            background:
                                                                row.__groupBg ||
                                                                "#fff"
                                                        }}
                                                    >
                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "center",
                                                                fontWeight:
                                                                    "700"
                                                            }}
                                                        >
                                                            {index +
                                                                1}
                                                        </td>

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "center",
                                                                whiteSpace:
                                                                    "nowrap",
                                                                fontWeight:
                                                                    "700"
                                                            }}
                                                        >
                                                            {formatDate(
                                                                getInvoiceDate(
                                                                    row
                                                                )
                                                            )}
                                                        </td>

                                                        <td
                                                            title={
                                                                hasInvoiceDocument(
                                                                    row
                                                                )
                                                                    ? "Invoice document attached"
                                                                    : undefined
                                                            }
                                                            style={{
                                                                ...tdStyle,
                                                                fontWeight:
                                                                    "700",
                                                                wordBreak:
                                                                    "break-word",
                                                                // Teal = invoice document attached
                                                                ...(hasInvoiceDocument(
                                                                    row
                                                                )
                                                                    ? {
                                                                        background:
                                                                            ATTACHED_BG,
                                                                        boxShadow:
                                                                            ATTACHED_ACCENT
                                                                    }
                                                                    : {})
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display:
                                                                        "flex",
                                                                    alignItems:
                                                                        "flex-start",
                                                                    gap:
                                                                        "5px"
                                                                }}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        items.length ===
                                                                        0
                                                                    }
                                                                    onClick={() =>
                                                                        toggleInvoice(
                                                                            invoiceNo
                                                                        )
                                                                    }
                                                                    style={{
                                                                        width:
                                                                            "18px",
                                                                        minWidth:
                                                                            "18px",
                                                                        height:
                                                                            "18px",
                                                                        padding:
                                                                            0,
                                                                        border:
                                                                            "none",
                                                                        background:
                                                                            "transparent",
                                                                        color:
                                                                            items.length >
                                                                            0
                                                                                ? "#05693a"
                                                                                : "#aaa",
                                                                        cursor:
                                                                            items.length >
                                                                            0
                                                                                ? "pointer"
                                                                                : "default",
                                                                        fontSize:
                                                                            "11px",
                                                                        fontWeight:
                                                                            "700"
                                                                    }}
                                                                >
                                                                    {items.length >
                                                                    0
                                                                        ? isExpanded
                                                                            ? "▲"
                                                                            : "▼"
                                                                        : ""}
                                                                </button>

                                                                <span>
                                                                    {
                                                                        invoiceNo
                                                                    }
                                                                </span>
                                                            </div>

                                                        </td>

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                fontWeight:
                                                                    "600",
                                                                wordBreak:
                                                                    "break-word"
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display:
                                                                        "flex",
                                                                    alignItems:
                                                                        "flex-start",
                                                                    gap:
                                                                        "5px"
                                                                }}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        !hasAddress
                                                                    }
                                                                    onClick={() =>
                                                                        toggleParty(
                                                                            invoiceNo
                                                                        )
                                                                    }
                                                                    style={{
                                                                        width:
                                                                            "18px",
                                                                        minWidth:
                                                                            "18px",
                                                                        height:
                                                                            "18px",
                                                                        padding:
                                                                            0,
                                                                        border:
                                                                            "none",
                                                                        background:
                                                                            "transparent",
                                                                        color:
                                                                            hasAddress
                                                                                ? "#05693a"
                                                                                : "#aaa",
                                                                        cursor:
                                                                            hasAddress
                                                                                ? "pointer"
                                                                                : "default",
                                                                        fontSize:
                                                                            "11px",
                                                                        fontWeight:
                                                                            "700"
                                                                    }}
                                                                >
                                                                    {hasAddress
                                                                        ? isPartyExpanded
                                                                            ? "▲"
                                                                            : "▼"
                                                                        : ""}
                                                                </button>

                                                                <div
                                                                    style={{
                                                                        flex: 1,
                                                                        minWidth:
                                                                            0
                                                                    }}
                                                                >
                                                                    {/* Long party names wrap inside the column
                                                                        instead of running into PO Number. */}
                                                                    <div
                                                                        style={{
                                                                            whiteSpace:
                                                                                "normal",
                                                                            overflowWrap:
                                                                                "anywhere",
                                                                            wordBreak:
                                                                                "break-word"
                                                                        }}
                                                                    >
                                                                        {
                                                                            partyName
                                                                        }
                                                                    </div>

                                                                    {row.credit_period && (
                                                                        <div
                                                                            style={{
                                                                                marginTop:
                                                                                    "4px",
                                                                                color:
                                                                                    "#dc3545",
                                                                                fontSize:
                                                                                    "10px"
                                                                            }}
                                                                        >
                                                                            Credit
                                                                            Period:{" "}
                                                                            {
                                                                                row.credit_period
                                                                            }
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {isPartyExpanded &&
                                                                hasAddress && (
                                                                    <div
                                                                        style={{
                                                                            marginTop:
                                                                                "7px",
                                                                            marginLeft:
                                                                                "23px",
                                                                            padding:
                                                                                "7px 9px",
                                                                            background:
                                                                                "#f7f9f8",
                                                                            borderLeft:
                                                                                "3px solid #05693a",
                                                                            borderRadius:
                                                                                "4px",
                                                                            fontSize:
                                                                                "11px",
                                                                            lineHeight:
                                                                                "1.5",
                                                                            whiteSpace:
                                                                                "pre-wrap",
                                                                            wordBreak:
                                                                                "break-word"
                                                                        }}
                                                                    >
                                                                        {row.mailing_name && (
                                                                            <div
                                                                                style={{
                                                                                    marginBottom:
                                                                                        "4px",
                                                                                    fontWeight:
                                                                                        "700"
                                                                                }}
                                                                            >
                                                                                <span
                                                                                    style={{
                                                                                        color:
                                                                                            "#05693a"
                                                                                    }}
                                                                                >
                                                                                    Mailing Name:
                                                                                </span>{" "}
                                                                                {
                                                                                    row.mailing_name
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.mailing_address && (
                                                                            <div>
                                                                                <span
                                                                                    style={{
                                                                                        color:
                                                                                            "#05693a",
                                                                                        fontWeight:
                                                                                            "700"
                                                                                    }}
                                                                                >
                                                                                    Address:
                                                                                </span>{" "}
                                                                                {
                                                                                    row.mailing_address
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.mobile && (
                                                                            <div
                                                                                style={{
                                                                                    marginTop:
                                                                                        "4px",
                                                                                    paddingTop:
                                                                                        "4px",
                                                                                    borderTop:
                                                                                        "1px solid #ddd"
                                                                                }}
                                                                            >
                                                                                <strong>
                                                                                    Mobile:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.mobile
                                                                                }
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                        </td>

                                                        <td
                                                            title={
                                                                hasPoDocument(
                                                                    row
                                                                )
                                                                    ? "PO document attached"
                                                                    : undefined
                                                            }
                                                            style={{
                                                                ...tdStyle,
                                                                wordBreak:
                                                                    "break-word",
                                                                fontWeight:
                                                                    "600",
                                                                // Teal = PO document attached
                                                                ...(hasPoDocument(
                                                                    row
                                                                )
                                                                    ? {
                                                                        background:
                                                                            ATTACHED_BG,
                                                                        boxShadow:
                                                                            ATTACHED_ACCENT
                                                                    }
                                                                    : {})
                                                            }}
                                                        >
                                                            {row.order_no && (
                                                                <div
                                                                    style={{
                                                                        color:
                                                                            getSamePoInvoices(
                                                                                row
                                                                            ).length >
                                                                            0
                                                                                ? "#dc3545"
                                                                                : "inherit"
                                                                    }}
                                                                >
                                                                    {
                                                                        row.order_no
                                                                    }
                                                                </div>
                                                            )}

                                                            {getSamePoInvoices(
                                                                row
                                                            ).length > 0 && (
                                                                <div
                                                                    title={getSamePoInvoices(
                                                                        row
                                                                    )
                                                                        .map(
                                                                            (
                                                                                other
                                                                            ) =>
                                                                                `${getInvoiceNo(
                                                                                    other
                                                                                )} (${formatDate(
                                                                                    getInvoiceDate(
                                                                                        other
                                                                                    )
                                                                                )})`
                                                                        )
                                                                        .join(
                                                                            "\n"
                                                                        )}
                                                                    style={{
                                                                        marginTop:
                                                                            "3px",
                                                                        color:
                                                                            "#dc3545",
                                                                        fontSize:
                                                                            "10px",
                                                                        fontWeight:
                                                                            "700",
                                                                        cursor:
                                                                            "help"
                                                                    }}
                                                                >
                                                                    Same PO:{" "}
                                                                    {getSamePoInvoices(
                                                                        row
                                                                    )
                                                                        .map(
                                                                            (
                                                                                other
                                                                            ) =>
                                                                                getInvoiceNo(
                                                                                    other
                                                                                )
                                                                        )
                                                                        .join(
                                                                            ", "
                                                                        )}
                                                                </div>
                                                            )}

                                                            {row.reference && (
                                                                <div
                                                                    style={{
                                                                        marginTop:
                                                                            row.order_no
                                                                                ? "5px"
                                                                                : "0",
                                                                        color:
                                                                            "#555"
                                                                    }}
                                                                >
                                                                    Ref:{" "}
                                                                    {
                                                                        row.reference
                                                                    }
                                                                </div>
                                                            )}

                                                            {!row.order_no &&
                                                                !row.reference && (
                                                                    <span
                                                                        style={{
                                                                            color:
                                                                                "#999"
                                                                        }}
                                                                    >
                                                                        —
                                                                    </span>
                                                                )}
                                                        </td>

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "right",
                                                                fontWeight:
                                                                    "700",
                                                                color:
                                                                    "#198754"
                                                            }}
                                                        >
                                                            ₹{" "}
                                                            {formatAmount(
                                                                row.invoice_amount
                                                            )}
                                                        </td>

                                                        <td
                                                            style={
                                                                tdStyle
                                                            }
                                                        >
                                                            {renderAttachmentsCell(
                                                                row
                                                            )}
                                                        </td>

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "center"
                                                            }}
                                                        >
                                                            {renderSdCell(
                                                                row
                                                            )}
                                                        </td>

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "center"
                                                            }}
                                                        >
                                                            {renderTrackingCell(
                                                                row,
                                                                invoiceNo
                                                            )}
                                                        </td>
                                                    </tr>

                                                    {isExpanded && (
                                                        <tr>
                                                            <td
                                                                colSpan={
                                                                    9
                                                                }
                                                                style={{
                                                                    padding:
                                                                        "10px",
                                                                    border:
                                                                        "1px solid #ddd",
                                                                    background:
                                                                        "#fbfdfc"
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        border:
                                                                            "1px solid #cbd8d0",
                                                                        borderRadius:
                                                                            "6px",
                                                                        overflow:
                                                                            "hidden"
                                                                    }}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            padding:
                                                                                "10px 12px",
                                                                            background:
                                                                                "#eef6f1",
                                                                            display:
                                                                                "flex",
                                                                            justifyContent:
                                                                                "space-between",
                                                                            alignItems:
                                                                                "center",
                                                                            gap:
                                                                                "10px",
                                                                            flexWrap:
                                                                                "wrap"
                                                                        }}
                                                                    >
                                                                        <div>
                                                                            <strong
                                                                                style={{
                                                                                    color:
                                                                                        "#05693a"
                                                                                }}
                                                                            >
                                                                                Invoice
                                                                                Details
                                                                            </strong>

                                                                            <div
                                                                                style={{
                                                                                    marginTop:
                                                                                        "4px",
                                                                                    fontSize:
                                                                                        "11px",
                                                                                    color:
                                                                                        "#444"
                                                                                }}
                                                                            >
                                                                                {
                                                                                    invoiceNo
                                                                                }{" "}
                                                                                •{" "}
                                                                                {formatDate(
                                                                                    getInvoiceDate(
                                                                                        row
                                                                                    )
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        <div
                                                                            style={{
                                                                                fontWeight:
                                                                                    "800",
                                                                                color:
                                                                                    "#198754"
                                                                            }}
                                                                        >
                                                                            Total:
                                                                            ₹{" "}
                                                                            {formatAmount(
                                                                                row.invoice_amount
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    <div
                                                                        style={{
                                                                            padding:
                                                                                "10px",
                                                                            overflowX:
                                                                                "auto"
                                                                        }}
                                                                    >
                                                                        <table className="kseb-item-table">
                                                                            <thead>
                                                                                <tr>
                                                                                    <th
                                                                                        style={{
                                                                                            width:
                                                                                                "45px"
                                                                                        }}
                                                                                    >
                                                                                        #
                                                                                    </th>

                                                                                    <th>
                                                                                        Item
                                                                                    </th>

                                                                                    <th
                                                                                        style={{
                                                                                            width:
                                                                                                "90px"
                                                                                        }}
                                                                                    >
                                                                                        Qty
                                                                                    </th>

                                                                                    <th
                                                                                        style={{
                                                                                            width:
                                                                                                "110px"
                                                                                        }}
                                                                                    >
                                                                                        Rate
                                                                                    </th>

                                                                                    <th
                                                                                        style={{
                                                                                            width:
                                                                                                "100px"
                                                                                        }}
                                                                                    >
                                                                                        Discount
                                                                                    </th>

                                                                                    <th
                                                                                        style={{
                                                                                            width:
                                                                                                "130px"
                                                                                        }}
                                                                                    >
                                                                                        Amount
                                                                                    </th>

                                                                                    <th>
                                                                                        Description
                                                                                    </th>
                                                                                </tr>
                                                                            </thead>

                                                                            <tbody>
                                                                                {items.map(
                                                                                    (
                                                                                        item,
                                                                                        itemIndex
                                                                                    ) => (
                                                                                        <tr
                                                                                            key={`${invoiceNo}-item-${itemIndex}`}
                                                                                        >
                                                                                            <td
                                                                                                style={{
                                                                                                    textAlign:
                                                                                                        "center"
                                                                                                }}
                                                                                            >
                                                                                                {itemIndex +
                                                                                                    1}
                                                                                            </td>

                                                                                            <td
                                                                                                style={{
                                                                                                    fontWeight:
                                                                                                        "700",
                                                                                                    minWidth:
                                                                                                        "200px"
                                                                                                }}
                                                                                            >
                                                                                                {
                                                                                                    item.item_name
                                                                                                }

                                                                                                {item.item_alias && (
                                                                                                    <div
                                                                                                        style={{
                                                                                                            marginTop:
                                                                                                                "3px",
                                                                                                            fontSize:
                                                                                                                "10px",
                                                                                                            color:
                                                                                                                "#777"
                                                                                                        }}
                                                                                                    >
                                                                                                        Alias:{" "}
                                                                                                        {
                                                                                                            item.item_alias
                                                                                                        }
                                                                                                    </div>
                                                                                                )}
                                                                                            </td>

                                                                                            <td
                                                                                                style={{
                                                                                                    textAlign:
                                                                                                        "right",
                                                                                                    whiteSpace:
                                                                                                        "nowrap"
                                                                                                }}
                                                                                            >
                                                                                                {formatAmount(
                                                                                                    item.quantity
                                                                                                )}
                                                                                            </td>

                                                                                            <td
                                                                                                style={{
                                                                                                    textAlign:
                                                                                                        "right",
                                                                                                    whiteSpace:
                                                                                                        "nowrap"
                                                                                                }}
                                                                                            >
                                                                                                ₹{" "}
                                                                                                {formatAmount(
                                                                                                    item.rate
                                                                                                )}
                                                                                            </td>

                                                                                            <td
                                                                                                style={{
                                                                                                    textAlign:
                                                                                                        "right",
                                                                                                    whiteSpace:
                                                                                                        "nowrap"
                                                                                                }}
                                                                                            >
                                                                                                {formatAmount(
                                                                                                    item.discount
                                                                                                )}
                                                                                            </td>

                                                                                            <td
                                                                                                style={{
                                                                                                    textAlign:
                                                                                                        "right",
                                                                                                    fontWeight:
                                                                                                        "700",
                                                                                                    whiteSpace:
                                                                                                        "nowrap"
                                                                                                }}
                                                                                            >
                                                                                                ₹{" "}
                                                                                                {formatAmount(
                                                                                                    item.amount
                                                                                                )}
                                                                                            </td>

                                                                                            <td
                                                                                                style={{
                                                                                                    minWidth:
                                                                                                        "220px",
                                                                                                    whiteSpace:
                                                                                                        "pre-wrap",
                                                                                                    wordBreak:
                                                                                                        "break-word"
                                                                                                }}
                                                                                            >
                                                                                                {item.temp_description && (
                                                                                                    <div
                                                                                                        style={{
                                                                                                            marginBottom:
                                                                                                                "4px"
                                                                                                        }}
                                                                                                    >
                                                                                                        <strong>
                                                                                                            Note:
                                                                                                        </strong>{" "}
                                                                                                        {
                                                                                                            item.temp_description
                                                                                                        }
                                                                                                    </div>
                                                                                                )}

                                                                                                {item.description && (
                                                                                                    <div>
                                                                                                        {
                                                                                                            item.description
                                                                                                        }
                                                                                                    </div>
                                                                                                )}

                                                                                                {item.godown && (
                                                                                                    <div
                                                                                                        style={{
                                                                                                            marginTop:
                                                                                                                "4px",
                                                                                                            fontSize:
                                                                                                                "10px",
                                                                                                            color:
                                                                                                                "#666"
                                                                                                        }}
                                                                                                    >
                                                                                                        Godown:{" "}
                                                                                                        {
                                                                                                            item.godown
                                                                                                        }
                                                                                                    </div>
                                                                                                )}
                                                                                            </td>
                                                                                        </tr>
                                                                                    )
                                                                                )}
                                                                            </tbody>

                                                                            <tfoot>
                                                                                <tr>
                                                                                    <td
                                                                                        colSpan={
                                                                                            5
                                                                                        }
                                                                                        style={{
                                                                                            textAlign:
                                                                                                "right",
                                                                                            fontWeight:
                                                                                                "800",
                                                                                            background:
                                                                                                "#f5f8f6"
                                                                                        }}
                                                                                    >
                                                                                        Item
                                                                                        Total
                                                                                    </td>

                                                                                    <td
                                                                                        style={{
                                                                                            textAlign:
                                                                                                "right",
                                                                                            fontWeight:
                                                                                                "800",
                                                                                            background:
                                                                                                "#f5f8f6",
                                                                                            whiteSpace:
                                                                                                "nowrap"
                                                                                        }}
                                                                                    >
                                                                                        ₹{" "}
                                                                                        {formatAmount(
                                                                                            getItemTotal(
                                                                                                items
                                                                                            )
                                                                                        )}
                                                                                    </td>

                                                                                    <td
                                                                                        style={{
                                                                                            background:
                                                                                                "#f5f8f6"
                                                                                        }}
                                                                                    />
                                                                                </tr>
                                                                            </tfoot>
                                                                        </table>
                                                                    </div>

                                                                    <div
                                                                        style={{
                                                                            padding:
                                                                                "10px 12px",
                                                                            borderTop:
                                                                                "1px solid #ddd",
                                                                            background:
                                                                                "#fff",
                                                                            display:
                                                                                "grid",
                                                                            gridTemplateColumns:
                                                                                screenWidth <
                                                                                800
                                                                                    ? "1fr"
                                                                                    : "1fr 1fr",
                                                                            gap:
                                                                                "8px 20px",
                                                                            fontSize:
                                                                                "11px"
                                                                        }}
                                                                    >
                                                                        {row.mailing_name && (
                                                                            <div>
                                                                                <strong>
                                                                                    Mailing
                                                                                    Name:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.mailing_name
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.mailing_address && (
                                                                            <div>
                                                                                <strong>
                                                                                    Address:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.mailing_address
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.order_no && (
                                                                            <div>
                                                                                <strong>
                                                                                    PO
                                                                                    Number:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.order_no
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.reference && (
                                                                            <div>
                                                                                <strong>
                                                                                    Reference:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.reference
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.sales_ledger && (
                                                                            <div>
                                                                                <strong>
                                                                                    Sales
                                                                                    Ledger:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.sales_ledger
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.godown && (
                                                                            <div>
                                                                                <strong>
                                                                                    Godown:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.godown
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.enquiry_no && (
                                                                            <div>
                                                                                <strong>
                                                                                    Enquiry
                                                                                    No:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.enquiry_no
                                                                                }
                                                                            </div>
                                                                        )}

                                                                        {row.narration && (
                                                                            <div
                                                                                style={{
                                                                                    gridColumn:
                                                                                        screenWidth <
                                                                                        800
                                                                                            ? "auto"
                                                                                            : "1 / -1"
                                                                                }}
                                                                            >
                                                                                <strong>
                                                                                    Narration:
                                                                                </strong>{" "}
                                                                                {
                                                                                    row.narration
                                                                                }
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}

                                                    {expandedPayment ===
                                                        invoiceNo && (
                                                        <tr>
                                                            <td
                                                                colSpan={9}
                                                                style={{
                                                                    padding:
                                                                        "8px 10px",
                                                                    border:
                                                                        "1px solid #ddd",
                                                                    background:
                                                                        "#fbfdfc"
                                                                }}
                                                            >
                                                                <KsebPaymentDetailsModal
                                                                    inline
                                                                    invoice={row}
                                                                    onClose={() =>
                                                                        setExpandedPayment(
                                                                            null
                                                                        )
                                                                    }
                                                                />
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        }
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>

            {trackingInvoice && (
                <KsebInvoiceTrackingModal
                    invoice={trackingInvoice}
                    initialDocType={trackingDocType}
                    onClose={() => setTrackingInvoice(null)}
                    onChanged={(documents) => {
                        fetchTrackingSummary();
                        updateRowDocuments(
                            getInvoiceNo(trackingInvoice),
                            documents
                        );
                    }}
                />
            )}
        </>
    );
};

export default KSEBInvoices;
