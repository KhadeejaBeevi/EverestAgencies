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

const TenderDetails = () => {
    const [tenders, setTenders] = useState([]);
    const [search, setSearch] = useState("");

    const [isMobile, setIsMobile] = useState(
        window.innerWidth <= 768
    );

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

    const navigate = useNavigate();

    const [newTender, setNewTender] = useState({
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
    });

    const [editData, setEditData] = useState({
        tender_info_given_to_gibin: "",
        tender_info_given_date: "",
        rate_given_by_gibin: "",
        everest_quotation_no: "",
        sku_rate: "",
        order_received_status: "",
        comparison: "",
    });

    /*
    |--------------------------------------------------------------------------
    | AUTHORIZATION
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(
            auth,
            async (user) => {
                if (!user) {
                    setAuthorized(false);
                    setCheckingAccess(false);
                    return;
                }

                try {
                    const SPECIAL_UID =
                        "Zj0y6xogiIQLiP0qnYWoHFSLGrf2";

                    if (user.uid === SPECIAL_UID) {
                        setAuthorized(true);
                        setUserRole("special");
                        fetchTenders();
                        setCheckingAccess(false);
                        return;
                    }

                    // Check Admin
                    const roleRef = doc(
                        db,
                        "roles",
                        user.uid
                    );

                    const roleSnap = await getDoc(
                        roleRef
                    );

                    if (
                        roleSnap.exists() &&
                        roleSnap.data().role === "admin"
                    ) {
                        setAuthorized(true);
                        setUserRole("admin");
                        fetchTenders();
                        setCheckingAccess(false);
                        return;
                    }

                    // Check KSEB User
                    const userRef = doc(
                        db,
                        "Users",
                        user.uid
                    );

                    const userSnap = await getDoc(
                        userRef
                    );

                    if (
                        userSnap.exists() &&
                        userSnap.data().role === "KsebUser"
                    ) {
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
            }
        );

        return () => unsubscribe();
    }, []);

    /*
    |--------------------------------------------------------------------------
    | FETCH TENDERS
    |--------------------------------------------------------------------------
    */

    const fetchTenders = async () => {
        try {
            const res = await apiFetch(
                `${API}/get_tenders.php`
            );

            const data = await res.json();

            setTenders(data);
        } catch (err) {
            console.error(err);
        }
    };

    /*
    |--------------------------------------------------------------------------
    | FORMAT TIME
    |--------------------------------------------------------------------------
    */

    const formatTime12Hour = (time) => {
        if (!time) return "-";

        let [hours, minutes] = time.split(":");

        hours = parseInt(hours, 10);

        hours = hours % 12 || 12;

        return `${hours}:${minutes}`;
    };

    /*
    |--------------------------------------------------------------------------
    | EXECUTIVE EMAILS
    |--------------------------------------------------------------------------
    */

    const executiveEmails = {
        Libin: "libin.ksebexe1@everestagencies.org",
        Sreelal: "sreelal.ksebexe2@everestagencies.org",
        Stanly: "stanly.ksebexe3@everestagencies.org",
        Revathy: "renju.kseb@everestagencies.org",
        Sumi: "renju.kseb@everestagencies.org",
    };

    /*
    |--------------------------------------------------------------------------
    | LIVE DUPLICATE CHECK
    |--------------------------------------------------------------------------
    */

    const checkDuplicateTender = (tenderData) => {
        const officeName = (
            tenderData.tender_invited_kseb_office || ""
        )
            .trim()
            .toLowerCase();

        const noticeNumber = (
            tenderData.quotation_notice_no || ""
        )
            .trim()
            .toLowerCase();

        // Do not check until BOTH fields have values
        if (!officeName || !noticeNumber) {
            setDuplicateTender(null);
            return;
        }

        const duplicate = tenders.find((item) => {
            const existingOffice = (
                item.tender_invited_kseb_office || ""
            )
                .trim()
                .toLowerCase();

            const existingNoticeNumber = (
                item.quotation_notice_no || ""
            )
                .trim()
                .toLowerCase();

            /*
            ---------------------------------------------------------------
            IMPORTANT:

            Duplicate ONLY when BOTH are same.

            Same notice number + different office = NOT duplicate.
            ---------------------------------------------------------------
            */

            return (
                existingOffice === officeName &&
                existingNoticeNumber === noticeNumber
            );
        });

        setDuplicateTender(
            duplicate || null
        );
    };

    /*
    |--------------------------------------------------------------------------
    | ADD FORM CHANGE
    |--------------------------------------------------------------------------
    */

    const handleAddChange = (e) => {
        const {
            name,
            value,
            files,
        } = e.target;

        if (name === "tender_photo") {
            setNewTender((prev) => ({
                ...prev,
                tender_photo: files[0],
            }));

            return;
        }

        let updatedTender = {
            ...newTender,
            [name]: value,
        };

        /*
        ---------------------------------------------------------------
        AUTO FILL EXECUTIVE EMAIL
        ---------------------------------------------------------------
        */

        if (name === "executive_name") {
            updatedTender = {
                ...updatedTender,

                executive_name: value,

                tender_everest_executive_email:
                    executiveEmails[value] ||
                    newTender.tender_everest_executive_email,
            };
        }

        setNewTender(updatedTender);

        /*
        ---------------------------------------------------------------
        LIVE DUPLICATE CHECK
        ---------------------------------------------------------------
        */

        if (
            name ===
                "tender_invited_kseb_office" ||
            name ===
                "quotation_notice_no"
        ) {
            checkDuplicateTender(
                updatedTender
            );
        }
    };

    /*
    |--------------------------------------------------------------------------
    | FORMAT DATE
    |--------------------------------------------------------------------------
    */

    const formatDate = (date) => {
        if (!date) return "-";

        return new Date(date)
            .toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
            })
            .replace(/ /g, " - ");
    };

    const formatInputDate = (date) => {
        if (!date) return "";

        return new Date(date)
            .toISOString()
            .split("T")[0];
    };

    /*
    |--------------------------------------------------------------------------
    | EDIT CHANGE
    |--------------------------------------------------------------------------
    */

    const handleEditChange = (e) => {
        const {
            name,
            value,
        } = e.target;

        setEditData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    /*
    |--------------------------------------------------------------------------
    | ADD TENDER
    |--------------------------------------------------------------------------
    */

    const addTender = async (e) => {
        e.preventDefault();

        /*
        ---------------------------------------------------------------
        FINAL FRONTEND DUPLICATE CHECK
        ---------------------------------------------------------------
        */

        const officeName = (
            newTender.tender_invited_kseb_office ||
            ""
        )
            .trim()
            .toLowerCase();

        const noticeNumber = (
            newTender.quotation_notice_no ||
            ""
        )
            .trim()
            .toLowerCase();

        const duplicate = tenders.find(
            (item) => {
                const existingOffice = (
                    item.tender_invited_kseb_office ||
                    ""
                )
                    .trim()
                    .toLowerCase();

                const existingNoticeNumber = (
                    item.quotation_notice_no ||
                    ""
                )
                    .trim()
                    .toLowerCase();

                return (
                    existingOffice === officeName &&
                    existingNoticeNumber ===
                        noticeNumber
                );
            }
        );

        if (duplicate) {
            setDuplicateTender(duplicate);

            alert(
                "DUPLICATE TENDER\n\n" +
                    "KSEB Office: " +
                    newTender.tender_invited_kseb_office +
                    "\n" +
                    "Quotation Notice No: " +
                    newTender.quotation_notice_no +
                    "\n\n" +
                    "This tender already exists."
            );

            return;
        }

        /*
        ---------------------------------------------------------------
        CREATE FORM DATA
        ---------------------------------------------------------------
        */

        const formData = new FormData();

        Object.keys(newTender).forEach(
            (key) => {
                let value = newTender[key];

                if (
                    key === "executive_name" &&
                    newTender.executive_name ===
                        "Others"
                ) {
                    value =
                        newTender.other_executive;
                }

                formData.append(
                    key,
                    value
                );
            }
        );

        /*
        ---------------------------------------------------------------
        SEND TO PHP
        ---------------------------------------------------------------
        */

        try {
            const res = await apiFetch(
                `${API}/add_tender.php`,
                {
                    method: "POST",
                    body: formData,
                }
            );

            const result =
                await res.json();

            /*
            -----------------------------------------------------------
            PHP DUPLICATE CHECK
            -----------------------------------------------------------
            */

            if (result.duplicate) {
                alert(
                    "DUPLICATE TENDER\n\n" +
                        "KSEB Office: " +
                        newTender.tender_invited_kseb_office +
                        "\n" +
                        "Quotation Notice No: " +
                        newTender.quotation_notice_no +
                        "\n\n" +
                        "This tender already exists."
                );

                return;
            }

            /*
            -----------------------------------------------------------
            SUCCESS
            -----------------------------------------------------------
            */

            if (result.success) {
                alert(
                    "Tender Added Successfully"
                );

                setShowAddModal(false);

                setDuplicateTender(null);

                setNewTender({
                    tender_invited_kseb_office:
                        "",
                    opening_date: "",
                    opening_time: "",
                    quotation_notice_no:
                        "",
                    quotation_date: "",
                    tender_item_data: "",
                    quotation_submission_last_date:
                        "",
                    executive_name: "",
                    other_executive: "",
                    tender_receipt_email: "",
                    tender_dispatched_date:
                        "",
                    tender_everest_executive_email:
                        "",
                    tender_photo: null,
                });

                fetchTenders();
            } else {
                alert(
                    result.message ||
                        "Failed to add tender."
                );
            }
        } catch (err) {
            console.error(err);

            alert(
                "Failed to add tender. Please try again."
            );
        }
    };

    /*
    |--------------------------------------------------------------------------
    | OPEN EDIT
    |--------------------------------------------------------------------------
    */

    const openEdit = (tender) => {
        setEditingId(tender.id);

        setEditData({
            tender_info_given_to_gibin:
                tender.tender_info_given_to_gibin ||
                "",

            tender_info_given_date:
                tender.tender_info_given_date ||
                "",

            rate_given_by_gibin:
                tender.rate_given_by_gibin ||
                "",

            everest_quotation_no:
                tender.everest_quotation_no ||
                "",

            sku_rate:
                tender.sku_rate || "",

            order_received_status:
                tender.order_received_status ||
                "",

            comparison:
                tender.comparison || "",
        });
    };

    /*
    |--------------------------------------------------------------------------
    | DELETE
    |--------------------------------------------------------------------------
    */

    const deleteTender = async (id) => {
        const confirmDelete =
            window.confirm(
                "Are you sure you want to delete this tender?"
            );

        if (!confirmDelete) return;

        try {
            const res = await apiFetch(
                `${API}/delete_tender.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        id,
                    }),
                }
            );

            const result =
                await res.json();

            if (result.success) {
                alert(
                    "Tender deleted successfully"
                );

                fetchTenders();
            } else {
                alert(result.message);
            }
        } catch (err) {
            console.error(err);

            alert(
                "Failed to delete tender."
            );
        }
    };

    /*
    |--------------------------------------------------------------------------
    | UPDATE
    |--------------------------------------------------------------------------
    */

    const updateTender = async (id) => {
        try {
            const res = await apiFetch(
                `${API}/update_tender.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        id,
                        ...editData,
                    }),
                }
            );

            const result =
                await res.json();

            if (result.success) {
                alert(
                    "Tender Updated Successfully"
                );

                setEditingId(null);

                fetchTenders();
            } else {
                alert(result.message);
            }
        } catch (err) {
            console.error(err);
        }
    };

    /*
    |--------------------------------------------------------------------------
    | FILTER
    |--------------------------------------------------------------------------
    */

    const filteredTenders =
        tenders.filter((item) => {
            const matchesSearch =
                Object.values(item)
                    .join(" ")
                    .toLowerCase()
                    .includes(
                        search.toLowerCase()
                    );

            const matchesDate =
                !filterDate ||
                item.opening_date ===
                    filterDate;

            const status = (
                item.order_received_status ||
                "Active"
            ).trim();

            const matchesStatus =
                statusFilter === "All"
                    ? true
                    : status ===
                      statusFilter;

            return (
                matchesSearch &&
                matchesDate &&
                matchesStatus
            );
        });

    /*
    |--------------------------------------------------------------------------
    | GROUP TENDERS
    |--------------------------------------------------------------------------
    */

    const groupedTenders =
        filteredTenders.reduce(
            (acc, tender) => {
                if (
                    !tender.quotation_date
                )
                    return acc;

                const date =
                    new Date(
                        tender.quotation_date
                    );

                const month =
                    date.toLocaleString(
                        "en-US",
                        {
                            month: "long",
                            year: "numeric",
                        }
                    );

                const firstDay =
                    new Date(
                        date.getFullYear(),
                        date.getMonth(),
                        1
                    );

                const week =
                    Math.ceil(
                        (
                            date.getDate() +
                            firstDay.getDay()
                        ) / 7
                    );

                if (!acc[month]) {
                    acc[month] = {};
                }

                if (
                    !acc[month][
                        `Week ${week}`
                    ]
                ) {
                    acc[month][
                        `Week ${week}`
                    ] = [];
                }

                acc[month][
                    `Week ${week}`
                ].push(tender);

                return acc;
            },
            {}
        );

    /*
    |--------------------------------------------------------------------------
    | DOWNLOAD EXCEL
    |--------------------------------------------------------------------------
    */

    const downloadExcel = () => {
        const filteredData =
            tenders.filter((item) => {
                if (!fromDate || !toDate)
                    return true;

                const openingDate =
                    new Date(
                        item.opening_date
                    );

                const from =
                    new Date(fromDate);

                const to =
                    new Date(toDate);

                return (
                    openingDate >= from &&
                    openingDate <= to
                );
            });

        const excelData =
            filteredData.map((item) => ({
                ID: item.id,

                Timestamp:
                    item.timestamp,

                "KSEB Office":
                    item.tender_invited_kseb_office,

                "Opening Date":
                    item.opening_date,

                "Opening Time":
                    item.opening_time,

                "Quotation Notice No":
                    item.quotation_notice_no,

                "Quotation Date":
                    item.quotation_date,

                "Tender Item Data":
                    item.tender_item_data,

                "Submission Last Date":
                    item.quotation_submission_last_date,

                "Executive Name":
                    item.executive_name,

                "Executive Email":
                    item.tender_everest_executive_email,

                "Everest Quotation No":
                    item.everest_quotation_no,

                "SKU Rate":
                    item.sku_rate,

                "Tender Dispatched Date":
                    item.tender_dispatched_date,

                "Order Received Status":
                    item.order_received_status,

                comparison:
                    item.comparison,
            }));

        const worksheet =
            XLSX.utils.json_to_sheet(
                excelData
            );

        const workbook =
            XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Tender Details"
        );

        const excelBuffer =
            XLSX.write(workbook, {
                bookType: "xlsx",
                type: "array",
            });

        const data = new Blob(
            [excelBuffer],
            {
                type:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }
        );

        saveAs(
            data,
            `Tender_Details_${fromDate || "All"}_${toDate || "All"}.xlsx`
        );
    };

    /*
    |--------------------------------------------------------------------------
    | RESIZE
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(
                window.innerWidth <=
                    768
            );
        };

        window.addEventListener(
            "resize",
            handleResize
        );

        return () => {
            window.removeEventListener(
                "resize",
                handleResize
            );
        };
    }, []);

    /*
    |--------------------------------------------------------------------------
    | ACCESS CHECKING
    |--------------------------------------------------------------------------
    */

    if (checkingAccess) {
        return (
            <div className="tender-container">
                <Banner />

                <h2>
                    Checking Access...
                </h2>
            </div>
        );
    }

    if (!authorized) {
        return (
            <div className="tender-container">
                <Banner />

                <h2>
                    Access Denied
                </h2>

                <p>
                    You are not authorized
                    to view this page.
                </p>
            </div>
        );
    }

    const today =
        new Date()
            .toISOString()
            .split("T")[0];

    /*
    |--------------------------------------------------------------------------
    | RETURN
    |--------------------------------------------------------------------------
    */

    return (
        <div className="tender-container">

            <Banner />

            {/* HEADER */}

            <div className="tender-header">

                <h2>
                    Tender Details
                </h2>

                <button
                    className="tender_add-btn"
                    onClick={() => {
                        setShowAddModal(
                            true
                        );
                        setDuplicateTender(
                            null
                        );
                    }}
                >
                    + Add Tender
                </button>

            </div>

            {/* FILTER MENU */}

            <div className="filter-menu-container">

                <button
                    className="filter-icon-btn"
                    onClick={() =>
                        setShowFilters(
                            !showFilters
                        )
                    }
                >
                    <FaBars />
                </button>

                {showFilters && (
                    <div className="tender_filter-dropdown">

                        <div className="tender_filter-group">

                            <label>
                                Status
                            </label>

                            <select
                                value={
                                    statusFilter
                                }
                                onChange={(e) =>
                                    setStatusFilter(
                                        e.target
                                            .value
                                    )
                                }
                            >
                                <option value="All">
                                    All
                                </option>

                                <option value="Active">
                                    Active
                                </option>

                                <option value="Won">
                                    Won
                                </option>

                                <option value="Lost">
                                    Lost
                                </option>
                            </select>

                        </div>

                        <button
                            className="clear-filter-btn"
                            onClick={() => {
                                setSearch(
                                    ""
                                );

                                setFilterDate(
                                    ""
                                );

                                setFromDate(
                                    ""
                                );

                                setToDate(
                                    ""
                                );

                                setStatusFilter(
                                    "All"
                                );
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
                        value={
                            search
                        }
                        onChange={(e) =>
                            setSearch(
                                e.target.value
                            )
                        }
                    />

                </div>

                <div className="tender_filter-right">

                    <div className="date-filter">

                        <label>
                            Opening Date
                        </label>

                        <input
                            type="date"
                            value={
                                filterDate
                            }
                            onChange={(e) =>
                                setFilterDate(
                                    e.target
                                        .value
                                )
                            }
                        />

                    </div>

                    <div className="date-filter">

                        <label>
                            From Date
                        </label>

                        <input
                            type="date"
                            value={
                                fromDate
                            }
                            onChange={(e) =>
                                setFromDate(
                                    e.target
                                        .value
                                )
                            }
                        />

                    </div>

                    <div className="date-filter">

                        <label>
                            To Date
                        </label>

                        <input
                            type="date"
                            value={
                                toDate
                            }
                            onChange={(e) =>
                                setToDate(
                                    e.target
                                        .value
                                )
                            }
                        />

                    </div>

                    <button
                        className="clear-btn"
                        onClick={() => {
                            setSearch(
                                ""
                            );
                            setFilterDate(
                                ""
                            );
                            setFromDate(
                                ""
                            );
                            setToDate(
                                ""
                            );
                        }}
                    >
                        Clear
                    </button>

                    <button
                        className="download-btn"
                        onClick={
                            downloadExcel
                        }
                    >
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

                                <th>
                                    Timestamp
                                </th>

                                <th>
                                    KSEB Office
                                </th>

                                <th>
                                    Opening Date
                                </th>

                                <th>
                                    Opening Time
                                </th>

                                <th>
                                    Quotation Notice No
                                </th>

                                <th>
                                    Quotation Date
                                </th>

                                <th>
                                    Everest Quotation No
                                </th>

                                <th>
                                    SKU Rate
                                </th>

                                <th>
                                    Tender Item Data
                                </th>

                                <th>
                                    Submission Last Date
                                </th>

                                <th>
                                    Tender Photo
                                </th>

                                <th>
                                    Executive Name
                                </th>

                                <th>
                                    Everest Executive Email
                                </th>

                                <th>
                                    Tender Dispatched Date
                                </th>

                                <th>
                                    Comparison
                                </th>

                                <th>
                                    Order Received Status
                                </th>

                                <th>
                                    Action
                                </th>

                            </tr>

                        </thead>

                        <tbody>

                            {Object.entries(
                                groupedTenders
                            ).map(
                                ([
                                    month,
                                    weeks,
                                ]) => (

                                    <React.Fragment
                                        key={
                                            month
                                        }
                                    >

                                        <tr>

                                            <th
                                                colSpan={
                                                    20
                                                }
                                                style={{
                                                    background:
                                                        "#1e3a8a",
                                                    color:
                                                        "white",
                                                    fontSize:
                                                        "22px",
                                                    textAlign:
                                                        "left",
                                                    padding:
                                                        "12px",
                                                }}
                                            >
                                                {
                                                    month
                                                }
                                            </th>

                                        </tr>

                                        {Object.entries(
                                            weeks
                                        ).map(
                                            ([
                                                week,
                                                weekTenders,
                                            ]) => (

                                                <React.Fragment
                                                    key={
                                                        week
                                                    }
                                                >

                                                    <tr>

                                                        <th
                                                            colSpan={
                                                                20
                                                            }
                                                            style={{
                                                                background:
                                                                    "#dbeafe",
                                                                color:
                                                                    "black",
                                                                fontSize:
                                                                    "18px",
                                                                textAlign:
                                                                    "left",
                                                                padding:
                                                                    "10px",
                                                            }}
                                                        >
                                                            {
                                                                week
                                                            }
                                                        </th>

                                                    </tr>

                                                    {weekTenders.map(
                                                        (
                                                            item
                                                        ) => (

                                                            <tr
                                                                key={
                                                                    item.id
                                                                }
                                                                className={
                                                                    item.opening_date ===
                                                                    today
                                                                        ? "today-row"
                                                                        : ""
                                                                }
                                                            >

                                                                <td>
                                                                    {
                                                                        item.id
                                                                    }
                                                                </td>

                                                                <td>
                                                                    {formatDate(
                                                                        item.timestamp
                                                                    )}
                                                                </td>

                                                                <td>
                                                                    {
                                                                        item.tender_invited_kseb_office
                                                                    }
                                                                </td>

                                                                <td>
                                                                    {formatDate(
                                                                        item.opening_date
                                                                    )}
                                                                </td>

                                                                <td>
                                                                    {formatTime12Hour(
                                                                        item.opening_time
                                                                    )}
                                                                </td>

                                                                <td>
                                                                    {
                                                                        item.quotation_notice_no
                                                                    }
                                                                </td>

                                                                <td>
                                                                    {formatDate(
                                                                        item.quotation_date
                                                                    )}
                                                                </td>

                                                                <td>

                                                                    {editingId ===
                                                                    item.id ? (

                                                                        <input
                                                                            type="text"
                                                                            name="everest_quotation_no"
                                                                            value={
                                                                                editData.everest_quotation_no
                                                                            }
                                                                            onChange={
                                                                                handleEditChange
                                                                            }
                                                                        />

                                                                    ) : (

                                                                        item.everest_quotation_no

                                                                    )}

                                                                </td>

                                                                <td className="sku-rate-column">

                                                                    {editingId ===
                                                                    item.id ? (

                                                                        <textarea
                                                                            className="sku-rate-box"
                                                                            name="sku_rate"
                                                                            value={
                                                                                editData.sku_rate
                                                                            }
                                                                            onChange={
                                                                                handleEditChange
                                                                            }
                                                                        />

                                                                    ) : (

                                                                        <div className="sku-rate-text">

                                                                            {item.sku_rate
                                                                                ?.split(
                                                                                    "\n"
                                                                                )
                                                                                .map(
                                                                                    (
                                                                                        line,
                                                                                        index
                                                                                    ) => (
                                                                                        <div
                                                                                            key={
                                                                                                index
                                                                                            }
                                                                                        >
                                                                                            {
                                                                                                line
                                                                                            }
                                                                                        </div>
                                                                                    )
                                                                                )}

                                                                        </div>

                                                                    )}

                                                                </td>

                                                                <td>

                                                                    <ol className="tender-item-list">

                                                                        {item.tender_item_data
                                                                            ?.split(
                                                                                "\n"
                                                                            )
                                                                            .filter(
                                                                                (
                                                                                    line
                                                                                ) =>
                                                                                    line.trim() !==
                                                                                    ""
                                                                            )
                                                                            .map(
                                                                                (
                                                                                    line,
                                                                                    index
                                                                                ) => (

                                                                                    <li
                                                                                        key={
                                                                                            index
                                                                                        }
                                                                                    >
                                                                                        {
                                                                                            line
                                                                                        }
                                                                                    </li>

                                                                                )
                                                                            )}

                                                                    </ol>

                                                                </td>

                                                                <td>
                                                                    {formatDate(
                                                                        item.quotation_submission_last_date
                                                                    )}
                                                                </td>

                                                                <td>

                                                                    {item.tender_photo_url ? (

                                                                        <img
                                                                            src={
                                                                                item.tender_photo_url
                                                                            }
                                                                            alt="view"
                                                                            style={{
                                                                                cursor:
                                                                                    "pointer",
                                                                                maxWidth:
                                                                                    "60px",
                                                                            }}
                                                                            onClick={() =>
                                                                                window.open(
                                                                                    item.tender_photo_url,
                                                                                    "_blank"
                                                                                )
                                                                            }
                                                                        />

                                                                    ) : (
                                                                        "-"
                                                                    )}

                                                                </td>

                                                                <td>
                                                                    {
                                                                        item.executive_name
                                                                    }
                                                                </td>

                                                                <td>
                                                                    {
                                                                        item.tender_everest_executive_email
                                                                    }
                                                                </td>

                                                                <td>
                                                                    {formatDate(
                                                                        item.tender_dispatched_date
                                                                    )}
                                                                </td>

                                                                <td>
                                                                    {
                                                                        item.tender_comparison
                                                                    }
                                                                </td>

                                                                <td>
                                                                    {
                                                                        item.order_received_status
                                                                    }
                                                                </td>

                                                                <td>

                                                                    {editingId ===
                                                                    item.id ? (

                                                                        <>

                                                                            <button
                                                                                className="tender_save-btn"
                                                                                onClick={() =>
                                                                                    updateTender(
                                                                                        item.id
                                                                                    )
                                                                                }
                                                                            >
                                                                                Save
                                                                            </button>

                                                                            <button
                                                                                className="tender_cancel-btn"
                                                                                onClick={() =>
                                                                                    setEditingId(
                                                                                        null
                                                                                    )
                                                                                }
                                                                            >
                                                                                Cancel
                                                                            </button>

                                                                        </>

                                                                    ) : (

                                                                        <>

                                                                            <button
                                                                                className="tender_edit-btn"
                                                                                onClick={() =>
                                                                                    openEdit(
                                                                                        item
                                                                                    )
                                                                                }
                                                                            >
                                                                                Edit
                                                                            </button>

                                                                            <button
                                                                                className="tender_delete-btn"
                                                                                onClick={() =>
                                                                                    deleteTender(
                                                                                        item.id
                                                                                    )
                                                                                }
                                                                            >
                                                                                Delete
                                                                            </button>

                                                                        </>

                                                                    )}

                                                                </td>

                                                            </tr>

                                                        )
                                                    )}

                                                </React.Fragment>

                                            )
                                        )}

                                    </React.Fragment>

                                )
                            )}

                            {filteredTenders.length ===
                                0 && (

                                <tr>

                                    <td
                                        colSpan="24"
                                    >
                                        No Data Found
                                    </td>

                                </tr>

                            )}

                        </tbody>

                    </table>

                ) : (

                    /* MOBILE */

                    <div className="mobile-tender-list">

                        {Object.entries(
                            groupedTenders
                        ).map(
                            ([
                                month,
                                weeks,
                            ]) => (

                                <React.Fragment
                                    key={
                                        month
                                    }
                                >

                                    <div className="mobile-month-header">
                                        {
                                            month
                                        }
                                    </div>

                                    {Object.entries(
                                        weeks
                                    ).map(
                                        ([
                                            week,
                                            weekTenders,
                                        ]) => (

                                            <React.Fragment
                                                key={
                                                    week
                                                }
                                            >

                                                <div className="mobile-week-header">
                                                    {
                                                        week
                                                    }
                                                </div>

                                                {weekTenders.map(
                                                    (
                                                        item
                                                    ) => (

                                                        <div
                                                            key={
                                                                item.id
                                                            }
                                                            className="mobile-tender-card"
                                                            style={{
                                                                backgroundColor:
                                                                    item.opening_date ===
                                                                    today
                                                                        ? "#fff3cd"
                                                                        : "",
                                                                border:
                                                                    item.opening_date ===
                                                                    today
                                                                        ? "2px solid orange"
                                                                        : "",
                                                            }}
                                                        >

                                                            <div className="tender_mobile-card-header">

                                                                <div>

                                                                    <h4>
                                                                        {
                                                                            item.quotation_notice_no
                                                                        }
                                                                    </h4>

                                                                    <span>
                                                                        {
                                                                            item.tender_invited_kseb_office
                                                                        }
                                                                    </span>

                                                                </div>

                                                                <div className="mobile-id">
                                                                    #
                                                                    {
                                                                        item.id
                                                                    }
                                                                </div>

                                                            </div>

                                                            <div className="tender_mobile-card-body">

                                                                <p>
                                                                    <strong>
                                                                        Quotation Date:
                                                                    </strong>{" "}
                                                                    {formatDate(
                                                                        item.quotation_date
                                                                    )}
                                                                </p>

                                                                <p>
                                                                    <strong>
                                                                        Opening Date:
                                                                    </strong>{" "}
                                                                    {formatDate(
                                                                        item.opening_date
                                                                    )}
                                                                </p>

                                                                <p>
                                                                    <strong>
                                                                        Opening Time:
                                                                    </strong>{" "}
                                                                    {formatTime12Hour(
                                                                        item.opening_time
                                                                    )}
                                                                </p>

                                                                <p>
                                                                    <strong>
                                                                        Executive:
                                                                    </strong>{" "}
                                                                    {
                                                                        item.executive_name
                                                                    }
                                                                </p>

                                                                <p>
                                                                    <strong>
                                                                        Status:
                                                                    </strong>{" "}
                                                                    {
                                                                        item.order_received_status ||
                                                                        "-"
                                                                    }
                                                                </p>

                                                                <p>
                                                                    <strong>
                                                                        Quotation No:
                                                                    </strong>{" "}
                                                                    {
                                                                        item.everest_quotation_no ||
                                                                        "-"
                                                                    }
                                                                </p>

                                                            </div>

                                                            {item.tender_photo_url && (

                                                                <img
                                                                    className="mobile-tender-image"
                                                                    src={
                                                                        item.tender_photo_url
                                                                    }
                                                                    alt="Tender"
                                                                    onClick={() =>
                                                                        window.open(
                                                                            item.tender_photo_url,
                                                                            "_blank"
                                                                        )
                                                                    }
                                                                />

                                                            )}

                                                            <div className="mobile-card-actions">

                                                                {editingId ===
                                                                item.id ? (

                                                                    <>

                                                                        <button
                                                                            className="tender_save-btn"
                                                                            onClick={() =>
                                                                                updateTender(
                                                                                    item.id
                                                                                )
                                                                            }
                                                                        >
                                                                            Save
                                                                        </button>

                                                                        <button
                                                                            className="tender_cancel-btn"
                                                                            onClick={() =>
                                                                                setEditingId(
                                                                                    null
                                                                                )
                                                                            }
                                                                        >
                                                                            Cancel
                                                                        </button>

                                                                    </>

                                                                ) : (

                                                                    <>

                                                                        <button
                                                                            className="tender_edit-btn"
                                                                            onClick={() =>
                                                                                openEdit(
                                                                                    item
                                                                                )
                                                                            }
                                                                        >
                                                                            Edit
                                                                        </button>

                                                                        <button
                                                                            className="tender_delete-btn"
                                                                            onClick={() =>
                                                                                deleteTender(
                                                                                    item.id
                                                                                )
                                                                            }
                                                                        >
                                                                            Delete
                                                                        </button>

                                                                    </>

                                                                )}

                                                            </div>

                                                        </div>

                                                    )
                                                )}

                                            </React.Fragment>

                                        )
                                    )}

                                </React.Fragment>

                            )
                        )}

                        {filteredTenders.length ===
                            0 && (

                            <div className="no-mobile-data">
                                No Data Found
                            </div>

                        )}

                    </div>

                )}

            </div>

            {/* =========================================================
                ADD TENDER MODAL
            ========================================================= */}

            {showAddModal && (

                <div className="modal-overlay">

                    <div className="modal large-modal">

                        <h3 className="modal-title">
                            Add Tender Details
                        </h3>

                        <form
                            onSubmit={
                                addTender
                            }
                        >

                            <div className="form-grid">

                                {/* KSEB OFFICE */}

                                <div className="form-group">

                                    <label>
                                        Tender Invited KSEB Office
                                    </label>

                                    <input
                                        name="tender_invited_kseb_office"
                                        value={
                                            newTender.tender_invited_kseb_office
                                        }
                                        onChange={
                                            handleAddChange
                                        }
                                        required
                                        style={{
                                            border:
                                                duplicateTender
                                                    ? "2px solid #dc2626"
                                                    : undefined,
                                            backgroundColor:
                                                duplicateTender
                                                    ? "#fef2f2"
                                                    : undefined,
                                        }}
                                    />

                                </div>

                                {/* QUOTATION NOTICE NUMBER */}

                                <div className="form-group">

                                    <label>
                                        Quotation Notice No
                                    </label>

                                    <input
                                        name="quotation_notice_no"
                                        value={
                                            newTender.quotation_notice_no
                                        }
                                        onChange={
                                            handleAddChange
                                        }
                                        required
                                        style={{
                                            border:
                                                duplicateTender
                                                    ? "2px solid #dc2626"
                                                    : undefined,
                                            backgroundColor:
                                                duplicateTender
                                                    ? "#fef2f2"
                                                    : undefined,
                                        }}
                                    />

                                    {/* LIVE DUPLICATE WARNING */}

                                    {duplicateTender && (

                                        <div
                                            style={{
                                                marginTop:
                                                    "8px",

                                                padding:
                                                    "12px 14px",

                                                background:
                                                    "#fee2e2",

                                                border:
                                                    "1px solid #ef4444",

                                                borderRadius:
                                                    "7px",

                                                color:
                                                    "#991b1b",

                                                fontSize:
                                                    "14px",

                                                fontWeight:
                                                    "600",
                                            }}
                                        >

                                            <div
                                                style={{
                                                    fontSize:
                                                        "15px",
                                                    marginBottom:
                                                        "5px",
                                                }}
                                            >
                                                ⚠️ DUPLICATE TENDER
                                            </div>

                                            <div
                                                style={{
                                                    fontWeight:
                                                        "400",
                                                }}
                                            >
                                                This KSEB Office
                                                and Quotation
                                                Notice Number
                                                already exists.
                                            </div>

                                            <div
                                                style={{
                                                    marginTop:
                                                        "5px",
                                                    fontSize:
                                                        "13px",
                                                }}
                                            >
                                                Existing Tender
                                                ID: #
                                                {
                                                    duplicateTender.id
                                                }
                                            </div>

                                            <div
                                                style={{
                                                    marginTop:
                                                        "3px",
                                                    fontSize:
                                                        "13px",
                                                }}
                                            >
                                                Office:{" "}
                                                {
                                                    duplicateTender.tender_invited_kseb_office
                                                }
                                            </div>

                                        </div>

                                    )}

                                </div>

                                {/* QUOTATION DATE */}

                                <div className="form-group">

                                    <label>
                                        Quotation Date
                                    </label>

                                    <input
                                        type="date"
                                        name="quotation_date"
                                        value={
                                            newTender.quotation_date
                                        }
                                        onChange={
                                            handleAddChange
                                        }
                                        required
                                    />

                                </div>

                                {/* TENDER ITEM DATA */}

                                <div className="form-group">

                                    <label>
                                        Tender Item Data
                                    </label>

                                    <textarea
                                        name="tender_item_data"
                                        value={
                                            newTender.tender_item_data
                                        }
                                        onChange={
                                            handleAddChange
                                        }
                                    />

                                </div>

                                {/* LAST DATE */}

                                <div className="form-group">

                                    <label>
                                        Quotation Submission Last Date
                                    </label>

                                    <input
                                        type="date"
                                        name="quotation_submission_last_date"
                                        value={
                                            newTender.quotation_submission_last_date
                                        }
                                        onChange={
                                            handleAddChange
                                        }
                                    />

                                </div>

                                {/* OPENING DATE */}

                                <div className="form-group">

                                    <label>
                                        Opening Date
                                    </label>

                                    <input
                                        type="date"
                                        name="opening_date"
                                        value={
                                            newTender.opening_date
                                        }
                                        onChange={
                                            handleAddChange
                                        }
                                        required
                                    />

                                </div>

                                {/* OPENING TIME */}

                                <div className="form-group">

                                    <label>
                                        Opening Time
                                    </label>

                                    <input
                                        type="time"
                                        name="opening_time"
                                        value={
                                            newTender.opening_time
                                        }
                                        onChange={
                                            handleAddChange
                                        }
                                        required
                                    />

                                </div>

                                {/* DISPATCHED DATE */}

                                <div className="form-group">

                                    <label>
                                        Tender Dispatched Date
                                    </label>

                                    <input
                                        type="date"
                                        name="tender_dispatched_date"
                                        value={
                                            newTender.tender_dispatched_date
                                        }
                                        onChange={
                                            handleAddChange
                                        }
                                    />

                                </div>

                                {/* EXECUTIVE */}

                                <div className="form-group">

                                    <label>
                                        Sales Executive
                                    </label>

                                    <input
                                        list="executiveList"
                                        name="executive_name"
                                        placeholder="Select or Type Executive Name"
                                        value={
                                            newTender.executive_name
                                        }
                                        onChange={
                                            handleAddChange
                                        }
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

                                    <label>
                                        Sales Executive Email
                                    </label>

                                    <input
                                        type="email"
                                        list="emailList"
                                        name="tender_everest_executive_email"
                                        placeholder="Select or Type Email"
                                        value={
                                            newTender.tender_everest_executive_email
                                        }
                                        onChange={
                                            handleAddChange
                                        }
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

                                    <label>
                                        Tender Photo
                                    </label>

                                    <input
                                        type="file"
                                        name="tender_photo"
                                        onChange={
                                            handleAddChange
                                        }
                                    />

                                </div>

                            </div>

                            {/* MODAL BUTTONS */}

                            <div className="modal-buttons">

                                <button
                                    type="submit"
                                    className="tender_save-btn"
                                    disabled={
                                        !!duplicateTender
                                    }
                                    style={{
                                        opacity:
                                            duplicateTender
                                                ? 0.5
                                                : 1,

                                        cursor:
                                            duplicateTender
                                                ? "not-allowed"
                                                : "pointer",
                                    }}
                                >
                                    Save
                                </button>

                                <button
                                    type="button"
                                    className="tender_cancel-btn"
                                    onClick={() => {
                                        setShowAddModal(
                                            false
                                        );

                                        setDuplicateTender(
                                            null
                                        );
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