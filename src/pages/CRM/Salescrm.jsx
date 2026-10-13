import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import LedgerPieChart from "./LedgerPieChart";
import SidebarDashboard from "./Sidebarcrm";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/apiClient";

import { auth, db } from "../../components/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
} from "firebase/firestore";


const Salescrm = () => {

  const [userRole, setUserRole] = useState("");
  const [pendingLedgerChanges, setPendingLedgerChanges] = useState(0);
  const navigate = useNavigate();

  // Ledgers edited in the CRM that are not yet updated in Tally
  useEffect(() => {
    apiFetch("/serverphp/get_ledger_changes.php", {
      method: "POST",
      body: JSON.stringify({ status: "pending" }),
    })
      .then((res) => res.json())
      .then((data) => setPendingLedgerChanges(data.success ? data.count : 0))
      .catch((err) => console.error("Ledger changes count error:", err));
  }, []);

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





  return (

    <div className="min-h-screen bg-blue-100 flex flex-col">

<Banner />

      {/* Sidebar */}

      <SidebarDashboard />

      {/* Header */}

      <div className="bg-gradient-to-r from-blue-600 to-blue-400 py-3 px-4">

        <h1 className="text-white text-xl sm:text-2xl font-bold text-center">

          CRM Dashboard

        </h1>

        <div className="flex justify-center sm:justify-end mt-2">

          <button
            onClick={() => navigate("/ledgerchanges")}
            className={`px-3 py-1.5 rounded text-sm font-semibold shadow ${
              pendingLedgerChanges > 0
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-white text-blue-700 hover:bg-blue-50"
            }`}
          >
            Ledger Changes for Tally
            {pendingLedgerChanges > 0 && ` (${pendingLedgerChanges})`}
          </button>

        </div>

      </div>

      {/* Main Content */}

      <div className="flex-1 w-full">

        <div className="w-full">

          <LedgerPieChart />

        </div>

      </div>

    </div>

  );
};

export default Salescrm;