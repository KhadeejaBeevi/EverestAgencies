import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Banner from "../../Banner/Banner.jsx";
import "./OrderDelivery.css";
import {
    Attachments,
    PassToDeliveryModal,
    StatusBadge,
    formatAmount,
    formatDate,
    loadSalesmen,
    odApi,
    useCurrentUser
} from "./orderDeliveryShared.jsx";

/* =========================================================
   CUSTOMER PO
   POs received from customers. Each PO can be linked to its
   quotation number(s); invoices made in Tally against those
   quotations (or typed on the PO) are found automatically.
   Invoiced POs are passed to the Order To Delivery page.
========================================================= */

const emptyForm = {
    id: null,
    po_number: "",
    po_date: "",
    party_name: "",
    quotation_nos: "",
    invoice_nos: "",
    po_amount: "",
    remarks: ""
};

export default function CustomerPO() {
    const user = useCurrentUser();

    const [pos, setPos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [message, setMessage] = useState("");
    const [loadError, setLoadError] = useState("");

    const [form, setForm] = useState(null);
    const [keptFiles, setKeptFiles] = useState([]);
    const [newFiles, setNewFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");

    const [salesmen, setSalesmen] = useState([]);
    const [passGroup, setPassGroup] = useState(null);

    const loadPos = async () => {
        try {
            setLoading(true);
            setLoadError("");
            const result = await odApi("po_list");
            setPos(Array.isArray(result.data) ? result.data : []);
        } catch (error) {
            setLoadError(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPos();
    }, []);

    useEffect(() => {
        if (user.canAssign) loadSalesmen().then(setSalesmen).catch((error) => console.error(error));
    }, [user.canAssign]);

    const counts = useMemo(() => {
        const result = { all: pos.length };
        pos.forEach((po) => {
            result[po.status] = (result[po.status] || 0) + 1;
        });
        return result;
    }, [pos]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return pos.filter((po) => {
            if (statusFilter !== "all" && po.status !== statusFilter) return false;
            if (!term) return true;
            return [po.po_number, po.party_name, po.quotation_nos, po.invoice_nos, po.remarks, ...po.invoices.map((invoice) => invoice.no)]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term));
        });
    }, [pos, search, statusFilter]);

    const openForm = (po = null) => {
        setForm(
            po
                ? {
                    id: po.id,
                    po_number: po.po_number || "",
                    po_date: po.po_date || "",
                    party_name: po.party_name || "",
                    quotation_nos: po.quotation_nos || "",
                    invoice_nos: po.invoice_nos || "",
                    po_amount: po.po_amount ?? "",
                    remarks: po.remarks || ""
                }
                : { ...emptyForm }
        );
        setKeptFiles(po ? po.attachments : []);
        setNewFiles([]);
        setFormError("");
    };

    const updateField = (event) => {
        const { name, value } = event.target;
        setForm((previous) => ({ ...previous, [name]: value }));
    };

    const savePo = async (event) => {
        event.preventDefault();
        if (!form.po_number.trim()) return setFormError("Enter the PO number.");
        if (!form.party_name.trim()) return setFormError("Enter the party name.");

        try {
            setSaving(true);
            setFormError("");
            const result = await odApi("po_save", {
                form: {
                    ...form,
                    id: form.id || "",
                    user: user.name,
                    keep_attachments: keptFiles.map((file) => file.id),
                    attachments: newFiles
                }
            });
            setForm(null);
            setMessage(result.message);
            loadPos();
        } catch (error) {
            setFormError(error.message);
        } finally {
            setSaving(false);
        }
    };

    const deletePo = async (po) => {
        if (!window.confirm(`Delete PO ${po.po_number} of ${po.party_name}?`)) return;
        try {
            const result = await odApi("po_delete", { form: { id: po.id } });
            setMessage(result.message);
            loadPos();
        } catch (error) {
            alert(error.message);
        }
    };

    const openPass = (po) => {
        setPassGroup({
            party_name: po.party_name,
            po_id: po.id,
            po_number: po.po_number,
            quotation_nos: String(po.quotation_nos || "").split(",").map((value) => value.trim()).filter(Boolean),
            invoices: po.invoices.filter((invoice) => !invoice.passed_order_id)
        });
    };

    return (
        <>
            <Banner />

            <div className="od-page">
                <div className="od-header">
                    <div>
                        <h1>Customer PO</h1>
                        <p>Purchase orders received from customers. Invoiced POs go to <Link to="/ordertodelivery">Order To Delivery</Link>.</p>
                    </div>
                    <button className="od-btn od-btn-green" onClick={() => openForm()}>+ Add PO</button>
                </div>

                <div className="od-toolbar">
                    <input
                        className="od-search"
                        type="search"
                        placeholder="Search PO no, party, quotation, invoice..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className="od-chips">
                        {["all", "Waiting for Invoice", "Invoiced", "Passed to Delivery"].map((status) => (
                            <button
                                key={status}
                                className={`od-chip ${statusFilter === status ? "active" : ""}`}
                                onClick={() => setStatusFilter(status)}
                            >
                                {status === "all" ? "All" : status} ({counts[status] || 0})
                            </button>
                        ))}
                    </div>
                    <button className="od-btn od-btn-grey" onClick={loadPos}>⟳ Refresh</button>
                </div>

                {message && <div className="od-success" onClick={() => setMessage("")}>{message}</div>}
                {loadError && <div className="od-error">{loadError}</div>}

                <div className="od-table-wrap">
                    <table className="od-table">
                        <thead>
                            <tr>
                                <th>PO No.</th>
                                <th>PO Date</th>
                                <th>Party</th>
                                <th>Quotation No.</th>
                                <th className="od-num">PO Amount</th>
                                <th>Invoices (Tally)</th>
                                <th>Status</th>
                                <th>PO Copy</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan="9" className="od-empty">Loading...</td></tr>
                            )}
                            {!loading && filtered.length === 0 && (
                                <tr><td colSpan="9" className="od-empty">No POs found.</td></tr>
                            )}
                            {!loading && filtered.map((po) => {
                                const canPass = user.canAssign && po.invoices.some((invoice) => !invoice.passed_order_id);
                                const locked = po.delivery_orders.length > 0;

                                return (
                                    <tr key={po.id}>
                                        <td><b>{po.po_number}</b></td>
                                        <td className="od-nowrap">{formatDate(po.po_date)}</td>
                                        <td>
                                            <b>{po.party_name}</b>
                                            {po.remarks && <div className="od-muted od-small">{po.remarks}</div>}
                                        </td>
                                        <td>{po.quotation_nos || <span className="od-muted">-</span>}</td>
                                        <td className="od-num">{formatAmount(po.po_amount)}</td>
                                        <td>
                                            {po.invoices.length === 0 && <span className="od-muted">Not invoiced yet</span>}
                                            {po.invoices.map((invoice) => (
                                                <div key={invoice.no} className="od-small od-nowrap">
                                                    {invoice.passed_order_id ? "✅" : "🧾"} <b>{invoice.no}</b> · {formatDate(invoice.date)} · {formatAmount(invoice.amount)}
                                                </div>
                                            ))}
                                        </td>
                                        <td>
                                            <StatusBadge status={po.status} />
                                            {po.delivery_orders.map((order) => (
                                                <div key={order.id} className="od-small od-muted od-nowrap">
                                                    DO-{order.id}: {order.status} · {order.assigned_to}
                                                </div>
                                            ))}
                                        </td>
                                        <td><Attachments files={po.attachments} /></td>
                                        <td>
                                            <div className="od-actions">
                                                {canPass && (
                                                    <button className="od-btn od-btn-green od-btn-sm" onClick={() => openPass(po)}>
                                                        🚚 Pass to Delivery
                                                    </button>
                                                )}
                                                <button className="od-btn od-btn-blue od-btn-sm" onClick={() => openForm(po)}>Edit</button>
                                                {!locked && (
                                                    <button className="od-btn od-btn-red od-btn-sm" onClick={() => deletePo(po)}>Delete</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ================= ADD / EDIT PO ================= */}

            {form && (
                <div className="od-overlay" onMouseDown={(event) => event.target === event.currentTarget && setForm(null)}>
                    <form className="od-modal" onSubmit={savePo}>
                        <div className="od-modal-header">
                            <div>
                                <h2>{form.id ? "Edit PO" : "Add Customer PO"}</h2>
                                <p>Link the quotation so the Tally invoice is found automatically.</p>
                            </div>
                            <button type="button" className="od-close" onClick={() => setForm(null)} aria-label="Close">×</button>
                        </div>

                        <div className="od-modal-body">
                            <div className="od-form-row">
                                <div className="od-field">
                                    <label className="od-label">PO Number *</label>
                                    <input name="po_number" value={form.po_number} onChange={updateField} placeholder="Customer's PO number" />
                                </div>
                                <div className="od-field">
                                    <label className="od-label">PO Date</label>
                                    <input type="date" name="po_date" value={form.po_date} onChange={updateField} />
                                </div>
                            </div>

                            <div className="od-field">
                                <label className="od-label">Party Name *</label>
                                <input name="party_name" value={form.party_name} onChange={updateField} placeholder="Customer / party name" />
                            </div>

                            <div className="od-form-row">
                                <div className="od-field">
                                    <label className="od-label">Quotation No(s).</label>
                                    <input name="quotation_nos" value={form.quotation_nos} onChange={updateField} placeholder="e.g. SO/123/25-26, SO/130/25-26" />
                                    <small>Separate several with commas.</small>
                                </div>
                                <div className="od-field">
                                    <label className="od-label">PO Amount</label>
                                    <input type="number" step="0.01" min="0" name="po_amount" value={form.po_amount} onChange={updateField} />
                                </div>
                            </div>

                            <div className="od-field">
                                <label className="od-label">Invoice No(s). (optional)</label>
                                <input name="invoice_nos" value={form.invoice_nos} onChange={updateField} placeholder="Only if the invoice is not linked to the quotation in Tally" />
                            </div>

                            <div className="od-field">
                                <label className="od-label">Remarks</label>
                                <textarea rows="2" name="remarks" value={form.remarks} onChange={updateField} />
                            </div>

                            <div className="od-field">
                                <label className="od-label">PO Copy / Attachments</label>
                                <input type="file" multiple onChange={(event) => setNewFiles(Array.from(event.target.files || []))} />
                                {keptFiles.length > 0 && (
                                    <div className="od-files" style={{ marginTop: 6 }}>
                                        {keptFiles.map((file) => (
                                            <span key={file.id} className="od-file">
                                                📎 {file.original_name}
                                                <button type="button" className="od-file-remove" title="Remove" onClick={() => setKeptFiles((previous) => previous.filter((item) => item.id !== file.id))}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {formError && <div className="od-error">{formError}</div>}
                        </div>

                        <div className="od-modal-footer">
                            <button type="button" className="od-btn od-btn-grey" onClick={() => setForm(null)}>Cancel</button>
                            <button type="submit" className="od-btn od-btn-green" disabled={saving}>{saving ? "Saving..." : "Save PO"}</button>
                        </div>
                    </form>
                </div>
            )}

            {passGroup && (
                <PassToDeliveryModal
                    group={passGroup}
                    salesmen={salesmen}
                    userName={user.name}
                    onClose={() => setPassGroup(null)}
                    onPassed={(text) => {
                        setPassGroup(null);
                        setMessage(text);
                        loadPos();
                    }}
                />
            )}
        </>
    );
}
