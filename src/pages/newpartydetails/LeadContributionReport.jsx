import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { apiFetch } from "../../api/apiClient";

const API = "/serverphp";

const LeadContributionReport = () => {
    const today = new Date();

    // =========================================================
    // DATE HELPER
    // =========================================================

    const formatInputDate = (date) => {
        const d = new Date(date);

        return `${d.getFullYear()}-${String(
            d.getMonth() + 1
        ).padStart(2, "0")}-${String(
            d.getDate()
        ).padStart(2, "0")}`;
    };

    // =========================================================
    // STATES
    // =========================================================

    const [fromDate, setFromDate] = useState(
        formatInputDate(today)
    );

    const [toDate, setToDate] = useState(
        formatInputDate(today)
    );

    const [selectedStaff, setSelectedStaff] = useState("all");

    const [loading, setLoading] = useState(false);

    const [error, setError] = useState("");

    const [summary, setSummary] = useState({
        total: 0,
        today: 0,
        week: 0,
        month: 0,
    });

    const [staffData, setStaffData] = useState([]);

    const [dailyData, setDailyData] = useState([]);

    const [leadData, setLeadData] = useState([]);

    // IMPORTANT:
    // This is separate from staffData so the dropdown
    // always contains all staff names.
    const [allStaff, setAllStaff] = useState([]);

    // =========================================================
    // LOAD REPORT
    // =========================================================

    const loadReport = async () => {
        setLoading(true);
        setError("");

        try {
            const response = await apiFetch(
                `${API}/get_lead_contribution.php`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                    },

                    body: JSON.stringify({
                        from_date: fromDate,
                        to_date: toDate,
                        added_by: selectedStaff,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok || result.success === false) {
                throw new Error(
                    result.message ||
                        "Failed to load lead contribution report"
                );
            }

            // =================================================
            // SUMMARY
            // =================================================

            setSummary({
                total: Number(
                    result.summary?.total || 0
                ),

                today: Number(
                    result.summary?.today || 0
                ),

                week: Number(
                    result.summary?.week || 0
                ),

                month: Number(
                    result.summary?.month || 0
                ),
            });

            // =================================================
            // ALL STAFF
            // =================================================

            setAllStaff(
                Array.isArray(result.all_staff)
                    ? result.all_staff
                    : []
            );

            // =================================================
            // STAFF CONTRIBUTION
            // =================================================

            setStaffData(
                Array.isArray(
                    result.staff_contribution
                )
                    ? result.staff_contribution
                    : []
            );

            // =================================================
            // DAILY CONTRIBUTION
            // =================================================

            setDailyData(
                Array.isArray(
                    result.daily_contribution
                )
                    ? result.daily_contribution
                    : []
            );

            // =================================================
            // LEADS
            // =================================================

            setLeadData(
                Array.isArray(result.leads)
                    ? result.leads
                    : []
            );

        } catch (err) {
            console.error(
                "Lead contribution report error:",
                err
            );

            setError(
                err.message ||
                    "Unable to load lead contribution report"
            );

            setSummary({
                total: 0,
                today: 0,
                week: 0,
                month: 0,
            });

            setStaffData([]);

            setDailyData([]);

            setLeadData([]);

        } finally {
            setLoading(false);
        }
    };

    // =========================================================
    // INITIAL LOAD
    // =========================================================

    useEffect(() => {
        loadReport();
    }, []);

    // =========================================================
    // STAFF LIST
    // =========================================================

    const staffList = useMemo(() => {
        return allStaff
            .filter(Boolean)
            .map((name) => String(name).trim())
            .filter(Boolean)
            .sort((a, b) =>
                a.localeCompare(b)
            );
    }, [allStaff]);

    // =========================================================
    // MAX DAILY VALUE
    // =========================================================

    const maxDailyValue = useMemo(() => {
        if (!dailyData.length) {
            return 1;
        }

        return Math.max(
            ...dailyData.map((item) =>
                Number(
                    item.lead_count ||
                        item.count ||
                        0
                )
            ),
            1
        );
    }, [dailyData]);

    // =========================================================
    // MAX STAFF VALUE
    // =========================================================

    const maxStaffValue = useMemo(() => {
        if (!staffData.length) {
            return 1;
        }

        return Math.max(
            ...staffData.map((item) =>
                Number(
                    item.lead_count ||
                        item.count ||
                        0
                )
            ),
            1
        );
    }, [staffData]);

    // =========================================================
    // FORMAT DATE
    // =========================================================

    const formatDate = (value) => {
        if (!value) {
            return "";
        }

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) {
            return value;
        }

        return d.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }
        );
    };

    // =========================================================
    // FORMAT DATE TIME
    // =========================================================

    const formatDateTime = (value) => {
        if (!value) {
            return "";
        }

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) {
            return value;
        }

        return d.toLocaleString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            }
        );
    };

    // =========================================================
    // STYLES
    // =========================================================

    const cardStyle = {
        background: "#ffffff",
        border: "1px solid #D9E2EC",
        borderRadius: "12px",
        padding: "18px",
        boxShadow:
            "0 2px 8px rgba(11, 37, 69, 0.08)",
    };

    const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        height: "40px",
        border: "1px solid #C9D6E4",
        borderRadius: "8px",
        padding: "0 11px",
        fontSize: "13px",
        background: "#ffffff",
        outline: "none",
        color: "#1F2937",
    };

    const buttonStyle = {
        height: "40px",
        padding: "0 20px",
        border: "none",
        borderRadius: "8px",

        background:
            "linear-gradient(135deg, #0B2545, #123B6D)",

        color: "#ffffff",
        fontWeight: "700",
        cursor: "pointer",
        fontSize: "13px",

        boxShadow:
            "0 3px 8px rgba(11, 37, 69, 0.20)",
    };

    // =========================================================
    // PAGE
    // =========================================================

    return (
        <div
            style={{
                minHeight: "100vh",

                background: "#F4F7FB",

                color: "#1F2937",
            }}
        >

            <Banner />

            {/* =====================================================
                HEADER
            ====================================================== */}

            <div
                style={{
                    background:
                        "linear-gradient(135deg, #0B2545, #123B6D)",

                    padding: "18px 20px",

                    boxShadow:
                        "0 3px 10px rgba(11,37,69,0.20)",
                }}
            >

                <h1
                    style={{
                        margin: 0,

                        textAlign: "center",

                        color: "#FFFFFF",

                        fontSize: "26px",

                        fontWeight: "800",

                        letterSpacing: "0.2px",
                    }}
                >
                    Lead Contribution Report
                </h1>

                <div
                    style={{
                        textAlign: "center",

                        color: "#DCEAF7",

                        fontSize: "12px",

                        marginTop: "5px",
                    }}
                >
                    New Lead • Staff-wise & Date-wise
                    Contribution
                </div>

            </div>

            {/* =====================================================
                MAIN
            ====================================================== */}

            <div
                style={{
                    padding: "18px",

                    maxWidth: "1500px",

                    margin: "0 auto",

                    boxSizing: "border-box",
                }}
            >

                {/* =================================================
                    FILTERS
                ================================================== */}

                <div
                    style={{
                        ...cardStyle,

                        marginBottom: "18px",
                    }}
                >

                    <div
                        style={{
                            display: "grid",

                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(180px, 1fr))",

                            gap: "12px",

                            alignItems: "end",
                        }}
                    >

                        {/* FROM DATE */}

                        <div>

                            <label
                                style={{
                                    display: "block",

                                    fontSize: "12px",

                                    fontWeight: "700",

                                    color: "#475569",

                                    marginBottom: "6px",
                                }}
                            >
                                From Date
                            </label>

                            <input
                                type="date"

                                value={fromDate}

                                onChange={(e) =>
                                    setFromDate(
                                        e.target.value
                                    )
                                }

                                style={inputStyle}
                            />

                        </div>

                        {/* TO DATE */}

                        <div>

                            <label
                                style={{
                                    display: "block",

                                    fontSize: "12px",

                                    fontWeight: "700",

                                    color: "#475569",

                                    marginBottom: "6px",
                                }}
                            >
                                To Date
                            </label>

                            <input
                                type="date"

                                value={toDate}

                                onChange={(e) =>
                                    setToDate(
                                        e.target.value
                                    )
                                }

                                style={inputStyle}
                            />

                        </div>

                        {/* ADDED BY */}

                        <div>

                            <label
                                style={{
                                    display: "block",

                                    fontSize: "12px",

                                    fontWeight: "700",

                                    color: "#475569",

                                    marginBottom: "6px",
                                }}
                            >
                                Added By
                            </label>

                            <select
                                value={selectedStaff}

                                onChange={(e) =>
                                    setSelectedStaff(
                                        e.target.value
                                    )
                                }

                                style={inputStyle}
                            >

                                <option value="all">
                                    All Staff
                                </option>

                                {staffList.map(
                                    (name) => (
                                        <option
                                            key={name}
                                            value={name}
                                        >
                                            {name}
                                        </option>
                                    )
                                )}

                            </select>

                        </div>

                        {/* APPLY BUTTON */}

                        <button
                            type="button"

                            onClick={loadReport}

                            disabled={loading}

                            style={{
                                ...buttonStyle,

                                opacity:
                                    loading
                                        ? 0.6
                                        : 1,
                            }}
                        >
                            {loading
                                ? "Loading..."
                                : "Apply Filter"}
                        </button>

                    </div>

                </div>

                {/* =================================================
                    ERROR
                ================================================== */}

                {error && (
                    <div
                        style={{
                            background:
                                "#FEF2F2",

                            border:
                                "1px solid #FECACA",

                            color:
                                "#991B1B",

                            padding:
                                "12px 14px",

                            borderRadius:
                                "9px",

                            marginBottom:
                                "15px",

                            fontSize:
                                "13px",
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* =================================================
                    SUMMARY CARDS
                ================================================== */}

                <div
                    style={{
                        display: "grid",

                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(190px, 1fr))",

                        gap: "14px",

                        marginBottom: "18px",
                    }}
                >

                    {/* TOTAL */}

                    <div style={cardStyle}>

                        <div
                            style={{
                                color: "#64748B",

                                fontSize: "11px",

                                fontWeight: "800",

                                letterSpacing:
                                    "0.5px",
                            }}
                        >
                            TOTAL LEADS
                        </div>

                        <div
                            style={{
                                marginTop: "8px",

                                fontSize: "31px",

                                fontWeight: "800",

                                color: "#123B6D",
                            }}
                        >
                            {summary.total}
                        </div>

                        <div
                            style={{
                                fontSize: "11px",

                                color: "#94A3B8",

                                marginTop: "3px",
                            }}
                        >
                            Selected date range
                        </div>

                    </div>

                    {/* TODAY */}

                    <div style={cardStyle}>

                        <div
                            style={{
                                color: "#64748B",

                                fontSize: "11px",

                                fontWeight: "800",

                                letterSpacing:
                                    "0.5px",
                            }}
                        >
                            TODAY
                        </div>

                        <div
                            style={{
                                marginTop: "8px",

                                fontSize: "31px",

                                fontWeight: "800",

                                color: "#1E5A96",
                            }}
                        >
                            {summary.today}
                        </div>

                        <div
                            style={{
                                fontSize: "11px",

                                color: "#94A3B8",

                                marginTop: "3px",
                            }}
                        >
                            Leads created today
                        </div>

                    </div>

                    {/* WEEK */}

                    <div style={cardStyle}>

                        <div
                            style={{
                                color: "#64748B",

                                fontSize: "11px",

                                fontWeight: "800",

                                letterSpacing:
                                    "0.5px",
                            }}
                        >
                            THIS WEEK
                        </div>

                        <div
                            style={{
                                marginTop: "8px",

                                fontSize: "31px",

                                fontWeight: "800",

                                color: "#315F8F",
                            }}
                        >
                            {summary.week}
                        </div>

                        <div
                            style={{
                                fontSize: "11px",

                                color: "#94A3B8",

                                marginTop: "3px",
                            }}
                        >
                            Monday to today
                        </div>

                    </div>

                    {/* MONTH */}

                    <div style={cardStyle}>

                        <div
                            style={{
                                color: "#64748B",

                                fontSize: "11px",

                                fontWeight: "800",

                                letterSpacing:
                                    "0.5px",
                            }}
                        >
                            THIS MONTH
                        </div>

                        <div
                            style={{
                                marginTop: "8px",

                                fontSize: "31px",

                                fontWeight: "800",

                                color: "#244E77",
                            }}
                        >
                            {summary.month}
                        </div>

                        <div
                            style={{
                                fontSize: "11px",

                                color: "#94A3B8",

                                marginTop: "3px",
                            }}
                        >
                            Current month
                        </div>

                    </div>

                </div>

                {/* =================================================
                    STAFF + DAILY GRAPH
                ================================================== */}

                <div
                    style={{
                        display: "grid",

                        gridTemplateColumns:
                            "minmax(300px, 0.9fr) minmax(450px, 1.4fr)",

                        gap: "18px",

                        marginBottom: "18px",
                    }}
                >

                    {/* =================================================
                        STAFF CONTRIBUTION
                    ================================================== */}

                    <div style={cardStyle}>

                        <div
                            style={{
                                display: "flex",

                                justifyContent:
                                    "space-between",

                                alignItems:
                                    "center",

                                marginBottom:
                                    "14px",
                            }}
                        >

                            <h2
                                style={{
                                    margin: 0,

                                    fontSize: "17px",

                                    color: "#0B2545",
                                }}
                            >
                                Staff Contribution
                            </h2>

                            <span
                                style={{
                                    fontSize: "11px",

                                    color: "#94A3B8",
                                }}
                            >
                                Leads Added
                            </span>

                        </div>

                        {staffData.length === 0 ? (

                            <div
                                style={{
                                    padding:
                                        "30px 10px",

                                    textAlign:
                                        "center",

                                    color:
                                        "#94A3B8",

                                    fontSize:
                                        "13px",
                                }}
                            >
                                No lead data found
                            </div>

                        ) : (

                            <div
                                style={{
                                    maxHeight:
                                        "400px",

                                    overflowY:
                                        "auto",

                                    paddingRight:
                                        "4px",
                                }}
                            >

                                {staffData.map(
                                    (
                                        item,
                                        index
                                    ) => {

                                        const name =
                                            item.added_by ||
                                            "Unknown";

                                        const count =
                                            Number(
                                                item.lead_count ||
                                                    item.count ||
                                                    0
                                            );

                                        const percentage =
                                            summary.total >
                                            0
                                                ? (
                                                      (count /
                                                          summary.total) *
                                                      100
                                                  ).toFixed(
                                                      1
                                                  )
                                                : "0.0";

                                        return (
                                            <div
                                                key={`${name}-${index}`}

                                                style={{
                                                    padding:
                                                        "11px 0",

                                                    borderBottom:
                                                        "1px solid #E8EEF5",
                                                }}
                                            >

                                                <div
                                                    style={{
                                                        display:
                                                            "flex",

                                                        justifyContent:
                                                            "space-between",

                                                        alignItems:
                                                            "center",

                                                        marginBottom:
                                                            "6px",
                                                    }}
                                                >

                                                    <div
                                                        style={{
                                                            fontWeight:
                                                                "700",

                                                            fontSize:
                                                                "13px",

                                                            color:
                                                                "#334155",
                                                        }}
                                                    >
                                                        {name}
                                                    </div>

                                                    <div
                                                        style={{
                                                            fontWeight:
                                                                "800",

                                                            color:
                                                                "#123B6D",
                                                        }}
                                                    >
                                                        {count}
                                                    </div>

                                                </div>

                                                <div
                                                    style={{
                                                        height:
                                                            "7px",

                                                        background:
                                                            "#E5EDF5",

                                                        borderRadius:
                                                            "10px",

                                                        overflow:
                                                            "hidden",
                                                    }}
                                                >

                                                    <div
                                                        style={{
                                                            height:
                                                                "100%",

                                                            width: `${Math.max(
                                                                2,
                                                                (count /
                                                                    maxStaffValue) *
                                                                    100
                                                            )}%`,

                                                            background:
                                                                "linear-gradient(90deg, #0B2545, #1E5A96)",

                                                            borderRadius:
                                                                "10px",

                                                            transition:
                                                                "width .3s ease",
                                                        }}
                                                    />

                                                </div>

                                                <div
                                                    style={{
                                                        marginTop:
                                                            "4px",

                                                        fontSize:
                                                            "10px",

                                                        color:
                                                            "#94A3B8",
                                                    }}
                                                >
                                                    {percentage}%
                                                    {" "}
                                                    of selected
                                                    leads
                                                </div>

                                            </div>
                                        );
                                    }
                                )}

                            </div>
                        )}

                    </div>

                    {/* =================================================
                        DAILY GRAPH
                    ================================================== */}

                    <div style={cardStyle}>

                        <div
                            style={{
                                display: "flex",

                                justifyContent:
                                    "space-between",

                                alignItems:
                                    "center",

                                marginBottom:
                                    "15px",

                                gap: "10px",
                            }}
                        >

                            <h2
                                style={{
                                    margin: 0,

                                    fontSize: "17px",

                                    color: "#0B2545",
                                }}
                            >
                                Daily Lead Contribution
                            </h2>

                            <span
                                style={{
                                    fontSize: "11px",

                                    color: "#94A3B8",

                                    whiteSpace:
                                        "nowrap",
                                }}
                            >
                                {fromDate} → {toDate}
                            </span>

                        </div>

                        {dailyData.length === 0 ? (

                            <div
                                style={{
                                    padding:
                                        "60px 10px",

                                    textAlign:
                                        "center",

                                    color:
                                        "#94A3B8",

                                    fontSize:
                                        "13px",
                                }}
                            >
                                No daily data found
                            </div>

                        ) : (

                            <div
                                style={{
                                    height:
                                        "330px",

                                    overflowX:
                                        "auto",

                                    overflowY:
                                        "hidden",

                                    padding:
                                        "10px 5px 0",

                                    boxSizing:
                                        "border-box",
                                }}
                            >

                                <div
                                    style={{
                                        display:
                                            "flex",

                                        alignItems:
                                            "flex-end",

                                        gap: "12px",

                                        minWidth: `${Math.max(
                                            dailyData.length *
                                                55,
                                            500
                                        )}px`,

                                        height:
                                            "280px",

                                        borderBottom:
                                            "1px solid #DCE5EE",

                                        padding:
                                            "0 10px",
                                    }}
                                >

                                    {dailyData.map(
                                        (
                                            item,
                                            index
                                        ) => {

                                            const count =
                                                Number(
                                                    item.lead_count ||
                                                        item.count ||
                                                        0
                                                );

                                            const height =
                                                Math.max(
                                                    5,

                                                    (count /
                                                        maxDailyValue) *
                                                        220
                                                );

                                            return (
                                                <div
                                                    key={`${item.date}-${index}`}

                                                    style={{
                                                        flex:
                                                            "1 0 38px",

                                                        height:
                                                            "100%",

                                                        display:
                                                            "flex",

                                                        flexDirection:
                                                            "column",

                                                        justifyContent:
                                                            "flex-end",

                                                        alignItems:
                                                            "center",
                                                    }}
                                                >

                                                    <div
                                                        style={{
                                                            fontSize:
                                                                "11px",

                                                            fontWeight:
                                                                "700",

                                                            color:
                                                                "#123B6D",

                                                            marginBottom:
                                                                "4px",
                                                        }}
                                                    >
                                                        {count}
                                                    </div>

                                                    <div
                                                        title={`${formatDate(
                                                            item.date
                                                        )}: ${count} leads`}

                                                        style={{
                                                            width:
                                                                "28px",

                                                            height:
                                                                `${height}px`,

                                                            background:
                                                                "linear-gradient(180deg, #1E5A96, #123B6D)",

                                                            borderRadius:
                                                                "6px 6px 0 0",

                                                            transition:
                                                                "height .2s ease",

                                                            boxShadow:
                                                                "0 2px 5px rgba(11,37,69,0.15)",
                                                        }}
                                                    />

                                                    <div
                                                        style={{
                                                            marginTop:
                                                                "7px",

                                                            fontSize:
                                                                "9px",

                                                            color:
                                                                "#64748B",

                                                            whiteSpace:
                                                                "nowrap",

                                                            transform:
                                                                "rotate(-45deg)",

                                                            transformOrigin:
                                                                "top center",

                                                            height:
                                                                "35px",
                                                        }}
                                                    >
                                                        {formatDate(
                                                            item.date
                                                        )}
                                                    </div>

                                                </div>
                                            );
                                        }
                                    )}

                                </div>

                            </div>
                        )}

                    </div>

                </div>

                {/* =================================================
                    LEAD DETAILS
                ================================================== */}

                <div style={cardStyle}>

                    <div
                        style={{
                            display: "flex",

                            justifyContent:
                                "space-between",

                            alignItems:
                                "center",

                            marginBottom:
                                "14px",

                            gap: "10px",

                            flexWrap:
                                "wrap",
                        }}
                    >

                        <h2
                            style={{
                                margin: 0,

                                fontSize: "17px",

                                color: "#0B2545",
                            }}
                        >
                            Lead Details
                        </h2>

                        <div
                            style={{
                                fontSize: "12px",

                                color: "#123B6D",

                                background:
                                    "#EAF1F8",

                                padding:
                                    "5px 10px",

                                borderRadius:
                                    "20px",

                                fontWeight:
                                    "700",
                            }}
                        >
                            {leadData.length} leads
                        </div>

                    </div>

                    {/* =================================================
                        TABLE
                    ================================================== */}

                    <div
                        style={{
                            overflowX:
                                "auto",

                            maxHeight:
                                "520px",

                            overflowY:
                                "auto",
                        }}
                    >

                        <table
                            style={{
                                width:
                                    "100%",

                                borderCollapse:
                                    "collapse",

                                minWidth:
                                    "850px",

                                fontSize:
                                    "12px",
                            }}
                        >

                            <thead>

                                <tr>

                                    {[
                                        "#",
                                        "Date",
                                        "Added By",
                                        "Party Name",
                                        "Group",
                                        "Mobile",
                                        "Source",
                                    ].map(
                                        (
                                            heading
                                        ) => (

                                            <th
                                                key={
                                                    heading
                                                }

                                                style={{
                                                    position:
                                                        "sticky",

                                                    top:
                                                        0,

                                                    background:
                                                        "linear-gradient(90deg, #0B2545, #123B6D)",

                                                    color:
                                                        "#FFFFFF",

                                                    padding:
                                                        "10px 8px",

                                                    border:
                                                        "1px solid #D5DEE8",

                                                    textAlign:
                                                        "center",

                                                    zIndex:
                                                        2,

                                                    fontWeight:
                                                        "700",
                                                }}
                                            >
                                                {
                                                    heading
                                                }
                                            </th>

                                        )
                                    )}

                                </tr>

                            </thead>

                            <tbody>

                                {leadData.length ===
                                0 ? (

                                    <tr>

                                        <td
                                            colSpan="7"

                                            style={{
                                                padding:
                                                    "35px",

                                                textAlign:
                                                    "center",

                                                color:
                                                    "#94A3B8",
                                            }}
                                        >
                                            No leads found
                                        </td>

                                    </tr>

                                ) : (

                                    leadData.map(
                                        (
                                            lead,
                                            index
                                        ) => (

                                            <tr
                                                key={
                                                    lead.id ||
                                                    `${lead.party_ledger_name}-${index}`
                                                }

                                                style={{
                                                    background:
                                                        index %
                                                            2 ===
                                                        0
                                                            ? "#FFFFFF"
                                                            : "#F8FAFC",
                                                }}
                                            >

                                                {/* # */}

                                                <td
                                                    style={{
                                                        padding:
                                                            "8px",

                                                        border:
                                                            "1px solid #E2E8F0",

                                                        textAlign:
                                                            "center",

                                                        color:
                                                            "#64748B",
                                                    }}
                                                >
                                                    {index +
                                                        1}
                                                </td>

                                                {/* DATE */}

                                                <td
                                                    style={{
                                                        padding:
                                                            "8px",

                                                        border:
                                                            "1px solid #E2E8F0",

                                                        whiteSpace:
                                                            "nowrap",

                                                        color:
                                                            "#475569",
                                                    }}
                                                >
                                                    {formatDateTime(
                                                        lead.created_at ||
                                                            lead.date
                                                    )}
                                                </td>

                                                {/* ADDED BY */}

                                                <td
                                                    style={{
                                                        padding:
                                                            "8px",

                                                        border:
                                                            "1px solid #E2E8F0",

                                                        fontWeight:
                                                            "700",

                                                        color:
                                                            "#123B6D",
                                                    }}
                                                >
                                                    {lead.added_by ||
                                                        ""}
                                                </td>

                                                {/* PARTY */}

                                                <td
                                                    style={{
                                                        padding:
                                                            "8px",

                                                        border:
                                                            "1px solid #E2E8F0",

                                                        fontWeight:
                                                            "600",

                                                        color:
                                                            "#1E293B",
                                                    }}
                                                >
                                                    {lead.party_ledger_name ||
                                                        ""}
                                                </td>

                                                {/* GROUP */}

                                                <td
                                                    style={{
                                                        padding:
                                                            "8px",

                                                        border:
                                                            "1px solid #E2E8F0",

                                                        color:
                                                            "#475569",
                                                    }}
                                                >
                                                    {lead.group_name ||
                                                        ""}
                                                </td>

                                                {/* MOBILE */}

                                                <td
                                                    style={{
                                                        padding:
                                                            "8px",

                                                        border:
                                                            "1px solid #E2E8F0",

                                                        whiteSpace:
                                                            "nowrap",

                                                        color:
                                                            "#475569",
                                                    }}
                                                >
                                                    {lead.mobile ||
                                                        ""}
                                                </td>

                                                {/* SOURCE */}

                                                <td
                                                    style={{
                                                        padding:
                                                            "8px",

                                                        border:
                                                            "1px solid #E2E8F0",

                                                        color:
                                                            "#64748B",
                                                    }}
                                                >
                                                    {lead.referred_by ||
                                                        ""}
                                                </td>

                                            </tr>

                                        )
                                    )

                                )}

                            </tbody>

                        </table>

                    </div>

                </div>

            </div>

        </div>
    );
};

export default LeadContributionReport;