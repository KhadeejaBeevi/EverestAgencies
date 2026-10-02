import Banner from "../../../components/Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import "./POEntry.css";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../../components/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FaBars } from "react-icons/fa";
import { apiFetch } from "../../../api/apiClient";

const API = "/serverphp";

const POEntry = () => {

    const navigate = useNavigate();

    const [poList, setPoList] = useState([]);

    const [search, setSearch] = useState("");

    const [isMobile, setIsMobile] = useState(
        window.innerWidth <= 768
    );
    const [showPreview, setShowPreview] = useState(false);

    const [previewImage, setPreviewImage] = useState("");

    const [previewTitle, setPreviewTitle] = useState("");
    const [showFilters, setShowFilters] = useState(false);

    const [checkingAccess, setCheckingAccess] =
        useState(true);

    const [authorized, setAuthorized] =
        useState(false);

    const [userRole, setUserRole] =
        useState("");

    const [editingId, setEditingId] =
        useState(null);

    const [showAddModal, setShowAddModal] =
        useState(false);

    const [statusFilter, setStatusFilter] =
        useState("All");

    const [fromDate, setFromDate] =
        useState("");

    const [toDate, setToDate] =
        useState("");

    const [filterDate, setFilterDate] =
        useState("");

    const canManagePO =
        userRole === "admin" || userRole === "special";
const [newPO, setNewPO] = useState({
    quotation_number: "",
    quotation_date: "",
    quotation_image: null,

    account_status: "",

    area_name: "",
    area_executive: "",

    po_number: "",
    po_date: "",
    po_image: null,
});
    const [invoiceRows, setInvoiceRows] = useState([
        {
            invoice_date: "",
            invoice_number: "",
            invoice_amount: "",
            invoice_image: null,
        },
    ]);
    

    useEffect(() => {

        const unsubscribe =
            onAuthStateChanged(auth, async (user) => {

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

                        fetchPOs();

                        setCheckingAccess(false);

                        return;
                    }

                    const roleRef =
                        doc(db, "roles", user.uid);

                    const roleSnap =
                        await getDoc(roleRef);

                    if (
                        roleSnap.exists() &&
                        roleSnap.data().role === "admin"
                    ) {

                        setAuthorized(true);
                        setUserRole("admin");

                        fetchPOs();

                        setCheckingAccess(false);

                        return;
                    }

                    const userRef =
                        doc(db, "Users", user.uid);

                    const userSnap =
                        await getDoc(userRef);

                    if (
                        userSnap.exists() &&
                        userSnap.data().role === "KsebUser"
                    ) {

                        setAuthorized(true);
                        setUserRole("ksebuser");

                        fetchPOs();

                        setCheckingAccess(false);

                        return;
                    }

                    setAuthorized(false);

                }
                catch (err) {

                    console.error(err);

                    setAuthorized(false);
                }

                setCheckingAccess(false);

            });

        return () => unsubscribe();

    }, []);

    const fetchPOs = async () => {

        try {

            const res =
                await apiFetch(`${API}/get_po.php`);

            const data =
                await res.json();

            setPoList(data);

        }
        catch (err) {

            console.error(err);

        }

    };



    // Reset Form
    const resetForm = () => {

        setNewPO({

            quotation_number: "",
            quotation_date: "",
            account_status: "",

            area_name: "",
            area_executive: "",

            po_number: "",
            po_date: "",

            po_image: null,

         

        });

        setInvoiceRows([
            {
                invoice_date: "",
                invoice_number: "",
                invoice_amount: "",
                invoice_image: null,
            },
        ]);

    };

    // Save PO
    const addPO = async (e) => {

        e.preventDefault();

        try {

            const formData = new FormData();

            Object.keys(newPO).forEach((key) => {

                formData.append(
                    key,
                    newPO[key]
                );

            });

            const invoice = invoiceRows[0];

            formData.append("invoice_number", invoice.invoice_number);
            formData.append("invoice_date", invoice.invoice_date);
            formData.append("invoice_amount", invoice.invoice_amount);

            if (invoice.invoice_image) {
                formData.append("invoice_image", invoice.invoice_image);
            }

            const res = await apiFetch(
                `${API}/add_po.php`,
                {
                    method: "POST",
                    body: formData
                }
            );

            const result = await res.json();

            if (result.success) {

                alert("Purchase Order Added Successfully");

                setShowAddModal(false);

                resetForm();

                fetchPOs();

            }
            else {

                alert(result.message);

            }

        }
        catch (err) {

            console.error(err);

            alert("Unable to save Purchase Order.");

        }

    };


