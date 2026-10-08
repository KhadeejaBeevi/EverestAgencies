import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import "./TenderDetails.css";
import { useNavigate } from "react-router-dom";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { auth, db } from "../../components/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FaBars } from "react-icons/fa";
import { apiFetch } from "../../api/apiClient";

const API = "/serverphp";

const API_ENDPOINTS = {
    GET_TENDERS: `${API}/get_tenders.php`,
    ADD_TENDER: `${API}/add_tender.php`,
    UPDATE_TENDER: `${API}/update_tender.php`,
    DELETE_TENDER: `${API}/delete_tender.php`,
};

const TenderDetails = () => {

    const [tenders, setTenders] = useState([]);
    const [search, setSearch] = useState("");

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    const [editingId, setEditingId] = useState(null);

    const [filterDate, setFilterDate] = useState("");
    const [showAddModal, setShowAddModal] = useState(false);

    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const [userRole, setUserRole] = useState("");
    const [authorized, setAuthorized] = useState(false);
    const [checkingAccess, setCheckingAccess] = useState(true);

    const [showFilters, setShowFilters] = useState(false);
    const [statusFilter, setStatusFilter] = useState("All");

    // LIVE DUPLICATE RECORD
    const [duplicateTender, setDuplicateTender] = useState(null);

    // COMPARISON IMAGE PREVIEW
    const [previewImage, setPreviewImage] = useState(null);

    const navigate = useNavigate();

    // =========================================================
    // ADD TENDER DATA
    // =========================================================

    const emptyTender = {
        tender_invited_kseb_office: "",
        opening_date: "",
        opening_time: "",
        quotation_notice_no: "",
        quotation_date: "",
        tender_item_data: "",
        quotation_submission_last_date: "",
        executive_name: "",
        other_executive: "",
        tender_receipt_email: "",
        tender_dispatched_date: "",
        tender_everest_executive_email: "",
        tender_photo: null,
    };

    const [newTender, setNewTender] = useState(emptyTender);

    // =========================================================
    // EDIT DATA
    // comparison_text = typed comparison (same field the
    // executive page uses). The comparison IMAGE path is in
    // `comparison` and is never sent from this page, so it
    // can't be overwritten here.
    // =========================================================

    const [editData, setEditData] = useState({
        tender_info_given_to_gibin: "",
        tender_info_given_date: "",
        rate_given_by_gibin: "",
        everest_quotation_no: "",
        sku_rate: "",
        order_received_status: "",
        comparison_text: "",
    });

    // =========================================================
    // AUTHORIZATION
    // =========================================================

    useEffect(() => {

        const unsubscribe = onAuthStateChanged(auth, async (user) => {

            if (!user) {
                setAuthorized(false);
                setCheckingAccess(false);
                return;
            }

            try {

                const SPECIAL_UID = "Zj0y6xogiIQLp0qnYWoHFGrf2";

                if (user.uid === SPECIAL_UID) {
                    setAuthorized(true);
                    setUserRole("special");
                    fetchTenders();
                    setCheckingAccess(false);
                    return;
                }

                // ADMIN
                const roleSnap = await getDoc(doc(db, "roles", user.uid));

                if (roleSnap.exists() && roleSnap.data().role === "admin") {
                    setAuthorized(true);
                    setUserRole("admin");
                    fetchTenders();
                    setCheckingAccess(false);
                    return;
                }

                // KSEB USER
                const userSnap = await getDoc(doc(db, "Users", user.uid));

                if (userSnap.exists() && userSnap.data().role === "KsebUser") {
                    setAuthorized(true);
                    setUserRole("ksebuser");
                    fetchTenders();
                    setCheckingAccess(false);
                    return;
                }

                setAuthorized(false);

            } catch (err) {
                console.error(err);
                setAuthorized(false);
            }

            setCheckingAccess(false);
        });

        return () => unsubscribe();

    }, []);

    // =========================================================
    // HELPERS
    // =========================================================

    const parseTimestamp = (value) => {
        const v = String(value || "").trim();
        return new Date(v.includes("T") ? v : v.replace(" ", "T"));
    };

    // Build a usable URL for an uploaded file path
    const getFileUrl = (path) => {
        if (!path) return "";
        if (/^https?:\/\//i.test(path)) return path;
        if (path.startsWith(API)) return path;
        return `${API}${path.startsWith("/") ? "" : "/"}${path}`;
    };

    const getComparisonText = (item) =>
        item.comparison_text || item.tender_comparison || "";

    // =========================================================
    // FETCH TENDERS
    // =========================================================

    const fetchTenders = async () => {

        try {

            const res = await apiFetch(API_ENDPOINTS.GET_TENDERS);
            const data = await res.json();

            const sortedData = [...data].sort(
                (a, b) =>
                    parseTimestamp(b.timestamp).getTime() -
                    parseTimestamp(a.timestamp).getTime()
            );

            setTenders(sortedData);

        } catch (err) {
            console.error(err);
        }
    };

    // =========================================================
    // FORMAT TIME
    // =========================================================

    const formatTime12Hour = (time) => {

        if (!time) return "-";

        let [hours, minutes] = time.split(":");
        hours = parseInt(hours, 10);
        hours = hours % 12 || 12;

        return `${hours}:${minutes}`;
    };

    // =========================================================
    // EXECUTIVE EMAILS
    // =========================================================

    const executiveEmails = {
        Libin: "libin.ksebexe1@everestagencies.org",
        Sreelal: "sreelal.ksebexe2@everestagencies.org",
        Stanly: "stanly.ksebexe3@everestagencies.org",
        Revathy: "renju.kseb@everestagencies.org",
        Sumi: "renju.kseb@everestagencies.org",
    };

    // =========================================================
    // DUPLICATE CHECK
    // =========================================================

    const findDuplicate = (tenderData) => {

        const officeName = (tenderData.tender_invited_kseb_office || "").trim().toLowerCase();
        const noticeNumber = (tenderData.quotation_notice_no || "").trim().toLowerCase();

        if (!officeName || !noticeNumber) return null;

        return tenders.find((item) =>
            (item.tender_invited_kseb_office || "").trim().toLowerCase() === officeName &&
            (item.quotation_notice_no || "").trim().toLowerCase() === noticeNumber
        ) || null;
    };

    const checkDuplicateTender = (tenderData) => {
        setDuplicateTender(findDuplicate(tenderData));
    };

    // =========================================================
    // ADD FORM CHANGE
    // =========================================================

    const handleAddChange = (e) => {

        const { name, value, files } = e.target;

        if (name === "tender_photo") {
            setNewTender((prev) => ({
                ...prev,
                tender_photo: files && files.length ? files[0] : null,
            }));
            return;
        }

        let updatedTender = { ...newTender, [name]: value };

        if (name === "executive_name") {
            updatedTender = {
                ...updatedTender,
                executive_name: value,
                tender_everest_executive_email:
                    executiveEmails[value] || newTender.tender_everest_executive_email,
            };
        }

        setNewTender(updatedTender);

        if (name === "tender_invited_kseb_office" || name === "quotation_notice_no") {
            checkDuplicateTender(updatedTender);
        }
    };

    // =========================================================
    // FORMAT DATE
    // =========================================================

    const formatDate = (date) => {

        if (!date) return "-";

        const parsedDate = new Date(date);

        if (isNaN(parsedDate.getTime())) return date;

        return parsedDate
            .toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
            })
            .replace(/ /g, " - ");
    };

    // =========================================================
    // EDIT CHANGE
    // =========================================================

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditData((prev) => ({ ...prev, [name]: value }));
    };

    // =========================================================
    // ADD TENDER
    // =========================================================

    const showDuplicateAlert = () => {
        alert(
            "DUPLICATE TENDER\n\n" +
            "KSEB Office: " + newTender.tender_invited_kseb_office + "\n" +
            "Quotation Notice No: " + newTender.quotation_notice_no + "\n\n" +
            "This tender already exists."
        );
    };

    const addTender = async (e) => {

        e.preventDefault();

        const duplicate = findDuplicate(newTender);

        if (duplicate) {
            setDuplicateTender(duplicate);
            showDuplicateAlert();
            return;
        }

        const formData = new FormData();

        Object.keys(newTender).forEach((key) => {

            let value = newTender[key];

            if (key === "executive_name" && newTender.executive_name === "Others") {
                value = newTender.other_executive;
            }

            if (value !== null && value !== undefined) {
                formData.append(key, value);
            }
        });

        try {

            const res = await apiFetch(API_ENDPOINTS.ADD_TENDER, {
                method: "POST",
                body: formData,
            });

            const result = await res.json();

            if (result.duplicate) {
                showDuplicateAlert();
                return;
            }

            if (result.success) {
                alert("Tender Added Successfully");
                setShowAddModal(false);
                setDuplicateTender(null);
                setNewTender(emptyTender);
                fetchTenders();
            } else {
                alert(result.message || "Failed to add tender.");
            }

        } catch (err) {
            console.error(err);
            alert("Failed to add tender. Please try again.");
        }
    };

    // =========================================================
    // OPEN EDIT
    // =========================================================

    const openEdit = (tender) => {

        setEditingId(tender.id);

        setEditData({
            tender_info_given_to_gibin: tender.tender_info_given_to_gibin || "",
            tender_info_given_date: tender.tender_info_given_date || "",
            rate_given_by_gibin: tender.rate_given_by_gibin || "",
            everest_quotation_no: tender.everest_quotation_no || "",
            sku_rate: tender.sku_rate || "",
            order_received_status: tender.order_received_status || "",
            comparison_text: getComparisonText(tender),
        });
    };

    // =========================================================
    // DELETE
    // =========================================================

    const deleteTender = async (id) => {

        if (!window.confirm("Are you sure you want to delete this tender?")) return;

        try {

            const res = await apiFetch(API_ENDPOINTS.DELETE_TENDER, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });

            const result = await res.json();

            if (result.success) {
                alert("Tender deleted successfully");
                fetchTenders();
            } else {
                alert(result.message || "Failed to delete tender.");
            }

        } catch (err) {
            console.error(err);
            alert("Failed to delete tender.");
        }
    };

    // =========================================================
    // UPDATE
    // =========================================================

    const updateTender = async (id) => {

        try {

            const res = await apiFetch(API_ENDPOINTS.UPDATE_TENDER, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, ...editData }),
            });

            const result = await res.json();

            if (result.success) {
                alert("Tender Updated Successfully");
                setEditingId(null);
                fetchTenders();
            } else {
                alert(result.message || "Failed to update tender.");
            }

        } catch (err) {
            console.error(err);
            alert("Failed to update tender.");
        }
    };

    // =========================================================
    // COMPARISON RENDER (IMAGE + TEXT)
    // =========================================================

    const renderComparisonImage = (item, size = "80px") => {

        if (!item.comparison) return null;

        const url = getFileUrl(item.comparison);

        return (
            <img
                src={url}
                alt="Comparison"
                className="comparison-preview-image"
                style={{
                    maxWidth: size,
                    maxHeight: size,
                    objectFit: "cover",
                    cursor: "pointer",
                    display: "block",
                    marginBottom: "6px",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                }}
                onClick={() => setPreviewImage(url)}
            />
        );
    };

    const renderComparison = (item, size) => {

        const text = getComparisonText(item);

        if (!item.comparison && !text) return "-";

        return (
            <>
                {renderComparisonImage(item, size)}

                {text && (
                    <div
                        className="comparison-text-display"
                        style={{ whiteSpace: "pre-wrap" }}
                    >
                        {text}
                    </div>
                )}
            </>
        );
    };

    const renderComparisonEditor = (item, extraStyle = {}) => (
        <>
            {renderComparisonImage(item)}

            <textarea
                className="comparison-edit-box"
                name="comparison_text"
                value={editData.comparison_text}
                onChange={handleEditChange}
                placeholder="Enter comparison details..."
                rows={4}
                style={extraStyle}
            />
        </>
    );

    // =========================================================
    // FILTER
    // =========================================================

    const filteredTenders = tenders.filter((item) => {

        const matchesSearch = Object.values(item)
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase());

        const matchesDate = !filterDate || item.opening_date === filterDate;

        const status = (item.order_received_status || "Active").trim();

        const matchesStatus = statusFilter === "All" ? true : status === statusFilter;

        return matchesSearch && matchesDate && matchesStatus;
    });

    // =========================================================
    // GROUP BY MONTH / WEEK
    // =========================================================

    const groupedTenders = filteredTenders.reduce((acc, tender) => {

        if (!tender.timestamp) return acc;

        const timestampDate = parseTimestamp(tender.timestamp);

        if (isNaN(timestampDate.getTime())) return acc;

        const monthKey = `${timestampDate.getFullYear()}-${String(
            timestampDate.getMonth() + 1
        ).padStart(2, "0")}`;

        const monthLabel = timestampDate.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
        });

        const firstDay = new Date(
            timestampDate.getFullYear(),
            timestampDate.getMonth(),
            1
        );

        const weekNumber = Math.ceil(
            (timestampDate.getDate() + firstDay.getDay()) / 7
        );

        const weekKey = `Week ${weekNumber}`;

        if (!acc[monthKey]) {
            acc[monthKey] = { label: monthLabel, weeks: {} };
        }

        if (!acc[monthKey].weeks[weekKey]) {
            acc[monthKey].weeks[weekKey] = [];
        }

        acc[monthKey].weeks[weekKey].push(tender);

        return acc;

    }, {});

    // =========================================================
    // SORT MONTHS / WEEKS / TENDERS
    // =========================================================

    const sortedMonths = Object.entries(groupedTenders).sort(
        ([monthA], [monthB]) => monthB.localeCompare(monthA)
    );

    sortedMonths.forEach(([, monthData]) => {

        const sortedWeeks = Object.entries(monthData.weeks).sort(
            ([weekA], [weekB]) =>
                parseInt(weekB.replace("Week ", ""), 10) -
                parseInt(weekA.replace("Week ", ""), 10)
        );

        monthData.weeks = Object.fromEntries(sortedWeeks);

        Object.values(monthData.weeks).forEach((weekTenders) => {
            weekTenders.sort(
                (a, b) =>
                    parseTimestamp(b.timestamp).getTime() -
                    parseTimestamp(a.timestamp).getTime()
            );
        });
    });

    // =========================================================
    // DOWNLOAD EXCEL
    // =========================================================

    const downloadExcel = () => {

        const filteredData = tenders.filter((item) => {

            if (!fromDate || !toDate) return true;

            const openingDate = new Date(item.opening_date);

            return openingDate >= new Date(fromDate) && openingDate <= new Date(toDate);
        });

        const origin = window.location.origin;

        const excelData = filteredData.map((item) => ({
            ID: item.id,
            Timestamp: item.timestamp,
            "KSEB Office": item.tender_invited_kseb_office,
            "Opening Date": item.opening_date,
            "Opening Time": item.opening_time,
            "Quotation Notice No": item.quotation_notice_no,
            "Quotation Date": item.quotation_date,
            "Tender Item Data": item.tender_item_data,
            "Submission Last Date": item.quotation_submission_last_date,
            "Executive Name": item.executive_name,
            "Executive Email": item.tender_everest_executive_email,
            "Everest Quotation No": item.everest_quotation_no,
            "SKU Rate": item.sku_rate,
            "Tender Dispatched Date": item.tender_dispatched_date,
            "Order Received Status": item.order_received_status,
            "Comparison Text": getComparisonText(item),
            "Comparison Image": item.comparison
                ? origin + getFileUrl(item.comparison)
                : "",
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(workbook, worksheet, "Tender Details");

        const excelBuffer = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array",
        });

        const data = new Blob([excelBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        saveAs(data, `Tender_Details_${fromDate || "All"}_${toDate || "All"}.xlsx`);
    };

    // =========================================================
    // RESIZE
    // =========================================================

    useEffect(() => {

        const handleResize = () => setIsMobile(window.innerWidth <= 768);

        window.addEventListener("resize", handleResize);

        return () => window.removeEventListener("resize", handleResize);

    }, []);

    // =========================================================
    // ACCESS CHECK
    // =========================================================

    if (checkingAccess) {
        return (
            <div className="tender-container">
                <Banner />
                <h2>Checking Access...</h2>
            </div>
        );
    }

    if (!authorized) {
        return (
            <div className="tender-container">
                <Banner />
                <h2>Access Denied</h2>
                <p>You are not authorized to view this page.</p>
            </div>
        );
    }

    const today = new Date().toISOString().split("T")[0];

    const duplicateInputStyle = {
        border: duplicateTender ? "2px solid #dc2626" : undefined,
        backgroundColor: duplicateTender ? "#fef2f2" : undefined,
    };

    // =========================================================
    // RETURN
    // =========================================================

    return (

        <div className="tender-container">

            <Banner />

            {/* HEADER */}

            <div className="tender-header">

                <h2>Tender Details</h2>

                <button
                    className="tender_add-btn"
                    onClick={() => {
                        setShowAddModal(true);
                        setDuplicateTender(null);
                    }}
                >
                    + Add Tender
                </button>

            </div>

            {/* FILTER MENU */}

            <div className="filter-menu-container">

                <button
                    className="filter-icon-btn"
                    onClick={() => setShowFilters(!showFilters)}
                >
                    <FaBars />
                </button>

                {showFilters && (

                    <div className="tender_filter-dropdown">

                        <div className="tender_filter-group">

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
                            className="clear-filter-btn"
                            onClick={() => {
                                setSearch("");
                                setFilterDate("");
                                setFromDate("");
                                setToDate("");
                                setStatusFilter("All");
                            }}
                        >
                            Clear Filters
                        </button>

                    </div>
                )}

            </div>

            {/* FILTER ROW */}

            <div className="tender_filter-row">

                <div className="tender_filter-left">

                    <input
                        type="text"
                        placeholder="Search..."
                        className="tender_search-box"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                </div>

                <div className="tender_filter-right">

                    <div className="date-filter">
                        <label>Opening Date</label>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                        />
                    </div>

                    <div className="date-filter">
                        <label>From Date</label>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                    </div>

                    <div className="date-filter">
                        <label>To Date</label>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                    </div>

                    <button
                        className="clear-btn"
                        onClick={() => {
                            setSearch("");
                            setFilterDate("");
                            setFromDate("");
                            setToDate("");
                        }}
                    >
                        Clear
                    </button>

                    <button className="download-btn" onClick={downloadExcel}>
                        Download Excel
                    </button>

                </div>

            </div>

            {/* TABLE */}

            <div className="tender_table-wrapper">

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
                                <th>Everest Quotation No</th>
                                <th>SKU Rate</th>
                                <th>Tender Item Data</th>
                                <th>Submission Last Date</th>
                                <th>Tender Photo</th>
                                <th>Executive Name</th>
                                <th>Everest Executive Email</th>
                                <th>Tender Dispatched Date</th>
                                <th>Comparison</th>
                                <th>Order Received Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>

                            {sortedMonths.map(([monthKey, monthData]) => (

                                <React.Fragment key={monthKey}>

                                    {/* MONTH */}

                                    <tr>
                                        <th
                                            colSpan={20}
                                            style={{
                                                background: "#1e3a8a",
                                                color: "white",
                                                fontSize: "22px",
                                                textAlign: "left",
                                                padding: "12px",
                                            }}
                                        >
                                            {monthData.label}
                                        </th>
                                    </tr>

                                    {Object.entries(monthData.weeks).map(([week, weekTenders]) => (

                                        <React.Fragment key={week}>

                                            {/* WEEK */}

                                            <tr>
                                                <th
                                                    colSpan={20}
                                                    style={{
                                                        background: "#dbeafe",
                                                        color: "black",
                                                        fontSize: "18px",
                                                        textAlign: "left",
                                                        padding: "10px",
                                                    }}
                                                >
                                                    {week}
                                                </th>
                                            </tr>

                                            {weekTenders.map((item) => (

                                                <tr
                                                    key={item.id}
                                                    className={item.opening_date === today ? "today-row" : ""}
                                                >

                                                    <td>{item.id}</td>

                                                    <td>{formatDate(item.timestamp)}</td>

                                                    <td>{item.tender_invited_kseb_office}</td>

                                                    <td>{formatDate(item.opening_date)}</td>

                                                    <td>{formatTime12Hour(item.opening_time)}</td>

                                                    <td>{item.quotation_notice_no}</td>

                                                    <td>{formatDate(item.quotation_date)}</td>

                                                    {/* EVEREST QUOTATION */}

                                                    <td>
                                                        {editingId === item.id ? (
                                                            <input
                                                                type="text"
                                                                name="everest_quotation_no"
                                                                value={editData.everest_quotation_no}
                                                                onChange={handleEditChange}
                                                            />
                                                        ) : (
                                                            item.everest_quotation_no 
                                                        )}
                                                    </td>

                                                    {/* SKU RATE */}

                                                    <td className="sku-rate-column">
                                                        {editingId === item.id ? (
                                                            <textarea
                                                                className="sku-rate-box"
                                                                name="sku_rate"
                                                                value={editData.sku_rate}
                                                                onChange={handleEditChange}
                                                                rows={4}
                                                            />
                                                        ) : (
                                                            <div className="sku-rate-text">
                                                                {item.sku_rate
                                                                    ?.split("\n")
                                                                    .map((line, index) => (
                                                                        <div key={index}>{line}</div>
                                                                    ))}
                                                                {!item.sku_rate && "-"}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* TENDER ITEM DATA */}

                                                    <td>
                                                        <ol className="tender-item-list">
                                                            {item.tender_item_data
                                                                ?.split("\n")
                                                                .filter((line) => line.trim() !== "")
                                                                .map((line, index) => (
                                                                    <li key={index}>{line}</li>
                                                                ))}
                                                        </ol>
                                                    </td>

                                                    <td>{formatDate(item.quotation_submission_last_date)}</td>

                                                    {/* PHOTO */}

                                                    <td>
                                                        {item.tender_photo_url ? (
                                                            <img
                                                                src={item.tender_photo_url}
                                                                alt="view"
                                                                style={{ cursor: "pointer", maxWidth: "60px" }}
                                                                onClick={() =>
                                                                    window.open(item.tender_photo_url, "_blank")
                                                                }
                                                            />
                                                        ) : (
                                                            "-"
                                                        )}
                                                    </td>

                                                    <td>{item.executive_name}</td>

                                                    <td>{item.tender_everest_executive_email}</td>

                                                    <td>{formatDate(item.tender_dispatched_date)}</td>

                                                    {/* COMPARISON (IMAGE + TEXT) */}

                                                    <td className="comparison-column">
                                                        {editingId === item.id
                                                            ? renderComparisonEditor(item)
                                                            : (
                                                                <div className="comparison-display">
                                                                    {renderComparison(item)}
                                                                </div>
                                                            )}
                                                    </td>

                                                    {/* ORDER STATUS */}

                                                    <td>
                                                        {editingId === item.id ? (
                                                            <select
                                                                name="order_received_status"
                                                                value={editData.order_received_status}
                                                                onChange={handleEditChange}
                                                            >
                                                                <option value="">Select</option>
                                                                <option value="Active">Active</option>
                                                                <option value="Won">Won</option>
                                                                <option value="Lost">Lost</option>
                                                            </select>
                                                        ) : (
                                                            item.order_received_status || "Active"
                                                        )}
                                                    </td>

                                                    {/* ACTION */}

                                                    <td>
                                                        {editingId === item.id ? (
                                                            <>
                                                                <button
                                                                    className="tender_save-btn"
                                                                    onClick={() => updateTender(item.id)}
                                                                >
                                                                    Save
                                                                </button>
                                                                <button
                                                                    className="tender_cancel-btn"
                                                                    onClick={() => setEditingId(null)}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    className="tender_edit-btn"
                                                                    onClick={() => openEdit(item)}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    className="tender_delete-btn"
                                                                    onClick={() => deleteTender(item.id)}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </>
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
                                    <td colSpan="20" style={{ textAlign: "center", padding: "30px" }}>
                                        No Data Found
                                    </td>
                                </tr>
                            )}

                        </tbody>

                    </table>

                ) : (

                    /* MOBILE */

                    <div className="mobile-tender-list">

                        {sortedMonths.map(([monthKey, monthData]) => (

                            <React.Fragment key={monthKey}>

                                <div className="mobile-month-header">{monthData.label}</div>

                                {Object.entries(monthData.weeks).map(([week, weekTenders]) => (

                                    <React.Fragment key={week}>

                                        <div className="mobile-week-header">{week}</div>

                                        {weekTenders.map((item) => (

                                            <div
                                                key={item.id}
                                                className="mobile-tender-card"
                                                style={{
                                                    backgroundColor: item.opening_date === today ? "#fff3cd" : "",
                                                    border: item.opening_date === today ? "2px solid orange" : "",
                                                }}
                                            >

                                                <div className="tender_mobile-card-header">
                                                    <div>
                                                        <h4>{item.quotation_notice_no}</h4>
                                                        <span>{item.tender_invited_kseb_office}</span>
                                                    </div>
                                                    <div className="mobile-id">#{item.id}</div>
                                                </div>

                                                <div className="tender_mobile-card-body">

                                                    <p><strong>Quotation Date:</strong> {formatDate(item.quotation_date)}</p>

                                                    <p><strong>Opening Date:</strong> {formatDate(item.opening_date)}</p>

                                                    <p><strong>Opening Time:</strong> {formatTime12Hour(item.opening_time)}</p>

                                                    <p><strong>Executive:</strong> {item.executive_name}</p>

                                                    <p><strong>Status:</strong> {item.order_received_status || "Active"}</p>

                                                    <p><strong>Quotation No:</strong> {item.everest_quotation_no }</p>

                                                    {/* MOBILE COMPARISON (IMAGE + TEXT) */}

                                                    <div style={{ marginTop: "10px" }}>

                                                        <strong>Comparison:</strong>

                                                        <div style={{ marginTop: "6px" }}>
                                                            {editingId === item.id
                                                                ? renderComparisonEditor(item, { marginTop: "6px" })
                                                                : (
                                                                    <div className="comparison-display">
                                                                        {renderComparison(item, "160px")}
                                                                    </div>
                                                                )}
                                                        </div>

                                                    </div>

                                                </div>

                                                {item.tender_photo_url && (
                                                    <img
                                                        className="mobile-tender-image"
                                                        src={item.tender_photo_url}
                                                        alt="Tender"
                                                        onClick={() => window.open(item.tender_photo_url, "_blank")}
                                                    />
                                                )}

                                                <div className="mobile-card-actions">
                                                    {editingId === item.id ? (
                                                        <>
                                                            <button
                                                                className="tender_save-btn"
                                                                onClick={() => updateTender(item.id)}
                                                            >
                                                                Save
                                                            </button>
                                                            <button
                                                                className="tender_cancel-btn"
                                                                onClick={() => setEditingId(null)}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                className="tender_edit-btn"
                                                                onClick={() => openEdit(item)}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                className="tender_delete-btn"
                                                                onClick={() => deleteTender(item.id)}
                                                            >
                                                                Delete
                                                            </button>
                                                        </>
                                                    )}
                                                </div>

                                            </div>
                                        ))}

                                    </React.Fragment>
                                ))}

                            </React.Fragment>
                        ))}

                        {filteredTenders.length === 0 && (
                            <div className="no-mobile-data">No Data Found</div>
                        )}

                    </div>
                )}

            </div>

            {/* COMPARISON IMAGE PREVIEW */}

            {previewImage && (
                <div
                    onClick={() => setPreviewImage(null)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.75)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        padding: "16px",
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: "relative", maxWidth: "95vw", maxHeight: "90vh" }}
                    >
                        <button
                            onClick={() => setPreviewImage(null)}
                            style={{
                                position: "absolute",
                                top: "-14px",
                                right: "-14px",
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                border: "none",
                                background: "#fff",
                                cursor: "pointer",
                                fontSize: "16px",
                                fontWeight: "bold",
                            }}
                        >
                            ✕
                        </button>
                        <img
                            src={previewImage}
                            alt="Comparison Preview"
                            style={{
                                maxWidth: "95vw",
                                maxHeight: "90vh",
                                borderRadius: "6px",
                                background: "#fff",
                            }}
                        />
                    </div>
                </div>
            )}

            {/* ADD TENDER MODAL */}

            {showAddModal && (

                <div className="modal-overlay">

                    <div className="modal large-modal">

                        <h3 className="modal-title">Add Tender Details</h3>

                        <form onSubmit={addTender}>

                            <div className="form-grid">

                                {/* KSEB OFFICE */}

                                <div className="form-group">
                                    <label>Tender Invited KSEB Office</label>
                                    <input
                                        name="tender_invited_kseb_office"
                                        value={newTender.tender_invited_kseb_office}
                                        onChange={handleAddChange}
                                        required
                                        style={duplicateInputStyle}
                                    />
                                </div>

                                {/* QUOTATION NOTICE NUMBER */}

                                <div className="form-group">

                                    <label>Quotation Notice No</label>

                                    <input
                                        name="quotation_notice_no"
                                        value={newTender.quotation_notice_no}
                                        onChange={handleAddChange}
                                        required
                                        style={duplicateInputStyle}
                                    />

                                    {duplicateTender && (

                                        <div
                                            style={{
                                                marginTop: "8px",
                                                padding: "12px 14px",
                                                background: "#fee2e2",
                                                border: "1px solid #ef4444",
                                                borderRadius: "7px",
                                                color: "#991b1b",
                                                fontSize: "14px",
                                                fontWeight: "600",
                                            }}
                                        >
                                            <div style={{ fontSize: "15px", marginBottom: "5px" }}>
                                                ⚠️ DUPLICATE TENDER
                                            </div>

                                            <div style={{ fontWeight: "400" }}>
                                                This KSEB Office and Quotation Notice Number already exists.
                                            </div>

                                            <div style={{ marginTop: "5px", fontSize: "13px" }}>
                                                Existing Tender ID: #{duplicateTender.id}
                                            </div>

                                            <div style={{ marginTop: "3px", fontSize: "13px" }}>
                                                Office: {duplicateTender.tender_invited_kseb_office}
                                            </div>
                                        </div>
                                    )}

                                </div>

                                {/* QUOTATION DATE */}

                                <div className="form-group">
                                    <label>Quotation Date</label>
                                    <input
                                        type="date"
                                        name="quotation_date"
                                        value={newTender.quotation_date}
                                        onChange={handleAddChange}
                                        required
                                    />
                                </div>

                                {/* TENDER ITEM DATA */}

                                <div className="form-group">
                                    <label>Tender Item Data</label>
                                    <textarea
                                        name="tender_item_data"
                                        value={newTender.tender_item_data}
                                        onChange={handleAddChange}
                                    />
                                </div>

                                {/* LAST DATE */}

                                <div className="form-group">
                                    <label>Quotation Submission Last Date</label>
                                    <input
                                        type="date"
                                        name="quotation_submission_last_date"
                                        value={newTender.quotation_submission_last_date}
                                        onChange={handleAddChange}
                                    />
                                </div>

                                {/* OPENING DATE */}

                                <div className="form-group">
                                    <label>Opening Date</label>
                                    <input
                                        type="date"
                                        name="opening_date"
                                        value={newTender.opening_date}
                                        onChange={handleAddChange}
                                        required
                                    />
                                </div>

                                {/* OPENING TIME */}

                                <div className="form-group">
                                    <label>Opening Time</label>
                                    <input
                                        type="time"
                                        name="opening_time"
                                        value={newTender.opening_time}
                                        onChange={handleAddChange}
                                        required
                                    />
                                </div>

                                {/* DISPATCHED DATE */}

                                <div className="form-group">
                                    <label>Tender Dispatched Date</label>
                                    <input
                                        type="date"
                                        name="tender_dispatched_date"
                                        value={newTender.tender_dispatched_date}
                                        onChange={handleAddChange}
                                    />
                                </div>

                                {/* EXECUTIVE */}

                                <div className="form-group">
                                    <label>Sales Executive</label>
                                    <input
                                        list="executiveList"
                                        name="executive_name"
                                        placeholder="Select or Type Executive Name"
                                        value={newTender.executive_name}
                                        onChange={handleAddChange}
                                    />
                                    <datalist id="executiveList">
                                        <option value="Libin" />
                                        <option value="Sreelal" />
                                        <option value="Stanly" />
                                        <option value="Revathy" />
                                        <option value="Sumi" />
                                    </datalist>
                                </div>

                                {/* EXECUTIVE EMAIL */}

                                <div className="form-group">
                                    <label>Sales Executive Email</label>
                                    <input
                                        type="email"
                                        list="emailList"
                                        name="tender_everest_executive_email"
                                        placeholder="Select or Type Email"
                                        value={newTender.tender_everest_executive_email}
                                        onChange={handleAddChange}
                                    />
                                    <datalist id="emailList">
                                        <option value="libin.ksebexe1@everestagencies.org" />
                                        <option value="sreelal.ksebexe2@everestagencies.org" />
                                        <option value="stanly.ksebexe3@everestagencies.org" />
                                        <option value="renju.kseb@everestagencies.org" />
                                    </datalist>
                                </div>

                                {/* TENDER PHOTO */}

                                <div className="form-group">
                                    <label>Tender Photo</label>
                                    <input
                                        type="file"
                                        name="tender_photo"
                                        onChange={handleAddChange}
                                    />
                                </div>

                            </div>

                            {/* MODAL BUTTONS */}

                            <div className="modal-buttons">

                                <button
                                    type="submit"
                                    className="tender_save-btn"
                                    disabled={!!duplicateTender}
                                    style={{
                                        opacity: duplicateTender ? 0.5 : 1,
                                        cursor: duplicateTender ? "not-allowed" : "pointer",
                                    }}
                                >
                                    Save
                                </button>

                                <button
                                    type="button"
                                    className="tender_cancel-btn"
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setDuplicateTender(null);
                                    }}
                                >
                                    Cancel
                                </button>

                            </div>

                        </form>

                    </div>

                </div>
            )}

        </div>
    );
};

export default TenderDetails;
