// Pure helpers for the Quotation Wise page (no React state).
import { auth } from "../../firebase";

// Authorization header with the logged-in user's Firebase ID token.
// The PHP endpoints verify it (firebase_auth.php) to know who is calling.
export const authHeaders = async () => {
    const user = auth.currentUser;
    if (!user) return {};
    try {
        return { Authorization: `Bearer ${await user.getIdToken()}` };
    } catch (error) {
        console.error("Firebase token error:", error);
        return {};
    }
};

// Indian financial year (April-March) that a date falls in, e.g. 2026 for
// 07-Oct-2026 and for 15-Feb-2027.
export const getFinancialYear = (date = new Date()) => {
    const d = date instanceof Date ? date : new Date(String(date).replace(" ", "T"));
    if (isNaN(d.getTime())) return null;
    return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
};

export const formatFinancialYear = (startYear) =>
    `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

export const normalizePartyKey = (value) =>
    String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

export const getPartyNameForLongTerm = (row) =>
    String(
        row?.party_name ||
        row?.PartyLedgerName ||
        ""
    ).trim();

export const getQuotationNo = (row) => String(row?.quotation_no || row?.voucher_no || row?.VoucherNumber || "").trim();

export const getFollowupPerson = (record) => String(
    record?.telecaller || record?.followup_by || record?.followup_person ||
    record?.followupPerson || record?.user_name || record?.username || record?.name || ""
).trim();

export const normalizeDate = (value) => {
    if (!value) return "";
    const text = String(value).trim();
    const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const getFinancialMonth = (date) => {
    if (!date) return "";

    const d = new Date(date);
    if (isNaN(d.getTime())) return "";

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    return months[d.getMonth()];
};

export const formatDate = (date) => {
    if (!date) return "";

    const d = new Date(date);

    if (isNaN(d.getTime())) {
        return date;
    }

    const day = String(
        d.getDate()
    ).padStart(2, "0");

    const month = d.toLocaleString(
        "en-US",
        {
            month: "short"
        }
    );

    const year = d.getFullYear();

    return `${day}-${month}-${year}`;
};

// Format SQL created_at for display beside the telecaller's name.
export const formatLastActive = (value) => {
    if (!value) return "";

    const d = new Date(value);

    if (isNaN(d.getTime())) return "";

    const now = new Date();
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

    if (sameDay) {
        return d.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    }

    return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
};

// "07-Oct-2026 10:32 AM". Accepts MySQL "YYYY-MM-DD HH:MM:SS" and ISO strings.
export const formatDateTime = (value) => {
    if (!value) return "";
    const d = new Date(String(value).replace(" ", "T"));
    if (isNaN(d.getTime())) return String(value);
    const time = d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
    return `${formatDate(d)} ${time}`;
};

export const getDateValue = (date) => {
    if (!date) return 0;

    const d = new Date(date);

    if (isNaN(d.getTime())) {
        return 0;
    }

    return d.getTime();
};

export const formatAmount = (value) => {
    if (
        value === "" ||
        value === null ||
        value === undefined
    ) {
        return "";
    }

    const number = Number(value);

    if (isNaN(number)) {
        return "";
    }

    return number.toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
};

export const cleanBilledParty = (value) => {
    if (!value) return "";

    const text = String(value)
        .replace(/\s+/g, " ")
        .trim();

    if (!text) return "";

    const parts = text
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length >= 2) {
        const company = parts[0];
        const location = parts[1];

        // Check whether the same pair is repeated
        let repeated = true;

        for (let i = 0; i < parts.length; i += 2) {
            if (
                (parts[i] || "").toLowerCase() !==
                company.toLowerCase() ||
                (parts[i + 1] || "").toLowerCase() !==
                location.toLowerCase()
            ) {
                repeated = false;
                break;
            }
        }

        if (repeated) {
            return `${company}, ${location}`;
        }
    }

    return text;
};

export const getCustomerType = (row) => {
    const values = [
        row?.customer_type,
        row?.customerType,
        row?.party_type,
        row?.partyType,
        row?.ledger_group,
        row?._LedGroup,
        row?.party_name,
        row?.PartyLedgerName,
        row?.billed_party
    ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);

    const text = values.join(" | ");

    if (
        text.includes("cash sales-b2b") ||
        text.includes("cash-sales-b2b") ||
        text.includes("cash b2b") ||
        text.includes("cash-b2b")
    ) {
        return "b2b";
    }

    if (
        text.includes("cash sales-b2c") ||
        text.includes("cash-sales-b2c") ||
        text.includes("cash b2c") ||
        text.includes("cash-b2c")
    ) {
        return "b2c";
    }

    if (text.includes("b2b")) return "b2b";
    if (text.includes("b2c")) return "b2c";
    // Anything that is not B2B or B2C belongs to Others.
    return "other";
};

export const getItemGstTotal = (items) => {
    if (!Array.isArray(items)) return 0;

    return items.reduce((sum, item) => {
        const value = Number(item?.value || 0);
        const gstAmount = Number(item?.gst_amount || 0);
        const gstRate = Number(item?.gst_rate || 0);

        if (gstAmount !== 0) {
            return sum + gstAmount;
        }

        return sum + (value * gstRate / 100);
    }, 0);
};

export const getQuotationTotalWithGst = (row) => {
    const explicit = Number(row?.quotation_amount_with_gst);
    if (Number.isFinite(explicit) && explicit !== 0) return explicit;

    const taxable = Number(row?.quotation_amount || 0);
    const gst = getItemGstTotal(row?.items);
    return Math.round((taxable + gst) + Number.EPSILON);
};

export const getBilledAmountWithGst = (row) => {
    const explicit = Number(row?.billed_amount_with_gst);
    if (Number.isFinite(explicit) && explicit !== 0) return explicit;

    const taxable = Number(row?.billed_amount || 0);
    const gst = Number(
        row?.billed_gst_amount ??
        row?.billed_tax_amount ??
        row?.billed_gst ??
        0
    );

    return taxable + (Number.isFinite(gst) ? gst : 0);
};

export const getItemTotal = (items) => {
    if (!Array.isArray(items)) {
        return 0;
    }

    return items.reduce(
        (sum, item) =>
            sum +
            Number(
                item.value || 0
            ),
        0
    );
};

// =====================================================
// WHATSAPP TEMPLATE HELPERS
// =====================================================
export const getWhatsappRowKey = (row) => {
    const quotationNo = getQuotationNo(row);
    const party = String(row?.party_name || row?.PartyLedgerName || "").trim();
    const mobile = String(row?.mobile || row?.purchase_contact || row?.phone || row?.contact_no || "").trim();
    const date = String(row?.date || "").trim();
    const orderNo = String(row?.order_no || row?.OrderNo || "").trim();
    return [quotationNo, party, mobile, date, orderNo].join("||");
};

export const getWhatsappMobile = (mobile) => {
    const digits = String(mobile || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith("91")) return digits;
    return digits;
};

// WhatsApp greeting/customer name should use Tally Mailing Name.
export const getWhatsappCustomerName = (row) =>
    String(
        row?.mailing_name ||
        row?.EveInvMailingName ||
        row?.billed_party ||
        row?.party_name ||
        row?.PartyLedgerName ||
        row?.customer_name ||
        "Customer"
    ).trim();

// Same WhatsApp number as the existing WhatsApp icon (walkin_cust_no).
export const getWhatsappRowMobile = (row) =>
    String(row?.walkin_cust_no || "").trim();

// Save an already built PDF. Synchronous, so it still counts as part of
// the user's click.
export const saveBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// Today's date as YYYY-MM-DD in the browser's own time zone (IST), unlike
// toISOString(), which is UTC and gives yesterday before 5:30 AM.
export const todayLocal = () => normalizeDate(new Date());

export const addDaysLocal = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return normalizeDate(d);
};

// Opens a WhatsApp chat. Phones and tablets use wa.me (opens the app);
// computers use whatsapp:// (WhatsApp Desktop), as before.
export const openWhatsappChat = (number, message = "") => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    const text = message ? encodeURIComponent(message) : "";

    if (isMobile) {
        window.location.href = `https://wa.me/${number}${text ? `?text=${text}` : ""}`;
    } else {
        window.location.href = `whatsapp://send?phone=${number}${text ? `&text=${text}` : ""}`;
    }
};