const [editData, setEditData] = useState({
    area_name: "",
    area_executive: "",
    account_status: "",

    quotation_number: "",
    quotation_date: "",
    quotation_image: "",

    po_number: "",
    po_date: "",
    po_image: "",

    invoice_number: "",
    invoice_date: "",
    invoice_amount: "",
    invoice_image: ""
});

    const [editInvoiceRows, setEditInvoiceRows] = useState([]);




  const openEdit = (item) => {
    setEditingId(item.id);

    setEditData({
        quotation_number: item.quotation_number || "",
        quotation_date: item.quotation_date || "",

        account_status: item.account_status || "",

        area_name: item.area_name || "",
        area_executive: item.area_executive || "",

        po_number: item.po_number || "",
        po_date: item.po_date || "",

        quotation_image: null,
        po_image: null,

        invoice_number: item.invoice_number || "",
        invoice_date: item.invoice_date || "",
        invoice_amount: item.invoice_amount || "",
        invoice_image: null
    });

    // Load existing invoice details into the state used by the edit form
    setEditInvoiceRows([
        {
            invoice_date: item.invoice_date || "",
            invoice_number: item.invoice_number || "",
            invoice_amount: item.invoice_amount || "",
            invoice_image: null
        }
    ]);
};



    const handleEditChange = (e) => {

        const {
            name,
            value,
            files
        } = e.target;

        if (name === "po_image") {

            setEditData(prev => ({
                ...prev,
                po_image: files[0]
            }));

            return;
        }

        setEditData(prev => ({
            ...prev,
            [name]: value
        }));


    };




    const handleEditInvoiceChange = (
        index,
        e
    ) => {

        const {
            name,
            value,
            files
        } = e.target;

        const temp = [...editInvoiceRows];

        if (name === "invoice_image") {

            temp[index].invoice_image =
                files[0];

        } else {

            temp[index][name] = value;

        }

        setEditInvoiceRows(temp);

    };




    const addEditInvoiceRow = () => {

        setEditInvoiceRows([
            {
                invoice_date: "",
                invoice_number: "",
                invoice_amount: "",
                invoice_image: null
            }
        ]);

    };



    const removeEditInvoiceRow = (index) => {

        const temp = [...editInvoiceRows];

        temp.splice(index, 1);

        setEditInvoiceRows(temp);

    };




    const formatCurrency = (amount) => {

        if (!amount) return "₹0";

        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(amount);

    };



    const getInvoiceTotal = (po) => {

        if (!po.invoices || !Array.isArray(po.invoices))
            return 0;

        return po.invoices.reduce((total, row) => {

            return (
                total +
                Number(row.invoice_amount || 0)
            );

        }, 0);

    };





    const openPreview = (title, image) => {

        if (!image) return;

        setPreviewTitle(title);

        setPreviewImage(image);

        setShowPreview(true);

    };

    const closePreview = () => {

        setPreviewImage("");

        setPreviewTitle("");

        setShowPreview(false);

    };




    const deletePO = async (id) => {

        const ok = window.confirm(
            "Are you sure you want to delete this Purchase Order?"
        );

        if (!ok) return;

        try {

            const res = await apiFetch(
                `${API}/delete_po.php`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        id
                    })
                }
            );

            const result = await res.json();

            if (result.success) {

                alert("Purchase Order Deleted");

                fetchPOs();

            }
            else {

                alert(result.message);

            }

        }
        catch (err) {

            console.error(err);

            alert("Unable to delete Purchase Order.");

        }

    };




    const openImage = (url) => {

        if (!url) return;

        setPreviewImage(url);

        setShowPreview(true);

    };

    const closeImage = () => {

        setPreviewImage("");

        setShowPreview(false);

    };
