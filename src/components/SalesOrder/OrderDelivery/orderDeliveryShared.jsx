import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { apiFetch } from "../../../api/apiClient";

/* =========================================================
   SHARED CODE FOR THE CUSTOMER PO AND ORDER TO DELIVERY PAGES
========================================================= */

export const API_URL = "/serverphp/order_delivery.php";

/* ---------------------------------------------------------
   PO / QUOTATION NUMBERS, ONE PER LINE
   Accepts an array or a comma / newline separated string.
   Drops empty and stray parts with no digit (e.g. "EV", "Ev")
   and repeats, so only real numbers are shown.
--------------------------------------------------------- */

export function splitRefs(value) {
    const parts = Array.isArray(value)
        ? value.flatMap((item) => String(item ?? "").split(/[,;\n]+/))
        : String(value ?? "").split(/[,;\n]+/);

    const seen = new Set();

    return parts
        .map((part) => part.trim())
        .filter((part) => part !== "" && /\d/.test(part))
        .filter((part) => {
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

/* Shows each number on its own line, with an optional label. */
export function RefLines({ label = "", value, bold = false }) {
    const refs = splitRefs(value);

    if (refs.length === 0) return null;

    return (
        <div className="od-ref-list">
            {label && <span className="od-ref-label">{label}</span>}
            {refs.map((ref) => (
                <div key={ref} className="od-ref">
                    {bold ? <b>{ref}</b> : ref}
                </div>
            ))}
        </div>
    );
}

/* Page Access permission that lets a user pass orders to delivery,
   assign / reassign salesmen and see every salesman's orders.
   Admins always have it. */
export const ASSIGN_PERMISSION = "Order To Delivery Assign";

/* GET with query params, or POST as FormData (files allowed). */
export async function odApi(action, { params = {}, form = null } = {}) {
    let response;

    if (form) {
        const body = new FormData();
        body.append("action", action);
        Object.entries(form).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            if (key === "attachments") {
                value.forEach((file) => body.append("attachments[]", file, file.name));
            } else if (typeof value === "object") {
                body.append(key, JSON.stringify(value));
            } else {
                body.append(key, String(value));
            }
        });
        response = await apiFetch(API_URL, { method: "POST", body });
    } else {
        const query = new URLSearchParams({ action, ...params }).toString();
        response = await apiFetch(`${API_URL}?${query}`, { method: "GET" });
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.message || "Request failed");
    }
    return result;
}

/* Logged-in user's full name (same as "added_by" elsewhere), whether
   they are admin, and whether they can pass / assign orders. */
export function useCurrentUser() {
    const [state, setState] = useState({ name: "", isAdmin: false, canAssign: false, loaded: false });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setState({ name: "", isAdmin: false, canAssign: false, loaded: true });
                return;
            }

            try {
                const [userSnap, roleSnap, permissionSnap] = await Promise.all([
                    getDoc(doc(db, "Users", user.uid)),
                    getDoc(doc(db, "roles", user.uid)),
                    getDoc(doc(db, "PagePermissions", user.uid))
                ]);

                const userData = userSnap.exists() ? userSnap.data() : {};
                const name =
                    `${String(userData.firstName || "").trim()} ${String(userData.lastName || "").trim()}`.trim() ||
                    user.email ||
                    "";

                const isAdmin =
                    (roleSnap.exists() && String(roleSnap.data().role || "").toLowerCase() === "admin") ||
                    String(userData.role || "").toLowerCase() === "admin";

                const canAssign =
                    isAdmin || (permissionSnap.exists() && permissionSnap.data()[ASSIGN_PERMISSION] === true);

                setState({ name, isAdmin, canAssign, loaded: true });
            } catch (error) {
                console.error("Order delivery user check error:", error);
                setState({ name: user.email || "", isAdmin: false, canAssign: false, loaded: true });
            }
        });

        return () => unsubscribe();
    }, []);

    return state;
}

/* Names of the app users, sales users first. */
export async function loadSalesmen() {
    const snapshot = await getDocs(collection(db, "Users"));
    const people = [];

    snapshot.forEach((userDoc) => {
        const data = userDoc.data() || {};
        const name = `${String(data.firstName || "").trim()} ${String(data.lastName || "").trim()}`.trim();
        if (name) people.push({ name, role: String(data.role || "").toLowerCase() });
    });

    const unique = [...new Map(people.map((person) => [person.name.toLowerCase(), person])).values()];

    return unique.sort((a, b) => {
        const salesA = a.role === "sales" ? 0 : 1;
        const salesB = b.role === "sales" ? 0 : 1;
        return salesA - salesB || a.name.localeCompare(b.name);
    });
}

export function formatDate(value) {
    if (!value) return "-";
    const date = new Date(String(value).replace(" ", "T"));
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatAmount(value) {
    if (value === null || value === undefined || value === "") return "-";
    return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatQty(value) {
    const number = Number(value || 0);
    return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(3)));
}

