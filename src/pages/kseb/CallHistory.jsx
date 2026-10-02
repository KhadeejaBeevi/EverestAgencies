import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./CallHistory.css";
import { auth, db } from "../../components/firebase";

import { doc, getDoc } from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";
import { apiFetch } from "../../api/apiClient";

export default function CallHistory() {

  const navigate = useNavigate();

 

  const [userRole, setUserRole] = useState("");

  const [callHistory, setCallHistory] = useState([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");

  const [telecallerFilter, setTelecallerFilter] = useState("ALL");

  const [telecallers, setTelecallers] = useState([]);

  const [activeLeadFilter, setActiveLeadFilter] = useState(false);

  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  const [appliedFollowup, setAppliedFollowup] = useState("");

  const [followupDate, setFollowupDate] = useState(
    new Date().toISOString().split("T")[0]
  );
const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const currentDate = new Date();

  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1
  );

  const [selectedYear, setSelectedYear] = useState(
    currentDate.getFullYear()
  );

 

  const [showFollowupModal, setShowFollowupModal] = useState(false);

  const [todayFollowups, setTodayFollowups] = useState([]);

  const [loggedUser, setLoggedUser] = useState("");



  const closedStatuses = [
    "Not Interested",
    "No Requirements",
    "No Response",
    "Do not call",
    "Lost",
    "Closed",
    "PO",
    "PO Received",
    "No Purchase Authority",
  ];



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

          setUserRole(userData.role || "");
        }

      } catch (err) {

        console.log(err);
      }

    });

    return () => unsubscribe();

  }, []);



  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

      if (!user) return;

      try {

        const docRef = doc(db, "Users", user.uid);

        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {

          const userData = docSnap.data();

          const fullName =
            `${userData.firstName || ""} ${userData.lastName || ""}`.trim();

          setLoggedUser(fullName);
        }

      } catch (err) {

        console.log(err);
      }

    });

    return () => unsubscribe();

  }, []);

  useEffect(() => {
  const handleResize = () => {
    setIsMobile(window.innerWidth <= 768);
  };

  window.addEventListener("resize", handleResize);

  return () => window.removeEventListener("resize", handleResize);
}, []);
 
  useEffect(() => {

    apiFetch("/serverphp/get_all_calls.php")

      .then((res) => res.json())

      .then((res) => {

        if (res.status === "success") {

          const data = res.data || [];

          setCallHistory(data);

         

          const uniqueTelecallers = [
            ...new Set(
              data
                .map((item) => (item.telecaller_name || "").trim())
                .filter((name) => name !== "")
            ),
          ];

          setTelecallers(uniqueTelecallers);
        }

        setLoading(false);

      })

      .catch((err) => {

        console.error("FETCH ERROR:", err);

        setLoading(false);

      });

  }, []);

 

  useEffect(() => {

    if (callHistory.length === 0 || !loggedUser) return;

    const today = new Date().toISOString().split("T")[0];

    const completed =
      JSON.parse(localStorage.getItem("completedFollowups")) || [];

    const pendingFollowups = callHistory.filter((c) => {

      const isToday =
        c.followup_date &&
        c.followup_date.split(" ")[0] === today;

      const isCompleted = completed.includes(c.id);

      const isMyFollowup =
        (c.telecaller_name || "")
          .trim()
          .toLowerCase() ===
        loggedUser
          .trim()
          .toLowerCase();

      return (
        isToday &&
        !isCompleted &&
        isMyFollowup
      );

    });

    if (pendingFollowups.length > 0) {

      setTodayFollowups(pendingFollowups);

      setShowFollowupModal(true);
    }

  }, [callHistory, loggedUser]);

  

  const handleFollowupDone = (id) => {

    const completed =
      JSON.parse(localStorage.getItem("completedFollowups")) || [];

    const updated = [...completed, id];

    localStorage.setItem(
      "completedFollowups",
      JSON.stringify(updated)
    );

    const remaining = todayFollowups.filter(
      (f) => f.id !== id
    );

    setTodayFollowups(remaining);

    if (remaining.length === 0) {

      setShowFollowupModal(false);
    }

    window.location.reload();

  };


  const handleDelete = (id) => {

    if (!window.confirm("Are you sure you want to delete this record?")) return;

    apiFetch(`/serverphp/delete_call.php?id=${id}`, {
      method: "DELETE",
    })

      .then((res) => res.json())

      .then((res) => {

        if (res.status === "success") {

          setCallHistory((prev) =>
            prev.filter((item) => item.id !== id)
          );

        } else {

          alert("Delete failed");
        }

      })

      .catch((err) => console.error("DELETE ERROR:", err));

  };


  

  const latestEntryMap = {};

  callHistory.forEach((item) => {

    const key = item.kseb_id;

    const itemDate = new Date(
      (item.call_date || "").split(" ")[0]
    );

    if (!latestEntryMap[key]) {

      latestEntryMap[key] = item;

    } else {

      const existingDate = new Date(
        (latestEntryMap[key].call_date || "").split(" ")[0]
      );

      if (itemDate > existingDate) {

        latestEntryMap[key] = item;
      }
    }

  });


  const baseFilteredData = callHistory.filter((c) => {

    const value = search.toLowerCase();

    // SEARCH

    const matchesSearch =
      (c.NAME || "").toLowerCase().includes(value) ||

      (c.phone || "")
        .toString()
        .includes(value) ||

      (c.RECEIPTION_CUG || "")
        .toString()
        .includes(value) ||

      (c.PLACE || "")
        .toLowerCase()
        .includes(value) ||

      (c.telecaller_name || "")
        .toLowerCase()
        .includes(value);

    
    const matchesFollowup =
      !appliedFollowup ||

      (
        c.followup_date &&
        c.followup_date.split(" ")[0] === appliedFollowup
      );

    // TELECALLER

    const matchesTelecaller =
      telecallerFilter === "ALL" ||
      c.telecaller_name === telecallerFilter;

  

    let matchesMonthYear = true;

    if (c.call_date) {

      const date = new Date(
        c.call_date.split(" ")[0]
      );

      matchesMonthYear =
        date.getMonth() + 1 === selectedMonth &&
        date.getFullYear() === selectedYear;
    }

    return (
      matchesSearch &&
      matchesFollowup &&
      matchesTelecaller &&
      matchesMonthYear
    );

  });

 

  const quotationStatuses = [
    "Quotation",
    "Quotation Sent",
    "Quotation Requested",
    "Quotation Notice",
  ];

  const overdueQuotations = Object.values(latestEntryMap).filter((c) => {

    const isQuotation = quotationStatuses.includes(c.status);

    if (!isQuotation || !c.call_date) return false;

    const quotationDate = new Date(
      c.call_date.split(" ")[0]
    );

    const today = new Date();

    const diffDays =
      (today - quotationDate) /
      (1000 * 60 * 60 * 24);

    return diffDays >= 7;

  });
