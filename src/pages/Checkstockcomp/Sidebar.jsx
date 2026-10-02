import Banner from "../../components/Banner/Banner.jsx";
import React, { useState, useEffect } from "react";
import { Link, Outlet, NavLink } from "react-router-dom";

import "../../assets/DashboardLayout.css";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";


function Sidebarbanner() {
 
  const [userRole, setUserRole] = useState("");
const [permissions, setPermissions] = useState([]);

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
    <div className="dashboard-wrapper">
<Banner />
      <div className="dashboard-layout">
  <main className="dashboard-main">
    <Outlet />
  </main>
</div>
    </div>
  );
}

export default Sidebarbanner;
