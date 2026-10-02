import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useRef, useState } from "react";
import "./SiteVisit.css";
import { auth, db } from "../../components/firebase";
import {
    doc,
    getDoc,
    collection,
    getDocs
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { apiFetch } from "../../api/apiClient";

export default function SiteVisit() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [showExpenseList, setShowExpenseList] = useState(false);
    const [expenseList, setExpenseList] = useState([]);
    const [stream, setStream] = useState(null);
    const [cameraMode, setCameraMode] = useState("environment");

    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [location, setLocation] = useState("");
    const [capturedImage, setCapturedImage] = useState("");
    const [address, setAddress] = useState("");

    const [siteVisits, setSiteVisits] = useState([]);
    const [showForm, setShowForm] = useState(false);

    const [monthlyExpenseSummary, setMonthlyExpenseSummary] = useState([]);
    const [showMonthlySummary, setShowMonthlySummary] = useState(false);

    const [searchTerm, setSearchTerm] = useState("");
    const [filteredVisits, setFilteredVisits] = useState([]);

    const [decisionMaker, setDecisionMaker] = useState("");
    const [followupDate, setFollowupDate] = useState("");
    const [customerSuggestions, setCustomerSuggestions] = useState([]);
    const [allCustomers, setAllCustomers] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);


    const [showExpensePopup, setShowExpensePopup] = useState(false);
    const [selectedVisit, setSelectedVisit] = useState(null);

    const [expenseType, setExpenseType] = useState("");
    const [expenseAmount, setExpenseAmount] = useState("");
    const [expenseRemarks, setExpenseRemarks] = useState("");
    const [expenseBill, setExpenseBill] = useState("");
    const [salesExecutive, setSalesExecutive] = useState("");
    const [userRole, setUserRole] = useState("");
    const [userDistribution, setUserDistribution] = useState("");
    const [userDesignation, setUserDesignation] = useState("");


    useEffect(() => {

        const unsubscribe = onAuthStateChanged(auth, async (user) => {

            if (!user) {
                setUserRole("");
                return;
            }

            try {

             

                const roleRef = doc(db, "roles", user.uid);

                const roleSnap = await getDoc(roleRef);

                if (roleSnap.exists()) {

                    const adminRole = roleSnap.data().role || "";

                    if (adminRole.toLowerCase().trim() === "admin") {

                        setUserRole("admin");

                        return;

                    }

                }

              

                const userRef = doc(db, "Users", user.uid);

                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {

                    const userData = userSnap.data();

                    console.log("USER DATA:", userData);

                    setUserRole(userData.role || "");
                    setUserDesignation(userData.designation || "");
                    setUserDistribution(userData.distribution || "");

                    const fullName = `${userData.firstName || ""} ${userData.lastName || ""}`.trim();

                    console.log("FULL NAME:", fullName);

                    setSalesExecutive(fullName);

                }

            } catch (err) {

                console.log(err);

            }

        });

        return () => unsubscribe();

    }, []);
   
    const startCamera = async (mode = cameraMode) => {
        try {
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: mode,
                },
                audio: false,
            });

            videoRef.current.srcObject = mediaStream;
            setStream(mediaStream);
        } catch (err) {
            console.error("Camera Error:", err);
            alert("Camera access denied");
        }
    };
    const autocompleteRef = useRef(null);

    useEffect(() => {

        const handleClickOutside = (event) => {

            if (
                autocompleteRef.current &&
                !autocompleteRef.current.contains(event.target)
            ) {
                setShowSuggestions(false);
            }

        };

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };

    }, []);



    const handleDelete = (id) => {
        if (!window.confirm("Are you sure you want to delete this record?")) return;

        apiFetch(`/serverphp/delete_site_visit.php?id=${id}`, {
            method: "DELETE",
        })
            .then((res) => res.json())
            .then((res) => {
                if (res.status === "success") {
                    setSiteVisits((prev) => prev.filter((item) => item.id !== id));
                } else {
                    alert("Delete failed");
                }
            })
            .catch((err) => console.error("DELETE ERROR:", err));
    };
    
    useEffect(() => {

        if (showForm) {
            startCamera(cameraMode);
        }

        return () => {

            if (videoRef.current?.srcObject) {

                videoRef.current.srcObject
                    .getTracks()
                    .forEach((track) => track.stop());

            }

        };

    }, [showForm, cameraMode]);

    const fetchExpenses = async (siteVisitId) => {

        try {

            const response = await apiFetch(
                `/serverphp/get_site_expenses.php?site_visit_id=${siteVisitId}`
            );

            const data = await response.json();

            setExpenseList(data);

            setShowExpenseList(true);

        } catch (err) {

            console.log(err);

        }
    };
    const openExpensePopup = (visit) => {
        setSelectedVisit(visit);
        setShowExpensePopup(true);
    };
   
    const switchCamera = async () => {
        const newMode =
            cameraMode === "environment" ? "user" : "environment";

        setCameraMode(newMode);
        startCamera(newMode);
    };

    
    const fetchLocation = () => {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
                );

                const data = await res.json();

                setLocation(data.display_name || `${lat}, ${lng}`);
            } catch (err) {
                setLocation(`${lat}, ${lng}`);
            }
        });
    };



    const fetchMonthlyExpenseSummary = async () => {

        try {

            const response = await apiFetch(
                "/serverphp/get_monthly_expense_summary.php"
            );

            const data = await response.json();

            console.log("SUMMARY:", data);

            setMonthlyExpenseSummary(data);
            console.log("MONTHLY DATA:", data);
        } catch (err) {

            console.log(err);

        }

    };

    const handleCustomerSearch = (value) => {

        setCustomerName(value);

        if (!value.trim()) {

            setCustomerSuggestions([]);
            setShowSuggestions(false);

            return;
        }

        const filtered = allCustomers.filter((item) => {

            const searchText = `
            ${item.PLACE || ""}
            ${item.AREA || ""}
            ${item.customer_name || ""}
            ${item.section || ""}
            ${item.place || ""}
            ${item.contractor_name || ""}
            ${item.firm_name || ""}
        `.toLowerCase();

            return searchText.includes(value.toLowerCase());

        });

        setCustomerSuggestions(filtered);
        setShowSuggestions(true);
    };

    const selectCustomer = (item) => {

        
        if (item.PLACE) {

            setCustomerName(
                `${item.PLACE}${item.AREA ? ` (${item.AREA})` : ""}`
            );

            setPhone(
                item.RECEIPTION_CUG ||
                ""
            );

            setAddress(
                item.PARENT_AREA ||
                ""
            );
            setDecisionMaker(
                item.NAME ||
                ""
            );

        }

     
        else {

            setCustomerName(
                item.contractor_name || ""
            );

            setPhone(
                item.phone || ""
            );

            setAddress(
                item.address || ""
            );

            setDecisionMaker(
                item.decision_maker ||
                ""
            );

        }

        setShowSuggestions(false);
    };
   
    const capturePhoto = () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);

        const imageData = canvas.toDataURL("image/png");

        setCapturedImage(imageData);

       
        fetchLocation();
    };
    const fetchCustomerData = async () => {
        try {

            
            const directoryRes = await apiFetch(
                "/serverphp/ksebdirectory.php"
            );

            const directoryJson = await directoryRes.json();

          
            const leadsRes = await apiFetch(
                "/serverphp/get_kseb_contractor.php"
            );

            const leadsJson = await leadsRes.json();

         
            const directoryData = directoryJson.data || [];
            const leadsData = leadsJson.data || [];

            
            const combined = [
                ...directoryData,
                ...leadsData
            ];

            console.log("COMBINED:", combined);

            setAllCustomers(combined);

        } catch (err) {

            console.log(err);

        }
    };

