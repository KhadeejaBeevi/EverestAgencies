import Banner from "../../Banner/Banner.jsx";



import React, {

    useEffect,

    useMemo,

    useState

} from "react";



import { createPortal } from "react-dom";



import { auth, db } from "../../firebase";



import { doc, getDoc } from "firebase/firestore";



import { onAuthStateChanged } from "firebase/auth";



import "./EnquiryReport.css";



import { apiFetch } from "../../../api/apiClient";







const API_BASE = "/serverphp";











/* =========================================================



   EMPTY FORM



========================================================= */







const emptyForm = {



    id: null,



    enquiry_no: "",



    enquiry_date: new Date().toISOString().split("T")[0],



    customer_name: "",



    address: "",



    phone_number: "",



    enquiry_source: "",



    description: "",



    added_by: "",



    assigned_to: "",



    brought_by: "",



    sales_order_no: "",




    remarks: "Pending Quotation"



};











/* =========================================================



   CURRENT USER NAME



========================================================= */







async function getCurrentUserName() {



    try {



        const user = auth.currentUser;







        if (!user) {



            console.log("No Firebase user logged in");



            return "";



        }







        const userSnap = await getDoc(doc(db, "Users", user.uid));







        if (userSnap.exists()) {



            const userData = userSnap.data();



            const fullName =



                `${String(userData.firstName || "").trim()} ${String(userData.lastName || "").trim()}`.trim();







            if (fullName) return fullName;



        }







        /* LOCAL STORAGE FALLBACK */



        try {



            const authData = localStorage.getItem("User");







            if (authData) {



                const localUser = JSON.parse(authData);



                const fullName =



                    `${String(localUser.firstName || "").trim()} ${String(localUser.lastName || "").trim()}`.trim();







                if (fullName) return fullName;



            }



        } catch (error) {



            console.log("LocalStorage error:", error);



        }







        return "";



    } catch (error) {



        console.error("GET USER ERROR:", error);



        return "";



    }



}











/* =========================================================



   FORMAT HELPERS



========================================================= */







function formatDate(dateString) {



    if (!dateString) return "";







    const date = new Date(dateString);







    if (isNaN(date.getTime())) return dateString;







    return date.toLocaleDateString("en-IN", {



        day: "2-digit",



        month: "long",



        year: "numeric"



    });



}







function formatText(value) {



    if (value === null || value === undefined || value === "") return "";



    return value;



}











/* =========================================================



   ATTACHMENTS



========================================================= */







async function downloadAttachment(file) {



    try {



        const storedName =



            file?.stored_name ||



            (file?.file_url



                ? decodeURIComponent(String(file.file_url).split("/").pop().split("?")[0])



                : "");







        if (!storedName) {



            throw new Error("Attachment filename is missing");



        }







        const downloadUrl =



            `${API_BASE}/enquiry_report.php?download=1` +



            `&stored_name=${encodeURIComponent(storedName)}` +



            `&filename=${encodeURIComponent(file?.original_name || storedName)}`;







        // The PHP endpoint sends Content-Disposition: attachment



        // with the original filename.



        const link = document.createElement("a");



        link.href = downloadUrl;



        link.style.display = "none";



        document.body.appendChild(link);



        link.click();



        document.body.removeChild(link);



    } catch (error) {



        console.error("ATTACHMENT DOWNLOAD ERROR:", error);



    }



}