const updatePO = async (id) => {
    try {
        const formData = new FormData();

        formData.append("id", id);

        formData.append(
            "quotation_number",
            editData.quotation_number || ""
        );

        formData.append(
            "quotation_date",
            editData.quotation_date || ""
        );

        formData.append(
            "account_status",
            editData.account_status || ""
        );

        formData.append(
            "area_name",
            editData.area_name || ""
        );

        formData.append(
            "area_executive",
            editData.area_executive || ""
        );

        formData.append(
            "po_number",
            editData.po_number || ""
        );

        formData.append(
            "po_date",
            editData.po_date || ""
        );

        // New PO image only if selected
        if (editData.po_image) {
            formData.append(
                "po_image",
                editData.po_image
            );
        }

        // New quotation image only if selected
        if (editData.quotation_image) {
            formData.append(
                "quotation_image",
                editData.quotation_image
            );
        }

        const invoice =
            editInvoiceRows[0] || {};

        formData.append(
            "invoice_number",
            invoice.invoice_number || ""
        );

        formData.append(
            "invoice_date",
            invoice.invoice_date || ""
        );

        formData.append(
            "invoice_amount",
            invoice.invoice_amount || ""
        );

        // New invoice image only if selected
        if (invoice.invoice_image) {
            formData.append(
                "invoice_image",
                invoice.invoice_image
            );
        }

        const res = await apiFetch(
            `${API}/update_po.php`,
            {
                method: "POST",
                body: formData
            }
        );

        const result = await res.json();

        if (result.success) {
            alert(
                "Purchase Order Updated Successfully"
            );

            setEditingId(null);
            fetchPOs();

        } else {
            alert(result.message);
        }

    } catch (err) {
        console.error(err);

        alert(
            "Unable to update Purchase Order."
        );
    }
};

