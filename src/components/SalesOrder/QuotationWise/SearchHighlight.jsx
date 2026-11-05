import React from "react";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A search that looks like a phone number ("98765 43210", "+91-98765-43210").
// Only then are spaces, +91, hyphens and brackets ignored while matching.
// Returns the digits to look for, or "" for a normal text search.
const getPhoneDigits = (search) => {
    const text = String(search || "").trim();
    if (!/^[\d\s+\-()]+$/.test(text)) return "";
    const digits = text.replace(/\D/g, "");
    return digits.length >= 5 ? digits : "";
};

// Names shown in "Found in" for the fields of a quotation.
const FIELD_LABELS = {
    quotation_no: "Quotation No",
    voucher_no: "Quotation No",
    VoucherNumber: "Quotation No",
    order_no: "Order No",
    OrderNo: "Order No",
    enquiry_no: "Enquiry No",
    party_name: "Party Name",
    PartyLedgerName: "Party Name",
    mailing_name: "Mailing Name",
    EveInvMailingName: "Mailing Name",
    mailing_address: "Address",
    EveInvMailingAdd: "Address",
    walkin_cust_no: "Mobile",
    mobile: "Mobile",
    invoice_no: "Invoice No",
    billed_party: "Billed Party",
    billed_party_address: "Billed Address",
    billed_address: "Billed Address",
    EveInvBilledAdd: "Billed Address",
    brought_by: "Brought By",
    assigned_to: "Assigned To",
    items: "Items",
    bills: "Bill Details",
    followup: "Follow-up"
};

const getFieldLabel = (key) =>
    FIELD_LABELS[key] ||
    String(key)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

// Every field of the quotation (and its follow-ups) that contains the search.
// Each field is checked on its own, so digits of two different fields are
// never joined into a false match. Returns the field names; empty = no match.
export const getSearchMatches = (row, followupRecord, search) => {
    const text = String(search || "").trim().toLowerCase();
    if (!text) return [];

    const phoneDigits = getPhoneDigits(text);
    const found = new Set();

    const isMatch = (value) => {
        const valueText = String(value);
        if (valueText.toLowerCase().includes(text)) return true;
        return !!phoneDigits && valueText.replace(/\D/g, "").includes(phoneDigits);
    };

    const walk = (value, topKey) => {
        if (value === null || value === undefined || value === "") return;
        if (Array.isArray(value)) {
            value.forEach((item) => walk(item, topKey));
            return;
        }
        if (typeof value === "object") {
            Object.entries(value).forEach(([key, item]) => walk(item, topKey || key));
            return;
        }
        if (topKey && isMatch(value)) found.add(getFieldLabel(topKey));
    };

    walk(row || {}, "");
    walk(followupRecord || {}, "followup");

    return [...found];
};

// Builds the regex used to highlight the search text on screen.
// Matches the text as typed (any case). For a phone-number search it also
// matches the digits with spaces, +91, hyphens, etc. between them, so
// "9876543210" highlights "98765 43210" (same rule as the search itself).
export const buildSearchRegex = (search) => {
    const text = String(search || "").trim();
    if (!text) return null;

    const patterns = [escapeRegExp(text)];
    const phoneDigits = getPhoneDigits(text);
    if (phoneDigits) {
        patterns.push(phoneDigits.split("").join("[\\s+\\-()]{0,3}"));
    }

    try {
        return new RegExp(`(${patterns.join("|")})`, "gi");
    } catch {
        return null;
    }
};

// Inline style, so no CSS file change is needed.
const HIT_STYLE = {
    background: "#ffe066",
    color: "inherit",
    padding: "0 1px",
    borderRadius: "2px"
};

// Returns the value with every match wrapped in <mark class="qw-search-hit">.
export const highlightMatches = (value, regex) => {
    if (value === null || value === undefined || value === "") return value;
    if (!regex) return value;

    const text = String(value);
    const parts = text.split(regex);
    if (parts.length === 1) return value;

    // split() with one capture group: odd indexes are the matches.
    return parts.map((part, index) =>
        index % 2 === 1 && part ? (
            <mark key={index} className="qw-search-hit" style={HIT_STYLE}>{part}</mark>
        ) : (
            part
        )
    );
};
