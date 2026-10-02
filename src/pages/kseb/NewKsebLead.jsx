import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import "./NewKsebLead.css";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { apiFetch } from "../../api/apiClient";

const API = "/serverphp";

export default function NewKsebLead() {



    const [showModal, setShowModal] = useState(false);
    const [showRemarksModal, setShowRemarksModal] = useState(false);
    const [selectedContractor, setSelectedContractor] = useState(null);
    const [remarks, setRemarks] = useState("");
    const [remarksList, setRemarksList] = useState([]);
    const [remarkDate, setRemarkDate] = useState("");
    const [remarkUser, setRemarkUser] = useState("");
    const [followupDate, setFollowupDate] = useState("");
    const [userRole, setUserRole] = useState("");
    const [isEdit, setIsEdit] = useState(false);
    const [editId, setEditId] = useState(null);

    const [formData, setFormData] = useState({
        firm_name: "",
        contractor_name: "",
        decision_maker: "",
        address: "",
        phone: "",
        email: "",
        sales_executive: "",
        sales_coordinator: "",
        status: "NEW",

    });

    const [contractors, setContractors] = useState([]);

    // 🔄 FETCH DATA
    const fetchData = () => {
        apiFetch(`${API}/get_kseb_contractor.php`)
            .then((res) => res.text())
            .then((text) => {
                console.log("RAW RESPONSE:", text);
                const res = JSON.parse(text);

                if (res.status === "success") {
                    setContractors(res.data);
                }
            })
            .catch((err) => console.error("FETCH ERROR:", err));
    };


    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const docRef = doc(db, "Users", user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const userData = docSnap.data();

                    setRemarkUser(
                        `${userData.firstName || ""} ${userData.lastName || ""}`.trim()
                    );
                }
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {

        const unsubscribe = onAuthStateChanged(auth, async (user) => {

            if (!user) {
                setUserRole("");
                return;
            }

            try {

                // ================= ADMIN ROLE =================

                const roleRef = doc(db, "roles", user.uid);

                const roleSnap = await getDoc(roleRef);

                if (roleSnap.exists()) {

                    const adminRole = roleSnap.data().role || "";

                    if (adminRole.toLowerCase().trim() === "admin") {

                        setUserRole("admin");

                        return;

                    }

                }

                // ================= USERS COLLECTION ROLE =================

                const userRef = doc(db, "Users", user.uid);

                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {

                    const userData = userSnap.data();

                    console.log("USER DATA:", userData);

                    setUserRole(userData.role || "");

                }

            } catch (err) {

                console.log(err);

            }

        });

        return () => unsubscribe();

    }, []);

    useEffect(() => {
        fetchData();
    }, []);

    // 🔁 INPUT CHANGE
    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };
    const handleEdit = (contractor) => {
        setIsEdit(true);
        setEditId(contractor.id);

        setFormData({
            firm_name: contractor.firm_name || "",
            contractor_name: contractor.contractor_name || "",
            decision_maker: contractor.decision_maker || "",
            address: contractor.address || "",
            phone: contractor.phone || "",
            email: contractor.email || "",
            sales_executive: contractor.sales_executive || "",
            sales_coordinator: contractor.sales_coordinator || "",
            status: contractor.status || "NEW",
        });

        setShowModal(true);
    };
    // 🗑 DELETE
    const handleDelete = (id) => {
        if (!window.confirm("Are you sure you want to delete this lead?")) return;

        apiFetch(`${API}/delete_kseb_contractor.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ id }),
        })
            .then((res) => res.json())
            .then((res) => {
                if (res.status === "success") {
                    alert("Deleted successfully");
                    setContractors((prev) => prev.filter((c) => c.id !== id));
                } else {
                    alert("Delete failed");
                }
            })
            .catch((err) => {
                console.error(err);
                alert("Server error");
            });
    };
    const handleLeadStageChange = (id, lead_stage) => {

        apiFetch(`${API}/update_kseb_status.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                id,
                lead_stage
            }),
        })
            .then((res) => res.json())
            .then((res) => {

                if (res.status === "success") {

                    setContractors((prev) =>
                        prev.map((c) =>
                            c.id === id
                                ? { ...c, lead_stage }
                                : c
                        )
                    );

                } else {
                    alert("Lead stage update failed");
                }

            })
            .catch((err) => {
                console.error(err);
                alert("Server error");
            });
    };


    const openRemarks = (contractor) => {
        setSelectedContractor(contractor);
        setShowRemarksModal(true);

        // reset only required fields
        setRemarks("");
        setFollowupDate("");
        setRemarkDate("");

        // ❌ REMOVE THIS LINE
        // setRemarkUser("");

        fetchRemarks(contractor.id);
    };

    const fetchRemarks = (id) => {
        apiFetch(`${API}/get_remark.php?id=` + id)
            .then(res => res.json())
            .then(res => {
                if (res.status === "success") {
                    setRemarksList(res.data);
                }
            })
            .catch(err => console.error(err));
    };

    const handleSaveRemark = () => {
        console.log("REMARK VALUE:", remarks);

        if (!remarks || remarks.trim().length === 0) {
            alert("Enter remark");
            return;
        }

        apiFetch(`${API}/add_remark.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contractor_id: selectedContractor.id,
                user_name: remarkUser,
                remark: remarks.trim(),
                followup_date: followupDate
            }),
        })
            .then(res => res.json())
            .then(res => {
                if (res.status === "success") {
                    setRemarks("");
                    setFollowupDate("");
                    fetchRemarks(selectedContractor.id);
                } else {
                    alert("Save failed");
                }
            })
            .catch(err => {
                console.error(err);
                alert("Server error");
            });
    };
    // 💾 SAVE
    const handleSubmit = () => {
        if (!formData.contractor_name) {
            alert("Contractor Name required");
            return;
        }
        const payload = isEdit
            ? { id: editId, ...formData }
            : formData;

        console.log("BEFORE FETCH");
        console.log("PAYLOAD:", payload);

        apiFetch(
            `${API}/${isEdit ? "update_kseb_contractor.php" : "add_kseb_contractor.php"}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            }
        )
            .then((res) => {
                console.log("FETCH COMPLETED", res);
                return res.text();
            })
            .then((text) => {
                console.log("SERVER RESPONSE:", text);

                try {
                    const res = JSON.parse(text);
                    console.log("PARSED RESPONSE:", res);

                    if (res.status === "success") {

                        alert(
                            isEdit
                                ? "Updated Successfully"
                                : "Saved Successfully"
                        );

                        fetchData();

                        setFormData({
                            firm_name: "",
                            contractor_name: "",
                            decision_maker: "",
                            address: "",
                            phone: "",
                            email: "",
                            sales_executive: "",
                            sales_coordinator: "",
                            status: "NEW",
                        });

                        setIsEdit(false);
                        setEditId(null);
                        setShowModal(false);   // ← closes the popup after OK is clicked

                    } else {
                        alert(
                            isEdit
                                ? "Update failed"
                                : "Save failed"
                        );
                    }
                } catch (e) {
                    console.error("JSON PARSE ERROR:", e);
                }
            })
            .catch((err) => {
                console.error("FETCH ERROR:", err);
                alert("Fetch failed");
            });

        console.log("AFTER FETCH");
    };

    return (
        <div className="lead-page">
            <Banner />

            <div className="top-bar">
                <button className="new-btn" onClick={() => setShowModal(true)}>
                    + New Lead
                </button>

                <h2 className="center-title">KSEB NEW LEADS</h2>
                <div className="right-space"></div>
            </div>

            {/* TABLE */}
            <div className="table-container">

                <table>
                    <colgroup>
                        <col className="col-sno" />
                        <col className="col-firm" />
                        <col className="col-contractor" />
                        <col className="col-decision" />
                        <col className="col-address" />
                        <col className="col-phone" />
                        <col className="col-email" />
                        <col className="col-executive" />
                        <col className="col-coordinator" />
                        <col className="col-stage" />
                        <col className="col-remark" />
                        <col className="col-competitor" />
                        <col className="col-edit" />
                        <col className="col-delete" />
                    </colgroup>


                    <thead>
                        <tr>
                            <th>S.No</th>
                            <th>Firm Name</th>
                            <th>Contractor Name</th>
                            <th>Decision Maker</th>
                            <th>Address</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Sales Executive</th>
                            <th>Sales Coordinator</th>
                            <th>Lead Stage</th>
                            <th>Latest Remark</th>
                            <th>Competitors</th>
                            <th>Edit</th>
                            <th>Delete</th>
                        </tr>
                    </thead>

                    <tbody>
                        {contractors.length > 0 ? (
                            contractors.map((c, index) => (
                                <tr key={c.id}>
                                    <td>{index + 1}</td>
                                    <td>{c.firm_name}</td>
                                    <td>
                                        <span
                                            className="clickable-name"
                                            onClick={() => openRemarks(c)}
                                        >
                                            {c.contractor_name}
                                        </span>
                                    </td>
                                    <td>{c.decision_maker}</td>
                                    <td>{c.address}</td>
                                    <td>{c.phone}</td>
                                    <td>{c.email}</td>
                                    <td>
                                        {c.sales_executive || "-"}
                                    </td>

                                    <td>
                                        {c.sales_coordinator || "-"}
                                    </td>
                                    <td>
                                        <select
                                            value={c.lead_stage || ""}
                                            onChange={(e) =>
                                                handleLeadStageChange(c.id, e.target.value)
                                            }
                                            className="status-dropdown"
                                        >
                                            <option value="">Select</option>

                                            <option>Rate Enquiry</option>
                                            <option>Quotation </option>
                                            <option>FollowUp</option>
                                            <option>Call Back</option>

                                        </select>
                                    </td>
                                    <td className="remarks-preview">
                                        {c.latest_remark || "-"}
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={c.competitors || ""}
                                            placeholder="Competitor"
                                            className="competitor-input"
                                            onChange={(e) => {

                                                const value = e.target.value;

                                                setContractors((prev) =>
                                                    prev.map((item) =>
                                                        item.id === c.id
                                                            ? { ...item, competitors: value }
                                                            : item
                                                    )
                                                );
                                            }}
                                            onBlur={(e) => {

                                                apiFetch(`${API}/update_kseb_competitor.php`, {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type": "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                        id: c.id,
                                                        competitors: e.target.value
                                                    }),
                                                });

                                            }}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            className="edit-btn"
                                            onClick={() => handleEdit(c)}
                                        >
                                            Edit
                                        </button>
                                    </td>
                                    <td>
                                        <button
                                            className="delete-btn"
                                            onClick={() => handleDelete(c.id)}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="14" style={{ textAlign: "center" }}>
                                    No Data
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mobile-view">
                {contractors.length > 0 ? (
                    contractors.map((c, index) => (
                        <div className="lead-card" key={c.id}>
                            <div className="card-header">
                                <span className="card-number">#{index + 1}</span>

                                <span
                                    className="clickable-name card-title"
                                    onClick={() => openRemarks(c)}
                                >
                                    {c.contractor_name}
                                </span>
                            </div>

                            <p><strong>Firm:</strong> {c.firm_name || "-"}</p>
                            <p><strong>Decision Maker:</strong> {c.decision_maker || "-"}</p>
                            <p>
                                <strong>Phone:</strong>{' '}
                                {c.phone ? (
                                    <a href={`tel:${c.phone}`} className="phone-link">
                                        {c.phone}
                                    </a>
                                ) : (
                                    '-'
                                )}
                            </p>
                            <p><strong>Email:</strong> {c.email || "-"}</p>
                            <p><strong>Executive:</strong> {c.sales_executive || "-"}</p>
                            <p><strong>Coordinator:</strong> {c.sales_coordinator || "-"}</p>

                            <div className="card-section">
                                <strong>Lead Stage</strong>
                                <select
                                    value={c.lead_stage || ""}
                                    onChange={(e) =>
                                        handleLeadStageChange(c.id, e.target.value)
                                    }
                                    className="status-dropdown"
                                >
                                    <option value="">Select</option>
                                    <option>Rate Enquiry</option>
                                    <option>Quotation</option>
                                    <option>FollowUp</option>
                                    <option>Call Back</option>
                                </select>
                            </div>

                            <div className="card-section">
                                <p>
                                    <strong>Latest Remark:</strong> {c.latest_remark || "-"}
                                </p>
                            </div>

                            <div className="card-section">
                                <strong>Competitor</strong>
                                <input
                                    type="text"
                                    value={c.competitors || ""}
                                    placeholder="Competitor"
                                    className="competitor-input"
                                    onChange={(e) => {
                                        const value = e.target.value;

                                        setContractors((prev) =>
                                            prev.map((item) =>
                                                item.id === c.id
                                                    ? { ...item, competitors: value }
                                                    : item
                                            )
                                        );
                                    }}
                                    onBlur={(e) => {
                                        apiFetch(`${API}/update_kseb_competitor.php`, {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                            },
                                            body: JSON.stringify({
                                                id: c.id,
                                                competitors: e.target.value,
                                            }),
                                        });
                                    }}
                                />
                            </div>

                            <div className="card-buttons">
                                <button
                                    className="edit-btn"
                                    onClick={() => handleEdit(c)}
                                >
                                    Edit
                                </button>

                                <button
                                    className="delete-btn"
                                    onClick={() => handleDelete(c.id)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="no-data">No Data</p>
                )}
            </div>
            {showRemarksModal && (
                <div className="modal-overlay">
                    <div className="modal-box remarks-modal">

                        <button
                            className="close-icon"
                            onClick={() => setShowRemarksModal(false)}
                        >
                            ×
                        </button>

                        <h2>
                            Remarks - {selectedContractor?.contractor_name}
                        </h2>

                        <div className="remarks-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>SL</th>
                                        <th>Date</th>
                                        <th>Name</th>
                                        <th>Note</th>
                                        <th>Follow-up</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {remarksList.map((r, i) => (
                                        <tr key={i}>
                                            <td>{i + 1}</td>
                                            <td>{r.created_at?.split(" ")[0]}</td>
                                            <td>{r.user_name}</td>
                                            <td>{r.remark}</td>
                                            <td>{r.followup_date || "-"}</td>
                                        </tr>
                                    ))}

                                    {/* ADD NEW ROW */}
                                    <tr className="new-row">
                                        <td>—</td>

                                        <td>
                                            <input
                                                type="date"
                                                value={remarkDate}
                                                onChange={(e) => setRemarkDate(e.target.value)}
                                            />
                                        </td>

                                        <td>
                                            <input
                                                placeholder="User"
                                                value={remarkUser}
                                                readOnly
                                            />
                                        </td>

                                        <td>
                                            <input
                                                placeholder="Enter note..."
                                                value={remarks}
                                                onChange={(e) => setRemarks(e.target.value)}
                                            />
                                        </td>

                                        <td>
                                            <input
                                                type="date"
                                                value={followupDate}
                                                onChange={(e) => setFollowupDate(e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <button className="save-btn" onClick={handleSaveRemark}>
                                Save Remark
                            </button>
                        </div>

                    </div>
                </div>
            )}
            {/* MODAL */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-box">
                        <div className="modal-header">
                            <h2>
                                {isEdit ? "Edit Contractor Lead" : "Create Contractor Lead"}
                            </h2>
                        </div>

                        <div className="modal-body">
                            <h3 className="section-title">Basic Information</h3>

                            <div className="form-group">
                                <label>Firm Name</label>
                                <input
                                    name="firm_name"
                                    value={formData.firm_name}
                                    onChange={handleChange}
                                    placeholder="Enter firm name"
                                />
                            </div>

                            <div className="form-group">
                                <label>Contractor Name *</label>
                                <input
                                    name="contractor_name"
                                    value={formData.contractor_name}
                                    onChange={handleChange}
                                    placeholder="Enter contractor name"
                                />
                            </div>

                            <div className="form-group">
                                <label>Decision Maker</label>
                                <input
                                    name="decision_maker"
                                    value={formData.decision_maker}
                                    onChange={handleChange}
                                    placeholder="Enter decision maker"
                                />
                            </div>

                            <div className="form-group">
                                <label>Address</label>
                                <textarea
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    placeholder="Enter address"
                                />
                            </div>

                            <h3 className="section-title">Contact Details</h3>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Phone</label>
                                    <input
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        placeholder="Phone"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Email</label>
                                    <input
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="Email"
                                    />
                                </div>
                            </div>

                            <h3 className="section-title">Sales Info</h3>

                            <div className="form-group">
                                <label>Sales Executive</label>
                                <input
                                    list="executives"
                                    name="sales_executive"
                                    value={formData.sales_executive}
                                    onChange={handleChange}
                                    placeholder="Select or type Executive"
                                />

                                <datalist id="executives">
                                    <option value="LIBIN" />
                                    <option value="THOMSON" />
                                    <option value="SREELAL" />
                                </datalist>
                            </div>

                            <div className="form-group">
                                <label>Sales Coordinator</label>
                                <input
                                    list="coordinators"
                                    name="sales_coordinator"
                                    value={formData.sales_coordinator}
                                    onChange={handleChange}
                                    placeholder="Select or type Coordinator"
                                />

                                <datalist id="coordinators">
                                    <option value="REVATHY" />
                                    <option value="SUMI" />
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                >
                                    <option value="NEW">NEW</option>
                                    <option value="CONTACTED">CONTACTED</option>
                                    <option value="FOLLOWUP">FOLLOWUP</option>
                                    <option value="CONVERTED">CONVERTED</option>
                                </select>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button
                                className="cancel-btn"
                                onClick={() => setShowModal(false)}
                            >
                                Cancel
                            </button>

                            <button className="save-btn" onClick={handleSubmit}>
                                {isEdit ? "Update" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}