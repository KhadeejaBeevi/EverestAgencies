import Banner from "../../components/Banner/Banner.jsx";
import React, {
    useState,
    useEffect,
    useRef,
} from "react";
import { auth, db } from "../../components/firebase";
import {
    doc,
    getDoc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
    Plus,
    X,
    Upload,
    Camera,
    RefreshCcw,
} from "lucide-react";

import "./LorryReceipt.css";
import { apiFetch } from "../../api/apiClient";

const LRPage = () => {

    const [openPopup, setOpenPopup] = useState(false);
    const [lrTypeFilter, setLrTypeFilter] = useState("All");
    const [lrData, setLrData] = useState([]);

    const videoRef = useRef(null);

    const canvasRef = useRef(null);


    const [userRole, setUserRole] = useState("");

    const [cameraOn, setCameraOn] = useState(false);
    const [captureType, setCaptureType] = useState("lr");
    const [facingMode, setFacingMode] =
        useState("environment");

    const [formData, setFormData] = useState({
        date: "",
        transporterName: "",
        lrType: "",
        lrdate: "",
        partyName: "",
        destination: "",
        driverName: "",
        deliveryTerms: "",
        paymentStatus: "",
        verificationStatus: "",
        verifiedBy: "",
        billImage: null,
        lrImage: null,
    });

    const transporterOptions = [
        "APS",
        "Professional Courier",
        "DTDC",
        "VRL",
        "Blue Dart",
        "TTC Cargo",
        "Jayem Courier",
        "Bullet Cargo",
    ];

    const driverOptions = [
        "Anil",
        "Ajesh",
        "Vinod",
        "Ashokan",
        "Gijo",
        "Sreelal",
        "Libin",
    ];

  
    const handleChange = (e) => {

        const { name, value } = e.target;

        setFormData({
            ...formData,
            [name]: value,
        });
    };
    const BASE_URL = "/serverphp/";

    const handleImage = (e) => {

        const file = e.target.files[0];

        if (!file) return;

        setFormData((prev) => ({
            ...prev,
            lrImage: file,
        }));
    };
    const handleBillImage = (e) => {

        const file = e.target.files[0];

        if (file) {

            setFormData({
                ...formData,
                billImage: file,
            });
        }
    };
    const fetchLR = async () => {

        try {

            const res = await apiFetch(
                "/serverphp/get_lr.php"
            );

            const data = await res.json();
console.log("LR DATA:", data);
            setLrData(data);

        } catch (err) {

            console.log(err);
        }
    };



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

                }

            } catch (err) {

                console.log(err);

            }

        });

        return () => unsubscribe();

    }, []);
    useEffect(() => {

        const today = new Date();

        const year = today.getFullYear();

        const month = String(
            today.getMonth() + 1
        ).padStart(2, "0");

        const day = String(
            today.getDate()
        ).padStart(2, "0");

        const formattedDate =
            `${year}-${month}-${day}`;

        setFormData((prev) => ({
            ...prev,
            date: formattedDate,
        }));

    }, []);

    useEffect(() => {
        fetchLR();
    }, []);
    const deleteLR = async (id) => {

        const confirmDelete =
            window.confirm(
                "Delete this LR?"
            );

        if (!confirmDelete) return;

        try {

            await apiFetch(
                `/serverphp/delete_lr.php?id=${id}`
            );

            fetchLR();

        } catch (err) {

            console.log(err);
        }
    };
    const updateVerification = async (
        id,
        verificationStatus,
        verifiedBy
    ) => {

        try {

            await apiFetch(
                "/serverphp/update_lr_verification.php",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        id,
                        verificationStatus,
                        verifiedBy,
                    }),
                }
            );

            fetchLR();

        } catch (err) {

            console.log(err);
        }
    };
    // START CAMERA
    const startCamera = async () => {

        try {

            const stream =
                await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode,
                    },
                    audio: false,
                });

            if (videoRef.current) {

                videoRef.current.srcObject = stream;

                videoRef.current.setAttribute(
                    "playsInline",
                    true
                );

                videoRef.current.setAttribute(
                    "autoplay",
                    true
                );

                videoRef.current.muted = true;

                await videoRef.current.play();
            }

        } catch (err) {

            console.error("Camera error:", err);

            alert("Camera not available");
        }
    };

    // OPEN CAMERA
    const openCamera = async () => {

        setCameraOn(true);

        setTimeout(() => {
            startCamera();
        }, 100);
    };

    const captureImage = async () => {

        const canvas = canvasRef.current;

        const video = videoRef.current;

        canvas.width = video.videoWidth;

        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {

            const file = new File(
                [blob],
                `${captureType}-camera.png`,
                {
                    type: "image/png",
                }
            );

            if (captureType === "bill") {

                setFormData((prev) => ({
                    ...prev,
                    billImage: file,
                }));

            } else {

                setFormData((prev) => ({
                    ...prev,
                    lrImage: file,
                }));
            }

        });

        // STOP CAMERA

        video.srcObject
            .getTracks()
            .forEach((t) => t.stop());

        setCameraOn(false);
    };

    
    const switchCamera = () => {

        const newMode =
            facingMode === "environment"
                ? "user"
                : "environment";

        setFacingMode(newMode);

        if (videoRef.current?.srcObject) {

            videoRef.current.srcObject
                .getTracks()
                .forEach((t) => t.stop());
        }

        setTimeout(() => {
            startCamera();
        }, 200);
    };

    const handleSubmit = async (e) => {

        e.preventDefault();

        try {

            const data = new FormData();

            data.append("date", formData.date);

            data.append(
                "transporterName",
                formData.transporterName
            );

            data.append(
                "lrType",
                formData.lrType
            );

            data.append(
                "partyName",
                formData.partyName
            );

            data.append(
                "driverName",
                formData.driverName
            );

            data.append(
                "deliveryTerms",
                formData.deliveryTerms
            );

            data.append(
                "paymentStatus",
                formData.paymentStatus
            );
            data.append("lrdate", formData.lrdate);

            data.append("destination", formData.destination);

            if (formData.billImage) {

                data.append(
                    "billImage",
                    formData.billImage
                );
            }

            if (formData.lrImage) {

                data.append(
                    "lrImage",
                    formData.lrImage
                );
            }

            const res = await apiFetch(
                "/serverphp/add_lr.php",
                {
                    method: "POST",
                    body: data,
                }
            );

            const result = await res.json();

            if (result.status === "success") {

                alert("LR Saved");

                fetchLR();

                setOpenPopup(false);

                const today = new Date();

                const formattedDate = today.toISOString().split("T")[0];

                setFormData({
                    date: formattedDate,
                    transporterName: "",
                    lrType: "",
                    lrdate: "",
                    partyName: "",
                    destination: "",
                    driverName: "",
                    deliveryTerms: "",
                    paymentStatus: "",
                    verificationStatus: "",
                    verifiedBy: "",
                    billImage: null,
                    lrImage: null,
                });

            } else {

                alert("Save Failed");
            }

        } catch (err) {

            console.log(err);

            alert("Error saving LR");
        }
    };


    const verifyLR = async (id, verifier) => {

        try {

            const res = await apiFetch(
                "/serverphp/update_lr_verification.php",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        id,
                        verificationStatus: "Verified",
                        verifiedBy: verifier,
                    }),
                }
            );

            const data = await res.json();

            if (data.status === "success") {

                fetchLR();

            } else {

                alert("Verification failed");
            }

        } catch (err) {

            console.log(err);
        }
    };
    const [filterDate, setFilterDate] = useState("");
    const filteredLRData = lrData.filter((item) => {

        // DATE FILTER
        const matchesDate =
            !filterDate || item.lr_date === filterDate;

        // LR TYPE FILTER
        const matchesType =
            lrTypeFilter === "All"
                ? true
                : item.lr_type === lrTypeFilter;

        return matchesDate && matchesType;
    });
    return (
        <div className="min-h-screen bg-gray-100 p-3 sm:p-5 overflow-x-hidden">
            <Banner />
           
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">

                
                <button
                    onClick={() => setOpenPopup(true)}
                    className="w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-2xl shadow-lg flex items-center justify-center"
                >
                    <Plus size={28} />
                </button>

                {/* CENTER HEADING */}
                <div className="flex-1 flex justify-center">
                    <h1 className="text-2xl font-bold text-gray-800">
                        LR Management
                    </h1>
                </div>

                <div className="w-14"></div>

            </div>
          
           <div className="bg-white rounded-3xl shadow-md p-4 mb-5 flex flex-col lg:flex-row gap-4 lg:items-end">

                <div>
                    <label className="text-sm font-semibold text-gray-700">
                        Filter By Date
                    </label>

                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="border rounded-xl p-3 mt-1"
                    />
                </div>

                <button
                    onClick={() => setFilterDate("")}
                    className="bg-red-500 hover:bg-red-600 text-white px-5 py-3 rounded-xl"
                >
                    Clear
                </button>
              
                <div className="flex gap-3 flex-wrap mt-4">

                    <button
                        onClick={() => setLrTypeFilter("All")}
                        className={`px-5 py-2 rounded-xl font-semibold transition ${lrTypeFilter === "All"
                            ? "bg-black text-white"
                            : "bg-gray-200 text-gray-700"
                            }`}
                    >
                        All LR
                    </button>

                    <button
                        onClick={() => setLrTypeFilter("InComing LR")}
                        className={`px-5 py-2 rounded-xl font-semibold transition ${lrTypeFilter === "InComing LR"
                            ? "bg-black text-white"
                            : "bg-gray-200 text-gray-700"
                            }`}
                    >
                        InComing LR
                    </button>

                    <button
                        onClick={() => setLrTypeFilter("OutGoing LR")}
                        className={`px-5 py-2 rounded-xl font-semibold transition ${lrTypeFilter === "OutGoing LR"
                            ? "bg-black text-white"
                            : "bg-gray-200 text-gray-700"
                            }`}
                    >
                        OutGoing LR
                    </button>

                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-md overflow-x-auto w-full lr-table-wrapper">

                {lrData.length === 0 ? (

                    <div className="p-10 text-center text-gray-500">
                        No LR Added Yet
                    </div>

                ) : (

                   <table className="w-full min-w-[1100px] text-sm lr-table">

                        <thead className="bg-green-600 text-white">

                            <tr>
                                <th className="p-4 text-left">Date</th>
                                <th className="p-4 text-left">Transporter</th>
                                <th className="p-4 text-left">LR Type</th>
                                <th className="p-4 text-left">LR Date</th>
                                <th className="p-4 text-left">Party Name</th>
                                <th className="p-4 text-left">Destination</th>
                                <th className="p-4 text-left">Driver</th>
                                <th className="p-4 text-left">Delivery Terms</th>
                                <th className="p-4 text-left">Payment</th>
                                <th className="p-4 text-left">Bill Image</th>
                                <th className="p-4 text-left">LR Image</th>
                                <th className="p-4 text-left">
                                    Verification
                                </th>

                                <th className="p-4 text-left">
                                    Verified By
                                </th>

                            </tr>

                        </thead>
                        <tbody>

                            {filteredLRData.map((item) => (

                                <tr
                                    key={item.id}
                                    className="border-b hover:bg-gray-50"
                                >

                                    <td className="p-4">
                                        {item.lr_todaydate}
                                    </td>

                                    <td className="p-4">
                                        {item.transporter_name}
                                    </td>

                                    <td className="p-4">
                                        {item.lr_type}
                                    </td>

                                    <td className="p-4">
                                        {item.lr_date}
                                    </td>

                                    <td className="p-4">
                                        {item.party_name}
                                    </td>

                                    <td className="p-4">
                                        {item.destination}
                                    </td>


                                    <td className="p-4">
                                        {item.driver_name}
                                    </td>

                                    <td className="p-4">
                                        {item.delivery_terms}
                                    </td>

                                    <td className="p-4">

                                        <span
                                            className={`px-3 py-1 rounded-full text-sm font-semibold ${item.payment_status === "Paid"
                                                ? "bg-green-100 text-green-700"
                                                : "bg-red-100 text-red-700"
                                                }`}
                                        >
                                            {item.payment_status}
                                        </span>

                                    </td>

                                    <td className="p-4">

                                        {item.bill_image ? (

                                            <img
                                                src={BASE_URL + item.bill_image}
                                                alt="LR"
                                                className="w-16 h-16 rounded-xl object-cover border cursor-pointer"
                                                onClick={() =>
                                                    window.open(
                                                        BASE_URL + item.bill_image,
                                                        "_blank"
                                                    )
                                                }
                                            />

                                        ) : (
                                            "No Image"
                                        )}

                                    </td>

                                    <td className="p-4">

                                        {item.lr_image ? (

                                            <img
                                                src={BASE_URL + item.lr_image}
                                                alt="LR"
                                                className="w-16 h-16 rounded-xl object-cover border cursor-pointer"
                                                onClick={() =>
                                                    window.open(
                                                        BASE_URL + item.lr_image,
                                                        "_blank"
                                                    )
                                                }
                                            />

                                        ) : (
                                            "No Image"
                                        )}

                                    </td>
                                    <td className="p-4">

                                        {item.verification_status === "Verified" ? (

                                            <span className="bg-green-100 text-green-700 px-3 py-2 rounded-xl font-semibold">
                                                Verified
                                            </span>

                                        ) : (

                                            <span className="bg-yellow-100 text-yellow-700 px-3 py-2 rounded-xl font-semibold">
                                                Pending
                                            </span>

                                        )}

                                    </td>

                                    <td className="p-4">

                                        {item.verification_status === "Verified" ? (

                                            <span className="bg-green-100 text-green-700 px-3 py-2 rounded-xl font-semibold">
                                                Verified by {item.verified_by}
                                            </span>

                                        ) : (

                                            <div className="flex gap-2 verification-box">

                                                <input
                                                    list={`verifier-list-${item.id}`}
                                                    id={`verifier-${item.id}`}
                                                    placeholder="Select or Type Verifier"
                                                    className="border rounded-xl px-3 py-2"
                                                    defaultValue=""
                                                />

                                                <datalist id={`verifier-list-${item.id}`}>

                                                    <option value="Sunitha" />

                                                    <option value="Aji" />

                                                    <option value="Bibi" />

                                                    <option value="Saxon" />

                                                    <option value="Clinton" />

                                                    <option value="Roshan" />

                                                    <option value="Dalcy" />

                                                    <option value="KSEB" />

                                                </datalist>

                                                <button
                                                    onClick={() => {

                                                        const verifier =
                                                            document.getElementById(
                                                                `verifier-${item.id}`
                                                            ).value;

                                                        if (!verifier) {
                                                            alert("Select verifier");
                                                            return;
                                                        }

                                                        verifyLR(item.id, verifier);
                                                    }}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
                                                >
                                                    Verify
                                                </button>

                                            </div>

                                        )}

                                    </td>


                                </tr>
                            ))}

                        </tbody>

                    </table>
                )}
            </div>

            
            {openPopup && (

                <div className="fixed inset-0 bg-white z-[9999] overflow-y-auto">

                    <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-50 shadow-sm">

                        <h2 className="text-2xl font-bold text-gray-800">
                            Add LR
                        </h2>

                        <button
                            onClick={() => setOpenPopup(false)}
                            className="bg-red-100 hover:bg-red-200 text-red-600 p-3 rounded-full"
                        >
                            <X size={24} />
                        </button>

                    </div>

                   
                 <div className="p-3 sm:p-5 pb-32">

                        <form
                            onSubmit={handleSubmit}
                            className="space-y-5 max-w-3xl mx-auto"
                        >

                           
                            <div>

                                <label className="font-semibold text-gray-700">
                                    Date
                                </label>

                                <input
                                    type="date"
                                    name="date"
                                    value={formData.date}
                                    onChange={handleChange}
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                />

                            </div>

                            
                            <div>

                                <label className="font-semibold text-gray-700">
                                    Transporter Name
                                </label>

                                <input
                                    list="transporters"
                                    name="transporterName"
                                    value={formData.transporterName}
                                    onChange={handleChange}
                                    placeholder="Select or Type Transporter"
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                />

                                <datalist id="transporters">

                                    {transporterOptions.map((item, index) => (

                                        <option
                                            key={index}
                                            value={item}
                                        />
                                    ))}

                                </datalist>

                            </div>

                            
                            <div>

                                <label className="font-semibold text-gray-700">
                                    InComing / OutGoing LR
                                </label>

                                <select
                                    name="lrType"
                                    value={formData.lrType}
                                    onChange={handleChange}
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                >
                                    <option value="">
                                        Select Type
                                    </option>

                                    <option value="InComing LR">
                                        InComing LR
                                    </option>

                                    <option value="OutGoing LR">
                                        OutGoing LR
                                    </option>

                                </select>

                            </div>
                            <div>

                                <label className="font-semibold text-gray-700">
                                    LR Date
                                </label>

                                <input
                                    type="date"
                                    name="lrdate"
                                    value={formData.lrdate}
                                    onChange={handleChange}
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                />

                            </div>

                            <div>

                                <label className="font-semibold text-gray-700">
                                    Party Name
                                </label>

                                <input
                                    type="text"
                                    name="partyName"
                                    placeholder="Enter Party Name"
                                    value={formData.partyName}
                                    onChange={handleChange}
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                />

                            </div>
                            <div>

                                <label className="font-semibold text-gray-700">
                                    Destination
                                </label>

                                <input
                                    type="text"
                                    name="destination"
                                    placeholder="Enter Destination"
                                    value={formData.destination}
                                    onChange={handleChange}
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                />

                            </div>

                            <div>

                                <label className="font-semibold text-gray-700">
                                    Driver Name
                                </label>

                                <input
                                    list="drivers"
                                    name="driverName"
                                    value={formData.driverName}
                                    onChange={handleChange}
                                    placeholder="Select or Type Driver"
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                />

                                <datalist id="drivers">

                                    {driverOptions.map((item, index) => (

                                        <option
                                            key={index}
                                            value={item}
                                        />
                                    ))}

                                </datalist>

                            </div>

                            <div>

                                <label className="font-semibold text-gray-700">
                                    Delivery Terms
                                </label>

                                <select
                                    name="deliveryTerms"
                                    value={formData.deliveryTerms}
                                    onChange={handleChange}
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                >

                                    <option value="">
                                        Select Delivery Type
                                    </option>

                                    <option value="Godown Delivery">
                                        Godown Delivery
                                    </option>

                                    <option value="Door Delivery">
                                        Door Delivery
                                    </option>

                                </select>

                            </div>

                           
                            <div>

                                <label className="font-semibold text-gray-700">
                                    Payment Status
                                </label>

                                <select
                                    name="paymentStatus"
                                    value={formData.paymentStatus}
                                    onChange={handleChange}
                                    className="w-full mt-2 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                                    required
                                >

                                    <option value="">
                                        Select Status
                                    </option>

                                    <option value="Paid">
                                        Paid
                                    </option>

                                    <option value="Not Paid">
                                        Not Paid
                                    </option>

                                </select>

                            </div>
                            <div>

                                <label className="font-semibold text-gray-700">
                                    Bill Image
                                </label>

                            <div className="flex gap-3 mt-3 flex-wrap mobile-stack">

                                
                                    <label className="flex-1 border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 min-h-[140px]">

                                        <Upload className="mb-2 text-gray-500" />

                                        <span className="text-gray-600 text-sm">
                                            Upload Bill Image
                                        </span>

                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleBillImage}
                                            className="hidden"
                                        />

                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCaptureType("bill");
                                            openCamera();
                                        }}
                                        className="flex-1 border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-green-50 min-h-[140px]"
                                    >

                                        <Camera className="mb-2 text-green-600" />

                                        <span className="text-gray-700 text-sm">
                                            Capture Bill Image
                                        </span>

                                    </button>

                                </div>

                             
                                {formData.billImage && (

                                    <div className="mt-4">

                                        <img
                                            src={URL.createObjectURL(formData.billImage)}
                                            alt="preview"
                                            className="w-40 h-40 object-cover rounded-2xl border"
                                        />

                                       
                                      <div className="flex gap-3 mt-3 flex-wrap mobile-stack">

                                            
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCaptureType("bill");
                                                    openCamera();
                                                }}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
                                            >
                                                Retake
                                            </button>

                                            <label className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl cursor-pointer">

                                                Reupload

                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleBillImage}
                                                    className="hidden"
                                                />

                                            </label>

                                            
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        billImage: null,
                                                    }))
                                                }
                                                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl"
                                            >
                                                Remove
                                            </button>

                                        </div>

                                    </div>

                                )}

                            </div>
                            
                            <div>

                                <label className="font-semibold text-gray-700">
                                    LR Image
                                </label>

                                <div className="flex gap-3 mt-3 flex-wrap mobile-stack">

                                    
                                    <label className="flex-1 border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 min-h-[140px]">

                                        <Upload className="mb-2 text-gray-500" />

                                        <span className="text-gray-600 text-sm">
                                            Upload LR Image
                                        </span>

                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleImage}
                                            className="hidden"
                                        />

                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCaptureType("lr");
                                            openCamera();
                                        }}
                                        className="flex-1 border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-green-50 min-h-[140px]"
                                    >

                                        <Camera className="mb-2 text-green-600" />

                                        <span className="text-gray-700 text-sm">
                                            Open Camera
                                        </span>

                                    </button>

                                </div>

                                {formData.lrImage && (

                                    <div className="mt-4">

                                        <img
                                            src={URL.createObjectURL(formData.lrImage)}
                                            alt="preview"
                                            className="w-40 h-40 object-cover rounded-2xl border"
                                        />

                                        <div className="flex gap-3 mt-3 flex-wrap mobile-stack">

                                           
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCaptureType("lr");
                                                    openCamera();
                                                }}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
                                            >
                                                Retake
                                            </button>

                                            
                                            <label className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl cursor-pointer">

                                                Reupload

                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleImage}
                                                    className="hidden"
                                                />

                                            </label>

                                           
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        lrImage: null,
                                                    }))
                                                }
                                                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl"
                                            >
                                                Remove
                                            </button>

                                        </div>

                                    </div>
                                )}

                            </div>

                            <button
                                type="submit"
                                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-2xl font-semibold"
                            >
                                Save LR
                            </button>

                        </form>
                    </div>
                </div>
            )}

            {cameraOn && (

                <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[9999] p-4">

                    <div className="bg-white rounded-3xl p-4 w-full max-w-md relative">

                        <button
                            onClick={() => {

                                if (videoRef.current?.srcObject) {

                                    videoRef.current.srcObject
                                        .getTracks()
                                        .forEach((t) => t.stop());
                                }

                                setCameraOn(false);
                            }}
                            className="absolute top-3 right-3 bg-gray-100 p-2 rounded-full"
                        >
                            <X size={20} />
                        </button>

                        <h2 className="text-xl font-bold mb-4 text-center">
                            Capture LR Image
                        </h2>

                       
                        <video
                            ref={videoRef}
                            autoPlay
                            className="w-full rounded-2xl border"
                        />

                        
                        <div className="flex gap-3 mt-4">

                        
                            <button
                                type="button"
                                onClick={switchCamera}
                                className="flex-1 bg-gray-200 hover:bg-gray-300 py-3 rounded-2xl flex items-center justify-center gap-2 font-semibold"
                            >

                                <RefreshCcw size={18} />

                                Switch Camera

                            </button>

                            
                            <button
                                type="button"
                                onClick={captureImage}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-2xl font-semibold"
                            >
                                Capture
                            </button>

                        </div>

                    </div>
                </div>
            )}

            <canvas
                ref={canvasRef}
                style={{ display: "none" }}
            />

        </div>
    );
};

export default LRPage;