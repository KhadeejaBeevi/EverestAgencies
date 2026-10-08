import Banner from "../Banner/Banner.jsx";
import "./KsebUserDashboard.css";
import { apiFetch } from "../../api/apiClient";
import React, { useState, useEffect } from "react";

import { auth, db } from "../firebase";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";

import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import { EditProfileModal } from "../MyProfile/MyProfile.jsx";
import PhotoViewer from "../MyProfile/PhotoViewer.jsx";

const KsebUserDashboard = () => {
  const [KsebuserDetails, setUserDetails] = useState(null);

  const [showEditProfile, setShowEditProfile] = useState(false);

  const [showPhoto, setShowPhoto] = useState(false);

  const [distributionMembers, setDistributionMembers] = useState([]);

  const [followups, setFollowups] = useState([]);

  const [attendanceData, setAttendanceData] = useState([]);

  const [showFollowups, setShowFollowups] = useState(false);
  const [travelPlans, setTravelPlans] = useState([]);
  // ================= FETCH USER =================
  // ======================================================
  // MARK FOLLOWUP COMPLETE
  // ======================================================
  const markFollowupComplete = async (item) => {

    try {

      // =========================================
      // FIREBASE
      // =========================================

      if (item.type === "Firebase") {

        await updateDoc(
          doc(db, "Followups", item.id),
          {
            status: "Completed",
            completedAt: new Date(),
          }
        );

      }

      // =========================================
      // MYSQL FOLLOWUPS
      // =========================================

      else {

        await apiFetch(
          "/serverphp/mark_followup_complete.php",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: item.id,
              type: item.type,
            }),
          }
        );

      }

      // =========================================
      // REMOVE FROM UI
      // =========================================

      setFollowups((prev) =>
        prev.map((f) =>
          f.id === item.id && f.type === item.type
            ? {
              ...f,
              status: "Completed",
              followup_status: "Completed",
            }
            : f
        )
      );

    } catch (error) {

      console.log("Complete Error:", error);

    }

  };
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "/";
        return;
      }

      try {
        // ======================================================
        // LOCAL INDIA DATE
        // ======================================================

        const today = new Date().toISOString().split("T")[0];

        // ======================================================
        // GET USER DETAILS
        // ======================================================

        const docRef = doc(db, "Users", user.uid);

        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) return;

        const userData = docSnap.data();

        setUserDetails({
          uid: user.uid,
          ...userData,
        });

        // ======================================================
        // DISTRIBUTION MEMBERS
        // ======================================================

        if (userData.designation === "SalesCoordinator") {
          const distributionQuery = query(
            collection(db, "Users"),
            where("designation", "==", "SalesExecutive"),
            where("distribution", "==", userData.distribution)
          );

          const distributionSnapshot = await getDocs(distributionQuery);

          const members = [];

          distributionSnapshot.forEach((docSnap) => {
            members.push({
              id: docSnap.id,
              uid: docSnap.id,
              ...docSnap.data(),
            });
          });

          setDistributionMembers(members);
        }

        // ======================================================
        // FOLLOWUPS
        // ======================================================
        let allFollowups = [];

        // ======================================================
        // FIREBASE FOLLOWUPS
        // ======================================================

        let followupQuery;

        if (userData.designation === "SalesCoordinator") {

          followupQuery = query(
            collection(db, "Followups"),
            where("distribution", "==", userData.distribution),

          );

        } else {

          followupQuery = query(
            collection(db, "Followups"),
            where(
              "createdByName",
              "==",
              userData.firstName.toUpperCase()
            ),

          );

        }
        const followupSnapshot = await getDocs(followupQuery);
        followupSnapshot.forEach((docSnap) => {

          const data = docSnap.data();

          const todayDate = new Date(today);

          const followupDate = new Date(
            data.followup_date
          );

          // TODAY + OVERDUE

          if (followupDate <= todayDate) {

            allFollowups.push({
              id: docSnap.id,
              customerName:
                data.customerName || "No Name",

              remarks:
                data.remarks || "No Remarks",

              followup_date:
                data.followup_date,

              createdByName:
                data.createdByName?.toUpperCase() ||
                "Unknown",

              type: "Firebase",

              status:
                data.status || "Pending",

              overdue:
                followupDate < todayDate,
            });

          }

        });

        // ======================================================
        // GET ALLOWED EXECUTIVES
        // ======================================================
        let allowedExecutives = [];

        // INCLUDE COORDINATOR NAME ALSO

        if (userData.firstName) {

          allowedExecutives.push(
            userData.firstName
              .trim()
              .toLowerCase()
          );

        }

        if (userData.designation === "SalesCoordinator") {

          const executiveQuery = query(
            collection(db, "Users"),
            where("designation", "==", "SalesExecutive"),
            where("distribution", "==", userData.distribution)
          );

          const executiveSnapshot = await getDocs(executiveQuery);

          executiveSnapshot.forEach((doc) => {

            const executiveData = doc.data();

            if (executiveData.firstName) {

              allowedExecutives.push(
                executiveData.firstName
                  .trim()
                  .toLowerCase()
              );

            }

          });

        }

        // ======================================================
        // CALL HISTORY FOLLOWUPS
        // ======================================================

        try {
          const callHistoryResponse = await apiFetch(
            "/serverphp/get_all_calls.php"
          );

          const callHistoryData =
            await callHistoryResponse.json();
          console.log("CALL HISTORY RAW:", callHistoryData);
          if (callHistoryData.status === "success") {
            callHistoryData.data.forEach((item) => {
              const itemDate = item.followup_date?.split(" ")[0];

              if (
                itemDate === today

              ) {
                // SALES COORDINATOR

                if (userData.designation === "SalesCoordinator") {

                  const telecaller =
                    item.telecaller_name?.toLowerCase().trim() || "";

                  const currentUser =
                    userData.firstName?.toLowerCase().trim() || "";

                  const matched =
                    telecaller.includes(currentUser);   // ✅ IMPORTANT FIX

                  console.log("TELECALLER:", telecaller);
                  console.log("CURRENT USER:", currentUser);

                  if (
                    matched
                  ) {

                    allFollowups.push({
                      id: item.id,
                      customerName: item.NAME || "No Name",
                      remarks: item.remarks || "No Remarks",
                      followup_date: item.followup_date,
                      createdByName: item.telecaller_name?.toUpperCase() || "Unknown",
                      followup_status:
                        item.followup_status || "Pending",
                      type: "Call History",
                    });

                  }
                }

                // SALES EXECUTIVE

                else if (
                  String(item.executive_id).trim() ===
                  String(user.uid).trim()
                ) {
                  allFollowups.push({
                    id: item.id,
                    customerName: item.NAME || "No Name",
                    remarks: item.remarks || "No Remarks",
                    followup_date: item.followup_date,
                    createdByName:
                      item.telecaller_name?.toUpperCase() ||
                      "Unknown",
                    followup_status:
                      item.followup_status || "Pending",
                    type: "Call History",
                  });
                }
              }
            });
          }
        } catch (error) {
          console.log(
            "Call History Fetch Error:",
            error
          );
        }

        // ======================================================
        // SITE VISIT FOLLOWUPS
        // ======================================================
        // ======================================================
        // CALL HISTORY FOLLOWUPS
        // ======================================================

        // existing call history code here


        // ======================================================
        // SITE VISIT FOLLOWUPS
        // ======================================================

        try {



          console.log("TODAY:", today);

          const siteVisitResponse = await apiFetch(
            `/serverphp/get_sitevisit_followups.php?date=${today}`
          );

          const siteVisitData = await siteVisitResponse.json();

          console.log("SITE VISIT DATA:", siteVisitData);

          // SALES COORDINATOR

          if (userData.designation === "SalesCoordinator") {

            siteVisitData.forEach((item) => {

              const executiveName =
                item.sales_executive
                  ?.toLowerCase()
                  ?.trim();
              console.log("EXECUTIVE:", executiveName);
              console.log("ALLOWED:", allowedExecutives);
              const matched = allowedExecutives.some((name) =>
                executiveName?.includes(name)
              );
              if (
                matched

              ) {

                allFollowups.push({
                  id: item.id,
                  customerName: item.customer_name || "No Name",
                  remarks: item.address || "No Address",
                  followup_date: item.followup_date,
                  createdByName:
                    item.sales_executive?.toUpperCase() || "Unknown",
                  followup_status:
                    item.followup_status || "Pending",
                  type: "Site Visit",
                });

              }

            });

          }

          // SALES EXECUTIVE

          else {

            siteVisitData.forEach((item) => {

              const executiveName =
                item.sales_executive
                  ?.toLowerCase()
                  ?.trim() || "";

              const currentUser =
                userData.firstName
                  ?.toLowerCase()
                  ?.trim() || "";

              if (
                executiveName.includes(currentUser)
              ) {
                console.log("EXECUTIVE NAME:", userData.firstName);
                console.log("TODAY:", today);
                allFollowups.push({
                  id: item.id,
                  customerName: item.customer_name || "No Name",
                  remarks: item.address || "No Address",
                  followup_date: item.followup_date,
                  createdByName:
                    item.sales_executive?.toUpperCase() || "Unknown",
                  followup_status:
                    item.followup_status || "Pending",
                  type: "Site Visit",
                });

              }

            });

          }

        } catch (error) {

          console.log(
            "Site Visit Fetch Error:",
            error
          );

        }



        // ======================================================
        // SORT FOLLOWUPS
        // ======================================================

        allFollowups.sort(
          (a, b) =>
            new Date(a.followup_date) -
            new Date(b.followup_date)
        );

        setFollowups(allFollowups);

        // ======================================================
        // ATTENDANCE
        // ======================================================

        try {
          const attendanceToday =
            new Date().toISOString().split("T")[0];

          const response = await apiFetch(
            `/serverphp/getattendance.php?date=${attendanceToday}`
          );

          const result = await response.json();

          if (!Array.isArray(result)) {

            console.log(
              "Attendance API error:",
              result
            );

            setAttendanceData([]);

          } else {

            console.log("ATTENDANCE RESULT:", result);

            setAttendanceData(result);

          }

          setAttendanceData(result);
        } catch (error) {
          console.log(
            "Attendance Fetch Error:",
            error
          );
          setAttendanceData([]);
        }
        // ======================================================
        // TODAY TRAVEL PLANS
        // ======================================================

        try {

          const today =
            new Date().toISOString().split("T")[0];

          const response = await apiFetch(

            `/serverphp/travel_plans.php?executive=${userData.firstName}&travel_date=${today}`

          );

          const data = await response.json();
          if (data.status === "success") {

            const filteredPlans = data.data.filter(
              (item) =>
                item.executive
                  ?.toLowerCase()
                  ?.trim() ===
                userData.firstName
                  ?.toLowerCase()
                  ?.trim()
            );

            setTravelPlans(filteredPlans);

          }



        } catch (error) {

          console.log(
            "Travel Plans Fetch Error:",
            error
          );

        }
      } catch (error) {
        console.error(
          "Error fetching user data:",
          error
        );
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-[#eef4fa]">
      {/* ================= TOP BAR ================= */}

      <Banner />

      <PhotoViewer
        open={showPhoto}
        photo={KsebuserDetails?.photo}
        name={`${KsebuserDetails?.firstName || ""} ${KsebuserDetails?.lastName || ""}`.trim()}
        onClose={() => setShowPhoto(false)}
      />

      <EditProfileModal
        open={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onSaved={(updates) =>
          setUserDetails((prev) => ({ ...prev, ...updates }))
        }
      />

      {/* ================= MAIN ================= */}

      <main className="p-6">
        {/* ================= HERO CARD ================= */}

        <div className="bg-[#0f4c81] rounded-3xl shadow-xl p-8 text-white">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
            {/* LEFT */}

            <div>
              <h1 className="text-4xl font-bold">
                Welcome,{" "}
                {KsebuserDetails?.firstName || "User"} 👋
              </h1>

              <p className="mt-4 text-blue-100 text-lg">
                Manage KSEB operations, attendance and
                site visits from your dashboard.
              </p>

              <div className="mt-6 flex flex-wrap gap-4">
                <Link
                  to="/viewattendance"
                  className="bg-[#1e3a8a] text-white hover:bg-[#2563eb] px-5 py-3 rounded-2xl font-semibold hover:scale-105 transition"
                >
                  View Attendance
                </Link>

                <Link
                  to="/sitevisitdetails"
                  className="bg-[#1e3a8a] text-white hover:bg-[#2563eb] px-5 py-3 rounded-2xl font-semibold hover:scale-105 transition"
                >
                  Site Visits
                </Link>
              </div>
            </div>

            {/* RIGHT PROFILE */}

            <div className="bg-white/20 backdrop-blur-md rounded-3xl p-6 min-w-[300px]">
              <div className="flex items-center gap-4">
                {KsebuserDetails?.photo ? (
                  <img
                    src={KsebuserDetails.photo}
                    onClick={() => setShowPhoto(true)}
                    title="View photo"
                    style={{ cursor: "zoom-in" }}
                    alt="User"
                    className="w-24 h-24 rounded-full object-cover border-4 border-white"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[#dbeafe] text-[#0f4c81] flex items-center justify-center text-4xl font-bold">
                    {KsebuserDetails?.firstName?.charAt(
                      0
                    ) || "U"}
                  </div>
                )}

                <div>
                  <h2 className="text-2xl font-bold">
                    {KsebuserDetails?.firstName}
                  </h2>

                  <p className="text-blue-100">
                    {KsebuserDetails?.designation}
                  </p>

                  <p className="text-blue-200 text-sm">
                    {KsebuserDetails?.distribution}
                  </p>

                  {KsebuserDetails?.phone && (
                    <p className="text-blue-100 text-sm">
                      {KsebuserDetails.phone}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowEditProfile(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-white/90 hover:bg-white text-gray-800 text-sm font-semibold px-4 py-2 rounded-full transition"
              >
                <Pencil size={14} />
                Edit Profile
              </button>
            </div>
          </div>
        </div>

        {/* ================= BELOW HERO ================= */}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-10">
          {/* ================= LEFT SIDE ================= */}

          <div className="xl:col-span-2 space-y-10">
            {KsebuserDetails?.designation ===
              "SalesCoordinator" && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-6">
                    Distribution Members
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {distributionMembers.map((member) => {

                      const isActive = (() => {

                        const userLogs = attendanceData.filter((a) => {

                          return (
                            String(a.user_id || "")
                              .trim()
                              .toLowerCase() ===
                            String(member.uid || member.id || "")
                              .trim()
                              .toLowerCase()
                          );

                        });

                        console.log("MEMBER:", member.firstName);
                        console.log("MEMBER UID:", member.uid);
                        console.log("MATCHED LOGS:", userLogs);

                        const hasCheckIn = userLogs.some(
                          (a) =>
                            String(a.type || "")
                              .trim()
                              .toUpperCase() === "CHECK_IN"
                        );

                        const hasCheckOut = userLogs.some(
                          (a) =>
                            String(a.type || "")
                              .trim()
                              .toUpperCase() === "CHECK_OUT"
                        );

                        return hasCheckIn && !hasCheckOut;

                      })();

                      return (
                        <div
                          key={member.id}
                          className="bg-white rounded-3xl p-6 shadow-md"
                        >
                          <h3 className="text-xl font-bold text-[#0f4c81]">
                            {member.firstName}{" "}
                            {member.lastName}
                          </h3>

                          <p className="text-gray-500 mt-2">
                            Sales Executive
                          </p>

                          {/* STATUS */}

                          <div className="mt-3">
                            {isActive ? (
                              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                                ● Active
                              </span>
                            ) : (
                              <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                                ● Inactive
                              </span>
                            )}
                          </div>

                          <div className="mt-4 space-y-2 text-sm">
                            <p>
                              <span className="font-semibold">
                                Distribution:
                              </span>{" "}
                              {member.distribution}
                            </p>

                            <p>
                              <span className="font-semibold">
                                Email:
                              </span>{" "}
                              {member.email}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* ================= QUICK ACCESS ================= */}

            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                Quick Access
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Link to="/viewattendance">
                  <div className="bg-white rounded-3xl p-6 shadow-md hover:shadow-xl hover:scale-[1.02] transition cursor-pointer">
                    <h3 className="text-xl font-bold text-[#0f4c81]">
                      Attendance
                    </h3>

                    <p className="text-gray-500 mt-4">
                      View attendance details.
                    </p>

                    <button className="mt-6 bg-blue-600 text-white px-5 py-2 rounded-xl">
                      Open
                    </button>
                  </div>
                </Link>

                <Link to="/sitevisitdetails">
                  <div className="bg-white rounded-3xl p-6 shadow-md hover:shadow-xl hover:scale-[1.02] transition cursor-pointer">
                    <h3 className="text-xl font-bold text-[#0f4c81]">
                      Site Visits
                    </h3>

                    <p className="text-gray-500 mt-4">
                      Manage site visits.
                    </p>

                    <button className="mt-6 bg-blue-600 text-white px-5 py-2 rounded-xl">
                      Open
                    </button>
                  </div>
                </Link>
              </div>
            </div>
            {/* ================= TODAY TRAVEL PLANS ================= */}

            {/* ================= TODAY TRAVEL PLANS ================= */}

            {KsebuserDetails?.designation !== "SalesCoordinator" && (

              <div className="bg-white rounded-3xl p-6 shadow-xl mt-10">

                <div className="flex items-center justify-between mb-6">

                  <div>

                    <h2 className="text-2xl font-bold text-[#0f4c81]">
                      Today's Travel Plans
                    </h2>

                    <p className="text-gray-500 text-sm mt-1">
                      {travelPlans.length} Planned Visits
                    </p>

                  </div>

                </div>

                {travelPlans.length > 0 ? (

                  <div className="overflow-x-auto">

                    <table className="w-full">

                      <thead>

                        <tr className="bg-[#eef4fa] text-[#0f4c81]">

                          <th className="text-left p-4 rounded-l-2xl">
                            Sl No.
                          </th>



                          <th className="text-left p-4">
                            Customer
                          </th>

                          <th className="text-left p-4">
                            Location
                          </th>

                          <th className="text-left p-4">
                            Purpose
                          </th>

                          <th className="text-left p-4 rounded-r-2xl">
                            Status
                          </th>

                        </tr>

                      </thead>

                      <tbody>

                        {travelPlans.map((item, index) => (

                          <tr
                            key={item.id}
                            className="border-b"
                          >

                            <td className="p-4 font-semibold">
                              {index + 1}
                            </td>



                            <td className="p-4 font-semibold text-[#0f4c81]">
                              {item.customer}
                            </td>

                            <td className="p-4">
                              {item.location_name}
                            </td>

                            <td className="p-4">
                              {item.purpose}
                            </td>

                            <td className="p-4">

                              {Number(item.completed) === 1 ? (

                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                                  Completed
                                </span>

                              ) : (

                                <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-semibold">
                                  Pending
                                </span>

                              )}

                            </td>

                          </tr>

                        ))}

                      </tbody>

                    </table>

                  </div>

                ) : (

                  <div className="text-center text-gray-500 py-12">

                    No travel plans available today

                  </div>

                )}

              </div>
)}

          </div>

          {/* ================= RIGHT SIDE FOLLOWUPS ================= */}

          <div>
            <div className="bg-white rounded-3xl shadow-xl p-6">
              {/* HEADER */}

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl followup-heading">
                    Today's Followups
                  </h2>

                  <p className="text-gray-500 text-sm mt-1">
                    {followups.length} Followups Today
                  </p>
                </div>

                <button
                  onClick={() =>
                    setShowFollowups(!showFollowups)
                  }
                  className="bg-[#0f4c81] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#2563eb] transition"
                >
                  {showFollowups ? "Hide" : "View"}
                </button>
              </div>

              {/* FOLLOWUP LIST */}

              {showFollowups && (
                <div className="space-y-4 max-h-[900px] overflow-y-auto">
                  {followups.length > 0 ? (
                    followups.map((item) => {

                      const currentStatus =
                        item.type === "Firebase"
                          ? item.status
                          : item.followup_status;

                      const normalizedStatus =
                        String(currentStatus || "")
                          .trim()
                          .toLowerCase();

                      return (

                        <div

                          key={item.id}
                          className="border border-gray-200 rounded-2xl p-4"
                        >
                          <div className="flex justify-between items-start gap-2">

                            <h3 className="text-lg font-bold text-[#0f4c81]">
                              {item.customerName}
                            </h3>

                            <div className="flex flex-col items-end gap-2">

                              {/* TYPE */}

                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold ${item.type === "Site Visit"
                                  ? "bg-orange-100 text-orange-700"
                                  : item.type === "Firebase"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-purple-100 text-purple-700"
                                  }`}
                              >
                                {item.type}
                              </span>

                              {/* STATUS */}

                              <span
                                className={`px-3 py-1 rounded-full text-xs font-bold ${normalizedStatus === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-yellow-100 text-yellow-700"
                                  }`}
                              >
                                {normalizedStatus === "completed"
                                  ? "completed"
                                  : "Pending"}
                              </span>

                            </div>

                          </div>

                          <p className="text-gray-500 text-sm mt-2">
                            {item.remarks}
                          </p>

                          <div className="mt-3 text-sm space-y-1">

                            <div className="mt-4 flex gap-2 flex-wrap">

                              {item.overdue && (
                                <span className="bg-red-100 text-red-700 px-3 py-2 rounded-xl text-xs font-bold">
                                  Overdue
                                </span>
                              )}

                              {normalizedStatus !== "completed" &&

                                item.createdByName
                                  ?.toLowerCase()
                                  ?.includes(
                                    KsebuserDetails?.firstName
                                      ?.toLowerCase()
                                      ?.trim()
                                  )

                                && (
                                  <button
                                    onClick={() =>
                                      markFollowupComplete(item)
                                    }
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold"
                                  >
                                    Mark Complete
                                  </button>
                                )}

                            </div>
                            <p>
                              <span className="font-semibold">
                                Date:
                              </span>{" "}
                              {item.followup_date}
                            </p>

                            <p>
                              <span className="font-semibold">
                                By:
                              </span>{" "}
                              {item.createdByName}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="border border-gray-200 rounded-2xl p-4">
                      <p className="text-gray-500">
                        No followups found.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default KsebUserDashboard;