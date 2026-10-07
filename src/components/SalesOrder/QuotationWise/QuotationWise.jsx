import Banner from "../../Banner/Banner.jsx";
import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import "./QuotationWise.css";
import { apiFetch } from "../../../api/apiClient";
import * as XLSX from "xlsx";
import {
    downloadQuotationPdf,
    getQuotationPdfBlob,
    getQuotationPdfFileName
} from "./QuotationPdf.jsx";


const API = "/serverphp";

const getCurrentFinancialMonth = () => {
    return String(new Date().getMonth() + 1);
};


const QuotationWise = () => {

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [userRole, setUserRole] = useState("");

    const [searchTerm, setSearchTerm] = useState("");

    const [screenWidth, setScreenWidth] = useState(
        typeof window !== "undefined" ? window.innerWidth : 1200
    );

    const [statusFilter, setStatusFilter] = useState("all");
    const [customerTypeFilter, setCustomerTypeFilter] = useState("all");

    const [selectedMonth, setSelectedMonth] = useState(getCurrentFinancialMonth());

    const [sortOrder, setSortOrder] = useState("newest");
    const [followupByQuotation, setFollowupByQuotation] = useState({});
    const [followupFilter, setFollowupFilter] = useState("all");
    const [followupLoading, setFollowupLoading] = useState(false);
    const [followupDateFilter, setFollowupDateFilter] = useState("");
    const [followupDateByQuotation, setFollowupDateByQuotation] = useState({});
    const [quotationSort, setQuotationSort] = useState("default");
    const [viewMode, setViewMode] = useState("party"); // "party" or "date"
    const [followupQuickFilter, setFollowupQuickFilter] = useState("all");

    const [followupStatusByQuotation, setFollowupStatusByQuotation] = useState({});
    const [followupRemarksByQuotation, setFollowupRemarksByQuotation] = useState({});
    const [followupHistoryByQuotation, setFollowupHistoryByQuotation] = useState({});
    const [expandedFollowup, setExpandedFollowup] = useState(null);

    const [lastSeenByPerson, setLastSeenByPerson] = useState({});
    const [todayCallCountByPerson, setTodayCallCountByPerson] = useState({});
    const [showFollowupByDropdown, setShowFollowupByDropdown] = useState(false);

    // Long-Term Client flags are stored by Party/Ledger Name in MySQL.
    const [longTermClients, setLongTermClients] = useState({});
    const [longTermClientSaving, setLongTermClientSaving] = useState({});

    const [expandedQuotation, setExpandedQuotation] = useState(null);
    const [expandedParty, setExpandedParty] = useState(null);
    const [expandedBilledParty, setExpandedBilledParty] = useState(null);

    const [showNoteModal, setShowNoteModal] = useState(false);
    const [selectedQuotation, setSelectedQuotation] = useState(null);
    const [followupHistory, setFollowupHistory] = useState([]);

    const [telecallerName, setTelecallerName] = useState("");
    const [followup, setFollowup] = useState({
        callDate: new Date().toISOString().split("T")[0],
        followupDate: "",
        telecaller: "",
        status: "",
        remarks: ""
    });


    // =====================================================
    // WHATSAPP QUOTATION TEMPLATES / BULK SELECTION
    // Templates are stored in the browser localStorage so they can
    // be created and edited without changing the React code.
    // =====================================================
    const DEFAULT_WHATSAPP_TEMPLATES = [
        {
            id: "quotation-ready",
            name: "Quotation Ready",
            message:
                "Hello {{customer_name}},\n\nGreetings from Everest Agencies!\n\nYour quotation {{quotation_no}} is ready.\n\nQuotation Amount: ₹{{quotation_amount}}\n\nPlease review the quotation and let us know if you need any changes or further assistance.\n\nThank you,\nEverest Agencies\nErnakulam"
        },
        {
            id: "quotation-followup",
            name: "Quotation Follow-up",
            message:
                "Hello {{customer_name}},\n\nGreetings from Everest Agencies!\n\nWe are following up regarding quotation {{quotation_no}} for ₹{{quotation_amount}}.\n\nPlease let us know if you have any questions or if any changes are required.\n\nThank you,\nEverest Agencies"
        }
    ];

    const [whatsappTemplates, setWhatsappTemplates] = useState(() => {
        try {
            const saved = localStorage.getItem("everest_whatsapp_quotation_templates");
            const parsed = saved ? JSON.parse(saved) : null;
            return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_WHATSAPP_TEMPLATES;
        } catch (error) {
            console.error("WhatsApp template load error:", error);
            return DEFAULT_WHATSAPP_TEMPLATES;
        }
    });

    const [selectedQuotationKeys, setSelectedQuotationKeys] = useState([]);
    const [showWhatsappModal, setShowWhatsappModal] = useState(false);
    const [showTemplateManager, setShowTemplateManager] = useState(false);
    const [editingWhatsappTemplate, setEditingWhatsappTemplate] = useState(null);
    const [selectedWhatsappTemplateId, setSelectedWhatsappTemplateId] = useState("quotation-ready");

    // NEW: "Next customer" queue. Each click opens exactly ONE WhatsApp chat,
    // so the browser popup blocker never stops it.
    const [whatsappQueue, setWhatsappQueue] = useState([]);
    const [whatsappQueueIndex, setWhatsappQueueIndex] = useState(0);
    const [whatsappQueueSkipped, setWhatsappQueueSkipped] = useState(0);

    // Quotation PDFs for the WhatsApp queue, by getWhatsappRowKey(row).
    // The next customer's PDF is built BEFORE the button is clicked, so one
    // click can download it and open WhatsApp (browsers only allow both
    // directly from a click). The user then attaches the downloaded PDF.
    const [whatsappPdfBlobs, setWhatsappPdfBlobs] = useState({});
    const [whatsappPdfStatus, setWhatsappPdfStatus] = useState({ key: "", loading: false, error: "" });
    const [whatsappPdfRetry, setWhatsappPdfRetry] = useState(0);
    const [pdfDownloading, setPdfDownloading] = useState("");

    useEffect(() => {
        try {
            localStorage.setItem(
                "everest_whatsapp_quotation_templates",
                JSON.stringify(whatsappTemplates)
            );
        } catch (error) {
            console.error("WhatsApp template save error:", error);
        }
    }, [whatsappTemplates]);


    useEffect(() => {
        // Load immediately when page opens
        fetchSalesOrders();
        fetchLongTermClients();
    }, []);


    useEffect(() => {
        // Refresh ONLY quotation follow-up information every 1 minute
        const interval = setInterval(() => {
            if (data.length > 0) {
                fetchFollowupPersons(data);
            }
        }, 60000);

        return () => {
            clearInterval(interval);
        };
    }, [data]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) return;

            try {

                // Get user name
                const userRef = doc(db, "Users", user.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const data = userSnap.data();

                    const name =
                        `${data.firstName || ""} ${data.lastName || ""}`.trim();

                    setTelecallerName(name);

                    setFollowup(prev => ({
                        ...prev,
                        telecaller: name
                    }));
                }

                // Check Admin role
                const roleRef = doc(db, "roles", user.uid);
                const roleSnap = await getDoc(roleRef);

                if (
                    roleSnap.exists() &&
                    roleSnap.data().role === "admin"
                ) {
                    setUserRole("admin");
                    return;
                }

                // Check Users collection
                if (userSnap.exists()) {
                    const role =
                        (userSnap.data().role || "").toLowerCase();

                    if (role === "ksebuser") {
                        setUserRole("ksebuser");
                    } else if (role === "sales") {
                        setUserRole("sales");
                    } else if (role === "user") {
                        setUserRole("user");
                    }
                }

            } catch (err) {
                console.error(err);
            }
        });

        return () => unsubscribe();
    }, []);


    useEffect(() => {
        const handleResize = () => {
            setScreenWidth(window.innerWidth);
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);


    const normalizePartyKey = (value) =>
        String(value || "")
            .replace(/\\s+/g, " ")
            .trim()
            .toLowerCase();

    const getPartyNameForLongTerm = (row) =>
        String(
            row?.party_name ||
            row?.PartyLedgerName ||
            ""
        ).trim();

    const fetchLongTermClients = async () => {
        try {
            const response = await apiFetch(
                `${API}/long_term_client.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        action: "list"
                    })
                }
            );

            const result = await response.json();

            if (result?.success && Array.isArray(result.data)) {
                const map = {};
                result.data.forEach((item) => {
                    const key = normalizePartyKey(item.party_ledger_name);
                    if (key) {
                        map[key] = Number(item.is_long_term_client) === 1;
                    }
                });
                setLongTermClients(map);
            }
        } catch (error) {
            console.error("Long-term client fetch error:", error);
        }
    };

    const isLongTermClient = (row) => {
        const key = normalizePartyKey(getPartyNameForLongTerm(row));
        return !!key && !!longTermClients[key];
    };

    const toggleLongTermClient = async (row) => {
        if (!isAdminUser) {
            alert("Only Admin can edit Long-Term Client.");
            return;
        }

        const partyName = getPartyNameForLongTerm(row);
        const key = normalizePartyKey(partyName);

        if (!key) {
            alert("Party/Ledger Name is empty.");
            return;
        }

        const nextValue = !isLongTermClient(row);

        setLongTermClientSaving((previous) => ({
            ...previous,
            [key]: true
        }));

        // Optimistic UI update.
        setLongTermClients((previous) => ({
            ...previous,
            [key]: nextValue
        }));

        try {
            const response = await apiFetch(
                `${API}/long_term_client.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        action: "update",
                        party_ledger_name: partyName,
                        is_long_term_client: nextValue ? 1 : 0,
                        is_admin: isAdminUser,
                        updated_by: telecallerName || "Admin"
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result?.success) {
                throw new Error(result?.message || "Failed to save Long-Term Client.");
            }
        } catch (error) {
            console.error("Long-term client save error:", error);

            // Roll back if save failed.
            setLongTermClients((previous) => ({
                ...previous,
                [key]: !nextValue
            }));

            alert(error?.message || "Failed to save Long-Term Client.");
        } finally {
            setLongTermClientSaving((previous) => {
                const next = { ...previous };
                delete next[key];
                return next;
            });
        }
    };


    const fetchSalesOrders = async () => {
        // Refresh should always return the quotation month selector to the current month.
        setSelectedMonth(getCurrentFinancialMonth());
        setLoading(true);

        try {

            const response = await apiFetch(
                `${API}/quotation_wise.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({})
                }
            );

            const result = await response.json();

            console.log(
                "Sales Order Wise API Response:",
                result
            );

            if (Array.isArray(result)) {
                setData(result);
                fetchFollowupPersons(result);
            } else if (
                result &&
                Array.isArray(result.data)
            ) {
                setData(result.data);
                fetchFollowupPersons(result.data);
            } else {
                console.error(
                    "Invalid API response:",
                    result
                );

                setData([]);
            }
        } catch (error) {
            console.error(
                "Sales Order fetch error:",
                error
            );

            setData([]);
        } finally {
            setLoading(false);
        }
    };


    const getQuotationNo = (row) => String(row?.quotation_no || row?.voucher_no || row?.VoucherNumber || "").trim();

    const getFollowupPerson = (record) => String(
        record?.telecaller || record?.followup_by || record?.followup_person ||
        record?.followupPerson || record?.user_name || record?.username || record?.name || ""
    ).trim();

    const getFollowupDateValue = (record) => {
        const value = record?.call_date || record?.callDate || record?.followup_date || record?.followupDate || record?.created_at || "";
        if (!value) return 0;
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
    };

    const normalizeDate = (value) => {
        if (!value) return "";
        const text = String(value).trim();
        const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
        const d = new Date(value);
        if (isNaN(d.getTime())) return "";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const fetchFollowupPersons = async (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) {
            setFollowupByQuotation({});
            setFollowupDateByQuotation({});
            setFollowupStatusByQuotation({});
            setFollowupRemarksByQuotation({});
            setLastSeenByPerson({});
            setTodayCallCountByPerson({});
            return;
        }

        const quotationNos = [
            ...new Set(
                rows
                    .map(getQuotationNo)
                    .filter(Boolean)
            )
        ];

        if (!quotationNos.length) {
            setFollowupByQuotation({});
            setFollowupDateByQuotation({});
            setFollowupStatusByQuotation({});
            setFollowupRemarksByQuotation({});
            setLastSeenByPerson({});
            setTodayCallCountByPerson({});
            return;
        }

        setFollowupLoading(true);

        try {
            const results = await Promise.all(
                quotationNos.map(async (quotationNo) => {
                    try {
                        const response = await apiFetch(
                            `${API}/get_quotation_followup.php`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({ quotationNo })
                            }
                        );

                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}`);
                        }

                        const result = await response.json();

                        const history = Array.isArray(result?.data)
                            ? result.data
                            : Array.isArray(result)
                                ? result
                                : [];

                        if (!history.length) {
                            return {
                                quotationNo,
                                person: "",
                                lastActive: "",
                                followupDate: "",
                                status: "",
                                remarks: ""
                            };
                        }

                        // Get latest follow-up
                        const latest = [...history].sort((a, b) => {
                            const aTime = new Date(a?.created_at || 0).getTime();
                            const bTime = new Date(b?.created_at || 0).getTime();
                            return bTime - aTime;
                        })[0];

                        const latestStatus = String(latest?.status || "").trim();

                        return {
                            quotationNo,

                            person: getFollowupPerson(latest),

                            // created_at is the actual time the telecaller made the follow-up.
                            // This is used as the telecaller's Last Active time.
                            lastActive: latest?.created_at || "",

                            // Lost is a closed status: never expose a next follow-up
                            // date for it, even if an older record accidentally contains one.
                            followupDate:
                                latestStatus.toLowerCase() === "lost"
                                    ? ""
                                    : (
                                        latest?.followup_date ||
                                        latest?.followupDate ||
                                        ""
                                    ),

                            status: latestStatus,

                            remarks:
                                latest?.remarks ||
                                "",
                            history: [...history].sort((a, b) => {
                                const aTime = new Date(a?.created_at || 0).getTime();
                                const bTime = new Date(b?.created_at || 0).getTime();
                                return bTime - aTime;
                            })
                        };

                    } catch (error) {
                        console.error(
                            `Follow-up fetch failed for ${quotationNo}:`,
                            error
                        );

                        return {
                            quotationNo,
                            person: "",
                            followupDate: "",
                            status: "",
                            remarks: "",
                            history: []
                        };
                    }
                })
            );

            const personMap = {};
            const dateMap = {};
            const statusMap = {};
            const remarksMap = {};
            const historyMap = {};

            // Telecaller -> latest created_at found in all loaded follow-up histories.
            const lastActiveMap = {};
            const todayCallCountMap = {};
            const today = normalizeDate(new Date());

            results.forEach(
                ({
                    quotationNo,
                    person,
                    lastActive,
                    followupDate,
                    status,
                    remarks,
                    history
                }) => {
                    personMap[quotationNo] = person;
                    dateMap[quotationNo] = followupDate;
                    statusMap[quotationNo] = status;
                    remarksMap[quotationNo] = remarks;
                    historyMap[quotationNo] = history || [];

                    if (person && lastActive) {
                        const currentTime = new Date(lastActive).getTime();
                        const existingTime = new Date(
                            lastActiveMap[person] || 0
                        ).getTime();

                        if (
                            !Number.isNaN(currentTime) &&
                            (Number.isNaN(existingTime) || currentTime > existingTime)
                        ) {
                            lastActiveMap[person] = lastActive;
                        }
                    }

                    // Also scan the complete history. The latest follow-up for this
                    // quotation may belong to another telecaller, while an older
                    // record may be the latest activity for a different telecaller.
                    (history || []).forEach((item) => {
                        const historyPerson = getFollowupPerson(item);
                        const historyCreatedAt = item?.created_at || "";

                        // Count calls made today for each telecaller.
                        const callDate = normalizeDate(
                            item?.call_date || item?.callDate || item?.created_at || ""
                        );
                        if (historyPerson && callDate === today) {
                            todayCallCountMap[historyPerson] =
                                (todayCallCountMap[historyPerson] || 0) + 1;
                        }

                        if (!historyPerson || !historyCreatedAt) return;

                        const currentTime = new Date(historyCreatedAt).getTime();
                        const existingTime = new Date(
                            lastActiveMap[historyPerson] || 0
                        ).getTime();

                        if (
                            !Number.isNaN(currentTime) &&
                            (Number.isNaN(existingTime) || currentTime > existingTime)
                        ) {
                            lastActiveMap[historyPerson] = historyCreatedAt;
                        }
                    });
                }
            );

            setFollowupByQuotation(personMap);
            setFollowupDateByQuotation(dateMap);
            setFollowupStatusByQuotation(statusMap);
            setFollowupRemarksByQuotation(remarksMap);
            setFollowupHistoryByQuotation(historyMap);
            setLastSeenByPerson(lastActiveMap);
            setTodayCallCountByPerson(todayCallCountMap);

        } catch (error) {
            console.error(
                "Follow-up persons fetch error:",
                error
            );

            setFollowupByQuotation({});
            setFollowupDateByQuotation({});
            setFollowupStatusByQuotation({});
            setFollowupRemarksByQuotation({});
            setLastSeenByPerson({});
            setTodayCallCountByPerson({});
        } finally {
            setFollowupLoading(false);
        }
    };

    const loadFollowupHistory = async (quotationNo) => {
        if (!quotationNo) {
            setFollowupHistory([]);
            return;
        }

        try {
            const response = await apiFetch(`${API}/get_quotation_followup.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quotationNo })
            });

            const result = await response.json();

            const history = Array.isArray(result?.data)
                ? result.data
                : Array.isArray(result)
                    ? result
                    : [];

            setFollowupHistory(history);
        } catch (error) {
            console.error("Follow-up history error:", error);
            setFollowupHistory([]);
        }
    };

    const getFinancialMonth = (date) => {
        if (!date) return "";

        const d = new Date(date);
        if (isNaN(d.getTime())) return "";

        const months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];

        return months[d.getMonth()];
    };

    const openNoteModal = (row, item, month) => {

        const quotationNo = item?.quotation_no || row?.quotation_no || row?.voucher_no || row?.VoucherNumber || "";

        setSelectedQuotation({
            party: row?.party_name || row?.PartyLedgerName || "",
            mobile: row?.mobile || "",

            // Mailing address
            mailingAddress:
                row?.mailing_address ||
                row?.EveInvMailingAdd ||
                "",

            // Phone number (walk-in customer number)
            walkinCustNo: String(row?.walkin_cust_no || "").trim(),

            month: month || row?.month || row?.Month || "",
            quotationNo,
            orderNo: item?.order_no || row?.order_no || row?.OrderNo || "",
            invoiceNo: item?.invoice_no || row?.invoice_no || "",
            status: item?.status || "Quotation Only"
        });
        console.log("Item:", item);
        console.log("Quotation No:", quotationNo);
        loadFollowupHistory(quotationNo);

        setFollowup({
            callDate: new Date().toISOString().split("T")[0],
            followupDate: "",
            telecaller: telecallerName,
            status: "",
            remarks: ""
        });

        setShowNoteModal(true);
    };


    const formatDate = (date) => {
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


    // Last Active is visible only to Admin users.
    const isAdminUser =
        String(userRole || "").trim().toLowerCase() === "admin";

    // Format SQL created_at for display beside the telecaller's name.
    const formatLastActive = (value) => {
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


    const getDateValue = (date) => {
        if (!date) return 0;

        const d = new Date(date);

        if (isNaN(d.getTime())) {
            return 0;
        }

        return d.getTime();
    };


    const formatAmount = (value) => {
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

    const cleanBilledParty = (value) => {
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


    // Detect order numbers used by more than one different quotation.
    const duplicateOrderNumbers = useMemo(() => {
        const map = {};

        data.forEach((row) => {
            const orderNo = String(row?.order_no || row?.OrderNo || "").trim();
            const quotationNo = getQuotationNo(row);

            if (!orderNo || !quotationNo) return;

            const key = orderNo.toLowerCase();

            if (!map[key]) {
                map[key] = new Set();
            }

            map[key].add(quotationNo.toLowerCase());
        });

        return new Set(
            Object.entries(map)
                .filter(([, quotations]) => quotations.size > 1)
                .map(([orderNo]) => orderNo)
        );
    }, [data]);

    const isDuplicateOrderNo = (row) => {
        const orderNo = String(row?.order_no || row?.OrderNo || "").trim();
        return !!orderNo && duplicateOrderNumbers.has(orderNo.toLowerCase());
    };

    const getCustomerType = (row) => {
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

    const getStatus = (row) => {
        const quotationNo = getQuotationNo(row);
        const followupStatus = String(
            followupStatusByQuotation[quotationNo] || ""
        ).trim().toLowerCase();

        if (followupStatus === "lost") return "lost";

        const status = String(row.status || "").trim().toLowerCase();
        if (status === "billed" || Number(row.billed_amount || 0) > 0) {
            return "billed";
        }
        return "quotation";
    };

    const getStatusText = (row) => {
        const status = getStatus(row);
        if (status === "lost") return "Lost";
        if (status === "billed") return "Billed";
        return "Quotation Only";
    };

    const getStatusColor = (row) => {
        const status = getStatus(row);
        if (status === "billed") return "#198754";
        if (status === "lost") return "#dc2626";
        return "#dc3545";
    };


    const followupCounts = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const today = normalizeDate(now);

        let noFollowup = 0;
        let due = 0;
        let todayCount = 0;

        const isAdmin =
            String(userRole || '').trim().toLowerCase() === 'admin';

        data.forEach((row) => {
            // Current-month quotation only.
            const rowDate = normalizeDate(
                row.date ||
                row.enquiry_date ||
                row.quotation_date ||
                row.created_date ||
                ''
            );

            if (!rowDate) return;

            const parts = rowDate.split('-').map(Number);
            if (parts.length !== 3) return;

            const [year, month] = parts;
            if (year !== currentYear || month !== currentMonth) return;

            // Billed quotations are excluded from follow-up reminders.
            const rowStatus = getStatus(row);
            if (rowStatus === 'billed') return;

            const quotationNo = getQuotationNo(row);
            const followupPerson = String(
                followupByQuotation[quotationNo] || ''
            ).trim().toLowerCase();

            // Use exactly the same ownership rule as the quick filter.
            if (!isAdmin) {
                const loggedInUser = String(
                    telecallerName || ''
                ).trim().toLowerCase();

                if (!loggedInUser || followupPerson !== loggedInUser) {
                    return;
                }
            }

            // ONLY Next Follow-up Date controls these three counts.
            const nextFollowupDate = normalizeDate(
                followupDateByQuotation[quotationNo] || ''
            );

            // No Next Follow-up Date = No Follow-up.
            if (!nextFollowupDate) {
                noFollowup++;
                return;
            }

            // Next Follow-up before today = Due. Lost is not counted as Due.
            if (nextFollowupDate < today) {
                if (getStatus(row) === 'lost') return;
                due++;
                return;
            }

            // Next Follow-up exactly today = Today's Follow-up.
            if (nextFollowupDate === today) {
                todayCount++;
            }
        });

        return {
            noFollowup,
            due,
            today: todayCount
        };
    }, [
        data,
        followupDateByQuotation,
        followupByQuotation,
        userRole,
        telecallerName
    ]);

    const filteredData = useMemo(() => {
        const search = String(searchTerm || '').trim().toLowerCase();
        let result = [...data];

        if (search) {
            // Search the COMPLETE quotation record, including nested items and
            // every field returned by the API.
            // (Fixed: regex was /\\D/ which matched a literal "\D"; now /\D/.)
            const normalizedSearch = search.replace(/\D/g, "");

            result = result.filter((row) => {
                const quotationNo = String(
                    row?.quotation_no || row?.voucher_no || row?.VoucherNumber || ""
                ).toLowerCase();

                const quotationNoKey = getQuotationNo(row);

                const followupRecord = {
                    person: followupByQuotation[quotationNoKey] || "",
                    date: followupDateByQuotation[quotationNoKey] || "",
                    status: followupStatusByQuotation[quotationNoKey] || "",
                    remarks: followupRemarksByQuotation[quotationNoKey] || "",
                    history: followupHistoryByQuotation[quotationNoKey] || []
                };

                // Search every field in the complete API row and follow-up history.
                const fullText = (
                    JSON.stringify(row ?? {}) + JSON.stringify(followupRecord)
                ).toLowerCase();

                if (fullText.includes(search)) {
                    return true;
                }

                // Mobile/number search: ignore spaces, +91, hyphens, brackets, etc.
                if (normalizedSearch) {
                    const allDigits = (
                        JSON.stringify(row ?? {}) + JSON.stringify(followupRecord)
                    ).replace(/\D/g, "");

                    if (allDigits.includes(normalizedSearch)) {
                        return true;
                    }
                }

                return quotationNo.includes(search);
            });
        }

        if (statusFilter !== 'all') {
            result = result.filter((row) => getStatus(row) === statusFilter);
        }

        if (customerTypeFilter === "duplicates") {
            result = result.filter((row) => isDuplicateOrderNo(row));
        } else if (customerTypeFilter !== "all") {
            result = result.filter(
                (row) => getCustomerType(row) === customerTypeFilter
            );
        }

        if (followupFilter !== 'all') {
            result = result.filter((row) => {
                const person = String(
                    followupByQuotation[getQuotationNo(row)] || ''
                ).trim();

                if (followupFilter === 'none') {
                    return person === '';
                }

                return person.toLowerCase() ===
                    String(followupFilter).toLowerCase();
            });
        }

        if (followupDateFilter) {
            result = result.filter((row) => {
                const quotationNo = getQuotationNo(row);
                const followupDate =
                    followupDateByQuotation[quotationNo] || '';

                return (
                    followupDate &&
                    normalizeDate(followupDate) === followupDateFilter
                );
            });
        }

        // =====================================================
        // FOLLOW-UP QUICK FILTER
        // =====================================================
        if (followupQuickFilter !== "all") {
            const today = normalizeDate(new Date());
            const normalizedRole = String(userRole || "").trim().toLowerCase();
            const isAdmin = normalizedRole === "admin";
            const loggedInUser = String(telecallerName || "").trim().toLowerCase();

            const currentDate = new Date();
            const weekStart = new Date(currentDate);
            weekStart.setDate(currentDate.getDate() - 6);
            const weekStartDate = normalizeDate(weekStart);

            result = result.filter((row) => {
                const quotationNo = getQuotationNo(row);
                const followupDate = normalizeDate(
                    followupDateByQuotation[quotationNo] || ""
                );
                const followupPerson = String(
                    followupByQuotation[quotationNo] || ""
                ).trim().toLowerCase();

                // Billed quotations are excluded from follow-up filters.
                const rowStatus = getStatus(row);
                if (rowStatus === "billed") return false;

                // No Follow-ups = no follow-up person AND no next follow-up date.
                if (followupQuickFilter === "none") {
                    return !followupDate && !followupPerson;
                }

                if (!followupDate) return false;

                // Admin sees all users. Other users see only their own follow-ups.
                if (
                    !isAdmin &&
                    (!loggedInUser || followupPerson !== loggedInUser)
                ) {
                    return false;
                }

                // Exact date selected from the Follow-up Filter dropdown.
                if (String(followupQuickFilter).startsWith("date:")) {
                    const selectedFollowupDate = normalizeDate(
                        String(followupQuickFilter).replace("date:", "")
                    );
                    return followupDate === selectedFollowupDate;
                }

                if (followupQuickFilter === "today") {
                    return followupDate === today;
                }

                if (followupQuickFilter === "week") {
                    return followupDate >= weekStartDate && followupDate <= today;
                }

                // All overdue follow-ups before today. Lost must NOT appear.
                if (followupQuickFilter === "due") {
                    if (rowStatus === "lost") return false;
                    return followupDate < today;
                }

                return true;
            });
        }

        // =====================================================
        // SELECTED QUOTATION MONTH
        // =====================================================
        if (
            selectedMonth !== "all" &&
            !followupDateFilter &&
            !String(followupQuickFilter).startsWith("date:") &&
            followupQuickFilter !== "due"
        ) {
            result = result.filter((row) => {
                if (!row.date) return false;

                const d = new Date(row.date);

                if (isNaN(d.getTime())) return false;

                return (
                    d.getMonth() + 1 === Number(selectedMonth)
                );
            });
        }

        // =====================================================
        // FINAL SORT - only ONE sort is executed.
        // =====================================================
        if (quotationSort === 'highest' || quotationSort === 'lowest') {
            result.sort((a, b) => {
                const amountA =
                    parseFloat(
                        String(a.quotation_amount ?? 0)
                            .replace(/[₹,\s]/g, '')
                    ) || 0;

                const amountB =
                    parseFloat(
                        String(b.quotation_amount ?? 0)
                            .replace(/[₹,\s]/g, '')
                    ) || 0;

                return quotationSort === 'highest'
                    ? amountB - amountA
                    : amountA - amountB;
            });
        } else {
            result.sort((a, b) => {
                const dateA = getDateValue(a.date);
                const dateB = getDateValue(b.date);

                if (dateA !== dateB) {
                    return sortOrder === 'newest'
                        ? dateB - dateA
                        : dateA - dateB;
                }

                const quotationA = String(
                    a.quotation_no || a.voucher_no || ''
                );
                const quotationB = String(
                    b.quotation_no || b.voucher_no || ''
                );

                return sortOrder === 'newest'
                    ? quotationB.localeCompare(quotationA, undefined, {
                        numeric: true,
                        sensitivity: 'base'
                    })
                    : quotationA.localeCompare(quotationB, undefined, {
                        numeric: true,
                        sensitivity: 'base'
                    });
            });
        }

        return result;
    }, [
        data,
        searchTerm,
        statusFilter,
        customerTypeFilter,
        selectedMonth,
        sortOrder,
        followupFilter,
        followupByQuotation,
        followupDateFilter,
        followupDateByQuotation,
        followupStatusByQuotation,
        followupRemarksByQuotation,
        followupHistoryByQuotation,
        quotationSort,
        followupQuickFilter,
        telecallerName,
        userRole,
        todayCallCountByPerson
    ]);


    // =====================================================
    // DISPLAY GROUPING: PARTY WISE / DATE WISE
    // =====================================================
    const groupedDisplayData = useMemo(() => {
        const rows = [...filteredData];

        const getSafeDate = (value) => {
            const d = new Date(value);
            return Number.isNaN(d.getTime()) ? null : d;
        };

        const getMonthKey = (value) => {
            const d = getSafeDate(value);
            if (!d) return "9999-99";
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        };

        const getPartyKey = (row) =>
            String(row.party_name || row.PartyLedgerName || "Unknown Party")
                .trim()
                .replace(/\s+/g, " ")
                .toLowerCase();

        const getDateKey = (value) => {
            const d = getSafeDate(value);
            if (!d) return "9999-99-99";
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };

        rows.sort((a, b) => {
            // Keep the existing amount sorting behavior when explicitly selected.
            if (quotationSort === "highest" || quotationSort === "lowest") {
                const amountA =
                    parseFloat(String(a.quotation_amount ?? 0).replace(/[₹,\s]/g, "")) || 0;
                const amountB =
                    parseFloat(String(b.quotation_amount ?? 0).replace(/[₹,\s]/g, "")) || 0;

                return quotationSort === "highest"
                    ? amountB - amountA
                    : amountA - amountB;
            }

            const monthA = getMonthKey(a.date);
            const monthB = getMonthKey(b.date);
            const monthCompare = monthA.localeCompare(monthB);
            if (monthCompare !== 0) {
                return sortOrder === "newest" ? -monthCompare : monthCompare;
            }

            if (viewMode === "date") {
                // DATE WISE: same date stays together, then quotation number.
                const dateA = getDateKey(a.date);
                const dateB = getDateKey(b.date);
                const dateCompare = dateA.localeCompare(dateB);
                if (dateCompare !== 0) {
                    return sortOrder === "newest" ? -dateCompare : dateCompare;
                }
            } else {
                // PARTY WISE: same party stays together, then date.
                const partyA = getPartyKey(a);
                const partyB = getPartyKey(b);
                const partyCompare = partyA.localeCompare(partyB, undefined, {
                    sensitivity: "base"
                });
                if (partyCompare !== 0) return partyCompare;

                const dateA = getSafeDate(a.date);
                const dateB = getSafeDate(b.date);
                const timeA = dateA ? dateA.getTime() : 0;
                const timeB = dateB ? dateB.getTime() : 0;
                if (timeA !== timeB) {
                    return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
                }
            }

            const quotationA = String(
                a.quotation_no || a.voucher_no || a.VoucherNumber || ""
            );
            const quotationB = String(
                b.quotation_no || b.voucher_no || b.VoucherNumber || ""
            );

            return quotationA.localeCompare(quotationB, undefined, {
                numeric: true,
                sensitivity: "base"
            });
        });

        // Assign one background color to the complete active group.
        let previousGroupKey = null;
        let groupColorIndex = 0;

        rows.forEach((row) => {
            const monthKey = getMonthKey(row.date);
            const groupValue =
                viewMode === "date"
                    ? getDateKey(row.date)
                    : getPartyKey(row);
            const groupKey = `${monthKey}__${groupValue}`;

            if (groupKey !== previousGroupKey) {
                groupColorIndex += 1;
                previousGroupKey = groupKey;
            }

            row.__partyGroupColor =
                groupColorIndex % 2 === 1
                    ? "#f7fbf8"
                    : "#f4f7ff";
        });

        return rows;
    }, [filteredData, quotationSort, sortOrder, viewMode]);

    const getItemGstTotal = (items) => {
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

    const getQuotationTotalWithGst = (row) => {
        const explicit = Number(row?.quotation_amount_with_gst);
        if (Number.isFinite(explicit) && explicit !== 0) return explicit;

        const taxable = Number(row?.quotation_amount || 0);
        const gst = getItemGstTotal(row?.items);
        return Math.round((taxable + gst) + Number.EPSILON);
    };

    const getBilledAmountWithGst = (row) => {
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

    const totals = useMemo(() => {
        let quotationAmount = 0;
        let quotationAmountWithGst = 0;
        let billedAmount = 0;
        let quotationCount = 0;
        let billedCount = 0;
        let lostCount = 0;

        filteredData.forEach((row) => {
            quotationAmount += Number(
                row.quotation_amount || 0
            );
            quotationAmountWithGst += Number(
                row.quotation_amount_with_gst ?? row.quotation_amount ?? 0
            );

            billedAmount += getBilledAmountWithGst(row);

            const status = getStatus(row);

            if (status === "billed") {
                billedCount++;
            } else if (status === "lost") {
                lostCount++;
            } else {
                quotationCount++;
            }
        });

        return {
            quotationAmount,
            quotationAmountWithGst,
            billedAmount,
            quotationCount,
            billedCount,
            lostCount,
            totalCount: filteredData.length
        };
    }, [filteredData]);


    const exportToExcel = () => {
        if (!filteredData.length) {
            alert(
                "No data available to export."
            );
            return;
        }

        const excelData = [];

        filteredData.forEach(
            (row, index) => {
                excelData.push({
                    "S.No": index + 1,

                    Date: formatDate(
                        row.date
                    ),

                    "Quotation No":
                        row.quotation_no ||
                        row.voucher_no ||
                        "",

                    "Sales Order No":
                        row.order_no || "",
                    "Party Name":
                        row.party_name ||
                        row.PartyLedgerName ||
                        "",

                    "Long-Term Client":
                        isLongTermClient(row) ? "Yes" : "No",

                    "Ledger Group":
                        row.ledger_group ||
                        row._LedGroup ||
                        "",

                    "Mobile":
                        row.mobile || "",

                    "Purchase Contact":
                        row.purchase_contact ||
                        "",

                    "Invoice No":
                        row.invoice_no || "",

                    "Quotation Amount":
                        Number(
                            row.quotation_amount ||
                            0
                        ),

                    "Billed Amount":
                        Number(
                            row.billed_amount ||
                            0
                        ),

                    "Billed Party":
                        row.billed_party ||
                        "",

                    "Follow-up By":
                        followupByQuotation[getQuotationNo(row)] || "No Follow Up",

                    Status:
                        getStatusText(row),

                    Description:
                        row.description ||
                        ""
                });
            }
        );

        const worksheet =
            XLSX.utils.json_to_sheet(
                excelData
            );

        const workbook =
            XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Quotation List"
        );

        worksheet["!cols"] = [
            { wch: 7 },
            { wch: 15 },
            { wch: 30 },
            { wch: 30 },
            { wch: 16 },
            { wch: 35 },
            { wch: 22 },
            { wch: 18 },
            { wch: 25 },
            { wch: 25 },
            { wch: 18 },
            { wch: 18 },
            { wch: 30 },
            { wch: 25 },
            { wch: 40 }
        ];

        XLSX.writeFile(
            workbook,
            "Quotation_SalesOrder_Wise.xlsx"
        );
    };


    const clearFilters = () => {
        setSearchTerm("");
        setStatusFilter("all");
        setCustomerTypeFilter("all");
        setSelectedMonth(getCurrentFinancialMonth());
        setSortOrder("newest");
        setFollowupFilter("all");
        setFollowupDateFilter("");
        setQuotationSort("default");
        setViewMode("party");
        setFollowupQuickFilter("all");
    };


    const toggleQuotation = (quotationNo) => {
        setExpandedQuotation(
            (previous) =>
                previous === quotationNo
                    ? null
                    : quotationNo
        );
    };


    const getItemTotal = (items) => {
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
    const getWhatsappRowKey = (row) => {
        const quotationNo = getQuotationNo(row);
        const party = String(row?.party_name || row?.PartyLedgerName || "").trim();
        const mobile = String(row?.mobile || row?.purchase_contact || row?.phone || row?.contact_no || "").trim();
        const date = String(row?.date || "").trim();
        const orderNo = String(row?.order_no || row?.OrderNo || "").trim();
        return [quotationNo, party, mobile, date, orderNo].join("||");
    };

    const getWhatsappMobile = (mobile) => {
        const digits = String(mobile || "").replace(/\D/g, "");
        if (!digits) return "";
        if (digits.length === 10) return `91${digits}`;
        if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
        if (digits.length === 12 && digits.startsWith("91")) return digits;
        return digits;
    };

    // WhatsApp greeting/customer name should use Tally Mailing Name.
    const getWhatsappCustomerName = (row) =>
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
    const getWhatsappRowMobile = (row) =>
        String(row?.walkin_cust_no || "").trim();

    const getWhatsappMessage = (template, row) => {
        if (!template) return "";

        const quotationAmount = getQuotationTotalWithGst(row);
        const replacements = {
            customer_name: getWhatsappCustomerName(row),
            quotation_no: getQuotationNo(row),
            quotation_amount: formatAmount(quotationAmount),
            quotation_date: formatDate(row?.date || row?.quotation_date || ""),
            sales_order_no: String(row?.order_no || row?.OrderNo || "").trim(),
            mobile: String(getWhatsappRowMobile(row)).trim(),
            sales_person: String(
                row?.sales_person || row?.salesPerson || row?.followup_by ||
                followupByQuotation[getQuotationNo(row)] || ""
            ).trim(),
            invoice_no: String(row?.invoice_no || "").trim(),
            enquiry_no: String(row?.enquiry_no || "").trim()
        };

        return String(template.message || "").replace(
            /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
            (match, key) =>
                Object.prototype.hasOwnProperty.call(replacements, key)
                    ? replacements[key]
                    : match
        );
    };

    // Save an already built PDF. Synchronous, so it still counts as part of
    // the user's click.
    const saveBlob = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    const handleDownloadQuotationPdf = async (row) => {
        const quotationNo = getQuotationNo(row);
        setPdfDownloading(quotationNo);
        try {
            await downloadQuotationPdf(row);
        } catch (error) {
            console.error("Quotation PDF error:", error);
            alert("Unable to create the quotation PDF.");
        } finally {
            setPdfDownloading("");
        }
    };

    // Uses ALL loaded rows (not only the currently filtered ones), so a customer
    // ticked earlier is still included after the search/filters are changed.
    const getSelectedWhatsappRows = () =>
        data.filter((row) => selectedQuotationKeys.includes(getWhatsappRowKey(row)));

    const toggleWhatsappSelection = (row) => {
        const key = getWhatsappRowKey(row);
        setSelectedQuotationKeys((previous) =>
            previous.includes(key)
                ? previous.filter((item) => item !== key)
                : [...previous, key]
        );
    };

    const toggleSelectAllWhatsapp = () => {
        const validRows = filteredData;
        const validKeys = validRows.map(getWhatsappRowKey);
        const allSelected = validKeys.length > 0 && validKeys.every((key) => selectedQuotationKeys.includes(key));

        setSelectedQuotationKeys((previous) => {
            if (allSelected) {
                return previous.filter((key) => !validKeys.includes(key));
            }
            return [...new Set([...previous, ...validKeys])];
        });
    };

    const clearWhatsappSelection = () => setSelectedQuotationKeys([]);

    const createWhatsappTemplate = () => {
        const newTemplate = {
            id: `template-${Date.now()}`,
            name: "New Template",
            message: "Hello {{customer_name}},\n\nYour quotation {{quotation_no}} is ready.\n\nThank you,\nEverest Agencies"
        };
        setWhatsappTemplates((previous) => [...previous, newTemplate]);
        setEditingWhatsappTemplate({ ...newTemplate });
    };

    const saveWhatsappTemplate = () => {
        if (!editingWhatsappTemplate?.name?.trim()) {
            alert("Please enter a template name.");
            return;
        }
        if (!editingWhatsappTemplate?.message?.trim()) {
            alert("Please enter the WhatsApp message.");
            return;
        }

        setWhatsappTemplates((previous) => {
            const exists = previous.some((item) => item.id === editingWhatsappTemplate.id);
            return exists
                ? previous.map((item) =>
                    item.id === editingWhatsappTemplate.id
                        ? { ...editingWhatsappTemplate, name: editingWhatsappTemplate.name.trim() }
                        : item
                )
                : [...previous, { ...editingWhatsappTemplate, name: editingWhatsappTemplate.name.trim() }];
        });
        setEditingWhatsappTemplate(null);
    };

    const deleteWhatsappTemplate = (templateId) => {
        if (whatsappTemplates.length <= 1) {
            alert("At least one WhatsApp template must remain.");
            return;
        }
        const template = whatsappTemplates.find((item) => item.id === templateId);
        if (!window.confirm(`Delete template "${template?.name || "this template"}"?`)) return;
        setWhatsappTemplates((previous) => previous.filter((item) => item.id !== templateId));
        if (selectedWhatsappTemplateId === templateId) {
            const next = whatsappTemplates.find((item) => item.id !== templateId);
            if (next) setSelectedWhatsappTemplateId(next.id);
        }
    };

    const openWhatsappForQuotation = (row, message) => {
        const number = getWhatsappMobile(getWhatsappRowMobile(row));
        if (!number) return false;
        // Open the WhatsApp Desktop/App directly (same method as the WhatsApp icon),
        // with the personalized message pre-filled.
        window.location.href =
            `whatsapp://send?phone=${number}&text=${encodeURIComponent(message || "")}`;
        return true;
    };

    // -----------------------------------------------------
    // NEW: "Next customer" queue
    // 1) "Start" builds the queue from the selected quotations.
    // 2) Each click on "Open next" opens ONE WhatsApp chat.
    //    Because every tab is opened directly from a user click,
    //    browsers never block it as a popup.
    // -----------------------------------------------------
    const startWhatsappQueue = () => {
        const rows = getSelectedWhatsappRows();
        const template = whatsappTemplates.find((item) => item.id === selectedWhatsappTemplateId);

        if (!rows.length) {
            alert("Please select at least one customer.");
            return;
        }
        if (!template) {
            alert("Please select a WhatsApp template.");
            return;
        }

        // Resolve each selected quotation back to the original API row so we use
        // the exact walkin_cust_no field used by the existing WhatsApp icon.
        const resolvedRows = rows.map((row) => {
            const quotationNo = getQuotationNo(row);
            const originalRow = data.find((item) => getQuotationNo(item) === quotationNo);
            return originalRow || row;
        });

        const rowsWithWhatsapp = resolvedRows.filter((row) =>
            getWhatsappMobile(getWhatsappRowMobile(row))
        );

        if (!rowsWithWhatsapp.length) {
            alert("None of the selected quotations have a valid mobile number.");
            return;
        }

        setWhatsappQueueSkipped(resolvedRows.length - rowsWithWhatsapp.length);
        setWhatsappQueue(rowsWithWhatsapp);
        setWhatsappQueueIndex(0);
    };

    // Build the PDF of the customer that is next in the queue.
    useEffect(() => {
        const row = whatsappQueue[whatsappQueueIndex];
        if (!showWhatsappModal || !row) return;

        const key = getWhatsappRowKey(row);
        if (whatsappPdfBlobs[key]) return;

        let cancelled = false;
        setWhatsappPdfStatus({ key, loading: true, error: "" });

        getQuotationPdfBlob(row)
            .then((blob) => {
                if (cancelled) return;
                setWhatsappPdfBlobs((previous) => ({ ...previous, [key]: blob }));
                setWhatsappPdfStatus({ key, loading: false, error: "" });
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("Quotation PDF error:", error);
                setWhatsappPdfStatus({
                    key,
                    loading: false,
                    error: error?.message || "Unable to create the quotation PDF."
                });
            });

        return () => {
            cancelled = true;
        };
    }, [showWhatsappModal, whatsappQueue, whatsappQueueIndex, whatsappPdfRetry]);

    // Downloads the customer's quotation PDF (to attach in WhatsApp) and opens
    // the chat. withoutPdf: open the chat even though the PDF failed.
    const openNextWhatsapp = (withoutPdf = false) => {
        const template = whatsappTemplates.find((item) => item.id === selectedWhatsappTemplateId);
        const row = whatsappQueue[whatsappQueueIndex];
        if (!row || !template) return;

        const pdfBlob = whatsappPdfBlobs[getWhatsappRowKey(row)];
        if (!pdfBlob && !withoutPdf) return;

        if (pdfBlob) saveBlob(pdfBlob, getQuotationPdfFileName(row));
        openWhatsappForQuotation(row, getWhatsappMessage(template, row));
        setWhatsappQueueIndex((previous) => previous + 1);
    };

    const closeWhatsappModal = () => {
        setShowWhatsappModal(false);
        setWhatsappQueue([]);
        setWhatsappQueueIndex(0);
        setWhatsappQueueSkipped(0);
        setWhatsappPdfStatus({ key: "", loading: false, error: "" });
        setWhatsappPdfBlobs({});
    };

    // Open WhatsApp Desktop/App for the customer's mobile number.
    const openWhatsApp = (mobile) => {
        const digits = String(mobile || "").replace(/\D/g, "");
        if (!digits) return;

        let whatsappNumber = digits;

        if (whatsappNumber.length === 10) {
            whatsappNumber = `91${whatsappNumber}`;
        } else if (
            whatsappNumber.length === 11 &&
            whatsappNumber.startsWith("0")
        ) {
            whatsappNumber = `91${whatsappNumber.slice(1)}`;
        }

        // Open WhatsApp Desktop/App
        window.location.href = `whatsapp://send?phone=${whatsappNumber}`;
    };

    const renderBanner = () => <Banner />;


    const thStyle = {
        padding: "8px 8px",
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
        padding: screenWidth < 700 ? "4px" : screenWidth < 1100 ? "5px" : "7px 8px",
        border: "1px solid #ddd",
        verticalAlign: "middle",
        background: "var(--quotation-party-bg, #fff)"
    };

    const labelStyle = { padding: "9px 12px", background: "#f5f5f5", fontWeight: "600", color: "#444", borderRight: "1px solid #ddd" };
    const valueStyle = { padding: "9px 12px", color: "#222", wordBreak: "break-word" };
    const formRowStyle = { display: "grid", gridTemplateColumns: "130px 1fr", alignItems: "center", columnGap: "12px", marginBottom: "12px" };
    const formLabelStyle = { fontWeight: "600", color: "#333" };
    const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #ccc", borderRadius: "5px", fontSize: "14px", outline: "none", background: "#fff" };


    const getCurrentWeekFollowupOptions = () => {
        const today = new Date();
        const options = [];

        // Last 7 days including today.
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);

            options.push({
                value: normalizeDate(date),
                label: `${i === 0 ? "Today" : date.toLocaleDateString("en-US", {
                    weekday: "long"
                })} — ${date.toLocaleDateString("en-US", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                })}`
            });
        }

        return options;
    };

    return (
        <>
            <style>{`
                html, body, #root {
                    overflow: hidden;
                }

                @keyframes followupBlink {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.35; transform: scale(0.98); }
                }

                @keyframes followupTicker {
                    from {
                        transform: translateX(0);
                    }
                    to {
                        transform: translateX(-100%);
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


                {/* RUNNING FOLLOW-UP NOTIFICATION */}
                <div
                    style={{
                        width: "100%",
                        height: "34px",
                        overflow: "hidden",
                        background: "#fff8e1",
                        border: "1px solid #ffc107",
                        borderRadius: "5px",
                        marginBottom: "8px",
                        display: "flex",
                        alignItems: "center",
                        boxSizing: "border-box"
                    }}
                >
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                            minWidth: "max-content",
                            paddingLeft: "100%",
                            animation: "followupTicker 35s linear infinite",
                            fontSize: screenWidth < 700 ? "12px" : "14px",
                            fontWeight: "700",
                            color: "#856404"
                        }}
                    >
                        🚨 CURRENT MONTH FOLLOW-UP REMINDER
                        <span style={{ marginLeft: "45px" }}>
                            ⚪ New Follow-ups: {followupCounts.noFollowup}
                        </span>
                        <span style={{ marginLeft: "45px" }}>
                            🔴 Due Follow-ups: {followupCounts.due} &nbsp;&nbsp;&nbsp; 🟠 Today's Follow-ups: {followupCounts.today}
                        </span>
                        <span style={{ marginLeft: "45px" }}>
                            📌 Please complete your due follow-ups.
                        </span>
                        <span style={{ marginLeft: "60px" }}>
                            🚨 CURRENT MONTH FOLLOW-UP REMINDER
                        </span>
                        <span style={{ marginLeft: "45px" }}>
                            ⚪ New Follow-ups: {followupCounts.noFollowup}
                        </span>
                        <span style={{ marginLeft: "45px" }}>
                            🔴 Due Follow-ups: {followupCounts.due} &nbsp;&nbsp;&nbsp; 🟠 Today's Follow-ups: {followupCounts.today}
                        </span>
                    </div>
                </div>

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
                    {/* TITLE */}

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
                            {followupQuickFilter.startsWith("date:")
                                ? (() => {
                                    const selectedDate =
                                        followupQuickFilter.replace("date:", "");

                                    const d = new Date(
                                        `${selectedDate}T00:00:00`
                                    );

                                    const isToday =
                                        selectedDate === normalizeDate(new Date());

                                    const dateText = d.toLocaleDateString("en-US", {
                                        weekday: "long",
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric"
                                    });

                                    return `${isToday ? "Today" : dateText} Follow-ups`;
                                })()
                                : followupQuickFilter === "due"
                                    ? "All Due Follow-ups"
                                    : viewMode === "date"
                                        ? "Quotations In Date Wise"
                                        : "Quotations In Party Wise"}
                        </h2>


                        {/* PARTY WISE / DATE WISE TOGGLE */}
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "3px",
                                background: "#eef3f0",
                                border: "1px solid #c8d8cf",
                                borderRadius: "8px",
                                gap: "3px",
                                order: screenWidth < 900 ? 2 : 1,
                                marginLeft: screenWidth < 900 ? 0 : "auto"
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setViewMode("party")}
                                style={{
                                    height: "30px",
                                    padding: "0 13px",
                                    border: "none",
                                    borderRadius: "6px",
                                    background: viewMode === "party" ? "#05693a" : "transparent",
                                    color: viewMode === "party" ? "#fff" : "#333",
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    cursor: "pointer"
                                }}
                            >
                                Party Wise
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode("date")}
                                style={{
                                    height: "30px",
                                    padding: "0 13px",
                                    border: "none",
                                    borderRadius: "6px",
                                    background: viewMode === "date" ? "#05693a" : "transparent",
                                    color: viewMode === "date" ? "#fff" : "#333",
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    cursor: "pointer"
                                }}
                            >
                                Date Wise
                            </button>
                        </div>

                        {/* The "Export Excel" button was commented out in the original.
                            exportToExcel is kept above so it can be re-enabled. */}
                    </div>

                    {/* =================================================
                        FILTER BAR
                    ================================================== */}

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
                        {/* SEARCH */}

                        <input
                            type="text"
                            placeholder="Search anything — Mobile / Party / Item / Quotation / Invoice..."
                            value={searchTerm}
                            onChange={(e) =>
                                setSearchTerm(
                                    e.target.value
                                )
                            }
                            style={{
                                width:
                                    screenWidth <
                                        700
                                        ? "100%"
                                        : "320px",
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

                        {/* STATUS */}

                        <select
                            value={
                                statusFilter
                            }
                            onChange={(e) =>
                                setStatusFilter(
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
                            <option value="all">All Status</option>
                            <option value="quotation">Quotation Only</option>
                            <option value="lost">Lost</option>
                            <option value="billed">Billed</option>
                        </select>

                        {/* CUSTOMER TYPE FILTER */}
                        <select
                            value={customerTypeFilter}
                            onChange={(e) =>
                                setCustomerTypeFilter(e.target.value)
                            }
                            style={{
                                height: "36px",
                                minWidth: "105px",
                                padding: "0 12px",
                                border: "1px solid #ccc",
                                borderRadius: "6px",
                                background: "#fff",
                                color: "#333",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: "700",
                                outline: "none"
                            }}
                        >
                            <option value="all">All (Quotation)</option>
                            <option value="b2b">B2B</option>
                            <option value="b2c">B2C</option>
                            <option value="other">Others</option>
                            <option value="duplicates">Duplicates</option>
                        </select>

                        {/* FOLLOW-UP BY - CUSTOM DROPDOWN FOR PERFECT ALIGNMENT */}
                        {(() => {
                            // Build the coordinator list from ALL follow-up history,
                            // not only the latest follow-up of each quotation.
                            const historyNames = Object.values(followupHistoryByQuotation)
                                .flatMap((history) => Array.isArray(history) ? history : [])
                                .map((item) => getFollowupPerson(item))
                                .map((name) => String(name).trim())
                                .filter(Boolean);

                            // Show only ACTIVE follow-up persons (activity in last 7 days,
                            // taken from created_at through lastSeenByPerson).
                            const activeCutoff = new Date();
                            activeCutoff.setDate(activeCutoff.getDate() - 7);

                            const allNames = [
                                ...new Set([
                                    ...Object.values(followupByQuotation)
                                        .map((name) => String(name).trim())
                                        .filter(Boolean),
                                    ...historyNames
                                ])
                            ];

                            const names = allNames
                                .filter((name) => {
                                    const lastActive = lastSeenByPerson[name];
                                    if (!lastActive) return false;

                                    const activeTime = new Date(lastActive).getTime();
                                    return (
                                        Number.isFinite(activeTime) &&
                                        activeTime >= activeCutoff.getTime()
                                    );
                                })
                                .sort((a, b) => a.localeCompare(b));

                            const selectedFollowupLabel =
                                followupFilter === "all"
                                    ? "Follow-up By"
                                    : followupFilter === "none"
                                        ? "Follow Up Pending"
                                        : followupFilter;

                            return (
                                <div
                                    tabIndex={0}
                                    onBlur={(e) => {
                                        if (!e.currentTarget.contains(e.relatedTarget)) {
                                            setShowFollowupByDropdown(false);
                                        }
                                    }}
                                    style={{
                                        position: "relative",
                                        minWidth: "165px",
                                        outline: "none"
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowFollowupByDropdown((prev) => !prev)
                                        }
                                        style={{
                                            width: "100%",
                                            height: "36px",
                                            padding: "0 10px",
                                            border: "1px solid #ccc",
                                            borderRadius: "6px",
                                            fontSize: "13px",
                                            background: "#fff",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            textAlign: "left",
                                            boxSizing: "border-box"
                                        }}
                                    >
                                        <span
                                            style={{
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap"
                                            }}
                                        >
                                            {selectedFollowupLabel}
                                        </span>
                                        <span style={{ marginLeft: "8px", fontSize: "11px" }}>
                                            {showFollowupByDropdown ? "▲" : "▼"}
                                        </span>
                                    </button>

                                    {showFollowupByDropdown && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: "40px",
                                                left: 0,
                                                width: "520px",
                                                maxHeight: "300px",
                                                overflowY: "auto",
                                                overflowX: "auto",
                                                background: "#fff",
                                                border: "1px solid #999",
                                                borderRadius: "0 0 4px 4px",
                                                boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                                                zIndex: 1000,
                                                padding: "2px 0"
                                            }}
                                        >
                                            <div
                                                onMouseDown={() => {
                                                    setFollowupFilter("all");
                                                    setShowFollowupByDropdown(false);
                                                }}
                                                style={{
                                                    padding: "7px 10px",
                                                    background: "#f2f2f2",
                                                    fontSize: "13px",
                                                    cursor: "pointer",
                                                    fontWeight: "700"
                                                }}
                                            >
                                                All Follow-ups
                                            </div>

                                            <div
                                                onMouseDown={() => {
                                                    setFollowupFilter("none");
                                                    setShowFollowupByDropdown(false);
                                                }}
                                                style={{
                                                    padding: "7px 10px",
                                                    background: followupFilter === "none"
                                                        ? "#fff3cd"
                                                        : "#fff",
                                                    color: followupFilter === "none"
                                                        ? "#856404"
                                                        : "#333",
                                                    fontSize: "13px",
                                                    cursor: "pointer",
                                                    fontWeight: "700",
                                                    borderBottom: "1px solid #eee"
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = "#fff3cd";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background =
                                                        followupFilter === "none" ? "#fff3cd" : "#fff";
                                                }}
                                            >
                                                ⚪ New Follow-ups
                                            </div>

                                            {names.map((name) => (
                                                <div
                                                    key={name}
                                                    onMouseDown={() => {
                                                        setFollowupFilter(name);
                                                        setShowFollowupByDropdown(false);
                                                    }}
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns: "180px 1fr",
                                                        alignItems: "center",
                                                        columnGap: "8px",
                                                        padding: "7px 10px",
                                                        fontSize: "13px",
                                                        cursor: "pointer",
                                                        whiteSpace: "nowrap",
                                                        minWidth: "650px"
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = "#f5f5f5";
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = "#fff";
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis"
                                                        }}
                                                    >
                                                        {name}
                                                    </span>

                                                    {isAdminUser && lastSeenByPerson[name] ? (
                                                        <span
                                                            style={{
                                                                color: "#063f04",
                                                                fontSize: "10px",
                                                                fontWeight: "600"
                                                            }}
                                                        >
                                                            (Last Active: {formatLastActive(lastSeenByPerson[name])})
                                                            {isAdminUser && (
                                                                <span style={{ marginLeft: "6px" }}>
                                                                    (Today: {todayCallCountByPerson[name] || 0} Calls)
                                                                </span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span />
                                                    )}
                                                </div>
                                            ))}

                                            <div
                                                onMouseDown={() => {
                                                    setFollowupFilter("none");
                                                    setShowFollowupByDropdown(false);
                                                }}
                                                style={{
                                                    padding: "7px 10px",
                                                    fontSize: "13px",
                                                    cursor: "pointer",
                                                    whiteSpace: "nowrap"
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = "#f5f5f5";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = "#fff";
                                                }}
                                            >
                                                Follow Up Pending
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* FOLLOW-UP DATE */}
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <div
                                style={{
                                    position: "relative",
                                    display: "inline-flex",
                                    alignItems: "center"
                                }}
                            >
                                {!followupDateFilter && (
                                    <span
                                        style={{
                                            position: "absolute",
                                            left: "11px",
                                            top: "50%",
                                            transform: "translateY(-50%)",
                                            color: "#777",
                                            fontSize: "13px",
                                            pointerEvents: "none",
                                            zIndex: 1
                                        }}
                                    >
                                        Follow-up Date
                                    </span>
                                )}

                                <input
                                    type="date"
                                    value={followupDateFilter}
                                    onChange={(e) =>
                                        setFollowupDateFilter(e.target.value)
                                    }
                                    style={{
                                        height: "36px",
                                        padding: "0 10px",
                                        border: "1px solid #ccc",
                                        borderRadius: "6px",
                                        fontSize: "13px",
                                        background: "#fff",
                                        cursor: "pointer",
                                        color: followupDateFilter ? "#222" : "transparent"
                                    }}
                                />
                            </div>
                        </div>

                        {/* MONTH */}

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
                            <option value="all">All Months</option>
                            <option value="4">April</option>
                            <option value="5">May</option>
                            <option value="6">June</option>
                            <option value="7">July</option>
                            <option value="8">August</option>
                            <option value="9">September</option>
                            <option value="10">October</option>
                            <option value="11">November</option>
                            <option value="12">December</option>
                            <option value="1">January</option>
                            <option value="2">February</option>
                            <option value="3">March</option>
                        </select>

                        {/* SORT */}

                        <select
                            value={
                                sortOrder
                            }
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
                            <option value="newest">New → Old</option>
                            <option value="oldest">Old → New</option>
                        </select>

                        <select
                            value={quotationSort}
                            onChange={(e) => setQuotationSort(e.target.value)}
                            style={{
                                height: "36px",
                                padding: "0 10px",
                                border: "1px solid #ccc",
                                borderRadius: "6px",
                                fontSize: "13px",
                                background: "#fff",
                                cursor: "pointer"
                            }}
                        >
                            <option value="default">Quotation Amount</option>
                            <option value="highest">Highest → Lowest</option>
                            <option value="lowest">Lowest → Highest</option>
                        </select>

                        {/* CLEAR */}

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
                            Refresh
                        </button>


                        {/* WHATSAPP ACTIONS */}
                        <button
                            type="button"
                            onClick={() => setShowTemplateManager(true)}
                            style={{
                                height: "36px",
                                padding: "0 12px",
                                border: "1px solid #05693a",
                                background: "#fff",
                                color: "#05693a",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: "700"
                            }}
                        >
                            ⚙ WhatsApp Templates
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowWhatsappModal(true)}
                            disabled={getSelectedWhatsappRows().length === 0}
                            style={{
                                height: "36px",
                                padding: "0 14px",
                                border: "none",
                                background: getSelectedWhatsappRows().length === 0 ? "#aaa" : "#25D366",
                                color: "#fff",
                                borderRadius: "6px",
                                cursor: getSelectedWhatsappRows().length === 0 ? "not-allowed" : "pointer",
                                fontSize: "13px",
                                fontWeight: "700"
                            }}
                        >
                            📱 Send WhatsApp ({getSelectedWhatsappRows().length})
                        </button>

                        {getSelectedWhatsappRows().length > 0 && (
                            <button
                                type="button"
                                onClick={clearWhatsappSelection}
                                style={{
                                    height: "36px",
                                    padding: "0 10px",
                                    border: "1px solid #dc3545",
                                    background: "#fff",
                                    color: "#dc3545",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    fontWeight: "700"
                                }}
                            >
                                Clear Selection
                            </button>
                        )}

                        <select
                            value={followupQuickFilter}
                            onChange={(e) =>
                                setFollowupQuickFilter(e.target.value)
                            }
                            style={{
                                height: "36px",
                                padding: "0 12px",
                                border: "none",
                                borderRadius: "6px",
                                background: "#05693a",
                                color: "#fff",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: "700",
                                order: screenWidth < 900 ? 2 : 3,
                                whiteSpace: "nowrap",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
                            }}
                        >
                            <option value="all">All Follow-ups</option>
                            <option value="none">New Follow-ups</option>
                            <option value="due">All Due Follow-ups</option>
                            {getCurrentWeekFollowupOptions().map((option) => (
                                <option key={option.value} value={`date:${option.value}`}>
                                    {option.label}
                                </option>
                            ))}

                        </select>
                    </div>

                    {/* =================================================
                        SUMMARY
                    ================================================== */}

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
                        <div style={{ padding: "5px 10px", borderRadius: "5px", background: "#eef3f0", fontSize: "12px", fontWeight: "700", color: "#05693a" }}>
                            Total: {totals.totalCount}
                        </div>

                        <div style={{ padding: "5px 10px", borderRadius: "5px", background: "#fff1f1", fontSize: "12px", fontWeight: "700", color: "#dc3545" }}>
                            Quotation Only: {totals.quotationCount}
                        </div>

                        <div style={{ padding: "5px 10px", borderRadius: "5px", background: "#edf8f1", fontSize: "12px", fontWeight: "700", color: "#198754" }}>
                            Billed: {totals.billedCount}
                        </div>

                        <div style={{ padding: "5px 10px", borderRadius: "5px", background: "#fff0f0", fontSize: "12px", fontWeight: "700", color: "#dc2626" }}>
                            Lost: {totals.lostCount}
                        </div>

                        <div style={{ padding: "5px 10px", borderRadius: "5px", background: "#f5f5f5", fontSize: "12px", fontWeight: "700", color: "#333" }}>
                            Order Value: ₹{" "}
                            {formatAmount(totals.quotationAmountWithGst)}
                        </div>

                        <div style={{ padding: "5px 10px", borderRadius: "5px", background: "#f5f5f5", fontSize: "12px", fontWeight: "700", color: "#198754" }}>
                            Billed Value: ₹{" "}
                            {formatAmount(totals.billedAmount)}
                        </div>
                    </div>
                </div>

                {/* =====================================================
                    LOADING
                ====================================================== */}

                {loading && (
                    <div
                        style={{
                            padding: "20px",
                            textAlign: "center",
                            fontWeight: "600",
                            color: "#05693a"
                        }}
                    >
                        Loading Quotations...
                    </div>
                )}

                {/* =====================================================
                    EMPTY
                ====================================================== */}

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
                            No quotations / sales
                            orders found.
                        </div>
                    )}

                {/* =====================================================
                    TABLE
                ====================================================== */}

                {!loading &&
                    filteredData.length >
                    0 && (
                        <div
                            className="quotation-table-container"
                            style={{
                                width: "100%",
                                maxWidth: "100%",
                                overflowX: "auto",
                                overflowY: "auto",
                                marginTop: "10px",
                                height: "calc(100vh - 330px)",
                                minHeight: "300px",
                                maxHeight: "calc(100vh - 330px)",
                                boxSizing: "border-box",
                                position: "relative"
                            }}
                        >
                            <table
                                style={{
                                    width: "100%",
                                    maxWidth: "100%",
                                    tableLayout: "fixed",
                                    borderCollapse:
                                        "separate",
                                    borderSpacing:
                                        0,
                                    fontSize:
                                        screenWidth < 700
                                            ? "9px"
                                            : screenWidth < 1100
                                                ? "10px"
                                                : "12px",
                                }}
                            >
                                <thead>
                                    <tr>
                                        <th style={{ ...thStyle, width: "50px" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={
                                                        filteredData.length > 0 &&
                                                        filteredData.every((row) =>
                                                            selectedQuotationKeys.includes(getWhatsappRowKey(row))
                                                        )
                                                    }
                                                    onChange={toggleSelectAllWhatsapp}
                                                    title="Select all visible quotations"
                                                    style={{ cursor: "pointer", width: "15px", height: "15px" }}
                                                />
                                                <span>S.No</span>
                                            </div>
                                        </th>
{isAdminUser && (
                                            <th style={{ ...thStyle, width: "50px", minWidth: "50px", maxWidth: "50px", textAlign: "center" }}>
                                                Long-Term Client
                                            </th>
                                        )}

                                        <th style={{ ...thStyle, width: "90px" }}>Date</th>

                                        <th style={{ ...thStyle, width: "150px", minWidth: "150px", textAlign: "center" }}>
                                            Reference Details
                                        </th>

                                        <th style={{ ...thStyle, width: "200px", minWidth: "200px", textAlign: "center" }}>
                                            Party Name
                                        </th>

                                        
                                        <th style={{ ...thStyle, width: "140px" }}>Quotation Amount</th>

                                        <th style={{ ...thStyle, width: "140px" }}>Billed Amount</th>

                                        <th style={{ ...thStyle, width: "150px" }}>Invoice No</th>

                                        <th style={{ ...thStyle, width: "200px" }}>Billed Party</th>

                                        <th style={{ ...thStyle, width: "220px", minWidth: "220px", textAlign: "left" }}>
                                            Sales & Follow-up
                                        </th>

                                        <th style={{ ...thStyle, width: "120px" }}>Status</th>

                                        <th style={{ ...thStyle, width: "55px" }}>Notes</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {groupedDisplayData.map(
                                        (
                                            row,
                                            index
                                        ) => {
                                            const quotationNo =
                                                row.quotation_no ||
                                                row.voucher_no ||
                                                row.VoucherNumber ||
                                                "";

                                            const orderNo =
                                                row.order_no ||
                                                row.OrderNo ||
                                                "";

                                            const status =
                                                getStatus(
                                                    row
                                                );

                                            const statusText =
                                                getStatusText(
                                                    row
                                                );

                                            const isExpanded =
                                                expandedQuotation ===
                                                quotationNo;

                                            const items =
                                                Array.isArray(
                                                    row.items
                                                )
                                                    ? row.items
                                                    : [];

                                            return (
                                                <React.Fragment
                                                    key={`${quotationNo}-${index}`}
                                                >
                                                    {/* ======================================
                                                        MAIN ROW
                                                    ======================================= */}

                                                    <tr
                                                        style={{
                                                            "--quotation-party-bg":
                                                                row.__partyGroupColor ||
                                                                "#fff"
                                                        }}
                                                    >
                                                        {/* S.NO */}

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "center",
                                                                fontWeight: "700",
                                                            }}
                                                        >
                                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedQuotationKeys.includes(getWhatsappRowKey(row))}
                                                                    onChange={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleWhatsappSelection(row);
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="Select for WhatsApp"
                                                                    style={{ cursor: "pointer", width: "15px", height: "15px" }}
                                                                />
                                                                <span>{index + 1}</span>
                                                            </div>
                                                        </td>
                                                            {/* LONG-TERM CLIENT */}

                                                        {isAdminUser && (
                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign: "center",
                                                                verticalAlign: "middle"
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {(() => {
                                                                const partyKey = normalizePartyKey(
                                                                    getPartyNameForLongTerm(row)
                                                                );
                                                                const saving = !!longTermClientSaving[partyKey];
                                                                const checked = isLongTermClient(row);

                                                                return (
                                                                    <label
                                                                        style={{
                                                                            display: "inline-flex",
                                                                            alignItems: "center",
                                                                            justifyContent: "center",
                                                                            gap: "6px",
                                                                            cursor: isAdminUser && !saving ? "pointer" : "default",
                                                                            userSelect: "none"
                                                                        }}
                                                                        title={
                                                                            isAdminUser
                                                                                ? "Admin can mark/unmark this customer as a Long-Term Client"
                                                                                : "Only Admin can edit Long-Term Client"
                                                                        }
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            disabled={!isAdminUser || saving}
                                                                            onChange={() => toggleLongTermClient(row)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            style={{
                                                                                width: "17px",
                                                                                height: "17px",
                                                                                cursor: isAdminUser && !saving ? "pointer" : "default",
                                                                                accentColor: "#05693a"
                                                                            }}
                                                                        />
                                                                        <span
                                                                            style={{
                                                                                fontSize: "11px",
                                                                                fontWeight: "700",
                                                                                color: checked ? "#05693a" : "#777"
                                                                            }}
                                                                        >
                                                                            {saving
                                                                                ? "Saving..."
                                                                                : checked
                                                                                    ? "Yes"
                                                                                    : "No"}
                                                                        </span>
                                                                    </label>
                                                                );
                                                            })()}
                                                        </td>
                                                        )}

                                                        {/* DATE */}

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "center",
                                                                whiteSpace:
                                                                    "nowrap",
                                                                fontWeight: "700",
                                                            }}
                                                        >
                                                            {formatDate(
                                                                row.date
                                                            )}
                                                        </td>

                                                        {/* REFERENCE DETAILS */}
                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                width: "190px",
                                                                minWidth: "190px",
                                                                maxWidth: "190px",
                                                                whiteSpace: "normal",
                                                                wordBreak: "normal",
                                                                overflowWrap: "break-word",
                                                                verticalAlign: "top"
                                                            }}
                                                        >
                                                            {row.enquiry_no && (
                                                                <div
                                                                    style={{
                                                                        marginBottom: "7px",
                                                                        color: "#070707",
                                                                        fontWeight: "700"
                                                                    }}
                                                                >
                                                                    Enquiry: {row.enquiry_no}
                                                                </div>
                                                            )}

                                                            {/* QUOTATION */}
                                                            <div
                                                                style={{
                                                                    width: "100%",
                                                                    marginBottom: "10px",
                                                                    color: "#050505",
                                                                    fontWeight: "700"
                                                                }}
                                                            >
                                                                {/* Quotation label + arrow in ONE LINE */}
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: "5px",
                                                                        whiteSpace: "nowrap",
                                                                        lineHeight: "1.3",
                                                                        marginBottom: "4px"
                                                                    }}
                                                                >
                                                                    <span>Quotation:</span>

                                                                    <button
                                                                        onClick={() => toggleQuotation(quotationNo)}
                                                                        disabled={items.length === 0}
                                                                        style={{
                                                                            width: "16px",
                                                                            height: "16px",
                                                                            padding: 0,
                                                                            margin: 0,
                                                                            border: "none",
                                                                            background: "transparent",
                                                                            color: "#008000",
                                                                            cursor: items.length > 0 ? "pointer" : "default",
                                                                            fontSize: "10px",
                                                                            fontWeight: "700",
                                                                            lineHeight: "16px",
                                                                            flexShrink: 0
                                                                        }}
                                                                        title={
                                                                            items.length > 0
                                                                                ? "Show item details"
                                                                                : "No item details"
                                                                        }
                                                                    >
                                                                        {items.length > 0
                                                                            ? (isExpanded ? "▲" : "▼")
                                                                            : ""}
                                                                    </button>
                                                                </div>

                                                                {/* Quotation number on NEXT LINE */}
                                                                <div
                                                                    style={{
                                                                        width: "100%",
                                                                        paddingLeft: "0",
                                                                        whiteSpace: "normal",
                                                                        overflowWrap: "break-word",
                                                                        wordBreak: "normal",
                                                                        lineHeight: "1.4",
                                                                        fontWeight: "700"
                                                                    }}
                                                                >
                                                                    {quotationNo}
                                                                </div>
                                                            </div>

                                                            {orderNo && (
                                                                <div
                                                                    style={{
                                                                        color: "#030108",
                                                                        fontWeight: "700"
                                                                    }}
                                                                >
                                                                    Order: {orderNo}
                                                                    {isDuplicateOrderNo(row) && (
                                                                        <span
                                                                            style={{
                                                                                marginLeft: "5px",
                                                                                color: "#dc2626",
                                                                                fontWeight: "600"
                                                                            }}
                                                                        >
                                                                            (DUPLICATE)
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* PARTY NAME + MAILING ADDRESS */}

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                fontWeight: "600",
                                                                textAlign: "left",
                                                                whiteSpace: "normal",
                                                                wordBreak: "break-word"
                                                            }}
                                                        >
                                                            {(() => {

                                                                const ledgerName = String(
                                                                    row.party_name ||
                                                                    row.PartyLedgerName ||
                                                                    ""
                                                                ).trim();

                                                                // Mailing name comes from the invoice/address data.
                                                                // billed_party is also used because for billed Cash Sales
                                                                // Tally stores the customer name there.
                                                                const mailingName = String(
                                                                    row.mailing_name ||
                                                                    row.EveInvMailingName ||
                                                                    row.billed_party ||
                                                                    ""
                                                                ).trim();

                                                                const mailingAddress = String(
                                                                    row.mailing_address ||
                                                                    row.EveInvMailingAdd ||
                                                                    row.billed_party_address ||
                                                                    ""
                                                                ).trim();

                                                                const walkinMobile = String(
                                                                    row.walkin_cust_no || ""
                                                                ).trim();

                                                                const hasAddress =
                                                                    mailingAddress !== "" ||
                                                                    mailingName !== "" ||
                                                                    walkinMobile !== "";

                                                                const isPartyExpanded =
                                                                    expandedParty === quotationNo;

                                                                return (
                                                                    <>
                                                                        <div
                                                                            style={{
                                                                                display: "flex",
                                                                                alignItems: "flex-start",
                                                                                gap: "5px"
                                                                            }}
                                                                        >

                                                                            {/* EXPAND ARROW */}

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {

                                                                                    if (!hasAddress) {
                                                                                        return;
                                                                                    }

                                                                                    setExpandedParty(
                                                                                        previous =>
                                                                                            previous === quotationNo
                                                                                                ? null
                                                                                                : quotationNo
                                                                                    );
                                                                                }}
                                                                                disabled={!hasAddress}
                                                                                title={
                                                                                    hasAddress
                                                                                        ? (
                                                                                            isPartyExpanded
                                                                                                ? "Hide mailing address"
                                                                                                : "Show mailing address"
                                                                                        )
                                                                                        : "No mailing address"
                                                                                }
                                                                                style={{
                                                                                    width: "20px",
                                                                                    minWidth: "20px",
                                                                                    height: "20px",
                                                                                    padding: 0,
                                                                                    marginTop: "1px",
                                                                                    border: "none",
                                                                                    background: "transparent",
                                                                                    color: hasAddress
                                                                                        ? "#05693a"
                                                                                        : "#aaa",
                                                                                    cursor: hasAddress
                                                                                        ? "pointer"
                                                                                        : "default",
                                                                                    fontSize: "11px",
                                                                                    fontWeight: "700"
                                                                                }}
                                                                            >
                                                                                {hasAddress
                                                                                    ? (
                                                                                        isPartyExpanded
                                                                                            ? "▲"
                                                                                            : "▼"
                                                                                    )
                                                                                    : ""
                                                                                }
                                                                            </button>


                                                                            {/* CREDIT DAYS + PARTY NAME */}

                                                                            <div
                                                                                style={{
                                                                                    flex: 1,
                                                                                    minWidth: 0
                                                                                }}
                                                                            >
                                                                                {String(row?.credit_days || "").trim() !== "" && (
                                                                                    <div
                                                                                        style={{
                                                                                            fontSize: "11px",
                                                                                            fontWeight: "700",
                                                                                            color: "#dc3545",
                                                                                            marginBottom: "3px",
                                                                                            lineHeight: "1.2"
                                                                                        }}
                                                                                    >
                                                                                        Credit Period: {row.credit_days}
                                                                                    </div>
                                                                                )}

                                                                                <div
                                                                                    style={{
                                                                                        wordBreak: "break-word",
                                                                                        lineHeight: "1.3"
                                                                                    }}
                                                                                >
                                                                                    {ledgerName}
                                                                                </div>
                                                                            </div>

                                                                        </div>


                                                                        {/* MAILING ADDRESS */}

                                                                        {isPartyExpanded &&
                                                                            hasAddress && (

                                                                                <div
                                                                                    style={{
                                                                                        marginTop: "6px",
                                                                                        marginLeft: "25px",
                                                                                        padding: "7px 9px",
                                                                                        background: "#f7f9f8",
                                                                                        borderLeft:
                                                                                            "3px solid #05693a",
                                                                                        borderRadius: "4px",
                                                                                        color: "#000a05",
                                                                                        fontSize: "14px",

                                                                                        lineHeight: "1.5",
                                                                                        fontWeight: "600",
                                                                                        whiteSpace: "pre-wrap",
                                                                                        wordBreak: "break-word"
                                                                                    }}
                                                                                >

                                                                                    {/* MAILING NAME */}
                                                                                    {mailingName !== "" && (
                                                                                        <div
                                                                                            style={{
                                                                                                marginBottom: "6px",
                                                                                                paddingBottom: "6px",
                                                                                                borderBottom: mailingAddress !== "" ? "1px solid #ddd" : "none",
                                                                                                fontWeight: "700"
                                                                                            }}
                                                                                        >
                                                                                            <strong
                                                                                                style={{
                                                                                                    color: "#05693a"
                                                                                                }}
                                                                                            >
                                                                                                Mailing Name:
                                                                                            </strong>
                                                                                            {" "}
                                                                                            {mailingName}
                                                                                        </div>
                                                                                    )}

                                                                                    {/* MAILING ADDRESS */}
                                                                                    {mailingAddress !== "" && (
                                                                                        <div>
                                                                                            <strong
                                                                                                style={{
                                                                                                    color: "#05693a"
                                                                                                }}
                                                                                            >
                                                                                                Address:
                                                                                            </strong>
                                                                                            {" "}
                                                                                            {mailingAddress}
                                                                                        </div>
                                                                                    )}

                                                                                    {/* MOBILE + WHATSAPP */}

                                                                                    {walkinMobile !== "" && (() => {
                                                                                        const mobileDigits = walkinMobile.replace(/\D/g, "");
                                                                                        const hasValidWhatsAppNumber =
                                                                                            mobileDigits.length === 10 ||
                                                                                            (mobileDigits.length === 11 && mobileDigits.startsWith("0")) ||
                                                                                            (mobileDigits.length === 12 && mobileDigits.startsWith("91"));

                                                                                        return (
                                                                                            <div
                                                                                                style={{
                                                                                                    marginTop: "6px",
                                                                                                    paddingTop: "6px",
                                                                                                    borderTop: "1px solid #ddd",
                                                                                                    fontSize: "11px",
                                                                                                    lineHeight: "1.5"
                                                                                                }}
                                                                                            >
                                                                                                <div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                                                                                                    <strong>Mobile:</strong> {walkinMobile}
                                                                                                </div>

                                                                                                {hasValidWhatsAppNumber && (
                                                                                                    <div style={{ marginTop: "5px" }}>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            title="Open WhatsApp"
                                                                                                            aria-label={`Open WhatsApp for ${walkinMobile}`}
                                                                                                            onClick={(e) => {
                                                                                                                e.stopPropagation();
                                                                                                                openWhatsApp(walkinMobile);
                                                                                                            }}
                                                                                                            style={{
                                                                                                                width: "24px",
                                                                                                                height: "24px",
                                                                                                                minWidth: "24px",
                                                                                                                padding: 0,
                                                                                                                margin: 0,
                                                                                                                border: "none",
                                                                                                                borderRadius: "50%",
                                                                                                                background: "#25D366",
                                                                                                                color: "#fff",
                                                                                                                display: "inline-flex",
                                                                                                                alignItems: "center",
                                                                                                                justifyContent: "center",
                                                                                                                cursor: "pointer"
                                                                                                            }}
                                                                                                        >
                                                                                                            <svg
                                                                                                                width="15"
                                                                                                                height="15"
                                                                                                                viewBox="0 0 24 24"
                                                                                                                fill="currentColor"
                                                                                                                aria-hidden="true"
                                                                                                            >
                                                                                                                <path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.54 0 .22 5.32.22 11.86c0 2.09.55 4.13 1.59 5.93L.12 24l6.35-1.66a11.86 11.86 0 0 0 5.61 1.42h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.23-6.15-3.43-8.42ZM12.09 21.74h-.01a9.88 9.88 0 0 1-5.03-1.38l-.36-.21-3.77.99 1.01-3.67-.23-.38a9.87 9.87 0 0 1-1.51-5.23C2.19 6.42 6.62 1.99 12.08 1.99c2.65 0 5.14 1.03 7.01 2.91a9.86 9.86 0 0 1 2.9 7.01c0 5.46-4.44 9.89-9.9 9.83Zm5.42-7.4c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.95 1.18-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.21 5.09 4.5.71.31 1.26.5 1.69.64.71.23 1.35.2 1.86.12.57-.08 1.78-.73 2.03-1.43.25-.7.25-1.3.17-1.43-.07-.13-.27-.2-.57-.35Z" />
                                                                                                            </svg>
                                                                                                        </button>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                </div>
                                                                            )}

                                                                    </>
                                                                );

                                                            })()}
                                                        </td>


                                                    


                                                        {/* QUOTATION AMOUNT */}

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "right",
                                                                fontWeight:
                                                                    "700"
                                                            }}
                                                        >
                                                            ₹ {formatAmount(getQuotationTotalWithGst(row))}
                                                        </td>

                                                        {/* BILLED AMOUNT */}

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign: "right",
                                                                fontWeight: "700",
                                                                color:
                                                                    status === "billed"
                                                                        ? "#198754"
                                                                        : "#999"
                                                            }}
                                                        >
                                                            {status === "billed"
                                                                ? `₹ ${formatAmount(
                                                                    getBilledAmountWithGst(row)
                                                                )}`
                                                                : ""}
                                                        </td>

                                                        {/* INVOICE */}

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign: "left",
                                                                whiteSpace: "normal",
                                                                fontWeight: "700",
                                                                wordBreak: "break-word"
                                                            }}
                                                        >
                                                            {status === "billed" && (
                                                                <>
                                                                    <div>
                                                                        {row.invoice_no || ""}
                                                                    </div>

                                                                    {row.invoice_date && (
                                                                        <div
                                                                            style={{
                                                                                fontSize: "12px",
                                                                                fontWeight: "500",
                                                                                color: "#666",
                                                                                marginTop: "2px"
                                                                            }}
                                                                        >
                                                                            {formatDate(row.invoice_date)}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </td>


                                                        {/* BILLED PARTY + ADDRESS */}

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign: "left",
                                                                fontWeight: "700",
                                                                whiteSpace: "normal",
                                                                wordBreak: "break-word"
                                                            }}
                                                        >
                                                            {status === "billed" && (() => {

                                                                const billedPartyName = cleanBilledParty(
                                                                    row.billed_party
                                                                );

                                                                const billedPartyAddress = String(
                                                                    row.billed_party_address ||
                                                                    row.billed_address ||
                                                                    row.EveInvBilledAdd ||
                                                                    ""
                                                                ).trim();

                                                                const hasBilledAddress =
                                                                    billedPartyAddress !== "";

                                                                const isBilledPartyExpanded =
                                                                    expandedBilledParty === quotationNo;

                                                                return (
                                                                    <>
                                                                        <div
                                                                            style={{
                                                                                display: "flex",
                                                                                alignItems: "flex-start",
                                                                                gap: "5px"
                                                                            }}
                                                                        >
                                                                            {/* EXPAND ARROW */}

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    if (!hasBilledAddress) return;

                                                                                    setExpandedBilledParty(
                                                                                        previous =>
                                                                                            previous === quotationNo
                                                                                                ? null
                                                                                                : quotationNo
                                                                                    );
                                                                                }}
                                                                                disabled={!hasBilledAddress}
                                                                                title={
                                                                                    hasBilledAddress
                                                                                        ? (
                                                                                            isBilledPartyExpanded
                                                                                                ? "Hide billed party address"
                                                                                                : "Show billed party address"
                                                                                        )
                                                                                        : "No billed party address"
                                                                                }
                                                                                style={{
                                                                                    width: "20px",
                                                                                    minWidth: "20px",
                                                                                    height: "20px",
                                                                                    padding: 0,
                                                                                    marginTop: "1px",
                                                                                    border: "none",
                                                                                    background: "transparent",
                                                                                    color: hasBilledAddress
                                                                                        ? "#198754"
                                                                                        : "#aaa",
                                                                                    cursor: hasBilledAddress
                                                                                        ? "pointer"
                                                                                        : "default",
                                                                                    fontSize: "11px",
                                                                                    fontWeight: "700"
                                                                                }}
                                                                            >
                                                                                {hasBilledAddress
                                                                                    ? (
                                                                                        isBilledPartyExpanded
                                                                                            ? "▲"
                                                                                            : "▼"
                                                                                    )
                                                                                    : ""}
                                                                            </button>

                                                                            {/* BILLED PARTY NAME */}

                                                                            <span
                                                                                style={{
                                                                                    flex: 1,
                                                                                    wordBreak: "break-word"
                                                                                }}
                                                                            >
                                                                                {billedPartyName}
                                                                            </span>
                                                                        </div>

                                                                        {/* BILLED PARTY ADDRESS */}

                                                                        {isBilledPartyExpanded &&
                                                                            hasBilledAddress && (
                                                                                <div
                                                                                    style={{
                                                                                        marginTop: "6px",
                                                                                        marginLeft: "25px",
                                                                                        padding: "7px 9px",
                                                                                        background: "#f7f9f8",
                                                                                        borderLeft:
                                                                                            "3px solid #198754",
                                                                                        borderRadius: "4px",
                                                                                        color: "#000a05",
                                                                                        fontSize: "14px",
                                                                                        lineHeight: "1.5",
                                                                                        fontWeight: "600",
                                                                                        whiteSpace: "pre-wrap",
                                                                                        wordBreak: "break-word"
                                                                                    }}
                                                                                >
                                                                                    <strong
                                                                                        style={{
                                                                                            color: "#198754"
                                                                                        }}
                                                                                    >
                                                                                        Address:
                                                                                    </strong>

                                                                                    {" "}

                                                                                    {billedPartyAddress}
                                                                                </div>
                                                                            )}
                                                                    </>
                                                                );

                                                            })()}
                                                        </td>

                                                        {/* SALES & FOLLOW-UP */}
                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign: "left",
                                                                fontWeight: "600",
                                                                whiteSpace: "normal",
                                                                wordBreak: "break-word",
                                                                minWidth: "220px",
                                                                lineHeight: "1.55"
                                                            }}
                                                        >
                                                            {row.brought_by && (
                                                                <div style={{ marginBottom: "5px" }}>
                                                                    <span style={{ fontWeight: "700", color: "#030303" }}>Brought By: {row.brought_by}</span>
                                                                </div>
                                                            )}
                                                            {row.assigned_to && (
                                                                <div style={{ marginBottom: "5px" }}>
                                                                    <span style={{ fontWeight: "700", color: "#070707" }}>Assigned To: {row.assigned_to}</span>
                                                                </div>
                                                            )}
                                                            <div style={{ marginTop: (row.brought_by || row.assigned_to) ? "7px" : "0" }}>
                                                                {followupByQuotation[quotationNo] ? (() => {
                                                                    const isFollowupExpanded = expandedFollowup === quotationNo;
                                                                    const history = followupHistoryByQuotation[quotationNo] || [];
                                                                    return (
                                                                        <div>
                                                                            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#0a0a0a", fontWeight: "700" }}>
                                                                                <span
                                                                                    style={{
                                                                                        color: "inherit",
                                                                                        fontWeight: "inherit",
                                                                                        fontSize: "13px",
                                                                                        flex: 1
                                                                                    }}
                                                                                >
                                                                                    Followed By: {followupByQuotation[quotationNo]}
                                                                                </span>
                                                                                {history.length > 0 && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setExpandedFollowup(previous => previous === quotationNo ? null : quotationNo)}
                                                                                        style={{ border: "none", background: "transparent", color: "#020e08", cursor: "pointer", fontSize: "12px", fontWeight: "700", padding: "2px 4px" }}
                                                                                        title={isFollowupExpanded ? "Hide follow-up details" : "Show follow-up details"}
                                                                                    >
                                                                                        {isFollowupExpanded ? "▲" : "▼"}
                                                                                    </button>
                                                                                )}
                                                                            </div>

                                                                            {status !== "billed" && followupDateByQuotation[quotationNo] && (
                                                                                <>
                                                                                    <div
                                                                                        style={{
                                                                                            marginTop: "3px",
                                                                                            color: "#666",
                                                                                            fontSize: "11px",
                                                                                            fontWeight: "600"
                                                                                        }}
                                                                                    >
                                                                                        Next Follow-up:{" "}
                                                                                        {formatDate(
                                                                                            followupDateByQuotation[quotationNo]
                                                                                        )}
                                                                                    </div>

                                                                                    {(() => {
                                                                                        const followupDate = new Date(
                                                                                            `${followupDateByQuotation[quotationNo]}T00:00:00`
                                                                                        );
                                                                                        const today = new Date();
                                                                                        today.setHours(0, 0, 0, 0);

                                                                                        if (
                                                                                            !Number.isNaN(followupDate.getTime()) &&
                                                                                            followupDate < today
                                                                                        ) {
                                                                                            return (
                                                                                                <div
                                                                                                    style={{
                                                                                                        marginTop: "3px",
                                                                                                        color: "#dc2626",
                                                                                                        fontSize: "9px",
                                                                                                        fontWeight: "600"
                                                                                                    }}
                                                                                                >
                                                                                                    Due
                                                                                                </div>
                                                                                            );
                                                                                        }

                                                                                        return null;
                                                                                    })()}
                                                                                </>
                                                                            )}

                                                                            {isFollowupExpanded && history.length > 0 && (
                                                                                <div style={{ marginTop: "7px", borderTop: "1px solid #ddd", paddingTop: "6px" }}>
                                                                                    {history.map((item, historyIndex) => (
                                                                                        <div key={`${quotationNo}-followup-${historyIndex}`} style={{ padding: "6px 7px", marginBottom: "5px", background: "#f7f9f8", borderLeft: "3px solid #05693a", borderRadius: "3px", fontSize: "11px", lineHeight: "1.45" }}>
                                                                                            {item.status && <div style={{ fontWeight: "700", color: "#7649f1" }}>Status: {item.status}</div>}
                                                                                            {item.remarks && <div style={{ marginTop: "2px", color: "#444", whiteSpace: "pre-wrap" }}><strong>Remarks:</strong> {item.remarks}</div>}
                                                                                            {(item.call_date || item.callDate || item.followup_date || item.followupDate || item.created_at) && (
                                                                                                <div style={{ marginTop: "2px", color: "#777" }}>
                                                                                                    Date: {formatDate(item.call_date || item.callDate || item.followup_date || item.followupDate || item.created_at)}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })() : followupLoading ? (
                                                                    <span style={{ color: "#999", fontStyle: "italic" }}>Loading...</span>
                                                                ) : (
                                                                    <span style={{ color: "#999", fontStyle: "italic" }}>No Follow Up</span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* STATUS */}

                                                        <td
                                                            style={{
                                                                ...tdStyle,
                                                                textAlign:
                                                                    "center",
                                                                fontWeight:
                                                                    "700",
                                                                color:
                                                                    getStatusColor(
                                                                        row
                                                                    ),
                                                                whiteSpace:
                                                                    "normal"
                                                            }}
                                                        >
                                                            {
                                                                statusText
                                                            }
                                                        </td>

                                                        {/* NOTES */}
                                                        <td
                                                            style={{
                                                                textAlign: "center",
                                                                borderBottom: "1px solid #eee"
                                                            }}
                                                        >
                                                            {status === "quotation" ? (
                                                                <button
                                                                    onClick={() =>
                                                                        openNoteModal(
                                                                            row,
                                                                            {
                                                                                quotation_no: quotationNo,
                                                                                order_no: orderNo,
                                                                                invoice_no: row.invoice_no || "",
                                                                                status: "Quotation Only"
                                                                            },
                                                                            getFinancialMonth(row.date)
                                                                        )
                                                                    }
                                                                    style={{
                                                                        background: "none",
                                                                        border: "none",
                                                                        cursor: "pointer",
                                                                        fontSize: "18px"
                                                                    }}
                                                                    title="Add Follow-up Note"
                                                                >
                                                                    📝
                                                                </button>
                                                            ) : (
                                                                ""
                                                            )}
                                                        </td>
                                                    </tr>

                                                    {/* ======================================
                                                        ITEM DETAILS
                                                    ======================================= */}

                                                    {isExpanded &&
                                                        items.length >
                                                        0 && (
                                                            <tr>
                                                                <td
                                                                    colSpan={
                                                                        14
                                                                    }
                                                                    style={{
                                                                        padding:
                                                                            "0",
                                                                        background:
                                                                            "#f8f9fa",
                                                                        border:
                                                                            "none"
                                                                    }}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            width: "850px",
                                                                            maxWidth: "90%",
                                                                            margin: "8px auto 12px auto",
                                                                            border: "2px solid #05693a",
                                                                            borderRadius: "6px",
                                                                            background: "#fff",
                                                                            overflow: "hidden",
                                                                            boxShadow: "0 3px 10px rgba(0,0,0,0.08)"
                                                                        }}
                                                                    >
                                                                        {/* ITEM HEADER */}

                                                                        <div
                                                                            style={{
                                                                                display: "flex",
                                                                                alignItems: "center",
                                                                                justifyContent: "space-between",
                                                                                padding: "9px 12px",
                                                                                background: "linear-gradient(90deg, #05693a, #0b7d4a)",
                                                                                color: "#fff",
                                                                                borderBottom: "1px solid #04552f"
                                                                            }}
                                                                        >
                                                                            <div
                                                                                style={{
                                                                                    fontSize: "13px",
                                                                                    fontWeight: "700",
                                                                                    color: "#fff",
                                                                                    letterSpacing: "0.2px"
                                                                                }}
                                                                            >
                                                                                Item Details —{" "}
                                                                                {
                                                                                    quotationNo
                                                                                }
                                                                            </div>

                                                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleDownloadQuotationPdf(row)}
                                                                                    disabled={pdfDownloading === quotationNo}
                                                                                    style={{
                                                                                        border: "1px solid #fff",
                                                                                        background: "transparent",
                                                                                        color: "#fff",
                                                                                        height: "23px",
                                                                                        padding: "0 9px",
                                                                                        borderRadius: "4px",
                                                                                        cursor: pdfDownloading === quotationNo ? "wait" : "pointer",
                                                                                        fontSize: "11px",
                                                                                        fontWeight: "700"
                                                                                    }}
                                                                                    title="Download quotation PDF"
                                                                                >
                                                                                    {pdfDownloading === quotationNo ? "Creating PDF..." : "📄 Download PDF"}
                                                                                </button>

                                                                                <button
                                                                                    onClick={() =>
                                                                                        setExpandedQuotation(
                                                                                            null
                                                                                        )
                                                                                    }
                                                                                    style={{
                                                                                        border: "none",
                                                                                        background: "#dc3545",
                                                                                        color: "#fff",
                                                                                        width: "23px",
                                                                                        height: "23px",
                                                                                        borderRadius: "4px",
                                                                                        cursor: "pointer",
                                                                                        fontSize: "15px",
                                                                                        fontWeight: "700",
                                                                                        lineHeight: "20px",
                                                                                        padding: 0
                                                                                    }}
                                                                                >
                                                                                    ×
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        {/* ITEM TABLE */}

                                                                        <div
                                                                            style={{
                                                                                width: "100%",
                                                                                overflowX: "auto",
                                                                                maxHeight: "350px",
                                                                                overflowY: "auto"
                                                                            }}
                                                                        >
                                                                            <table
                                                                                style={{
                                                                                    width: "100%",
                                                                                    minWidth: "700px",
                                                                                    borderCollapse: "collapse",
                                                                                    fontSize: "11px",
                                                                                    tableLayout: "fixed"
                                                                                }}
                                                                            >
                                                                                <thead>
                                                                                    <tr style={{ background: "#f7f7f7" }}>
                                                                                        <th style={{ padding: "7px 8px", border: "1px solid #ddd", textAlign: "center", width: "55px" }}>SL No.</th>
                                                                                        <th style={{ padding: "7px 8px", border: "1px solid #ddd", textAlign: "left" }}>Item Name</th>
                                                                                        <th style={{ padding: "7px 8px", border: "1px solid #ddd", textAlign: "right", width: "120px" }}>Rate</th>
                                                                                        <th style={{ padding: "7px 8px", border: "1px solid #ddd", textAlign: "right", width: "100px" }}>Quantity</th>
                                                                                        <th style={{ padding: "7px 8px", border: "1px solid #ddd", textAlign: "right", width: "150px" }}>Value</th>
                                                                                    </tr>
                                                                                </thead>

                                                                                <tbody>
                                                                                    {items.map(
                                                                                        (
                                                                                            item,
                                                                                            itemIndex
                                                                                        ) => (
                                                                                            <tr
                                                                                                key={
                                                                                                    itemIndex
                                                                                                }
                                                                                            >
                                                                                                <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "center" }}>
                                                                                                    {itemIndex + 1}
                                                                                                </td>
                                                                                                <td
                                                                                                    style={{
                                                                                                        padding: "6px 8px",
                                                                                                        border: "1px solid #eee",
                                                                                                        textAlign: "left",
                                                                                                        whiteSpace: "normal",
                                                                                                        overflowWrap: "anywhere",
                                                                                                        wordBreak: "break-word",
                                                                                                        maxWidth: 0
                                                                                                    }}
                                                                                                >
                                                                                                    {(() => {
                                                                                                        const itemName = String(item.item_name || "")
                                                                                                            .trim()
                                                                                                            .toUpperCase();

                                                                                                        const isTemporaryItem =
                                                                                                            itemName === "TEMPRORY ITEM" ||
                                                                                                            itemName === "TEMPRORY ITEM MTR";

                                                                                                        const tempDescription = String(
                                                                                                            item.temp_item_desc || ""
                                                                                                        ).trim();

                                                                                                        return (
                                                                                                            <>
                                                                                                                <div
                                                                                                                    style={{
                                                                                                                        whiteSpace: "normal",
                                                                                                                        overflowWrap: "anywhere",
                                                                                                                        wordBreak: "break-word"
                                                                                                                    }}
                                                                                                                >
                                                                                                                    {item.item_name}
                                                                                                                </div>

                                                                                                                {isTemporaryItem && tempDescription && (
                                                                                                                    <div className="temporary-item-desc">
                                                                                                                        ({tempDescription})
                                                                                                                    </div>
                                                                                                                )}
                                                                                                            </>
                                                                                                        );
                                                                                                    })()}
                                                                                                </td>

                                                                                                <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "right" }}>
                                                                                                    {formatAmount(item.rate)}
                                                                                                </td>

                                                                                                <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "right" }}>
                                                                                                    {Number(
                                                                                                        item.quantity ||
                                                                                                        0
                                                                                                    ).toLocaleString(
                                                                                                        "en-IN",
                                                                                                        {
                                                                                                            minimumFractionDigits:
                                                                                                                2,
                                                                                                            maximumFractionDigits:
                                                                                                                2
                                                                                                        }
                                                                                                    )}
                                                                                                </td>

                                                                                                <td style={{ padding: "6px 8px", border: "1px solid #eee", textAlign: "right", fontWeight: "600" }}>
                                                                                                    {formatAmount(item.value)}
                                                                                                </td>

                                                                                            </tr>
                                                                                        )
                                                                                    )}

                                                                                    {/* TALLY-STYLE TAX SUMMARY */}
                                                                                    <tr style={{ background: "#f8f9fa", fontWeight: "700" }}>
                                                                                        <td colSpan={4} style={{ padding: "7px 8px", textAlign: "right", borderTop: "2px solid #555" }}>
                                                                                            Taxable Amount
                                                                                        </td>
                                                                                        <td style={{ padding: "7px 8px", textAlign: "right", borderTop: "2px solid #555" }}>
                                                                                            {formatAmount(getItemTotal(items))}
                                                                                        </td>
                                                                                    </tr>

                                                                                    <tr style={{ background: "#f8f9fa", fontWeight: "700" }}>
                                                                                        <td colSpan={4} style={{ padding: "7px 8px", textAlign: "right" }}>
                                                                                            GST
                                                                                        </td>
                                                                                        <td style={{ padding: "7px 8px", textAlign: "right" }}>
                                                                                            {formatAmount(getItemGstTotal(items))}
                                                                                        </td>
                                                                                    </tr>

                                                                                    <tr style={{ background: "#eef6ff", fontWeight: "800", fontSize: "12px" }}>
                                                                                        <td colSpan={4} style={{ padding: "8px", textAlign: "right", borderTop: "1px solid #777" }}>
                                                                                            Total Amount
                                                                                        </td>
                                                                                        <td style={{ padding: "8px", textAlign: "right", borderTop: "1px solid #777" }}>
                                                                                            {formatAmount(getQuotationTotalWithGst(row))}
                                                                                        </td>
                                                                                    </tr>

                                                                                </tbody>
                                                                            </table>
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

                                {/* =====================================================
                                    GRAND TOTAL
                                ====================================================== */}

                                <tfoot>
                                    <tr
                                        style={{
                                            position: "sticky",
                                            bottom: 0,
                                            zIndex: 30,
                                            background: "#f8f9fa",
                                            fontWeight: "700",
                                            boxShadow: "0 -2px 5px rgba(0,0,0,0.12)"
                                        }}
                                    >
                                        <td
                                            colSpan={4}
                                            style={{
                                                padding: "8px",
                                                textAlign: "right",
                                                border: "1px solid #ddd",
                                                borderTop: "2px solid #555",
                                                background: "#f8f9fa"
                                            }}
                                        >
                                            Total
                                        </td>

                                        {/* Quotation Total */}
                                        <td
                                            style={{
                                                padding: "8px",
                                                textAlign: "right",
                                                border: "1px solid #ddd",
                                                borderTop: "2px solid #555",
                                                background: "#f8f9fa",
                                                color: "#fd0d85"
                                            }}
                                        >
                                            {Number(totals.quotationAmount) !== 0 && (
                                                <>₹ {formatAmount(totals.quotationAmount)}</>
                                            )}
                                        </td>

                                        {/* Invoice / Billed Total */}
                                        <td
                                            style={{
                                                padding: "8px",
                                                textAlign: "right",
                                                border: "1px solid #ddd",
                                                borderTop: "2px solid #555",
                                                background: "#f8f9fa",
                                                color: "#198754"
                                            }}
                                        >
                                            {Number(totals.billedAmount) !== 0 && (
                                                <>₹ {formatAmount(totals.billedAmount)}</>
                                            )}
                                        </td>

                                        {/* Remaining columns */}
                                        <td
                                            colSpan={7}
                                            style={{
                                                border: "1px solid #ddd",
                                                borderTop: "2px solid #555",
                                                background: "#f8f9fa"
                                            }}
                                        />


                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                {/* =====================================================
                    WHATSAPP TEMPLATE MANAGER
                ====================================================== */}
                {showTemplateManager && (
                    <div
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(0,0,0,0.5)",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            zIndex: 100000,
                            padding: "20px"
                        }}
                    >
                        <div
                            style={{
                                width: "100%",
                                maxWidth: "1050px",
                                maxHeight: "90vh",
                                overflowY: "auto",
                                background: "#fff",
                                borderRadius: "12px",
                                boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
                            }}
                        >
                            <div style={{ padding: "16px 20px", background: "#05693a", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontSize: "19px", fontWeight: "800" }}>WhatsApp Quotation Templates</div>
                                    <div style={{ fontSize: "11px", opacity: 0.9, marginTop: "3px" }}>Create and edit your reusable customer messages</div>
                                </div>
                                <button type="button" onClick={() => { setShowTemplateManager(false); setEditingWhatsappTemplate(null); }} style={{ border: "none", background: "transparent", color: "#fff", fontSize: "24px", cursor: "pointer" }}>×</button>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: screenWidth < 800 ? "1fr" : "300px 1fr", minHeight: "480px" }}>
                                <div style={{ padding: "15px", borderRight: screenWidth < 800 ? "none" : "1px solid #ddd", borderBottom: screenWidth < 800 ? "1px solid #ddd" : "none" }}>
                                    <button
                                        type="button"
                                        onClick={createWhatsappTemplate}
                                        style={{ width: "100%", padding: "10px", border: "none", borderRadius: "6px", background: "#25D366", color: "#fff", fontWeight: "800", cursor: "pointer", marginBottom: "12px" }}
                                    >
                                        + Create New Template
                                    </button>

                                    {whatsappTemplates.map((template) => (
                                        <div key={template.id} style={{ border: "1px solid #ddd", borderRadius: "7px", padding: "10px", marginBottom: "8px", background: editingWhatsappTemplate?.id === template.id ? "#eef8f1" : "#fff" }}>
                                            <div style={{ fontWeight: "700", color: "#222", marginBottom: "8px" }}>{template.name}</div>
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <button type="button" onClick={() => setEditingWhatsappTemplate({ ...template })} style={{ flex: 1, padding: "6px", border: "1px solid #05693a", color: "#05693a", background: "#fff", borderRadius: "5px", cursor: "pointer" }}>Edit</button>
                                                <button type="button" onClick={() => deleteWhatsappTemplate(template.id)} style={{ padding: "6px 9px", border: "1px solid #dc3545", color: "#dc3545", background: "#fff", borderRadius: "5px", cursor: "pointer" }}>Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ padding: "20px" }}>
                                    {editingWhatsappTemplate ? (
                                        <>
                                            <div style={{ fontSize: "17px", fontWeight: "800", color: "#05693a", marginBottom: "15px" }}>Edit Template</div>

                                            <label style={{ display: "block", fontWeight: "700", fontSize: "13px", marginBottom: "6px" }}>Template Name</label>
                                            <input
                                                value={editingWhatsappTemplate.name || ""}
                                                onChange={(e) => setEditingWhatsappTemplate((prev) => ({ ...prev, name: e.target.value }))}
                                                placeholder="Quotation Ready"
                                                style={{ ...inputStyle, marginBottom: "14px" }}
                                            />

                                            <label style={{ display: "block", fontWeight: "700", fontSize: "13px", marginBottom: "6px" }}>Message</label>
                                            <textarea
                                                value={editingWhatsappTemplate.message || ""}
                                                onChange={(e) => setEditingWhatsappTemplate((prev) => ({ ...prev, message: e.target.value }))}
                                                rows={14}
                                                placeholder="Type your WhatsApp message here..."
                                                style={{ ...inputStyle, resize: "vertical", lineHeight: "1.5", minHeight: "250px" }}
                                            />

                                            <div style={{ marginTop: "12px", padding: "10px", borderRadius: "7px", background: "#f6f8f7", border: "1px solid #dce5df" }}>
                                                <div style={{ fontWeight: "800", fontSize: "12px", color: "#05693a", marginBottom: "7px" }}>Available Variables</div>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                                    {["customer_name", "quotation_no", "quotation_amount", "quotation_date", "sales_order_no", "mobile", "sales_person", "invoice_no", "enquiry_no"].map((variable) => (
                                                        <button
                                                            type="button"
                                                            key={variable}
                                                            onClick={() => setEditingWhatsappTemplate((prev) => ({ ...prev, message: `${prev.message || ""}{{${variable}}}` }))}
                                                            style={{ border: "1px solid #b7c8bd", background: "#fff", color: "#05693a", borderRadius: "4px", padding: "4px 7px", cursor: "pointer", fontSize: "11px" }}
                                                        >
                                                            {`{{${variable}}}`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div style={{ marginTop: "12px", padding: "12px", background: "#fffdf2", border: "1px solid #eadca5", borderRadius: "7px", fontSize: "12px", color: "#5d5120", whiteSpace: "pre-wrap" }}>
                                                <strong>Preview:</strong>{"\n"}{getWhatsappMessage(editingWhatsappTemplate, data[0] || {}) || "Your message preview will appear here."}
                                            </div>

                                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "15px" }}>
                                                <button type="button" onClick={() => setEditingWhatsappTemplate(null)} style={{ padding: "8px 15px", border: "1px solid #bbb", background: "#fff", borderRadius: "5px", cursor: "pointer" }}>Cancel</button>
                                                <button type="button" onClick={saveWhatsappTemplate} style={{ padding: "8px 18px", border: "none", background: "#05693a", color: "#fff", borderRadius: "5px", cursor: "pointer", fontWeight: "700" }}>Save Template</button>
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ color: "#666", textAlign: "center", paddingTop: "100px" }}>
                                            <div style={{ fontSize: "42px" }}>💬</div>
                                            <div style={{ fontSize: "17px", fontWeight: "700", color: "#333", marginTop: "10px" }}>Select a template to edit</div>
                                            <div style={{ fontSize: "13px", marginTop: "5px" }}>Or create a new quotation message template.</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* =====================================================
                    SEND SELECTED WHATSAPP  (with "Next customer" queue)
                ====================================================== */}
                {showWhatsappModal && (() => {
                    const queueActive = whatsappQueue.length > 0;
                    const queueFinished = queueActive && whatsappQueueIndex >= whatsappQueue.length;
                    const nextRow = queueActive && !queueFinished ? whatsappQueue[whatsappQueueIndex] : null;
                    const selectedTemplate = whatsappTemplates.find((item) => item.id === selectedWhatsappTemplateId);
                    const selectedRows = getSelectedWhatsappRows();
                    const previewRow = nextRow || selectedRows[0] || data[0] || {};
                    const nextKey = nextRow ? getWhatsappRowKey(nextRow) : "";
                    const nextPdfReady = !!(nextKey && whatsappPdfBlobs[nextKey]);
                    const pdfStatus = whatsappPdfStatus.key === nextKey
                        ? whatsappPdfStatus
                        : { loading: !nextPdfReady, error: "" };

                    return (
                        <div
                            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100001, padding: "20px" }}
                        >
                            <div style={{ width: "100%", maxWidth: "650px", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: "12px", boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
                                <div style={{ padding: "15px 20px", background: "#25D366", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontSize: "18px", fontWeight: "800" }}>📱 Send Quotation on WhatsApp</div>
                                    <button type="button" onClick={closeWhatsappModal} style={{ border: "none", background: "transparent", color: "#fff", fontSize: "24px", cursor: "pointer" }}>×</button>
                                </div>

                                <div style={{ padding: "20px" }}>
                                    {!queueActive && (
                                        <div style={{ marginBottom: "14px", fontSize: "13px", color: "#444" }}>
                                            <strong>{selectedRows.length}</strong> quotation(s) selected.
                                        </div>
                                    )}

                                    <label style={{ display: "block", fontWeight: "700", fontSize: "13px", marginBottom: "6px" }}>WhatsApp Template</label>
                                    <div style={{ display: "flex", gap: "8px", marginBottom: "15px" }}>
                                        <select
                                            value={selectedWhatsappTemplateId}
                                            onChange={(e) => setSelectedWhatsappTemplateId(e.target.value)}
                                            disabled={queueActive}
                                            style={{ ...inputStyle, flex: 1 }}
                                        >
                                            {whatsappTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                                        </select>
                                        <button
                                            type="button"
                                            disabled={queueActive}
                                            onClick={() => { closeWhatsappModal(); setShowTemplateManager(true); }}
                                            style={{ padding: "0 12px", border: "1px solid #05693a", color: "#05693a", background: "#fff", borderRadius: "5px", cursor: queueActive ? "not-allowed" : "pointer", fontWeight: "700", opacity: queueActive ? 0.5 : 1 }}
                                        >
                                            Edit Templates
                                        </button>
                                    </div>

                                    {/* QUEUE PROGRESS */}
                                    {queueActive && (
                                        <div style={{ marginBottom: "15px", padding: "12px", background: queueFinished ? "#edf8f1" : "#f1f8ff", border: `1px solid ${queueFinished ? "#bfe4cc" : "#b9d9f5"}`, borderRadius: "8px" }}>
                                            {queueFinished ? (
                                                <div style={{ fontWeight: "800", color: "#198754", fontSize: "14px" }}>
                                                    ✅ All {whatsappQueue.length} WhatsApp chat(s) opened.
                                                    <div style={{ fontWeight: "500", color: "#444", fontSize: "12px", marginTop: "4px" }}>
                                                        Make sure you pressed Send in WhatsApp for each customer.
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ fontWeight: "800", fontSize: "14px", color: "#1c4e80" }}>
                                                        Customer {whatsappQueueIndex + 1} of {whatsappQueue.length}
                                                    </div>
                                                    <div style={{ height: "6px", background: "#dbe9f6", borderRadius: "3px", marginTop: "8px", overflow: "hidden" }}>
                                                        <div style={{ height: "100%", width: `${(whatsappQueueIndex / whatsappQueue.length) * 100}%`, background: "#25D366", transition: "width 0.2s" }} />
                                                    </div>
                                                    <div style={{ marginTop: "8px", fontSize: "13px", color: "#222" }}>
                                                        Next: <strong>{getWhatsappCustomerName(nextRow)}</strong>{" "}
                                                        ({getWhatsappMobile(getWhatsappRowMobile(nextRow))})
                                                    </div>
                                                    <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: "700", color: pdfStatus.error ? "#dc3545" : nextPdfReady ? "#198754" : "#8a5a00" }}>
                                                        {pdfStatus.error
                                                            ? `❌ Quotation PDF failed: ${pdfStatus.error}`
                                                            : nextPdfReady
                                                                ? "📄 Quotation PDF ready"
                                                                : "⏳ Preparing quotation PDF..."}
                                                    </div>
                                                </>
                                            )}
                                            {whatsappQueueSkipped > 0 && (
                                                <div style={{ marginTop: "6px", fontSize: "11px", color: "#8a5a00" }}>
                                                    {whatsappQueueSkipped} selected quotation(s) have no valid mobile number and were skipped.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!queueFinished && (
                                        <div style={{ marginBottom: "15px" }}>
                                            <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "6px" }}>
                                                {queueActive ? "Message for the next customer" : "Preview for first selected customer"}
                                            </div>
                                            <div style={{ background: "#e9f7ef", border: "1px solid #bfe4cc", borderRadius: "8px", padding: "14px", whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: "1.55", minHeight: "150px" }}>
                                                {getWhatsappMessage(selectedTemplate, previewRow)}
                                            </div>
                                        </div>
                                    )}

                                    {!queueActive && (
                                        <div style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "7px" }}>
                                            {selectedRows.map((row, index) => (
                                                <div key={getWhatsappRowKey(row)} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "8px 10px", borderBottom: index === selectedRows.length - 1 ? "none" : "1px solid #eee", fontSize: "12px" }}>
                                                    <span style={{ fontWeight: "700" }}>{getWhatsappCustomerName(row)}</span>
                                                    <span>{getWhatsappMobile(getWhatsappRowMobile(row)) || "No mobile"}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ marginTop: "12px", padding: "9px 10px", background: "#fff8e1", border: "1px solid #ffe08a", borderRadius: "6px", color: "#705d00", fontSize: "11px", lineHeight: "1.45" }}>
                                        Each click downloads the customer's quotation PDF and opens ONE chat in the WhatsApp app with the personalized message pre-filled. Attach the downloaded PDF (📎 → Document), press Send in the app, then come back and click the next button. WhatsApp Desktop/App must be installed.
                                    </div>

                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "15px" }}>
                                        <button type="button" onClick={closeWhatsappModal} style={{ padding: "9px 17px", border: "1px solid #bbb", background: "#fff", borderRadius: "5px", cursor: "pointer" }}>
                                            {queueFinished ? "Close" : "Cancel"}
                                        </button>

                                        {!queueActive && (
                                            <button
                                                type="button"
                                                onClick={startWhatsappQueue}
                                                style={{ padding: "9px 20px", border: "none", background: "#25D366", color: "#fff", borderRadius: "5px", cursor: "pointer", fontWeight: "800" }}
                                            >
                                                Start ({selectedRows.length} Selected)
                                            </button>
                                        )}

                                        {queueActive && !queueFinished && pdfStatus.error && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setWhatsappPdfRetry((previous) => previous + 1)}
                                                    style={{ padding: "9px 14px", border: "1px solid #05693a", background: "#fff", color: "#05693a", borderRadius: "5px", cursor: "pointer", fontWeight: "700" }}
                                                >
                                                    Retry PDF
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openNextWhatsapp(true)}
                                                    style={{ padding: "9px 14px", border: "1px solid #dc3545", background: "#fff", color: "#dc3545", borderRadius: "5px", cursor: "pointer", fontWeight: "700" }}
                                                >
                                                    Send without PDF
                                                </button>
                                            </>
                                        )}

                                        {queueActive && !queueFinished && (
                                            <button
                                                type="button"
                                                onClick={() => openNextWhatsapp()}
                                                disabled={!nextPdfReady}
                                                style={{ padding: "9px 20px", border: "none", background: nextPdfReady ? "#25D366" : "#aaa", color: "#fff", borderRadius: "5px", cursor: nextPdfReady ? "pointer" : "not-allowed", fontWeight: "800" }}
                                            >
                                                {nextPdfReady
                                                    ? `Download PDF & Open WhatsApp (${whatsappQueueIndex + 1}/${whatsappQueue.length}) →`
                                                    : "Preparing PDF..."}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {showNoteModal && (
                    <div
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(0,0,0,0.45)",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "flex-start",
                            overflowY: "auto",
                            zIndex: 99999,
                            padding: "90px 20px 20px"
                        }}
                    >
                        <div
                            style={{
                                width: "100%",
                                maxWidth: "1000px",
                                background: "#fff",
                                borderRadius: "10px",
                                boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
                                overflow: "hidden"
                            }}
                        >

                            {/* HEADER */}
                            <div
                                style={{
                                    padding: "16px 20px",
                                    borderBottom: "1px solid #ddd"
                                }}
                            >
                                <h3
                                    style={{
                                        margin: 0,
                                        fontSize: "18px",
                                        fontWeight: "600",
                                        color: "#222"
                                    }}
                                >
                                    Quotation Follow-up Note
                                </h3>
                            </div>


                            {/* BODY */}
                            <div style={{ padding: "20px" }}>

                                {/* QUOTATION DETAILS */}
                                <div
                                    style={{
                                        border: "1px solid #ddd",
                                        borderRadius: "6px",
                                        overflow: "hidden",
                                        marginBottom: "20px"
                                    }}
                                >

                                    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", borderBottom: "1px solid #ddd" }}>
                                        <div style={labelStyle}>Party</div>
                                        <div style={valueStyle}>{selectedQuotation?.party || ""}</div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", borderBottom: "1px solid #ddd" }}>
                                        <div style={labelStyle}>Month</div>
                                        <div style={valueStyle}>{selectedQuotation?.month || ""}</div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", borderBottom: "1px solid #ddd" }}>
                                        <div style={labelStyle}>Quotation No</div>
                                        <div style={valueStyle}>{selectedQuotation?.quotationNo || ""}</div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", borderBottom: "1px solid #ddd" }}>
                                        <div style={labelStyle}>Address</div>
                                        <div style={valueStyle}>{selectedQuotation?.mailingAddress}</div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", borderBottom: "1px solid #ddd" }}>
                                        <div style={labelStyle}>Phone No</div>
                                        <div style={valueStyle}>{selectedQuotation?.walkinCustNo || ""}</div>
                                    </div>

                                </div>


                                {/* FOLLOW-UP FIELDS */}

                                <div style={formRowStyle}>
                                    <label style={formLabelStyle}>Call Date</label>

                                    <input
                                        type="date"
                                        value={followup.callDate}
                                        onChange={(e) =>
                                            setFollowup(prev => ({
                                                ...prev,
                                                callDate: e.target.value
                                            }))
                                        }
                                        style={inputStyle}
                                    />
                                </div>


                                <div style={formRowStyle}>
                                    <label style={formLabelStyle}>Follow-up Date</label>

                                    <input
                                        type="date"
                                        value={followup.status.trim().toLowerCase() === "lost" ? "" : followup.followupDate}
                                        min={new Date().toISOString().split("T")[0]}
                                        disabled={followup.status.trim().toLowerCase() === "lost"}
                                        onChange={(e) =>
                                            setFollowup(prev => ({
                                                ...prev,
                                                followupDate: e.target.value
                                            }))
                                        }
                                        style={{
                                            ...inputStyle,
                                            background:
                                                followup.status.trim().toLowerCase() === "lost"
                                                    ? "#f3f3f3"
                                                    : "#fff",
                                            cursor:
                                                followup.status.trim().toLowerCase() === "lost"
                                                    ? "not-allowed"
                                                    : "pointer"
                                        }}
                                    />
                                </div>


                                <div style={formRowStyle}>
                                    <label style={formLabelStyle}>Telecaller</label>

                                    <input
                                        type="text"
                                        value={followup.telecaller}
                                        readOnly
                                        style={{
                                            ...inputStyle,
                                            background: "#f3f3f3",
                                            color: "#555"
                                        }}
                                    />
                                </div>

                                <div style={formRowStyle}>
                                    <label style={formLabelStyle}>Status</label>

                                    <select
                                        value={followup.status}
                                        onChange={(e) => {
                                            const newStatus = e.target.value;
                                            setFollowup(prev => ({
                                                ...prev,
                                                status: newStatus,
                                                followupDate:
                                                    newStatus.trim().toLowerCase() === "lost"
                                                        ? ""
                                                        : prev.followupDate
                                            }));
                                        }}
                                        style={{
                                            ...inputStyle,
                                            background: "#fff",
                                            cursor: "pointer"
                                        }}
                                    >
                                        <option value="">Select Status</option>
                                        <option value="Interested">Interested</option>
                                        <option value="Not Interested">Not Interested</option>
                                        <option value="Negotiation">Negotiation</option>
                                        <option value="Lost">Lost</option>
                                        <option value="Billed">Billed</option>
                                        <option value="Not Reachable">Not Reachable</option>
                                    </select>
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "130px 1fr",
                                        alignItems: "start",
                                        columnGap: "12px"
                                    }}
                                >

                                    <label
                                        style={{
                                            ...formLabelStyle,
                                            paddingTop: "9px"
                                        }}
                                    >
                                        Remarks
                                    </label>

                                    <textarea
                                        rows={5}
                                        value={followup.remarks}
                                        onChange={(e) =>
                                            setFollowup(prev => ({
                                                ...prev,
                                                remarks: e.target.value
                                            }))
                                        }
                                        style={{
                                            ...inputStyle,
                                            height: "110px",
                                            resize: "vertical"
                                        }}
                                    />
                                </div>

                                <div style={{ marginBottom: "18px" }}>
                                    <label
                                        style={{
                                            fontWeight: "600",
                                            marginBottom: "8px",
                                            display: "block"
                                        }}
                                    >
                                        Previous Follow-ups
                                    </label>

                                    <div
                                        style={{
                                            border: "1px solid #ddd",
                                            borderRadius: "6px",
                                            background: "#fafafa",
                                            maxHeight: followupHistory.length > 2 ? "180px" : "auto",
                                            overflowY: followupHistory.length > 2 ? "auto" : "hidden",
                                            padding: "10px"
                                        }}
                                    >
                                        {followupHistory.length === 0 ? (

                                            <div
                                                style={{
                                                    color: "#777",
                                                    textAlign: "center"
                                                }}
                                            >
                                                No previous follow-ups.
                                            </div>

                                        ) : (

                                            <table
                                                style={{
                                                    width: "100%",
                                                    borderCollapse: "collapse",
                                                    fontSize: "13px"
                                                }}
                                            >
                                                <thead>
                                                    <tr style={{ background: "#f1f1f1" }}>
                                                        <th style={{ border: "1px solid #ddd", padding: "6px" }}>Call Date</th>
                                                        <th style={{ border: "1px solid #ddd", padding: "6px" }}>Follow-up Date</th>
                                                        <th style={{ border: "1px solid #ddd", padding: "6px" }}>Telecaller</th>
                                                        <th style={{ border: "1px solid #ddd", padding: "6px" }}>Status</th>
                                                        <th style={{ border: "1px solid #ddd", padding: "6px" }}>Remarks</th>
                                                    </tr>
                                                </thead>

                                                <tbody>
                                                    {followupHistory.map((item, index) => (
                                                        <tr key={index}>
                                                            <td style={{ border: "1px solid #ddd", padding: "6px" }}>
                                                                {formatDate(item.call_date)}
                                                            </td>

                                                            <td style={{ border: "1px solid #ddd", padding: "6px" }}>
                                                                {formatDate(item.followup_date)}
                                                            </td>

                                                            <td style={{ border: "1px solid #ddd", padding: "6px" }}>
                                                                {item.telecaller}
                                                            </td>

                                                            <td style={{ border: "1px solid #ddd", padding: "6px" }}>
                                                                {item.status}
                                                            </td>

                                                            <td style={{ border: "1px solid #ddd", padding: "6px" }}>
                                                                {item.remarks}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                        )}

                                    </div>

                                </div>

                            </div>


                            {/* FOOTER */}
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    gap: "10px",
                                    padding: "14px 20px",
                                    borderTop: "1px solid #ddd",
                                    background: "#fafafa"
                                }}
                            >

                                <button
                                    onClick={() => setShowNoteModal(false)}
                                    style={{
                                        background: "#fff",
                                        color: "#333",
                                        border: "1px solid #bbb",
                                        padding: "8px 18px",
                                        borderRadius: "5px",
                                        cursor: "pointer"
                                    }}
                                >
                                    Cancel
                                </button>


                                <button
                                    onClick={async () => {

                                        if (!followup.callDate) {
                                            alert("Please select Call Date");
                                            return;
                                        }

                                        if (!followup.status) {
                                            alert("Please select Status");
                                            return;
                                        }

                                        // Lost quotations are closed and do not need
                                        // a next follow-up date.
                                        if (
                                            followup.status.trim().toLowerCase() !== "lost" &&
                                            !followup.followupDate
                                        ) {
                                            alert("Please select Follow-up Date");
                                            return;
                                        }

                                        if (!followup.remarks.trim()) {
                                            alert("Please enter Remarks");
                                            return;
                                        }

                                        const payload = {
                                            party: selectedQuotation?.party || "",
                                            month: selectedQuotation?.month || "",
                                            quotationNo: selectedQuotation?.quotationNo || "",
                                            orderNo: selectedQuotation?.orderNo || "",
                                            invoiceNo: selectedQuotation?.invoiceNo || "",
                                            mobile: selectedQuotation?.mobile || "",

                                            address: selectedQuotation?.mailingAddress || "",

                                            quotation_status: selectedQuotation?.status || "",

                                            call_date: followup.callDate,
                                            followup_date:
                                                followup.status.trim().toLowerCase() === "lost"
                                                    ? ""
                                                    : followup.followupDate,
                                            telecaller: followup.telecaller,
                                            status: followup.status,
                                            remarks: followup.remarks,

                                            // When Negotiation is selected, the backend must create
                                            // an Alter Quotation Request and send an FCM push
                                            // notification with sound to the quotation team.
                                            alteration_required:
                                                String(followup.status || "").trim().toLowerCase() === "negotiation",
                                            alteration_request_status:
                                                String(followup.status || "").trim().toLowerCase() === "negotiation"
                                                    ? "Pending Alteration"
                                                    : ""
                                        };

                                        console.log("Saving follow-up:", payload);

                                        try {

                                            const response = await apiFetch(
                                                `${API}/add_quotation_followup.php`,

                                                {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type": "application/json"
                                                    },
                                                    body: JSON.stringify(payload)
                                                }
                                            );

                                            const result = await response.json();

                                            console.log("API Response:", result);

                                            if (result.success) {

                                                const isNegotiation =
                                                    String(followup.status || "")
                                                        .trim()
                                                        .toLowerCase() === "negotiation";

                                                if (isNegotiation) {
                                                    alert(
                                                        "Negotiation follow-up saved. Alter Quotation Alert has been created and sent to the quotation team."
                                                    );
                                                } else {
                                                    alert("Follow-up saved successfully");
                                                }

                                                setFollowupByQuotation(prev => ({
                                                    ...prev,
                                                    [selectedQuotation?.quotationNo || ""]: followup.telecaller || ""
                                                }));

                                                setShowNoteModal(false);

                                                // Clear form
                                                setFollowup({
                                                    callDate: new Date().toISOString().split("T")[0],
                                                    followupDate: "",
                                                    telecaller: telecallerName || "",
                                                    status: "",
                                                    remarks: ""
                                                });

                                            } else {

                                                alert(
                                                    result.message ||
                                                    "Failed to save follow-up"
                                                );

                                            }

                                        } catch (error) {

                                            console.error("Save follow-up error:", error);

                                            alert(
                                                "Unable to save follow-up. Please try again."
                                            );

                                        }

                                    }}
                                    style={{
                                        background: "#198754",
                                        color: "#fff",
                                        border: "none",
                                        padding: "8px 20px",
                                        borderRadius: "5px",
                                        cursor: "pointer",
                                        fontWeight: "600"
                                    }}
                                >
                                    Save
                                </button>

                            </div>

                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default QuotationWise;
