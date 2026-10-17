import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../../api/apiClient";
import { authHeaders } from "./quotationUtils.js";

const API = "/serverphp";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #ccc", borderRadius: "5px", fontSize: "14px", outline: "none", background: "#fff" };
const labelStyle = { display: "block", fontWeight: "700", fontSize: "13px", marginBottom: "6px" };

// Quotation fields a template variable can be filled with.
const FIELD_OPTIONS = [
    { key: "customer_name", label: "Customer name" },
    { key: "quotation_no", label: "Quotation no" },
    { key: "quotation_amount", label: "Quotation amount" },
    { key: "quotation_date", label: "Quotation date" },
    { key: "sales_order_no", label: "Sales order no" },
    { key: "sales_person", label: "Sales person" },
    { key: "invoice_no", label: "Invoice no" },
    { key: "enquiry_no", label: "Enquiry no" },
    { key: "mobile", label: "Customer mobile" }
];
const CUSTOM = "__custom";

// {{1}}, {{2}}... are filled in this order unless changed.
const DEFAULT_ORDER = ["customer_name", "quotation_no", "quotation_amount", "quotation_date", "sales_person"];

const CATEGORY_LABELS = { UTILITY: "Utility", MARKETING: "Marketing", AUTHENTICATION: "Authentication" };

const MAPPING_KEY = "everest_whatsapp_api_mapping";
const SENDER_KEY = "everest_whatsapp_api_sender";

const readStorage = (key, fallback) => {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        return value ?? fallback;
    } catch {
        return fallback;
    }
};

const writeStorage = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Private window or storage blocked: the choice is just not remembered.
    }
};

const postWhatsappApi = async (body, pdf) => {
    let requestBody;
    if (pdf) {
        requestBody = new FormData();
        requestBody.append("data", JSON.stringify(body));
        requestBody.append("pdf", pdf.blob, pdf.fileName);
    } else {
        requestBody = JSON.stringify(body);
    }

    let result;
    try {
        const response = await apiFetch(`${API}/whatsapp_api.php`, {
            method: "POST",
            headers: await authHeaders(),
            body: requestBody
        });
        result = await response.json();
    } catch (error) {
        // apiFetch throws on HTTP 500 without the server's message; say so plainly.
        throw new Error(error?.message || "WhatsApp API request failed.");
    }
    if (!result?.success) {
        throw new Error(result?.message || "WhatsApp API request failed.");
    }
    return result;
};

const templateKey = (template) => `${template.name}:${template.language}`;

