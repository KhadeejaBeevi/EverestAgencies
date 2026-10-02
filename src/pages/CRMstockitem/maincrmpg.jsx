import Banner from "../../components/Banner/Banner.jsx";
import { useState, useEffect } from "react";



import SalesSummaryTable from "./SalesSummaryTable";

import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
const CRMstock = () => {

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
    <div className="min-h-screen bg-blue-100 flex flex-col">

      <Banner />

      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-3xl font-bold text-red-600">
          Access Denied
        </h1>
      </div>

    </div>
  );
}

  return (

    <div className="min-h-screen bg-blue-100 flex flex-col">
{/* Top Banner */}

   <Banner />


      <div className="bg-gradient-to-r from-blue-600 to-blue-400 py-3 px-4">

        <h1 className="text-white text-xl sm:text-2xl font-bold text-center">
          Sales Summary (Monthly)
        </h1>

      </div>

      <SalesSummaryTable />

    </div>

  );
};

export default CRMstock;
