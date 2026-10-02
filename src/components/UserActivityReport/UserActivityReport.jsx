import Banner from "../Banner/Banner.jsx";
import React, { useEffect, useMemo, useState } from "react";
import "./UserActivityReport.css";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const UserActivityReport = () => {

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
const [userSessions, setUserSessions] = useState([]);
  const [search, setSearch] = useState("");
const [userRole, setUserRole] = useState("");
const [authorized, setAuthorized] = useState(false);
const [checkingAccess, setCheckingAccess] = useState(true);

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [selectedUser, setSelectedUser] = useState(null);


  const fetchSessions = async () => {

    try {

      const snapshot = await getDocs(collection(db, "UserSessions"));

      const list = [];

      snapshot.forEach((doc) => {

        list.push({
          id: doc.id,
          ...doc.data(),
        });

      });

      setSessions(list);

    } catch (err) {

      console.log(err);

    }

    setLoading(false);

  };


useEffect(() => {
  if (!authorized) return;

  fetchSessions();

  const interval = setInterval(() => {
    fetchSessions();
  }, 30000);

  return () => clearInterval(interval);
}, [authorized]);

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setAuthorized(false);
      setCheckingAccess(false);
      return;
    }

    try {
      const SPECIAL_UID = "Zj0y6xogiIQLiP0qnYWoHFSLGrf2";

      // Special User
      if (user.uid === SPECIAL_UID) {
        setAuthorized(true);
        setUserRole("special");
        setCheckingAccess(false);
        return;
      }

      // Admin
      const roleRef = doc(db, "roles", user.uid);
      const roleSnap = await getDoc(roleRef);

      if (roleSnap.exists() && roleSnap.data().role === "admin") {
        setAuthorized(true);
        setUserRole("admin");
        setCheckingAccess(false);
        return;
      }

      // No permission
      setAuthorized(false);
    } catch (err) {
      console.error(err);
      setAuthorized(false);
    }

    setCheckingAccess(false);
  });

  return () => unsubscribe();
}, []);

  const filteredUsers = useMemo(() => {

    return sessions.filter((item) => {

      const keyword = search.toLowerCase();

      const matchSearch =

        (item.name || "")
          .toLowerCase()
          .includes(keyword)

        ||

        (item.email || "")
          .toLowerCase()
          .includes(keyword);

      let matchDate = true;

      if (item.createdAt?.toDate) {

        const d = item.createdAt
          .toDate()
          .toISOString()
          .split("T")[0];

        matchDate = d === selectedDate;

      }

      return matchSearch && matchDate;

    });

  }, [sessions, search, selectedDate]);

  const uniqueUsers = Object.values(
  filteredUsers.reduce((acc, item) => {
    const key = item.email || item.uid;

    if (
      !acc[key] ||
      (item.loginTime?.seconds || 0) >
      (acc[key].loginTime?.seconds || 0)
    ) {
      acc[key] = item;
    }

    return acc;
  }, {})
);


 const totalUsers = uniqueUsers.length;

const onlineUsers = uniqueUsers.filter((item) => {
  if (!item.lastActive?.toDate) return false;

  const diff =
    (Date.now() - item.lastActive.toDate().getTime()) / 1000;

  return diff <= 120;
}).length;

  const offlineUsers = totalUsers - onlineUsers;

  const totalSeconds = uniqueUsers.reduce((sum, item) => {

    return sum + (item.totalSeconds || 0);

  }, 0);

  const totalHours = Math.floor(totalSeconds / 3600);

  const totalMinutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

const viewUserDetails = async (user) => {
  try {
    setSelectedUser(user);

    console.log("Searching sessions for:", user.email);

    const q = query(
      collection(db, "UserSessions"),
      where("email", "==", user.email),
      orderBy("loginTime", "desc")
    );

    const snapshot = await getDocs(q);

    console.log("Documents found:", snapshot.size);

    snapshot.forEach((doc) => {
      console.log(doc.id, doc.data());
    });

    const list = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    setUserSessions(list);

  } catch (err) {
    console.error(err);
  }
};