// What a template needs: its body variables, and whether it can be sent
// from here (document header = the quotation PDF; other media headers,
// header variables and dynamic button links are not supported).
const describeTemplate = (template) => {
    const components = template?.components || [];
    const header = components.find((item) => item.type === "HEADER");
    const body = components.find((item) => item.type === "BODY");
    const buttons = components.find((item) => item.type === "BUTTONS");
    const bodyText = body?.text || "";

    const variables = [...new Set(
        [...bodyText.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1])
    )];
    const named = template?.parameter_format === "NAMED" ||
        variables.some((name) => !/^\d+$/.test(name));
    if (!named) variables.sort((a, b) => Number(a) - Number(b));

    const problems = [];
    const headerFormat = header?.format || "";
    if (["IMAGE", "VIDEO", "LOCATION"].includes(headerFormat)) {
        problems.push(`This template has a ${headerFormat.toLowerCase()} header, which cannot be sent from here.`);
    }
    if (headerFormat === "TEXT" && /{{/.test(header?.text || "")) {
        problems.push("This template has a variable in its header, which cannot be filled from here.");
    }
    (buttons?.buttons || []).forEach((button) => {
        if ((button.type === "URL" && /{{/.test(button.url || "")) || button.type === "COPY_CODE" || button.type === "OTP") {
            problems.push(`Button "${button.text || button.type}" needs a value, which cannot be filled from here.`);
        }
    });
    if (template?.category === "AUTHENTICATION") {
        problems.push("Authentication (OTP) templates are not used for quotations.");
    }

    return {
        headerFormat,
        headerText: headerFormat === "TEXT" ? header?.text || "" : "",
        bodyText,
        footerText: components.find((item) => item.type === "FOOTER")?.text || "",
        buttons: buttons?.buttons || [],
        variables,
        named,
        attachesPdf: headerFormat === "DOCUMENT",
        problems
    };
};

const defaultMapping = (info) =>
    Object.fromEntries(info.variables.map((name, index) => {
        if (info.named) {
            return [name, FIELD_OPTIONS.some((field) => field.key === name) ? name : CUSTOM];
        }
        return [name, DEFAULT_ORDER[index] || CUSTOM];
    }));

/*
 * Sends the selected quotations through the official WhatsApp Cloud API:
 * choose the business number, an approved Meta template (Utility / Marketing)
 * and which quotation field fills each {{variable}}; the quotation PDF goes as
 * the document header when the template has one. Every customer is sent
 * automatically, one after another, with no WhatsApp app needed.
 * Delivered / seen / replied times come in later through the webhook and show
 * in the WhatsApp Send Log.
 */
const WhatsappApiSender = ({ rows, getFields, getMobile, getCustomerName, getLogFields, getPdfBlob, getPdfFileName, onFinished, onClose }) => {
    const [setup, setSetup] = useState({ loading: true, error: "", configured: false, missing: [], phoneNumbers: [], webhookReady: false });
    const [templates, setTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [senderId, setSenderId] = useState(() => readStorage(SENDER_KEY, ""));
    const [selectedKey, setSelectedKey] = useState("");
    const [mappings, setMappings] = useState(() => readStorage(MAPPING_KEY, {}));
    const [customValues, setCustomValues] = useState({});
    const [results, setResults] = useState({});
    const [sending, setSending] = useState(false);
    const [stopRequested, setStopRequested] = useState(false);
    const stopRef = useRef(false);

    useEffect(() => {
        postWhatsappApi({ action: "status" })
            .then((result) => {
                const phoneNumbers = result.phone_numbers || [];
                setSetup({
                    loading: false,
                    error: "",
                    configured: !!result.configured,
                    missing: result.missing || [],
                    phoneNumbers,
                    webhookReady: !!result.webhook_ready
                });
                setSenderId((previous) =>
                    phoneNumbers.some((number) => number.id === previous)
                        ? previous
                        : (phoneNumbers.find((number) => number.is_default) || phoneNumbers[0])?.id || ""
                );
            })
            .catch((error) => setSetup((previous) => ({ ...previous, loading: false, error: error.message })));
    }, []);

    const sender = setup.phoneNumbers.find((number) => number.id === senderId);

    useEffect(() => {
        if (!senderId) return;
        writeStorage(SENDER_KEY, senderId);
        setTemplatesLoading(true);
        postWhatsappApi({ action: "templates", phone_number_id: senderId })
            .then((result) => {
                const list = result.data || [];
                setTemplates(list);
                setSelectedKey((previous) =>
                    list.some((template) => templateKey(template) === previous)
                        ? previous
                        : list[0] ? templateKey(list[0]) : ""
                );
            })
            .catch((error) => setSetup((previous) => ({ ...previous, error: error.message })))
            .finally(() => setTemplatesLoading(false));
    }, [senderId]);

    const template = templates.find((item) => templateKey(item) === selectedKey);
    const info = useMemo(() => describeTemplate(template), [template]);
    const mapping = { ...defaultMapping(info), ...(template ? mappings[selectedKey] || {} : {}) };

    const setMapping = (name, value) => {
        const next = { ...mappings, [selectedKey]: { ...mapping, [name]: value } };
        setMappings(next);
        writeStorage(MAPPING_KEY, next);
    };

    const valuesFor = (row) => {
        const fields = getFields(row);
        return Object.fromEntries(info.variables.map((name) => [
            name,
            mapping[name] === CUSTOM
                ? String(customValues[`${selectedKey}|${name}`] || "")
                : String(fields[mapping[name]] ?? "")
        ]));
    };

    const renderText = (text, values) =>
        String(text || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, name) =>
            Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match
        );

    const missingCustom = info.variables.some((name) =>
        mapping[name] === CUSTOM && !String(customValues[`${selectedKey}|${name}`] || "").trim()
    );

    const sendableRows = rows.filter((row) => getMobile(row));
    const doneCount = Object.values(results).filter((item) => item.state === "sent").length;
    const failedCount = Object.values(results).filter((item) => item.state === "failed").length;
    const started = Object.keys(results).length > 0;

    const sendAll = async () => {
        if (!template || info.problems.length || missingCustom || !sendableRows.length) return;

        if (template.category === "MARKETING" && !window.confirm(
            `Send this MARKETING message to ${sendableRows.length} customer(s)?\n\n` +
            "Marketing messages cost more than Utility messages, and WhatsApp may not deliver them " +
            "to customers who have not agreed to receive offers from you."
        )) return;

        stopRef.current = false;
        setStopRequested(false);
        setSending(true);

        for (const [index, row] of sendableRows.entries()) {
            if (stopRef.current) break;
            const key = index;
            if (results[key]?.state === "sent") continue;

            setResults((previous) => ({ ...previous, [key]: { state: "sending" } }));
            try {
                const values = valuesFor(row);
                let pdf = null;
                if (info.attachesPdf) {
                    pdf = { blob: await getPdfBlob(row), fileName: getPdfFileName(row) };
                }

                const result = await postWhatsappApi({
                    action: "send_template",
                    phone_number_id: senderId,
                    mobile: getMobile(row),
                    template_name: template.name,
                    template_category: template.category,
                    language: template.language,
                    body_params: info.named ? values : info.variables.map((name) => values[name]),
                    message: [renderText(info.headerText, values), renderText(info.bodyText, values), info.footerText]
                        .filter(Boolean).join("\n\n"),
                    ...getLogFields(row)
                }, pdf);

                setResults((previous) => ({ ...previous, [key]: { state: "sent", wamid: result.wamid } }));
            } catch (error) {
                setResults((previous) => ({ ...previous, [key]: { state: "failed", error: error.message } }));
            }
        }

        setSending(false);
        onFinished?.();
    };

    const stop = () => {
        stopRef.current = true;
        setStopRequested(true);
    };

    if (setup.loading) {
        return <div style={{ padding: "30px", textAlign: "center", color: "#555" }}>Connecting to WhatsApp API...</div>;
    }

    if (!setup.configured) {
        return (
            <div style={{ padding: "16px", background: "#fff8e1", border: "1px solid #ffe08a", borderRadius: "8px", fontSize: "13px", color: "#5d4a00", lineHeight: 1.5 }}>
                {setup.error ? (
                    <><strong>WhatsApp API error:</strong> {setup.error}</>
                ) : (
                    <>
                        <strong>WhatsApp API is not set up yet.</strong><br />
                        Ask the administrator to fill in {setup.missing.join(", ")} in
                        {" "}<code>serverphp/whatsapp_config.php</code> (see docs/WHATSAPP_CLOUD_API.md).
                    </>
                )}
            </div>
        );
    }

    const grouped = ["UTILITY", "MARKETING", "AUTHENTICATION"]
        .map((category) => [category, templates.filter((item) => item.category === category)])
        .filter(([, list]) => list.length);
    const others = templates.filter((item) => !CATEGORY_LABELS[item.category]);
    const previewRow = sendableRows[0] || rows[0] || {};
    const previewValues = template ? valuesFor(previewRow) : {};

    return (
        <div>
            {setup.error && (
                <div style={{ marginBottom: "12px", padding: "9px 10px", background: "#fdecea", border: "1px solid #f5c2c7", borderRadius: "6px", color: "#842029", fontSize: "12px" }}>
                    {setup.error}
                </div>
            )}

            <label style={labelStyle}>Send from (business number)</label>
            <select value={senderId} onChange={(e) => setSenderId(e.target.value)} disabled={sending || started} style={{ ...inputStyle, marginBottom: "14px" }}>
                {setup.phoneNumbers.map((number) => (
                    <option key={number.id} value={number.id}>
                        {number.display_phone_number} — {number.verified_name || "Unnamed"}
                        {number.quality_rating ? ` (quality: ${number.quality_rating})` : ""}
                    </option>
                ))}
            </select>

            <label style={labelStyle}>Approved Meta template</label>
            <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} disabled={sending || started || templatesLoading} style={{ ...inputStyle, marginBottom: "6px" }}>
                {templatesLoading && <option>Loading templates...</option>}
                {!templatesLoading && !templates.length && <option value="">No approved templates — create one in WhatsApp Manager</option>}
                {grouped.map(([category, list]) => (
                    <optgroup key={category} label={CATEGORY_LABELS[category]}>
                        {list.map((item) => (
                            <option key={templateKey(item)} value={templateKey(item)}>{item.name} ({item.language})</option>
                        ))}
                    </optgroup>
                ))}
                {others.map((item) => (
                    <option key={templateKey(item)} value={templateKey(item)}>{item.name} ({item.language})</option>
                ))}
            </select>
            {template && (
                <div style={{ marginBottom: "14px", fontSize: "11px", color: template.category === "MARKETING" ? "#8a3b00" : "#05693a", fontWeight: "700" }}>
                    {CATEGORY_LABELS[template.category] || template.category} message
                    {template.category === "MARKETING" ? " · charged at the higher Marketing rate; customers must have agreed to receive offers" : " · charged at the Utility rate"}
                    {info.attachesPdf ? " · quotation PDF attached" : ""}
                </div>
            )}

            {template && info.problems.length > 0 && (
                <div style={{ marginBottom: "14px", padding: "9px 10px", background: "#fdecea", border: "1px solid #f5c2c7", borderRadius: "6px", color: "#842029", fontSize: "12px" }}>
                    {info.problems.map((problem) => <div key={problem}>{problem}</div>)}
                </div>
            )}

            {template && info.variables.length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                    <div style={labelStyle}>Fill the template variables with</div>
                    {info.variables.map((name) => (
                        <div key={name} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                            <code style={{ minWidth: "110px", fontSize: "12px" }}>{`{{${name}}}`}</code>
                            <select value={mapping[name]} onChange={(e) => setMapping(name, e.target.value)} disabled={sending || started} style={{ ...inputStyle, flex: 1 }}>
                                {FIELD_OPTIONS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                                <option value={CUSTOM}>Same text for everyone...</option>
                            </select>
                            {mapping[name] === CUSTOM && (
                                <input
                                    type="text"
                                    value={customValues[`${selectedKey}|${name}`] || ""}
                                    onChange={(e) => setCustomValues((previous) => ({ ...previous, [`${selectedKey}|${name}`]: e.target.value }))}
                                    disabled={sending || started}
                                    placeholder="Text"
                                    style={{ ...inputStyle, flex: 1 }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {template && !started && (
                <div style={{ marginBottom: "14px" }}>
                    <div style={labelStyle}>Preview for {getCustomerName(previewRow)}</div>
                    <div style={{ background: "#e9f7ef", border: "1px solid #bfe4cc", borderRadius: "8px", padding: "14px", whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: "1.55" }}>
                        {info.attachesPdf && <div style={{ fontWeight: "700", marginBottom: "8px" }}>📄 {getPdfFileName(previewRow)}</div>}
                        {info.headerText && <div style={{ fontWeight: "700", marginBottom: "6px" }}>{renderText(info.headerText, previewValues)}</div>}
                        {renderText(info.bodyText, previewValues)}
                        {info.footerText && <div style={{ color: "#777", fontSize: "11px", marginTop: "8px" }}>{info.footerText}</div>}
                        {info.buttons.length > 0 && (
                            <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {info.buttons.map((button, index) => (
                                    <span key={index} style={{ padding: "4px 10px", border: "1px solid #bfe4cc", borderRadius: "14px", fontSize: "12px", color: "#075e54", background: "#fff" }}>{button.text}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "7px" }}>
                {sendableRows.map((row, index) => {
                    const result = results[index];
                    return (
                        <div key={index} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "8px 10px", borderBottom: index === sendableRows.length - 1 ? "none" : "1px solid #eee", fontSize: "12px" }}>
                            <span style={{ fontWeight: "700" }}>{getCustomerName(row)}</span>
                            <span style={{ textAlign: "right" }}>
                                {getMobile(row)}
                                {result?.state === "sending" && <span style={{ color: "#8a5a00", marginLeft: "8px" }}>⏳ Sending...</span>}
                                {result?.state === "sent" && <span style={{ color: "#198754", marginLeft: "8px", fontWeight: "700" }}>✓ Sent</span>}
                                {result?.state === "failed" && <div style={{ color: "#dc3545", fontWeight: "700" }}>✗ {result.error}</div>}
                            </span>
                        </div>
                    );
                })}
            </div>
            {rows.length > sendableRows.length && (
                <div style={{ marginTop: "6px", fontSize: "11px", color: "#8a5a00" }}>
                    {rows.length - sendableRows.length} selected quotation(s) have no valid mobile number and will be skipped.
                </div>
            )}

            {started && (
                <div style={{ marginTop: "10px", fontSize: "13px", fontWeight: "700", color: "#1c4e80" }}>
                    Sent {doneCount} of {sendableRows.length}{failedCount ? ` · ${failedCount} failed` : ""}
                    {!sending && " · Delivered, seen and replied times appear in the WhatsApp Send Log."}
                </div>
            )}

            {!setup.webhookReady && (
                <div style={{ marginTop: "10px", padding: "8px 10px", background: "#fff8e1", border: "1px solid #ffe08a", borderRadius: "6px", color: "#705d00", fontSize: "11px" }}>
                    The webhook is not set up (WA_APP_SECRET / WA_WEBHOOK_VERIFY_TOKEN), so delivered, seen and replied times will not be recorded yet.
                </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "15px" }}>
                <button type="button" onClick={onClose} disabled={sending} style={{ padding: "9px 17px", border: "1px solid #bbb", background: "#fff", borderRadius: "5px", cursor: sending ? "not-allowed" : "pointer" }}>
                    {started && !sending ? "Close" : "Cancel"}
                </button>
                {sending ? (
                    <button type="button" onClick={stop} disabled={stopRequested} style={{ padding: "9px 17px", border: "1px solid #dc3545", background: "#fff", color: "#dc3545", borderRadius: "5px", cursor: "pointer", fontWeight: "700" }}>
                        {stopRequested ? "Stopping..." : "Stop"}
                    </button>
                ) : (
                    (!started || failedCount > 0) && (
                        <button
                            type="button"
                            onClick={sendAll}
                            disabled={!template || info.problems.length > 0 || missingCustom || !sendableRows.length || !sender}
                            style={{ padding: "9px 20px", border: "none", background: !template || info.problems.length || missingCustom || !sendableRows.length ? "#aaa" : "#25D366", color: "#fff", borderRadius: "5px", cursor: "pointer", fontWeight: "800" }}
                        >
                            {started ? `Retry ${failedCount} failed` : `Send to ${sendableRows.length} customer(s)`}
                        </button>
                    )
                )}
            </div>
        </div>
    );
};

export default WhatsappApiSender;
