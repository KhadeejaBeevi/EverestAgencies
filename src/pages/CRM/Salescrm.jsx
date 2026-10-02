import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import LedgerPieChart from "./LedgerPieChart";
import SidebarDashboard from "./Sidebarcrm";

import { auth, db } from "../../components/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
} from "firebase/firestore";


const Salescrm = () => {

  const [userRole, setUserRole] = useState("");

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