if (checkingAccess) {
  return (
    <>
      <Banner />

      <div className="userActivityPage">
        <h2 style={{ textAlign: "center", marginTop: 30 }}>
          Checking Access...
        </h2>
      </div>
    </>
  );
}

if (!authorized) {
  return (
    <>
      <Banner />

      <div className="userActivityPage">
        <h2 style={{ textAlign: "center", marginTop: 30 }}>
          Access Denied
        </h2>

        <p style={{ textAlign: "center" }}>
          You are not authorized to view this page.
        </p>
      </div>
    </>
  );
}

return (
  <>
    <Banner />

    <div className="userActivityPage">

      <h2>User Activity Report</h2>

      <div className="topFilters">

        <input
          type="text"
          placeholder="Search User..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        <input
          type="date"
          
          value={selectedDate}
          onChange={(e) =>
            setSelectedDate(e.target.value)
          }
        />

      </div>

      <div className="summaryCards">

        <div className="summaryCard">

          <h3>Total Users</h3>

          <span>{totalUsers}</span>

        </div>

        <div className="summaryCard">

          <h3>Online Users</h3>

          <span>{onlineUsers}</span>

        </div>

        <div className="summaryCard">

          <h3>Offline Users</h3>

          <span>{offlineUsers}</span>

        </div>


      </div>

      {loading && (

        <h3 style={{ textAlign: "center" }}>

          Loading...

        </h3>

      )}

 

<div className="activityTableWrapper">

  <table className="activityTable">

    <thead>

      <tr>

        <th>#</th>

        <th>User</th>

        <th>Role</th>

        <th>Designation</th>

        <th>Distribution</th>

        <th>Login Time</th>

        <th>Last Active</th>

        <th>Usage</th>

        <th>Status</th>

        <th>Current Page</th>

        <th>Action</th>

      </tr>

    </thead>

    <tbody>

      {filteredUsers.length === 0 ? (

        <tr>

          <td colSpan="11" style={{ textAlign: "center" }}>

            No Records Found

          </td>

        </tr>

      ) : (

      [...uniqueUsers]
  .sort((a, b) => {

            if (!a.loginTime?.seconds) return 1;

            if (!b.loginTime?.seconds) return -1;

            return b.loginTime.seconds - a.loginTime.seconds;

          })

          .map((item, index) => {

            const loginTime = item.loginTime?.toDate
              ? item.loginTime.toDate()
              : null;

            const lastActive = item.lastActive?.toDate
              ? item.lastActive.toDate()
              : null;

            const usage = item.totalSeconds || 0;

            const hrs = Math.floor(usage / 3600);

            const mins = Math.floor((usage % 3600) / 60);

            const secs = usage % 60;

            let online = false;

            if (lastActive) {

              const diff =
                (Date.now() - lastActive.getTime()) / 1000;

              online = diff <= 120;

            }

            return (

              <tr key={item.id}>

                <td>{index + 1}</td>

                <td>

                  <div>

                    <strong>

                      {item.name || "-"}

                    </strong>

                    <br />

                    <small>

                      {item.email}

                    </small>

                  </div>

                </td>

                <td>{item.role || "-"}</td>

                <td>{item.designation || "-"}</td>

                <td>{item.distribution || "-"}</td>

                <td>

                  {loginTime
                    ? loginTime.toLocaleString()
                    : "-"}

                </td>

                <td>

                  {lastActive
                    ? lastActive.toLocaleString()
                    : "-"}

                </td>

                <td>

                  {hrs}h {mins}m {secs}s

                </td>

                <td>

                  <span
                    className={
                      online
                        ? "onlineBadge"
                        : "offlineBadge"
                    }
                  >

                    {online
                      ? "🟢 Online"
                      : "🔴 Offline"}

                  </span>

                </td>

                <td>

                  {item.currentPage || "-"}

                </td>

                <td>

                  <button
                    className="viewBtn"
                 onClick={() => viewUserDetails(item)}
                  >

                    View

                  </button>

                </td>

              </tr>

            );

          })

      )}

    </tbody>

  </table>

</div>


{selectedUser && (() => {

  const loginTime = selectedUser.loginTime?.toDate
    ? selectedUser.loginTime.toDate()
    : null;

  const logoutTime = selectedUser.logoutTime?.toDate
    ? selectedUser.logoutTime.toDate()
    : null;

  const lastActive = selectedUser.lastActive?.toDate
    ? selectedUser.lastActive.toDate()
    : null;

  const usage = selectedUser.totalSeconds || 0;

  const hrs = Math.floor(usage / 3600);
  const mins = Math.floor((usage % 3600) / 60);
  const secs = usage % 60;

  const online = lastActive
    ? (Date.now() - lastActive.getTime()) / 1000 <= 120
    : false;

  return (

    <div className="activityModalOverlay">

      <div className="activityModal">

        <div className="activityModalHeader">

          <h2>User Session Details</h2>

          <button
            className="closeBtn"
            onClick={() => setSelectedUser(null)}
          >
            ✖
          </button>

        </div>

        <div className="activityBody">

          <div className="detailRow">
            <span>Name</span>
            <strong>{selectedUser.name || "-"}</strong>
          </div>

          <div className="detailRow">
            <span>Email</span>
            <strong>{selectedUser.email || "-"}</strong>
          </div>

          <div className="detailRow">
            <span>Role</span>
            <strong>{selectedUser.role || "-"}</strong>
          </div>

          <div className="detailRow">
            <span>Designation</span>
            <strong>{selectedUser.designation || "-"}</strong>
          </div>

          <div className="detailRow">
            <span>Distribution</span>
            <strong>{selectedUser.distribution || "-"}</strong>
          </div>

          <div className="detailRow">
            <span>Status</span>

            <strong
              className={
                online
                  ? "onlineText"
                  : "offlineText"
              }
            >
              {online ? "🟢 Online" : "🔴 Offline"}
            </strong>

          </div>

          <div className="detailRow">
            <span>Login Time</span>
            <strong>
              {loginTime
                ? loginTime.toLocaleString()
                : "-"}
            </strong>
          </div>

          <div className="detailRow">
            <span>Logout Time</span>
            <strong>
              {logoutTime
                ? logoutTime.toLocaleString()
                : "-- Still Online --"}
            </strong>
          </div>

          <div className="detailRow">
            <span>Last Active</span>
            <strong>
              {lastActive
                ? lastActive.toLocaleString()
                : "-"}
            </strong>
          </div>

          <div className="detailRow">
            <span>Current Page</span>
            <strong>
              {selectedUser.currentPage || "-"}
            </strong>
          </div>

          <div className="detailRow">
            <span>Browser</span>
            <strong style={{ wordBreak: "break-word" }}>
              {selectedUser.browser || "-"}
            </strong>
          </div>

          <div className="detailRow">
            <span>Total Usage</span>
            <strong>

              {hrs} Hours

              {mins} Minutes

              {secs} Seconds

            </strong>
          </div>
          <hr style={{ margin: "20px 0" }} />

<h3>Login History</h3>

<table className="activityTable">

  <thead>
    <tr>
      <th>#</th>
      <th>Login</th>
      <th>Logout</th>
      <th>Usage</th>
      <th>Status</th>
      <th>Page</th>
    </tr>
  </thead>

  <tbody>

    {userSessions.map((session, index) => {

      const login = session.loginTime?.toDate
        ? session.loginTime.toDate().toLocaleString()
        : "-";

      const logout = session.logoutTime?.toDate
        ? session.logoutTime.toDate().toLocaleString()
        : "Online";

      const sec = session.totalSeconds || 0;

      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;

      return (

        <tr key={session.id}>

          <td>{index + 1}</td>

          <td>{login}</td>

          <td>{logout}</td>

          <td>{h}h {m}m {s}s</td>

          <td>{session.status}</td>

          <td>{session.currentPage}</td>

        </tr>

      );

    })}

  </tbody>

</table>

        </div>

      </div>

    </div>

  );

})()}

    </div>
</>
  );

};

export default UserActivityReport;