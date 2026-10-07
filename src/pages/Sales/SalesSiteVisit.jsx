import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./SalesSiteVisit.css";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { apiFetch } from "../../api/apiClient";

const CUSTOMER_CATEGORIES = [
    "Contractor",
    "Builder",
    "Site Owner",
    "Architect / Engineer",
    "Electrician",
    "Shop / Dealer",
    "Other",
];

// Last 10 digits of a phone number, or "" if it is too short.
const phoneKey = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 10 ? digits.slice(-10) : "";
};

const partyPhones = (party) =>
    [
        party.mobile,
        party.ledger_phone,
        party.owner_phone,
        party.payment_contact_phone,
        party.purchase_contact_phone,
    ]
        .join(",")
        .split(/[,/]/)
        .map(phoneKey)
        .filter(Boolean);

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function SalesSiteVisit() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const autocompleteRef = useRef(null);

    const fileInputRef = useRef(null);

    const [cameraMode, setCameraMode] = useState("environment");
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState("");

    // ================= USER =================
    const [salesExecutive, setSalesExecutive] = useState("");
    const [userUid, setUserUid] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [userLoaded, setUserLoaded] = useState(false);

    // ================= FORM =================
    const [showForm, setShowForm] = useState(false);
    const [customerName, setCustomerName] = useState("");
    const [customerCategory, setCustomerCategory] = useState("");
    const [phone, setPhone] = useState("");
    const [decisionMaker, setDecisionMaker] = useState("");
    const [siteName, setSiteName] = useState("");
    const [address, setAddress] = useState("");
    const [requirement, setRequirement] = useState("");
    const [followupDate, setFollowupDate] = useState("");
    const [selectedParty, setSelectedParty] = useState(null);

    const [capturedImage, setCapturedImage] = useState("");
    const [coords, setCoords] = useState(null);
    const [location, setLocation] = useState("");
    const [locationStatus, setLocationStatus] = useState("");
    const [saving, setSaving] = useState(false);

    // ================= CUSTOMERS =================
    const [parties, setParties] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // ================= LIST =================
    const [visits, setVisits] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState("All");
    const [monthFilter, setMonthFilter] = useState(currentMonth());

    // ================= LOAD USER =================
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setUserLoaded(false);
                return;
            }

            try {
                setUserUid(user.uid);

                const roleSnap = await getDoc(doc(db, "roles", user.uid));
                const adminRole = roleSnap.exists()
                    ? String(roleSnap.data().role || "").toLowerCase().trim()
                    : "";

                const userSnap = await getDoc(doc(db, "Users", user.uid));

                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    setSalesExecutive(
                        `${userData.firstName || ""} ${userData.lastName || ""}`.trim()
                    );
                    setIsAdmin(
                        adminRole === "admin" ||
                        String(userData.role || "").toLowerCase().trim() === "admin"
                    );
                } else {
                    setIsAdmin(adminRole === "admin");
                }
            } catch (err) {
                console.log(err);
            }

            setUserLoaded(true);
        });

        return () => unsubscribe();
    }, []);

    // ================= LOAD DATA =================
    const fetchVisits = async () => {
        try {
            // Admin: every executive's visits. Others: only their own.
            const query = isAdmin
                ? "?all=1"
                : `?sales_executive_uid=${encodeURIComponent(userUid)}` +
                `&sales_executive=${encodeURIComponent(salesExecutive)}`;

            const response = await apiFetch(`/serverphp/get_sales_site_visits.php${query}`);
            const data = await response.json();

            setVisits(Array.isArray(data) ? data : []);
        } catch (err) {
            console.log("FETCH VISITS ERROR", err);
        }
    };

    useEffect(() => {
        if (!userLoaded) return;
        if (!isAdmin && !userUid) return;

        fetchVisits();
    }, [userLoaded, isAdmin, userUid, salesExecutive]);

    useEffect(() => {
        const fetchParties = async () => {
            try {
                const response = await apiFetch("/serverphp/fetch_newparty.php");
                const data = await response.json();

                setParties(
                    (Array.isArray(data) ? data : []).map((party) => ({
                        ...party,
                        phoneKeys: partyPhones(party),
                    }))
                );
            } catch (err) {
                console.log(err);
            }
        };

        fetchParties();
    }, []);

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
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ================= OLD / NEW DETECTION =================
    // The server re-checks this on save; this is only a live preview.
    const matchedParty = useMemo(() => {
        if (selectedParty) return selectedParty;

        const name = customerName.trim().toLowerCase();
        const key = phoneKey(phone);

        return (
            parties.find(
                (party) =>
                    (name &&
                        String(party.party_ledger_name || "").trim().toLowerCase() === name) ||
                    (key && party.phoneKeys.includes(key))
            ) || null
        );
    }, [selectedParty, customerName, phone, parties]);

    const previousVisits = useMemo(() => {
        const key = phoneKey(phone);
        if (!key) return 0;
        return visits.filter((visit) => phoneKey(visit.phone) === key).length;
    }, [phone, visits]);

    // ================= CUSTOMER SEARCH =================
    const handleCustomerSearch = (value) => {
        setCustomerName(value);
        setSelectedParty(null);

        if (value.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const search = value.toLowerCase();

        const filtered = parties
            .filter((party) =>
                `${party.party_ledger_name || ""} ${party.owner_name || ""} ${party.mobile || ""}`
                    .toLowerCase()
                    .includes(search)
            )
            .slice(0, 30);

        setSuggestions(filtered);
        setShowSuggestions(true);
    };

    const selectParty = (party) => {
        setSelectedParty(party);
        setCustomerName(party.party_ledger_name || "");
        setPhone(party.mobile || party.ledger_phone || party.owner_phone || "");
        setAddress(party.address || "");
        setDecisionMaker(party.decision_maker || party.owner_name || "");
        setShowSuggestions(false);
    };

    // ================= CAMERA =================
    useEffect(() => {
        if (!showForm || capturedImage) return;

        let mediaStream;
        let cancelled = false;
        const video = videoRef.current;

        setCameraReady(false);
        setCameraError("");

        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("Live camera is not supported here. Use \"Open Phone Camera\" instead.");
            return;
        }

        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: cameraMode }, audio: false })
            .then((stream) => {
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                mediaStream = stream;

                if (!video) return;

                video.srcObject = stream;
                // Some phones/WebViews ignore autoPlay, so start playback explicitly.
                video.play().catch((err) => console.error("Video play error:", err));
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Camera Error:", err);
                setCameraError(
                    err.name === "NotAllowedError"
                        ? "Camera permission denied. Allow camera access, or use \"Open Phone Camera\"."
                        : "Could not start the camera. Use \"Open Phone Camera\" instead."
                );
            });

        return () => {
            cancelled = true;
            mediaStream?.getTracks().forEach((track) => track.stop());
            if (video) video.srcObject = null;
        };
    }, [showForm, cameraMode, capturedImage]);

    const switchCamera = () => {
        setCameraMode((mode) => (mode === "environment" ? "user" : "environment"));
    };

    // ================= LOCATION =================
    const fetchLocation = () => {
        if (!navigator.geolocation) {
            setLocationStatus("Location is not supported on this device");
            return;
        }

        setLocationStatus("Fetching location...");
        setCoords(null);
        setLocation("");

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude, accuracy } = position.coords;

                setCoords({ latitude, longitude, accuracy });
                setLocationStatus("");

                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                    );
                    const data = await res.json();
                    setLocation(data.display_name || `${latitude}, ${longitude}`);
                } catch {
                    setLocation(`${latitude}, ${longitude}`);
                }
            },
            (err) => {
                setLocationStatus(
                    err.code === err.PERMISSION_DENIED
                        ? "Location permission denied. Please allow location and retry."
                        : "Could not get location. Please retry."
                );
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    };

    // Draws the photo (video frame or image) onto the canvas, resized and time-stamped.
    const savePhoto = (source, width, height) => {
        const canvas = canvasRef.current;

        // Keep uploads small: limit the longer side to 1280px.
        const scale = Math.min(1, 1280 / Math.max(width, height));
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);

        const ctx = canvas.getContext("2d");
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

        // Stamp the capture time on the photo.
        const stamp = new Date().toLocaleString("en-GB");
        const fontSize = Math.max(14, Math.round(canvas.width / 40));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(0, canvas.height - fontSize * 1.8, canvas.width, fontSize * 1.8);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(stamp, fontSize * 0.6, canvas.height - fontSize * 0.55);

        setCapturedImage(canvas.toDataURL("image/jpeg", 0.8));

        fetchLocation();
    };

    const capturePhoto = () => {
        const video = videoRef.current;

        if (!video || !video.videoWidth || !video.videoHeight) {
            setCameraError("Camera is still starting. Wait a moment, or use \"Open Phone Camera\".");
            return;
        }

        savePhoto(video, video.videoWidth, video.videoHeight);
    };

    // Fallback: the phone's own camera app.
    const handlePhoneCamera = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            savePhoto(img, img.naturalWidth, img.naturalHeight);
            URL.revokeObjectURL(url);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            alert("Could not read the photo. Please try again.");
        };
        img.src = url;
    };

    const retakePhoto = () => {
        setCapturedImage("");
        setCoords(null);
        setLocation("");
        setLocationStatus("");
    };

    // ================= SAVE =================
    const resetForm = () => {
        setCustomerName("");
        setCustomerCategory("");
        setPhone("");
        setDecisionMaker("");
        setSiteName("");
        setAddress("");
        setRequirement("");
        setFollowupDate("");
        setSelectedParty(null);
        setCapturedImage("");
        setCoords(null);
        setLocation("");
        setLocationStatus("");
    };

    const closeForm = () => {
        resetForm();
        setShowForm(false);
    };

    const saveVisit = async () => {
        if (!customerName.trim() || !phone.trim() || !address.trim()) {
            alert("Enter customer name, phone and site address");
            return;
        }

        if (!phoneKey(phone)) {
            alert("Enter a valid 10 digit phone number");
            return;
        }

        if (!capturedImage) {
            alert("Capture the site photo");
            return;
        }

        if (!coords) {
            alert("Location not captured yet. Please wait or retry location.");
            return;
        }

        if (!salesExecutive) {
            alert("Your user name was not found. Please log in again.");
            return;
        }

        const formData = new FormData();
        formData.append("customer_name", customerName.trim());
        formData.append("customer_category", customerCategory);
        formData.append("phone", phone.trim());
        formData.append("decision_maker", decisionMaker.trim());
        formData.append("site_name", siteName.trim());
        formData.append("address", address.trim());
        formData.append("requirement", requirement.trim());
        formData.append("followup_date", followupDate);
        formData.append("location", location || `${coords.latitude}, ${coords.longitude}`);
        formData.append("latitude", coords.latitude);
        formData.append("longitude", coords.longitude);
        formData.append("location_accuracy", coords.accuracy);
        formData.append("image", capturedImage);
        formData.append("sales_executive", salesExecutive);
        formData.append("sales_executive_uid", userUid);

        setSaving(true);

        try {
            const response = await apiFetch("/serverphp/save_sales_site_visit.php", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.status === "success") {
                alert(
                    result.customer_type === "Old"
                        ? `Saved. Existing customer (${result.matched_party}).`
                        : "Saved. New customer visit recorded."
                );
                closeForm();
                fetchVisits();
            } else {
                alert(result.message || "Save failed");
            }
        } catch (error) {
            console.log(error);
            alert("Save failed. Check your connection and try again.");
        } finally {
            setSaving(false);
        }
    };

    // ================= DELETE =================
    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this record?")) return;

        try {
            const response = await apiFetch(
                `/serverphp/delete_sales_site_visit.php?id=${id}`,
                { method: "DELETE" }
            );
            const result = await response.json();

            if (result.status === "success") {
                setVisits((prev) => prev.filter((item) => item.id !== id));
            } else {
                alert("Delete failed");
            }
        } catch (err) {
            console.error("DELETE ERROR:", err);
        }
    };

    const canDelete = (visit) =>
        isAdmin || (Boolean(userUid) && visit.sales_executive_uid === userUid);

    // ================= FILTERS & SUMMARY =================
    const monthVisits = useMemo(
        () =>
            visits.filter(
                (visit) => !monthFilter || String(visit.created_at || "").startsWith(monthFilter)
            ),
        [visits, monthFilter]
    );

    const filteredVisits = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();

        return monthVisits.filter((visit) => {
            if (typeFilter !== "All" && visit.customer_type !== typeFilter) return false;
            if (!search) return true;

            return `${visit.customer_name || ""} ${visit.phone || ""} ${visit.decision_maker || ""}
                ${visit.site_name || ""} ${visit.address || ""} ${visit.sales_executive || ""}
                ${visit.location || ""} ${visit.customer_category || ""}`
                .toLowerCase()
                .includes(search);
        });
    }, [monthVisits, typeFilter, searchTerm]);

    const totals = useMemo(() => {
        const newCount = monthVisits.filter((v) => v.customer_type === "New").length;
        return {
            total: monthVisits.length,
            newCount,
            oldCount: monthVisits.length - newCount,
        };
    }, [monthVisits]);

    const executiveSummary = useMemo(() => {
        const summary = {};

        monthVisits.forEach((visit) => {
            const name = visit.sales_executive || "Unknown";
            if (!summary[name]) summary[name] = { name, total: 0, newCount: 0, oldCount: 0 };

            summary[name].total += 1;
            if (visit.customer_type === "New") summary[name].newCount += 1;
            else summary[name].oldCount += 1;
        });

        return Object.values(summary).sort((a, b) => b.total - a.total);
    }, [monthVisits]);

    const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

    const mapLink = (visit) =>
        visit.latitude && visit.longitude
            ? `https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`
            : "";

    const TypeBadge = ({ type }) => (
        <span className={`ssv-badge ${type === "Old" ? "ssv-badge-old" : "ssv-badge-new"}`}>
            {type === "Old" ? "Old Customer" : "New Customer"}
        </span>
    );

    // ================= UI =================
    return (
        <div className="ssv-page">
            <Banner />

            <div className="ssv-header">
                <h2>Sales Site Visits</h2>

                <button
                    className="ssv-add-btn"
                    onClick={() => (showForm ? closeForm() : setShowForm(true))}
                >
                    {showForm ? "Close" : "+ Add Site Visit"}
                </button>
            </div>

            {/* ================= FORM ================= */}
            {showForm && (
                <div className="ssv-form">
                    <div className="ssv-form-grid">
                        <div className="ssv-field ssv-span-2">
                            <label>Customer / Firm Name *</label>

                            <div className="ssv-autocomplete" ref={autocompleteRef}>
                                <input
                                    type="text"
                                    placeholder="Search existing customer or type a new name"
                                    value={customerName}
                                    onChange={(e) => handleCustomerSearch(e.target.value)}
                                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                />

                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="ssv-suggestions">
                                        {suggestions.map((party) => (
                                            <div
                                                key={party.id}
                                                className="ssv-suggestion"
                                                onClick={() => selectParty(party)}
                                            >
                                                <strong>{party.party_ledger_name}</strong>
                                                <span>
                                                    {[party.owner_name, party.mobile]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="ssv-field">
                            <label>Phone Number *</label>
                            <input
                                type="tel"
                                placeholder="10 digit mobile number"
                                value={phone}
                                onChange={(e) => {
                                    setPhone(e.target.value);
                                    setSelectedParty(null);
                                }}
                            />
                        </div>

                        {(customerName.trim() || phoneKey(phone)) && (
                            <div className={`ssv-status ssv-span-3 ${matchedParty ? "ssv-status-old" : "ssv-status-new"}`}>
                                {matchedParty ? (
                                    <>
                                        <TypeBadge type="Old" />
                                        Existing customer: <strong>{matchedParty.party_ledger_name}</strong>
                                    </>
                                ) : (
                                    <>
                                        <TypeBadge type="New" />
                                        Not found in customer list. This will be saved as a new customer.
                                    </>
                                )}
                                {previousVisits > 0 && (
                                    <span className="ssv-prev-visits">
                                        Visited {previousVisits} time{previousVisits > 1 ? "s" : ""} before
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="ssv-field">
                            <label>Customer Category</label>
                            <select
                                value={customerCategory}
                                onChange={(e) => setCustomerCategory(e.target.value)}
                            >
                                <option value="">Select category</option>
                                {CUSTOMER_CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="ssv-field">
                            <label>Decision Maker</label>
                            <input
                                type="text"
                                placeholder="Who decides the purchase"
                                value={decisionMaker}
                                onChange={(e) => setDecisionMaker(e.target.value)}
                            />
                        </div>

                        <div className="ssv-field">
                            <label>Site / Project Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Villa at Kakkanad"
                                value={siteName}
                                onChange={(e) => setSiteName(e.target.value)}
                            />
                        </div>

                        <div className="ssv-field ssv-span-2">
                            <label>Site Address *</label>
                            <input
                                type="text"
                                placeholder="Enter site address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                            />
                        </div>

                        <div className="ssv-field">
                            <label>Follow Up Date</label>
                            <input
                                type="date"
                                value={followupDate}
                                onChange={(e) => setFollowupDate(e.target.value)}
                            />
                        </div>

                        <div className="ssv-field ssv-span-2">
                            <label>Requirement / Remarks</label>
                            <textarea
                                placeholder="Products required, stage of work, etc."
                                value={requirement}
                                onChange={(e) => setRequirement(e.target.value)}
                            />
                        </div>

                        <div className="ssv-field">
                            <label>Sales Executive</label>
                            <input type="text" value={salesExecutive} readOnly />
                        </div>
                    </div>

                    {/* ================= CAMERA ================= */}
                    <div className="ssv-camera">
                        {!capturedImage ? (
                            <>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="ssv-camera-preview"
                                    onPlaying={() => setCameraReady(true)}
                                />
                                {cameraError && <p className="ssv-camera-error">{cameraError}</p>}
                                <div className="ssv-camera-buttons">
                                    <button onClick={capturePhoto} disabled={!cameraReady}>
                                        {cameraReady ? "📷 Capture" : "Starting camera..."}
                                    </button>
                                    <button onClick={switchCamera}>🔄 Switch Camera</button>
                                    <button onClick={() => fileInputRef.current?.click()}>
                                        📱 Open Phone Camera
                                    </button>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: "none" }}
                                    onChange={handlePhoneCamera}
                                />
                            </>
                        ) : (
                            <>
                                <img src={capturedImage} alt="Captured site" className="ssv-camera-preview" />
                                <div className="ssv-camera-buttons">
                                    <button onClick={retakePhoto}>↺ Retake</button>
                                </div>
                            </>
                        )}

                        <canvas ref={canvasRef} style={{ display: "none" }} />
                    </div>

                    {/* ================= LOCATION ================= */}
                    <div className="ssv-field">
                        <label>Live Location</label>
                        <input
                            type="text"
                            value={
                                location ||
                                locationStatus ||
                                (coords ? `${coords.latitude}, ${coords.longitude}` : "Captured with the photo")
                            }
                            readOnly
                        />
                        {coords && (
                            <small className="ssv-hint">
                                Accuracy ±{Math.round(coords.accuracy)} m ·{" "}
                                <a
                                    href={`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    View on map
                                </a>
                            </small>
                        )}
                        {capturedImage && !coords && locationStatus && locationStatus !== "Fetching location..." && (
                            <button className="ssv-retry-btn" onClick={fetchLocation}>
                                Retry Location
                            </button>
                        )}
                    </div>

                    <div className="ssv-form-actions">
                        <button className="ssv-save-btn" onClick={saveVisit} disabled={saving}>
                            {saving ? "Saving..." : "Save Site Visit"}
                        </button>
                        <button className="ssv-cancel-btn" onClick={closeForm}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ================= SUMMARY ================= */}
            <div className="ssv-kpis">
                <div className="ssv-kpi">
                    <h3>{totals.total}</h3>
                    <p>Total Visits</p>
                </div>
                <div className="ssv-kpi ssv-kpi-new">
                    <h3>{totals.newCount}</h3>
                    <p>New Customers ({percent(totals.newCount, totals.total)}%)</p>
                </div>
                <div className="ssv-kpi ssv-kpi-old">
                    <h3>{totals.oldCount}</h3>
                    <p>Old Customers ({percent(totals.oldCount, totals.total)}%)</p>
                </div>
            </div>

            {isAdmin && executiveSummary.length > 0 && (
                <div className="ssv-summary">
                    <h3>Executive-wise Summary</h3>
                    <div className="ssv-table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Sales Executive</th>
                                    <th>Total</th>
                                    <th>New</th>
                                    <th>Old</th>
                                    <th>New %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {executiveSummary.map((row) => (
                                    <tr key={row.name}>
                                        <td>{row.name}</td>
                                        <td>{row.total}</td>
                                        <td>{row.newCount}</td>
                                        <td>{row.oldCount}</td>
                                        <td>
                                            <div className="ssv-bar">
                                                <div
                                                    className="ssv-bar-fill"
                                                    style={{ width: `${percent(row.newCount, row.total)}%` }}
                                                />
                                                <span>{percent(row.newCount, row.total)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ================= FILTERS ================= */}
            <div className="ssv-filters">
                <div className="ssv-tabs">
                    {["All", "New", "Old"].map((type) => (
                        <button
                            key={type}
                            className={typeFilter === type ? "active" : ""}
                            onClick={() => setTypeFilter(type)}
                        >
                            {type === "All" ? "All" : `${type} Customers`}
                        </button>
                    ))}
                </div>

                <input
                    type="month"
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                />

                <input
                    type="text"
                    className="ssv-search"
                    placeholder="Search customer, phone, site, executive..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* ================= DESKTOP TABLE ================= */}
            <div className="ssv-table-wrap ssv-desktop">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Customer</th>
                            <th>Category</th>
                            <th>Phone</th>
                            <th>Decision Maker</th>
                            <th>Site</th>
                            <th>Requirement</th>
                            <th>Sales Executive</th>
                            <th>Location</th>
                            <th>Site Image</th>
                            <th>Follow Up</th>
                            <th>Delete</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredVisits.length === 0 && (
                            <tr>
                                <td colSpan="13" className="ssv-empty">
                                    No site visits found
                                </td>
                            </tr>
                        )}

                        {filteredVisits.map((visit) => (
                            <tr key={visit.id}>
                                <td>{new Date(visit.created_at).toLocaleDateString("en-GB")}</td>
                                <td>
                                    <TypeBadge type={visit.customer_type} />
                                </td>
                                <td>
                                    {visit.customer_name}
                                    {visit.matched_party && visit.matched_party !== visit.customer_name && (
                                        <div className="ssv-muted">{visit.matched_party}</div>
                                    )}
                                </td>
                                <td>{visit.customer_category || "-"}</td>
                                <td>{visit.phone}</td>
                                <td>{visit.decision_maker || "-"}</td>
                                <td>
                                    {visit.site_name && <strong>{visit.site_name}</strong>}
                                    <div>{visit.address}</div>
                                </td>
                                <td>{visit.requirement || "-"}</td>
                                <td>{visit.sales_executive}</td>
                                <td>
                                    {visit.location}
                                    {mapLink(visit) && (
                                        <div>
                                            <a href={mapLink(visit)} target="_blank" rel="noreferrer">
                                                📍 Map
                                            </a>
                                        </div>
                                    )}
                                </td>
                                <td>
                                    {visit.image && (
                                        <a href={`/serverphp/${visit.image}`} target="_blank" rel="noopener noreferrer">
                                            <img src={`/serverphp/${visit.image}`} alt="site" className="ssv-thumb" />
                                        </a>
                                    )}
                                </td>
                                <td>{visit.followup_date || "-"}</td>
                                <td>
                                    {canDelete(visit) && (
                                        <span
                                            className="ssv-delete"
                                            onClick={() => handleDelete(visit.id)}
                                            title="Delete"
                                        >
                                            🗑️
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ================= MOBILE CARDS ================= */}
            <div className="ssv-mobile">
                {filteredVisits.length === 0 && <p className="ssv-empty">No site visits found</p>}

                {filteredVisits.map((visit) => (
                    <div className="ssv-card" key={visit.id}>
                        <div className="ssv-card-top">
                            <div>
                                <h3>{visit.customer_name}</h3>
                                <p>📅 {new Date(visit.created_at).toLocaleDateString("en-GB")}</p>
                            </div>
                            <TypeBadge type={visit.customer_type} />
                        </div>

                        {visit.customer_category && (
                            <p><strong>Category:</strong> {visit.customer_category}</p>
                        )}
                        <p>📞 <strong>Phone:</strong> {visit.phone}</p>
                        <p>👤 <strong>Decision Maker:</strong> {visit.decision_maker || "-"}</p>
                        <p>
                            🏗️ <strong>Site:</strong> {visit.site_name ? `${visit.site_name}, ` : ""}
                            {visit.address}
                        </p>
                        {visit.requirement && (
                            <p>📝 <strong>Requirement:</strong> {visit.requirement}</p>
                        )}
                        <p>👨‍💼 <strong>Executive:</strong> {visit.sales_executive}</p>
                        <p>📅 <strong>Follow Up:</strong> {visit.followup_date || "-"}</p>
                        <p>
                            📍 <strong>Location:</strong> {visit.location}{" "}
                            {mapLink(visit) && (
                                <a href={mapLink(visit)} target="_blank" rel="noreferrer">
                                    (Map)
                                </a>
                            )}
                        </p>

                        {visit.image && (
                            <img
                                src={`/serverphp/${visit.image}`}
                                alt=""
                                className="ssv-card-image"
                                onClick={() => window.open(`/serverphp/${visit.image}`, "_blank")}
                            />
                        )}

                        {canDelete(visit) && (
                            <div className="ssv-card-actions">
                                <button className="ssv-delete-btn" onClick={() => handleDelete(visit.id)}>
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