function getAttachmentIcon(file) {



    const type = String(file?.file_type || "").toLowerCase();



    const name = String(file?.original_name || "").toLowerCase();







    if (type.startsWith("image/")) return "🖼️";







    if (type === "application/pdf" || name.endsWith(".pdf")) return "📕";







    if (type.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "📝";







    if (



        type.includes("excel") ||



        type.includes("spreadsheet") ||



        name.endsWith(".xls") ||



        name.endsWith(".xlsx")



    ) return "📊";







    if (type.includes("zip") || name.endsWith(".zip") || name.endsWith(".rar")) return "🗜️";







    return "📎";



}







function parseAttachmentList(value) {



    if (Array.isArray(value)) return value;







    if (typeof value === "string") {



        try {



            const parsed = JSON.parse(value);



            if (Array.isArray(parsed)) return parsed;



        } catch (error) {



            console.warn("Invalid attachment JSON:", error);



        }



    }







    return [];



}











/* =========================================================



   TIMER BADGE STYLES



========================================================= */







const timerBadgeBase = {



    display: "inline-flex",



    alignItems: "center",



    justifyContent: "center",



    minWidth: "82px",



    padding: "8px 12px",



    borderRadius: "8px",



    fontSize: "14px",



    fontWeight: 800,



    fontFamily: "monospace",



    letterSpacing: "0.5px",



    whiteSpace: "nowrap",



    boxSizing: "border-box"



};







function getTimerBadgeStyle(state, quotationMade) {



    switch (state) {



        case "green":



            return { ...timerBadgeBase, backgroundColor: "#e8f5e9", border: "1px solid #81c784", color: "#1b5e20" };







        case "orange":



            return { ...timerBadgeBase, backgroundColor: "#fff3cd", border: "1px solid #ffb300", color: "#8a4b00" };







        case "red":



            return { ...timerBadgeBase, backgroundColor: "#ffebee", border: "1px solid #ef5350", color: "#b71c1c" };







        case "timeout":



            return {



                ...timerBadgeBase,



                backgroundColor: quotationMade ? "#f8f9fa" : "#dc3545",



                border: quotationMade ? "1px solid #adb5bd" : "2px solid #b02a37",



                color: quotationMade ? "#495057" : "#ffffff",



                fontSize: "12px",



                fontWeight: 900,



                fontFamily: "Arial, sans-serif",



                letterSpacing: "normal"



            };







        case "waiting":



            return {



                ...timerBadgeBase,



                backgroundColor: "#f1f3f5",



                border: "1px solid #adb5bd",



                color: "#495057",



                fontSize: "12px",



                fontFamily: "Arial, sans-serif",



                letterSpacing: "normal"



            };







        default:



            return {



                ...timerBadgeBase,



                backgroundColor: "#f8f9fa",



                border: "1px solid #dee2e6",



                color: "#6c757d",



                fontWeight: 700,



                letterSpacing: "normal"



            };



    }



}







function getTimerTitle(state, quotationMade) {



    if (state === "waiting") return "Waiting for the previous enquiry timer to finish";







    if (state === "timeout") {



        return quotationMade



            ? "Quotation was made after the timer expired"



            : "Quotation time expired and no quotation has been made";



    }







    return "Time available for quotation preparation";



}











/* =========================================================



   MAIN COMPONENT



========================================================= */







export default function EnquiryReport() {







    /* DATA STATES */



    const [enquiries, setEnquiries] = useState([]);



    const [loading, setLoading] = useState(false);



    const [lastRefreshed, setLastRefreshed] = useState(null);



    const [saving, setSaving] = useState(false);







    /* MODAL */



    const [showModal, setShowModal] = useState(false);



    const [editing, setEditing] = useState(false);







    /* FORM */



    const [form, setForm] = useState(emptyForm);
    const [remarksMode, setRemarksMode] = useState("Pending Quotation");







    /* SEARCH + FILTER */



    const [searchTerm, setSearchTerm] = useState("");



    const [showPendingOnly, setShowPendingOnly] = useState(false);







    /* MESSAGES */



    const [errorMessage, setErrorMessage] = useState("");



    const [successMessage, setSuccessMessage] = useState("");







    /* USER ROLE */



    const [userRole, setUserRole] = useState("");







    /* NEXT ENQUIRY NUMBER */



    const [nextEnquiryNo, setNextEnquiryNo] = useState("");







    /* NEW FILES / EXISTING FILES */



    const [attachments, setAttachments] = useState([]);



    const [existingAttachments, setExistingAttachments] = useState([]);











    /* =====================================================



       SHARED 40-MINUTE QUOTATION TIMER



       Stored in MySQL through enquiry_report.php so every



       logged-in user sees exactly the same timer.



       Displayed in whole MINUTES only (no seconds).



    ===================================================== */







    const TIMER_DURATION_MINUTES = 40;



    const [timerQueue, setTimerQueue] = useState([]);



    const [timerNow, setTimerNow] = useState(Date.now());







    function formatTimerFromMinutes(remainingMinutes) {



        const safeMinutes = Math.max(0, Math.ceil(remainingMinutes));



        return `${safeMinutes} min`;



    }







    function getTimerEntry(enquiryId) {



        return timerQueue.find(item => String(item.id) === String(enquiryId));



    }







    function getTimerStatus(enquiryId, quotationNumber = "", remarks = "") {



        const quotationMade = String(quotationNumber || "").trim().length > 0;
        const remarkValue = String(remarks || "").trim();
        const quotationNotPending = remarkValue && remarkValue !== "Pending Quotation";

        if (quotationNotPending) {
            return { state: "completed", minutes: 0, label: "COMPLETED" };
        }







        /* A quotation number means the quotation is already made. */



        if (quotationMade) {



            return { state: "completed", minutes: 0, label: "COMPLETED" };



        }







        const entry = getTimerEntry(enquiryId);







        if (!entry) return { state: "none", minutes: null, label: "—" };







        if (entry.status === "timeout") return { state: "timeout", minutes: 0, label: "TIME OUT" };







        if (entry.status === "completed") return { state: "completed", minutes: 0, label: "COMPLETED" };







        if (!entry.startedAt) return { state: "waiting", minutes: null, label: "WAITING" };







        const elapsedMinutes = (timerNow - Number(entry.startedAt)) / 60000;



        const remainingMinutes = TIMER_DURATION_MINUTES - elapsedMinutes;







        /* Hard 40-minute limit. */



        if (remainingMinutes <= 0) return { state: "timeout", minutes: 0, label: "TIME OUT" };







        const label = formatTimerFromMinutes(remainingMinutes);







        if (remainingMinutes <= 12) return { state: "red", minutes: remainingMinutes, label };







        if (remainingMinutes <= 20) return { state: "orange", minutes: remainingMinutes, label };







        return { state: "green", minutes: remainingMinutes, label };



    }







    async function loadSharedTimerQueue() {



        try {



            const response = await apiFetch(`${API_BASE}/enquiry_report.php?timer=1`, { method: "GET" });



            const result = await response.json();







            if (!response.ok || !result.success) {



                throw new Error(result.message || "Failed to load shared timer");



            }







            setTimerQueue(Array.isArray(result.data) ? result.data : []);



        } catch (error) {



            console.error("SHARED TIMER LOAD ERROR:", error);



        }



    }







    useEffect(() => {



        loadSharedTimerQueue();



        const timerSync = setInterval(loadSharedTimerQueue, 10000);



        return () => clearInterval(timerSync);



    }, []);







    useEffect(() => {



        const interval = setInterval(() => setTimerNow(Date.now()), 1000);



        return () => clearInterval(interval);



    }, []);







    async function timerAction(action, enquiryId) {



        if (!enquiryId) return;







        try {



            const response = await apiFetch(`${API_BASE}/enquiry_report.php`, {



                method: "POST",



                headers: { "Content-Type": "application/x-www-form-urlencoded" },



                body: new URLSearchParams({ timer_action: action, enquiry_id: String(enquiryId) }).toString()



            });



            const result = await response.json();







            if (!response.ok || !result.success) {



                throw new Error(result.message || `Timer ${action} failed`);



            }







            setTimerQueue(Array.isArray(result.data) ? result.data : []);



        } catch (error) {



            console.error(`TIMER ${action.toUpperCase()} ERROR:`, error);



        }



    }







    async function addEnquiryToTimerQueue(enquiryId) { await timerAction("add", enquiryId); }



    async function completeQuotationTimer(enquiryId) { await timerAction("complete", enquiryId); }







    useEffect(() => {



        const activeEntry = timerQueue.find(item => {



            if (item.status !== "active" || !item.startedAt) return false;







            const enquiry = enquiries.find(row => String(row.id) === String(item.id));



            const quotationMade = String(enquiry?.sales_order_no || "").trim().length > 0;
            const remarks = String(enquiry?.remarks || "").trim();
            const quotationNotPending = remarks && remarks !== "Pending Quotation";

            return !quotationMade && !quotationNotPending;



        });







        if (!activeEntry) return;







        const elapsedMinutes = (Date.now() - Number(activeEntry.startedAt)) / 60000;



        const remainingMinutes = TIMER_DURATION_MINUTES - elapsedMinutes;







        if (remainingMinutes <= 0) {



            timerAction("timeout", activeEntry.id);



        }



    }, [timerNow, timerQueue]);











    /* =====================================================



       LOGGED-IN USER NAME + ROLE



    ===================================================== */







    useEffect(() => {



        const unsubscribe = onAuthStateChanged(auth, async user => {



            if (!user) {



                setForm(prev => ({ ...prev, added_by: "" }));



                return;



            }







            try {



                const userSnap = await getDoc(doc(db, "Users", user.uid));







                if (userSnap.exists()) {



                    const userData = userSnap.data();



                    const fullName =



                        `${String(userData.firstName || "").trim()} ${String(userData.lastName || "").trim()}`.trim();







                    setForm(prev => ({ ...prev, added_by: fullName }));



                }



            } catch (error) {



                console.error("USER LOAD ERROR:", error);



            }



        });







        return () => unsubscribe();



    }, []);







    useEffect(() => {



        const unsubscribe = onAuthStateChanged(auth, async user => {



            if (!user) {



                setUserRole("");



                return;



            }







            try {



                const roleSnap = await getDoc(doc(db, "roles", user.uid));







                if (roleSnap.exists()) {



                    const adminRole = roleSnap.data().role || "";







                    if (adminRole.toLowerCase().trim() === "admin") {



                        setUserRole("admin");



                        return;



                    }



                }







                const userSnap = await getDoc(doc(db, "Users", user.uid));







                if (userSnap.exists()) {



                    setUserRole(userSnap.data().role || "");



                }



            } catch (err) {



                console.log(err);



            }



        });







        return () => unsubscribe();



    }, []);











    /* =====================================================



       LOAD ENQUIRIES (auto refresh every 60 seconds)



    ===================================================== */







    useEffect(() => {



        loadEnquiries();







        const refreshInterval = setInterval(() => {



            loadEnquiries(true);



        }, 60 * 1000);







        return () => clearInterval(refreshInterval);



    }, []);







    async function loadEnquiries(silent = false) {



        try {



            if (!silent) setLoading(true);







            setErrorMessage("");







            const response = await apiFetch(`${API_BASE}/enquiry_report.php`, { method: "GET" });



            const result = await response.json();







            console.log("ENQUIRY RESPONSE:", result);







            if (!response.ok || !result.success) {



                throw new Error(result.message || "Failed to load enquiries");



            }







            const enquiryData = result.data || [];







            /* Newest enquiry date first; same date -> highest ID first. */



            enquiryData.sort((a, b) => {



                const dateA = new Date(`${a.enquiry_date}T00:00:00`).getTime();



                const dateB = new Date(`${b.enquiry_date}T00:00:00`).getTime();







                if (dateB !== dateA) return dateB - dateA;







                return (Number(b.id) || 0) - (Number(a.id) || 0);



            });







            setEnquiries(enquiryData);



            setLastRefreshed(new Date());



            setNextEnquiryNo(result.next_enquiry_no || "");



        } catch (error) {



            console.error("LOAD ENQUIRIES ERROR:", error);



            setErrorMessage(error.message || "Failed to load enquiries");



        } finally {



            if (!silent) setLoading(false);



        }



    }











    /* =====================================================



       SEARCH + PENDING FILTER



    ===================================================== */







    const filteredEnquiries = useMemo(() => {



        const search = searchTerm.trim().toLowerCase();







        let list = enquiries;







        if (showPendingOnly) {
            list = list.filter(item => {
                const quotationPending = !String(item.sales_order_no || "").trim();
                const remarks = String(item.remarks || "").trim();
                return quotationPending && (remarks === "" || remarks === "Pending Quotation");
            });
        }







        if (!search) return list;







        return list.filter(item =>



            [



                item.enquiry_no,



                item.customer_name,



                item.address,



                item.phone_number,



                item.enquiry_source,



                item.entered_by,



                item.description,



                item.added_by,



                item.assigned_to,



                item.brought_by,



                item.sales_order_no,



                item.remarks,



                item.linked_quotation_no,



                Array.isArray(item.linked_quotation_nos) ? item.linked_quotation_nos.join(" ") : ""



            ]



                .filter(Boolean)



                .some(value => String(value).toLowerCase().includes(search))



        );



    }, [enquiries, searchTerm, showPendingOnly]);











    /* =====================================================



       ADD ENQUIRY



    ===================================================== */







    async function handleAddEnquiry() {



        setEditing(false);
        setRemarksMode("Pending Quotation");



        setErrorMessage("");



        setSuccessMessage("");



        setAttachments([]);



        setExistingAttachments([]);







        const userName = await getCurrentUserName();







        setForm({



            ...emptyForm,



            enquiry_date: new Date().toISOString().split("T")[0],



            enquiry_no: nextEnquiryNo || "Loading...",



            added_by: userName



        });







        setShowModal(true);



    }











    /* =====================================================



       EDIT



    ===================================================== */







    function handleEdit(item) {



        setEditing(true);

        const existingRemarks = String(item.remarks || "").trim();
        const remarkOptions = [
            "Pending Quotation",
            "Item Not Available",
            "Customer Cancelled",
            "Customer Not Responding",
            "Price Issue",
            "Requirement Not Clear",
            "Duplicate Enquiry",
            "Not Required"
        ];
        setRemarksMode(
            !existingRemarks || remarkOptions.includes(existingRemarks)
                ? (existingRemarks || "Pending Quotation")
                : "Other"
        );



        setErrorMessage("");



        setSuccessMessage("");



        setAttachments([]);



        setExistingAttachments(parseAttachmentList(item.attachments));







        setForm({



            id: item.id,



            enquiry_no: item.enquiry_no || "",



            enquiry_date: item.enquiry_date || "",



            customer_name: item.customer_name || "",



            address: item.address || "",



            phone_number: item.phone_number || "",



            enquiry_source: item.enquiry_source || "",



            description: item.description || "",



            added_by: item.added_by || "",



            assigned_to: item.assigned_to || "",



            brought_by: item.brought_by || "",



            sales_order_no: item.sales_order_no || "",



            remarks: item.remarks || "Pending Quotation"



        });







        setShowModal(true);



    }











    /* =====================================================



       ATTACHMENT HANDLERS



    ===================================================== */







    function removeExistingAttachment(index) {



        setExistingAttachments(prev => prev.filter((_, i) => i !== index));



    }







    function handleAttachmentChange(event) {



        const files = Array.from(event.target.files || []);







        if (!files.length) return;







        setAttachments(prev => [...prev, ...files]);



        event.target.value = "";



    }







    function removeNewAttachment(index) {



        setAttachments(prev => prev.filter((_, i) => i !== index));



    }











    /* =====================================================



       CLOSE MODAL



    ===================================================== */







    function closeModal() {



        if (saving) return;







        setShowModal(false);



        setEditing(false);



        setErrorMessage("");



        setSuccessMessage("");



        setAttachments([]);



        setExistingAttachments([]);



    }











    /* =====================================================



       INPUT CHANGE



    ===================================================== */







    function handleChange(event) {



        const { name, value } = event.target;



        setForm(prev => ({ ...prev, [name]: value }));



    }











    /* =====================================================



       SAVE / UPDATE



    ===================================================== */







    async function handleSubmit(event) {



        event.preventDefault();







        setErrorMessage("");



        setSuccessMessage("");







        if (!form.enquiry_date) {



            setErrorMessage("Please select the enquiry date.");



            return;



        }







        if (!form.customer_name.trim()) {



            setErrorMessage("Please enter customer name.");



            return;



        }







        if (!form.added_by.trim()) {



            setErrorMessage("Unable to identify the logged-in user.");



            return;



        }







        if (!form.enquiry_source.trim()) {



            setErrorMessage("Please select the enquiry source.");



            return;



        }







                if (remarksMode === "Other" && !String(form.remarks || "").trim()) {
            setErrorMessage("Please enter a remark when Other is selected.");
            return;
        }

try {



            setSaving(true);







            const isEdit = editing && form.id;







            const formData = new FormData();







            formData.append("enquiry_date", form.enquiry_date);



            formData.append("customer_name", form.customer_name.trim());



            formData.append("address", form.address.trim());



            formData.append("phone_number", form.phone_number.trim());



            formData.append("enquiry_source", form.enquiry_source.trim());



            formData.append("description", form.description.trim());



            formData.append("added_by", form.added_by.trim());



            formData.append("assigned_to", form.assigned_to.trim());



            formData.append("brought_by", form.brought_by.trim());



            formData.append("sales_order_no", form.sales_order_no.trim());



            formData.append("remarks", form.remarks.trim());







            if (isEdit) {



                formData.append("id", form.id);



                formData.append("keep_attachments", JSON.stringify(existingAttachments));



            }







            attachments.forEach(file => {



                formData.append("attachments[]", file, file.name);



            });







            console.log("UPLOADING FILES:", attachments);







            const response = await apiFetch(`${API_BASE}/enquiry_report.php`, {



                method: "POST",



                body: formData



            });







            const result = await response.json();







            console.log("SAVE RESPONSE:", result);







            if (!response.ok || !result.success) {



                throw new Error(result.message || "Failed to save enquiry");



            }







            /* FAST UPDATE: update UI immediately; refresh/timer run in background. */

            const savedId = result.data?.id || form.id;

            const quotationNumber = String(form.sales_order_no || "").trim();
            const remarkValue = String(form.remarks || "").trim();
            const shouldCompleteTimer =
                Boolean(quotationNumber) ||
                (Boolean(remarkValue) && remarkValue !== "Pending Quotation");



            if (isEdit) {

                setEnquiries(prev =>

                    prev.map(item =>

                        String(item.id) === String(savedId)

                            ? {

                                ...item,

                                ...form,

                                id: savedId,

                                enquiry_no: result.data?.enquiry_no || form.enquiry_no,

                                attachments: result.data?.attachments ?? item.attachments

                            }

                            : item

                    )

                );



                loadEnquiries(true).catch(error =>

                    console.error("BACKGROUND ENQUIRY REFRESH ERROR:", error)

                );



                if (savedId && shouldCompleteTimer) {

                    completeQuotationTimer(savedId).catch(error =>

                        console.error("COMPLETE QUOTATION TIMER ERROR:", error)

                    );

                }

            } else {

                loadEnquiries(true).catch(error =>

                    console.error("BACKGROUND ENQUIRY REFRESH ERROR:", error)

                );



                if (savedId) {

                    addEnquiryToTimerQueue(savedId).catch(error =>

                        console.error("ADD TIMER ERROR:", error)

                    );



                    if (shouldCompleteTimer) {

                        completeQuotationTimer(savedId).catch(error =>

                            console.error("COMPLETE QUOTATION TIMER ERROR:", error)

                        );

                    }

                }

            }



            setSuccessMessage(



                isEdit



                    ? "Enquiry updated successfully."



                    : `Enquiry ${result.data?.enquiry_no || ""} added successfully.`



            );







            setTimeout(() => {



                setShowModal(false);



                setSuccessMessage("");



                setEditing(false);



                setAttachments([]);



                setExistingAttachments([]);



            }, 700);



        } catch (error) {



            console.error("SAVE ERROR:", error);



            setErrorMessage(error.message || "Failed to save enquiry.");



        } finally {



            setSaving(false);



        }



    }











    /* =====================================================



       RENDER



    ===================================================== */







    return (



        <>



            <Banner />







            <div className="enquiry-page">







                {/* ================= HEADER ================= */}







                <div className="enquiry-top-section">







                    <div className="enquiry-header">



                        <div className="enquiry-header-title">



                            <h1>Enquiry Capture</h1>



                            <p>Manage customer enquiries and attachments.</p>



                        </div>







                        <button className="add-enquiry-btn" onClick={handleAddEnquiry}>



                            <span className="add-icon">+</span>



                            Add Enquiry



                        </button>



                    </div>







                    <div className="enquiry-refresh-info">



                        <span>



                            Last refreshed:{" "}



                            {lastRefreshed



                                ? lastRefreshed.toLocaleTimeString("en-IN", {



                                    hour: "2-digit",



                                    minute: "2-digit",



                                    second: "2-digit"



                                })



                                : "Loading..."}



                        </span>



                    </div>







                    <div className="enquiry-toolbar">







                        <div className="enquiry-search-wrapper">



                            <span className="search-icon">🔍</span>







                            <input



                                type="text"



                                value={searchTerm}



                                onChange={e => setSearchTerm(e.target.value)}



                                placeholder="Search enquiry, customer, phone, assigned to..."



                                className="enquiry-search"



                            />







                            {searchTerm && (



                                <button



                                    type="button"



                                    className="clear-search"



                                    onClick={() => setSearchTerm("")}



                                >



                                    ×



                                </button>



                            )}



                        </div>







                        <label className="pending-filter">



                            <input



                                type="checkbox"



                                checked={showPendingOnly}



                                onChange={e => setShowPendingOnly(e.target.checked)}



                            />



                            Pending quotation only



                        </label>







                        <div className="enquiry-count">



                            {loading



                                ? "Loading..."



                                : `${filteredEnquiries.length} Enquir${filteredEnquiries.length !== 1 ? "ies" : "y"}`}



                        </div>







                    </div>







                </div>











                {/* ================= TABLE ================= */}







                <div className="enquiry-table-container">







                    {loading ? (







                        <div className="enquiry-loading">Loading enquiries...</div>







                    ) : filteredEnquiries.length === 0 ? (







                        <div className="enquiry-empty">



                            <div className="empty-icon">📋</div>



                            <h3>No enquiries found</h3>



                            <p>Click "Add Enquiry" to create your first enquiry.</p>



                        </div>







                    ) : (







                        <table className="enquiry-table">







                            <thead>



                                <tr>



                                    <th className="slno-column">Sl No.</th>



                                    <th className="timer-column">Timer</th>



                                    <th>Enquiry No</th>



                                    <th>Added By</th>



                                    <th>Enquiry Source</th>



                                    <th>Entered By</th>



                                    <th>Assigned To</th>



                                    <th>Bought By</th>



                                    <th>Date</th>



                                    <th>Customer Name</th>



                                    <th className="address-column">Address</th>



                                    <th>Phone No</th>



                                    <th className="description-column">Description</th>



                                    <th className="remarks-column">Remarks</th>



                                    <th className="attachments-column">Attachments</th>



                                    <th className="sticky-quotation">Quotation No.</th>



                                    <th className="sticky-action">Action</th>



                                </tr>



                            </thead>







                            <tbody>



                                {filteredEnquiries.map((item, index) => {







                                    const timer = getTimerStatus(item.id, item.sales_order_no, item.remarks);







                                    const quotationMade =



                                        String(item.sales_order_no || "").trim().length > 0;







                                    const timerExpiredWithoutQuotation =



                                        timer.state === "timeout" && !quotationMade;







                                    const rowCellStyle = timerExpiredWithoutQuotation



                                        ? {



                                            backgroundColor: "#fff1f2",



                                            color: "#7f1d1d",



                                            borderBottom: "1px solid #fecaca"



                                        }



                                        : undefined;







                                    const itemAttachments = parseAttachmentList(item.attachments);







                                    return (



                                        <tr



                                            key={item.id}



                                            className="enquiry-row"



                                            onDoubleClick={() => handleEdit(item)}



                                            title="Double-click to edit"



                                        >







                                            {/* SL NO */}



                                            <td style={rowCellStyle} className="slno-cell">



                                                {filteredEnquiries.length - index}



                                            </td>







                                            {/* TIMER */}



                                            <td style={rowCellStyle} className="timer-cell">



                                                <span



                                                    style={getTimerBadgeStyle(timer.state, quotationMade)}



                                                    title={getTimerTitle(timer.state, quotationMade)}



                                                >



                                                    {timer.state === "waiting" ? "WAITING" : timer.label}



                                                </span>



                                            </td>







                                            {/* ENQUIRY NO */}



                                            <td style={rowCellStyle}>



                                                <span className="enquiry-number">{item.enquiry_no}</span>



                                            </td>







                                            {/* ADDED BY */}



                                            <td style={rowCellStyle}>{formatText(item.added_by)}</td>







                                            {/* SOURCE */}



                                            <td style={rowCellStyle}>{formatText(item.enquiry_source)}</td>







                                            {/* ENTERED BY */}



                                            <td style={rowCellStyle}>{formatText(item.entered_by)}</td>







                                            {/* ASSIGNED TO */}



                                            <td style={rowCellStyle}>{formatText(item.assigned_to)}</td>







                                            {/* BROUGHT BY */}



                                            <td style={rowCellStyle}>{formatText(item.brought_by)}</td>







                                            {/* DATE */}



                                            <td style={rowCellStyle} className="nowrap-cell">



                                                {formatDate(item.enquiry_date)}



                                            </td>







                                            {/* CUSTOMER */}



                                            <td style={rowCellStyle}>



                                                <strong>{formatText(item.customer_name)}</strong>



                                            </td>







                                            {/* ADDRESS */}



                                            <td style={rowCellStyle} className="address-cell">



                                                <div className="clamp-2" title={item.address || ""}>



                                                    {formatText(item.address)}



                                                </div>



                                            </td>







                                            {/* PHONE */}



                                            <td style={rowCellStyle} className="nowrap-cell">



                                                {formatText(item.phone_number)}



                                            </td>







                                            {/* DESCRIPTION */}



                                            <td style={rowCellStyle} className="description-cell">



                                                <div className="clamp-2" title={item.description || ""}>



                                                    {formatText(item.description)}



                                                </div>



                                            </td>







                                            {/* REMARKS */}



                                            <td style={rowCellStyle} className="remarks-cell">



                                                {String(item.remarks || "").trim() ? (



                                                    <div className="clamp-2" title={item.remarks}>



                                                        {item.remarks}



                                                    </div>



                                                ) : (



                                                    <span className="no-remarks">No Remarks</span>



                                                )}



                                            </td>







                                            {/* ATTACHMENTS */}



                                            <td style={rowCellStyle} className="attachments-cell">



                                                {itemAttachments.length > 0 ? (



                                                    <div className="attachment-list">



                                                        {itemAttachments.map((file, attachmentIndex) => (



                                                            <button



                                                                type="button"



                                                                key={file.id || `${file.file_url}-${attachmentIndex}`}



                                                                className="attachment-file attachment-link-btn"



                                                                title={`Download ${file.original_name || "Attachment"}`}



                                                                onClick={() => downloadAttachment(file)}



                                                            >



                                                                <span className="attachment-icon">



                                                                    {getAttachmentIcon(file)}



                                                                </span>



                                                                <span className="attachment-name">



                                                                    {file.original_name || "Attachment"}



                                                                </span>



                                                            </button>



                                                        ))}



                                                    </div>



                                                ) : (



                                                    <span className="no-attachment">No Files</span>



                                                )}



                                            </td>







                                            {/* QUOTATION NO (sticky right) */}



                                            <td style={rowCellStyle} className="sticky-quotation">



                                                {item.sales_order_no ? (



                                                    <span



                                                        className="sales-order-badge"



                                                        title="Quotation number linked with this enquiry"



                                                    >



                                                        {item.sales_order_no}



                                                    </span>



                                                ) : (



                                                    <span className="not-attached">Not Attached</span>



                                                )}



                                            </td>







                                            {/* ACTION (sticky right) */}



                                            <td style={rowCellStyle} className="sticky-action">



                                                <button



                                                    type="button"



                                                    className="edit-btn"



                                                    onClick={() => handleEdit(item)}



                                                >



                                                    ✏️ Edit



                                                </button>



                                            </td>







                                        </tr>



                                    );



                                })}



                            </tbody>







                        </table>







                    )}







                </div>











                {/* ================= MODAL ================= */}







                {showModal &&

                    typeof document !== "undefined" &&

                    createPortal(

                        <div

                            className="enquiry-modal-overlay"

                            style={{

                                position: "fixed",

                                inset: 0,

                                zIndex: 2147483647,

                                width: "100vw",

                                height: "100vh",

                                display: "flex",

                                alignItems: "flex-start",

                                justifyContent: "center",

                                padding: "20px",

                                boxSizing: "border-box",

                                overflowY: "auto"

                            }}

                            onMouseDown={e => {

                                if (e.target === e.currentTarget) closeModal();

                            }}

                        >

                            <div

                                className="enquiry-modal"

                                style={{

                                    position: "relative",

                                    zIndex: 2147483647,

                                    maxHeight: "calc(100vh - 40px)",

                                    overflowY: "auto"

                                }}

                            >



                            {/* HEADER */}



                            <div className="enquiry-modal-header">



                                <div>



                                    <h2>{editing ? "Edit Enquiry" : "Add Enquiry"}</h2>



                                    <p>



                                        {editing



                                            ? "Update enquiry details and attachments."



                                            : "Enter the enquiry details and attach documents."}



                                    </p>



                                </div>







                                <button



                                    type="button"



                                    className="modal-close-btn"



                                    onClick={closeModal}



                                    disabled={saving}



                                >



                                    ×



                                </button>



                            </div>







                            {/* MESSAGES */}



                            {errorMessage && (



                                <div className="enquiry-alert enquiry-alert-error modal-alert">



                                    {errorMessage}



                                </div>



                            )}







                            {successMessage && (



                                <div className="enquiry-alert enquiry-alert-success modal-alert">



                                    {successMessage}



                                </div>



                            )}







                            {/* FORM */}



                            <form className="enquiry-form" onSubmit={handleSubmit}>







                                {/* ENQUIRY NO + DATE */}



                                <div className="form-row">



                                    <div className="form-group">



                                        <label>Enquiry No.</label>



                                        <input



                                            type="text"



                                            value={form.enquiry_no || "Loading..."}



                                            readOnly



                                            className="readonly-input"



                                        />



                                        <small>Automatically generated.</small>



                                    </div>







                                    <div className="form-group">



                                        <label>



                                            Date <span className="required">*</span>



                                        </label>



                                        <input



                                            type="date"



                                            name="enquiry_date"



                                            value={form.enquiry_date}



                                            onChange={handleChange}



                                            required



                                        />



                                    </div>



                                </div>







                                {/* CUSTOMER */}



                                <div className="form-group">



                                    <label>



                                        Customer Name <span className="required">*</span>



                                    </label>



                                    <input



                                        type="text"



                                        name="customer_name"



                                        value={form.customer_name}



                                        onChange={handleChange}



                                        placeholder="Enter customer name"



                                        required



                                    />



                                </div>







                                {/* ADDRESS */}



                                <div className="form-group">



                                    <label>Address</label>



                                    <textarea



                                        name="address"



                                        value={form.address}



                                        onChange={handleChange}



                                        placeholder="Enter customer address"



                                        rows="3"



                                    />



                                </div>







                                {/* PHONE + SOURCE */}



                                <div className="form-row">



                                    <div className="form-group">



                                        <label>Phone Number</label>



                                        <input



                                            type="tel"



                                            name="phone_number"



                                            value={form.phone_number}



                                            onChange={handleChange}



                                            placeholder="Enter phone number"



                                        />



                                    </div>







                                    <div className="form-group">



                                        <label>



                                            Enquiry Source <span className="required">*</span>



                                        </label>



                                        <select



                                            name="enquiry_source"



                                            value={form.enquiry_source}



                                            onChange={handleChange}



                                            required



                                        >



                                            <option value="">Select Source</option>



                                            <option value="WhatsApp">WhatsApp</option>



                                            <option value="Phone">Phone</option>



                                            <option value="Email">Email</option>



                                            <option value="SMS">SMS</option>



                                            <option value="Walk In">Walk In</option>



                                        </select>



                                    </div>



                                </div>







                                {/* ADDED BY */}



                                <div className="form-group">



                                    <label>Added By</label>



                                    <input



                                        type="text"



                                        value={form.added_by}



                                        readOnly



                                        className="readonly-input"



                                    />



                                    <small>Automatically taken from logged-in user.</small>



                                </div>







                                {/* ASSIGNED TO + BROUGHT BY */}



                                <div className="form-row">



                                    <div className="form-group">



                                        <label>Assigned To</label>



                                        <input



                                            type="text"



                                            name="assigned_to"



                                            value={form.assigned_to}



                                            onChange={handleChange}



                                            placeholder="Enter assigned person"



                                        />



                                    </div>







                                    <div className="form-group">



                                        <label>Brought By</label>



                                        <input



                                            type="text"



                                            name="brought_by"



                                            value={form.brought_by}



                                            onChange={handleChange}



                                            placeholder="Enter person who brought this enquiry"



                                        />



                                    </div>



                                </div>







                                {/* DESCRIPTION */}



                                <div className="form-group">



                                    <label>Description</label>



                                    <textarea



                                        name="description"



                                        value={form.description}



                                        onChange={handleChange}



                                        placeholder="Enter enquiry description / requirement"



                                        rows="5"



                                    />



                                </div>







                                {/* REMARKS */}
                                <div className="form-group">
                                    <label>Remarks</label>

                                    <select
                                        value={remarksMode}
                                        onChange={event => {
                                            const value = event.target.value;
                                            setRemarksMode(value);
                                            setForm(prev => ({
                                                ...prev,
                                                remarks: value === "Other" ? "" : value
                                            }));
                                        }}
                                    >
                                        <option value="Pending Quotation">Pending Quotation</option>
                                        <option value="Item Not Available">Item Not Available</option>
                                        <option value="Customer Cancelled">Customer Cancelled</option>
                                        <option value="Customer Not Responding">Customer Not Responding</option>
                                        <option value="Price Issue">Price Issue</option>
                                        <option value="Requirement Not Clear">Requirement Not Clear</option>
                                        <option value="Duplicate Enquiry">Duplicate Enquiry</option>
                                        <option value="Not Required">Not Required</option>
                                        <option value="Other">Other</option>
                                    </select>

                                    {remarksMode === "Other" && (
                                        <>
                                            <textarea
                                                name="remarks"
                                                value={form.remarks}
                                                onChange={handleChange}
                                                placeholder="Enter your remarks..."
                                                rows="4"
                                                style={{ marginTop: "8px" }}
                                            />
                                            <small>Enter your custom remark when Other is selected.</small>
                                        </>
                                    )}
                                </div>

                                {/* ATTACHMENTS */}



                                <div className="form-group">



                                    <label>Attachments</label>



                                    <input type="file" multiple onChange={handleAttachmentChange} />



                                    <small>



                                        You can select multiple files such as PDF, JPG, PNG, Word, Excel and other documents.



                                    </small>







                                    {/* EXISTING ATTACHMENTS */}



                                    {existingAttachments.length > 0 && (



                                        <div className="selected-attachments">



                                            <div className="attachment-section-title">Existing Attachments</div>







                                            {existingAttachments.map((file, attachmentIndex) => (



                                                <div



                                                    className="selected-attachment"



                                                    key={file.file_url || attachmentIndex}



                                                >



                                                    <span className="attachment-icon">{getAttachmentIcon(file)}</span>







                                                    <button



                                                        type="button"



                                                        className="attachment-link-btn"



                                                        onClick={() => downloadAttachment(file)}



                                                        title={`Download ${file.original_name || "Attachment"}`}



                                                    >



                                                        {file.original_name}



                                                    </button>







                                                    <button



                                                        type="button"



                                                        className="remove-attachment-btn"



                                                        onClick={() => removeExistingAttachment(attachmentIndex)}



                                                    >



                                                        ×



                                                    </button>



                                                </div>



                                            ))}



                                        </div>



                                    )}







                                    {/* NEW ATTACHMENTS */}



                                    {attachments.length > 0 && (



                                        <div className="selected-attachments">



                                            <div className="attachment-section-title">New Attachments</div>







                                            {attachments.map((file, attachmentIndex) => (



                                                <div



                                                    className="selected-attachment"



                                                    key={`${file.name}-${attachmentIndex}`}



                                                >



                                                    <span className="attachment-icon">



                                                        {getAttachmentIcon({ file_type: file.type, original_name: file.name })}



                                                    </span>







                                                    <span>{file.name}</span>







                                                    <button



                                                        type="button"



                                                        className="remove-attachment-btn"



                                                        onClick={() => removeNewAttachment(attachmentIndex)}



                                                    >



                                                        ×



                                                    </button>



                                                </div>



                                            ))}



                                        </div>



                                    )}



                                </div>







                                {/* QUOTATION NO. - kept at the bottom */}

                                <div className="form-group quotation-number-bottom">

                                    <label>Quotation No.</label>

                                    <input

                                        type="text"

                                        name="sales_order_no"

                                        value={form.sales_order_no}

                                        onChange={handleChange}

                                        placeholder="Enter quotation number when available"

                                    />

                                </div>



                                {/* BUTTONS */}



                                <div className="form-actions">



                                    <button



                                        type="button"



                                        className="cancel-btn"



                                        onClick={closeModal}



                                        disabled={saving}



                                    >



                                        Cancel



                                    </button>







                                    <button type="submit" className="save-btn" disabled={saving}>



                                        {saving ? (



                                            <>



                                                <span className="button-spinner" />



                                                Uploading...



                                            </>



                                        ) : editing ? "Update Enquiry" : "Save Enquiry"}



                                    </button>



                                </div>







                            </form>



                        </div>

                    </div>,

                    document.body

                )}



            </div>



        </>



    );



}
