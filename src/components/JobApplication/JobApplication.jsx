import React, { useState } from "react";
import Banner from "../Banner/Banner.jsx";
import "./JobApplication.css";
import { apiFetch } from "../../api/apiClient";

const JobApplication = () => {
    const [formData, setFormData] = useState({
        fullName: "",
        address: "",
        residenceCity: "",
        mobileNumber: "",
        appliedFor: "",
        emailAddress: "",
        age: "",
        totalWorkExperience: "",
        currentlyWorking: "",
        lastDrawnSalary: "",
        expectedSalary: "",
        ctcSalary: "",
        drivingLicense: "",
        licenseTypes: [],
        ownBike: "",
        maritalStatus: "",

  
    });

    const [resume, setResume] = useState(null);
    const [photo, setPhoto] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value
        }));
    };

    const handleLicenseChange = (e) => {
        const { value, checked } = e.target;

        setFormData((prev) => ({
            ...prev,
            licenseTypes: checked
                ? [...prev.licenseTypes, value]
                : prev.licenseTypes.filter((license) => license !== value)
        }));
    };

const handleSubmit = async (e) => {
    e.preventDefault();

    const data = new FormData();

    Object.keys(formData).forEach((key) => {
        if (key === "licenseTypes") {
            data.append(key, formData[key].join(", "));
        } else {
            data.append(key, formData[key]);
        }
    });

    data.append("resume", resume);
    data.append("photo", photo);

    try {
        const response = await apiFetch(
            "/serverphp/job_application.php",
            {
                method: "POST",
                body: data,
            }
        );

        const result = await response.json();

        if (result.status === "success") {
            alert("Application submitted successfully!");

            setFormData({
                fullName: "",
                address: "",
                residenceCity: "",
                mobileNumber: "",
                appliedFor: "",
                emailAddress: "",
                age: "",
                totalWorkExperience: "",
                currentlyWorking: "",
                lastDrawnSalary: "",
                expectedSalary: "",
                ctcSalary: "",
                drivingLicense: "",
                licenseTypes: [],
                ownBike: "",
                maritalStatus: "",
            });

            setResume(null);
            setPhoto(null);
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error(error);
        alert("Server Error");
    }
};

    return (
        <>
                        <Banner />

        <div className="job-application-container">

            <div className="job-application-card">

                {/* HEADER */}
                <div className="application-header">
                    <h1>Job Application Form</h1>
                    <p>Please fill in all the required details carefully</p>
                </div>

                <form onSubmit={handleSubmit}>

                    {/* PERSONAL DETAILS */}
                    <div className="form-section">
                        <h2>Personal Details</h2>

                        <div className="form-grid">

                            <div className="form-group">
                                <label>
                                    Full Name <span>*</span>
                                </label>

                                <input
                                    type="text"
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Residence City <span>*</span>
                                </label>

                                <input
                                    type="text"
                                    name="residenceCity"
                                    value={formData.residenceCity}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="form-group full-width">
                                <label>
                                    Address <span>*</span>
                                </label>

                                <textarea
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    rows="3"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Mobile Number <span>*</span>
                                </label>

                                <input
                                    type="tel"
                                    name="mobileNumber"
                                    value={formData.mobileNumber}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Email Address <span>*</span>
                                </label>

                                <input
                                    type="email"
                                    name="emailAddress"
                                    value={formData.emailAddress}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Age <span>*</span>
                                </label>

                                <input
                                    type="number"
                                    name="age"
                                    value={formData.age}
                                    onChange={handleChange}
                                    min="18"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Marital Status <span>*</span>
                                </label>

                                <select
                                    name="maritalStatus"
                                    value={formData.maritalStatus}
                                    onChange={handleChange}
                                    required
                                >
                                    <option value="">Select Status</option>
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Divorced">Divorced</option>
                                    <option value="Widowed">Widowed</option>
                                </select>
                            </div>

                        </div>
                    </div>

                    {/* JOB DETAILS */}
                    <div className="form-section">

                        <h2>Job Details</h2>

                        <div className="form-grid">

                            <div className="form-group">
                                <label>
                                    Applied For <span>*</span>
                                </label>

                                <input
                                    type="text"
                                    name="appliedFor"
                                    value={formData.appliedFor}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Total Work Experience (Years) <span>*</span>
                                </label>

                                <input
                                    type="number"
                                    name="totalWorkExperience"
                                    value={formData.totalWorkExperience}
                                    onChange={handleChange}
                                    min="0"
                                    step="0.1"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Currently Working? <span>*</span>
                                </label>

                                <div className="radio-group">

                                    <label>
                                        <input
                                            type="radio"
                                            name="currentlyWorking"
                                            value="Yes"
                                            checked={formData.currentlyWorking === "Yes"}
                                            onChange={handleChange}
                                            required
                                        />
                                        Yes
                                    </label>

                                    <label>
                                        <input
                                            type="radio"
                                            name="currentlyWorking"
                                            value="No"
                                            checked={formData.currentlyWorking === "No"}
                                            onChange={handleChange}
                                        />
                                        No
                                    </label>

                                </div>
                            </div>

                            <div className="form-group">
                                <label>
                                    Last Drawn Take-Home Salary
                                </label>

                                <input
                                    type="number"
                                    name="lastDrawnSalary"
                                    value={formData.lastDrawnSalary}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Expected Salary (CTC)
                                </label>

                                <input
                                    type="number"
                                    name="expectedSalary"
                                    value={formData.expectedSalary}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    CTC Salary
                                    <small>
                                        Cost to Company - Net Total Salary
                                    </small>
                                </label>

                                <input
                                    type="number"
                                    name="ctcSalary"
                                    value={formData.ctcSalary}
                                    onChange={handleChange}
                                />
                            </div>

                        </div>
                    </div>

                    {/* DRIVING & VEHICLE */}
                    <div className="form-section">

                        <h2>Driving & Vehicle Details</h2>

                        <div className="form-group">

                            <label>
                                Do You Own a Driving License? <span>*</span>
                            </label>

                            <div className="radio-group">

                                <label>
                                    <input
                                        type="radio"
                                        name="drivingLicense"
                                        value="Yes"
                                        checked={formData.drivingLicense === "Yes"}
                                        onChange={handleChange}
                                        required
                                    />
                                    Yes
                                </label>

                                <label>
                                    <input
                                        type="radio"
                                        name="drivingLicense"
                                        value="No"
                                        checked={formData.drivingLicense === "No"}
                                        onChange={handleChange}
                                    />
                                    No
                                </label>

                            </div>

                        </div>

                        {formData.drivingLicense === "Yes" && (

                            <div className="form-group license-options">

                                <label>
                                    If yes, what all licenses do you have?
                                    <small>Tick all applicable</small>
                                </label>

                                <div className="checkbox-group">

                                    <label>
                                        <input
                                            type="checkbox"
                                            value="Two Wheeler"
                                            checked={formData.licenseTypes.includes("Two Wheeler")}
                                            onChange={handleLicenseChange}
                                        />
                                        Two Wheeler
                                    </label>

                                    <label>
                                        <input
                                            type="checkbox"
                                            value="LMV / Car"
                                            checked={formData.licenseTypes.includes("LMV / Car")}
                                            onChange={handleLicenseChange}
                                        />
                                        LMV / Car
                                    </label>

                                    <label>
                                        <input
                                            type="checkbox"
                                            value="Heavy Vehicle"
                                            checked={formData.licenseTypes.includes("Heavy Vehicle")}
                                            onChange={handleLicenseChange}
                                        />
                                        Heavy Vehicle
                                    </label>

                                    <label>
                                        <input
                                            type="checkbox"
                                            value="Other"
                                            checked={formData.licenseTypes.includes("Other")}
                                            onChange={handleLicenseChange}
                                        />
                                        Other
                                    </label>

                                </div>

                            </div>

                        )}

                        <div className="form-group">

                            <label>
                                Do You Own a Bike? <span>*</span>
                            </label>

                            <div className="radio-group">

                                <label>
                                    <input
                                        type="radio"
                                        name="ownBike"
                                        value="Yes"
                                        checked={formData.ownBike === "Yes"}
                                        onChange={handleChange}
                                        required
                                    />
                                    Yes
                                </label>

                                <label>
                                    <input
                                        type="radio"
                                        name="ownBike"
                                        value="No"
                                        checked={formData.ownBike === "No"}
                                        onChange={handleChange}
                                    />
                                    No
                                </label>

                            </div>

                        </div>

                    </div>

                    {/* DOCUMENTS */}
                    <div className="form-section">

                        <h2>Upload Documents</h2>

                        <div className="form-grid">

                            <div className="form-group">

                                <label>
                                    Upload Resume <span>*</span>
                                </label>

                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    onChange={(e) => setResume(e.target.files[0])}
                                    required
                                />

                                <small>
                                    Accepted formats: PDF, DOC, DOCX
                                </small>

                            </div>

                            <div className="form-group">

                                <label>
                                    Upload Photo <span>*</span>
                                </label>

                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setPhoto(e.target.files[0])}
                                    required
                                />

                                <small>
                                    Accepted formats: JPG, JPEG, PNG
                                </small>

                            </div>

                        </div>

                    </div>

                    

                    {/* SUBMIT */}
                    <div className="submit-container">

                        <button
                            type="submit"
                            className="submit-btn"
                        >
                            Submit Application
                        </button>

                    </div>

                </form>

            </div>

        </div>
        </>
    );
};

export default JobApplication;