const handleAddChange = (e) => {
    const { name, value, files } = e.target;

    if (
        name === "po_image" ||
        name === "quotation_image"
    ) {
        setNewPO(prev => ({
            ...prev,
            [name]: files[0]
        }));
        return;
    }

    setNewPO(prev => ({
        ...prev,
        [name]: value
    }));
};

    const handleInvoiceChange = (
        index,
        e
    ) => {

        const {
            name,
            value,
            files
        } = e.target;

        const temp =
            [...invoiceRows];

        if (
            name === "invoice_image"
        ) {

            temp[index].invoice_image =
                files[0];

        }
        else {

            temp[index][name] =
                value;

        }

        setInvoiceRows(temp);

    };
    const addInvoiceRow = () => {
        setInvoiceRows([
            ...invoiceRows,
            {
                invoice_date: "",
                invoice_number: "",
                invoice_amount: "",
                invoice_image: null,
            },
        ]);
    };

    const removeInvoiceRow = (index) => {

        const temp =
            [...invoiceRows];

        temp.splice(index, 1);

        setInvoiceRows(temp);

    };

    const formatDate = (date) => {

        if (!date) return "-";

        return new Date(date)
            .toLocaleDateString(
                "en-GB",
                {
                    day: "2-digit",
                    month: "long",
                    year: "numeric"
                }
            )
            .replace(/ /g, " - ");

    };

    const filteredPOs =
        poList.filter(item => {

            const matchesSearch =
                Object.values(item)
                    .join(" ")
                    .toLowerCase()
                    .includes(
                        search.toLowerCase()
                    );

            const matchesDate =
                !filterDate ||
                item.po_date === filterDate;

            return (
                matchesSearch &&
                matchesDate
            );

        });

    useEffect(() => {

        const handleResize = () => {

            setIsMobile(
                window.innerWidth <= 768
            );

        };

        window.addEventListener(
            "resize",
            handleResize
        );

        return () =>
            window.removeEventListener(
                "resize",
                handleResize
            );

    }, []);

    if (checkingAccess) {

        return (
            <div className="po-container">

                <Banner />

                <h2>
                    Checking Access...
                </h2>

            </div>
        );

    }

    if (!authorized) {

        return (

            <div className="po-container">

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
    return (
        <div className="po-container">

            <Banner />
            {
                showPreview && (

                    <div className="modal-overlay">

                        <div
                            className="modal"
                            style={{
                                maxWidth: "900px"
                            }}
                        >

                            <h3>

                                {previewTitle}

                            </h3>

                            <img

                                src={previewImage}

                                alt="Preview"

                                style={{
                                    width: "100%",
                                    borderRadius: "10px"
                                }}

                            />

                            <div className="modal-buttons">

                                <button

                                    className="tender_cancel-btn"

                                    onClick={closePreview}

                                >

                                    Close

                                </button>

                            </div>

                        </div>

                    </div>

                )}
            <div className="po-header">

                <h2>Purchase Order Details</h2>

                {canManagePO && (
                    <button
                        className="po_add-btn"
                        onClick={() => setShowAddModal(true)}
                    >
                        + Add PO
                    </button>
                )}

            </div>

            <div className="po-note">
                <strong>Note :</strong> If this Purchase Order is not related
                to a quotation/tender, leave the quotation details blank.
            </div>

            {/* FILTER MENU */}

            <div className="filter-menu-container">

                <button
                    className="filter-icon-btn"
                    onClick={() =>
                        setShowFilters(!showFilters)
                    }
                >
                    <FaBars />
                </button>

                {showFilters && (

                    <div className="po_filter-dropdown">

                        <div className="po_filter-group">

                            <label>PO Date</label>

                            <input
                                type="date"
                                value={filterDate}
                                onChange={(e) =>
                                    setFilterDate(e.target.value)
                                }
                            />

                        </div>

                        <button
                            className="clear-filter-btn"
                            onClick={() => {

                                setSearch("");
                                setFilterDate("");

                            }}
                        >
                            Clear Filters
                        </button>

                    </div>

                )}

            </div>

            {/* SEARCH */}

            <div className="po_filter-row">

                <div className="po_filter-left">

                    <input
                        type="text"
                        className="po_search-box"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) =>
                            setSearch(e.target.value)
                        }
                    />

                </div>



            </div>

            {/* TABLE */}

            <div className="po_table-wrapper">

                {!isMobile ? (

                    <table className="po-table">

                        <thead>

                            <tr>

                                <th>Sl No</th>

                                <th>Area</th>

                                <th>Executive</th>

                                <th>Account Status</th>

                                <th>Quotation No</th>

                                <th>Quotation Date</th>

                                <th>Quotation Image</th>

                                <th>PO Number</th>

                                <th>PO Date</th>

                                <th>PO Image</th>

                                <th>Invoice No</th>

                                <th>Invoice Date</th>

                                <th>Invoice Amount</th>

                                <th>Invoice Image</th>

                                <th>Action</th>

                            </tr>

                        </thead>

                        <tbody>

                            {filteredPOs.map((item, index) => (

                                <tr key={item.id}>

                                    <td>{index + 1}</td>


                                    <td>
                                        {item.area_name}
                                    </td>

                                    <td>
                                        {item.area_executive}
                                    </td>

                                    <td>
                                        {item.account_status || "-"}
                                    </td>

                                    <td>
                                        {item.quotation_number || "-"}
                                    </td>

                                    <td>
                                        {formatDate(
                                            item.quotation_date
                                        )}
                                    </td>
                                    <td>
                                        {item.quotation_image_url ? (
                                            <img
                                                src={item.quotation_image_url}
                                                alt="Quotation"
                                                className="table-image"
                                                onClick={() =>
                                                    openPreview(
                                                        "Quotation Image",
                                                        item.quotation_image_url
                                                    )
                                                }
                                            />
                                        ) : (
                                            "-"
                                        )}
                                    </td>

                                    <td>
                                        {item.po_number}
                                    </td>

                                    <td>
                                        {formatDate(item.po_date)}
                                    </td>

                                    <td>

                                        {
                                            item.po_image_url
                                                ?

                                                <img

                                                    src={item.po_image_url}

                                                    alt="PO"

                                                    className="table-image"

                                                    onClick={() =>
                                                        openPreview(
                                                            "Purchase Order Image",
                                                            item.po_image_url
                                                        )
                                                    }

                                                />

                                                :

                                                "-"

                                        }

                                    </td>

                                    <td>{item.invoice_number || "-"}</td>

                                    <td>{formatDate(item.invoice_date)}</td>

                                    <td>₹{item.invoice_amount || 0}</td>

                                    <td>
                                        {item.invoice_image_url ? (
                                            <img
                                                src={item.invoice_image_url}
                                                className="table-image"
                                                onClick={() =>
                                                    openPreview(
                                                        "Invoice Image",
                                                        item.invoice_image_url
                                                    )
                                                }
                                            />
                                        ) : (
                                            "-"
                                        )}
                                    </td>
                                    <td>
                                        {canManagePO ? (
                                            <>
                                                <button
                                                    className="po_edit-btn"
                                                    onClick={() => openEdit(item)}
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    className="po_delete-btn"
                                                    onClick={() => deletePO(item.id)}
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        ) : (
                                            "-"
                                        )}
                                    </td>

                                </tr>

                            ))}

                            {filteredPOs.length === 0 && (

                                <tr>

                                    <td colSpan="14">

                                        No Data Found

                                    </td>

                                </tr>

                            )}

                        </tbody>

                    </table>

                ) : (

                    <div className="mobile-po-list">

                        {filteredPOs.map((item) => (

                            <div
                                key={item.id}
                                className="mobile-po-card"
                            >

                                <div className="po_mobile-card-header">

                                    <h4>
                                        {item.po_number}
                                    </h4>

                                    <span>
                                        {item.area_name}
                                    </span>

                                </div>

                                <div className="po_mobile-card-body">

                                    <p>

                                        <strong>
                                            Executive :
                                        </strong>{" "}

                                        {item.area_executive}

                                    </p>

                                    <p>

                                        <strong>
                                            Quotation :
                                        </strong>{" "}

                                        {item.quotation_number || "-"}

                                    </p>

                                    <p>

                                        <strong>
                                            PO Date :
                                        </strong>{" "}

                                        {formatDate(
                                            item.po_date
                                        )}

                                    </p>

                                    <p>

                                        <strong>
                                            Invoice :
                                        </strong>{" "}

                                        ₹
                                        {item.total_invoice_amount || 0}

                                    </p>

                                </div>

                                {canManagePO && (
                                    <div className="mobile-card-actions">

                                        <button
                                            className="po_edit-btn"
                                            onClick={() => openEdit(item)}
                                        >
                                            Edit
                                        </button>

                                        <button
                                            className="po_delete-btn"
                                            onClick={() => deletePO(item.id)}
                                        >
                                            Delete
                                        </button>

                                    </div>
                                )}

                            </div>

                        ))}

                        {filteredPOs.length === 0 && (

                            <div className="no-mobile-data">

                                No Data Found

                            </div>

                        )}

                    </div>

                )}

            </div>

            {/* ADD PO MODAL */}

            {
                showAddModal && (

                    <div className="modal-overlay">

                        <div className="modal large-modal">

                            <h3 className="modal-title">

                                Add Purchase Order

                            </h3>

                            <form onSubmit={addPO}>

                                <div className="form-grid">

                                    <div
                                        style={{
                                            gridColumn: "1 / -1",
                                            background: "#fff7d6",
                                            padding: "12px",
                                            borderRadius: "8px",
                                            marginBottom: "15px"
                                        }}
                                    >

                                        <strong>Note :</strong>

                                        If this Purchase Order is not
                                        related to a quotation/tender,
                                        leave the quotation details blank.

                                    </div>

                                    <div className="form-group">

                                        <label>

                                            Quotation Number

                                        </label>

                                        <input
                                            type="text"
                                            name="quotation_number"
                                            value={newPO.quotation_number}
                                            onChange={handleAddChange}
                                            placeholder="Optional"
                                        />

                                    </div>

                                    <div className="form-group">

                                        <label>

                                            Quotation Date

                                        </label>

                                        <input
                                            type="date"
                                            name="quotation_date"
                                            value={newPO.quotation_date}
                                            onChange={handleAddChange}
                                        />

                                    </div>
                                    <div className="form-group">
                                        <label>Quotation Image</label>
                                        <input
                                            type="file"
                                            name="quotation_image"
                                            accept="image/*"
                                            onChange={handleAddChange}
                                        />
                                    </div>

                                    <div className="form-group">

                                        <label>

                                            Account Status

                                        </label>

                                        <select
                                            name="account_status"
                                            value={newPO.account_status}
                                            onChange={handleAddChange}
                                        >

                                            <option value="">
                                                Select
                                            </option>

                                            <option value="Single Quotation">
                                                Single Quotation
                                            </option>

                                            <option value="Three Quotations">
                                                Three Quotations
                                            </option>

                                        </select>

                                    </div>

                                    <div className="form-group">

                                        <label>

                                            Area Name

                                        </label>

                                        <input
                                            type="text"
                                            name="area_name"
                                            value={newPO.area_name}
                                            onChange={handleAddChange}
                                            required
                                        />

                                    </div>

                                    <div className="form-group">

                                        <label>

                                            Area Executive

                                        </label>

                                        <input
                                            type="text"
                                            name="area_executive"
                                            value={newPO.area_executive}
                                            onChange={handleAddChange}
                                            required
                                        />

                                    </div>
                                    <div className="form-group">
                                        <label>PO Number</label>
                                        <input
                                            type="text"
                                            name="po_number"
                                            value={newPO.po_number}
                                            onChange={handleAddChange}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>PO Date</label>
                                        <input
                                            type="date"
                                            name="po_date"
                                            value={newPO.po_date}
                                            onChange={handleAddChange}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>PO Image</label>
                                        <input
                                            type="file"
                                            name="po_image"
                                            accept="image/*"
                                            onChange={handleAddChange}
                                        />
                                    </div>

                                    {/* Invoice Details */}

                                    <div
                                        style={{
                                            gridColumn: "1 / -1",
                                            marginTop: "20px",
                                            background: "#f8f9fa",
                                            padding: "15px",
                                            borderRadius: "8px"
                                        }}
                                    >
                                        <h4 style={{ marginBottom: "15px" }}>Invoice Details</h4>

                                        <div className="invoice-grid">

                                            <div className="form-group">
                                                <label>Invoice Date</label>
                                                <input
                                                    type="date"
                                                    name="invoice_date"
                                                    value={invoiceRows[0].invoice_date}
                                                    onChange={(e) => handleInvoiceChange(0, e)}
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>Invoice Number</label>
                                                <input
                                                    type="text"
                                                    name="invoice_number"
                                                    value={invoiceRows[0].invoice_number}
                                                    onChange={(e) => handleInvoiceChange(0, e)}
                                                    placeholder="Enter Invoice Number"
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>Invoice Amount (Including Tax)</label>
                                                <input
                                                    type="number"
                                                    name="invoice_amount"
                                                    value={invoiceRows[0].invoice_amount}
                                                    onChange={(e) => handleInvoiceChange(0, e)}
                                                    placeholder="Enter Invoice Amount"
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>Invoice Image</label>
                                                <input
                                                    type="file"
                                                    name="invoice_image"
                                                    accept="image/*"
                                                    onChange={(e) => handleInvoiceChange(0, e)}
                                                />
                                            </div>

                                        </div>
                                    </div>

                                </div>

                                {/* Modal Buttons */}

                                <div className="modal-buttons">

                                    <button
                                        type="submit"
                                        className="tender_save-btn"
                                    >
                                        Save Purchase Order
                                    </button>

                                    <button
                                        type="button"
                                        className="tender_cancel-btn"
                                        onClick={() => {

                                            setShowAddModal(false);
                                            resetForm();

                                        }}
                                    >
                                        Cancel
                                    </button>

                                </div>

                            </form>

                        </div>

                    </div>

                )}


            {
                editingId && (

                    <div className="modal-overlay">

                        <div className="modal large-modal">

                            <h3 className="modal-title">

                                Edit Purchase Order

                            </h3>

                            <div className="form-grid">

                                {/* QUOTATION DETAILS */}

                                <div
                                    style={{
                                        gridColumn: "1 / -1",
                                        background: "#fff7d6",
                                        padding: "12px",
                                        borderRadius: "8px",
                                        marginBottom: "15px"
                                    }}
                                >

                                    <strong>Note :</strong>

                                    Leave quotation details blank if this
                                    PO is not related to any quotation.

                                </div>

                                <div className="form-group">

                                    <label>

                                        Quotation Number

                                    </label>

                                    <input
                                        type="text"
                                        name="quotation_number"
                                        value={editData.quotation_number}
                                        onChange={handleEditChange}
                                    />

                                </div>

                                <div className="form-group">

                                    <label>

                                        Quotation Date

                                    </label>

                                    <input
                                        type="date"
                                        name="quotation_date"
                                        value={editData.quotation_date}
                                        onChange={handleEditChange}
                                    />

                                </div>
                                <div className="form-group">
    <label>Quotation Image</label>

    <input
        type="file"
        name="quotation_image"
        accept="image/*"
        onChange={handleEditChange}
    />
</div>

                                <div className="form-group">

                                    <label>

                                        Account Status

                                    </label>

                                    <select
                                        name="account_status"
                                        value={editData.account_status}
                                        onChange={handleEditChange}
                                    >

                                        <option value="">
                                            Select
                                        </option>

                                        <option value="Single Quotation">
                                            Single Quotation
                                        </option>

                                        <option value="Three Quotations">
                                            Three Quotations
                                        </option>

                                    </select>

                                </div>

                                {/* AREA DETAILS */}

                                <div className="form-group">

                                    <label>

                                        Area Name

                                    </label>

                                    <input
                                        type="text"
                                        name="area_name"
                                        value={editData.area_name}
                                        onChange={handleEditChange}
                                    />

                                </div>

                                <div className="form-group">

                                    <label>

                                        Area Executive

                                    </label>

                                    <input
                                        type="text"
                                        name="area_executive"
                                        value={editData.area_executive}
                                        onChange={handleEditChange}
                                    />

                                </div>

                                {/* PO DETAILS */}

                                <div className="form-group">

                                    <label>

                                        PO Number

                                    </label>

                                    <input
                                        type="text"
                                        name="po_number"
                                        value={editData.po_number}
                                        onChange={handleEditChange}
                                    />

                                </div>

                                <div className="form-group">

                                    <label>

                                        PO Date

                                    </label>

                                    <input
                                        type="date"
                                        name="po_date"
                                        value={editData.po_date}
                                        onChange={handleEditChange}
                                    />

                                </div>

                                <div className="form-group">

                                    <label>

                                        Replace PO Image

                                    </label>

                                    <input
                                        type="file"
                                        name="po_image"
                                        onChange={handleEditChange}
                                    />

                                </div>

                                {/* Invoice Details */}

                                <div
                                    style={{
                                        gridColumn: "1 / -1",
                                        marginTop: "20px",
                                        background: "#f8f9fa",
                                        padding: "15px",
                                        borderRadius: "8px"
                                    }}
                                >
                                    <h4 style={{ marginBottom: "15px" }}>Invoice Details</h4>

                                    <div className="invoice-grid">

                                        <div className="form-group">
                                            <label>Invoice Date</label>
                                            <input
                                                type="date"
                                                name="invoice_date"
                                               value={editInvoiceRows[0]?.invoice_date || ""}
                                               onChange={(e)=>handleEditInvoiceChange(0,e)}
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Invoice Number</label>
                                            <input
                                                type="text"
                                                name="invoice_number"
                                                value={editInvoiceRows[0]?.invoice_number || ""}
                                               onChange={(e)=>handleEditInvoiceChange(0,e)}
                                                placeholder="Enter Invoice Number"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Invoice Amount (Including Tax)</label>
                                            <input
                                                type="number"
                                                name="invoice_amount"
                                             value={editInvoiceRows[0]?.invoice_amount || ""}
                                               onChange={(e)=>handleEditInvoiceChange(0,e)}
                                                placeholder="Enter Invoice Amount"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Invoice Image</label>
                                            <input
                                                type="file"
                                                name="invoice_image"
                                                accept="image/*"
                                                onChange={(e)=>handleEditInvoiceChange(0,e)}
                                            />
                                        </div>

                                    </div>
                                </div>



                            </div>

                            <div className="modal-buttons">

                                <button
                                    className="tender_save-btn"
                                    onClick={() =>
                                        updatePO(editingId)
                                    }
                                >

                                    Update

                                </button>

                                <button
                                    className="tender_cancel-btn"
                                    onClick={() =>
                                        setEditingId(null)
                                    }
                                >

                                    Cancel

                                </button>

                            </div>

                        </div>

                    </div>

                )}
        </div>
    );

};

export default POEntry;

