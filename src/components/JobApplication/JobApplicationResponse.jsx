import React, { useState, useEffect } from "react";
import Banner from "../Banner/Banner.jsx";
import "./JobApplicationResponse.css";
import { apiFetch } from "../../api/apiClient";

const JobApplicationResponse = () => {
const [applications, setApplications] = useState([]);

    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});

    useEffect(() => {
    fetchApplications();
}, []);

const fetchApplications = async () => {
    try {
        const response = await apiFetch(
            "/serverphp/get_job_applications.php"
        );

        const data = await response.json();

        if (data.status === "success") {
            setApplications(data.data);
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error(error);
    }
};

    const handleEdit = (application) => {
        setEditingId(application.id);

       setEditData({
    selectionStatus: application.selectionStatus,
    joiningDate: application.joiningDate,
    fixedSalary: application.fixedSalary,
    remarks: application.remarks
});
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        setEditData((prev) => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSave = (id) => {
        setApplications((prev) =>
            prev.map((application) =>
                application.id === id
                    ? {
                        ...application,
                        ...editData
                    }
                    : application
            )
        );

        setEditingId(null);
    };

    const handleCancel = () => {
        setEditingId(null);
    };

    return (
        <>
                    <Banner />
        <div className="applications-container">

            <div className="applications-header">

                <div>
                    <h1>Job Applications</h1>
                    <p>All applicant responses</p>
                </div>

                <div className="application-count">
                    Total: {applications.length}
                </div>

            </div>

            <div className="table-container">

                <table className="applications-table">

                    <thead>
                        <tr>

                            <th>ID</th>
                            <th>Full Name</th>
                            <th>Address</th>
                            <th>Residence City</th>
                            <th>Mobile Number</th>
                            <th>Applied For</th>
                            <th>Resume</th>
                            <th>Photo</th>
                            <th>Email Address</th>
                            <th>Age</th>
                            <th>Work Experience</th>
                            <th>Currently Working</th>
                            <th>Last Drawn Take-Home Salary</th>
                            <th>Expected Salary (CTC)</th>
                            <th>CTC Salary</th>
                            <th>Driving License</th>
                            <th>License Types</th>
                            <th>Own Bike</th>
                            <th>Marital Status</th>

                            {/* ADMIN FIELDS */}
                            <th>Selection Status</th>
                            <th>Joining Date</th>
                            <th>Fixed Salary</th>
                            <th>Remarks</th>
                            <th>Action</th>

                        </tr>
                    </thead>

                    <tbody>

                        {applications.map((application) => {

                            const isEditing =
                                editingId === application.id;

                            return (

                                <tr key={application.id}>

                                    <td>{application.id}</td>

                                    <td>{application.fullName}</td>

                                    <td>{application.address}</td>

                                    <td>{application.residenceCity}</td>

                                    <td>{application.mobileNumber}</td>

                                    <td>{application.appliedFor}</td>

                                    <td>
                                        <button className="file-btn">
                                            View Resume
                                        </button>
                                    </td>

                                    <td>
                                        <button className="file-btn">
                                            View Photo
                                        </button>
                                    </td>

                                    <td>{application.emailAddress}</td>

                                    <td>{application.age}</td>

                                    <td>
                                        {application.totalWorkExperience}
                                        {" "}Years
                                    </td>

                                    <td>
                                        {application.currentlyWorking}
                                    </td>

                                    <td>
                                        ₹ {application.lastDrawnSalary}
                                    </td>

                                    <td>
                                        ₹ {application.expectedSalary}
                                    </td>

                                    <td>
                                        ₹ {application.ctcSalary}
                                    </td>

                                    <td>
                                        {application.drivingLicense}
                                    </td>

                                    <td>
                                       {application.licenseTypes}
                                    </td>

                                    <td>
                                        {application.ownBike}
                                    </td>

                                    <td>
                                        {application.maritalStatus}
                                    </td>


                                    {/* SELECTION STATUS */}

                                    <td>

                                        {isEditing ? (

                                            <select
                                                name="selectionStatus"
                                                value={
                                                    editData.selectionStatus
                                                }
                                                onChange={handleChange}
                                            >

                                                <option value="Pending">
                                                    Pending
                                                </option>

                                                <option value="Shortlisted">
                                                    Shortlisted
                                                </option>

                                                <option value="Selected">
                                                    Selected
                                                </option>

                                                <option value="Rejected">
                                                    Rejected
                                                </option>

                                                <option value="On Hold">
                                                    On Hold
                                                </option>

                                            </select>

                                        ) : (

                                         <span
    className={`status-badge ${(application.selectionStatus || "Pending")
        .toLowerCase()
        .replace(/\s+/g, "-")}`}
>
    {application.selectionStatus || "Pending"}
</span>

                                        )}

                                    </td>


                                    {/* JOINING DATE */}

                                    <td>

                                        {isEditing ? (

                                            <input
                                                type="date"
                                                name="joiningDate"
                                                value={
                                                    editData.joiningDate
                                                }
                                                onChange={handleChange}
                                            />

                                        ) : (

                                            application.joiningDate || "-"

                                        )}

                                    </td>


                                    {/* FIXED SALARY */}

                                    <td>

                                        {isEditing ? (

                                            <input
                                                type="number"
                                                name="fixedSalary"
                                                value={
                                                    editData.fixedSalary
                                                }
                                                onChange={handleChange}
                                            />

                                        ) : (

                                            application.fixedSalary
                                                ? `₹ ${application.fixedSalary}`
                                                : "-"

                                        )}

                                    </td>


                                    {/* REMARKS */}

                                    <td>

                                        {isEditing ? (

                                            <textarea
                                                name="remarks"
                                                value={
                                                    editData.remarks
                                                }
                                                onChange={handleChange}
                                                rows="3"
                                            />

                                        ) : (

                                            application.remarks || "-"

                                        )}

                                    </td>


                                    {/* ACTION */}

                                    <td>

                                        {isEditing ? (

                                            <div className="action-buttons">

                                                <button
                                                    className="save-btn"
                                                    onClick={() =>
                                                        handleSave(
                                                            application.id
                                                        )
                                                    }
                                                >
                                                    Save
                                                </button>

                                                <button
                                                    className="cancel-btn"
                                                    onClick={handleCancel}
                                                >
                                                    Cancel
                                                </button>

                                            </div>

                                        ) : (

                                            <button
                                                className="edit-btn"
                                                onClick={() =>
                                                    handleEdit(
                                                        application
                                                    )
                                                }
                                            >
                                                Edit
                                            </button>

                                        )}

                                    </td>

                                </tr>

                            );

                        })}

                    </tbody>

                </table>

            </div>

        </div>
        </>
    );
};

export default JobApplicationResponse;