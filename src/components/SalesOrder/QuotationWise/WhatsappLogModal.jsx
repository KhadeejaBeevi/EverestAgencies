import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
    formatAmount,
    formatDateTime,
    normalizeDate,
    todayLocal
} from "./quotationUtils.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #ccc", borderRadius: "5px", fontSize: "14px", outline: "none", background: "#fff" };

// Every WhatsApp chat opened from the Quotation Wise page: number, time and
// who sent it, with search, sender/date filters and Excel export.
const WhatsappLogModal = ({ log, loading, initialSearch = "", screenWidth, onReload, onClose }) => {
    const whatsappLog = log;
    const whatsappLogLoading = loading;
    const fetchWhatsappLog = onReload;

    const [whatsappLogSearch, setWhatsappLogSearch] = useState(initialSearch);
    const [whatsappLogSentBy, setWhatsappLogSentBy] = useState("all");
    const [whatsappLogFrom, setWhatsappLogFrom] = useState("");
    const [whatsappLogTo, setWhatsappLogTo] = useState("");
    const [expandedWhatsappLogId, setExpandedWhatsappLogId] = useState(null);

    const search = whatsappLogSearch.trim().toLowerCase();
    const searchDigits = search.replace(/\D/g, "");

    const rows = whatsappLog.filter((item) => {
        if (whatsappLogSentBy !== "all" && item.sent_by !== whatsappLogSentBy) return false;

        const day = normalizeDate(String(item.created_at || "").replace(" ", "T"));
        if (whatsappLogFrom && day < whatsappLogFrom) return false;
        if (whatsappLogTo && day > whatsappLogTo) return false;

        if (!search) return true;
        const text = [
            item.quotation_no, item.order_no, item.party_name, item.customer_name,
            item.mobile, item.sent_by, item.sent_by_email, item.template_name, item.message
        ].join(" ").toLowerCase();
        if (text.includes(search)) return true;
        return searchDigits.length >= 4 &&
            String(item.mobile || "").replace(/\D/g, "").includes(searchDigits);
    });

    const senders = [...new Set(whatsappLog.map((item) => item.sent_by).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    const countBySender = {};
    rows.forEach((item) => {
        countBySender[item.sent_by] = (countBySender[item.sent_by] || 0) + 1;
    });
    const uniqueNumbers = new Set(rows.map((item) => item.mobile)).size;

    const exportLog = () => {
        if (!rows.length) {
            window.alert("No WhatsApp log to export.");
            return;
        }
        const sheet = XLSX.utils.json_to_sheet(rows.map((item, index) => ({
            "S.No": index + 1,
            "Date & Time": formatDateTime(item.created_at),
            "Sent By": item.sent_by || "",
            "Sent By Email": item.sent_by_email || "",
            "Mobile": item.mobile || "",
            "Customer Name": item.customer_name || "",
            "Party Name": item.party_name || "",
            "Quotation No": item.quotation_no || "",
            "Order No": item.order_no || "",
            "Quotation Amount": Number(item.quotation_amount || 0),
            "Type": item.send_type === "direct" ? "Direct chat" : "Template",
            "Template": item.template_name || "",
            "PDF Downloaded": Number(item.pdf_attached) ? "Yes" : "No",
            "Message": item.message || ""
        })));
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "WhatsApp Log");
        XLSX.writeFile(book, "WhatsApp_Send_Log.xlsx");
    };

    const cell = { padding: "7px 8px", borderBottom: "1px solid #eee", verticalAlign: "top" };
    const head = { ...cell, background: "#075e54", color: "#fff", fontWeight: "700", position: "sticky", top: 0, whiteSpace: "nowrap", textAlign: "left" };

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100002, padding: "20px" }}>
            <div style={{ width: "100%", maxWidth: "1300px", maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "12px", boxShadow: "0 10px 40px rgba(0,0,0,0.3)", overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", background: "#075e54", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontSize: "18px", fontWeight: "800" }}>📋 WhatsApp Send Log</div>
                        <div style={{ fontSize: "11px", opacity: 0.9, marginTop: "3px" }}>
                            Every WhatsApp chat opened from this page — number, time and who sent it.
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: "#fff", fontSize: "24px", cursor: "pointer" }}>×</button>
                </div>

                <div style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    <input
                        type="text"
                        value={whatsappLogSearch}
                        onChange={(e) => setWhatsappLogSearch(e.target.value)}
                        placeholder="Search number / party / quotation / message..."
                        style={{ ...inputStyle, width: screenWidth < 700 ? "100%" : "300px", height: "34px" }}
                    />
                    <select value={whatsappLogSentBy} onChange={(e) => setWhatsappLogSentBy(e.target.value)} style={{ ...inputStyle, width: "auto", height: "34px" }}>
                        <option value="all">All Senders</option>
                        {senders.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <label style={{ fontSize: "12px", fontWeight: "700" }}>From</label>
                    <input type="date" value={whatsappLogFrom} onChange={(e) => setWhatsappLogFrom(e.target.value)} style={{ ...inputStyle, width: "auto", height: "34px" }} />
                    <label style={{ fontSize: "12px", fontWeight: "700" }}>To</label>
                    <input type="date" value={whatsappLogTo} onChange={(e) => setWhatsappLogTo(e.target.value)} style={{ ...inputStyle, width: "auto", height: "34px" }} />
                    <button
                        type="button"
                        onClick={() => {
                            const today = todayLocal();
                            setWhatsappLogFrom(today);
                            setWhatsappLogTo(today);
                        }}
                        style={{ height: "34px", padding: "0 10px", border: "1px solid #ccc", background: "#f8f9fa", borderRadius: "5px", cursor: "pointer", fontWeight: "600", fontSize: "12px" }}
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        onClick={() => { setWhatsappLogSearch(""); setWhatsappLogSentBy("all"); setWhatsappLogFrom(""); setWhatsappLogTo(""); }}
                        style={{ height: "34px", padding: "0 10px", border: "1px solid #ccc", background: "#f8f9fa", borderRadius: "5px", cursor: "pointer", fontWeight: "600", fontSize: "12px" }}
                    >
                        Clear
                    </button>
                    <button
                        type="button"
                        onClick={fetchWhatsappLog}
                        style={{ height: "34px", padding: "0 10px", border: "1px solid #05693a", background: "#fff", color: "#05693a", borderRadius: "5px", cursor: "pointer", fontWeight: "700", fontSize: "12px" }}
                    >
                        {whatsappLogLoading ? "Loading..." : "Reload"}
                    </button>
                    <button
                        type="button"
                        onClick={exportLog}
                        style={{ height: "34px", padding: "0 10px", border: "none", background: "#05693a", color: "#fff", borderRadius: "5px", cursor: "pointer", fontWeight: "700", fontSize: "12px" }}
                    >
                        Export Excel
                    </button>
                </div>

                <div style={{ padding: "8px 20px", display: "flex", flexWrap: "wrap", gap: "8px", borderBottom: "1px solid #eee", fontSize: "12px", fontWeight: "700" }}>
                    <span style={{ padding: "4px 9px", borderRadius: "5px", background: "#eef3f0", color: "#05693a" }}>Messages: {rows.length}</span>
                    <span style={{ padding: "4px 9px", borderRadius: "5px", background: "#f1f8ff", color: "#1c4e80" }}>Unique Numbers: {uniqueNumbers}</span>
                    {Object.entries(countBySender)
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, count]) => (
                            <span key={name} style={{ padding: "4px 9px", borderRadius: "5px", background: "#f5f5f5", color: "#333" }}>
                                {name}: {count}
                            </span>
                        ))}
                </div>

                <div style={{ flex: 1, overflow: "auto" }}>
                    {rows.length === 0 ? (
                        <div style={{ padding: "40px", textAlign: "center", color: "#777" }}>
                            {whatsappLogLoading ? "Loading WhatsApp log..." : "No WhatsApp messages found."}
                        </div>
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                            <thead>
                                <tr>
                                    <th style={head}>#</th>
                                    <th style={head}>Date & Time</th>
                                    <th style={head}>Sent By</th>
                                    <th style={head}>Mobile</th>
                                    <th style={head}>Customer / Party</th>
                                    <th style={head}>Quotation</th>
                                    <th style={{ ...head, textAlign: "right" }}>Amount</th>
                                    <th style={head}>Type / Template</th>
                                    <th style={head}>PDF</th>
                                    <th style={head}>Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((item, index) => {
                                    const isOpen = expandedWhatsappLogId === item.id;
                                    return (
                                        <tr key={item.id} style={{ background: index % 2 ? "#fafafa" : "#fff" }}>
                                            <td style={cell}>{index + 1}</td>
                                            <td style={{ ...cell, whiteSpace: "nowrap", fontWeight: "700" }}>
                                                {formatDateTime(item.created_at)}
                                                {item.pending && <div style={{ color: "#8a5a00", fontSize: "10px" }}>Saving...</div>}
                                                {item.failed && <div style={{ color: "#dc3545", fontSize: "10px" }}>Not saved</div>}
                                            </td>
                                            <td style={cell}>
                                                <div style={{ fontWeight: "700" }}>{item.sent_by}</div>
                                                {item.sent_by_email && <div style={{ color: "#777", fontSize: "10px" }}>{item.sent_by_email}</div>}
                                            </td>
                                            <td style={{ ...cell, whiteSpace: "nowrap", fontWeight: "700" }}>{item.mobile}</td>
                                            <td style={cell}>
                                                <div style={{ fontWeight: "700" }}>{item.customer_name}</div>
                                                {item.party_name && item.party_name !== item.customer_name && (
                                                    <div style={{ color: "#666", fontSize: "11px" }}>{item.party_name}</div>
                                                )}
                                            </td>
                                            <td style={cell}>
                                                <div style={{ fontWeight: "700" }}>{item.quotation_no}</div>
                                                {item.order_no && <div style={{ color: "#666", fontSize: "11px" }}>Order: {item.order_no}</div>}
                                            </td>
                                            <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                                                {item.quotation_amount ? `₹ ${formatAmount(item.quotation_amount)}` : ""}
                                            </td>
                                            <td style={cell}>
                                                {item.send_type === "direct" ? (
                                                    <span style={{ color: "#666" }}>Direct chat (no message)</span>
                                                ) : (
                                                    <span style={{ fontWeight: "700", color: "#075e54" }}>{item.template_name || "Template"}</span>
                                                )}
                                            </td>
                                            <td style={{ ...cell, whiteSpace: "nowrap" }}>
                                                {Number(item.pdf_attached) ? "📄 Yes" : "—"}
                                            </td>
                                            <td style={{ ...cell, minWidth: "220px" }}>
                                                {item.message ? (
                                                    <>
                                                        <div style={{ whiteSpace: "pre-wrap", color: "#333", maxHeight: isOpen ? "none" : "36px", overflow: "hidden" }}>
                                                            {item.message}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedWhatsappLogId(isOpen ? null : item.id)}
                                                            style={{ border: "none", background: "transparent", color: "#05693a", cursor: "pointer", padding: "2px 0", fontSize: "11px", fontWeight: "700" }}
                                                        >
                                                            {isOpen ? "Show less ▲" : "Show full message ▼"}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span style={{ color: "#999" }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div style={{ padding: "8px 20px", borderTop: "1px solid #eee", background: "#fffdf2", fontSize: "11px", color: "#5d5120" }}>
                    Note: WhatsApp does not report back to this page, so each entry means the chat was opened with the message pre-filled at that time. It cannot confirm that Send was pressed in the app.
                </div>
            </div>
        </div>
    );
};

export default WhatsappLogModal;
