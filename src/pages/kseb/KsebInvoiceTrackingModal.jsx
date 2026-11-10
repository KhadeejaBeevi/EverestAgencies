import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../components/firebase";

/*
|--------------------------------------------------------------------------
| KSEB INVOICE: DOCUMENTS + TRACKING
|--------------------------------------------------------------------------
|
| Opened from the KSEB Invoices page (KSEBPayment.jsx).
|
| - Upload PO, invoice, DD, bank guarantee and other documents
|   (PDF or image).
| - Track the invoice from "Bill Generated" to "Payment Completed".
|
| Backend: serverphp/kseb_invoice_tracking.php
|
*/

const TRACKING_API = "/serverphp/kseb_invoice_tracking.php";

const GREEN = "#05693a";

const ACCEPT_FILES =
    ".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*";

/*
| Name of the logged-in user, as saved in Firestore Users/<uid>
| (firstName + lastName). Falls back to the Firebase display name.
| The email address is never used as the name.
*/
let cachedUserName = { uid: "", name: "" };

const getUserName = async () => {
    const user = auth?.currentUser;

    if (!user) return "";

    if (cachedUserName.uid === user.uid && cachedUserName.name) {
        return cachedUserName.name;
    }

    let name = "";

    try {
        const snap = await getDoc(doc(db, "Users", user.uid));

        if (snap.exists()) {
            const data = snap.data() || {};

            name = [data.firstName, data.lastName]
                .map((part) => String(part || "").trim())
                .filter(Boolean)
                .join(" ");

            if (!name) {
                name = String(data.name || data.displayName || "").trim();
            }
        }
    } catch (error) {
        console.error("Could not read the user name:", error);
    }

    if (!name) {
        name = String(user.displayName || "").trim();
    }

    if (name) {
        cachedUserName = { uid: user.uid, name };
    }

    return name;
};

const API_KEY = import.meta.env.VITE_API_KEY;

// Same API key header as apiClient.apiFetch, but the server's own
// error message (e.g. "File is too big") is shown instead of
// "API request failed: 400".
const postTracking = async (body) => {
    const isForm = body instanceof FormData;
    const headers = new Headers();

    if (API_KEY) {
        headers.set("X-API-Key", API_KEY);
    }

    if (!isForm) {
        headers.set("Content-Type", "application/json");
    }

    let response;

    try {
        response = await fetch(TRACKING_API, {
            method: "POST",
            headers,
            body: isForm ? body : JSON.stringify(body)
        });
    } catch {
        throw new Error("Server not reachable. Check your internet connection.");
    }

    const type = response.headers.get("Content-Type") || "";

    if (!response.ok || type.includes("application/json")) {
        let result = null;

        try {
            result = await response.json();
        } catch {
            // Not JSON.
        }

        if (!response.ok || !result || result.success !== true) {
            throw new Error(
                result?.message || `Request failed (${response.status})`
            );
        }

        return { json: result, response };
    }

    return { json: null, response };
};

export const callTracking = async (body) => {
    const { json } = await postTracking(body);

    if (!json) {
        throw new Error("Unexpected server response");
    }

    return json;
};

/*
| Opens (or downloads) one uploaded document. The file is fetched with
| the API key, so the uploads folder never has to be public.
| Also used by the document columns in KSEBPayment.jsx.
*/
export const openKsebDocument = async (doc, download = false) => {
    // Open the tab first so the browser does not block it as a pop-up.
    const newTab = download ? null : window.open("", "_blank");

    try {
        const { response } = await postTracking({
            action: "download",
            id: doc.id
        });

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (download || !newTab) {
            const link = document.createElement("a");

            link.href = url;
            link.download = doc.original_name || "document";
            document.body.appendChild(link);
            link.click();
            link.remove();
        } else {
            newTab.location.href = url;
        }

        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        if (newTab) {
            newTab.close();
        }

        throw error;
    }
};

const formatSize = (bytes) => {
    const value = Number(bytes) || 0;

    if (value >= 1024 * 1024) {
        return `${(value / 1024 / 1024).toFixed(1)} MB`;
    }

    return `${Math.max(1, Math.round(value / 1024))} KB`;
};

const formatDate = (value) => {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

    return match ? `${match[3]}-${match[2]}-${match[1]}` : text;
};

const formatDateTime = (value) => {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);

    return match
        ? `${match[3]}-${match[2]}-${match[1]} ${match[4]}:${match[5]}`
        : text;
};