const fetchVisits = async () => {

    try {

        const response = await apiFetch(
            "/serverphp/get_site_visit.php"
        );

        const visits = await response.json();

        console.log("ROLE:", userRole);
        console.log("DESIGNATION:", userDesignation);

      

        if (
            userRole?.toLowerCase() === "admin"
        ) {

            console.log("ADMIN : ALL VISITS");

            setSiteVisits(visits);

            return;
        }


        if (
            userDesignation === "SalesExecutive"
        ) {

            const filtered = visits.filter(
                visit =>
                    visit.sales_executive
                        ?.trim()
                        .toLowerCase()
                    ===
                    salesExecutive
                        ?.trim()
                        .toLowerCase()
            );

            console.log(
                "EXECUTIVE VISITS",
                filtered
            );

            setSiteVisits(filtered);

            return;
        }

      

        if (
            userDesignation === "SalesCoordinator"
        ) {

            const usersSnapshot =
                await getDocs(
                    collection(db, "Users")
                );

            const teamMembers = [];

            usersSnapshot.forEach(docSnap => {

                const data = docSnap.data();

                if (
                    data.designation ===
                        "SalesExecutive" &&

                    data.distribution
                        ?.trim()
                        .toLowerCase() ===
                    userDistribution
                        ?.trim()
                        .toLowerCase()
                ) {

                    teamMembers.push(
                        `${data.firstName || ""}
                         ${data.lastName || ""}`
                            .trim()
                            .toLowerCase()
                    );
                }
            });

            console.log(
                "TEAM EXECUTIVES",
                teamMembers
            );

            const filtered = visits.filter(
                visit =>
                    teamMembers.includes(
                        visit.sales_executive
                            ?.trim()
                            .toLowerCase()
                    )
            );

            console.log(
                "COORDINATOR VISITS",
                filtered
            );

            setSiteVisits(filtered);

            return;
        }

        setSiteVisits([]);

    } catch (err) {

        console.log(
            "FETCH VISITS ERROR",
            err
        );
    }
};

    useEffect(() => {

        if (userRole?.toLowerCase().trim() === "admin") {

            fetchMonthlyExpenseSummary();

        }

    }, [userRole]);
    useEffect(() => {
        fetchCustomerData();
    }, []);



