import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { auth, db } from "../../components/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { apiFetch } from "../../api/apiClient";


const API = "/serverphp";

const QuotationFollowup = () => {



    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [userRole, setUserRole] = useState("");
    const [telecallerName, setTelecallerName] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    const [followupHistory, setFollowupHistory] = useState([]);

    const [expandedCell, setExpandedCell] = useState(null);
    const [expandedRow, setExpandedRow] = useState(null);

    


    const expandedRowRef = useRef(null);
    const expandedQuotationRef = useRef(null);

    const [monthDetails, setMonthDetails] = useState([]);

    const [pendingMonths, setPendingMonths] = useState({});


    const [expandedQuotation, setExpandedQuotation] = useState(null);

    const [showAllMonths, setShowAllMonths] = useState(false);

    const [showNoteModal, setShowNoteModal] = useState(false);
    const [selectedQuotation, setSelectedQuotation] = useState(null);
    const [followup, setFollowup] = useState({
        callDate: new Date().toISOString().split("T")[0],
        followupDate: "",
        telecaller: "",
        status: "",
        remarks: ""
    });

    useEffect(() => {
        fetchSalesOrders();
    }, []);


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

    const [screenWidth, setScreenWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => {
            setScreenWidth(window.innerWidth);
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    const isBelow1600 = screenWidth < 1600;
    const isBelow1200 = screenWidth < 1200;
    const isBelow900 = screenWidth < 900;

    const fetchSalesOrders = async () => {

        setLoading(true);

        try {

            const response = await apiFetch(
                `${API}/quotation_followup.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({})
                }
            );

            const result = await response.json();

            if (Array.isArray(result)) {

                setData(result);

                // Get quotation-only count for every party/month
                const counts = {};

                for (const row of result) {

                    for (const month of monthColumns) {

                        const amount = Number(row[month] || 0);

                        if (amount <= 0) continue;

                        const key = `${row.PartyLedgerName}_${month}`;

                        try {

                            const detailResponse = await apiFetch(
                                `${API}/quotation_month_details.php`,
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json"
                                    },
                                    body: JSON.stringify({
                                        PartyLedgerName: row.PartyLedgerName,
                                        month: month
                                    })
                                }
                            );

                            const details = await detailResponse.json();

                            if (Array.isArray(details)) {

                                const quotationOnlyCount = details.filter(
                                    item =>
                                        String(item.status || "")
                                            .trim()
                                            .toLowerCase() === "quotation only"
                                ).length;

                                counts[key] = quotationOnlyCount;
                            }

                        } catch (err) {

                            console.error(
                                `Error loading ${row.PartyLedgerName} - ${month}:`,
                                err
                            );

                            counts[key] = 0;
                        }
                    }
                }

                setPendingMonths(counts);

            } else {

                console.error("API Error:", result);
                setData([]);
            }

        } catch (error) {

            console.error("Fetch error:", error);

        } finally {

            setLoading(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return "";

        const d = new Date(date);

        if (isNaN(d.getTime())) return date;

        const day = String(d.getDate()).padStart(2, "0");

        const month = d.toLocaleString("en-US", {
            month: "long"
        });

        const year = d.getFullYear();

        return `${day} - ${month} - ${year}`;
    };


    const exportToExcel = () => {

        if (!data || data.length === 0) {

            alert("No data available to export.");

            return;
        }


        const excelData = data.map((row, index) => ({

            "S.No": index + 1,

            "Party Name":
                row.PartyLedgerName || "",

            "Ledger Group":
                row._LedGroup || "",

            "GST Type":
                row._GSTRegistrationType || "",

            "GSTIN":
                row._PartyGSTIN || "",

            "Mobile":
                row.mobile || "",

            "Purchase Contact":
                row.purchase_contact || "",

            "Email":
                row.email || "",


            "Apr":
                Number(row.Apr || 0),


            "May":
                Number(row.May || 0),

            "Jun":
                Number(row.Jun || 0),

            "Jul":
                Number(row.Jul || 0),

            "Aug":
                Number(row.Aug || 0),

            "Sep":
                Number(row.Sep || 0),

            "Oct":
                Number(row.Oct || 0),

            "Nov":
                Number(row.Nov || 0),

            "Dec":
                Number(row.Dec || 0),

            "Jan":
                Number(row.Jan || 0),

            "Feb":
                Number(row.Feb || 0),

            "Mar":
                Number(row.Mar || 0),


            "Total":
                Number(row.total_amount || 0)

        }));


        /* Create worksheet */

        const worksheet =
            XLSX.utils.json_to_sheet(excelData);


        /* Create workbook */

        const workbook =
            XLSX.utils.book_new();


        /* Add worksheet */

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Sales Orders"
        );


        /* Set column widths */

        worksheet["!cols"] = [

            { wch: 7 },
            { wch: 30 },
            { wch: 20 },
            { wch: 20 },
            { wch: 20 },
            { wch: 16 },
            { wch: 25 },
            { wch: 30 },

            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },

            { wch: 18 }
        ];




        XLSX.writeFile(
            workbook,
            "Quotation_Followup.xlsx"
        );

    };
    const monthColumns = [
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
        "Jan",
        "Feb",
        "Mar"
    ];

    const getCurrentAndPreviousMonths = () => {
        const now = new Date();
        const calendarMonth = now.getMonth();

        const financialMonths = [
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
            "Jan",
            "Feb",
            "Mar"
        ];

        const financialIndex =
            calendarMonth >= 3
                ? calendarMonth - 3
                : calendarMonth + 9;

        const currentMonth = financialMonths[financialIndex];

        const previousMonth =
            financialMonths[
            (financialIndex - 1 + 12) % 12
            ];

        return [previousMonth, currentMonth];
    };

    const [previousMonth, currentMonth] =
        getCurrentAndPreviousMonths();

    const currentVisibleMonths = [
        previousMonth,
        currentMonth
    ];
    const filteredData = data.filter((row) => {
        const search = searchTerm.toLowerCase();

        // Search condition
        const matchesSearch =
            (row.PartyLedgerName || "").toLowerCase().includes(search) ||
            (row.mobile || "").toLowerCase().includes(search) ||
            (row.purchase_contact || "").toLowerCase().includes(search);

        if (!matchesSearch) {
            return false;
        }

        // When showing only Current + Previous month
        if (!showAllMonths) {
            return currentVisibleMonths.some(
                (month) => Number(row[month] || 0) > 0
            );
        }

        // When showing all months
        return monthColumns.some(
            (month) => Number(row[month] || 0) > 0
        );
    });

    const monthsWithData = (months) =>
        months.filter(month =>
            filteredData.some(
                row => Number(row[month] || 0) > 0
            )
        );

    const visibleMonths =
        screenWidth < 1600
            ? monthsWithData(currentVisibleMonths)
            : showAllMonths
                ? monthsWithData(monthColumns)
                : monthsWithData(currentVisibleMonths);

    const loadMonthDetails = async (party, month) => {

        const key = `${party}_${month}`;

        if (expandedCell === key) {

            setExpandedCell(null);
            setExpandedRow(null);
            setMonthDetails([]);

            return;
        }

        try {

            const response = await apiFetch(
                `${API}/quotation_month_details.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        PartyLedgerName: party,
                        month: month
                    })
                }
            );

            const result = await response.json();

            if (Array.isArray(result)) {

                setMonthDetails(result);



                const quotationOnlyCount = result.filter(
                    item =>
                        String(item.status || "")
                            .trim()
                            .toLowerCase() === "quotation only"
                ).length;

                setPendingMonths(prev => ({
                    ...prev,
                    [key]: quotationOnlyCount
                }));

            } else {

                setMonthDetails([]);

            }

            setExpandedCell(key);

            setExpandedRow({
                party: party,
                month: month
            });

        } catch (error) {

            console.log(error);

        }
    };


    useEffect(() => {
        if (expandedRow && expandedRowRef.current) {
            setTimeout(() => {
                expandedRowRef.current.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });
            }, 100);
        }
    }, [expandedRow]);


    const formatAmount = (value) => {
        return Number(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const quotationTotal = monthDetails.reduce(
        (sum, item) => sum + Number(item.quotation_amount || 0),
        0
    );

    const billedTotal = monthDetails.reduce(
        (sum, item) => sum + Number(item.billed_amount || 0),
        0
    );

    const loadFollowupHistory = async (quotationNo) => {
        try {

            console.log("Loading:", quotationNo);

            const response = await apiFetch(
                `${API}/get_quotation_followup.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        quotationNo
                    })
                }
            );

            const result = await response.json();

            console.log("Followup API:", result);

            if (result && Array.isArray(result.data)) {

                setFollowupHistory(result.data);

            } else {

                setFollowupHistory([]);

            }

        } catch (err) {

            console.error(err);
            setFollowupHistory([]);

        }
    };

    const openNoteModal = (row, item, month) => {

        setSelectedQuotation({
            party: row.PartyLedgerName,
            mobile: row.mobile || "",
            month,
            quotationNo: item.quotation_no,
            orderNo: item.order_no,
            invoiceNo: item.invoice_no,
            status: item.status
        });
        console.log("Item:", item);
        console.log("Quotation No:", item.quotation_no);
        loadFollowupHistory(item.quotation_no);

        setFollowup({
            callDate: new Date().toISOString().split("T")[0],
            followupDate: "",
            telecaller: telecallerName,
            status: "",
            remarks: ""
        });

        setShowNoteModal(true);
    };

    const labelStyle = {
        padding: "10px 12px",
        background: "#f8f9fa",
        fontSize: "13px",
        fontWeight: "600",
        color: "#444",
        borderRight: "1px solid #ddd",
        display: "flex",
        alignItems: "center"
    };

    const valueStyle = {
        padding: "10px 12px",
        fontSize: "13px",
        color: "#333",
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        wordBreak: "break-word"
    };

    const formRowStyle = {
        display: "grid",
        gridTemplateColumns: "130px minmax(0, 1fr)",
        alignItems: "center",
        columnGap: "12px",
        marginBottom: "14px"
    };

    const formLabelStyle = {
        fontSize: "14px",
        fontWeight: "600",
        color: "#444"
    };

    const inputStyle = {
        width: "100%",
        height: "38px",
        padding: "7px 10px",
        border: "1px solid #ccc",
        borderRadius: "5px",
        fontSize: "14px",
        boxSizing: "border-box",
        outline: "none"
    };


    useEffect(() => {
        if (!expandedQuotation || !expandedQuotationRef.current) {
            return;
        }

        const element = expandedQuotationRef.current;

        setTimeout(() => {
            const rect = element.getBoundingClientRect();

            // Approximate height of sticky search/header area
            const stickyHeaderHeight = 90;

            const isAboveVisibleArea =
                rect.top < stickyHeaderHeight;

            const isBelowVisibleArea =
                rect.bottom > window.innerHeight;

            if (isAboveVisibleArea || isBelowVisibleArea) {
                element.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }
        }, 100);
    }, [expandedQuotation]);


    console.log("User Role:", userRole);
    return (

        <>

            <Banner />

            <div style={{ padding: "20px" }}>



                <div
                    style={{
                        position: "sticky",
                        top: "65px",
                        zIndex: 100,
                        background: "#fff",
                        padding: "10px 0",
                        borderBottom: "1px solid #ddd"
                    }}
                >
                    <input
                        type="text"
                        placeholder="Search Party / Mobile / Contact..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: "280px",
                            padding: "8px 12px",
                            border: "1px solid #ccc",
                            borderRadius: "6px"
                        }}
                    />
                    <h2
                        style={{
                            margin: 0,
                            textAlign: "center",
                            flex: 1,
                            color: "#05693a",
                            fontSize: "25px",
                            fontWeight: "600"
                        }}
                    >
                        Quotation Follow-up
                    </h2>

                    {/* <button
                        onClick={exportToExcel}
                        disabled={loading || data.length === 0}
                        style={{
                            backgroundColor: "#198754",
                            color: "white",
                            border: "none",
                            padding: "10px 18px",
                            borderRadius: "6px",
                            cursor:
                                loading || data.length === 0
                                    ? "not-allowed"
                                    : "pointer",
                            fontSize: "14px",
                            fontWeight: "600"
                        }}
                    >
                        Export to Excel
                    </button>*/}
                </div>

                {loading && <p>Loading...</p>}


                <div
                    style={{
                        width: "100%",
                        overflowX: "auto",
                        overflowY: "hidden",
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: "110px"



                    }}
                >
                    <table
                        style={{
                            minWidth:
                                screenWidth < 900
                                    ? "1000px"
                                    : screenWidth < 1600
                                        ? "1200px"
                                        : "1600px",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            fontSize: "13px"

                        }}
                    >

                        <thead>

                            <tr>

                                <th
                                    style={{
                                        position: "sticky",
                                        minWidth: "50px",
                                        width: "50px",
                                        maxWidth: "50px"
                                    }}>S.No</th>

                                <th
                                    style={{
                                        position: "sticky",
                                        left: 0,

                                        zIndex: 3,
                                        textAlign: "center",
                                        padding: "8px",
                                        minWidth: "300px",
                                        width: "300px",
                                        maxWidth: "450px"
                                    }}
                                >
                                    Party Name
                                </th>

                                <th
                                    style={{
                                        textAlign: "center",
                                        minWidth: showAllMonths ? "180px" : "250px",
                                        width: showAllMonths ? "180px" : "250px"
                                    }}
                                >
                                    Ledger Group
                                </th>



                                {/*  <th style={{ textAlign: "center" }}>Mobile</th>

                                <th style={{ textAlign: "center" }}>Purchase Contact</th>*/}
                                {/* Expand / collapse arrow */}
                                <th
                                    style={{
                                        width: "30px",
                                        minWidth: "30px",
                                        maxWidth: "30px",
                                        padding: 0,
                                        textAlign: "center",
                                        border: "none",
                                        background: "#fff"
                                    }}
                                >
                                    <span
                                        onClick={() => {
                                            setShowAllMonths(prev => !prev);
                                        }}
                                        title={showAllMonths ? "Show current and previous month" : "Show all months"}
                                        style={{
                                            cursor: "pointer",
                                            fontSize: "18px",
                                            fontWeight: "700",
                                            color: "#05693a",
                                            userSelect: "none"
                                        }}
                                    >
                                        {showAllMonths ? "‹" : "›"}
                                    </span>
                                </th>

                                {visibleMonths.map(month => (
                                    <th
                                        key={month}
                                        style={{
                                            width: "150px",
                                            minWidth: "150px",
                                            maxWidth: "150px",
                                            textAlign: "center"
                                        }}
                                    >
                                        {month}
                                    </th>
                                ))}


                                <th
                                    style={{
                                        width: "120px",
                                        minWidth: "120px",
                                        maxWidth: "120px",
                                        textAlign: "center"
                                    }}>Total</th>

                            </tr>

                        </thead>


                        <tbody>

                            {filteredData.map((row, index) => (
                                <React.Fragment key={index}>
                                    <tr>

                                        <td
                                            style={{

                                                minWidth: "50px",
                                                width: "50px",
                                                maxWidth: "50px"
                                            }}>
                                            {index + 1}
                                        </td>


                                        <td
                                            style={{
                                                position: "sticky",
                                                left: 0,
                                                background: "#fff",
                                                zIndex: 2,
                                                border: "1px solid #ddd",
                                                padding: "8px",
                                                minWidth: "300px",
                                                width: "300px",
                                                maxWidth: "450px"
                                            }}
                                        >
                                            {row.PartyLedgerName}
                                        </td>


                                        <td
                                            style={{
                                                minWidth: showAllMonths ? "180px" : "250px",
                                                width: showAllMonths ? "180px" : "250px"
                                            }}
                                        >
                                            {row._LedGroup}
                                        </td>





                                        {/*} <td>
                                            {row.mobile}
                                        </td>


                                        <td>
                                            {row.purchase_contact}
                                        </td> */}
                                        <td
                                            style={{
                                                width: "30px",
                                                minWidth: "30px",
                                                maxWidth: "30px",
                                                padding: "0",
                                                border: "none",
                                                background: "#fff"
                                            }}
                                        >
                                        </td>


                                        {visibleMonths.map((month) => {

                                            const amount = Number(row[month] || 0);
                                            const key = `${row.PartyLedgerName}_${month}`;

                                            const status = row[`${month}_status`];

                                            let textColor = "inherit";

                                            if (status === "quotation") {
                                                textColor = "#f79577"; // Red
                                            } else if (status === "billed") {
                                                textColor = "#198754"; // Green
                                            } else if (status === "mixed") {
                                                textColor = "#0d6efd"; // Blue
                                            }

                                            return (
                                                <td
                                                    key={month}
                                                    style={{
                                                        width: "120px",
                                                        minWidth: "120px",
                                                        maxWidth: "120px",
                                                        textAlign: "right",
                                                        position: "relative",
                                                        cursor: amount > 0 ? "pointer" : "default",
                                                        color: textColor,
                                                        fontWeight: textColor !== "inherit" ? "700" : "400",
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();

                                                        if (amount > 0) {
                                                            loadMonthDetails(
                                                                row.PartyLedgerName,
                                                                month
                                                            );
                                                        }
                                                    }}
                                                >

                                                    {amount === 0 ? (
                                                        ""
                                                    ) : (
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "space-between",
                                                                width: "100%"
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    width: "18px",
                                                                    height: "18px",

                                                                    borderRadius: "3px",
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",

                                                                    color: expandedCell === key ? "#0ae6c8" : "#666",
                                                                    fontSize: "10px",
                                                                    flexShrink: 0
                                                                }}
                                                            >
                                                                {expandedCell === key ? "▲" : "▼"}
                                                            </div>

                                                            <span
                                                                style={{
                                                                    flex: 1,
                                                                    textAlign: "right",
                                                                    marginLeft: "8px",
                                                                    display: "flex",
                                                                    flexDirection: "column",
                                                                    alignItems: "flex-end",
                                                                    lineHeight: "1.2"
                                                                }}
                                                            >
                                                                {/* Amount */}
                                                                <span>
                                                                    {formatAmount(amount)}
                                                                </span>

                                                                {/* Quotation-only count */}
                                                                {Number(row[`${month}_quotation_only_count`] || 0) > 0 && (
                                                                    <span
                                                                        style={{
                                                                            color: "#dc3545",
                                                                            fontWeight: "700",
                                                                            fontSize: "10px",
                                                                            marginTop: "2px"
                                                                        }}
                                                                    >
                                                                        ({row[`${month}_quotation_only_count`]})
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}

                                                </td>
                                            );
                                        })}




                                        <td
                                            style={{
                                                width: "100px",
                                                minWidth: "100px",
                                                maxWidth: "100px",
                                                textAlign: "right"
                                            }}>
                                            {formatAmount(
                                                visibleMonths.reduce(
                                                    (sum, month) =>
                                                        sum + Number(row[month] || 0),
                                                    0
                                                )
                                            )}
                                        </td>
                                    </tr>

                                    {
                                        expandedRow &&
                                        expandedRow.party === row.PartyLedgerName &&
                                        (
                                            <tr ref={expandedRowRef}>
                                                <td
                                                    colSpan={4 + visibleMonths.length}
                                                    style={{
                                                        padding: "0",
                                                        border: "none",
                                                        background: "#f8f9fa"
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: "100%",
                                                            maxHeight: "45vh",
                                                            overflowY: "auto",
                                                            background: "#ffffff",
                                                            border: "1px solid #ddd",
                                                            borderRadius: "6px",
                                                            padding: "6px 8px",
                                                            boxSizing: "border-box",
                                                            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                                            position: "relative",
                                                            zIndex: 10
                                                        }}
                                                    >

                                                        {/* PARTY NAME + CLOSE BUTTON */}
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "space-between",
                                                                padding: "4px 6px",
                                                                marginBottom: "5px",
                                                                borderBottom: "1px solid #ddd"
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontSize: "14px",
                                                                    fontWeight: "700",
                                                                    color: "#05693a"
                                                                }}
                                                            >
                                                                {expandedRow?.party || ""}
                                                            </span>

                                                            <button
                                                                onClick={() => {
                                                                    setExpandedCell(null);
                                                                    setExpandedRow(null);
                                                                    setMonthDetails([]);
                                                                }}
                                                                style={{
                                                                    border: "none",
                                                                    background: "#dc3545",
                                                                    color: "#fff",
                                                                    width: "24px",
                                                                    height: "24px",
                                                                    borderRadius: "4px",
                                                                    cursor: "pointer",
                                                                    fontSize: "16px",
                                                                    fontWeight: "bold",
                                                                    lineHeight: "20px"
                                                                }}
                                                                title="Close"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>

                                                        <table
                                                            style={{
                                                                width: "100%",
                                                                borderCollapse: "collapse",
                                                                fontSize: "11px",
                                                                lineHeight: "1.2"
                                                            }}
                                                        >

                                                            <thead>
                                                                <tr>
                                                                    <th>SL NO</th>

                                                                    <th
                                                                        style={{
                                                                            padding: "5px 8px",
                                                                            textAlign: "left",
                                                                            borderBottom: "1px solid #ddd",
                                                                            textAlign: "center"
                                                                        }}
                                                                    >
                                                                        Date
                                                                    </th>

                                                                    <th
                                                                        style={{
                                                                            padding: "5px 8px",
                                                                            textAlign: "left",
                                                                            borderBottom: "1px solid #ddd",
                                                                            textAlign: "center"



                                                                        }}
                                                                    >
                                                                        Quotation No
                                                                    </th>

                                                                    <th
                                                                        style={{
                                                                            padding: "5px 8px",
                                                                            textAlign: "left",
                                                                            borderBottom: "1px solid #ddd",
                                                                            textAlign: "center"
                                                                        }}
                                                                    >
                                                                        Order No
                                                                    </th>

                                                                    <th
                                                                        style={{
                                                                            padding: "5px 8px",
                                                                            textAlign: "left",
                                                                            borderBottom: "1px solid #ddd",
                                                                            textAlign: "center"
                                                                        }}
                                                                    >
                                                                        Invoice No
                                                                    </th>

                                                                    <th
                                                                        style={{
                                                                            padding: "5px 8px",
                                                                            textAlign: "right",
                                                                            borderBottom: "1px solid #ddd",
                                                                            textAlign: "center"
                                                                        }}
                                                                    >
                                                                        Quotation Amount
                                                                    </th>

                                                                    <th
                                                                        style={{
                                                                            padding: "5px 8px",
                                                                            textAlign: "right",
                                                                            borderBottom: "1px solid #ddd",
                                                                            textAlign: "center"
                                                                        }}
                                                                    >
                                                                        Billed Amount
                                                                    </th>

                                                                    <th
                                                                        style={{
                                                                            padding: "5px 8px",
                                                                            textAlign: "center",
                                                                            borderBottom: "1px solid #ddd",
                                                                            textAlign: "center"
                                                                        }}
                                                                    >
                                                                        Status
                                                                    </th>

                                                                    <th
                                                                        style={{
                                                                            padding: "5px 8px",
                                                                            textAlign: "center",
                                                                            borderBottom: "1px solid #ddd"
                                                                        }}
                                                                    >
                                                                        Notes
                                                                    </th>

                                                                </tr>
                                                            </thead>


                                                            <tbody>

                                                                {monthDetails.map((item, i) => (
                                                                    <React.Fragment key={i}>

                                                                        {/* MAIN QUOTATION ROW */}
                                                                        <tr>

                                                                            <td
                                                                                style={{
                                                                                    padding: "4px 8px",
                                                                                    textAlign: "center",
                                                                                    borderBottom: "1px solid #eee"
                                                                                }}
                                                                            >
                                                                                {i + 1}
                                                                            </td>

                                                                            <td
                                                                                style={{
                                                                                    padding: "4px 8px",
                                                                                    borderBottom: "1px solid #eee"
                                                                                }}
                                                                            >
                                                                                {formatDate(item.date)}
                                                                            </td>

                                                                            <td
                                                                                style={{
                                                                                    padding: "4px 8px",
                                                                                    borderBottom: "1px solid #eee"
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    style={{
                                                                                        display: "flex",
                                                                                        alignItems: "center",
                                                                                        gap: "6px"
                                                                                    }}
                                                                                >
                                                                                    <span
                                                                                        onClick={() => {
                                                                                            setExpandedQuotation(prev =>
                                                                                                prev === item.quotation_no
                                                                                                    ? null
                                                                                                    : item.quotation_no
                                                                                            );
                                                                                        }}
                                                                                        style={{
                                                                                            cursor: "pointer",
                                                                                            fontSize: "11px",
                                                                                            color: expandedQuotation === item.quotation_no ? "#d733dd" : "#7649f1",
                                                                                            fontWeight: "700",
                                                                                            width: "14px",
                                                                                            userSelect: "none"
                                                                                        }}
                                                                                        title="Show item details"
                                                                                    >
                                                                                        {expandedQuotation === item.quotation_no
                                                                                            ? "▲"
                                                                                            : "▼"}
                                                                                    </span>

                                                                                    <span>
                                                                                        {item.quotation_no}
                                                                                    </span>
                                                                                </div>
                                                                            </td>

                                                                            <td
                                                                                style={{
                                                                                    padding: "4px 8px",
                                                                                    borderBottom: "1px solid #eee"
                                                                                }}
                                                                            >
                                                                                {item.order_no || ""}
                                                                            </td>

                                                                            <td
                                                                                style={{
                                                                                    padding: "4px 8px",
                                                                                    borderBottom: "1px solid #eee"
                                                                                }}
                                                                            >
                                                                                {item.invoice_no || ""}
                                                                            </td>

                                                                            <td
                                                                                style={{
                                                                                    padding: "4px 8px",
                                                                                    textAlign: "right",
                                                                                    borderBottom: "1px solid #eee"
                                                                                }}
                                                                            >
                                                                                {Number(item.quotation_amount || 0).toLocaleString(
                                                                                    "en-IN",
                                                                                    {
                                                                                        minimumFractionDigits: 2,
                                                                                        maximumFractionDigits: 2
                                                                                    }
                                                                                )}
                                                                            </td>

                                                                            <td
                                                                                style={{
                                                                                    padding: "4px 8px",




                                                                                    textAlign: "right",
                                                                                    borderBottom: "1px solid #eee"
                                                                                }}
                                                                            >
                                                                                {item.billed_amount === ""
                                                                                    ? ""
                                                                                    : Number(item.billed_amount || 0).toLocaleString(
                                                                                        "en-IN",
                                                                                        {
                                                                                            minimumFractionDigits: 2,
                                                                                            maximumFractionDigits: 2
                                                                                        }
                                                                                    )}
                                                                            </td>

                                                                            <td
                                                                                style={{
                                                                                    padding: "4px 8px",
                                                                                    textAlign: "center",
                                                                                    borderBottom: "1px solid #eee",
                                                                                    fontWeight: "600",
                                                                                    color:
                                                                                        item.status?.toLowerCase() === "billed"
                                                                                            ? "#198754"
                                                                                            : "#dc3545"
                                                                                }}
                                                                            >
                                                                                {item.status?.toLowerCase() === "billed" &&
                                                                                    item.billed_party &&
                                                                                    item.billed_party.trim().toLowerCase() !==
                                                                                    row.PartyLedgerName?.trim().toLowerCase()
                                                                                    ? ` ${item.billed_party}`
                                                                                    : item.status}
                                                                            </td>

                                                                            <td
                                                                                style={{
                                                                                    textAlign: "center",
                                                                                    borderBottom: "1px solid #eee"
                                                                                }}
                                                                            >
                                                                                {String(item.status || "")
                                                                                    .trim()
                                                                                    .toLowerCase() === "quotation only" ? (
                                                                                    <button
                                                                                        onClick={() =>
                                                                                            openNoteModal(
                                                                                                row,
                                                                                                item,
                                                                                                expandedRow?.month
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




                                                                        {/* ITEM DETAILS */}
                                                                        {expandedQuotation === item.quotation_no &&
                                                                            Array.isArray(item.items) &&
                                                                            item.items.length > 0 && (
                                                                                <tr ref={expandedQuotationRef}>
                                                                                    <td
                                                                                        colSpan={9}
                                                                                        style={{
                                                                                            padding: "6px 20px 8px 40px",
                                                                                            background: "#f8f9fa",
                                                                                            borderBottom: "1px solid #ddd"
                                                                                        }}
                                                                                    >
                                                                                        <div
                                                                                            style={{
                                                                                                width: "100%",
                                                                                                border: "2px solid #05693a",
                                                                                                borderRadius: "5px",
                                                                                                background: "#fff",
                                                                                                overflow: "hidden"
                                                                                            }}
                                                                                        >
                                                                                            {/* ITEM DETAILS HEADER */}
                                                                                            <div
                                                                                                style={{
                                                                                                    display: "flex",
                                                                                                    alignItems: "center",
                                                                                                    justifyContent: "space-between",
                                                                                                    padding: "6px 10px",
                                                                                                    background: "#eef3f0",
                                                                                                    borderBottom: "1px solid #ddd"
                                                                                                }}
                                                                                            >
                                                                                                <span
                                                                                                    style={{
                                                                                                        fontSize: "12px",
                                                                                                        fontWeight: "700",
                                                                                                        color: "#05693a"
                                                                                                    }}
                                                                                                >
                                                                                                    Item Details — Quotation No:{" "}
                                                                                                    {item.quotation_no}
                                                                                                </span>

                                                                                                <button
                                                                                                    onClick={() =>
                                                                                                        setExpandedQuotation(null)
                                                                                                    }
                                                                                                    style={{
                                                                                                        border: "none",
                                                                                                        background: "#dc3545",
                                                                                                        color: "#fff",
                                                                                                        width: "22px",
                                                                                                        height: "22px",
                                                                                                        borderRadius: "4px",
                                                                                                        cursor: "pointer",
                                                                                                        fontSize: "15px",
                                                                                                        fontWeight: "bold",
                                                                                                        lineHeight: "20px",
                                                                                                        padding: 0
                                                                                                    }}
                                                                                                    title="Close item details"
                                                                                                >
                                                                                                    ×
                                                                                                </button>
                                                                                            </div>

                                                                                            {/* ITEM DETAILS TABLE */}
                                                                                            <table
                                                                                                style={{
                                                                                                    width: "100%",
                                                                                                    borderCollapse: "collapse",
                                                                                                    fontSize: "12px",
                                                                                                    tableLayout: "fixed"
                                                                                                }}
                                                                                            >
                                                                                                <thead>
                                                                                                    <tr
                                                                                                        style={{
                                                                                                            background: "#f7f7f7"
                                                                                                        }}
                                                                                                    >
                                                                                                        <th
                                                                                                            style={{
                                                                                                                padding: "6px 8px",
                                                                                                                textAlign: "center",
                                                                                                                border: "1px solid #ddd",
                                                                                                                width: "50px",
                                                                                                                position: "sticky",
                                                                                                                top: 0,
                                                                                                                zIndex: 5

                                                                                                            }}
                                                                                                        >
                                                                                                            SL No.
                                                                                                        </th>

                                                                                                        <th
                                                                                                            style={{
                                                                                                                padding: "6px 8px",
                                                                                                                textAlign: "left",
                                                                                                                border: "1px solid #ddd",
                                                                                                                width: "45%",
                                                                                                                position: "sticky",
                                                                                                                top: 0,
                                                                                                                zIndex: 5

                                                                                                            }}
                                                                                                        >
                                                                                                            Item Name
                                                                                                        </th>

                                                                                                        <th
                                                                                                            style={{
                                                                                                                padding: "6px 8px",
                                                                                                                textAlign: "right",
                                                                                                                border: "1px solid #ddd",
                                                                                                                width: "120px",
                                                                                                                position: "sticky",
                                                                                                                top: 0,
                                                                                                                zIndex: 5

                                                                                                            }}
                                                                                                        >
                                                                                                            Rate
                                                                                                        </th>

                                                                                                        <th
                                                                                                            style={{
                                                                                                                padding: "6px 8px",
                                                                                                                textAlign: "right",
                                                                                                                border: "1px solid #ddd",
                                                                                                                width: "100px",
                                                                                                                position: "sticky",
                                                                                                                top: 0,
                                                                                                                zIndex: 5

                                                                                                            }}
                                                                                                        >
                                                                                                            Quantity
                                                                                                        </th>

                                                                                                        <th
                                                                                                            style={{
                                                                                                                padding: "6px 8px",
                                                                                                                textAlign: "right",
                                                                                                                border: "1px solid #ddd",
                                                                                                                width: "140px",
                                                                                                                position: "sticky",
                                                                                                                top: 0,
                                                                                                                zIndex: 5

                                                                                                            }}
                                                                                                        >
                                                                                                            Value
                                                                                                        </th>
                                                                                                    </tr>


                                                                                                </thead>







                                                                                                <tbody>
                                                                                                    {item.items.map((detail, itemIndex) => (
                                                                                                        <tr key={itemIndex}>

                                                                                                            {/* SL NO */}
                                                                                                            <td
                                                                                                                style={{
                                                                                                                    padding: "6px 8px",
                                                                                                                    border: "1px solid #eee",
                                                                                                                    textAlign: "center",
                                                                                                                    width: "50px"
                                                                                                                }}
                                                                                                            >
                                                                                                                {itemIndex + 1}
                                                                                                            </td>

                                                                                                            {/* ITEM NAME */}
                                                                                                            <td
                                                                                                                style={{
                                                                                                                    padding: "6px 8px",
                                                                                                                    border: "1px solid #eee",
                                                                                                                    textAlign: "left",
                                                                                                                    width: "45%",
                                                                                                                    whiteSpace: "normal",
                                                                                                                    wordBreak: "break-word"
                                                                                                                }}
                                                                                                            >
                                                                                                                {detail.item_name || ""}
                                                                                                            </td>

                                                                                                            {/* RATE */}
                                                                                                            <td
                                                                                                                style={{
                                                                                                                    padding: "6px 8px",
                                                                                                                    border: "1px solid #eee",
                                                                                                                    textAlign: "right",
                                                                                                                    width: "120px"
                                                                                                                }}
                                                                                                            >
                                                                                                                {Number(
                                                                                                                    detail.rate || 0
                                                                                                                ).toLocaleString("en-IN", {
                                                                                                                    minimumFractionDigits: 2,
                                                                                                                    maximumFractionDigits: 2
                                                                                                                })}
                                                                                                            </td>

                                                                                                            {/* QUANTITY */}
                                                                                                            <td
                                                                                                                style={{
                                                                                                                    padding: "6px 8px",
                                                                                                                    border: "1px solid #eee",
                                                                                                                    textAlign: "right",
                                                                                                                    width: "100px"
                                                                                                                }}
                                                                                                            >
                                                                                                                {Number(
                                                                                                                    detail.quantity || 0
                                                                                                                ).toLocaleString("en-IN", {
                                                                                                                    minimumFractionDigits: 2,
                                                                                                                    maximumFractionDigits: 2
                                                                                                                })}
                                                                                                            </td>

                                                                                                            {/* VALUE */}
                                                                                                            <td
                                                                                                                style={{
                                                                                                                    padding: "6px 8px",
                                                                                                                    border: "1px solid #eee",
                                                                                                                    textAlign: "right",
                                                                                                                    fontWeight: "600",
                                                                                                                    width: "140px"
                                                                                                                }}
                                                                                                            >
                                                                                                                {Number(
                                                                                                                    detail.value || 0
                                                                                                                ).toLocaleString("en-IN", {
                                                                                                                    minimumFractionDigits: 2,
                                                                                                                    maximumFractionDigits: 2
                                                                                                                })}
                                                                                                            </td>

                                                                                                        </tr>
                                                                                                    ))}

                                                                                                    <tr
                                                                                                        style={{
                                                                                                            background: "#f8f9fa",
                                                                                                            fontWeight: "700"
                                                                                                        }}
                                                                                                    >
                                                                                                        <td
                                                                                                            colSpan={4}
                                                                                                            style={{
                                                                                                                padding: "7px 8px",
                                                                                                                textAlign: "right",
                                                                                                                borderTop: "2px solid #555",
                                                                                                                borderBottom: "1px solid #ddd",
                                                                                                                color: "#050103"
                                                                                                            }}
                                                                                                        >
                                                                                                            Item Value Total
                                                                                                        </td>

                                                                                                        <td
                                                                                                            style={{
                                                                                                                padding: "7px 8px",
                                                                                                                textAlign: "right",
                                                                                                                borderTop: "2px solid #555",
                                                                                                                borderBottom: "1px solid #ddd",
                                                                                                                color: "#198754",
                                                                                                                fontWeight: "700"
                                                                                                            }}
                                                                                                        >
                                                                                                            {item.items
                                                                                                                .reduce(
                                                                                                                    (sum, detail) =>
                                                                                                                        sum + Number(detail.value || 0),
                                                                                                                    0
                                                                                                                )
                                                                                                                .toLocaleString("en-IN", {
                                                                                                                    minimumFractionDigits: 2,
                                                                                                                    maximumFractionDigits: 2
                                                                                                                })}
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            )}





                                                                    </React.Fragment>
                                                                ))}


                                                                {/* TOTAL ROW — KEEP THIS OUTSIDE map() */}
                                                                <tr
                                                                    style={{
                                                                        background: "#f8f9fa",
                                                                        fontWeight: "bold"
                                                                    }}
                                                                >
                                                                    <td
                                                                        colSpan={5}
                                                                        style={{
                                                                            padding: "6px 8px",
                                                                            textAlign: "right",
                                                                            borderTop: "2px solid #999",
                                                                            color: "black"
                                                                        }}
                                                                    >
                                                                        Total
                                                                    </td>

                                                                    <td
                                                                        style={{
                                                                            padding: "6px 8px",
                                                                            textAlign: "right",
                                                                            borderTop: "2px solid #999",
                                                                            color: "#fd0d85"
                                                                        }}
                                                                    >
                                                                        {quotationTotal > 0
                                                                            ? quotationTotal.toLocaleString("en-IN", {
                                                                                minimumFractionDigits: 2,
                                                                                maximumFractionDigits: 2
                                                                            })
                                                                            : ""}
                                                                    </td>

                                                                    <td
                                                                        style={{
                                                                            padding: "6px 8px",
                                                                            textAlign: "right",
                                                                            borderTop: "2px solid #999",
                                                                            color: "#198754"
                                                                        }}
                                                                    >
                                                                        {billedTotal > 0
                                                                            ? billedTotal.toLocaleString("en-IN", {
                                                                                minimumFractionDigits: 2,
                                                                                maximumFractionDigits: 2
                                                                            })
                                                                            : ""}
                                                                    </td>

                                                                    <td
                                                                        style={{
                                                                            borderTop: "2px solid #999"
                                                                        }}
                                                                    />

                                                                    <td
                                                                        style={{
                                                                            borderTop: "2px solid #999"
                                                                        }}
                                                                    />
                                                                </tr>


                                                            </tbody>



                                                        </table>

                                                    </div>

                                                </td>
                                            </tr>
                                        )
                                    }



                                </React.Fragment>
                            ))}


                        </tbody>

                    </table>

                </div>

            </div>
            {showNoteModal && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "flex-start",   // instead of center
                        overflowY: "auto",
                        zIndex: 99999,
                        padding: "90px 20px 20px"   // top space below banner
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

                                <div
                                    style={{
                                        display: "grid",

                                        gridTemplateColumns: "130px 1fr",
                                        borderBottom: "1px solid #ddd"
                                    }}
                                >
                                    <div style={labelStyle}>
                                        Party
                                    </div>

                                    <div style={valueStyle}>
                                        {selectedQuotation?.party || ""}
                                    </div>
                                </div>


                                <div
                                    style={{
                                        display: "grid",

                                        gridTemplateColumns: "130px 1fr",
                                        borderBottom: "1px solid #ddd"
                                    }}
                                >
                                    <div style={labelStyle}>
                                        Month
                                    </div>

                                    <div style={valueStyle}>
                                        {selectedQuotation?.month || ""}
                                    </div>
                                </div>


                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "130px 1fr",
                                        borderBottom: "1px solid #ddd"
                                    }}
                                >
                                    <div style={labelStyle}>
                                        Quotation No
                                    </div>

                                    <div style={valueStyle}>
                                        {selectedQuotation?.quotationNo || ""}
                                    </div>
                                </div>


                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "130px 1fr",
                                        borderBottom: "1px solid #ddd"
                                    }}
                                >
                                    <div style={labelStyle}>
                                        Mobile No
                                    </div>

                                    <div style={valueStyle}>
                                        {selectedQuotation?.mobile || ""}
                                    </div>
                                </div>

                            </div>


                            {/* FOLLOW-UP FIELDS */}

                            <div style={formRowStyle}
                            >

                                <label style={formLabelStyle}>
                                    Call Date
                                </label>

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

                                <label style={formLabelStyle}>
                                    Follow-up Date
                                </label>

                                <input
                                    type="date"
                                    value={followup.followupDate}
                                    onChange={(e) =>
                                        setFollowup(prev => ({
                                            ...prev,
                                            followupDate: e.target.value
                                        }))
                                    }
                                    style={inputStyle}
                                />

                            </div>


                            <div style={formRowStyle}>

                                <label style={formLabelStyle}>
                                    Telecaller
                                </label>

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

                                <label style={formLabelStyle}>
                                    Status
                                </label>

                                <select
                                    value={followup.status}
                                    onChange={(e) =>
                                        setFollowup(prev => ({
                                            ...prev,
                                            status: e.target.value
                                        }))
                                    }
                                    style={{
                                        ...inputStyle,
                                        background: "#fff",
                                        cursor: "pointer"
                                    }}
                                >
                                    <option value="">
                                        Select Status
                                    </option>

                                    <option value="Interested">
                                        Interested
                                    </option>

                                    <option value="Not Interested">
                                        Not Interested
                                    </option>

                                    <option value="Billed">
                                        Billed
                                    </option>

                                    <option value="Call Back">
                                        Call Back
                                    </option>
                                    <option value="Not Reachable">
                                        Not Reachable
                                    </option>
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
                            <div
                                style={{
                                    marginBottom: "18px"
                                }}
                            >
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

                                    if (!followup.followupDate) {
                                        alert("Please select Follow-up Date");
                                        return;
                                    }

                                    if (!followup.status) {
                                        alert("Please select Status");
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

                                        quotation_status: selectedQuotation?.status || "",

                                        call_date: followup.callDate,
                                        followup_date: followup.followupDate,
                                        telecaller: followup.telecaller,
                                        status: followup.status,
                                        remarks: followup.remarks
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

                                            alert("Follow-up saved successfully");

                                            setShowNoteModal(false);

                                            // Clear form
                                            setFollowup({
                                                callDate: new Date().toISOString().split("T")[0],
                                                followupDate: "",
                                                telecaller: telecallerName,
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
        </>

    );

}


export default QuotationFollowup;

