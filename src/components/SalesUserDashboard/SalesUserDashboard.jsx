import Banner from "../Banner/Banner.jsx";
import "./SalesUserDashboard.css";
import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/apiClient";

const SalesUserDashboard = () => {

  const [salesUserDetails, setSalesUserDetails] = useState(null);

  const [orders, setOrders] = useState([]);

  const [pendingOrders, setPendingOrders] = useState(0);
  const [closedOrders, setClosedOrders] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [lrData, setLrData] = useState([]);

  const [totalLR, setTotalLR] = useState(0);

  const [verifiedLR, setVerifiedLR] = useState(0);

  const [pendingLR, setPendingLR] = useState(0);


  useEffect(() => {

    const unsubscribe = auth.onAuthStateChanged(async (user) => {

      if (user) {

        try {

          const docRef = doc(db, "Users", user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {

            const data = docSnap.data();

            if (data.role !== "sales") {
              alert("Access denied");
              await auth.signOut();
              window.location.href = "/";
              return;
            }

            setSalesUserDetails(data);
          }

        } catch (error) {
          console.error(error);
        }

      } else {
        window.location.href = "/";
      }
    });

    const fetchOrders = async () => {

      try {

        const res = await apiFetch(
          "/serverphp/get_orders.php"
        );

        const data = await res.json();

        setOrders(data);


        const pending = data.filter(
          (o) => o.status === "Pending"
        ).length;

        const closed = data.filter(
          (o) => o.status === "Closed"
        ).length;


        const today = new Date().toISOString().split("T")[0];

        const todayCount = data.filter(
          (o) => o.order_date === today
        ).length;

        setPendingOrders(pending);
        setClosedOrders(closed);
        setTodayOrders(todayCount);

      } catch (error) {
        console.error(error);
      }
    };

    fetchOrders();
    const fetchLR = async () => {

      try {

        const res = await apiFetch(
          "/serverphp/get_lr.php"
        );

        const data = await res.json();

        setLrData(data);

        setTotalLR(data.length);

        const verified = data.filter(
          (item) => item.verification_status === "Verified"
        ).length;

        const pending = data.filter(
          (item) => item.verification_status !== "Verified"
        ).length;

        setVerifiedLR(verified);

        setPendingLR(pending);

      } catch (error) {

        console.error(error);
      }
    };

    const interval = setInterval(() => {
      fetchOrders();
      fetchLR();
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };

  }, []);

  return (

    <div className="sales-dashboard-container">


      <Banner />


      <div className="sales-dashboard-content">


        <div className="sales-hero-section">

          <div className="sales-hero-left">

            <h1>
              Welcome Back, {salesUserDetails?.firstName}
            </h1>

            <p>
              Access your Everest services and manage your daily activities.
            </p>

          </div>


          <div className="sales-profile-mini-card">

            <div className="sales-profile-top">

              <div className="sales-avatar">
                {salesUserDetails?.firstName?.charAt(0)}
              </div>

              <div>

                <h3>
                  {salesUserDetails?.firstName}
                </h3>

                <p>
                  Sales Executive
                </p>

              </div>
            </div>

            <div className="sales-profile-info">

              <p>
                <strong>Email:</strong>{" "}
                {salesUserDetails?.email}
              </p>
              <p>
                <strong>First Name:</strong>{" "}
                {salesUserDetails?.firstName}
              </p>
              <p>
                <strong>Last Name:</strong>{" "}
                {salesUserDetails?.lastName}
              </p>

            </div>

          </div>
        </div>

        <div className="kpi-grid">


          <div className="kpi-card red-card">

            <div>
              <h2>{pendingOrders}</h2>

              <p>Pending Orders</p>
            </div>

            <span>📋</span>

          </div>




          <div className="kpi-card purple-card">

            <div>
              <h2>{totalLR}</h2>

              <p>Total LR</p>
            </div>

            <span>🚚</span>

          </div>




        </div>

        <div className="quick-access-section">

          <h2>Quick Access</h2>

          <div className="quick-grid">


            <div className="quick-card crm-card">

              <div>

                <h3>Orders</h3>

                <p>
                  Manage and track all sales orders.
                </p>

                <Link to="/salesorders">
                  <button>
                    Open
                  </button>
                </Link>

              </div>

              <div className="quick-icon red">
                📋
              </div>

            </div>

            <div className="quick-card crm-card">

              <div>

                <h3>LR Management</h3>

                <p>
                  Manage transporter LR details and verification.
                </p>

                <Link to="/lrdetails">
                  <button>
                    Open
                  </button>
                </Link>

              </div>

              <div className="quick-icon blue">
                🚚
              </div>

            </div>


          </div>
        </div>





      </div>

    </div>
  );
};

export default SalesUserDashboard;