console.log("Total Calls:", callHistory.length);
console.log("Latest Entries:", Object.values(latestEntryMap).length);
console.log("Pending Quotations:", overdueQuotations.length);
console.log(overdueQuotations);


  const filteredData = baseFilteredData.filter((c) => {

   

    const matchesStatus =
      activeLeadFilter
        ? true
        : statusFilter === "ALL"
          ? true
          : statusFilter === "Quotation"
            ? (
              c.status === "Quotation" ||
              c.status === "Quotation Sent" ||
              c.status === "Quotation Requested" ||
              c.status === "Quotation notice"
            )
            : statusFilter === "PO"
              ? (
                c.status === "PO" ||
                c.status === "PO Received"
              )
              : c.status === statusFilter;

   
    const latestRecord =
      latestEntryMap[c.kseb_id];

    const isLatestRecord =
      latestRecord?.id === c.id;

    const latestStatus =
      latestRecord?.status || "";

    const isClosedLatest =
      closedStatuses.includes(latestStatus);

    const matchesActiveLead =
      !activeLeadFilter ||
      (
        isLatestRecord &&
        !isClosedLatest
      );


    const matchesOverdue =
      !showOverdueOnly ||
      overdueQuotations.some(
        (q) => q.kseb_id === c.kseb_id
      );

    return (
      matchesStatus &&
      matchesActiveLead &&
      matchesOverdue
    );

  });

  

  const stageCounts = {

    ALL: baseFilteredData.length,

    Interested: baseFilteredData.filter(
      (x) => x.status === "Interested"
    ).length,

    "Call Back": baseFilteredData.filter(
      (x) => x.status === "Call Back"
    ).length,

    Quotation: baseFilteredData.filter(
      (x) =>
        x.status === "Quotation" ||
        x.status === "Quotation Sent" ||
        x.status === "Quotation Requested" ||
        x.status === "quotation Notice"
    ).length,

    PO: baseFilteredData.filter(
      (x) =>
        x.status === "PO" ||
        x.status === "PO Received"
    ).length,

    "No Requirements": baseFilteredData.filter(
      (x) => x.status === "No Requirements"
    ).length,

    "Not Interested": baseFilteredData.filter(
      (x) => x.status === "Not Interested"
    ).length,

    "Do not call": baseFilteredData.filter(
      (x) => x.status === "Do not call"
    ).length,

    Active: baseFilteredData.filter((x) => {

      const latestRecord =
        latestEntryMap[x.kseb_id];

      if (!latestRecord) return false;

      const isLatest =
        latestRecord.id === x.id;

      const isClosed =
        closedStatuses.includes(
          latestRecord.status
        );

      return (
        isLatest &&
        !isClosed
      );

    }).length,
  };



  const weeklyData = filteredData.reduce((acc, item) => {

    if (!item.call_date) return acc;

    const date = new Date(
      item.call_date.split(" ")[0]
    );

    const day = date.getDate();

    const week =
      day <= 7
        ? "Week 1"
        : day <= 14
          ? "Week 2"
          : day <= 21
            ? "Week 3"
            : day <= 28
              ? "Week 4"
              : "Week 5";

    if (!acc[week]) {

      acc[week] = [];
    }

    acc[week].push(item);

    return acc;

  }, {});


  if (loading) {

    return <p>Loading...</p>;
  }

 

  return (

    <>

 

      <Banner />

      

      {showFollowupModal && (

        <div className="followup-modal-overlay">

          <div className="followup-modal">
  <button
    className="close-modal-top"
    onClick={() => setShowFollowupModal(false)}
  >
    X
  </button>
            <h2>📞 Today's Follow-ups</h2>

            {todayFollowups.map((item) => (

              <div
                key={item.id}
                className="followup-card"
              >

                <div>

                  <strong>{item.NAME}</strong>

                  <p>{item.phone}</p>

                  <p>
                    {item.PLACE} | {item.AREA}
                  </p>

                  <p>{item.remarks}</p>

                </div>

                <div className="followup-actions">

                  <button
                    className="callupdate-btn"
                    onClick={() =>
                      navigate(
                        `/call-entry/${item.kseb_id}`,
                        {
                          state: item,
                        }
                      )
                    }
                  >
                    Call Update
                  </button>

                  <button
                    className="done-btn"
                    onClick={() =>
                      handleFollowupDone(item.id)
                    }
                  >
                    Completed
                  </button>

                </div>

              </div>

            ))}

         

          </div>

        </div>

      )}


      <h3 className="history-title">
        Call History
      </h3>

      

      <div className="history-summary">

        {/* TOTAL */}

        <div
          className="summary-card total"
          onClick={() => {

            setActiveLeadFilter(false);

            setStatusFilter("ALL");

            setShowOverdueOnly(false);

          }}
        >

          <h3>{stageCounts.ALL}</h3>

          <p>Total Calls</p>

        </div>

       

        <div
          className={`summary-card quotation ${statusFilter === "Quotation"
            ? "selected-card"
            : ""
            }`}
          onClick={() => {

            setActiveLeadFilter(false);

            setStatusFilter("Quotation");

            setShowOverdueOnly(false);

          }}
        >

          <h3>{stageCounts.Quotation}</h3>

          <p>Quotations</p>

        </div>

        {/* PO */}

        <div
          className={`summary-card po ${statusFilter === "PO"
            ? "selected-card"
            : ""
            }`}
          onClick={() => {

            setActiveLeadFilter(false);

            setStatusFilter("PO");

            setShowOverdueOnly(false);

          }}
        >

          <h3>{stageCounts.PO}</h3>

          <p>PO Received</p>

        </div>

       

        {/* <div
          className={`summary-card active ${
            activeLeadFilter
              ? "selected-card"
              : ""
          }`}
          onClick={() => {

            setActiveLeadFilter(true);

            setStatusFilter("ALL");

            setShowOverdueOnly(false);

          }}
        >

          <h3>{stageCounts.Active}</h3>

          <p>Active Leads</p>

        </div>

         */}

        <div
          className={`summary-card overdue ${showOverdueOnly
            ? "selected-card"
            : ""
            }`}
          onClick={() => {

            setShowOverdueOnly(true);

            setStatusFilter("ALL");

            setActiveLeadFilter(false);

          }}
        >

          <h3>{overdueQuotations.length}</h3>

          <p>Pending Quotations</p>

        </div>

      </div>


      <div className="search-box">

        <input
          type="text"
          placeholder="Search by name, phone, place..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

      </div>


      <div className="filters-bar">

        

        <div className="status-filters">

          <button
            className={
              statusFilter === "ALL"
                ? "active all-btn"
                : "all-btn"
            }
            onClick={() => {

              setActiveLeadFilter(false);

              setShowOverdueOnly(false);

              setStatusFilter("ALL");

            }}
          >
            All ({stageCounts.ALL})
          </button>

          <button
            className={
              statusFilter === "Interested"
                ? "active interested-btn"
                : "interested-btn"
            }
            onClick={() => {

              setActiveLeadFilter(false);

              setShowOverdueOnly(false);

              setStatusFilter("Interested");

            }}
          >
            Interested ({stageCounts.Interested})
          </button>

          <button
            className={
              statusFilter === "Call Back"
                ? "active callback-btn"
                : "callback-btn"
            }
            onClick={() => {

              setActiveLeadFilter(false);

              setShowOverdueOnly(false);

              setStatusFilter("Call Back");

            }}
          >
            Call Back ({stageCounts["Call Back"]})
          </button>

          <button
            className={
              statusFilter === "Quotation"
                ? "active quotation-btn"
                : "quotation-btn"
            }
            onClick={() => {

              setActiveLeadFilter(false);

              setShowOverdueOnly(false);

              setStatusFilter("Quotation");

            }}
          >
            Quotation ({stageCounts.Quotation})
          </button>

          <button
            className={
              statusFilter === "PO"
                ? "active po-btn"
                : "po-btn"
            }
            onClick={() => {

              setActiveLeadFilter(false);

              setShowOverdueOnly(false);

              setStatusFilter("PO");

            }}
          >
            PO ({stageCounts.PO})
          </button>

          <button
            className={
              statusFilter === "No Requirements"
                ? "active noreq-btn"
                : "noreq-btn"
            }
            onClick={() => {

              setActiveLeadFilter(false);

              setShowOverdueOnly(false);

              setStatusFilter("No Requirements");

            }}
          >
            No Req ({stageCounts["No Requirements"]})
          </button>

          <button
            className={
              statusFilter === "Not Interested"
                ? "active notint-btn"
                : "notint-btn"
            }
            onClick={() => {

              setActiveLeadFilter(false);

              setShowOverdueOnly(false);

              setStatusFilter("Not Interested");

            }}
          >
            Not Interested ({stageCounts["Not Interested"]})
          </button>

          <button
            className={
              statusFilter === "Do not call"
                ? "active donotcall-btn"
                : "donotcall-btn"
            }
            onClick={() => {

              setActiveLeadFilter(false);

              setShowOverdueOnly(false);

              setStatusFilter("Do not call");

            }}
          >
            Do Not Call ({stageCounts["Do not call"]})
          </button>

        </div>

     

        <div className="telecaller-filter">

          <select
            value={telecallerFilter}
            onChange={(e) =>
              setTelecallerFilter(
                e.target.value
              )
            }
          >

            <option value="ALL">
              All Telecallers
            </option>

            {telecallers.map((name, index) => (

              <option
                key={index}
                value={name}
              >
                {name}
              </option>

            ))}

          </select>

        </div>

        

        <div className="followup-filter">

          <input
            type="date"
            value={followupDate}
            onChange={(e) =>
              setFollowupDate(
                e.target.value
              )
            }
          />

          <button
            onClick={() =>
              setAppliedFollowup(
                followupDate
              )
            }
          >
            Filter
          </button>

          <button
            onClick={() =>
              setAppliedFollowup("")
            }
          >
            Clear
          </button>

        </div>

      </div>


      <div className="month-year-filter">

        <select
          value={selectedMonth}
          onChange={(e) =>
            setSelectedMonth(
              Number(e.target.value)
            )
          }
        >

          {Array.from(
            { length: 12 },
            (_, i) => (

              <option
                key={i + 1}
                value={i + 1}
              >

                {new Date(0, i).toLocaleString(
                  "default",
                  {
                    month: "long",
                  }
                )}

              </option>

            )
          )}

        </select>

        <select
          value={selectedYear}
          onChange={(e) =>
            setSelectedYear(
              Number(e.target.value)
            )
          }
        >

          {Array.from(
            { length: 5 },
            (_, i) => (

              <option
                key={i}
                value={2024 + i}
              >
                {2024 + i}
              </option>

            )
          )}

        </select>

      </div>

     
{
  !isMobile ? (
      <table className="history-table">

        <thead>

          <tr>

            <th>Date</th>

            <th>Stage</th>

            <th>Quotation No</th>

            <th>Quotation Amount</th>

            <th>PO No</th>

            <th>Items</th>

            <th>Last Remark</th>

            <th>Status</th>

            <th>Follow-up</th>

            <th>Name</th>

            <th>Phone</th>

            <th>Telecaller</th>

            <th>Executive</th>

            <th>Delete</th>

          </tr>

        </thead>

        <tbody>

          {Object.keys(weeklyData).length > 0 ? (

            Object.entries(weeklyData).map(
              ([week, records]) => (

                <React.Fragment key={week}>

                  {/* WEEK HEADER */}

                  <tr className="week-header">

                    <td colSpan="14">

                      <strong>{week}</strong>

                      {" "}({records.length} Calls)

                    </td>

                  </tr>

                  {/* GROUP BY PLACE */}

                  {Object.values(

                    records.reduce((acc, item) => {

                      const key =
                        `${item.PLACE}-${item.AREA}`;

                      if (!acc[key]) {

                        acc[key] = {
                          PLACE: item.PLACE,
                          AREA: item.AREA,
                          REGION: item.PARENT_AREA,
                          records: [],
                        };
                      }

                      acc[key].records.push(item);

                      return acc;

                    }, {})

                  ).map((group, groupIndex) => (

                    <React.Fragment
                      key={`${week}-${groupIndex}`}
                    >

                      

                      <tr className="group-header">

                        <td colSpan="14">

                          <span
                            className="place-link"
                            onClick={() =>
                              navigate(
                                `/call-entry/${group.records[0].kseb_id}`,
                                {
                                  state:
                                    group.records[0],
                                }
                              )
                            }
                            style={{
                              cursor: "pointer",
                              color: "#2563eb",
                              fontWeight: "600",
                            }}
                          >

                            {group.PLACE}

                          </span>

                          {" — "}

                          {group.AREA}

                          {group.REGION
                            ? ` | ${group.REGION}`
                            : ""}

                        </td>

                      </tr>

                     

                      {group.records.map(
                        (c, index) => (

                          <tr
                            key={`${week}-${groupIndex}-${index}`}
                          >

                            <td>
                              {c.call_date || "-"}
                            </td>

                           

                            <td>

                              <span
                                className={`stage-badge ${c.status === "Quotation" ||
                                  c.status === "Quotation Sent" ||
                                  c.status === "Quotation Requested" ||
                                  c.status === "Quotation Notice"
                                  ? "quotation-stage"
                                  : c.status === "PO" ||
                                    c.status === "PO Received"
                                    ? "po-stage"
                                    : ""
                                  }`}
                              >

                                {c.status}

                              </span>

                            </td>

                           

                            <td>
                              {c.quotation_no || "-"}
                            </td>


                            <td>

                              {c.quotation_amount &&
                                c.quotation_amount !== "-" &&
                                !isNaN(c.quotation_amount)

                                ? `₹${Number(
                                  c.quotation_amount
                                ).toLocaleString()}`

                                : "-"}

                            </td>

                           

                            <td>
                              {c.po_no || "-"}
                            </td>

                           

                            <td>

                              {c.item_details
                                ? c.item_details.substring(
                                  0,
                                  50
                                )
                                : "-"}

                            </td>

                            

                            <td title={c.remarks}>

                              {(c.remarks || "-").substring(
                                0,
                                40
                              )}

                            </td>

                            

                            <td>

                              <span
                                className={
                                  closedStatuses.includes(
                                    c.status
                                  )
                                    ? "closed-status"
                                    : "active-status"
                                }
                              >

                                {closedStatuses.includes(
                                  c.status
                                )
                                  ? "Closed"
                                  : "Active"}

                              </span>

                            </td>

                            

                            <td>
                              {c.followup_date || "-"}
                            </td>

                          

                            <td>
                              {c.NAME || "-"}
                            </td>


                            <td>
                              {c.phone || "-"}
                            </td>

                            

                            <td>
                              {c.telecaller_name || "-"}
                            </td>

                          

                            <td>
                              {c.executive_name || "-"}
                            </td>

                            

                            <td>

                              <span
                                className="delete-icon"
                                onClick={() =>
                                  handleDelete(c.id)
                                }
                                title="Delete"
                              >
                                🗑️
                              </span>

                            </td>

                          </tr>

                        )
                      )}

                    </React.Fragment>

                  ))}

                </React.Fragment>

              )
            )

          ) : (

            <tr>

              <td colSpan="14">

                No call history available

              </td>

            </tr>

          )}

        </tbody>

      </table>
      ) : (
    <div className="mobile-history">
      {Object.keys(weeklyData).length > 0 ? (

        Object.entries(weeklyData).map(([week, records]) => (

          <div key={week}>

            <div className="mobile-week-header">
              {week} ({records.length} Calls)
            </div>

            {Object.values(

              records.reduce((acc, item) => {

                const key = `${item.PLACE}-${item.AREA}`;

                if (!acc[key]) {
                  acc[key] = {
                    PLACE: item.PLACE,
                    AREA: item.AREA,
                    REGION: item.PARENT_AREA,
                    records: [],
                  };
                }

                acc[key].records.push(item);

                return acc;

              }, {})

            ).map((group, groupIndex) => (

              <div key={groupIndex}>

                <div
                  className="mobile-group-header"
                  onClick={() =>
                    navigate(
                      `/call-entry/${group.records[0].kseb_id}`,
                      {
                        state: group.records[0],
                      }
                    )
                  }
                >
                  📍 {group.PLACE} — {group.AREA}
                  {group.REGION && ` | ${group.REGION}`}
                </div>

                {group.records.map((c) => (

                  <div
                    key={c.id}
                    className="mobile-call-card"
                  >

                    <div className="card-top">

                      <div>

                        <h4>{c.NAME || "-"}</h4>

                        <p>📞 {c.phone || "-"}</p>

                      </div>

                      <span
                        className={`stage-badge ${
                          c.status === "Quotation" ||
                          c.status === "Quotation Sent" ||
                          c.status === "Quotation Requested" ||
                          c.status === "Quotation Notice"
                            ? "quotation-stage"
                            : c.status === "PO" ||
                              c.status === "PO Received"
                            ? "po-stage"
                            : ""
                        }`}
                      >
                        {c.status}
                      </span>

                    </div>

                    <div className="mobile-details">

                      <p>
                        <strong>Date:</strong>{" "}
                        {c.call_date || "-"}
                      </p>

                      <p>
                        <strong>Quotation:</strong>{" "}
                        {c.quotation_no || "-"}
                      </p>

                      <p>
                        <strong>Amount:</strong>{" "}
                        {c.quotation_amount
                          ? `₹${Number(
                              c.quotation_amount
                            ).toLocaleString()}`
                          : "-"}
                      </p>

                      <p>
                        <strong>PO:</strong>{" "}
                        {c.po_no || "-"}
                      </p>

                      <p>
                        <strong>Items:</strong>{" "}
                        {c.item_details || "-"}
                      </p>

                      <p>
                        <strong>Remark:</strong>{" "}
                        {c.remarks || "-"}
                      </p>

                      <p>
                        <strong>Follow-up:</strong>{" "}
                        {c.followup_date || "-"}
                      </p>

                      <p>
                        <strong>Telecaller:</strong>{" "}
                        {c.telecaller_name || "-"}
                      </p>

                      <p>
                        <strong>Executive:</strong>{" "}
                        {c.executive_name || "-"}
                      </p>

                    </div>

                    <div className="mobile-actions">

                      <button
                        onClick={() =>
                          navigate(
                            `/call-entry/${c.kseb_id}`,
                            {
                              state: c,
                            }
                          )
                        }
                      >
                        Update
                      </button>

                      <button
                        className="delete-btn"
                        onClick={() =>
                          handleDelete(c.id)
                        }
                      >
                        Delete
                      </button>

                    </div>

                  </div>

                ))}

              </div>

            ))}

          </div>

        ))

      ) : (

        <p>No call history available</p>

      )}
    </div>
  )
}

    </>

  );
}