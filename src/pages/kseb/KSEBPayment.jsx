import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { apiFetch } from "../../api/apiClient";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = "/serverphp";

const KSEBPayment = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("all");
    const [sortOrder, setSortOrder] = useState("newest");
    const [amountSort, setAmountSort] = useState("default");
    const [viewMode, setViewMode] = useState("party");

    const [expandedInvoice, setExpandedInvoice] = useState(null);
    const [expandedParty, setExpandedParty] = useState(null);

    const [exportOpen, setExportOpen] = useState(false);

    const [screenWidth, setScreenWidth] = useState(
        typeof window !== "undefined" ? window.innerWidth : 1200
    );

    useEffect(() => {
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
            } else if (result && Array.isArray(result.data)) {
                setData(result.data);
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
        amountSort
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

        filteredData.forEach((row) => {
            invoiceAmount += Number(
                row?.invoice_amount || 0
            );
        });

        return {
            invoiceCount: filteredData.length,
            invoiceAmount
        };
    }, [filteredData]);

    const clearFilters = () => {
        setSearchTerm("");
        setSelectedMonth("all");
        setSortOrder("newest");
        setAmountSort("default");
        setViewMode("party");
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
                "Order No": cleanExportValue(
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
                )
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
            { wch: 40 }
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
                    "Order No",
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
                    `Order No: ${row.order_no}`
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
        verticalAlign: "middle"
    };

    const renderBanner = () => <Banner />;

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
                                        "1050px",
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
                                            Order / Reference
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
                                                    "100px"
                                            }}
                                        >
                                            Voucher Type
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
                                                            style={{
                                                                ...tdStyle,
                                                                fontWeight:
                                                                    "700",
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

                                                            {row.voucher_type && (
                                                                <div
                                                                    style={{
                                                                        marginTop:
                                                                            "5px",
                                                                        fontSize:
                                                                            "10px",
                                                                        color:
                                                                            "#666",
                                                                        fontWeight:
                                                                            "600"
                                                                    }}
                                                                >
                                                                    {
                                                                        row.voucher_type
                                                                    }
                                                                </div>
                                                            )}
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
                                                                    <div>
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
                                                            style={{
                                                                ...tdStyle,
                                                                wordBreak:
                                                                    "break-word",
                                                                fontWeight:
                                                                    "600"
                                                            }}
                                                        >
                                                            {row.order_no && (
                                                                <div>
                                                                    Order:{" "}
                                                                    {
                                                                        row.order_no
                                                                    }
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
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "center",
                                                                fontSize:
                                                                    "10px",
                                                                fontWeight:
                                                                    "700",
                                                                color:
                                                                    "#555"
                                                            }}
                                                        >
                                                            {
                                                                row.voucher_type
                                                            }
                                                        </td>
                                                    </tr>

                                                    {isExpanded && (
                                                        <tr>
                                                            <td
                                                                colSpan={
                                                                    7
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
                                                                                    Order
                                                                                    No:
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
                                                </React.Fragment>
                                            );
                                        }
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>
        </>
    );
};

export default KSEBPayment;