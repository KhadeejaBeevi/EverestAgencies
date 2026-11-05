import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Banner from "../../Banner/Banner.jsx";
import "./OrderDelivery.css";
import {
    Attachments,
    PassToDeliveryModal,
    SalesmanSelect,
    StatusBadge,
    formatAmount,
    formatDate,
    formatQty,
    loadSalesmen,
    odApi,
    todayKey,
    useCurrentUser
} from "./orderDeliveryShared.jsx";

/* =========================================================
   ORDER TO DELIVERY

   Ready to Pass   : invoiced POs / quotations from Tally that are
                     not yet passed. Passing assigns a salesman.
   Delivery Orders : the salesman records each delivery (partial or
                     full) until every invoiced item is delivered.

   Users with the "Order To Delivery Assign" page access (and
   admins) see every order and can pass / reassign. Everyone else
   sees only the orders assigned to them.
========================================================= */

const SOURCE_LABEL = { po: "PO", quotation: "Quotation", invoice: "Direct Invoice" };

const STATUS_FILTERS = [
    { value: "open", label: "Open" },
    { value: "Pending", label: "Pending" },
    { value: "Partially Delivered", label: "Partially Delivered" },
    { value: "Delivered", label: "Delivered" },
    { value: "all", label: "All" }
];

function progressOf(order) {
    const ordered = Number(order.ordered_total || 0);
    if (ordered <= 0) return order.status === "Delivered" ? 100 : order.status === "Partially Delivered" ? 50 : 0;
    return Math.min(100, Math.round((Number(order.delivered_total || 0) / ordered) * 100));
}

