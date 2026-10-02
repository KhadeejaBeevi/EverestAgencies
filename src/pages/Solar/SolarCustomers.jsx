import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { apiFetch } from "../../api/apiClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = "/serverphp";

export default function SolarCustomers() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [type, setType] = useState("all");
    const [month, setMonth] = useState("all");
    const [sort, setSort] = useState("newest");
    const [amountSort, setAmountSort] = useState("default");
    const [view, setView] = useState("party");
    const [expandedCustomer, setExpandedCustomer] = useState(null);
    const [expandedInvoice, setExpandedInvoice] = useState(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [width, setWidth] = useState(
        typeof window === "undefined" ? 1200 : window.innerWidth
    );

    useEffect(() => {
        load();
        const resize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);

    useEffect(() => {
        setExpandedCustomer(null);
        setExpandedInvoice(null);
    }, [type, month, search, view]);

    const load = async () => {
        setLoading(true);
        setError("");

        try {
            const r = await apiFetch(`${API}/solar_customers.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({})
            });

            const json = await r.json();

            console.log("SOLAR API RESPONSE:", json);

            if (!r.ok) {
                throw new Error(json?.message || `HTTP Error ${r.status}`);
            }

            if (json?.success === false) {
                throw new Error(json?.message || "Solar API returned an error");
            }

            const rows = Array.isArray(json)
                ? json
                : Array.isArray(json?.data)
                    ? json.data
                    : [];

            console.log("SOLAR ROW COUNT:", rows.length);
            setData(rows);
        } catch (e) {
            console.error("Solar API error:", e);
            setError(e?.message || "Unable to load Solar Customer data.");
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const date = (value) => {
        if (!value) return "";
        const s = String(value);
        const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return match[0];
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    };

    const displayDate = (value) => {
        const d = date(value);
        if (!d) return value || "";
        return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };

    const money = (value) =>
        Number(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const party = (row) =>
        String(
            row?.party_name ||
            row?.PartyLedgerName ||
            row?.mailing_name ||
            "Unknown Party"
        ).trim();

    const inv = (row) =>
        String(row?.invoice_no || row?.VoucherNumber || "").trim();

    const solarType = (row) =>
        String(row?.solar_type || row?.EveSolarCust_Shop || "")
            .trim()
            .toUpperCase();

    const voucherType = (row) => {
        const v = String(row?.voucher_type || row?.VoucherTypeName || "")
            .trim()
            .toUpperCase();

        if (v.includes("B2B")) return "B2B";
        if (v.includes("B2C")) return "B2C";
        if (v.includes("CASH")) return "CASH";

        return v || "-";
    };

    const monthNo = (value) => {
        const d = date(value);
        return d ? Number(d.slice(5, 7)) : null;
    };

    const safeAmount = (row) => Number(row?.invoice_amount || 0);

    const searchText = (row) => {
        return [
            row?.invoice_no,
            row?.VoucherNumber,
            row?.party_name,
            row?.PartyLedgerName,
            row?.mailing_name,
            row?.mailing_address,
            row?.mobile,
            row?.order_no,
            row?.reference,
            voucherType(row),
            row?.solar_type,
            ...(Array.isArray(row?.items)
                ? row.items.flatMap(item => [
                    item?.item_name,
                    item?.item_alias,
                    item?.description,
                    item?.temp_description
                ])
                : [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
    };

    const filtered = useMemo(() => {
        let rows = [...data];

        if (type !== "all") {
            rows = rows.filter(row => solarType(row) === type);
        }

        if (month !== "all") {
            rows = rows.filter(
                row => monthNo(row?.invoice_date) === Number(month)
            );
        }

        if (search.trim()) {
            const q = search.trim().toLowerCase();
            rows = rows.filter(row => searchText(row).includes(q));
        }

        if (amountSort === "highest" || amountSort === "lowest") {
            rows.sort((a, b) => {
                const amountA = safeAmount(a);
                const amountB = safeAmount(b);
                return amountSort === "highest"
                    ? amountB - amountA
                    : amountA - amountB;
            });
        } else {
            rows.sort((a, b) => {
                const dateA = date(a?.invoice_date);
                const dateB = date(b?.invoice_date);

                if (dateA !== dateB) {
                    return sort === "newest"
                        ? dateB.localeCompare(dateA)
                        : dateA.localeCompare(dateB);
                }

                return inv(a).localeCompare(inv(b), undefined, {
                    numeric: true,
                    sensitivity: "base"
                });
            });
        }

        if (view === "party") {
            rows.sort((a, b) => {
                const partyCompare = party(a).localeCompare(party(b), undefined, {
                    sensitivity: "base"
                });

                if (partyCompare !== 0) return partyCompare;

                const dateA = date(a?.invoice_date);
                const dateB = date(b?.invoice_date);

                if (dateA !== dateB) {
                    return sort === "newest"
                        ? dateB.localeCompare(dateA)
                        : dateA.localeCompare(dateB);
                }

                return inv(a).localeCompare(inv(b), undefined, {
                    numeric: true,
                    sensitivity: "base"
                });
            });
        }

        return rows;
    }, [data, type, month, search, sort, amountSort, view]);

    /*
     * PARTY WISE VIEW:
     * Group all invoices belonging to the same customer.
     * The customer row is the main row. Clicking its arrow/name
     * opens all invoices for that customer.
     */
    const customerGroups = useMemo(() => {
        if (view !== "party") return [];

        const map = new Map();

        filtered.forEach(row => {
            const key = party(row).toLowerCase();

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    partyName: party(row),
                    mobile: row?.mobile || "",
                    mailingName: row?.mailing_name || "",
                    address: row?.mailing_address || "",
                    invoices: [],
                    total: 0,
                    latestDate: "",
                    types: new Set()
                });
            }

            const group = map.get(key);
            group.invoices.push(row);
            group.total += safeAmount(row);
            group.types.add(solarType(row));

            if (!group.mobile && row?.mobile) group.mobile = row.mobile;
            if (!group.mailingName && row?.mailing_name) group.mailingName = row.mailing_name;
            if (!group.address && row?.mailing_address) group.address = row.mailing_address;

            const currentDate = date(row?.invoice_date);
            if (!group.latestDate || currentDate > group.latestDate) {
                group.latestDate = currentDate;
            }
        });

        return Array.from(map.values()).sort((a, b) =>
            a.partyName.localeCompare(b.partyName, undefined, {
                sensitivity: "base"
            })
        );
    }, [filtered, view]);

    const total = filtered.reduce((sum, row) => sum + safeAmount(row), 0);

    const clear = () => {
        setSearch("");
        setType("all");
        setMonth("all");
        setSort("newest");
        setAmountSort("default");
        setView("party");
        setExpandedCustomer(null);
        setExpandedInvoice(null);
    };

    const exportExcel = () => {
        if (!filtered.length) {
            alert("No Solar data available to export.");
            return;
        }

        const rows = filtered.map((row, index) => ({
            "S.No": index + 1,
            "Invoice Date": displayDate(row.invoice_date),
            "Invoice No": inv(row),
            "Solar Type": solarType(row),
            "Party Name": party(row),
            "Mailing Name": row.mailing_name || "",
            "Address": row.mailing_address || "",
            "Mobile": row.mobile || "",
            "Order No": row.order_no || "",
            "Reference": row.reference || "",
            "Invoice Amount": safeAmount(row),
            "Voucher Type": voucherType(row)
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Solar Customers");
        XLSX.writeFile(wb, "Solar_Customers.xlsx");
        setExportOpen(false);
    };

    const exportPDF = () => {
        if (!filtered.length) {
            alert("No Solar data available to export.");
            return;
        }

        const doc = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: "a4"
        });

        doc.setFontSize(16);
        doc.text(type === "all" ? "Solar Customers" : `Solar - ${type}`, 14, 14);
        doc.setFontSize(9);
        doc.text(`Total Invoices: ${filtered.length}`, 14, 21);
        doc.text(`Invoice Value: Rs. ${money(total)}`, 75, 21);

        autoTable(doc, {
            startY: 27,
            head: [[
                "S.No",
                "Invoice Date",
                "Invoice No",
                "Solar Type",
                "Party Name",
                "Order No",
                "Invoice Amount",
                "Voucher Type"
            ]],
            body: filtered.map((row, index) => [
                index + 1,
                displayDate(row.invoice_date),
                inv(row),
                solarType(row),
                party(row),
                row.order_no || "",
                `Rs. ${money(row.invoice_amount)}`,
                voucherType(row)
            ]),
            theme: "grid",
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fontSize: 7, fontStyle: "bold", halign: "center" }
        });

        doc.save("Solar_Customers.pdf");
        setExportOpen(false);
    };

    const th = {
        padding: "8px",
        border: "1px solid #d9d9d9",
        background: "#05693a",
        color: "#fff",
        textAlign: "center",
        fontWeight: 700,
        whiteSpace: "nowrap",
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundClip: "padding-box"
    };

    const td = {
        padding: width < 700 ? "5px" : width < 1100 ? "6px" : "8px",
        border: "1px solid #ddd",
        verticalAlign: "middle"
    };

    const renderInvoiceDetail = (row, invoice, rowIndex) => {
        const open = expandedInvoice === invoice;

        return (
            <React.Fragment key={`invoice-${invoice}`}>
                <tr
                    className="solar-invoice-row"
                    onClick={() => setExpandedInvoice(open ? null : invoice)}
                    style={{
                        background: "#fff",
                        cursor: "pointer"
                    }}
                >
                    <td style={{ ...td, textAlign: "center", fontWeight: 700, color: "#05693a" }}>{rowIndex + 1}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                        {displayDate(row.invoice_date)}
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: "#05693a" }}>
                        <span style={{ marginRight: 6, fontSize: 13 }}>{open ? "▼" : "▶"}</span>
                        {invoice}
                        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                            {open ? "Hide invoice details" : "View invoice details"}
                        </div>
                    </td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 700, color: "#05693a" }}>
                        {solarType(row)}
                    </td>
                    <td style={{ ...td, fontWeight: 600, wordBreak: "break-word" }}>
                        {party(row)}
                    </td>
                    <td style={{ ...td, wordBreak: "break-word" }}>
                        {row.order_no && <div>Order: {row.order_no}</div>}
                        {row.reference && (
                            <div style={{ color: "#666", fontSize: 11 }}>
                                Ref: {row.reference}
                            </div>
                        )}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#198754" }}>
                        ₹ {money(row.invoice_amount)}
                    </td>
                </tr>

                {open && (
                    <tr>
                        <td colSpan={7} style={{ padding: 10, background: "#f8fbf9", border: "1px solid #ddd" }}>
                            <div style={{ padding: 12, border: "1px solid #cbd8d0", borderRadius: 6 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                    <b style={{ color: "#05693a" }}>Solar Invoice Details</b>
                                    <b>₹ {money(row.invoice_amount)}</b>
                                </div>

                                <div style={{ marginTop: 8, fontSize: 12 }}>
                                    <strong>Party:</strong> {party(row)} {" | "}
                                    <strong>Type:</strong> {solarType(row)} {" | "}
                                    <strong>Invoice:</strong> {invoice}
                                </div>

                                {row.mailing_name && (
                                    <div style={{ fontSize: 12, marginTop: 5 }}>
                                        <strong>Mailing Name:</strong> {row.mailing_name}
                                    </div>
                                )}
                                {row.mailing_address && (
                                    <div style={{ fontSize: 12, marginTop: 5 }}>
                                        <strong>Address:</strong> {row.mailing_address}
                                    </div>
                                )}
                                {row.mobile && (
                                    <div style={{ fontSize: 12, marginTop: 5 }}>
                                        <strong>Mobile:</strong> {row.mobile}
                                    </div>
                                )}
                                {row.order_no && (
                                    <div style={{ fontSize: 12, marginTop: 5 }}>
                                        <strong>Order No:</strong> {row.order_no}
                                    </div>
                                )}
                                {row.reference && (
                                    <div style={{ fontSize: 12, marginTop: 5 }}>
                                        <strong>Reference:</strong> {row.reference}
                                    </div>
                                )}

                                {Array.isArray(row.items) && row.items.length > 0 && (
                                    <div style={{ overflowX: "auto", marginTop: 12 }}>
                                        <table style={{ width: "100%", minWidth: 850, borderCollapse: "collapse", fontSize: 11 }}>
                                            <thead>
                                                <tr>
                                                    {["#", "Item", "Qty", "Rate", "Discount", "GST %", "Tax", "Amount"].map(h => (
                                                        <th key={h} style={{ padding: 6, border: "1px solid #ccc", background: "#dceee4", color: "#05693a", fontWeight: 700, textAlign: h === "Item" ? "left" : "center" }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {row.items.map((item, itemIndex) => (
                                                    <tr key={`${invoice}-item-${itemIndex}`}>
                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>{itemIndex + 1}</td>
                                                        <td style={{ padding: 6, border: "1px solid #ddd" }}>
                                                            <b>{item.item_name || ""}</b>
                                                            {item.item_alias && <div style={{ color: "#777", fontSize: 10 }}>{item.item_alias}</div>}
                                                            {item.description && <div style={{ color: "#777", fontSize: 10 }}>{item.description}</div>}
                                                        </td>
                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>{item.quantity ?? 0}</td>
                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "right" }}>{money(item.rate || item.batch_rate)}</td>
                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "right" }}>{item.discount || item.batch_discount || 0}</td>
                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>{item.gst_rate || 0}%</td>
                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "right" }}>{money(item.tax_amount)}</td>
                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "right", fontWeight: 700 }}>{money(item.amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

    return (
        <>
            <style>{`
                html, body, #root { overflow: hidden; }
                .solar-table { scrollbar-width: thin; }
                .solar-table::-webkit-scrollbar { width: 8px; height: 8px; }
                .solar-table::-webkit-scrollbar-thumb { background: #aaa; border-radius: 5px; }
                .solar-export { position: relative; display: inline-block; }
                .solar-export-menu {
                    position: absolute; right: 0; top: 40px; background: #fff;
                    border: 1px solid #ccc; border-radius: 7px;
                    box-shadow: 0 5px 18px rgba(0,0,0,.15); padding: 5px;
                    z-index: 1000; min-width: 190px;
                }
                .solar-export-menu button {
                    display: block; width: 100%; border: 0; background: #fff;
                    padding: 10px; text-align: left; cursor: pointer;
                }
                .solar-export-menu button:hover { background: #eef6f1; }
                .solar-row:hover { background: #eaf5ef !important; }
                .solar-customer-row:hover { background: #e7f3ec !important; }
                .solar-invoice-row:hover { background: #f0f7f3 !important; }
            `}</style>

            <Banner />

            <div style={{ padding: width < 700 ? 10 : 20, width: "100%", boxSizing: "border-box" }}>
                <div style={{ position: "sticky", top: 65, zIndex: 100, background: "#fff", padding: "10px 0", borderBottom: "1px solid #ddd" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <h2 style={{ margin: 0, color: "#05693a", fontSize: width < 700 ? 20 : 25, flex: 1, textAlign: width < 900 ? "left" : "center" }}>
                            Solar Customers
                        </h2>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ display: "flex", padding: 3, background: "#eef3f0", border: "1px solid #c8d8cf", borderRadius: 8 }}>
                                {["party", "date"].map(value => (
                                    <button
                                        key={value}
                                        onClick={() => setView(value)}
                                        style={{
                                            height: 30,
                                            padding: "0 13px",
                                            border: 0,
                                            borderRadius: 6,
                                            cursor: "pointer",
                                            background: view === value ? "#05693a" : "transparent",
                                            color: view === value ? "#fff" : "#333",
                                            fontWeight: 700
                                        }}
                                    >
                                        {value === "party" ? "Party Wise" : "Date Wise"}
                                    </button>
                                ))}
                            </div>

                            <div className="solar-export">
                                <button
                                    onClick={() => setExportOpen(value => !value)}
                                    style={{ height: 36, padding: "0 14px", border: 0, borderRadius: 6, background: "#05693a", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                                >
                                    ⇩ Export ▼
                                </button>

                                {exportOpen && (
                                    <div className="solar-export-menu">
                                        <button onClick={exportExcel}>📊 Export to Excel</button>
                                        <button onClick={exportPDF}>📄 Export to PDF</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search Invoice / Party / Item / Order / Mobile..."
                            style={{ width: width < 700 ? "100%" : 340, height: 36, padding: "7px 10px", border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" }}
                        />

                        <select value={type} onChange={e => setType(e.target.value)} style={{ height: 36, border: "1px solid #ccc", borderRadius: 6, padding: "0 10px" }}>
                            <option value="all">All Solar</option>
                            <option value="SOLAR SHOP">SOLAR SHOP</option>
                            <option value="SOLAR CUSTOMER">SOLAR CUSTOMER</option>
                        </select>

                        <select value={month} onChange={e => setMonth(e.target.value)} style={{ height: 36, border: "1px solid #ccc", borderRadius: 6, padding: "0 10px" }}>
                            <option value="all">All Months</option>
                            {[4,5,6,7,8,9,10,11,12,1,2,3].map(m => (
                                <option key={m} value={m}>
                                    {["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m]}
                                </option>
                            ))}
                        </select>

                        <select value={sort} onChange={e => setSort(e.target.value)} style={{ height: 36, border: "1px solid #ccc", borderRadius: 6, padding: "0 10px" }}>
                            <option value="newest">New → Old</option>
                            <option value="oldest">Old → New</option>
                        </select>

                        <select value={amountSort} onChange={e => setAmountSort(e.target.value)} style={{ height: 36, border: "1px solid #ccc", borderRadius: 6, padding: "0 10px" }}>
                            <option value="default">Invoice Amount</option>
                            <option value="highest">Highest → Lowest</option>
                            <option value="lowest">Lowest → Highest</option>
                        </select>

                        <button onClick={clear} style={{ height: 36, padding: "0 12px", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", background: "#fff" }}>
                            Clear
                        </button>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <b style={{ padding: "5px 10px", background: "#eef3f0", borderRadius: 5, color: "#05693a", fontSize: 12 }}>
                            Total Customers: {view === "party" ? customerGroups.length : "—"}
                        </b>
                        <b style={{ padding: "5px 10px", background: "#eef3f0", borderRadius: 5, color: "#05693a", fontSize: 12 }}>
                            Total Invoices: {filtered.length}
                        </b>
                        <b style={{ padding: "5px 10px", background: "#edf8f1", borderRadius: 5, color: "#198754", fontSize: 12 }}>
                            Invoice Value: ₹ {money(total)}
                        </b>
                        {type !== "all" && (
                            <b style={{ padding: "5px 10px", background: "#fff4e5", borderRadius: 5, color: "#b35c00", fontSize: 12 }}>
                                {type}
                            </b>
                        )}
                    </div>
                </div>

                {loading && (
                    <div style={{ padding: 40, textAlign: "center", color: "#05693a", fontWeight: 600 }}>
                        Loading Solar Customers...
                    </div>
                )}

                {!loading && error && (
                    <div style={{ marginTop: 20, padding: 18, background: "#fff1f1", border: "1px solid #e0a0a0", borderRadius: 8, color: "#b00020" }}>
                        <strong>Solar API Error</strong>
                        <div style={{ marginTop: 6 }}>{error}</div>
                        <button onClick={load} style={{ marginTop: 12, padding: "7px 14px", border: 0, borderRadius: 6, background: "#05693a", color: "#fff", cursor: "pointer" }}>
                            Retry
                        </button>
                    </div>
                )}

                {!loading && !error && !filtered.length && (
                    <div style={{ padding: 40, textAlign: "center", color: "#777" }}>
                        No Solar customers found.
                    </div>
                )}

                {!loading && !error && filtered.length > 0 && (
                    <div className="solar-table" style={{ overflow: "auto", height: "calc(100vh - 245px)", marginTop: 10 }}>
                        <table style={{ width: "100%", minWidth: 1150, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, fontSize: width < 700 ? 9 : 12 }}>
                            <thead style={{ position: "sticky", top: 0, zIndex: 40 }}>
                                <tr>
                                    <th style={{ ...th, width: 50 }}>S.No</th>
                                    <th style={{ ...th, width: 95 }}>Invoice Date</th>
                                    <th style={{ ...th, width: 170 }}>Invoice No</th>
                                    <th style={{ ...th, width: 150 }}>Solar Type</th>
                                    <th style={{ ...th, width: 270 }}>{view === "party" ? "Customer / Party Name" : "Party Name"}</th>
                                    <th style={{ ...th, width: 160 }}>{view === "party" ? "Invoices / Order" : "Order / Reference"}</th>
                                    <th style={{ ...th, width: 155 }}>Invoice Amount</th>
                                </tr>
                            </thead>

                            <tbody>
                                {view === "party" ? (
                                    customerGroups.map((group, groupIndex) => {
                                        const openCustomer = expandedCustomer === group.key;
                                        const groupTypes = Array.from(group.types).filter(Boolean).join(", ");

                                        return (
                                            <React.Fragment key={group.key}>
                                                <tr
                                                    className="solar-customer-row"
                                                    onClick={() => {
                                                        setExpandedCustomer(openCustomer ? null : group.key);
                                                        setExpandedInvoice(null);
                                                    }}
                                                    style={{
                                                        background: groupIndex % 2 ? "#f7fbf8" : "#f4f7ff",
                                                        cursor: "pointer"
                                                    }}
                                                >
                                                    <td style={{ ...td, textAlign: "center", fontWeight: 700, color: "#05693a" }}>
                                                        {groupIndex + 1}
                                                    </td>
                                                    <td style={{ ...td, textAlign: "center" }}>
                                                        {displayDate(group.latestDate)}
                                                    </td>
                                                    <td style={{ ...td, fontWeight: 700, color: "#05693a" }}>
                                                        {group.invoices.length} invoice{group.invoices.length !== 1 ? "s" : ""}
                                                        <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>
                                                            {openCustomer ? "Click to collapse" : "Click to view invoices"}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...td, textAlign: "center", fontWeight: 700, color: "#05693a", fontSize: 11 }}>
                                                        {groupTypes || "-"}
                                                    </td>
                                                    <td style={{ ...td, fontWeight: 700, wordBreak: "break-word" }}>
                                                        <span style={{ marginRight: 8, color: "#05693a", fontSize: 15 }}>
                                                            {openCustomer ? "▼" : "▶"}
                                                        </span>
                                                        {group.partyName}
                                                        {group.mobile && (
                                                            <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>
                                                                Mobile: {group.mobile}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ ...td, fontSize: 11 }}>
                                                        <div style={{ fontWeight: 600 }}>Latest: {displayDate(group.latestDate)}</div>
                                                        <div style={{ color: "#666", marginTop: 3 }}>
                                                            {group.invoices.length} invoice{group.invoices.length !== 1 ? "s" : ""}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#198754" }}>
                                                        ₹ {money(group.total)}
                                                    </td>
                                                </tr>

                                                {openCustomer && (
                                                    <tr>
                                                        <td colSpan={7} style={{ padding: 8, background: "#fbfdfc", border: "1px solid #d8e3dc" }}>
                                                            <div style={{ border: "1px solid #cbd8d0", borderRadius: 6, overflow: "hidden" }}>
                                                                <div style={{ padding: "9px 12px", background: "#edf6f0", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                                                    <div>
                                                                        <b style={{ color: "#05693a" }}>{group.partyName}</b>
                                                                        {group.mailingName && <span style={{ marginLeft: 12, fontSize: 11, color: "#666" }}>{group.mailingName}</span>}
                                                                    </div>
                                                                    <b style={{ color: "#198754" }}>{group.invoices.length} invoices · ₹ {money(group.total)}</b>
                                                                </div>

                                                                {group.address && (
                                                                    <div style={{ padding: "7px 12px", fontSize: 11, color: "#555", borderBottom: "1px solid #e2e8e4" }}>
                                                                        <strong>Address:</strong> {group.address}
                                                                    </div>
                                                                )}

                                                                <table style={{ width: "100%", minWidth: 1050, borderCollapse: "collapse", fontSize: 11 }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={{ padding: 7, background: "#dceee4", color: "#05693a", border: "1px solid #b9d2c2", width: 50, fontWeight: 700, textAlign: "center" }}>#</th>
                                                                            <th style={{ padding: 7, background: "#dceee4", color: "#05693a", border: "1px solid #b9d2c2", width: 100, fontWeight: 700, textAlign: "center" }}>Date</th>
                                                                            <th style={{ padding: 7, background: "#dceee4", color: "#05693a", border: "1px solid #b9d2c2", width: 180, fontWeight: 700 }}>Invoice No</th>
                                                                            <th style={{ padding: 7, background: "#dceee4", color: "#05693a", border: "1px solid #b9d2c2", width: 140, fontWeight: 700, textAlign: "center" }}>Solar Type</th>
                                                                            <th style={{ padding: 7, background: "#dceee4", color: "#05693a", border: "1px solid #b9d2c2", fontWeight: 700 }}>Order / Reference</th>
                                                                            <th style={{ padding: 7, background: "#dceee4", color: "#05693a", border: "1px solid #b9d2c2", width: 140, fontWeight: 700, textAlign: "center" }}>Amount</th>
                                                                            <th style={{ padding: 7, background: "#dceee4", color: "#05693a", border: "1px solid #b9d2c2", width: 110, fontWeight: 700, textAlign: "center" }}>Voucher Type</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {group.invoices.map((row, invoiceIndex) => (
                                                                            <React.Fragment key={`${group.key}-${inv(row)}-${invoiceIndex}`}>
                                                                                <tr
                                                                                    className="solar-invoice-row"
                                                                                    onClick={() => setExpandedInvoice(expandedInvoice === inv(row) ? null : inv(row))}
                                                                                    style={{ cursor: "pointer", background: invoiceIndex % 2 ? "#fff" : "#f9fcfa" }}
                                                                                >
                                                                                    <td style={{ padding: 7, border: "1px solid #ddd", textAlign: "center" }}>{invoiceIndex + 1}</td>
                                                                                    <td style={{ padding: 7, border: "1px solid #ddd", textAlign: "center" }}>{displayDate(row.invoice_date)}</td>
                                                                                    <td style={{ padding: 7, border: "1px solid #ddd", fontWeight: 700, color: "#05693a" }}>
                                                                                        <span style={{ marginRight: 5 }}>{expandedInvoice === inv(row) ? "▼" : "▶"}</span>
                                                                                        {inv(row)}
                                                                                    </td>
                                                                                    <td style={{ padding: 7, border: "1px solid #ddd", textAlign: "center", fontWeight: 700, color: "#05693a" }}>{solarType(row)}</td>
                                                                                    <td style={{ padding: 7, border: "1px solid #ddd" }}>
                                                                                        {row.order_no && <div>Order: {row.order_no}</div>}
                                                                                        {row.reference && <div style={{ color: "#666" }}>Ref: {row.reference}</div>}
                                                                                    </td>
                                                                                    <td style={{ padding: 7, border: "1px solid #ddd", textAlign: "right", fontWeight: 700, color: "#198754" }}>₹ {money(row.invoice_amount)}</td>
                                                                                    <td style={{ padding: 7, border: "1px solid #ddd", textAlign: "center", fontSize: 10 }}>{voucherType(row)}</td>
                                                                                </tr>

                                                                                {expandedInvoice === inv(row) && (
                                                                                    <tr>
                                                                                        <td colSpan={7} style={{ padding: 10, background: "#eef6f1", border: "1px solid #b9d2c2" }}>
                                                                                            <div style={{ padding: 12, border: "1px solid #b9d2c2", borderRadius: 6, background: "#ffffff" }}>
                                                                                                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                                                                                                    <b style={{ color: "#05693a" }}>Invoice Details — {inv(row)}</b>
                                                                                                    <b style={{ color: "#198754" }}>₹ {money(row.invoice_amount)}</b>
                                                                                                </div>
                                                                                                <div style={{ marginTop: 8, fontSize: 12 }}>
                                                                                                    <strong>Invoice Date:</strong> {displayDate(row.invoice_date)} {" | "}
                                                                                                    <strong>Type:</strong> {solarType(row)} {" | "}
                                                                                                    <strong>Voucher:</strong> {voucherType(row)}
                                                                                                </div>
                                                                                                {row.mobile && <div style={{ fontSize: 12, marginTop: 5 }}><strong>Mobile:</strong> {row.mobile}</div>}
                                                                                                {row.order_no && <div style={{ fontSize: 12, marginTop: 5 }}><strong>Order No:</strong> {row.order_no}</div>}
                                                                                                {row.reference && <div style={{ fontSize: 12, marginTop: 5 }}><strong>Reference:</strong> {row.reference}</div>}

                                                                                                {Array.isArray(row.items) && row.items.length > 0 && (
                                                                                                    <div style={{ overflowX: "auto", marginTop: 12 }}>
                                                                                                        <table style={{ width: "100%", minWidth: 850, borderCollapse: "collapse", fontSize: 11 }}>
                                                                                                            <thead>
                                                                                                                <tr>
                                                                                                                    {["#", "Item", "Qty", "Rate", "Discount", "GST %", "Tax", "Amount"].map(h => (
                                                                                                                        <th key={h} style={{ padding: 6, border: "1px solid #ccc", background: "#dceee4", color: "#05693a", fontWeight: 700, textAlign: h === "Item" ? "left" : "center" }}>{h}</th>
                                                                                                                    ))}
                                                                                                                </tr>
                                                                                                            </thead>
                                                                                                            <tbody>
                                                                                                                {row.items.map((item, itemIndex) => (
                                                                                                                    <tr key={`${inv(row)}-item-${itemIndex}`}>
                                                                                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>{itemIndex + 1}</td>
                                                                                                                        <td style={{ padding: 6, border: "1px solid #ddd" }}>
                                                                                                                            <b>{item.item_name || ""}</b>
                                                                                                                            {item.item_alias && <div style={{ color: "#777", fontSize: 10 }}>{item.item_alias}</div>}
                                                                                                                            {item.description && <div style={{ color: "#777", fontSize: 10 }}>{item.description}</div>}
                                                                                                                        </td>
                                                                                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>{item.quantity ?? 0}</td>
                                                                                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "right" }}>{money(item.rate || item.batch_rate)}</td>
                                                                                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "right" }}>{item.discount || item.batch_discount || 0}</td>
                                                                                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>{item.gst_rate || 0}%</td>
                                                                                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "right" }}>{money(item.tax_amount)}</td>
                                                                                                                        <td style={{ padding: 6, border: "1px solid #ddd", textAlign: "right", fontWeight: 700 }}>{money(item.amount)}</td>
                                                                                                                    </tr>
                                                                                                                ))}
                                                                                                            </tbody>
                                                                                                        </table>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                )}
                                                                            </React.Fragment>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                ) : (
                                    filtered.map((row, index) => renderInvoiceDetail(row, inv(row), index))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
