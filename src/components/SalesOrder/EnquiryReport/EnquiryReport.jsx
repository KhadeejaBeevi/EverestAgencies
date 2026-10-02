import Banner from "../../Banner/Banner.jsx";
import React, {
    useEffect,
    useMemo,
    useState
} from "react";

import {
    auth,
    db
} from "../../firebase";

import {
    doc,
    getDoc
} from "firebase/firestore";

import {
    onAuthStateChanged
} from "firebase/auth";

import "./EnquiryReport.css";

import {
    apiFetch
} from "../../../api/apiClient";


const API_BASE = "/serverphp";


/* =========================================================
   EMPTY FORM
========================================================= */

const emptyForm = {

    id: null,

    enquiry_no: "",

    enquiry_date:
        new Date()
            .toISOString()
            .split("T")[0],

    customer_name: "",

    address: "",

    phone_number: "",

    enquiry_source: "",

    description: "",

    added_by: "",

    assigned_to: "",

    brought_by: "",

    sales_order_no: "",

    remarks: "",

};


/* =========================================================
   CURRENT USER NAME
========================================================= */

async function getCurrentUserName() {

    try {

        const user =
            auth.currentUser;

        if (!user) {

            console.log(
                "No Firebase user logged in"
            );

            return "";

        }


        const userRef =
            doc(
                db,
                "Users",
                user.uid
            );


        const userSnap =
            await getDoc(userRef);


        if (userSnap.exists()) {

            const userData =
                userSnap.data();


            const firstName =
                String(
                    userData.firstName || ""
                ).trim();


            const lastName =
                String(
                    userData.lastName || ""
                ).trim();


            const fullName =
                `${firstName} ${lastName}`.trim();


            if (fullName) {

                return fullName;

            }

        }


        /* =========================================
           LOCAL STORAGE FALLBACK
        ========================================= */

        try {

            const authData =
                localStorage.getItem(
                    "User"
                );


            if (authData) {

                const localUser =
                    JSON.parse(
                        authData
                    );


                const firstName =
                    String(
                        localUser.firstName || ""
                    ).trim();


                const lastName =
                    String(
                        localUser.lastName || ""
                    ).trim();


                const fullName =
                    `${firstName} ${lastName}`.trim();


                if (fullName) {

                    return fullName;

                }

            }

        } catch (error) {

            console.log(
                "LocalStorage error:",
                error
            );

        }


        return "";

    } catch (error) {

        console.error(
            "GET USER ERROR:",
            error
        );

        return "";

    }

}


/* =========================================================
   DATE FORMAT
========================================================= */

function formatDate(dateString) {

    if (!dateString) {

        return "";

    }


    const date =
        new Date(dateString);


    if (isNaN(date.getTime())) {

        return dateString;

    }


    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "long",
            year: "numeric"
        }
    );

}


/* =========================================================
   TEXT FORMAT
========================================================= */

function formatText(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "";

    }


    return value;

}


/* =========================================================
   ATTACHMENT ICON
========================================================= */

function getAttachmentIcon(file) {

    const type =
        String(
            file?.file_type || ""
        ).toLowerCase();


    const name =
        String(
            file?.original_name || ""
        ).toLowerCase();


    if (
        type.startsWith("image/")
    ) {

        return "🖼️";

    }


    if (
        type ===
        "application/pdf" ||
        name.endsWith(".pdf")
    ) {

        return "📕";

    }


    if (
        type.includes("word") ||
        name.endsWith(".doc") ||
        name.endsWith(".docx")
    ) {

        return "📝";

    }


    if (
        type.includes("excel") ||
        type.includes("spreadsheet") ||
        name.endsWith(".xls") ||
        name.endsWith(".xlsx")
    ) {

        return "📊";

    }


    if (
        type.includes("zip") ||
        name.endsWith(".zip") ||
        name.endsWith(".rar")
    ) {

        return "🗜️";

    }


    return "📎";

}