useEffect(() => {

    if (
        userRole ||
        userDesignation ||
        salesExecutive
    ) {
        fetchVisits();
    }

}, [
    salesExecutive,
    userRole,
    userDesignation,
    userDistribution
]);



    const deleteExpense = async (expenseId) => {

        const confirmDelete = window.confirm(
            "Delete this expense?"
        );

        if (!confirmDelete) return;

        try {

            const response = await apiFetch(
                `/serverphp/delete_site_expense.php?id=${expenseId}`
            );

            const result = await response.json();

            if (result.status === "success") {

                setExpenseList((prev) =>
                    prev.filter((item) => item.id !== expenseId)
                );

                fetchVisits();

            } else {

                alert("Delete failed");

            }

        } catch (err) {

            console.log(err);

        }
    };

    useEffect(() => {

        if (!searchTerm.trim()) {

            setFilteredVisits(siteVisits);
            return;

        }

        const filtered = siteVisits.filter((visit) => {

            const searchText = `
            ${visit.customer_name || ""}
            ${visit.phone || ""}
            ${visit.decision_maker || ""}
            ${visit.address || ""}
            ${visit.sales_executive || ""}
            ${visit.location || ""}
        `.toLowerCase();

            return searchText.includes(searchTerm.toLowerCase());

        });

        setFilteredVisits(filtered);

    }, [searchTerm, siteVisits]);
    
    const saveVisit = async () => {
        if (!customerName || !phone || !address || !capturedImage) {
            alert("Fill all details");
            return;
        }

        const formData = new FormData();

        formData.append("customer_name", customerName);
        formData.append("phone", phone);
        formData.append("address", address);
        formData.append("location", location);
        formData.append("image", capturedImage);
        formData.append("sales_executive", salesExecutive);
        formData.append("decision_maker", decisionMaker);
        formData.append("followup_date", followupDate);
        formData.append("distribution", userDistribution);

        try {
            const response = await apiFetch(
                "/serverphp/save_site_visit.php",
                {
                    method: "POST",
                    body: formData,
                }
            );

            const result = await response.json();

            if (result.status === "success") {
                alert("Saved Successfully");

                fetchVisits();

                setCustomerName("");
                setDecisionMaker("");
                setFollowupDate("");
                setPhone("");
                setAddress("");
                setLocation("");
                setCapturedImage("");
                setShowForm(false);
            }
        } catch (error) {
            console.log(error);
        }
    };
    const saveExpense = async () => {
        if (userRole !== "SalesExecutive") {

            alert("Only Sales Executive can add expense");

            return;
        }

        if (!expenseType || !expenseAmount) {
            alert("Enter expense details");
            return;
        }

        const formData = new FormData();

        formData.append("site_visit_id", selectedVisit.id);
        formData.append("expense_type", expenseType);
        formData.append("amount", expenseAmount);
        formData.append("remarks", expenseRemarks);
        formData.append("bill_image", expenseBill);
        formData.append("sales_executive", salesExecutive);

        try {

            const response = await apiFetch(
                "/serverphp/save_site_expense.php",
                {
                    method: "POST",
                    body: formData,
                }
            );

            const result = await response.json();

            if (result.status === "success") {

                alert("Expense Added");

                fetchVisits();

                setShowExpensePopup(false);

            }

        } catch (err) {

            console.log(err);

        }
    };
    const monthlyExpenseByExecutive = filteredVisits.reduce((acc, visit) => {

        const visitDate = new Date(visit.created_at);

        const now = new Date();

        const isCurrentMonth =
            visitDate.getMonth() === now.getMonth() &&
            visitDate.getFullYear() === now.getFullYear();

        if (!isCurrentMonth) return acc;

        const executive = visit.sales_executive || "Unknown";

        const amount = Number(visit.total_expense || 0);

        if (!acc[executive]) {
            acc[executive] = 0;
        }

        acc[executive] += amount;

        return acc;

    }, {});

    return (
        <div className="siteVisitPage">
            <Banner />
            <div className="siteVisitTopBar">
                <div className="siteVisitHeader">

                    <h2>Site Visit Updates</h2>

                    <div className="headerButtons">

                        <button
                            className="plusBtn"
                            onClick={() => setShowForm(!showForm)}
                        >
                            + Add Site Updates
                        </button>

                        {
                            userRole?.toLowerCase()?.trim() === "admin" && (

                                <button
                                    className="monthlySummaryBtn"
                                    onClick={() => {

                                        setShowMonthlySummary(!showMonthlySummary);

                                        if (!showMonthlySummary) {
                                            fetchMonthlyExpenseSummary();
                                        }

                                    }}
                                >

                                    {
                                        showMonthlySummary
                                            ? "Hide Monthly Expense"
                                            : "View Monthly Expense"
                                    }

                                </button>

                            )
                        }

                    </div>

                </div>
                {/* SEARCH BOX */}

                <div className="siteVisitSearchBox">

                    <input
                        type="text"
                        placeholder="Search customer, phone, address, executive..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />

                </div>
            </div>
            {/* EXPENSE POPUP */}
            {/* FORM */}
            {showForm && (

                <div className="siteVisitForm">

                    <div className="formGroup">

                        <label>Customer Name</label>

                        <div
                            className="autocompleteBox"
                            ref={autocompleteRef}
                        >

                            <input
                                type="text"
                                placeholder="Enter customer name"
                                value={customerName}
                                onChange={(e) => handleCustomerSearch(e.target.value)}
                                onFocus={() => {
                                    if (customerSuggestions.length > 0) {
                                        setShowSuggestions(true);
                                    }
                                }}
                            />

                            {showSuggestions && customerSuggestions.length > 0 && (

                                <div className="suggestionBox">

                                    {customerSuggestions.map((item, index) => (

                                        <div
                                            key={index}
                                            className="suggestionItem"
                                            onClick={() => selectCustomer(item)}
                                        >

                                            {
                                                item.PLACE
                                                    ? `${item.PLACE} (${item.AREA || ""})`
                                                    : `${item.contractor_name || ""} ${item.firm_name ? `- ${item.firm_name}` : ""}`
                                            }

                                        </div>

                                    ))}

                                </div>

                            )}

                        </div>

                    </div>

                    {/* DECISION MAKER */}
                    <div className="formGroup">

                        <label>Decision Maker</label>

                        <input
                            type="text"
                            placeholder="Enter decision maker"
                            value={decisionMaker}
                            onChange={(e) => setDecisionMaker(e.target.value)}
                        />

                    </div>
                    <div className="formGroup">

                        <label>Follow Up Date</label>

                        <input
                            type="date"
                            value={followupDate}
                            onChange={(e) => setFollowupDate(e.target.value)}
                        />

                    </div>

                    <div className="formGroup">
                        <label>Phone Number</label>
                        <input
                            type="tel"
                            placeholder="Enter phone number"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>
                    <div className="formGroup">
                        <label>Address</label>
                        <input
                            type="text"
                            placeholder="Enter Customer Address"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                        />
                    </div>
                    <div className="formGroup">
                        <label>Sales Executive</label>

                        <input
                            type="text"
                            value={salesExecutive}
                            readOnly
                        />

                    </div>

                    {/* LIVE CAMERA */}
                    
                    
                    
                    <div className="cameraSection">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="cameraPreview"
                        />

                        <canvas ref={canvasRef} style={{ display: "none" }} />

                        <div className="cameraButtons">
                            <button onClick={capturePhoto}>
                                Capture
                            </button>

                            <button onClick={switchCamera}>
                                Switch Camera
                            </button>
                        </div>
                    </div>

                    {/* PREVIEW */}
                    {capturedImage && (
                        <div className="previewSection">
                            <img src={capturedImage} alt="Captured" />
                        </div>
                    )}

                    {/* LOCATION */}
                    <div className="formGroup">
                        <label>Live Location</label>
                        <input
                            type="text"
                            value={location}
                            readOnly
                        />
                    </div>
                    <div className="save-box-site">
                        <button className="saveBtn-site" onClick={saveVisit}>
                            Save Site Visit
                        </button>
                        <button
                            className="cancel-btn-site"
                            onClick={() => setShowForm(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}


            {/* MONTHLY EXPENSE TABLE */}

            {
                userRole?.toLowerCase()?.trim() === "admin" &&
                showMonthlySummary && (

                    <div className="monthlyExpenseSection">

                        <h3>Monthly Expense Summary</h3>

                        <table>

                            <thead>

                                <tr>
                                    <th>Sales Executive</th>
                                    <th>Total Expense</th>
                                </tr>

                            </thead>

                            <tbody>

                                {
                                    monthlyExpenseSummary.length > 0
                                        ? (

                                            monthlyExpenseSummary.map((item, index) => (

                                                <tr key={index}>

                                                    <td>
                                                        {item.sales_executive}
                                                    </td>

                                                    <td>
                                                        ₹ {Number(item.total_expense).toFixed(2)}
                                                    </td>

                                                </tr>

                                            ))

                                        )
                                        : (

                                            <tr>

                                                <td colSpan="2">
                                                    No expense data found
                                                </td>

                                            </tr>

                                        )
                                }

                            </tbody>

                        </table>

                    </div>

                )
            }
            {
                showExpensePopup &&
                userRole === "SalesExecutive" && (

                    <div className="expensePopup">

                        <div className="expensePopupHeader">

                            <h3>Add Site Expense</h3>

                            <span
                                className="closePopup"
                                onClick={() => setShowExpensePopup(false)}
                            >
                                ✕
                            </span>

                        </div>

                        <div className="formGroup">

                            <label>Expense Type</label>

                            <input
                                type="text"
                                placeholder="Enter expense type"
                                value={expenseType}
                                onChange={(e) => setExpenseType(e.target.value)}
                            />

                        </div>

                        <div className="formGroup">

                            <label>Amount</label>

                            <input
                                type="number"
                                placeholder="Enter amount"
                                value={expenseAmount}
                                onChange={(e) => setExpenseAmount(e.target.value)}
                            />

                        </div>

                        <div className="formGroup">

                            <label>Remarks</label>

                            <textarea
                                placeholder="Enter remarks"
                                value={expenseRemarks}
                                onChange={(e) => setExpenseRemarks(e.target.value)}
                            />

                        </div>

                        <div className="formGroup">

                            <label>Upload Bill</label>

                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {

                                    const file = e.target.files[0];

                                    if (!file) return;

                                    const reader = new FileReader();

                                    reader.onloadend = () => {

                                        setExpenseBill(reader.result);

                                    };

                                    reader.readAsDataURL(file);

                                }}
                            />

                        </div>

                        <div className="save-box-site">

                            <button
                                className="saveBtn-site"
                                onClick={saveExpense}
                            >
                                Save Expense
                            </button>

                            <button
                                className="cancel-btn-site"
                                onClick={() => setShowExpensePopup(false)}
                            >
                                Cancel
                            </button>

                        </div>

                    </div>

                )}

            {/* EXPENSE LIST POPUP */}

            {showExpenseList && (

                <div className="expenseListPopup">

                    <div className="expensePopupHeader">

                        <h3>Expense List</h3>

                        <span
                            className="closePopup"
                            onClick={() => setShowExpenseList(false)}
                        >
                            ✕
                        </span>

                    </div>

                    <div className="expenseTableContainer">

                        <table>

                            <thead>

                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Remarks</th>
                                    <th>Bill</th>
                                    <th>Delete</th>
                                </tr>

                            </thead>

                            <tbody>

                                {expenseList.map((expense) => (

                                    <tr key={expense.id}>

                                        <td>
                                            {
                                                new Date(
                                                    expense.created_at
                                                ).toLocaleDateString("en-GB")
                                            }
                                        </td>

                                        <td>{expense.expense_type}</td>

                                        <td>₹ {expense.amount}</td>

                                        <td>{expense.remarks}</td>

                                        <td>

                                            <a
                                                href={`/serverphp/${expense.bill_image}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                View Bill
                                            </a>

                                        </td>

                                        <td>

                                            <span
                                                className="deleteExpense"
                                                onClick={() => deleteExpense(expense.id)}
                                            >
                                                🗑️
                                            </span>

                                        </td>

                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                </div>

            )}

            {/* TABLE */}

            <div className="tableContainer desktopTable">

                <table>

                    <thead>

                        <tr>
                            <th>Date</th>
                            <th>Customer Name</th>
                            <th>Phone</th>
                            <th>Decision Maker</th>
                            <th>Address</th>
                            <th>Sales Executive</th>
                            <th>Location</th>
                            <th>Site Image</th>
                            <th>Followup Date</th>
                            <th>Expenses</th>
                            <th>Total Expense</th>
                            <th>Delete</th>
                        </tr>

                    </thead>

                    <tbody>

                        {Object.entries(

                            filteredVisits.reduce((groups, visit) => {
                                console.log("VISIT:", visit);
                                console.log("TOTAL:", visit.total_expense);
                                // GROUP BY CUSTOMER NAME
                                const key = visit.customer_name || "Unknown";

                                if (!groups[key]) {
                                    groups[key] = [];
                                }

                                groups[key].push(visit);

                                return groups;

                            }, {})

                        ).map(([placeName, visits]) => (

                            <React.Fragment key={placeName}>

                                {/* GROUP HEADING */}
                                <tr className="groupHeadingRow">

                                    <td colSpan="11" className="groupHeading">

                                        📍 {placeName}

                                    </td>

                                </tr>

                                {/* ALL VISITS UNDER SAME PLACE */}
                                {visits.map((visit) => (

                                    <tr key={visit.id}>

                                        <td>
                                            {
                                                new Date(
                                                    visit.created_at
                                                ).toLocaleDateString("en-GB")
                                            }
                                        </td>

                                        <td>{visit.customer_name}</td>

                                        <td>{visit.phone}</td>

                                        <td>{visit.decision_maker}</td>

                                        <td>{visit.address}</td>

                                        <td>{visit.sales_executive}</td>

                                        <td>{visit.location}</td>

                                        <td>

                                            <a
                                                href={`/serverphp/${visit.image}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >

                                                <img
                                                    src={`/serverphp/${visit.image}`}
                                                    alt="site"
                                                    className="tableImage"
                                                />

                                            </a>

                                        </td>
                                        <td>{visit.followup_date || "-"}</td>

                                        <td>

                                            {
                                                userRole === "SalesExecutive" && (

                                                    <button
                                                        className="expenseBtn"
                                                        onClick={() => openExpensePopup(visit)}
                                                    >
                                                        Add Expense
                                                    </button>

                                                )
                                            }

                                            <button
                                                className="viewExpenseBtn"
                                                onClick={() => fetchExpenses(visit.id)}
                                            >
                                                View Expenses
                                            </button>

                                        </td>

                                        <td>
                                            {Number(visit.total_expense) > 0
                                                ? `₹ ${Number(visit.total_expense).toFixed(2)}`
                                                : ""}
                                        </td>

                                        <td>

                                            <span
                                                className="delete-icon"
                                                onClick={() => handleDelete(visit.id)}
                                                title="Delete"
                                            >
                                                🗑️
                                            </span>

                                        </td>

                                    </tr>

                                ))}

                            </React.Fragment>

                        ))}

                    </tbody>

                </table>

            </div>
            {/* MOBILE CARDS */}
            <div className="mobileCards">

                {filteredVisits.map((visit) => (

                    <div className="siteVisitCard" key={visit.id}>

                        <div className="cardTop">

                            <div>
                                <h3>{visit.customer_name}</h3>

                                <p>
                                    📅 {
                                        new Date(visit.created_at)
                                            .toLocaleDateString("en-GB")
                                    }
                                </p>
                            </div>

                        </div>

                        <p>
                            👤 <strong>Decision Maker:</strong>
                            {" "}
                            {visit.decision_maker || "-"}
                        </p>

                        <p>
                            📞 <strong>Phone:</strong>
                            {" "}
                            {visit.phone}
                        </p>

                        <p>
                            📍 <strong>Address:</strong>
                            {" "}
                            {visit.address}
                        </p>

                        <p>
                            👨‍💼 <strong>Executive:</strong>
                            {" "}
                            {visit.sales_executive}
                        </p>

                        <p>
                            📅 <strong>Follow Up:</strong>
                            {" "}
                            {visit.followup_date || "-"}
                        </p>

                        <p>
                            💰 <strong>Expense:</strong>
                            {" "}
                            ₹{Number(visit.total_expense || 0).toFixed(2)}
                        </p>

                        {visit.image && (

                            <img
                                src={`/serverphp/${visit.image}`}
                                alt=""
                                className="cardImage"
                                onClick={() =>
                                    window.open(
                                        `/serverphp/${visit.image}`,
                                        "_blank"
                                    )
                                }
                            />

                        )}

                        <div className="cardActions">

                            {userDesignation === "SalesExecutive" && (

                                <button
                                    className="expenseBtn"
                                    onClick={() => openExpensePopup(visit)}
                                >
                                    Add Expense
                                </button>

                            )}

                            <button
                                className="viewExpenseBtn"
                                onClick={() => fetchExpenses(visit.id)}
                            >
                                Expenses
                            </button>

                            <button
                                className="deleteBtn"
                                onClick={() => handleDelete(visit.id)}
                            >
                                Delete
                            </button>

                        </div>

                    </div>

                ))}

            </div>
        </div>
    );
}