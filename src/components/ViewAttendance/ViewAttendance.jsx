import Banner from "../Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import "./ViewAttendance.css";
import {
  doc,
  getDoc,
  collection,
  getDocs
} from "firebase/firestore";
import { apiFetch } from "../../api/apiClient";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../components/firebase";


export default function ViewAttendance() {

  const [attendance, setAttendance] = useState([]);

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [loading, setLoading] = useState(true);

  const [userRole, setUserRole] = useState("");



  
  // FETCH ATTENDANCE
const fetchAttendance = async (date, userId, role, distribution = "") => {
  try {
    setLoading(true);

    let url = "";

    if (role === "admin") {
      url = `/serverphp/get_attendance.php?date=${date}&role=admin`;
    } else {
      // Everyone else fetches all attendance and filters in React
      url = `/serverphp/get_attendance.php?date=${date}&role=admin`;
    }

    console.log("FETCH URL:", url);

    const res = await apiFetch(url);
    const result = await res.json();

    console.log("API RESPONSE:", result);

    if (!result.success) {
      setAttendance([]);
      return;
    }

    const data = result.data || [];

    let filteredData = data;

    // Sales Coordinator
    if (role === "SalesCoordinator") {

      const usersSnapshot = await getDocs(
        collection(db, "Users")
      );

      const allowedUserIds = [];

      usersSnapshot.forEach((docSnap) => {
        const userData = docSnap.data();

        if (
          userData.distribution === distribution &&
          userData.designation === "SalesExecutive"
        ) {
          allowedUserIds.push(docSnap.id);
        }
      });

      // Coordinator himself
      allowedUserIds.push(userId);

      filteredData = data.filter((item) =>
        allowedUserIds.includes(item.user_id)
      );
    }

    // Normal user
    else if (role !== "admin") {
      filteredData = data.filter(
        (item) => item.user_id === userId
      );
    }

    const grouped = {};

    filteredData.forEach((item) => {

      if (!grouped[item.user_id]) {
        grouped[item.user_id] = {
          user_name: item.user_name,
          check_in_time: "-",
          check_out_time: "-",
          check_in_location: "-",
          check_out_location: "-",
        };
      }

      if (item.type === "CHECK_IN") {
        grouped[item.user_id].check_in_time =
          new Date(item.check_time).toLocaleTimeString(
            "en-IN",
            {
              hour: "2-digit",
              minute: "2-digit",
            }
          );

        grouped[item.user_id].check_in_location =
          item.location_text || "-";
      }

      if (item.type === "CHECK_OUT") {
        grouped[item.user_id].check_out_time =
          new Date(item.check_time).toLocaleTimeString(
            "en-IN",
            {
              hour: "2-digit",
              minute: "2-digit",
            }
          );

        grouped[item.user_id].check_out_location =
          item.location_text || "-";
      }
    });

    setAttendance(Object.values(grouped));

  } catch (err) {
    console.log("FETCH ERROR:", err);
    setAttendance([]);
  } finally {
    setLoading(false);
  }
};


  // LOAD USER
  useEffect(() => {

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {

        if (!user) {

          setLoading(false);
          return;
        }

        try {

          let role = "user";
          let userDistribution = "";

          // CHECK ADMIN ROLE
          const roleRef = doc(
            db,
            "roles",
            user.uid
          );

          const roleSnap = await getDoc(roleRef);

          // ADMIN
          if (
            roleSnap.exists() &&
            roleSnap.data().role === "admin"
          ) {

            role = "admin";
          }

          // USERS COLLECTION
          else {

            const userRef = doc(
              db,
              "Users",
              user.uid
            );

            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {

              console.log("User document not found");
              setLoading(false);
              return;
            }

            const userData = userSnap.data();

            // SALES COORDINATOR
         if (userData.designation === "SalesCoordinator") {
  role = "SalesCoordinator";
  userDistribution = userData.distribution;
} else if (
  userData.designation === "SalesExecutive"
) {
  role = "user";
} else {
  role = "user";
}
          }

          setUserRole(role);

          console.log("ROLE:", role);

          // ADMIN
          if (role === "admin") {

            fetchAttendance(
              selectedDate,
              "",
              "admin"
            );
          }

          // USER
          else {

            fetchAttendance(
              selectedDate,
              user.uid,
              role,
              userDistribution
            );
          }

        } catch (err) {

          console.log(err);
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();

  }, [selectedDate]);


  return (

    <div className="attendance-admin">

      {/* BANNER */}
      <Banner />

      <h2>Attendance Report</h2>

      {/* FILTER */}
      <div className="filter-box">

        <label>Select Date:</label>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) =>
            setSelectedDate(e.target.value)
          }
        />

      </div>


      {/* TABLE */}
   <div className="table-wrapper desktop-view">

        <table>

          <thead>

            <tr>

              <th>User Name</th>

              <th>Check In Time</th>

              <th>Check In Location</th>

              <th>Check Out Time</th>

              <th>Check Out Location</th>

            </tr>

          </thead>

          <tbody>

            {loading ? (

              <tr>

                <td colSpan="5">

                  Loading...

                </td>

              </tr>

            ) : attendance.length === 0 ? (

              <tr>

                <td colSpan="5">

                  No Attendance Found

                </td>

              </tr>

            ) : (

              attendance.map((item, index) => (

                <tr key={index}>

                  {/* USER */}
                  <td>

                    {item.user_name}

                  </td>

                  {/* CHECK IN */}
                  <td className="checkin">

                    {item.check_in_time}

                  </td>

                  {/* CHECK IN LOCATION */}
                  <td className="location-cell">

                    {item.check_in_location}

                  </td>

                  {/* CHECK OUT */}
                  <td className="checkout">

                    {item.check_out_time}

                  </td>

                  {/* CHECK OUT LOCATION */}
                  <td className="location-cell">

                    {item.check_out_location}

                  </td>

                </tr>
              ))
            )}

          </tbody>

        </table>

      </div>
      <div className="mobile-cards">
    {loading ? (
        <div className="attendance-card">
            Loading...
        </div>
    ) : attendance.length === 0 ? (
        <div className="attendance-card">
            No Attendance Found
        </div>
    ) : (
        attendance.map((item, index) => (
            <div className="attendance-card" key={index}>

                <div className="card-header">
                    {item.user_name}
                </div>

                <div className="card-row">
                    <span>Check In</span>
                    <span className="checkin">
                        {item.check_in_time}
                    </span>
                </div>

                <div className="card-row">
                    <span>In Location</span>
                    <span>
                        {item.check_in_location}
                    </span>
                </div>

                <div className="card-row">
                    <span>Check Out</span>
                    <span className="checkout">
                        {item.check_out_time}
                    </span>
                </div>

                <div className="card-row">
                    <span>Out Location</span>
                    <span>
                        {item.check_out_location}
                    </span>
                </div>

            </div>
        ))
    )}
</div>

    </div>
  );
}