/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function EnquiryReport() {


    /* =====================================================
       DATA STATES
    ===================================================== */

    const [
        enquiries,
        setEnquiries
    ] = useState([]);


    const [
        loading,
        setLoading
    ] = useState(false);


    const [
        saving,
        setSaving
    ] = useState(false);


    /* =====================================================
       MODAL
    ===================================================== */

    const [
        showModal,
        setShowModal
    ] = useState(false);


    const [
        editing,
        setEditing
    ] = useState(false);


    /* =====================================================
       FORM
    ===================================================== */

    const [
        form,
        setForm
    ] = useState(
        emptyForm
    );


    /* =====================================================
       SEARCH
    ===================================================== */

    const [
        searchTerm,
        setSearchTerm
    ] = useState("");


    /* =====================================================
       MESSAGES
    ===================================================== */

    const [
        errorMessage,
        setErrorMessage
    ] = useState("");


    const [
        successMessage,
        setSuccessMessage
    ] = useState("");


    /* =====================================================
       USER ROLE
    ===================================================== */

    const [
        userRole,
        setUserRole
    ] = useState("");


    /* =====================================================
       NEXT ENQUIRY NUMBER
    ===================================================== */

    const [
        nextEnquiryNo,
        setNextEnquiryNo
    ] = useState("");


    /* =====================================================
       NEW FILES
    ===================================================== */

    const [
        attachments,
        setAttachments
    ] = useState([]);


    /* =====================================================
       EXISTING FILES
    ===================================================== */

    const [
        existingAttachments,
        setExistingAttachments
    ] = useState([]);


    /* =====================================================
       ENQUIRY QUOTATION TIMER QUEUE
       One enquiry gets 40 minutes.
       New enquiries wait in queue.
    ===================================================== */

    const TIMER_DURATION =
        40 * 60 * 1000;

    const TIMER_STORAGE_KEY =
        "enquiryQuotationTimerQueue";


    const [
        timerQueue,
        setTimerQueue
    ] = useState(() => {

        try {

            const saved =
                localStorage.getItem(
                    TIMER_STORAGE_KEY
                );


            const parsed =
                saved
                    ? JSON.parse(saved)
                    : [];


            if (!Array.isArray(parsed)) {

                return [];

            }


            return parsed.map(
                item => ({

                    ...item,

                    status:
                        item.status ===
                        "timeout"
                            ? "timeout"
                            : "active"

                })
            );

        } catch (error) {

            console.warn(
                "Unable to restore enquiry timer queue:",
                error
            );

            return [];

        }

    });


    const [
        timerNow,
        setTimerNow
    ] = useState(
        Date.now()
    );


    function persistTimerQueue(
        queue
    ) {

        try {

            if (queue.length) {

                localStorage.setItem(
                    TIMER_STORAGE_KEY,
                    JSON.stringify(
                        queue
                    )
                );

            } else {

                localStorage.removeItem(
                    TIMER_STORAGE_KEY
                );

            }

        } catch (error) {

            console.warn(
                "Unable to save enquiry timer queue:",
                error
            );

        }

    }


    function addEnquiryToTimerQueue(
        enquiryId
    ) {

        if (!enquiryId) {

            return;

        }


        setTimerQueue(
            prev => {

                const exists =
                    prev.some(
                        item =>
                            String(
                                item.id
                            ) ===
                            String(
                                enquiryId
                            )
                    );


                if (exists) {

                    return prev;

                }


                const hasRunningTimer =
                    prev.some(
                        item =>
                            item.status !==
                                "timeout" &&
                            item.startedAt
                    );


                const nextQueue = [

                    ...prev,

                    {

                        id:
                            enquiryId,

                        startedAt:
                            hasRunningTimer
                                ? null
                                : Date.now(),

                        status:
                            "active"

                    }

                ];


                persistTimerQueue(
                    nextQueue
                );


                return nextQueue;

            }
        );

    }


    function getTimerEntry(
        enquiryId
    ) {

        return timerQueue.find(
            item =>
                String(
                    item.id
                ) ===
                String(
                    enquiryId
                )
        );

    }


    function formatTimer(
        seconds
    ) {

        const safeSeconds =
            Math.max(
                0,
                Math.ceil(
                    seconds
                )
            );


        const minutes =
            Math.floor(
                safeSeconds / 60
            );


        const remainingSeconds =
            safeSeconds % 60;


        return `${String(
            minutes
        ).padStart(
            2,
            "0"
        )}:${String(
            remainingSeconds
        ).padStart(
            2,
            "0"
        )}`;

    }


    function getTimerStatus(
        enquiryId
    ) {

        const entry =
            getTimerEntry(
                enquiryId
            );


        if (!entry) {

            return {

                state:
                    "none",

                seconds:
                    null,

                label:
                    "—"

            };

        }


        if (
            entry.status ===
            "timeout"
        ) {

            return {

                state:
                    "timeout",

                seconds:
                    0,

                label:
                    "TIME OUT"

            };

        }


        if (
            !entry.startedAt
        ) {

            return {

                state:
                    "waiting",

                seconds:
                    null,

                label:
                    "WAITING"

            };

        }


        const elapsed =
            timerNow -
            Number(
                entry.startedAt
            );


        const remainingMs =
            TIMER_DURATION -
            elapsed;


        if (
            remainingMs <=
            0
        ) {

            return {

                state:
                    "timeout",

                seconds:
                    0,

                label:
                    "TIME OUT"

            };

        }


        const seconds =
            Math.ceil(
                remainingMs /
                1000
            );


        if (
            seconds <=
            12 * 60
        ) {

            return {

                state:
                    "red",

                seconds,

                label:
                    formatTimer(
                        seconds
                    )

            };

        }


        if (
            seconds <=
            20 * 60
        ) {

            return {

                state:
                    "orange",

                seconds,

                label:
                    formatTimer(
                        seconds
                    )

            };

        }


        return {

            state:
                "green",

            seconds,

            label:
                formatTimer(
                    seconds
                )

        };

    }


    /* =====================================================
       TIMER DISPLAY
    ===================================================== */

    useEffect(() => {

        const interval =
            setInterval(
                () => {

                    setTimerNow(
                        Date.now()
                    );

                },
                1000
            );


        return () =>
            clearInterval(
                interval
            );

    }, []);


    /* =====================================================
       TIMER QUEUE
    ===================================================== */

    useEffect(() => {

        if (
            !timerQueue.length
        ) {

            return;

        }


        const activeIndex =
            timerQueue.findIndex(
                item =>
                    item.status !==
                    "timeout"
            );


        if (
            activeIndex ===
            -1
        ) {

            return;

        }


        const activeEntry =
            timerQueue[
                activeIndex
            ];


        if (
            !activeEntry.startedAt
        ) {

            const now =
                Date.now();


            setTimerQueue(
                prev => {

                    const nextQueue =
                        prev.map(
                            (
                                item,
                                index
                            ) =>
                                index ===
                                activeIndex
                                    ? {

                                        ...item,

                                        startedAt:
                                            now,

                                        status:
                                            "active"

                                    }
                                    : item
                        );


                    persistTimerQueue(
                        nextQueue
                    );


                    return nextQueue;

                }
            );


            return;

        }


        const remaining =
            TIMER_DURATION -
            (
                Date.now() -
                Number(
                    activeEntry.startedAt
                )
            );


        if (
            remaining >
            0
        ) {

            return;

        }


        setTimerQueue(
            prev => {

                const nextQueue =
                    prev.map(
                        (
                            item,
                            index
                        ) =>
                            index ===
                            activeIndex
                                ? {

                                    ...item,

                                    status:
                                        "timeout"

                                }
                                : item
                    );


                const nextIndex =
                    nextQueue.findIndex(
                        (
                            item,
                            index
                        ) =>
                            index >
                            activeIndex &&
                            item.status !==
                            "timeout"
                    );


                if (
                    nextIndex !==
                        -1 &&
                    !nextQueue[
                        nextIndex
                    ].startedAt
                ) {

                    nextQueue[
                        nextIndex
                    ] = {

                        ...nextQueue[
                            nextIndex
                        ],

                        startedAt:
                            Date.now(),

                        status:
                            "active"

                    };

                }


                persistTimerQueue(
                    nextQueue
                );


                return nextQueue;

            }
        );

    }, [
        timerNow,
        timerQueue
    ]);


    /* =====================================================
       USER
    ===================================================== */

    useEffect(() => {

        const unsubscribe =
            onAuthStateChanged(
                auth,
                async user => {

                    if (!user) {

                        setForm(
                            prev => ({

                                ...prev,

                                added_by:
                                    ""

                            })
                        );

                        return;

                    }


                    try {

                        const userRef =
                            doc(
                                db,
                                "Users",
                                user.uid
                            );


                        const userSnap =
                            await getDoc(
                                userRef
                            );


                        if (
                            userSnap.exists()
                        ) {

                            const userData =
                                userSnap.data();


                            const firstName =
                                String(
                                    userData.firstName ||
                                    ""
                                ).trim();


                            const lastName =
                                String(
                                    userData.lastName ||
                                    ""
                                ).trim();


                            const fullName =
                                `${firstName} ${lastName}`.trim();


                            setForm(
                                prev => ({

                                    ...prev,

                                    added_by:
                                        fullName

                                })
                            );

                        }

                    } catch (
                        error
                    ) {

                        console.error(
                            "USER LOAD ERROR:",
                            error
                        );

                    }

                }
            );


        return () =>
            unsubscribe();

    }, []);


    /* =====================================================
       LOAD USER ROLE
    ===================================================== */

    useEffect(() => {

        const unsubscribe =
            onAuthStateChanged(
                auth,
                async user => {

                    if (!user) {

                        setUserRole(
                            ""
                        );

                        return;

                    }


                    try {

                        const roleRef =
                            doc(
                                db,
                                "roles",
                                user.uid
                            );


                        const roleSnap =
                            await getDoc(
                                roleRef
                            );


                        if (
                            roleSnap.exists()
                        ) {

                            const adminRole =
                                roleSnap
                                    .data()
                                    .role ||
                                "";


                            if (
                                adminRole
                                    .toLowerCase()
                                    .trim() ===
                                "admin"
                            ) {

                                setUserRole(
                                    "admin"
                                );

                                return;

                            }

                        }


                        const userRef =
                            doc(
                                db,
                                "Users",
                                user.uid
                            );


                        const userSnap =
                            await getDoc(
                                userRef
                            );


                        if (
                            userSnap.exists()
                        ) {

                            const userData =
                                userSnap.data();


                            setUserRole(
                                userData.role ||
                                ""
                            );

                        }

                    } catch (
                        err
                    ) {

                        console.log(
                            err
                        );

                    }

                }
            );


        return () =>
            unsubscribe();

    }, []);


    /* =====================================================
       LOAD ENQUIRIES
    ===================================================== */

    useEffect(() => {

        loadEnquiries();

    }, []);


    async function loadEnquiries() {

        try {

            setLoading(
                true
            );

            setErrorMessage(
                ""
            );


            const response =
                await apiFetch(
                    `${API_BASE}/enquiry_report.php`,
                    {
                        method:
                            "GET"
                    }
                );


            const result =
                await response.json();


            console.log(
                "ENQUIRY RESPONSE:",
                result
            );


            if (
                !response.ok ||
                !result.success
            ) {

                throw new Error(
                    result.message ||
                    "Failed to load enquiries"
                );

            }


            const enquiryData =
                result.data || [];


            /* =================================================
               NEWEST ENQUIRY FIRST

               1. Newest enquiry date first.
               2. If same date, highest database ID first.
            ================================================= */

            enquiryData.sort(
                (
                    a,
                    b
                ) => {

                    const dateA =
                        new Date(
                            `${a.enquiry_date}T00:00:00`
                        ).getTime();


                    const dateB =
                        new Date(
                            `${b.enquiry_date}T00:00:00`
                        ).getTime();


                    /*
                       Different dates:
                       newest date first.
                    */

                    if (
                        dateB !==
                        dateA
                    ) {

                        return (
                            dateB -
                            dateA
                        );

                    }


                    /*
                       Same date:
                       newest database record first.
                    */

                    const idA =
                        Number(
                            a.id
                        ) || 0;


                    const idB =
                        Number(
                            b.id
                        ) || 0;


                    return (
                        idB -
                        idA
                    );

                }
            );


            setEnquiries(
                enquiryData
            );


            setNextEnquiryNo(
                result.next_enquiry_no ||
                ""
            );


        } catch (
            error
        ) {

            console.error(
                "LOAD ENQUIRIES ERROR:",
                error
            );


            setErrorMessage(
                error.message ||
                "Failed to load enquiries"
            );

        } finally {

            setLoading(
                false
            );

        }

    }


    /* =====================================================
       SEARCH
    ===================================================== */

    const filteredEnquiries =
        useMemo(
            () => {

                const search =
                    searchTerm
                        .trim()
                        .toLowerCase();


                if (!search) {

                    return enquiries;

                }


                return enquiries.filter(
                    item => {

                        return [

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

                            Array.isArray(
                                item.linked_quotation_nos
                            )
                                ? item.linked_quotation_nos.join(
                                    " "
                                )
                                : ""

                        ]
                            .filter(
                                Boolean
                            )
                            .some(
                                value =>
                                    String(
                                        value
                                    )
                                        .toLowerCase()
                                        .includes(
                                            search
                                        )
                            );

                    }
                );

            },
            [
                enquiries,
                searchTerm
            ]
        );


    /* =====================================================
       ADD ENQUIRY
    ===================================================== */

    async function handleAddEnquiry() {

        setEditing(
            false
        );

        setErrorMessage(
            ""
        );

        setSuccessMessage(
            ""
        );

        setAttachments(
            []
        );

        setExistingAttachments(
            []
        );


        const userName =
            await getCurrentUserName();


        setForm({

            ...emptyForm,

            enquiry_date:
                new Date()
                    .toISOString()
                    .split("T")[0],

            enquiry_no:
                nextEnquiryNo ||
                "Loading...",

            added_by:
                userName,

            assigned_to:
                "",

            brought_by:
                "",

            remarks:
                "",

            sales_order_no:
                ""

        });


        setShowModal(
            true
        );

    }


    /* =====================================================
       EDIT
    ===================================================== */

    function handleEdit(
        item
    ) {

        setEditing(
            true
        );

        setErrorMessage(
            ""
        );

        setSuccessMessage(
            ""
        );

        setAttachments(
            []
        );


        let oldAttachments =
            [];


        if (
            Array.isArray(
                item.attachments
            )
        ) {

            oldAttachments =
                item.attachments;

        } else if (
            typeof item.attachments ===
            "string"
        ) {

            try {

                const parsed =
                    JSON.parse(
                        item.attachments
                    );


                if (
                    Array.isArray(
                        parsed
                    )
                ) {

                    oldAttachments =
                        parsed;

                }

            } catch (
                error
            ) {

                console.warn(
                    "Invalid attachment JSON:",
                    error
                );

            }

        }


        setExistingAttachments(
            oldAttachments
        );


        setForm({

            id:
                item.id,

            enquiry_no:
                item.enquiry_no ||
                "",

            enquiry_date:
                item.enquiry_date ||
                "",

            customer_name:
                item.customer_name ||
                "",

            address:
                item.address ||
                "",

            phone_number:
                item.phone_number ||
                "",

            enquiry_source:
                item.enquiry_source ||
                "",

            description:
                item.description ||
                "",

            added_by:
                item.added_by ||
                "",

            assigned_to:
                item.assigned_to ||
                "",

            brought_by:
                item.brought_by ||
                "",

            sales_order_no:
                item.sales_order_no ||
                "",

            remarks:
                item.remarks ||
                ""

        });


        setShowModal(
            true
        );

    }


    /* =====================================================
       REMOVE EXISTING ATTACHMENT
    ===================================================== */

    function removeExistingAttachment(
        index
    ) {

        setExistingAttachments(
            prev =>
                prev.filter(
                    (
                        _,
                        i
                    ) =>
                        i !==
                        index
                )
        );

    }


    /* =====================================================
       FILE SELECT
    ===================================================== */

    function handleAttachmentChange(
        event
    ) {

        const files =
            Array.from(
                event.target.files ||
                []
            );


        if (
            !files.length
        ) {

            return;

        }


        setAttachments(
            prev => [

                ...prev,

                ...files

            ]
        );


        event.target.value =
            "";

    }


    /* =====================================================
       REMOVE NEW FILE
    ===================================================== */

    function removeNewAttachment(
        index
    ) {

        setAttachments(
            prev =>
                prev.filter(
                    (
                        _,
                        i
                    ) =>
                        i !==
                        index
                )
        );

    }


    /* =====================================================
       CLOSE MODAL
    ===================================================== */

    function closeModal() {

        if (
            saving
        ) {

            return;

        }


        setShowModal(
            false
        );

        setEditing(
            false
        );

        setErrorMessage(
            ""
        );

        setSuccessMessage(
            ""
        );

        setAttachments(
            []
        );

        setExistingAttachments(
            []
        );

    }


    /* =====================================================
       INPUT CHANGE
    ===================================================== */

    function handleChange(
        event
    ) {

        const {
            name,
            value
        } = event.target;


        setForm(
            prev => ({

                ...prev,

                [name]:
                    value

            })
        );

    }


    /* =====================================================
       SAVE / UPDATE
    ===================================================== */

    async function handleSubmit(
        event
    ) {

        event.preventDefault();

        setErrorMessage(
            ""
        );

        setSuccessMessage(
            ""
        );


        if (
            !form.enquiry_date
        ) {

            setErrorMessage(
                "Please select the enquiry date."
            );

            return;

        }


        if (
            !form.customer_name.trim()
        ) {

            setErrorMessage(
                "Please enter customer name."
            );

            return;

        }


        if (
            !form.added_by.trim()
        ) {

            setErrorMessage(
                "Unable to identify the logged-in user."
            );

            return;

        }


        if (
            !form.enquiry_source.trim()
        ) {

            setErrorMessage(
                "Please select the enquiry source."
            );

            return;

        }


        try {

            setSaving(
                true
            );


            const isEdit =
                editing &&
                form.id;


            const formData =
                new FormData();


            formData.append(
                "enquiry_date",
                form.enquiry_date
            );


            formData.append(
                "customer_name",
                form.customer_name.trim()
            );


            formData.append(
                "address",
                form.address.trim()
            );


            formData.append(
                "phone_number",
                form.phone_number.trim()
            );


            formData.append(
                "enquiry_source",
                form.enquiry_source.trim()
            );


            formData.append(
                "description",
                form.description.trim()
            );


            formData.append(
                "added_by",
                form.added_by.trim()
            );


            formData.append(
                "assigned_to",
                form.assigned_to.trim()
            );


            formData.append(
                "brought_by",
                form.brought_by.trim()
            );


            formData.append(
                "sales_order_no",
                form.sales_order_no.trim()
            );


            formData.append(
                "remarks",
                form.remarks.trim()
            );


            if (
                isEdit
            ) {

                formData.append(
                    "id",
                    form.id
                );


                formData.append(
                    "keep_attachments",
                    JSON.stringify(
                        existingAttachments
                    )
                );

            }


            attachments.forEach(
                file => {

                    formData.append(
                        "attachments[]",
                        file,
                        file.name
                    );

                }
            );


            console.log(
                "UPLOADING FILES:",
                attachments
            );


            const response =
                await apiFetch(
                    `${API_BASE}/enquiry_report.php`,
                    {

                        method:
                            "POST",

                        body:
                            formData

                    }
                );


            const result =
                await response.json();


            console.log(
                "SAVE RESPONSE:",
                result
            );


            if (
                !response.ok ||
                !result.success
            ) {

                throw new Error(
                    result.message ||
                    "Failed to save enquiry"
                );

            }


            await loadEnquiries();


            /*
               Start quotation timer only for
               newly created enquiry.
            */

            if (
                !isEdit &&
                result.data?.id
            ) {

                addEnquiryToTimerQueue(
                    result.data.id
                );

            }


            setSuccessMessage(

                isEdit

                    ? "Enquiry updated successfully."

                    : `Enquiry ${
                        result.data?.enquiry_no ||
                        ""
                    } added successfully.`

            );


            setTimeout(
                () => {

                    setShowModal(
                        false
                    );

                    setSuccessMessage(
                        ""
                    );

                    setEditing(
                        false
                    );

                    setAttachments(
                        []
                    );

                    setExistingAttachments(
                        []
                    );

                },
                700
            );


        } catch (
            error
        ) {

            console.error(
                "SAVE ERROR:",
                error
            );


            setErrorMessage(
                error.message ||
                "Failed to save enquiry."
            );

        } finally {

            setSaving(
                false
            );

        }

    }


    /* =====================================================
       RENDER
    ===================================================== */

    const renderBanner =
        () => <Banner />;


    return (

        <>

            {renderBanner()}


            <div className="enquiry-page">


                {/* =================================================
                    HEADER
                ================================================= */}

                <div className="enquiry-top-section">

                    <div className="enquiry-header">

                        <div className="enquiry-header-title">

                            <h1>
                                Enquiry Capture
                            </h1>


                            <p>
                                Manage customer enquiries
                                and attachments.
                            </p>

                        </div>


                        <button
                            className="add-enquiry-btn"
                            onClick={
                                handleAddEnquiry
                            }
                        >

                            <span className="add-icon">
                                +
                            </span>

                            Add Enquiry

                        </button>

                    </div>


                    <div className="enquiry-toolbar">

                        <div className="enquiry-search-wrapper">

                            <span className="search-icon">
                                🔍
                            </span>


                            <input
                                type="text"
                                value={
                                    searchTerm
                                }
                                onChange={
                                    e =>
                                        setSearchTerm(
                                            e.target.value
                                        )
                                }
                                placeholder="Search enquiry, customer, phone, assigned to..."
                                className="enquiry-search"
                            />


                            {searchTerm && (

                                <button
                                    type="button"
                                    className="clear-search"
                                    onClick={() =>
                                        setSearchTerm(
                                            ""
                                        )
                                    }
                                >
                                    ×
                                </button>

                            )}

                        </div>


                        <div className="enquiry-count">

                            {
                                loading
                                    ? "Loading..."
                                    : `${filteredEnquiries.length} Enquir${
                                        filteredEnquiries.length !==
                                        1
                                            ? "ies"
                                            : "y"
                                    }`
                            }

                        </div>

                    </div>

                </div>


                {/* =================================================
                    TABLE
                ================================================= */}

                <div className="enquiry-table-container">

                    {loading ? (

                        <div className="enquiry-loading">
                            Loading enquiries...
                        </div>

                    ) : filteredEnquiries.length ===
                      0 ? (

                        <div className="enquiry-empty">

                            <div className="empty-icon">
                                📋
                            </div>


                            <h3>
                                No enquiries found
                            </h3>


                            <p>
                                Click "Add Enquiry"
                                to create your first enquiry.
                            </p>

                        </div>

                    ) : (

                        <table className="enquiry-table">

                            <thead>

                                <tr>

                                    {/* SL NO */}

                                    <th
                                        style={{
                                            width:
                                                "60px",

                                            minWidth:
                                                "60px",

                                            textAlign:
                                                "center"
                                        }}
                                    >
                                        Sl No.
                                    </th>


                                    {/* TIMER */}

                                    <th className="timer-column">
                                        Timer
                                    </th>


                                    <th>
                                        Enquiry No
                                    </th>


                                    <th>
                                        Added By
                                    </th>


                                    <th>
                                        Enquiry Source
                                    </th>


                                    <th>
                                        Entered By
                                    </th>


                                    <th>
                                        Assigned To
                                    </th>


                                    <th>
                                        Bought By
                                    </th>


                                    <th>
                                        Date
                                    </th>


                                    <th>
                                        Customer Name
                                    </th>


                                    <th>
                                        Address
                                    </th>


                                    <th>
                                        Phone No
                                    </th>


                                    <th className="description-column">
                                        Description
                                    </th>


                                    <th className="remarks-column">
                                        Remarks
                                    </th>


                                    <th className="attachments-column">
                                        Attachments
                                    </th>


                                    <th>
                                        Quotation No.
                                    </th>


                                    <th>
                                        Action
                                    </th>

                                </tr>

                            </thead>


                            <tbody>

                                {filteredEnquiries.map(
                                    (
                                        item,
                                        index
                                    ) => {

                                        const timer =
                                            getTimerStatus(
                                                item.id
                                            );


                                        const quotationMade =
                                            String(
                                                item.sales_order_no ||
                                                ""
                                            )
                                                .trim()
                                                .length >
                                            0;


                                        const timerExpiredWithoutQuotation =
                                            timer.state ===
                                                "timeout" &&
                                            !quotationMade;


                                        const rowCellStyle =
                                            timerExpiredWithoutQuotation
                                                ? {

                                                    backgroundColor:
                                                        "#fff1f2",

                                                    color:
                                                        "#7f1d1d",

                                                    borderBottom:
                                                        "1px solid #fecaca"

                                                }
                                                : undefined;


                                        return (

                                            <tr
                                                key={
                                                    item.id
                                                }
                                            >

                                                {/* =================================================
                                                    SL NO
                                                ================================================= */}

                                                <td
                                                    style={{
                                                        ...rowCellStyle,

                                                        textAlign:
                                                            "center",

                                                        verticalAlign:
                                                            "middle",

                                                        width:
                                                            "60px",

                                                        minWidth:
                                                            "60px",

                                                        fontWeight:
                                                            700,

                                                        fontSize:
                                                            "14px"
                                                    }}
                                                >

                                                    {
                                                        filteredEnquiries.length -
                                                        index
                                                    }

                                                </td>


                                                {/* =================================================
                                                    QUOTATION TIMER
                                                ================================================= */}

                                                <td
                                                    style={{
                                                        ...rowCellStyle,

                                                        textAlign:
                                                            "center",

                                                        verticalAlign:
                                                            "middle",

                                                        minWidth:
                                                            "110px"
                                                    }}
                                                >

                                                    {(() => {

                                                        const timerStyle =

                                                            timer.state ===
                                                            "green"

                                                                ? {

                                                                    display:
                                                                        "inline-flex",

                                                                    alignItems:
                                                                        "center",

                                                                    justifyContent:
                                                                        "center",

                                                                    minWidth:
                                                                        "82px",

                                                                    padding:
                                                                        "8px 12px",

                                                                    borderRadius:
                                                                        "8px",

                                                                    backgroundColor:
                                                                        "#e8f5e9",

                                                                    border:
                                                                        "1px solid #81c784",

                                                                    color:
                                                                        "#1b5e20",

                                                                    fontSize:
                                                                        "14px",

                                                                    fontWeight:
                                                                        800,

                                                                    fontFamily:
                                                                        "monospace",

                                                                    letterSpacing:
                                                                        "0.5px",

                                                                    whiteSpace:
                                                                        "nowrap",

                                                                    boxSizing:
                                                                        "border-box"

                                                                }

                                                                : timer.state ===
                                                                  "orange"

                                                                    ? {

                                                                        display:
                                                                            "inline-flex",

                                                                        alignItems:
                                                                            "center",

                                                                        justifyContent:
                                                                            "center",

                                                                        minWidth:
                                                                            "82px",

                                                                        padding:
                                                                            "8px 12px",

                                                                        borderRadius:
                                                                            "8px",

                                                                        backgroundColor:
                                                                            "#fff3cd",

                                                                        border:
                                                                            "1px solid #ffb300",

                                                                        color:
                                                                            "#8a4b00",

                                                                        fontSize:
                                                                            "14px",

                                                                        fontWeight:
                                                                            800,

                                                                        fontFamily:
                                                                            "monospace",

                                                                        letterSpacing:
                                                                            "0.5px",

                                                                        whiteSpace:
                                                                            "nowrap",

                                                                        boxSizing:
                                                                            "border-box"

                                                                    }

                                                                    : timer.state ===
                                                                      "red"

                                                                        ? {

                                                                            display:
                                                                                "inline-flex",

                                                                            alignItems:
                                                                                "center",

                                                                            justifyContent:
                                                                                "center",

                                                                            minWidth:
                                                                                "82px",

                                                                            padding:
                                                                                "8px 12px",

                                                                            borderRadius:
                                                                                "8px",

                                                                            backgroundColor:
                                                                                "#ffebee",

                                                                            border:
                                                                                "1px solid #ef5350",

                                                                            color:
                                                                                "#b71c1c",

                                                                            fontSize:
                                                                                "14px",

                                                                            fontWeight:
                                                                                800,

                                                                            fontFamily:
                                                                                "monospace",

                                                                            letterSpacing:
                                                                                "0.5px",

                                                                            whiteSpace:
                                                                                "nowrap",

                                                                            boxSizing:
                                                                                "border-box"

                                                                        }

                                                                        : timer.state ===
                                                                          "timeout"

                                                                            ? {

                                                                                display:
                                                                                    "inline-flex",

                                                                                alignItems:
                                                                                    "center",

                                                                                justifyContent:
                                                                                    "center",

                                                                                minWidth:
                                                                                    "82px",

                                                                                padding:
                                                                                    "8px 12px",

                                                                                borderRadius:
                                                                                    "8px",

                                                                                backgroundColor:
                                                                                    quotationMade
                                                                                        ? "#f8f9fa"
                                                                                        : "#dc3545",

                                                                                border:
                                                                                    quotationMade
                                                                                        ? "1px solid #adb5bd"
                                                                                        : "2px solid #b02a37",

                                                                                color:
                                                                                    quotationMade
                                                                                        ? "#495057"
                                                                                        : "#ffffff",

                                                                                fontSize:
                                                                                    "12px",

                                                                                fontWeight:
                                                                                    900,

                                                                                fontFamily:
                                                                                    "Arial, sans-serif",

                                                                                whiteSpace:
                                                                                    "nowrap",

                                                                                boxSizing:
                                                                                    "border-box"

                                                                            }

                                                                            : timer.state ===
                                                                              "waiting"

                                                                                ? {

                                                                                    display:
                                                                                        "inline-flex",

                                                                                    alignItems:
                                                                                        "center",

                                                                                    justifyContent:
                                                                                        "center",

                                                                                    minWidth:
                                                                                        "82px",

                                                                                    padding:
                                                                                        "8px 12px",

                                                                                    borderRadius:
                                                                                        "8px",

                                                                                    backgroundColor:
                                                                                        "#f1f3f5",

                                                                                    border:
                                                                                        "1px solid #adb5bd",

                                                                                    color:
                                                                                        "#495057",

                                                                                    fontSize:
                                                                                        "12px",

                                                                                    fontWeight:
                                                                                        800,

                                                                                    fontFamily:
                                                                                        "Arial, sans-serif",

                                                                                    whiteSpace:
                                                                                        "nowrap",

                                                                                    boxSizing:
                                                                                        "border-box"

                                                                                }

                                                                                : {

                                                                                    display:
                                                                                        "inline-flex",

                                                                                    alignItems:
                                                                                        "center",

                                                                                    justifyContent:
                                                                                        "center",

                                                                                    minWidth:
                                                                                        "82px",

                                                                                    padding:
                                                                                        "8px 12px",

                                                                                    borderRadius:
                                                                                        "8px",

                                                                                    backgroundColor:
                                                                                        "#f8f9fa",

                                                                                    border:
                                                                                        "1px solid #dee2e6",

                                                                                    color:
                                                                                        "#6c757d",

                                                                                    fontSize:
                                                                                        "14px",

                                                                                    fontWeight:
                                                                                        700,

                                                                                    fontFamily:
                                                                                        "monospace",

                                                                                    whiteSpace:
                                                                                        "nowrap",

                                                                                    boxSizing:
                                                                                        "border-box"

                                                                                };


                                                        return (

                                                            <span
                                                                style={
                                                                    timerStyle
                                                                }
                                                                title={

                                                                    timer.state ===
                                                                    "waiting"

                                                                        ? "Waiting for the previous enquiry timer to finish"

                                                                        : timer.state ===
                                                                          "timeout"

                                                                            ? quotationMade

                                                                                ? "Quotation was made after the timer expired"

                                                                                : "Quotation time expired and no quotation has been made"

                                                                            : "Time available for quotation preparation"

                                                                }
                                                            >

                                                                {
                                                                    timer.state ===
                                                                    "waiting"

                                                                        ? "WAITING"

                                                                        : timer.label
                                                                }

                                                            </span>

                                                        );

                                                    })()}

                                                </td>


                                                {/* ENQUIRY NO */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    <span className="enquiry-number">

                                                        {
                                                            item.enquiry_no
                                                        }

                                                    </span>

                                                </td>


                                                {/* ADDED BY */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    {
                                                        formatText(
                                                            item.added_by
                                                        )
                                                    }

                                                </td>


                                                {/* SOURCE */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    {
                                                        formatText(
                                                            item.enquiry_source
                                                        )
                                                    }

                                                </td>


                                                {/* ENTERED BY */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    {
                                                        formatText(
                                                            item.entered_by
                                                        )
                                                    }

                                                </td>


                                                {/* ASSIGNED TO */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    {
                                                        formatText(
                                                            item.assigned_to
                                                        )
                                                    }

                                                </td>


                                                {/* BROUGHT BY */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    {
                                                        formatText(
                                                            item.brought_by
                                                        )
                                                    }

                                                </td>


                                                {/* DATE */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    {
                                                        formatDate(
                                                            item.enquiry_date
                                                        )
                                                    }

                                                </td>


                                                {/* CUSTOMER */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    <strong>

                                                        {
                                                            formatText(
                                                                item.customer_name
                                                            )
                                                        }

                                                    </strong>

                                                </td>


                                                {/* ADDRESS */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                    className="address-cell"
                                                >

                                                    {
                                                        formatText(
                                                            item.address
                                                        )
                                                    }

                                                </td>


                                                {/* PHONE */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    {
                                                        formatText(
                                                            item.phone_number
                                                        )
                                                    }

                                                </td>


                                                {/* DESCRIPTION */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                    className="description-cell"
                                                >

                                                    {
                                                        formatText(
                                                            item.description
                                                        )
                                                    }

                                                </td>


                                                {/* REMARKS */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                    className="remarks-cell"
                                                >

                                                    {
                                                        item.remarks
                                                            ? (

                                                                <span
                                                                    title={
                                                                        item.remarks
                                                                    }
                                                                >

                                                                    {
                                                                        formatText(
                                                                            item.remarks
                                                                        )
                                                                    }

                                                                </span>

                                                            )
                                                            : (

                                                                <span className="no-remarks">

                                                                    No Remarks

                                                                </span>

                                                            )
                                                    }

                                                </td>


                                                {/* ATTACHMENTS */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                    className="attachments-cell"
                                                >

                                                    {
                                                        Array.isArray(
                                                            item.attachments
                                                        ) &&
                                                        item.attachments.length >
                                                            0

                                                            ? (

                                                                <div className="attachment-list">

                                                                    {
                                                                        item.attachments.map(
                                                                            (
                                                                                file,
                                                                                attachmentIndex
                                                                            ) => (

                                                                                <a
                                                                                    key={
                                                                                        file.id ||
                                                                                        `${file.file_url}-${attachmentIndex}`
                                                                                    }
                                                                                    href={
                                                                                        file.file_url
                                                                                    }
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="attachment-file"
                                                                                    title={
                                                                                        file.original_name
                                                                                    }
                                                                                >

                                                                                    <span className="attachment-icon">

                                                                                        {
                                                                                            getAttachmentIcon(
                                                                                                file
                                                                                            )
                                                                                        }

                                                                                    </span>


                                                                                    <span className="attachment-name">

                                                                                        {
                                                                                            file.original_name ||
                                                                                            "Attachment"
                                                                                        }

                                                                                    </span>

                                                                                </a>

                                                                            )
                                                                        )
                                                                    }

                                                                </div>

                                                            )

                                                            : (

                                                                <span className="no-attachment">

                                                                    No Files

                                                                </span>

                                                            )
                                                    }

                                                </td>


                                                {/* QUOTATION NO */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    {
                                                        item.sales_order_no

                                                            ? (

                                                                <span
                                                                    className="sales-order-badge"
                                                                    title="Quotation number linked with this enquiry"
                                                                >

                                                                    {
                                                                        item.sales_order_no
                                                                    }

                                                                </span>

                                                            )

                                                            : (

                                                                <span className="not-attached">

                                                                    Not Attached

                                                                </span>

                                                            )
                                                    }

                                                </td>


                                                {/* ACTION */}

                                                <td
                                                    style={
                                                        rowCellStyle
                                                    }
                                                >

                                                    <button
                                                        type="button"
                                                        className="edit-btn"
                                                        onClick={() =>
                                                            handleEdit(
                                                                item
                                                            )
                                                        }
                                                    >

                                                        ✏️ Edit

                                                    </button>

                                                </td>

                                            </tr>

                                        );

                                    }
                                )}

                            </tbody>

                        </table>

                    )}

                </div>


                {/* =================================================
                    MODAL
                ================================================= */}

                {showModal && (

                    <div
                        className="enquiry-modal-overlay"
                        onMouseDown={
                            e => {

                                if (
                                    e.target ===
                                    e.currentTarget
                                ) {

                                    closeModal();

                                }

                            }
                        }
                    >

                        <div className="enquiry-modal">


                            {/* HEADER */}

                            <div className="enquiry-modal-header">

                                <div>

                                    <h2>

                                        {
                                            editing
                                                ? "Edit Enquiry"
                                                : "Add Enquiry"
                                        }

                                    </h2>


                                    <p>

                                        {
                                            editing
                                                ? "Update enquiry details and attachments."
                                                : "Enter the enquiry details and attach documents."
                                        }

                                    </p>

                                </div>


                                <button
                                    type="button"
                                    className="modal-close-btn"
                                    onClick={
                                        closeModal
                                    }
                                    disabled={
                                        saving
                                    }
                                >

                                    ×

                                </button>

                            </div>


                            {/* MESSAGES */}

                            {errorMessage && (

                                <div className="enquiry-alert enquiry-alert-error modal-alert">

                                    {
                                        errorMessage
                                    }

                                </div>

                            )}


                            {successMessage && (

                                <div className="enquiry-alert enquiry-alert-success modal-alert">

                                    {
                                        successMessage
                                    }

                                </div>

                            )}


                            {/* FORM */}

                            <form
                                className="enquiry-form"
                                onSubmit={
                                    handleSubmit
                                }
                            >


                                {/* ENQUIRY NO + DATE */}

                                <div className="form-row">

                                    <div className="form-group">

                                        <label>
                                            Enquiry No.
                                        </label>


                                        <input
                                            type="text"
                                            value={
                                                form.enquiry_no ||
                                                "Loading..."
                                            }
                                            readOnly
                                            className="readonly-input"
                                        />


                                        <small>
                                            Automatically generated.
                                        </small>

                                    </div>


                                    <div className="form-group">

                                        <label>

                                            Date

                                            <span className="required">
                                                *
                                            </span>

                                        </label>


                                        <input
                                            type="date"
                                            name="enquiry_date"
                                            value={
                                                form.enquiry_date
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            required
                                        />

                                    </div>

                                </div>


                                {/* CUSTOMER */}

                                <div className="form-group">

                                    <label>

                                        Customer Name

                                        <span className="required">
                                            *
                                        </span>

                                    </label>


                                    <input
                                        type="text"
                                        name="customer_name"
                                        value={
                                            form.customer_name
                                        }
                                        onChange={
                                            handleChange
                                        }
                                        placeholder="Enter customer name"
                                        required
                                    />

                                </div>


                                {/* ADDRESS */}

                                <div className="form-group">

                                    <label>
                                        Address
                                    </label>


                                    <textarea
                                        name="address"
                                        value={
                                            form.address
                                        }
                                        onChange={
                                            handleChange
                                        }
                                        placeholder="Enter customer address"
                                        rows="3"
                                    />

                                </div>


                                {/* PHONE + SOURCE */}

                                <div className="form-row">

                                    <div className="form-group">

                                        <label>
                                            Phone Number
                                        </label>


                                        <input
                                            type="tel"
                                            name="phone_number"
                                            value={
                                                form.phone_number
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            placeholder="Enter phone number"
                                        />

                                    </div>


                                    <div className="form-group">

                                        <label>

                                            Enquiry Source

                                            <span className="required">
                                                *
                                            </span>

                                        </label>


                                        <select
                                            name="enquiry_source"
                                            value={
                                                form.enquiry_source
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            required
                                        >

                                            <option value="">
                                                Select Source
                                            </option>


                                            <option value="WhatsApp">
                                                WhatsApp
                                            </option>


                                            <option value="Phone">
                                                Phone
                                            </option>


                                            <option value="Email">
                                                Email
                                            </option>


                                            <option value="SMS">
                                                SMS
                                            </option>


                                            <option value="Walk In">
                                                Walk In
                                            </option>

                                        </select>

                                    </div>

                                </div>


                                {/* ADDED BY */}

                                <div className="form-group">

                                    <label>
                                        Added By
                                    </label>


                                    <input
                                        type="text"
                                        value={
                                            form.added_by
                                        }
                                        readOnly
                                        className="readonly-input"
                                    />


                                    <small>
                                        Automatically taken from logged-in user.
                                    </small>

                                </div>


                                {/* ASSIGNED TO + BROUGHT BY */}

                                <div className="form-row">

                                    <div className="form-group">

                                        <label>
                                            Assigned To
                                        </label>


                                        <input
                                            type="text"
                                            name="assigned_to"
                                            value={
                                                form.assigned_to
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            placeholder="Enter assigned person"
                                        />

                                    </div>


                                    <div className="form-group">

                                        <label>
                                            Brought By
                                        </label>


                                        <input
                                            type="text"
                                            name="brought_by"
                                            value={
                                                form.brought_by
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            placeholder="Enter person who brought this enquiry"
                                        />

                                    </div>

                                </div>


                                {/* DESCRIPTION */}

                                <div className="form-group">

                                    <label>
                                        Description
                                    </label>


                                    <textarea
                                        name="description"
                                        value={
                                            form.description
                                        }
                                        onChange={
                                            handleChange
                                        }
                                        placeholder="Enter enquiry description / requirement"
                                        rows="5"
                                    />

                                </div>


                                {/* REMARKS */}

                                <div className="form-group">

                                    <label>
                                        Remarks
                                    </label>


                                    <textarea
                                        name="remarks"
                                        value={
                                            form.remarks
                                        }
                                        onChange={
                                            handleChange
                                        }
                                        placeholder="Add any issue while preparing the quotation, such as missing items, unavailable products, unclear requirements, price issue, or any other problem..."
                                        rows="4"
                                    />


                                    <small>
                                        Use this box to record anything missing or any problem found while making the quotation.
                                    </small>

                                </div>


                                {/* ATTACHMENTS */}

                                <div className="form-group">

                                    <label>
                                        Attachments
                                    </label>


                                    <input
                                        type="file"
                                        multiple
                                        onChange={
                                            handleAttachmentChange
                                        }
                                    />


                                    <small>
                                        You can select multiple files such as PDF, JPG, PNG, Word, Excel and other documents.
                                    </small>


                                    {/* EXISTING ATTACHMENTS */}

                                    {
                                        existingAttachments.length >
                                            0 && (

                                            <div className="selected-attachments">

                                                <div className="attachment-section-title">
                                                    Existing Attachments
                                                </div>


                                                {
                                                    existingAttachments.map(
                                                        (
                                                            file,
                                                            attachmentIndex
                                                        ) => (

                                                            <div
                                                                className="selected-attachment"
                                                                key={
                                                                    file.file_url ||
                                                                    attachmentIndex
                                                                }
                                                            >

                                                                <span className="attachment-icon">

                                                                    {
                                                                        getAttachmentIcon(
                                                                            file
                                                                        )
                                                                    }

                                                                </span>


                                                                <a
                                                                    href={
                                                                        file.file_url
                                                                    }
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >

                                                                    {
                                                                        file.original_name
                                                                    }

                                                                </a>


                                                                <button
                                                                    type="button"
                                                                    className="remove-attachment-btn"
                                                                    onClick={() =>
                                                                        removeExistingAttachment(
                                                                            attachmentIndex
                                                                        )
                                                                    }
                                                                >
                                                                    ×
                                                                </button>

                                                            </div>

                                                        )
                                                    )
                                                }

                                            </div>

                                        )
                                    }


                                    {/* NEW ATTACHMENTS */}

                                    {
                                        attachments.length >
                                            0 && (

                                            <div className="selected-attachments">

                                                <div className="attachment-section-title">
                                                    New Attachments
                                                </div>


                                                {
                                                    attachments.map(
                                                        (
                                                            file,
                                                            attachmentIndex
                                                        ) => (

                                                            <div
                                                                className="selected-attachment"
                                                                key={
                                                                    `${file.name}-${attachmentIndex}`
                                                                }
                                                            >

                                                                <span className="attachment-icon">

                                                                    {
                                                                        getAttachmentIcon(
                                                                            {
                                                                                file_type:
                                                                                    file.type,

                                                                                original_name:
                                                                                    file.name
                                                                            }
                                                                        )
                                                                    }

                                                                </span>


                                                                <span>
                                                                    {
                                                                        file.name
                                                                    }
                                                                </span>


                                                                <button
                                                                    type="button"
                                                                    className="remove-attachment-btn"
                                                                    onClick={() =>
                                                                        removeNewAttachment(
                                                                            attachmentIndex
                                                                        )
                                                                    }
                                                                >
                                                                    ×
                                                                </button>

                                                            </div>

                                                        )
                                                    )
                                                }

                                            </div>

                                        )
                                    }

                                </div>


                                {/* QUOTATION */}

                                <div className="form-group">

                                    <label>
                                        Quotation No.
                                    </label>


                                    <input
                                        type="text"
                                        name="sales_order_no"
                                        value={
                                            form.sales_order_no
                                        }
                                        onChange={
                                            handleChange
                                        }
                                        placeholder="Enter quotation number when available"
                                    />

                                </div>


                                {/* BUTTONS */}

                                <div className="form-actions">

                                    <button
                                        type="button"
                                        className="cancel-btn"
                                        onClick={
                                            closeModal
                                        }
                                        disabled={
                                            saving
                                        }
                                    >
                                        Cancel
                                    </button>


                                    <button
                                        type="submit"
                                        className="save-btn"
                                        disabled={
                                            saving
                                        }
                                    >

                                        {
                                            saving

                                                ? (

                                                    <>

                                                        <span className="button-spinner" />

                                                        Uploading...

                                                    </>

                                                )

                                                : (

                                                    editing
                                                        ? "Update Enquiry"
                                                        : "Save Enquiry"

                                                )
                                        }

                                    </button>

                                </div>

                            </form>

                        </div>

                    </div>

                )}

            </div>

        </>

    );

}