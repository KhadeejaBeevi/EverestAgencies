import Banner from "../Banner/Banner.jsx";
import { useState, useEffect, useMemo } from "react";
import "./postdatedCheques.css";
import { apiFetch } from "../../api/apiClient";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";


const months = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
];


const getFinancialYear = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0 = Jan

  const startYear = month < 3 ? year - 1 : year;

  return {
    start: startYear,



    end: startYear + 1,
  };
};

const financialYear = getFinancialYear();

const formatINR = (amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount || 0);
};


const getMonthIndex = (month) => {
  return new Date(`${month} 1, 2000`).getMonth();
};

const getYear = (month) => {
  const index = getMonthIndex(month);

  return index < 3
    ? financialYear.end
    : financialYear.start;
};

const PostDatedCheques = () => {
  const [userRole, setUserRole] = useState("");

  const getCurrentFinancialMonth = () => {
    const currentMonthIndex = new Date().getMonth();

    return months.find(
      (month) => getMonthIndex(month) === currentMonthIndex
    ) || "April";
  };
const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentFinancialMonth());
  const [chequesData, setChequesData] = useState([]);
  const [loading, setLoading] = useState(true);

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


 useEffect(() => {
  const fetchCheques = () => {
    apiFetch("/serverphp/postdatedcheques.php")
      .then((res) => res.json())
      .then((response) => {
        if (response.status === "success") {
          setChequesData(response.data || []);
        } else {
          setChequesData([]);
        }

        setLastUpdated(new Date());   // <-- Update refresh time
        setLoading(false);
      })
      .catch((err) => {
        console.error("FETCH ERROR:", err);
        setLoading(false);
      });
  };

  // Initial fetch
  fetchCheques();

  // Refresh every minute
  const interval = setInterval(fetchCheques, 60000);

  return () => clearInterval(interval);
}, []);




  const matrixData = useMemo(() => {
    const result = {};
    let grandCleared = 0;
    let grandPending = 0;

    const selectedMonthIndex = getMonthIndex(selectedMonth);
    const selectedYear = getYear(selectedMonth);

    chequesData.forEach((c) => {
      if (!c.date) return;

      let displayDate = c.date;
      const hasBankDate = c.bank_date && c.bank_date !== "1970-01-01";

      if (hasBankDate) {
        displayDate = c.bank_date;
      }

      const d = new Date(displayDate + "T00:00:00");
      if (isNaN(d)) return;

      const day = d.getDate();
      const month = d.getMonth();
      const year = d.getFullYear();

      if (month !== selectedMonthIndex || year !== selectedYear) return;

      const debit = Number(c.debit_amount) || 0;
      const credit = Number(c.credit_amount) || 0;
      const net = debit + credit;

      if (!result[day]) {
        result[day] = {
          clearedTotal: 0,
          pendingTotal: 0,
          items: []
        };
      }

      result[day].items.push(c);

      if (hasBankDate) {
        result[day].clearedTotal += net;
        grandCleared += net;
      } else {
        result[day].pendingTotal += net;
        grandPending += net;
      }
    });

    return { result, grandCleared, grandPending };
  }, [chequesData, selectedMonth]);


  const weeks = useMemo(() => {
    const year = getYear(selectedMonth);
    const monthIndex = getMonthIndex(selectedMonth);

    const firstDay = new Date(year, monthIndex, 1).getDay();
    const startIndex = (firstDay + 6) % 7;

    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startIndex; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }

    return rows;
  }, [selectedMonth]);



  return (
    <div className="post-container">
      <Banner />


      <h2 className="fy-title">
        Financial Year {financialYear.start}-{financialYear.end}
      </h2>

      {lastUpdated && (
        <div className="last-updated">
          Last Updated: {lastUpdated.toLocaleTimeString("en-IN")}
        </div>
      )}
      {weeks
        .filter(week => week.some(day => day !== null))
        .map((weekDays, wIndex) => {

          const totals = weekDays.reduce(
            (acc, day) => {
              if (!day) return acc;

              const cell = matrixData.result[day];
              acc.cleared += cell?.clearedTotal || 0;
              acc.pending += cell?.pendingTotal || 0;

              return acc;
            },
            { cleared: 0, pending: 0 }
          );

          return (
            <div key={wIndex} className="week-grid">
              <div className="week-name">Week {wIndex + 1}</div>

              {weekDays.map((day, i) => {
                if (!day) {
                  return <div key={`empty-${i}`} className="day-box empty"></div>;
                }

                const cell = matrixData.result[day];
                const clearedTotal = cell?.clearedTotal || 0;
                const pendingTotal = cell?.pendingTotal || 0;

                const dateObj = new Date(
                  getYear(selectedMonth),
                  getMonthIndex(selectedMonth),
                  day
                );

                const dayName = dateObj.toLocaleDateString("en-IN", {
                  weekday: "short"
                });

                return (
                  <div key={day} className="day-box">
                    <div className="day-title">
                      <div>{dayName}</div>
                      <div>{day}</div>
                    </div>

                    <div className="day-header">
                      <span>Particulars</span>
                      <span>Amount</span>
                    </div>

                    {cell?.items?.map((c, idx) => {
                      const debit = Number(c.debit_amount) || 0;
                      const credit = Number(c.credit_amount) || 0;

                      const isCleared =
                        c.bank_date && c.bank_date !== "1970-01-01";

                      return (
                        <div
                          key={idx}
                          className={`entry ${isCleared ? "prevpdc" : "not-prev"}`}
                        >
                          <span>{c.particulars}</span>
                          <span className="amount">
                            {formatINR(credit > 0 ? credit : debit)}
                          </span>
                        </div>
                      );
                    })}


                    <div className="day-total">
                      <div className="left">
                        {pendingTotal !== 0 && (
                          <span className="not-prev-total">
                            {formatINR(pendingTotal)}
                          </span>
                        )}
                      </div>
                      <div className="right">
                        {clearedTotal !== 0 && (
                          <span className="prev-total">
                            {formatINR(clearedTotal)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}


              <div className="week-total-box">
                {totals.pending !== 0 && (
                  <div className="not-prev-total">
                    {formatINR(totals.pending)}
                  </div>
                )}
                {totals.cleared !== 0 && (
                  <div className="prev-total">
                    {formatINR(totals.cleared)}
                  </div>
                )}
              </div>

            </div>
          );
        })}


      <div className="grand-total">
        {matrixData.grandPending !== 0 && (
          <div className="not-prev-total">
            {formatINR(matrixData.grandPending)}
          </div>
        )}
        {matrixData.grandCleared !== 0 && (
          <div className="prev-total">
            {formatINR(matrixData.grandCleared)}
          </div>
        )}
      </div>


      <div className="month-bar-fixed">
        {months.map((m) => (
          <div
            key={m}
            className={`month-cell ${selectedMonth === m ? "active" : ""}`}
            onClick={() => setSelectedMonth(m)}
          >
            {m}
          </div>
        ))}
      </div>

    </div>
  );
};

export default PostDatedCheques;