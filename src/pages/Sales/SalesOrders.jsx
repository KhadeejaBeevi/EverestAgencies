import Banner from "../../components/Banner/Banner.jsx";
import React, { useState, useRef, useEffect } from "react";
import "./SalesOrders.css";
import { auth, db } from "../../components/firebase";
import {
  doc,
  getDoc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { apiFetch } from "../../api/apiClient";

const salesmanList = [
  "Shibu",
  "Ouseph",
  "Ajith",
  "Aysha",
  "Shabir",
  "Prayaga",
];

export default function SalesOrders() {
  const [orders, setOrders] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [userRole, setUserRole] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [facingMode, setFacingMode] = useState("environment"); 
  const [permissions, setPermissions] = useState([]);

  const [form, setForm] = useState({
    date: "",
    party: "",
    salesman: "",
    customSalesman: "",
    status: "Pending",
    narration: "",
    poImage: null,
    preview: null,
  });




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

          setPermissions(userData.permissions || []);
        }

      } catch (err) {

        console.log(err);

      }

    });

    return () => unsubscribe();

  }, []);


  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    const res = await apiFetch("/serverphp/get_orders.php");
    const data = await res.json();
    setOrders(data);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode, 
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsInline", true);
        videoRef.current.setAttribute("autoplay", true);
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("Camera not available");
    }
  };
  const captureImage = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      const file = new File([blob], "camera.png", { type: "image/png" });

      setForm((prev) => ({
        ...prev,
        poImage: file,
        preview: URL.createObjectURL(file),
      }));
    });

    video.srcObject.getTracks().forEach((t) => t.stop());
    setCameraOn(false);
  };

  
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const finalSalesman =
        form.salesman === "Other"
          ? form.customSalesman
          : form.salesman;

      const formData = new FormData();
      formData.append("date", form.date);
      formData.append("party", form.party);
      formData.append("salesman", finalSalesman);
      formData.append("status", form.status);
      formData.append("narration", form.narration);

      if (form.poImage) {
        formData.append("poImage", form.poImage);
      }

      const res = await apiFetch("/serverphp/add_orders.php", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      console.log("SERVER RAW:", text);

      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error("Invalid JSON from server");
      }

      if (data.status === "success") {
        alert("Saved ✅");
        fetchOrders();
        setShowModal(false);
      } else {
        alert("Save failed ❌");
        console.log(data);
      }
    } catch (err) {
      console.error("Submit error:", err);
      alert("Something went wrong ❌ Check console");
    }
  };
  const BASE_URL = "/serverphp/";
  const getImageUrl = (path) => {
  if (!path) return "";

  if (path.startsWith("http")) {
    return path;
  }

  return BASE_URL + path;
};
  // DELETE
  const deleteOrder = async (id) => {
    await apiFetch(
      `/serverphp/delete_order.php?id=${id}`
    );
    fetchOrders();
  };

  // UPDATE STATUS
  const updateStatus = async (id, status) => {
    await apiFetch(
      "/serverphp/update_order.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, status }),
      }
    );

    fetchOrders();
  };

  const openCamera = async () => {
    setCameraOn(true);
    setTimeout(() => {
      startCamera();
    }, 100); 
  };

  const filteredOrders =
    filterStatus === "All"
      ? orders
      : orders.filter((o) => o.status === filterStatus);


  if (
    userRole?.toLowerCase()?.trim() === "sales" &&
    permissions.includes("lr")
  ) {
    return (
      <div className="dashboard-wrapper">

        <Banner />

        <div className="min-h-screen flex items-center justify-center">
          <h1 className="text-3xl font-bold text-red-600">
            Access Denied
          </h1>
        </div>

      </div>
    );
  }


  return (

    <div className="sales-container">
      <Banner />
      <div className="header-bar">
        <h2 className="title">Pending PO</h2>

        <button className="add-btn" onClick={() => setShowModal(true)}>
          + New Orders
        </button>
      </div>

      <div className="filter-bar">
        <button onClick={() => setFilterStatus("All")}>All</button>
        <button onClick={() => setFilterStatus("Pending")}>Pending</button>
        <button onClick={() => setFilterStatus("Closed")}>Closed</button>
      </div>

     
      {showModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Add Purchase Order</h3>

            <form onSubmit={handleSubmit}>
              <input type="date" name="date" onChange={handleChange} required />

              <input
                type="text"
                name="party"
                placeholder="Party Name"
                onChange={handleChange}
                required
              />

              <select name="salesman" onChange={handleChange} required>
                <option value="">Select</option>
                {salesmanList.map((s, i) => (
                  <option key={i}>{s}</option>
                ))}
                <option value="Other">Other</option>
              </select>

              {form.salesman === "Other" && (
                <input
                  type="text"
                  name="customSalesman"
                  onChange={handleChange}
                />
              )}

              <select name="status" onChange={handleChange}>
                <option>Pending</option>
                <option>Closed</option>
              </select>

              <textarea
                name="narration"
                placeholder="Narration"
                onChange={handleChange}
              />

              <input
                type="file"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setForm({
                      ...form,
                      poImage: file,
                      preview: URL.createObjectURL(file),
                    });
                  }
                }}
              />

              {form.preview && (
                <img src={form.preview} className="preview" />
              )}

           
              <button type="button" onClick={openCamera}>
                Open Camera
              </button>

              {cameraOn && (
                <>
                  <video ref={videoRef} autoPlay className="video" />
                  <button type="button" onClick={captureImage}>
                    Capture
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newMode =
                        facingMode === "environment" ? "user" : "environment";

                      setFacingMode(newMode);

                     
                      if (videoRef.current?.srcObject) {
                        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
                      }

                      setTimeout(() => startCamera(), 200);
                    }}
                  >
                    Switch Camera
                  </button>
                </>
              )}

              <canvas ref={canvasRef} style={{ display: "none" }} />

              <div className="modal-buttons">
                <button type="submit">Save</button>
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    
      <div className="orders-table-container hidden md:block">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Party</th>
              <th>Salesman</th>
              <th>Status</th>
              <th>Narration</th>
              <th>PO</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredOrders.map((o) => (
              <tr key={o.id}>
                <td>{o.order_date}</td>

                <td>{o.party_name}</td>

                <td>{o.salesman}</td>

                <td>
                  {o.status === "Closed" ? (
                    <span className="closed-badge">
                      Closed
                    </span>
                  ) : (
                    <select
                      value={o.status}
                      onChange={(e) =>
                        updateStatus(o.id, e.target.value)
                      }
                    >
                      <option>Pending</option>
                      <option>Closed</option>
                    </select>
                  )}
                </td>

                <td>{o.narration}</td>

                <td>
                  {o.po_image_url && (
                    <img
                      src={getImageUrl(o.po_image_url)}
                      className="table-image"
                      onClick={() =>
                      window.open(getImageUrl(o.po_image_url), "_blank")
                      }
                    />
                  )}
                </td>

                <td>
                  <button
                    className="delete-btn"
                    onClick={() => deleteOrder(o.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      
<div className="md:hidden flex flex-col gap-3 mt-3">
  {filteredOrders.map((o) => (
    <div
      key={o.id}
      className="bg-white rounded-xl shadow-sm p-3 border border-gray-200"
    >
      {/* TOP */}
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex-1">
          <h3 className="text-[15px] font-bold text-blue-700 leading-tight">
            {o.party_name}
          </h3>

          <p className="text-xs text-gray-500 mt-1">
            📅 {o.order_date}
          </p>
        </div>

        <span
          className={`px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ${
            o.status === "Closed"
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {o.status}
        </span>
      </div>

      
      <div className="mb-2 text-xs text-gray-700">
        👨‍💼 <span className="font-semibold">{o.salesman}</span>
      </div>

      
      <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-700 mb-3 line-clamp-2">
        {o.narration || "No narration"}
      </div>

      
      {o.po_image_url && (
        <img
        
          src={getImageUrl(o.po_image_url)}
          alt=""
          className="w-full max-h-36 object-contain bg-gray-100 rounded-lg mb-3 border"
          onClick={() =>
           window.open(getImageUrl(o.po_image_url), "_blank")
          }
        />
      )}

      
      <div className="flex gap-2">
        {o.status !== "Closed" && (
          <select
            value={o.status}
            onChange={(e) =>
              updateStatus(o.id, e.target.value)
            }
            className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs"
          >
            <option>Pending</option>
            <option>Closed</option>
          </select>
        )}

        <button
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-semibold"
          onClick={() => deleteOrder(o.id)}
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