export function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function downloadFile(file) {
    const link = document.createElement("a");
    link.href =
        `${API_URL}?download=1&stored_name=${encodeURIComponent(file.stored_name || "")}` +
        `&filename=${encodeURIComponent(file.original_name || file.stored_name || "file")}`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export const STATUS_CLASS = {
    "Pending": "od-badge od-badge-red",
    "Partially Delivered": "od-badge od-badge-amber",
    "Delivered": "od-badge od-badge-green",
    "Waiting for Invoice": "od-badge od-badge-grey",
    "Invoiced": "od-badge od-badge-blue",
    "Passed to Delivery": "od-badge od-badge-green"
};

export function StatusBadge({ status }) {
    return <span className={STATUS_CLASS[status] || "od-badge od-badge-grey"}>{status || "-"}</span>;
}

export function Attachments({ files }) {
    if (!files || files.length === 0) return <span className="od-muted">-</span>;
    return (
        <div className="od-files">
            {files.map((file) => (
                <button type="button" key={file.id || file.stored_name} className="od-file" onClick={() => downloadFile(file)} title="Download">
                    📎 {file.original_name || "File"}
                </button>
            ))}
        </div>
    );
}

/* ---------------------------------------------------------
   ITEM LIST
   Items as a numbered table: # | Item | Qty | Unit.
   items = [{ name, qty, unit }]
--------------------------------------------------------- */

export function ItemList({ items }) {
    if (!items || items.length === 0) return null;

    return (
        <table className="od-item-list">
            <thead>
                <tr>
                    <th className="od-item-no">#</th>
                    <th>Item</th>
                    <th className="od-item-qty">Qty</th>
                    <th className="od-item-unit">Unit</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item, index) => (
                    <tr key={`${item.name}-${index}`}>
                        <td className="od-item-no">{index + 1}</td>
                        <td>{item.name}</td>
                        <td className="od-item-qty">{formatQty(item.qty)}</td>
                        <td className="od-item-unit">{item.unit || "-"}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function SalesmanSelect({ value, onChange, salesmen, placeholder = "Select salesman" }) {
    const known = salesmen.some((person) => person.name === value);
    return (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">{placeholder}</option>
            {value && !known && <option value={value}>{value}</option>}
            {salesmen.map((person) => (
                <option key={person.name} value={person.name}>
                    {person.name}{person.role === "sales" ? " (Sales)" : ""}
                </option>
            ))}
        </select>
    );
}

/* =========================================================
   PASS & ASSIGN POPUP
   group = { party_name, po_id, po_number, quotation_nos[],
             invoices: [{ no, date, amount, items? }] }
========================================================= */

export function PassToDeliveryModal({ group, salesmen, userName, onClose, onPassed }) {
    const [selected, setSelected] = useState(() => group.invoices.map((invoice) => invoice.no));
    const [assignedTo, setAssignedTo] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const toggle = (no) =>
        setSelected((previous) => (previous.includes(no) ? previous.filter((item) => item !== no) : [...previous, no]));

    const total = group.invoices
        .filter((invoice) => selected.includes(invoice.no))
        .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);

    const submit = async (event) => {
        event.preventDefault();
        if (selected.length === 0) return setError("Select at least one invoice.");
        if (!assignedTo) return setError("Select the salesman responsible for this delivery.");

        try {
            setSaving(true);
            setError("");
            const result = await odApi("pass", {
                form: {
                    invoice_nos: selected,
                    po_id: group.po_id || "",
                    assigned_to: assignedTo,
                    due_date: dueDate,
                    note,
                    user: userName
                }
            });
            onPassed(result.message);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="od-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <form className="od-modal" onSubmit={submit}>
                <div className="od-modal-header">
                    <div>
                        <h2>Pass to Order To Delivery</h2>
                        <p>{group.party_name}</p>
                    </div>
                    <button type="button" className="od-close" onClick={onClose} aria-label="Close">×</button>
                </div>

                <div className="od-modal-body">
                    <div className="od-info-grid">
                        {splitRefs(group.po_number).length > 0 && <div><span>PO No.</span><b><RefLines value={group.po_number} /></b></div>}
                        {splitRefs(group.quotation_nos).length > 0 && <div><span>Quotation No.</span><b><RefLines value={group.quotation_nos} /></b></div>}
                    </div>

                    <label className="od-label">Invoices to deliver</label>
                    <div className="od-invoice-pick">
                        {group.invoices.map((invoice) => (
                            <div key={invoice.no} className="od-check-block">
                                <label className="od-check-row">
                                    <input type="checkbox" checked={selected.includes(invoice.no)} onChange={() => toggle(invoice.no)} />
                                    <span><b>{invoice.no}</b> · {formatDate(invoice.date)}</span>
                                    <span className="od-right">{formatAmount(invoice.amount)}</span>
                                </label>
                                {invoice.items?.length > 0 && (
                                    <ItemList items={invoice.items.map((item) => ({ name: item.name, qty: item.qty, unit: item.unit }))} />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="od-total">Total: {formatAmount(total)}</div>

                    <div className="od-form-row">
                        <div className="od-field">
                            <label className="od-label">Responsible salesman *</label>
                            <SalesmanSelect value={assignedTo} onChange={setAssignedTo} salesmen={salesmen} />
                        </div>
                        <div className="od-field">
                            <label className="od-label">Deliver by (optional)</label>
                            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                        </div>
                    </div>

                    <div className="od-field">
                        <label className="od-label">Note for the salesman</label>
                        <textarea rows="2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Site address, contact person, timing..." />
                    </div>

                    {error && <div className="od-error">{error}</div>}
                </div>

                <div className="od-modal-footer">
                    <button type="button" className="od-btn od-btn-grey" onClick={onClose}>Cancel</button>
                    <button type="submit" className="od-btn od-btn-green" disabled={saving}>
                        {saving ? "Passing..." : "Pass & Assign"}
                    </button>
                </div>
            </form>
        </div>
    );
}
