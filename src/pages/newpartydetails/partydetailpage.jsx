import Banner from "../../components/Banner/Banner.jsx";
import PartyTable from "./Partyform";
import CreatePartyModal from "./CreatePartyModal";

import { useState, useEffect } from "react";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";



const NewParty = () => {
  const [showModal, setShowModal] = useState(false);

  const [permissions, setPermissions] = useState([]);
  const [refresh, setRefresh] = useState(false);
const [userRole, setUserRole] = useState("");
  const handlePartyCreated = () => {
    setRefresh(!refresh);
    setShowModal(false);
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
<Banner />

      <div className="bg-gradient-to-r from-blue-600 to-blue-400 py-3 sm:py-4 px-4 sm:px-6 shadow-md">
        <h1 className="text-white text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-center tracking-wide">
          New Lead GEN
        </h1>
      </div>

     
      {showModal && (
        <CreatePartyModal
          onClose={() => setShowModal(false)}
          onPartyCreated={handlePartyCreated}
        />
      )}

      
      <div className="flex-1 p-2 sm:p-4 md:p-6 overflow-x-hidden">
        <div className="max-w-full mx-auto">
          <PartyTable refresh={refresh} />
        </div>
      </div>
    </div>
  );
};

export default NewParty;