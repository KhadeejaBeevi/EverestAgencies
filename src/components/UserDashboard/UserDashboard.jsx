import Banner from "../Banner/Banner.jsx";
import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { Link } from "react-router-dom";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  Package,
ClipboardList,
} from "lucide-react";
const UserDashboard = () => {

 

  const [userDetails, setUserDetails] = useState(null);

 

  useEffect(() => {

    const unsubscribe =
      auth.onAuthStateChanged(
        async (user) => {

          if (!user) {

            window.location.href = "/";
            return;
          }

          try {

            const userRef = doc(
              db,
              "Users",
              user.uid
            );

            const userSnap =
              await getDoc(userRef);

            if (
              userSnap.exists()
            ) {

              setUserDetails(
                userSnap.data()
              );

              console.log(
                "USER DATA:",
                userSnap.data()
              );
            }

          } catch (error) {

            console.error(
              "Dashboard Error:",
              error
            );
          }
        }
      );

    return () =>
      unsubscribe();

  }, []);

  return (

    <div className="min-h-screen bg-[#f4f6fb]">

     

      <Banner />

      

      <main className="p-6">

        

        <div className="bg-[#0f4c81] rounded-3xl p-8 shadow-xl text-white border border-[#0b3b63]">

          <div className="flex flex-col md:flex-row items-center justify-between gap-8">

            {/* LEFT */}

            <div>

              <h1 className="text-4xl font-bold">

                Welcome Back,{" "}

                {userDetails?.firstName || "User"}

              </h1>

              <p className="mt-3 text-red-50 text-lg">

                Access your Everest services
                and manage your daily activities.

              </p>

            </div>

            {/* RIGHT */}

            <div className="bg-white/20 backdrop-blur-md p-6 rounded-3xl min-w-[320px]">

              <div className="flex items-center gap-4">

                {userDetails?.photo ? (

                  <img
                    src={userDetails.photo}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover border-4 border-white"
                  />

                ) : (

                  <div className="w-20 h-20 rounded-full bg-white text-[#0f4c81] flex items-center justify-center text-3xl font-bold">

                    {userDetails?.firstName?.charAt(0) || "U"}

                  </div>
                )}

                <div>

                  <h2 className="text-2xl font-bold text-white">

                    {userDetails?.firstName || "User"}

                  </h2>

                  <p className="text-red-50">

                    Sales Executive

                  </p>

                </div>

              </div>

              <div className="mt-5 space-y-2 text-sm text-white">

                <p>

                  <span className="font-semibold">

                    Email:

                  </span>{" "}

                  {userDetails?.email || "-"}

                </p>

                <p>

                  <span className="font-semibold">

                    Last Name:

                  </span>{" "}

                  {userDetails?.lastName || "-"}

                </p>

              </div>

            </div>

          </div>

        </div>

       

        <div className="mt-10">

          <h2 className="text-2xl font-bold text-gray-800 mb-5">

            Quick Access

          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

           

            <Link to="/salescrm">

              <div className="bg-white rounded-3xl p-6 shadow-md hover:shadow-xl hover:scale-[1.02] transition cursor-pointer">

                <div className="flex items-center justify-between">

                  <div>

                    <h3 className="text-2xl font-bold text-[#0f4c81]">

                      Sales CRM

                    </h3>

                    <p className="text-gray-500 mt-2">

                      Manage leads and
                      customer followups.

                    </p>

                  </div>

                  <div className="bg-red-100 p-4 rounded-2xl">

                    <ClipboardList
                      className="text-[#0f4c81]"
                      size={30}
                    />

                  </div>

                </div>

                <button className="mt-6 bg-[#0f4c81] text-white px-5 py-2 rounded-xl hover:bg-blue-700 transition">

                  Open

                </button>

              </div>

            </Link>

           

            <Link to="/stock-check">

              <div className="bg-white rounded-3xl p-6 shadow-md hover:shadow-xl hover:scale-[1.02] transition cursor-pointer">

                <div className="flex items-center justify-between">

                  <div>

                    <h3 className="text-2xl font-bold text-[#0f4c81]">

                      Stock Check

                    </h3>

                    <p className="text-gray-500 mt-2">

                      Verify warehouse
                      stock details.

                    </p>

                  </div>

                  <div className="bg-red-100 p-4 rounded-2xl">

                    <Package
                      className="text-[#0f4c81]"
                      size={30}
                    />

                  </div>

                </div>

                <button className="mt-6 bg-[#0f4c81] text-white px-5 py-2 rounded-xl hover:bg-blue-700 transition">

                  Open

                </button>

              </div>

            </Link>

          </div>

        </div>

      </main>

    </div>
  );
};

export default UserDashboard;