export default function OrderToDelivery() {
    const user = useCurrentUser();

    const [tab, setTab] = useState("orders");
    const [message, setMessage] = useState("");
    const [salesmen, setSalesmen] = useState([]);

    /* Ready to pass */
    const [ready, setReady] = useState([]);
    const [readyDays, setReadyDays] = useState("60");
    const [readyLoading, setReadyLoading] = useState(false);
    const [readyError, setReadyError] = useState("");
    const [readySearch, setReadySearch] = useState("");
    const [passGroup, setPassGroup] = useState(null);

    /* Orders */
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersError, setOrdersError] = useState("");
    const [statusFilter, setStatusFilter] = useState("open");
    const [salesmanFilter, setSalesmanFilter] = useState("");
    const [orderSearch, setOrderSearch] = useState("");
    const [openOrderId, setOpenOrderId] = useState(null);

    const loadOrders = async () => {
        if (!user.loaded) return;
        try {
            setOrdersLoading(true);
            setOrdersError("");
            const result = await odApi("orders", { params: user.canAssign ? {} : { user: user.name } });
            setOrders(Array.isArray(result.data) ? result.data : []);
        } catch (error) {
            setOrdersError(error.message);
        } finally {
            setOrdersLoading(false);
        }
    };

    const loadReady = async () => {
        if (!user.canAssign) return;
        try {
            setReadyLoading(true);
            setReadyError("");
            const result = await odApi("ready", { params: { days: readyDays } });
            setReady(Array.isArray(result.data) ? result.data : []);
        } catch (error) {
            setReadyError(error.message);
        } finally {
            setReadyLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
    }, [user.loaded, user.canAssign, user.name]);

    useEffect(() => {
        loadReady();
    }, [user.canAssign, readyDays]);

    useEffect(() => {
        if (user.canAssign) loadSalesmen().then(setSalesmen).catch((error) => console.error(error));
    }, [user.canAssign]);

    const filteredReady = useMemo(() => {
        const term = readySearch.trim().toLowerCase();
        if (!term) return ready;
        return ready.filter((group) =>
            [group.party_name, group.po_number, ...group.quotation_nos, ...group.invoices.map((invoice) => invoice.no)]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term))
        );
    }, [ready, readySearch]);

    const orderCounts = useMemo(() => {
        const counts = { open: 0, all: orders.length };
        orders.forEach((order) => {
            counts[order.status] = (counts[order.status] || 0) + 1;
            if (order.status !== "Delivered") counts.open++;
        });
        return counts;
    }, [orders]);

    const salesmanOptions = useMemo(
        () => [...new Set(orders.map((order) => order.assigned_to).filter(Boolean))].sort(),
        [orders]
    );

    const filteredOrders = useMemo(() => {
        const term = orderSearch.trim().toLowerCase();
        return orders.filter((order) => {
            if (statusFilter === "open" && order.status === "Delivered") return false;
            if (statusFilter !== "open" && statusFilter !== "all" && order.status !== statusFilter) return false;
            if (salesmanFilter && order.assigned_to !== salesmanFilter) return false;
            if (!term) return true;
            return [`DO-${order.id}`, order.party_name, order.po_number, order.quotation_nos, order.invoice_nos, order.assigned_to]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term));
        });
    }, [orders, statusFilter, salesmanFilter, orderSearch]);

    const today = todayKey();

    return (
        <>
            <Banner />

            <div className="od-page">
                <div className="od-header">
                    <div>
                        <h1>Order To Delivery</h1>
                        <p>
                            {user.canAssign
                                ? "Pass invoiced orders to a salesman and track delivery until completed."
                                : "Orders assigned to you. Record every delivery until the order is completed."}
                        </p>
                    </div>
                    <Link to="/customerpo" className="od-btn od-btn-blue">Customer PO</Link>
                </div>

                {user.canAssign && (
                    <div className="od-tabs">
                        <button className={tab === "ready" ? "active" : ""} onClick={() => setTab("ready")}>
                            Ready to Pass ({ready.length})
                        </button>
                        <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
                            Delivery Orders ({orderCounts.open} open)
                        </button>
                    </div>
                )}

                {message && <div className="od-success" onClick={() => setMessage("")}>{message}</div>}

                {/* ================= READY TO PASS ================= */}

                {user.canAssign && tab === "ready" && (
                    <>
                        <div className="od-toolbar">
                            <input
                                className="od-search"
                                type="search"
                                placeholder="Search party, PO, quotation, invoice..."
                                value={readySearch}
                                onChange={(event) => setReadySearch(event.target.value)}
                            />
                            <label className="od-inline">
                                Invoices from last
                                <select value={readyDays} onChange={(event) => setReadyDays(event.target.value)}>
                                    {["7", "30", "60", "90", "180", "365"].map((days) => (
                                        <option key={days} value={days}>{days} days</option>
                                    ))}
                                </select>
                            </label>
                            <button className="od-btn od-btn-grey" onClick={loadReady}>⟳ Refresh</button>
                        </div>

                        {readyError && <div className="od-error">{readyError}</div>}

                        <div className="od-table-wrap">
                            <table className="od-table">
                                <thead>
                                    <tr>
                                        <th>Source</th>
                                        <th>Party</th>
                                        <th>PO / Quotation</th>
                                        <th>Invoices</th>
                                        <th className="od-num">Items</th>
                                        <th className="od-num">Invoice Value</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {readyLoading && <tr><td colSpan="7" className="od-empty">Loading invoices from Tally...</td></tr>}
                                    {!readyLoading && filteredReady.length === 0 && (
                                        <tr><td colSpan="7" className="od-empty">Nothing waiting. All invoices in this period are passed.</td></tr>
                                    )}
                                    {!readyLoading && filteredReady.map((group) => (
                                        <tr key={group.key}>
                                            <td><span className={`od-source od-source-${group.source_type}`}>{SOURCE_LABEL[group.source_type]}</span></td>
                                            <td><b>{group.party_name}</b></td>
                                            <td className="od-small">
                                                {group.po_number && <div>PO: <b>{group.po_number}</b></div>}
                                                {group.quotation_nos.length > 0 && <div>Qtn: {group.quotation_nos.join(", ")}</div>}
                                                {!group.po_number && group.quotation_nos.length === 0 && <span className="od-muted">-</span>}
                                            </td>
                                            <td className="od-small">
                                                {group.invoices.map((invoice) => (
                                                    <div key={invoice.no} className="od-nowrap">
                                                        <b>{invoice.no}</b> · {formatDate(invoice.date)}
                                                    </div>
                                                ))}
                                            </td>
                                            <td className="od-num">{group.item_count}</td>
                                            <td className="od-num">{formatAmount(group.amount)}</td>
                                            <td>
                                                <button className="od-btn od-btn-green od-btn-sm" onClick={() => setPassGroup(group)}>
                                                    🚚 Pass & Assign
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* ================= DELIVERY ORDERS ================= */}

                {(!user.canAssign || tab === "orders") && (
                    <>
                        <div className="od-toolbar">
                            <input
                                className="od-search"
                                type="search"
                                placeholder="Search DO no, party, PO, quotation, invoice..."
                                value={orderSearch}
                                onChange={(event) => setOrderSearch(event.target.value)}
                            />
                            <div className="od-chips">
                                {STATUS_FILTERS.map((filter) => (
                                    <button
                                        key={filter.value}
                                        className={`od-chip ${statusFilter === filter.value ? "active" : ""}`}
                                        onClick={() => setStatusFilter(filter.value)}
                                    >
                                        {filter.label} ({orderCounts[filter.value] || 0})
                                    </button>
                                ))}
                            </div>
                            {user.canAssign && (
                                <select value={salesmanFilter} onChange={(event) => setSalesmanFilter(event.target.value)}>
                                    <option value="">All salesmen</option>
                                    {salesmanOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                                </select>
                            )}
                            <button className="od-btn od-btn-grey" onClick={loadOrders}>⟳ Refresh</button>
                        </div>

                        {ordersError && <div className="od-error">{ordersError}</div>}

                        <div className="od-table-wrap">
                            <table className="od-table od-table-click">
                                <thead>
                                    <tr>
                                        <th>DO No.</th>
                                        <th>Party</th>
                                        <th>PO / Quotation</th>
                                        <th>Invoices</th>
                                        <th>Salesman</th>
                                        <th>Deliver By</th>
                                        <th>Progress</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(ordersLoading || !user.loaded) && <tr><td colSpan="8" className="od-empty">Loading...</td></tr>}
                                    {!ordersLoading && user.loaded && filteredOrders.length === 0 && (
                                        <tr><td colSpan="8" className="od-empty">No delivery orders.</td></tr>
                                    )}
                                    {!ordersLoading && filteredOrders.map((order) => {
                                        const overdue = order.due_date && order.status !== "Delivered" && order.due_date < today;
                                        const progress = progressOf(order);

                                        return (
                                            <tr key={order.id} onClick={() => setOpenOrderId(order.id)} title="Open to record delivery">
                                                <td className="od-nowrap"><b>DO-{order.id}</b><div className="od-small od-muted">{formatDate(order.assigned_at)}</div></td>
                                                <td><b>{order.party_name}</b></td>
                                                <td className="od-small">
                                                    <span className={`od-source od-source-${order.source_type}`}>{SOURCE_LABEL[order.source_type]}</span>
                                                    {order.po_number && <div>PO: <b>{order.po_number}</b></div>}
                                                    {order.quotation_nos && <div>Qtn: {order.quotation_nos}</div>}
                                                </td>
                                                <td className="od-small">
                                                    {order.invoice_nos}
                                                    <div className="od-muted">{formatAmount(order.invoice_amount)}</div>
                                                </td>
                                                <td>{order.assigned_to || "-"}</td>
                                                <td className={`od-nowrap ${overdue ? "od-overdue" : ""}`}>
                                                    {order.due_date ? formatDate(order.due_date) : "-"}
                                                    {overdue && <div className="od-small">Overdue</div>}
                                                </td>
                                                <td style={{ minWidth: 120 }}>
                                                    <div className="od-progress"><div style={{ width: `${progress}%` }} /></div>
                                                    <div className="od-small od-muted">
                                                        {Number(order.item_count) > 0
                                                            ? `${formatQty(order.delivered_total)} / ${formatQty(order.ordered_total)} qty`
                                                            : `${order.delivery_count} deliveries`}
                                                    </div>
                                                </td>
                                                <td><StatusBadge status={order.status} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {passGroup && (
                <PassToDeliveryModal
                    group={passGroup}
                    salesmen={salesmen}
                    userName={user.name}
                    onClose={() => setPassGroup(null)}
                    onPassed={(text) => {
                        setPassGroup(null);
                        setMessage(text);
                        loadReady();
                        loadOrders();
                    }}
                />
            )}

            {openOrderId && (
                <OrderDetailModal
                    orderId={openOrderId}
                    user={user}
                    salesmen={salesmen}
                    onClose={() => setOpenOrderId(null)}
                    onChanged={(text, closeModal) => {
                        if (text) setMessage(text);
                        if (closeModal) setOpenOrderId(null);
                        loadOrders();
                        if (closeModal) loadReady();
                    }}
                />
            )}
        </>
    );
}

/* =========================================================
   ORDER DETAIL: items, record delivery, history
========================================================= */

function OrderDetailModal({ orderId, user, salesmen, onClose, onChanged }) {
    const [order, setOrder] = useState(null);
    const [loadError, setLoadError] = useState("");

    const [quantities, setQuantities] = useState({});
    const [deliveryDate, setDeliveryDate] = useState(todayKey());
    const [deliveryType, setDeliveryType] = useState("Partial");
    const [note, setNote] = useState("");
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [reassignTo, setReassignTo] = useState("");
    const [reassignDue, setReassignDue] = useState("");

    const load = async () => {
        try {
            setLoadError("");
            const result = await odApi("order_detail", { params: { id: orderId } });
            setOrder(result.data);
            setQuantities({});
            setReassignTo(result.data.assigned_to || "");
            setReassignDue(result.data.due_date || "");
        } catch (err) {
            setLoadError(err.message);
        }
    };

    useEffect(() => {
        load();
    }, [orderId]);

    if (!order) {
        return (
            <div className="od-overlay">
                <div className="od-modal">
                    <div className="od-modal-body">{loadError ? <div className="od-error">{loadError}</div> : "Loading..."}</div>
                    <div className="od-modal-footer"><button className="od-btn od-btn-grey" onClick={onClose}>Close</button></div>
                </div>
            </div>
        );
    }

    const isMine = String(order.assigned_to || "").trim().toLowerCase() === String(user.name || "").trim().toLowerCase();
    const canDeliver = (isMine || user.canAssign) && order.status !== "Delivered";
    const hasItems = order.items.length > 0;

    const balanceOf = (item) => Math.max(0, Number(item.ordered_qty) - Number(item.delivered_qty));

    const fillAll = () => {
        const next = {};
        order.items.forEach((item) => {
            const balance = balanceOf(item);
            if (balance > 0) next[item.id] = formatQty(balance);
        });
        setQuantities(next);
    };

    const saveDelivery = async (event) => {
        event.preventDefault();

        const items = order.items
            .map((item) => ({ item_id: item.id, qty: Number(quantities[item.id] || 0) }))
            .filter((line) => line.qty > 0);

        if (hasItems && items.length === 0) return setError("Enter the quantity delivered now for at least one item.");

        try {
            setSaving(true);
            setError("");
            const result = await odApi("deliver", {
                form: {
                    order_id: order.id,
                    delivery_date: deliveryDate,
                    delivery_type: deliveryType,
                    items,
                    note,
                    user: user.name,
                    attachments: files
                }
            });
            setNote("");
            setFiles([]);
            onChanged(result.message, false);
            load();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const deleteEntry = async (entry) => {
        if (!window.confirm("Remove this delivery entry? The quantities go back to balance.")) return;
        try {
            const result = await odApi("delete_delivery", { form: { entry_id: entry.id } });
            onChanged(result.message, false);
            load();
        } catch (err) {
            alert(err.message);
        }
    };

    const reassign = async () => {
        if (!reassignTo) return alert("Select the salesman.");
        try {
            const result = await odApi("reassign", {
                form: { order_id: order.id, assigned_to: reassignTo, due_date: reassignDue, user: user.name }
            });
            onChanged(result.message, false);
            load();
        } catch (err) {
            alert(err.message);
        }
    };

    const removeOrder = async () => {
        if (!window.confirm(`Remove DO-${order.id}? Its invoices go back to Ready to Pass.`)) return;
        try {
            const result = await odApi("remove_order", { form: { order_id: order.id } });
            onChanged(result.message, true);
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="od-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div className="od-modal od-modal-wide">
                <div className="od-modal-header">
                    <div>
                        <h2>DO-{order.id} · {order.party_name}</h2>
                        <p><StatusBadge status={order.status} /> {order.completed_at && `Completed ${formatDate(order.completed_at)}`}</p>
                    </div>
                    <button type="button" className="od-close" onClick={onClose} aria-label="Close">×</button>
                </div>

                <div className="od-modal-body">
                    <div className="od-info-grid">
                        <div><span>Salesman</span><b>{order.assigned_to || "-"}</b></div>
                        <div><span>Assigned</span><b>{formatDate(order.assigned_at)}{order.assigned_by ? ` by ${order.assigned_by}` : ""}</b></div>
                        <div><span>Deliver by</span><b>{order.due_date ? formatDate(order.due_date) : "-"}</b></div>
                        {order.po_number && <div><span>PO No.</span><b>{order.po_number}</b></div>}
                        {order.quotation_nos && <div><span>Quotation No.</span><b>{order.quotation_nos}</b></div>}
                        <div>
                            <span>Invoices</span>
                            <b>{order.invoices.map((invoice) => `${invoice.invoice_no} (${formatDate(invoice.invoice_date)})`).join(", ")}</b>
                        </div>
                        <div><span>Invoice value</span><b>{formatAmount(order.invoice_amount)}</b></div>
                    </div>

                    {order.pass_note && <div className="od-note">📝 {order.pass_note}</div>}

                    {/* ITEMS + RECORD DELIVERY */}
                    <form onSubmit={saveDelivery}>
                        {hasItems ? (
                            <div className="od-table-wrap">
                                <table className="od-table">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th className="od-num">Invoiced</th>
                                            <th className="od-num">Delivered</th>
                                            <th className="od-num">Balance</th>
                                            {canDeliver && <th className="od-num">Deliver now</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {order.items.map((item) => {
                                            const balance = balanceOf(item);
                                            return (
                                                <tr key={item.id} className={balance <= 0 ? "od-row-done" : ""}>
                                                    <td>{item.item_name}</td>
                                                    <td className="od-num od-nowrap">{formatQty(item.ordered_qty)} {item.unit}</td>
                                                    <td className="od-num od-nowrap">{formatQty(item.delivered_qty)}</td>
                                                    <td className="od-num od-nowrap"><b>{balance <= 0 ? "✓" : formatQty(balance)}</b></td>
                                                    {canDeliver && (
                                                        <td className="od-num">
                                                            {balance > 0 && (
                                                                <input
                                                                    className="od-qty"
                                                                    type="number"
                                                                    min="0"
                                                                    max={balance}
                                                                    step="any"
                                                                    value={quantities[item.id] ?? ""}
                                                                    onChange={(event) => setQuantities((previous) => ({ ...previous, [item.id]: event.target.value }))}
                                                                />
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="od-note">This invoice has no stock items. Record the delivery as partial or full.</div>
                        )}

                        {canDeliver && (
                            <div className="od-deliver-box">
                                <div className="od-deliver-title">
                                    Record a delivery
                                    {hasItems && <button type="button" className="od-btn od-btn-blue od-btn-sm" onClick={fillAll}>Deliver full balance</button>}
                                </div>

                                <div className="od-form-row">
                                    <div className="od-field">
                                        <label className="od-label">Delivery date</label>
                                        <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
                                    </div>
                                    {!hasItems && (
                                        <div className="od-field">
                                            <label className="od-label">Delivery</label>
                                            <select value={deliveryType} onChange={(event) => setDeliveryType(event.target.value)}>
                                                <option value="Partial">Partial delivery</option>
                                                <option value="Full">Full delivery (completed)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>

                                <div className="od-field">
                                    <label className="od-label">Note</label>
                                    <textarea rows="2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Vehicle, received by, balance reason..." />
                                </div>

                                <div className="od-field">
                                    <label className="od-label">Proof (signed DC, photo...)</label>
                                    <input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
                                </div>

                                {error && <div className="od-error">{error}</div>}

                                <div style={{ textAlign: "right" }}>
                                    <button type="submit" className="od-btn od-btn-green" disabled={saving}>
                                        {saving ? "Saving..." : "Save Delivery"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </form>

                    {/* HISTORY */}
                    <h3 className="od-section-title">Delivery history ({order.entries.length})</h3>
                    {order.entries.length === 0 && <div className="od-muted">No delivery recorded yet.</div>}
                    {order.entries.map((entry) => (
                        <div key={entry.id} className="od-entry">
                            <div className="od-entry-head">
                                <b>{formatDate(entry.delivery_date)}</b>
                                <span className="od-muted"> · by {entry.delivered_by || "-"}</span>
                                {entry.items.length === 0 && <span className={`od-badge ${entry.delivery_type === "Full" ? "od-badge-green" : "od-badge-amber"}`}>{entry.delivery_type}</span>}
                                {(user.canAssign || String(entry.delivered_by || "").toLowerCase() === String(user.name || "").toLowerCase()) && (
                                    <button className="od-link-btn" onClick={() => deleteEntry(entry)}>Remove</button>
                                )}
                            </div>
                            {entry.items.length > 0 && (
                                <div className="od-small">
                                    {entry.items.map((line) => `${line.item_name}: ${formatQty(line.qty)} ${line.unit || ""}`.trim()).join(" · ")}
                                </div>
                            )}
                            {entry.note && <div className="od-small">{entry.note}</div>}
                            {entry.attachments.length > 0 && <Attachments files={entry.attachments} />}
                        </div>
                    ))}

                    {/* ASSIGNER TOOLS */}
                    {user.canAssign && (
                        <div className="od-admin-box">
                            <h3 className="od-section-title">Assign</h3>
                            <div className="od-form-row">
                                <div className="od-field">
                                    <label className="od-label">Salesman</label>
                                    <SalesmanSelect value={reassignTo} onChange={setReassignTo} salesmen={salesmen} />
                                </div>
                                <div className="od-field">
                                    <label className="od-label">Deliver by</label>
                                    <input type="date" value={reassignDue} onChange={(event) => setReassignDue(event.target.value)} />
                                </div>
                            </div>
                            <div className="od-actions">
                                <button className="od-btn od-btn-blue od-btn-sm" onClick={reassign}>Save assignment</button>
                                {order.entries.length === 0 && (
                                    <button className="od-btn od-btn-red od-btn-sm" onClick={removeOrder}>Remove order</button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="od-modal-footer">
                    <button className="od-btn od-btn-grey" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
