import Banner from "../../components/Banner/Banner.jsx";

import React, { useEffect, useState } from "react";

import "./TenderExecutive.css";

import * as XLSX from "xlsx";

import { saveAs } from "file-saver";

import { auth, db } from "../../components/firebase";

import { onAuthStateChanged } from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";

import { FaBars } from "react-icons/fa";

import { apiFetch } from "../../api/apiClient";

const API = "/serverphp";

const TenderExecutive = () => {

    const [tenders, setTenders] = useState([]);

    const [search, setSearch] = useState("");

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    const [editingId, setEditingId] = useState(null);

    const [filterDate, setFilterDate] = useState("");

    const [loggedUser, setLoggedUser] = useState("");

    const [fromDate, setFromDate] = useState("");

    const [toDate, setToDate] = useState("");

    const [userRole, setUserRole] = useState("");

    const [authorized, setAuthorized] = useState(false);

    const [checkingAccess, setCheckingAccess] = useState(true);

    const [previewImage, setPreviewImage] = useState(null);

    const [showFilters, setShowFilters] = useState(false);

    const [statusFilter, setStatusFilter] = useState("All");

    const [editData, setEditData] = useState({
        comparisonFile: null,
        comparisonText: "",
        order_received_status: "",
    });

    useEffect(() => {

        const unsubscribe = onAuthStateChanged(auth, async (user) => {

            if (!user) return;

            try {

                const docRef = doc(db, "Users", user.uid);

                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {

                    const userData = docSnap.data();

                    const fullName =

                        `${userData.firstName || ""} ${userData.lastName || ""}`.trim();

                    setLoggedUser(userData.firstName || "");

                }

                // LOAD TENDERS

                fetchTenders();

            } catch (err) {

                console.log(err);

            }

        });

        return () => unsubscribe();

    }, []);

    const fetchTenders = async () => {

        try {

            const res = await apiFetch(`${API}/get_tenders.php`);

            const data = await res.json();

            setTenders(data);

        } catch (err) {

            console.error(err);

        }

    };

    const updateTender = async (id) => {

        try {

            const formData = new FormData();

            formData.append("id", id);

            if (editData.comparisonFile) {

                formData.append(

                    "comparisonFile",

                    editData.comparisonFile

                );

            }

            formData.append(
                "comparisonText",
                editData.comparisonText || ""
            );

            formData.append(
                "order_received_status",

                editData.order_received_status

            );

            const res = await apiFetch(

                `${API}/update_comparison.php`,

                {

                    method: "POST",

                    body: formData,

                }

            );

            const data = await res.json();

            if (data.success) {

                fetchTenders();

                setEditingId(null);

            }

        } catch (err) {

            console.error(err);

        }

    };

    const formatTime12Hour = (time) => {

        if (!time) return "-";

        let [hours, minutes] = time.split(":");

        hours = parseInt(hours, 10);

        // Convert to 12-hour format without AM/PM

        hours = hours % 12 || 12;

        return `${hours}:${minutes}`;

    };

    const formatDate = (date) => {

        if (!date) return "-";

        const d = new Date(date.replace(" ", "T"));

        const day = String(d.getDate()).padStart(2, "0");

        const month = d.toLocaleString("en-GB", { month: "long" });

        const year = d.getFullYear();

        return `${day} - ${month} - ${year}`;

    };

    const filteredTenders = tenders.filter((item) => {

        const matchesExecutive =

            !loggedUser ||

            item.executive_name?.trim().toLowerCase() ===

            loggedUser.trim().toLowerCase();

        const matchesSearch = Object.values(item)

            .join(" ")

            .toLowerCase()

            .includes(search.toLowerCase());

        const matchesDate =

            !filterDate || item.opening_date === filterDate;

        // Treat empty status as Active

        const status = (item.order_received_status || "Active").trim();

        const matchesStatus =

            statusFilter === "All"

                ? true

                : status.toLowerCase() === statusFilter.toLowerCase();

        return (

            matchesExecutive &&

            matchesSearch &&

            matchesDate &&

            matchesStatus

        );

    });

    const parseTimestamp = (ts) =>

        ts ? new Date(ts.replace(" ", "T")).getTime() || 0 : 0;

    // Newest timestamp first

    const sortedTenders = [...filteredTenders].sort(

        (a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp)

    );

    const groupedTenders = sortedTenders.reduce((acc, tender) => {

        if (!tender.timestamp) return acc;

        const date = new Date(tender.timestamp.replace(" ", "T"));

        const month = date.toLocaleString("default", {

            month: "long",

            year: "numeric",

        });

        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);

        const week =

            Math.ceil((date.getDate() + firstDay.getDay()) / 7);

        if (!acc[month]) acc[month] = {};

        if (!acc[month][`Week ${week}`]) {

            acc[month][`Week ${week}`] = [];

        }

        acc[month][`Week ${week}`].push(tender);

        return acc;

    }, {});

    useEffect(() => {

        const handleResize = () => {

            setIsMobile(window.innerWidth <= 768);

        };

        window.addEventListener("resize", handleResize);

        return () => {

            window.removeEventListener("resize", handleResize);

        };

    }, []);

    const isTenderOpened = (openingDate, openingTime) => {

        const now = new Date();

        const tenderDateTime = new Date(

            `${openingDate} ${openingTime}`

        );

        return now >= tenderDateTime;

    };

    const handleComparisonFile = (e) => {

        setEditData((prev) => ({

            ...prev,

            comparisonFile: e.target.files[0],

        }));

    };

    const today = new Date().toISOString().split("T")[0];

    const getCountdown = (openingDate) => {

        if (!openingDate) return null;

        const today = new Date();

        today.setHours(0, 0, 0, 0);

        const openDate = new Date(openingDate);

        openDate.setHours(0, 0, 0, 0);

        const diff = openDate - today;

        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        // Remove countdown on opening day and after

        if (days <= 0) return null;

        let text = "";

        if (days >= 365) {

            const years = Math.floor(days / 365);

            const months = Math.floor((days % 365) / 30);

            const remDays = days % 30;

            text =

                `${years} Year${years > 1 ? "s" : ""}` +

                (months ? ` ${months} Month${months > 1 ? "s" : ""}` : "") +

                (remDays ? ` ${remDays} Day${remDays > 1 ? "s" : ""}` : "");

        } else if (days >= 30) {

            const months = Math.floor(days / 30);

            const remDays = days % 30;

            text =

                `${months} Month${months > 1 ? "s" : ""}` +

                (remDays ? ` ${remDays} Day${remDays > 1 ? "s" : ""}` : "");

        } else {

            text = `${days} Day${days > 1 ? "s" : ""}`;

        }

        return {

            text,

            color: days <= 3 ? "#dc2626" : "#16a34a",

        };

    };

    const getCountdownBar = (openingDate) => {

        if (!openingDate) return null;

        const today = new Date();

        today.setHours(0, 0, 0, 0);

        const open = new Date(openingDate);

        open.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((open - today) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) return null;

        const maxDays = 30;

        // Percentage remaining (0-100)

        const percentage = Math.min((diffDays / maxDays) * 100, 100);

        // Convert to 5 battery blocks

        const blocks = Math.max(1, Math.ceil(percentage / 20));

        let color = "#22c55e"; // Green

        if (diffDays <= 3) {

            color = "#ef4444"; // Red (3 days or less)

        } else if (diffDays <= 7) {

            color = "#f59e0b"; // Orange (4-7 days)

        }

        return {

            percentage,

            blocks,

            color,

            days: diffDays,

        };

    };

    const getStatusColor = (status) => {

        if (status === "Won") return "#16a34a"; // Green

        if (status === "Lost") return "#dc2626"; // Red

        return "#555";

    };

    return (

        <div className="tender-container">

            <Banner />

            <div className="tender-header">

                <h2>Tender Details</h2>

            </div>

            <div className="tender-filter-menu-container">

                <button

                    className="tender-filter-icon-btn"

                    onClick={() => setShowFilters(!showFilters)}

                >

                    <FaBars />

                </button>

                {showFilters && (

                    <div className="tender-filter-dropdown">

                        <div className="tender-filter-group">

                            <label>Status</label>

                            <select

                                value={statusFilter}

                                onChange={(e) => setStatusFilter(e.target.value)}

                            >

                                <option value="All">All</option>

                                <option value="Active">Active</option>

                                <option value="Won">Won</option>

                                <option value="Lost">Lost</option>

                            </select>

                        </div>

                        <button

                            className="tender-clear-filter-btn"

                            onClick={() => {

                                setSearch("");

                                setFilterDate("");

                                setStatusFilter("All");

                            }}

                        >

                            Clear Filters

                        </button>

                    </div>

                )}

            </div>

            <div className="tender-filter-row">

                <div className="tender-filter-left">

                    {/* Leave empty or add another control */}

                </div>

                <div className="tender-filter-center">

                    <input

                        type="text"

                        placeholder="Search..."

                        className="search-box"

                        value={search}

                        onChange={(e) => setSearch(e.target.value)}

                    />

                </div>

                <div className="tender-filter-right">

                    <div className="tender-date-filter">

                        <label>Opening Date</label>

                        <input

                            type="date"

                            value={filterDate}

                            onChange={(e) => setFilterDate(e.target.value)}

                        />

                    </div>

                    <button

                        className="tender-clear-filter-btn"

                        onClick={() => {

                            setSearch("");

                            setFilterDate("");

                        }}

                    >

                        Clear

                    </button>

                </div>

            </div>

            <div className="tender-table-wrapper">

                {!isMobile ? (

                    <table className="tender-table">

                        <thead>

                            <tr>

                                <th>ID</th>

                                <th>Timestamp</th>

                                <th>KSEB Office</th>

                                <th>Opening Date</th>

                                <th>Opening Time</th>

                                <th>Quotation Notice No</th>

                                <th>Quotation Date</th>

                                <th>Tender Item Data</th>

                                <th className="tender-sku-column">SKU Rate</th>

                                <th>Submission Last Date</th>

                                <th>Tender Photo</th>

                                <th>Order Received Status</th>

                                <th>Comparison</th>

                                <th>Action</th>

                            </tr>

                        </thead>

                        <tbody>

                            {Object.entries(groupedTenders).map(([month, weeks]) => (

                                <React.Fragment key={month}>

                                    <tr className="tender-month-header">

                                        <td colSpan={100}>

                                            {month}

                                        </td>

                                    </tr>

                                    {Object.entries(weeks).map(([week, weekTenders]) => (

                                        <React.Fragment key={week}>

                                            <tr className="tender-week-header">

                                                <td colSpan={100}>

                                                    {week}

                                                </td>

                                            </tr>

                                            {weekTenders.map((item) => (

                                                <tr

                                                    key={item.id}

                                                    className={item.opening_date === today ? "today-row" : ""}

                                                >

                                                    <td>{item.id}</td>

                                                    <td>

                                                        {formatDate(item.timestamp)}

                                                    </td>

                                                    <td>{item.tender_invited_kseb_office}</td>

                                                    <td>

                                                        <div>{formatDate(item.opening_date)}</div>

                                                        {getCountdownBar(item.opening_date) && (

                                                            <div style={{ marginTop: "6px" }}>

                                                                <div

                                                                    style={{

                                                                        display: "flex",

                                                                        alignItems: "center",

                                                                        gap: "2px",

                                                                        border: "2px solid #555",

                                                                        borderRadius: "4px",

                                                                        padding: "2px",

                                                                        width: "58px",

                                                                        height: "18px",

                                                                        position: "relative",

                                                                        background: "#fff",

                                                                    }}

                                                                >

                                                                    {[1, 2, 3, 4, 5].map((block) => (

                                                                        <div

                                                                            key={block}

                                                                            style={{

                                                                                flex: 1,

                                                                                height: "100%",

                                                                                borderRadius: "1px",

                                                                                background:

                                                                                    block <= getCountdownBar(item.opening_date).blocks

                                                                                        ? getCountdownBar(item.opening_date).color

                                                                                        : "#d1d5db",

                                                                                transition: "0.3s",

                                                                            }}

                                                                        />

                                                                    ))}

                                                                    {/* Battery Terminal */}

                                                                    <div

                                                                        style={{

                                                                            position: "absolute",

                                                                            right: "-5px",

                                                                            top: "4px",

                                                                            width: "4px",

                                                                            height: "8px",

                                                                            background: "#555",

                                                                            borderRadius: "0 2px 2px 0",

                                                                        }}

                                                                    />

                                                                </div>

                                                                <div

                                                                    style={{

                                                                        fontSize: "11px",

                                                                        textAlign: "center",

                                                                        marginTop: "3px",

                                                                        fontWeight: "bold",

                                                                        color: getCountdownBar(item.opening_date).color,

                                                                    }}

                                                                >

                                                                    {getCountdownBar(item.opening_date).days} Days Left

                                                                </div>

                                                            </div>

                                                        )}

                                                    </td>

                                                    <td>{formatTime12Hour(item.opening_time)}</td>

                                                    <td>{item.quotation_notice_no}</td>

                                                    <td>{formatDate(item.quotation_date)}</td>

                                                    <td>

                                                        <ol className="tender-item-list">

                                                            {item.tender_item_data

                                                                ?.split("\n")

                                                                .filter(line => line.trim() !== "")

                                                                .map((line, index) => (

                                                                    <li key={index}>{line}</li>

                                                                ))}

                                                        </ol>

                                                    </td>

<td className="tender-sku-column">

                                                        {isTenderOpened(item.opening_date, item.opening_time) ? (

                                                            <div className="tender-sku-rate-text">

                                                                {item.sku_rate}

                                                            </div>

                                                        ) : (

                                                            "Locked"

                                                        )}

                                                    </td>

                                                    <td>{formatDate(item.quotation_submission_last_date)}</td>

                                                    <td>

                                                        {isTenderOpened(item.opening_date, item.opening_time) ? (

                                                            item.tender_photo_url ? (

                                                                <img

                                                                    src={`/serverphp${item.tender_photo_url}`}

                                                                    alt="Tender"

                                                                    width="80"

                                                                    onClick={() =>

                                                                        setPreviewImage(item.tender_photo_url)

                                                                    }

                                                                />

                                                            ) : "-"

                                                        ) : (

                                                            "Locked"

                                                        )}

                                                    </td>

                                                    <td>

                                                        {editingId === item.id ? (

                                                            <select

                                                                value={editData.order_received_status}

                                                                onChange={(e) =>

                                                                    setEditData((prev) => ({

                                                                        ...prev,

                                                                        order_received_status: e.target.value,

                                                                    }))

                                                                }

                                                                className="tender-status-dropdown"

                                                            >

                                                                <option value="">Select</option>

                                                                <option value="Won">Won</option>

                                                                <option value="Lost">Lost</option>

                                                                <option value="Active">Active</option>

                                                            </select>

                                                        ) : (

                                                            <span

                                                                className={

                                                                    item.order_received_status?.trim().toLowerCase() === "won"

                                                                        ? "tender-status-won"

                                                                        : item.order_received_status?.trim().toLowerCase() === "lost"

                                                                            ? "tender-status-lost"

                                                                            : "tender-status-active"

                                                                }

                                                            >

                                                                {item.order_received_status || "Active"}

                                                            </span>

                                                        )}

                                                    </td>

                                                    <td className="comparison-column">

                                                        {isTenderOpened(item.opening_date, item.opening_time) ? (

                                                            <>

                                                                {item.comparison && (
                                                                    <div className="comparison-preview-wrapper">
                                                                        <img
                                                                            src={`/serverphp${item.comparison}`}
                                                                            alt="Comparison"
                                                                            className="comparison-preview-image"
                                                                            onClick={() => setPreviewImage(item.comparison)}
                                                                        />
                                                                    </div>
                                                                )}

                                                                {item.comparison_text && editingId !== item.id && (
                                                                    <div className="comparison-text-display">
                                                                        {item.comparison_text}
                                                                    </div>
                                                                )}

                                                                {editingId === item.id && (
                                                                    <div className="comparison-edit-box">
                                                                        <div className="comparison-file-section">
                                                                            <label className="comparison-label">
                                                                                Upload Comparison Image
                                                                            </label>
                                                                            <input
                                                                                type="file"
                                                                                accept="image/*"
                                                                                onChange={handleComparisonFile}
                                                                                className="comparison-file-input"
                                                                            />
                                                                        </div>

                                                                        <div className="comparison-or">
                                                                            <span>OR</span>
                                                                        </div>

                                                                        <div className="comparison-text-section">
                                                                            <label className="comparison-label">
                                                                                Type Comparison
                                                                            </label>
                                                                            <textarea
                                                                                value={editData.comparisonText}
                                                                                onChange={(e) =>
                                                                                    setEditData((prev) => ({
                                                                                        ...prev,
                                                                                        comparisonText: e.target.value,
                                                                                    }))
                                                                                }
                                                                                placeholder="Type comparison details..."
                                                                                rows={5}
                                                                                className="comparison-textarea"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {!item.comparison && !item.comparison_text && editingId !== item.id && (
                                                                    <span>-</span>
                                                                )}

                                                            </>
                                                        ) : (
                                                            "Locked"
                                                        )}
                                                    </td>

                                                    <td>

                                                        {isTenderOpened(item.opening_date, item.opening_time) ? (

                                                            editingId === item.id ? (

                                                                <>

                                                                    <button

                                                                        className="tender-save-btn"

                                                                        onClick={() => updateTender(item.id)}

                                                                    >

                                                                        Save

                                                                    </button>

                                                                    <button

                                                                        className="tender-cancel-btn"

                                                                        onClick={() => {

                                                                            setEditingId(null);

                                                                            setEditData({
                                                                                                        comparisonFile: null,
                                                                                                        comparisonText: "",
                                                                                                        order_received_status: "",
                                                                                                    });

                                                                        }}

                                                                    >

                                                                        Cancel

                                                                    </button>

                                                                </>

                                                            ) : (

                                                                <button

                                                                    className="tender-edit-btn"

                                                                    onClick={() => {

                                                                        setEditingId(item.id);

                                                                        setEditData({
                                                                                        comparisonFile: null,
                                                                                        comparisonText: item.comparison_text || "",
                                                                                        order_received_status: item.order_received_status || "",
                                                                                    });

                                                                    }}

                                                                >

                                                                    Edit

                                                                </button>

                                                            )

                                                        ) : (

                                                            "Locked"

                                                        )}

                                                    </td>

                                                </tr>

                                            ))}

                                        </React.Fragment>

                                    ))}

                                </React.Fragment>

                            ))}

                            {filteredTenders.length === 0 && (

                                <tr>

                                    <td colSpan="14">No Data Found</td>

                                </tr>

                            )}

                        </tbody>

                    </table>

                ) : (

                    /* MOBILE CARDS */

                    <div className="tender-mobile-list">

                        {Object.entries(groupedTenders).map(([month, weeks]) => (

                            <React.Fragment key={month}>

                                <div className="tender-mobile-month-header">

                                    {month}

                                </div>

                                {Object.entries(weeks).map(([week, weekTenders]) => (

                                    <React.Fragment key={week}>

                                        <div className="tender-mobile-week-header">

                                            {week}

                                        </div>

                                        {weekTenders.map((item) => (

                                            <div

                                                key={item.id}

                                                className="tender-mobile-card"

                                                style={{

                                                    backgroundColor: item.opening_date === today ? "#fff3cd" : "",

                                                    border: item.opening_date === today ? "2px solid orange" : "",

                                                }}

                                            >

                                                <div className="tender-mobile-card-header">

                                                    <div>

                                                        <h4>{item.quotation_notice_no}</h4>

                                                        <span>{item.tender_invited_kseb_office}</span>

                                                    </div>

                                                    <div className="tender-mobile-id">

                                                        #{item.id}

                                                    </div>

                                                </div>

                                                <div className="tender-mobile-card-body">

                                                    <p><strong>Timestamp:</strong> {formatDate(item.timestamp)}</p>

                                                    <p><strong>KSEB Office:</strong> {item.tender_invited_kseb_office}</p>

                                                    <p><strong>Opening Date:</strong> {formatDate(item.opening_date)}</p>

                                                    <p><strong>Opening Time:</strong> {formatTime12Hour(item.opening_time)}</p>

                                                    <p><strong>Quotation Notice No:</strong> {item.quotation_notice_no}</p>

                                                    <p><strong>Quotation Date:</strong> {formatDate(item.quotation_date)}</p>

                                                    <p><strong>Submission Last Date:</strong> {formatDate(item.quotation_submission_last_date)}</p>

                                                    <p><strong>Executive:</strong> {item.executive_name}</p>

                                                    <p>

                                                        <strong>Tender Items:</strong>

                                                    </p>

                                                    <ol className="tender-item-list">

                                                        {item.tender_item_data

                                                            ?.split("\n")

                                                            .filter(line => line.trim() !== "")

                                                            .map((line, index) => (

                                                                <li key={index}>{line}</li>

                                                            ))}

                                                    </ol>

                                                    <div>

                                                        <strong>SKU Rate:</strong>

                                                        <div className="tender-sku-rate-text">

                                                            {isTenderOpened(item.opening_date, item.opening_time)

                                                                ? item.sku_rate || "-"

                                                                : "Locked"}

                                                        </div>

                                                    </div>

                                                    <p><strong>Status:</strong></p>

                                                    {editingId === item.id ? (

                                                        <select

                                                            value={editData.order_received_status}

                                                            onChange={(e) =>

                                                                setEditData((prev) => ({

                                                                    ...prev,

                                                                    order_received_status: e.target.value,

                                                                }))

                                                            }

                                                            className="tender-status-dropdown"

                                                        >

                                                            <option value="">Select</option>

                                                            <option value="Won">Won</option>

                                                            <option value="Lost">Lost</option>

                                                            <option value="Active">Active</option>

                                                        </select>

                                                    ) : (

                                                        <span

                                                            className={

                                                                item.order_received_status?.toLowerCase() === "won"

                                                                    ? "tender-status-won"

                                                                    : item.order_received_status?.toLowerCase() === "lost"

                                                                        ? "tender-status-lost"

                                                                        : "tender-status-active"

                                                            }

                                                        >

                                                            {item.order_received_status || "Active"}

                                                        </span>

                                                    )}

                                                    <p><strong>Tender Photo:</strong></p>

                                                    {isTenderOpened(item.opening_date, item.opening_time) ? (

                                                        item.tender_photo_url ? (

                                                            <img

                                                                className="tender-mobile-image"

                                                                src={`/serverphp${item.tender_photo_url}`}

                                                                alt="Tender"

                                                                onClick={() => setPreviewImage(item.tender_photo_url)}

                                                            />

                                                        ) : (

                                                            <p>No Image</p>

                                                        )

                                                    ) : (

                                                        <p>Locked</p>

                                                    )}

                                                    <p><strong>Comparison:</strong></p>

                                                    {isTenderOpened(item.opening_date, item.opening_time) ? (
                                                        <>
                                                            {item.comparison && (
                                                                <img
                                                                    className="tender-mobile-image"
                                                                    src={`/serverphp${item.comparison}`}
                                                                    alt="Comparison"
                                                                    onClick={() => setPreviewImage(item.comparison)}
                                                                />
                                                            )}

                                                            {item.comparison_text && editingId !== item.id && (
                                                                <div className="comparison-text-display mobile-comparison-text">
                                                                    {item.comparison_text}
                                                                </div>
                                                            )}

                                                            {editingId === item.id && (
                                                                <div className="comparison-edit-box mobile-comparison-edit-box">
                                                                    <div className="comparison-file-section">
                                                                        <label className="comparison-label">
                                                                            Upload Comparison Image
                                                                        </label>
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            onChange={handleComparisonFile}
                                                                            className="comparison-file-input"
                                                                        />
                                                                    </div>

                                                                    <div className="comparison-or">
                                                                        <span>OR</span>
                                                                    </div>

                                                                    <div className="comparison-text-section">
                                                                        <label className="comparison-label">
                                                                            Type Comparison
                                                                        </label>
                                                                        <textarea
                                                                            value={editData.comparisonText}
                                                                            onChange={(e) =>
                                                                                setEditData((prev) => ({
                                                                                    ...prev,
                                                                                    comparisonText: e.target.value,
                                                                                }))
                                                                            }
                                                                            placeholder="Type comparison details..."
                                                                            rows={5}
                                                                            className="comparison-textarea"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {!item.comparison && !item.comparison_text && editingId !== item.id && (
                                                                <p>No Comparison Added</p>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <p>Locked</p>
                                                    )}

                                                    {isTenderOpened(item.opening_date, item.opening_time) ? (

                                                        editingId === item.id ? (

                                                            <>

                                                                <button

                                                                    className="tender-save-btn"

                                                                    onClick={() => updateTender(item.id)}

                                                                >

                                                                    Save

                                                                </button>

                                                                <button

                                                                    className="tender-cancel-btn"

                                                                    onClick={() => {

                                                                        setEditingId(null);

                                                                        setEditData({
                                                                                                        comparisonFile: null,
                                                                                                        comparisonText: "",
                                                                                                        order_received_status: "",
                                                                                                    });

                                                                    }}

                                                                >

                                                                    Cancel

                                                                </button>

                                                            </>

                                                        ) : (

                                                            <button

                                                                className="tender-edit-btn"

                                                                onClick={() => {

                                                                    setEditingId(item.id);

                                                                    setEditData({
                                                                                        comparisonFile: null,
                                                                                        comparisonText: item.comparison_text || "",
                                                                                        order_received_status: item.order_received_status || "",
                                                                                    });

                                                                }}

                                                            >

                                                                Edit

                                                            </button>

                                                        )

                                                    ) : (

                                                        <p>Locked</p>

                                                    )}

                                                </div>

                                            </div>

                                        ))}

                                    </React.Fragment>

                                ))}

                            </React.Fragment>

                        ))}

                        {filteredTenders.length === 0 && (

                            <div className="no-mobile-data">

                                No Data Found

                            </div>

                        )}

                    </div>

                )}

            </div>

            {previewImage && (

                <div

                    className="image-preview-overlay"

                    onClick={() => setPreviewImage(null)}

                >

                    <div

                        className="image-preview-box"

                        onClick={(e) => e.stopPropagation()}

                    >

                        <button

                            className="image-preview-close"

                            onClick={() => setPreviewImage(null)}

                        >

                            ✕

                        </button>

                        <img

                            src={previewImage}

                            alt="Preview"

                            className="image-preview-img"

                        />

                    </div>

                </div>

            )}

        </div>

    );

};

export default TenderExecutive;