const todayValue = () => {
    const d = new Date();

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
};

const DEFAULT_DOC_TYPES = [
    { key: "PO", label: "Purchase Order (PO)" },
    { key: "INVOICE", label: "Invoice" },
    { key: "DD", label: "Demand Draft (DD)" },
    { key: "BANK_GUARANTEE", label: "Bank Guarantee" },
    { key: "DELIVERY_NOTE", label: "Delivery Note / DC" },
    { key: "OTHER", label: "Other" }
];

const KsebInvoiceTrackingModal = ({
    invoice,
    initialDocType = "PO",
    onClose,
    onChanged
}) => {
    const invoiceNo = String(invoice?.invoice_no || "").trim();

    // Bill Generated is always done and dated with the invoice date.
    const invoiceDate = String(
        invoice?.invoice_date || invoice?.Date || ""
    ).trim();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const [documents, setDocuments] = useState([]);
    // Saved steps, oldest first (Bill Generated is always first).
    const [history, setHistory] = useState([]);
    // Steps not used yet = choices in the drop-down.
    const [availableSteps, setAvailableSteps] = useState([]);
    const [totalSteps, setTotalSteps] = useState(7);
    // true once Payment Completed is saved: tracking is closed.
    const [closed, setClosed] = useState(false);
    const [docTypes, setDocTypes] = useState(DEFAULT_DOC_TYPES);

    const [docType, setDocType] = useState(initialDocType || "PO");
    const [docRemarks, setDocRemarks] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    // New step form
    const [newStepKey, setNewStepKey] = useState("");
    const [newStepDate, setNewStepDate] = useState(todayValue());
    const [newStepRemarks, setNewStepRemarks] = useState("");
    const [savingStep, setSavingStep] = useState(false);

    const [busyDoc, setBusyDoc] = useState(null);

    const fileInputRef = useRef(null);

    const [isMobile, setIsMobile] = useState(
        typeof window !== "undefined" && window.innerWidth < 700
    );

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 700);

        window.addEventListener("resize", onResize);

        return () => window.removeEventListener("resize", onResize);
    }, []);

    const applyResult = (result) => {
        setDocuments(Array.isArray(result.documents) ? result.documents : []);
        if (Array.isArray(result.history)) {
            setHistory(result.history);
        }

        if (Array.isArray(result.available_steps)) {
            setAvailableSteps(result.available_steps);
        }

        if (typeof result.closed === "boolean") {
            setClosed(result.closed);
        }

        if (result.total_steps) {
            setTotalSteps(Number(result.total_steps) || 7);
        }

        if (Array.isArray(result.doc_types) && result.doc_types.length) {
            setDocTypes(result.doc_types);
        }
    };

    const loadDetails = async () => {
        setLoading(true);
        setError("");

        try {
            const result = await callTracking({
                action: "get",
                invoice_no: invoiceNo,
                invoice_date: invoiceDate
            });

            applyResult(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (invoiceNo) {
            loadDetails();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoiceNo]);

    // Close with the Escape key.
    useEffect(() => {
        const onKey = (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const showMessage = (text) => {
        setMessage(text);
        setError("");

        window.setTimeout(() => setMessage(""), 2500);
    };

    /*
    |----------------------------------------------------------------------
    | DOCUMENTS
    |----------------------------------------------------------------------
    */

    const uploadDocument = async () => {
        if (!selectedFile) {
            setError("Choose a file to upload");
            return;
        }

        if (selectedFile.size > 15 * 1024 * 1024) {
            setError("File is too big. Maximum is 15 MB");
            return;
        }

        const form = new FormData();

        form.append("action", "upload");
        form.append("invoice_no", invoiceNo);
        form.append("invoice_date", invoiceDate);
        form.append("doc_type", docType);
        form.append("remarks", docRemarks);
        form.append("user", await getUserName());
        form.append("file", selectedFile);

        setUploading(true);
        setError("");

        try {
            const result = await callTracking(form);

            applyResult(result);
            setSelectedFile(null);
            setDocRemarks("");

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }

            showMessage("Document uploaded");
            onChanged?.(result.documents);
        } catch (err) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const openDocument = async (doc, download = false) => {
        setBusyDoc(doc.id);
        setError("");

        try {
            await openKsebDocument(doc, download);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyDoc(null);
        }
    };

    const deleteDocument = async (doc) => {
        if (
            !window.confirm(
                `Delete "${doc.original_name}" (${doc.doc_type_label})?`
            )
        ) {
            return;
        }

        setBusyDoc(doc.id);
        setError("");

        try {
            const result = await callTracking({
                action: "delete_doc",
                invoice_date: invoiceDate,
                id: doc.id
            });

            applyResult(result);
            showMessage("Document deleted");
            onChanged?.(result.documents);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyDoc(null);
        }
    };

    /*
    |----------------------------------------------------------------------
    | TRACKING
    |----------------------------------------------------------------------
    */

    const saveNewStep = async () => {
        const step = availableSteps.find((item) => item.key === newStepKey);

        if (!step) {
            setError("Select a tracking step");
            return;
        }

        const userName = await getUserName();

        if (!userName) {
            setError(
                "Your name is not set in your user profile. Ask the admin to add your first name, then try again."
            );
            return;
        }

        setSavingStep(true);
        setError("");

        try {
            const result = await callTracking({
                action: "save_step",
                invoice_no: invoiceNo,
                invoice_date: invoiceDate,
                step_key: step.key,
                done: true,
                date: newStepDate || "",
                remarks: newStepRemarks || "",
                user: userName
            });

            applyResult(result);
            setNewStepKey("");
            setNewStepDate(todayValue());
            setNewStepRemarks("");
            showMessage(`${step.label} saved`);
            onChanged?.(result.documents);
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingStep(false);
        }
    };

    // Latest step on top, Bill Generated at the bottom.
    const timeline = [...history].reverse();

    // Payment collected = every step counts as done.
    const doneCount = closed ? totalSteps : history.length;

    const progress = totalSteps
        ? Math.round((doneCount / totalSteps) * 100)
        : 0;

    /*
    |----------------------------------------------------------------------
    | STYLES
    |----------------------------------------------------------------------
    */

    const sectionTitle = {
        margin: "0 0 10px",
        fontSize: "14px",
        fontWeight: 700,
        color: GREEN,
        borderBottom: "2px solid #e3eee8",
        paddingBottom: "6px"
    };

    const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        padding: "7px 8px",
        border: "1px solid #cfd8d3",
        borderRadius: "5px",
        fontSize: "12px",
        background: "#fff"
    };

    const button = (background, color = "#fff") => ({
        padding: "7px 12px",
        border: "none",
        borderRadius: "5px",
        background,
        color,
        fontSize: "12px",
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap"
    });

    const smallButton = (color) => ({
        padding: "4px 8px",
        border: `1px solid ${color}`,
        borderRadius: "4px",
        background: "#fff",
        color,
        fontSize: "11px",
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap"
    });

    // Rendered straight into <body> so the banner can never cover it.
    return createPortal(
        <div
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                // Above the banner (it uses z-index up to 1000000).
                zIndex: 2000000,
                display: "flex",
                alignItems: isMobile ? "stretch" : "flex-start",
                justifyContent: "center",
                padding: isMobile ? 0 : "30px 16px",
                overflowY: "auto"
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                style={{
                    width: "100%",
                    maxWidth: "980px",
                    background: "#fff",
                    borderRadius: isMobile ? 0 : "10px",
                    boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
                    overflow: "hidden",
                    alignSelf: isMobile ? "stretch" : "auto"
                }}
            >
                {/* HEADER */}
                <div
                    style={{
                        background: GREEN,
                        color: "#fff",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "10px"
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "16px", fontWeight: 700 }}>
                            Invoice {invoiceNo}
                        </div>
                        <div
                            style={{
                                fontSize: "12px",
                                opacity: 0.9,
                                marginTop: "3px",
                                wordBreak: "break-word"
                            }}
                        >
                            {invoice?.party_name || invoice?.party_ledger_name || ""}
                            {invoice?.order_no
                                ? ` · PO Number: ${invoice.order_no}`
                                : ""}
                            {invoice?.invoice_date
                                ? ` · ${formatDate(invoice.invoice_date)}`
                                : ""}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            border: "none",
                            background: "rgba(255,255,255,0.15)",
                            color: "#fff",
                            width: "30px",
                            height: "30px",
                            borderRadius: "50%",
                            fontSize: "18px",
                            lineHeight: "30px",
                            cursor: "pointer",
                            flexShrink: 0
                        }}
                    >
                        ×
                    </button>
                </div>

                {(error || message) && (
                    <div
                        style={{
                            margin: "12px 16px 0",
                            padding: "8px 12px",
                            borderRadius: "5px",
                            fontSize: "12px",
                            fontWeight: 600,
                            background: error ? "#fdecec" : "#e8f5ee",
                            color: error ? "#b42318" : GREEN,
                            border: `1px solid ${error ? "#f5c2c0" : "#bfe0cc"}`
                        }}
                    >
                        {error || message}
                    </div>
                )}

                {loading ? (
                    <div
                        style={{
                            padding: "40px",
                            textAlign: "center",
                            color: "#666",
                            fontSize: "13px"
                        }}
                    >
                        Loading documents and tracking...
                    </div>
                ) : (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: "18px",
                            padding: "16px"
                        }}
                    >
                        {/* ============ TRACKING ============ */}
                        <div>
                            <h3 style={sectionTitle}>
                                KSEB Tracking
                                <span
                                    style={{
                                        float: "right",
                                        fontSize: "11px",
                                        color: "#555",
                                        fontWeight: 600,
                                        marginTop: "2px"
                                    }}
                                >
                                    {doneCount} of {totalSteps} done
                                </span>
                            </h3>

                            <div
                                style={{
                                    height: "6px",
                                    background: "#e6ece9",
                                    borderRadius: "3px",
                                    overflow: "hidden",
                                    marginBottom: "12px"
                                }}
                            >
                                <div
                                    style={{
                                        width: `${progress}%`,
                                        height: "100%",
                                        background: GREEN,
                                        transition: "width 0.3s"
                                    }}
                                />
                            </div>

                            {/* ---- ADD NEXT STEP ---- */}
                            {!closed && availableSteps.length > 0 ? (
                                <div
                                    style={{
                                        padding: "10px",
                                        background: "#f7f9f8",
                                        border: "1px dashed #b9cfc2",
                                        borderRadius: "6px",
                                        display: "grid",
                                        gap: "8px",
                                        marginBottom: "16px"
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: "12px",
                                            fontWeight: 700,
                                            color: GREEN
                                        }}
                                    >
                                        Add tracking step
                                    </div>

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 140px",
                                            gap: "8px"
                                        }}
                                    >
                                        <select
                                            value={newStepKey}
                                            onChange={(event) =>
                                                setNewStepKey(event.target.value)
                                            }
                                            style={inputStyle}
                                            aria-label="Tracking step"
                                        >
                                            <option value="">
                                                Select step...
                                            </option>
                                            {availableSteps.map((step) => (
                                                <option key={step.key} value={step.key}>
                                                    {step.label}
                                                </option>
                                            ))}
                                        </select>

                                        <input
                                            type="date"
                                            value={newStepDate}
                                            max={todayValue()}
                                            onChange={(event) =>
                                                setNewStepDate(event.target.value)
                                            }
                                            style={inputStyle}
                                            aria-label="Step date"
                                        />
                                    </div>

                                    <textarea
                                        rows={2}
                                        maxLength={500}
                                        value={newStepRemarks}
                                        placeholder="Remarks: office, file no, cheque / UTR no... (optional)"
                                        onChange={(event) =>
                                            setNewStepRemarks(event.target.value)
                                        }
                                        style={{
                                            ...inputStyle,
                                            resize: "vertical",
                                            fontFamily: "inherit"
                                        }}
                                    />

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: "8px"
                                        }}
                                    >
                                        <span style={{ fontSize: "10px", color: "#8a6100" }}>
                                            Saved steps cannot be edited later
                                        </span>

                                        <button
                                            type="button"
                                            onClick={saveNewStep}
                                            disabled={savingStep || !newStepKey}
                                            style={{
                                                ...button(GREEN),
                                                opacity: savingStep || !newStepKey ? 0.6 : 1,
                                                cursor:
                                                    savingStep || !newStepKey
                                                        ? "default"
                                                        : "pointer"
                                            }}
                                        >
                                            {savingStep ? "Saving..." : "Save step"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    style={{
                                        padding: "9px 12px",
                                        marginBottom: "16px",
                                        background: "#e8f5ee",
                                        border: "1px solid #bfe0cc",
                                        borderRadius: "6px",
                                        color: GREEN,
                                        fontSize: "12px",
                                        fontWeight: 700
                                    }}
                                >
                                    {closed
                                        ? "✓ Payment collected. Tracking is complete and closed."
                                        : "All tracking steps are done"}
                                </div>
                            )}

                            {/* ---- TIMELINE: latest on top, Bill Generated at the bottom ---- */}
                            <div>
                                {timeline.map((entry, index) => {
                                    const isLatest = index === 0;
                                    const isLast = index === timeline.length - 1;

                                    return (
                                        <div
                                            key={`${entry.key}-${entry.id}`}
                                            style={{
                                                display: "flex",
                                                gap: "10px",
                                                position: "relative",
                                                paddingBottom: isLast ? 0 : "14px"
                                            }}
                                        >
                                            {!isLast && (
                                                <div
                                                    style={{
                                                        position: "absolute",
                                                        left: "11px",
                                                        top: "24px",
                                                        bottom: 0,
                                                        width: "2px",
                                                        background: GREEN
                                                    }}
                                                />
                                            )}

                                            <div
                                                style={{
                                                    width: "24px",
                                                    height: "24px",
                                                    minWidth: "24px",
                                                    borderRadius: "50%",
                                                    background: isLatest ? GREEN : "#fff",
                                                    border: `2px solid ${GREEN}`,
                                                    color: isLatest ? "#fff" : GREEN,
                                                    fontSize: "11px",
                                                    fontWeight: 700,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    boxSizing: "border-box",
                                                    zIndex: 1
                                                }}
                                            >
                                                ✓
                                            </div>

                                            <div
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    padding: isLatest ? "6px 8px" : 0,
                                                    marginTop: isLatest ? "-6px" : 0,
                                                    background: isLatest ? "#eef7f2" : "transparent",
                                                    borderRadius: "6px"
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: "13px",
                                                        fontWeight: 700,
                                                        color: "#1d2b24"
                                                    }}
                                                >
                                                    {entry.label}
                                                    {isLatest && (
                                                        <span
                                                            style={{
                                                                marginLeft: "6px",
                                                                fontSize: "10px",
                                                                padding: "1px 6px",
                                                                borderRadius: "8px",
                                                                background: GREEN,
                                                                color: "#fff"
                                                            }}
                                                        >
                                                            Current
                                                        </span>
                                                    )}
                                                </div>

                                                <div
                                                    style={{
                                                        fontSize: "11px",
                                                        color: "#555",
                                                        marginTop: "2px",
                                                        lineHeight: 1.5
                                                    }}
                                                >
                                                    <strong>
                                                        {entry.date ? formatDate(entry.date) : "—"}
                                                    </strong>
                                                    {entry.automatic && (
                                                        <span style={{ color: "#777" }}>
                                                            {" "}· Invoice date
                                                        </span>
                                                    )}
                                                </div>

                                                {entry.remarks && (
                                                    <div
                                                        style={{
                                                            fontSize: "11px",
                                                            color: "#333",
                                                            whiteSpace: "pre-wrap",
                                                            wordBreak: "break-word"
                                                        }}
                                                    >
                                                        {entry.remarks}
                                                    </div>
                                                )}

                                                <div
                                                    style={{
                                                        fontSize: "10px",
                                                        color: "#777",
                                                        marginTop: "2px"
                                                    }}
                                                >
                                                    Added by{" "}
                                                    <strong style={{ color: "#444" }}>
                                                        {entry.added_by || "Unknown"}
                                                    </strong>
                                                    {entry.added_at
                                                        ? ` on ${formatDateTime(entry.added_at)}`
                                                        : ""}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ============ DOCUMENTS ============ */}
                        <div>
                            <h3 style={sectionTitle}>
                                Documents
                                <span
                                    style={{
                                        float: "right",
                                        fontSize: "11px",
                                        color: "#555",
                                        fontWeight: 600,
                                        marginTop: "2px"
                                    }}
                                >
                                    {documents.length} uploaded
                                </span>
                            </h3>

                            <div
                                style={{
                                    padding: "10px",
                                    background: "#f7f9f8",
                                    border: "1px dashed #b9cfc2",
                                    borderRadius: "6px",
                                    display: "grid",
                                    gap: "8px",
                                    marginBottom: "12px"
                                }}
                            >
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr",
                                        gap: "8px"
                                    }}
                                >
                                    <select
                                        value={docType}
                                        onChange={(event) =>
                                            setDocType(event.target.value)
                                        }
                                        style={inputStyle}
                                    >
                                        {docTypes.map((type) => (
                                            <option key={type.key} value={type.key}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>

                                    <input
                                        type="text"
                                        value={docRemarks}
                                        maxLength={500}
                                        placeholder="Remarks (optional)"
                                        onChange={(event) =>
                                            setDocRemarks(event.target.value)
                                        }
                                        style={inputStyle}
                                    />
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ACCEPT_FILES}
                                    onChange={(event) =>
                                        setSelectedFile(
                                            event.target.files?.[0] || null
                                        )
                                    }
                                    style={{ ...inputStyle, padding: "5px" }}
                                />

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "8px"
                                    }}
                                >
                                    <span style={{ fontSize: "10px", color: "#777" }}>
                                        PDF or image (JPG, PNG), max 15 MB
                                    </span>

                                    <button
                                        type="button"
                                        onClick={uploadDocument}
                                        disabled={uploading || !selectedFile}
                                        style={{
                                            ...button(GREEN),
                                            opacity: uploading || !selectedFile ? 0.6 : 1,
                                            cursor:
                                                uploading || !selectedFile
                                                    ? "default"
                                                    : "pointer"
                                        }}
                                    >
                                        {uploading ? "Uploading..." : "Upload"}
                                    </button>
                                </div>
                            </div>

                            {documents.length === 0 ? (
                                <div
                                    style={{
                                        padding: "18px",
                                        textAlign: "center",
                                        color: "#888",
                                        fontSize: "12px",
                                        border: "1px solid #eee",
                                        borderRadius: "6px"
                                    }}
                                >
                                    No documents uploaded yet
                                </div>
                            ) : (
                                <div style={{ display: "grid", gap: "8px" }}>
                                    {documents.map((doc) => {
                                        const isPdf = String(doc.mime_type).includes("pdf");
                                        const isBusy = busyDoc === doc.id;

                                        return (
                                            <div
                                                key={doc.id}
                                                style={{
                                                    display: "flex",
                                                    gap: "10px",
                                                    alignItems: "flex-start",
                                                    padding: "8px 10px",
                                                    border: "1px solid #e3e8e5",
                                                    borderRadius: "6px",
                                                    background: "#fff"
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: "34px",
                                                        minWidth: "34px",
                                                        height: "40px",
                                                        borderRadius: "4px",
                                                        background: isPdf ? "#fdecec" : "#e8f1fb",
                                                        color: isPdf ? "#b42318" : "#1d5fa8",
                                                        fontSize: "9px",
                                                        fontWeight: 800,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center"
                                                    }}
                                                >
                                                    {isPdf ? "PDF" : "IMG"}
                                                </div>

                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div
                                                        style={{
                                                            fontSize: "11px",
                                                            fontWeight: 800,
                                                            color: GREEN
                                                        }}
                                                    >
                                                        {doc.doc_type_label}
                                                    </div>
                                                    <div
                                                        title={doc.original_name}
                                                        style={{
                                                            fontSize: "12px",
                                                            fontWeight: 600,
                                                            color: "#222",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap"
                                                        }}
                                                    >
                                                        {doc.original_name}
                                                    </div>
                                                    <div style={{ fontSize: "10px", color: "#777" }}>
                                                        {formatSize(doc.file_size)} ·{" "}
                                                        {formatDateTime(doc.uploaded_at)}
                                                        {doc.uploaded_by
                                                            ? ` · ${doc.uploaded_by}`
                                                            : ""}
                                                    </div>
                                                    {doc.remarks && (
                                                        <div
                                                            style={{
                                                                fontSize: "11px",
                                                                color: "#444",
                                                                marginTop: "2px",
                                                                wordBreak: "break-word"
                                                            }}
                                                        >
                                                            {doc.remarks}
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    style={{
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: "4px"
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        style={smallButton(GREEN)}
                                                        disabled={isBusy}
                                                        onClick={() => openDocument(doc)}
                                                    >
                                                        {isBusy ? "..." : "View"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        style={smallButton("#1d5fa8")}
                                                        disabled={isBusy}
                                                        onClick={() => openDocument(doc, true)}
                                                    >
                                                        Download
                                                    </button>
                                                    <button
                                                        type="button"
                                                        style={smallButton("#b42318")}
                                                        disabled={isBusy}
                                                        onClick={() => deleteDocument(doc)}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default KsebInvoiceTrackingModal;
