
import Banner from "../../components/Banner/Banner.jsx";
import "./KsebDirectory.css";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import { auth, db } from "../../components/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useLocation } from "react-router-dom";
import React, { useEffect, useState, useRef } from "react";
import { apiFetch } from "../../api/apiClient";

const API = "/serverphp";

export default function KsebDirectory() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [search, setSearch] = useState("");

  const [areaFilter, setAreaFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [callHistoryMap, setCallHistoryMap] = useState({});
  const [allContactedSet, setAllContactedSet] = useState(new Set());
  const [hierarchyMap, setHierarchyMap] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [region, setRegion] = useState("");
  const [callHistorySet, setCallHistorySet] = useState(new Set());
  const [selectedCircle, setSelectedCircle] = useState(null);
  const [circleTree, setCircleTree] = useState(null);
  const [activeCard, setActiveCard] = useState(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const targetPlace = location.state?.targetPlace || "";
  const totalCount = data.length;

  const [contactFilter, setContactFilter] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const contactedCount = data.filter((i) =>
    callHistorySet.has(i.id)
  ).length;

  const selectedRecords = location.state?.selectedRecords || [];

  const nonContactedCount = totalCount - contactedCount;

  const [userLocation, setUserLocation] = useState(null);
  const [userRole, setUserRole] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("all");

  // =========================================================
  // TALLY LEDGER STATE
  // =========================================================

  const [tallyLedgers, setTallyLedgers] = useState([]);

  // =========================================================
  // USER ROLE
  // =========================================================

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

  // =========================================================
  // LOAD KSEB DIRECTORY + TALLY LEDGERS
  // =========================================================

  useEffect(() => {
    apiFetch(`${API}/ksebdirectory.php`)
      .then((res) => res.json())
      .then((result) => {
        if (result.status === "success") {
          setData(result.data || []);
          setFilteredData(result.data || []);

          // Tally ledger names coming from salesdatalatest33
          setTallyLedgers(result.tallyLedgers || []);
        }
      })
      .catch(console.error);
  }, []);

  // =========================================================
  // CALL HISTORY
  // =========================================================

  const [callHistory, setCallHistory] = useState([]);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        console.log(error);
      }
    );
  }, []);

  // =========================================================
  // TARGET PLACE
  // =========================================================

  useEffect(() => {
    if (!targetPlace || filteredData.length === 0) return;

    setTimeout(() => {
      const element = document.getElementById(
        `place-${targetPlace}`
      );

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        element.classList.add("highlight-card");

        setTimeout(() => {
          element.classList.remove("highlight-card");
        }, 3000);
      }

      navigate(location.pathname, {
        replace: true,
        state: {},
      });
    }, 500);
  }, [targetPlace, filteredData]);

  // =========================================================
  // DISTANCE
  // =========================================================

  const calculateDistance = (
    lat1,
    lon1,
    lat2,
    lon2
  ) => {
    const toRad = (value) =>
      (value * Math.PI) / 180;

    const R = 6371;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return (R * c).toFixed(1);
  };

  // =========================================================
  // CALL HISTORY MAP
  // =========================================================

  useEffect(() => {
    const ids = [];
    const map = {};

    callHistory.forEach((c) => {
      if (!c.call_date) return;

      const month = c.call_date.slice(0, 7);

      if (
        !map[c.kseb_id] ||
        new Date(c.call_date) >
        new Date(map[c.kseb_id].call_date)
      ) {
        map[c.kseb_id] = {
          month,
          status: c.status,
          remarks: c.remarks,
          call_date: c.call_date,
        };
      }

      if (month === selectedMonth) {
        if (selectedWeek === "all") {
          ids.push(c.kseb_id);
        } else {
          const week = getWeekOfMonth(c.call_date);

          if (week === Number(selectedWeek)) {
            ids.push(c.kseb_id);
          }
        }
      }
    });

    setCallHistorySet(new Set(ids));
    setCallHistoryMap(map);
  }, [callHistory, selectedMonth, selectedWeek]);

  // =========================================================
  // LOAD CALLS
  // =========================================================

  useEffect(() => {
    apiFetch(`${API}/get_all_calls.php`)
      .then((res) => res.json())
      .then((res) => {
        if (res.status === "success") {
          console.log("CALL HISTORY DATA:", res.data);
          setCallHistory(res.data);
        }
      })
      .catch(console.error);
  }, []);

  const normalize = (text) =>
    (text || "")
      .toLowerCase()
      .replace(/[\s-]/g, "");

  // =========================================================
  // HIERARCHY MAP
  // =========================================================

  useEffect(() => {
    const map = {};

    let currentRegion = "";
    let currentCircle = "";
    let currentDivision = "";
    let currentSubdivision = "";

    data.forEach((item) => {
      const area = normalize(item.AREA);
      const place = (item.PLACE || "").trim();
      const parentArea = (item.PARENT_AREA || "").trim();

      if (parentArea) {
        currentRegion = parentArea;
      }

      if (
        area === "circle" ||
        (area.includes("circle") && !area.includes("division"))
      ) {
        currentCircle = place;
        currentDivision = "";
        currentSubdivision = "";
      } else if (
        area === "division" ||
        (area.includes("division") && !area.includes("subdivision"))
      ) {
        currentDivision = place;
        currentSubdivision = "";
      } else if (
        area === "subdivision" ||
        area.includes("subdivision")
      ) {
        currentSubdivision = place;
      }

      map[item.id] = {
        region: currentRegion || parentArea,
        circle: currentCircle,
        division: currentDivision,
        subdivision: currentSubdivision,
      };
    });

    setHierarchyMap(map);
  }, [data]);

  // =========================================================
  // BUILD CIRCLE TREE
  // =========================================================

  // =========================================================

  const buildTree = (circleObj) => {
    const tree = {
      pmu: {},
      noPmu: {
        divisions: {},
      },
    };

    const selectedCircleName = normalize(circleObj?.name);
    const selectedRegion = normalize(circleObj?.region);

    const circleItems = data.filter((item) => {
      const h = hierarchyMap[item.id];

      if (!h) return false;

      const circleMatch =
        normalize(h.circle) === selectedCircleName;

      const regionMatch =
        !selectedRegion ||
        normalize(h.region) === selectedRegion;

      return circleMatch && regionMatch;
    });

    if (circleItems.length === 0) {
      return tree;
    }

    circleItems.forEach((item) => {
      const area = normalize(item.AREA);

      if (area === "pmu" || area.includes("pmu")) {
        if (!tree.pmu[item.PLACE]) {
          tree.pmu[item.PLACE] = {
            data: item,
            divisions: {},
          };
        }
      }
    });

    const pmuKeys = Object.keys(tree.pmu);

    const parents =
      pmuKeys.length > 0
        ? pmuKeys.map((key) => tree.pmu[key])
        : [tree.noPmu];

    // Create divisions under every applicable parent.
    circleItems.forEach((item) => {
      const area = normalize(item.AREA);

      const isDivision =
        area === "division" ||
        (area.includes("division") &&
          !area.includes("subdivision"));

      if (!isDivision) return;

      const h = hierarchyMap[item.id];

      parents.forEach((parent) => {
        if (!parent.divisions[item.PLACE]) {
          parent.divisions[item.PLACE] = {
            data: item,
            subdivisions: {},
          };
        }
      });
    });

    // Create subdivisions.
    circleItems.forEach((item) => {
      const area = normalize(item.AREA);

      if (
        area !== "subdivision" &&
        !area.includes("subdivision")
      ) {
        return;
      }

      const h = hierarchyMap[item.id];

      if (!h?.division) return;

      parents.forEach((parent) => {
        const division = parent.divisions[h.division];

        if (!division) return;

        if (!division.subdivisions[item.PLACE]) {
          division.subdivisions[item.PLACE] = {
            data: item,
            sections: [],
          };
        }
      });
    });

    // Add sections.
    circleItems.forEach((item) => {
      const area = normalize(item.AREA);

      if (
        area !== "section" &&
        !area.includes("section")
      ) {
        return;
      }

      const h = hierarchyMap[item.id];

      if (!h?.division || !h?.subdivision) {
        return;
      }

      parents.forEach((parent) => {
        const division = parent.divisions[h.division];

        if (!division) return;

        const subdivision =
          division.subdivisions[h.subdivision];

        if (!subdivision) return;

        const alreadyExists = subdivision.sections.some(
          (section) => section.id === item.id
        );

        if (!alreadyExists) {
          subdivision.sections.push(item);
        }
      });
    });

    return tree;
  };

// =========================================================
  // HANDLE CLICK OUTSIDE
  // =========================================================

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!selectedCircle) return;

      if (
        panelRef.current &&
        !panelRef.current.contains(event.target)
      ) {
        setSelectedCircle(null);
        setCircleTree(null);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, [selectedCircle]);

  useEffect(() => {
    if (!selectedCircle) {
      setCircleTree(null);
      return;
    }

    if (Object.keys(hierarchyMap).length === 0) {
      setCircleTree(null);
      return;
    }

    const tree = buildTree(selectedCircle);

    console.log("SELECTED CIRCLE:", selectedCircle);
    console.log("CIRCLE TREE:", tree);

    setCircleTree(tree);
  }, [selectedCircle, hierarchyMap, data]);

  // =========================================================
  // RESET
  // =========================================================

  const handleReset = () => {
    setRegion("");
    setSearch("");
    setAreaFilter("");
    setActiveCard(null);
    setContactFilter("");
    setSelectedMonth(
      new Date().toISOString().slice(0, 7)
    );
    setSelectedWeek("all");
  };

  // =========================================================
  // REGIONS
  // =========================================================

  const getRegions = () => {
    return [
      ...new Set(
        data.map((i) => i.PARENT_AREA)
      ),
    ];
  };

  // =========================================================
  // FORM CHANGE
  // =========================================================

  const handleChange = (e, field) => {
    setEditData({
      ...editData,
      [field]: e.target.value,
    });
  };

  // =========================================================
  // FILTER DATA
  // =========================================================

  useEffect(() => {
    let temp = [...data];

    if (
      areaFilter !== "distribution" &&
      !search
    ) {
      temp = temp.filter(
        (i) =>
          normalize(i.AREA) !==
          normalize("distribution")
      );
    }

    if (
      areaFilter !==
      "CONSUMER GRIVENCES REDRESSAL FORUM" &&
      !search
    ) {
      temp = temp.filter(
        (i) =>
          normalize(i.AREA) !==
          normalize(
            "CONSUMER GRIVENCES REDRESSAL FORUM"
          )
      );
    }

    if (region) {
      temp = temp.filter(
        (i) =>
          normalize(i.PARENT_AREA) ===
          normalize(region)
      );
    }

    if (areaFilter) {
      temp = temp.filter(
        (i) =>
          normalize(i.AREA) ===
          normalize(areaFilter)
      );
    }

    if (contactFilter === "contacted") {
      temp = temp.filter((i) =>
        callHistorySet.has(i.id)
      );
    }

    if (
      contactFilter === "non_contacted"
    ) {
      temp = temp.filter((i) => {
        const area = normalize(i.AREA);

        return (
          !callHistorySet.has(i.id) &&
          !area.includes("distribution") &&
          !area.includes("pmu") &&
          !area.includes("consumer") &&
          !area.includes("cgrf")
        );
      });
    }

    if (search) {
      temp = temp.filter((item) =>
        Object.values(item)
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    }

    setFilteredData(temp);
  }, [
    search,
    areaFilter,
    region,
    contactFilter,
    data,
    callHistorySet,
  ]);

  // =========================================================
  // USED TALLY NAMES
  // =========================================================

  const usedTallyNames = new Set(
    data
      .map((item) =>
        (item.tally_name || "").trim()
      )
      .filter(Boolean)
  );

  // =========================================================
  // GET AVAILABLE TALLY LEDGERS
  // =========================================================

  const getAvailableTallyLedgers = (
    currentItem
  ) => {
    const currentTallyName =
      (currentItem.tally_name || "").trim();

    return tallyLedgers.filter((ledger) => {
      const ledgerName = (
        ledger || ""
      ).trim();

      // Current card keeps its own selected ledger
      if (
        currentTallyName &&
        ledgerName === currentTallyName
      ) {
        return true;
      }

      // Hide ledger already assigned elsewhere
      return !usedTallyNames.has(
        ledgerName
      );
    });
  };

  // =========================================================
  // SAVE
  // =========================================================

const handleSave = async () => {
  try {
    const payload = {
      ...editData,
      tally_name: (editData?.tally_name || "").trim(),
    };

    const response = await apiFetch(`${API}/update_kseb.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    let result;

    try {
      result = JSON.parse(responseText);
    } catch (jsonError) {
      console.error("PHP RESPONSE:", responseText);
      alert("Server returned an invalid response. Check update_kseb.php.");
      return;
    }

    if (result.status !== "success") {
      alert(result.message || "Update failed");
      return;
    }

    const updatedItem = {
      ...selectedItem,
      ...payload,
      tally_name: result.tally_name ?? payload.tally_name ?? "",
    };

    const updatedData = data.map((item) =>
      item.id === payload.id ? updatedItem : item
    );

    setData(updatedData);
    setFilteredData(updatedData);
    setSelectedItem(updatedItem);
    setEditData(updatedItem);
    setIsEditing(false);

    alert("Saved successfully");

  } catch (error) {
    console.error("SAVE ERROR:", error);
    alert("Save failed: " + error.message);
  }
};

  // =========================================================
  // MONTH LIST
  // =========================================================

  const getMonthList = () => {
    const months = [];
    const date = new Date();

    for (let i = 0; i < 12; i++) {
      const d = new Date(
        date.getFullYear(),
        date.getMonth() - i,
        1
      );

      const value =
        d.getFullYear() +
        "-" +
        String(
          d.getMonth() + 1
        ).padStart(2, "0");

      const label =
        d.toLocaleString(
          "default",
          {
            month: "long",
            year: "numeric",
          }
        );

      months.push({
        value,
        label,
      });
    }

    return months;
  };

  // =========================================================
  // RENDER DIVISION
  // =========================================================

  const RenderDivision = ({
    division,
  }) => {
    const subdivisions =
      Object.values(
        division.subdivisions
      );

    return (
      <div className="tree-division-block">
        <div className="tree-heading division-head">
          DIVISION
        </div>

        <div
          className={`tree-division ${activeCard?.id ===
              division.data.id
              ? "active-highlight"
              : ""
            }`}
          onClick={(e) => {
            e.stopPropagation();

            setActiveCard(
              division.data
            );

            setSelectedCircle(null);
          }}
        >
          {division.data.PLACE}
        </div>

        {subdivisions.map(
          (sub) => (
            <div
              key={sub.data.id}
            >
              <div className="tree-heading">
                SUBDIVISION
              </div>

              <div
                className={`tree-subdivision ${activeCard?.id ===
                    sub.data.id
                    ? "active-highlight"
                    : ""
                  }`}
                onClick={(e) => {
                  e.stopPropagation();

                  setActiveCard(
                    sub.data
                  );

                  setSelectedCircle(
                    null
                  );
                }}
              >
                {sub.data.PLACE}
              </div>

              {sub.sections.length >
                0 && (
                  <div className="tree-heading section-head">
                    SECTION
                  </div>
                )}

              {sub.sections.map(
                (sec) => (
                  <div
                    key={sec.id}
                    className={`tree-section ${activeCard?.id ===
                        sec.id
                        ? "active-highlight"
                        : ""
                      }`}
                    onClick={(e) => {
                      e.stopPropagation();

                      setActiveCard(
                        sec
                      );

                      setSelectedCircle(
                        null
                      );
                    }}
                  >
                    {sec.PLACE}
                  </div>
                )
              )}
            </div>
          )
        )}
      </div>
    );
  };

  // =========================================================
  // DOWNLOAD NON CONTACTED
  // =========================================================

  const downloadYearWiseNonContacted =
    () => {
      const workbook =
        XLSX.utils.book_new();

      const [
        year,
        month,
      ] =
        selectedMonth.split("-");

      for (
        let m = 1;
        m <= Number(month);
        m++
      ) {
        const currentMonth =
          `${year}-${String(
            m
          ).padStart(2, "0")}`;

        const contactedIds =
          new Set();

        callHistory.forEach(
          (call) => {
            if (
              call.call_date &&
              call.call_date.slice(
                0,
                7
              ) === currentMonth
            ) {
              contactedIds.add(
                call.kseb_id
              );
            }
          }
        );

        const nonContacted =
          data
            .filter((item) => {
              const area =
                normalize(
                  item.AREA
                );

              return (
                !contactedIds.has(
                  item.id
                ) &&
                !area.includes(
                  "distribution"
                ) &&
                !area.includes(
                  "pmu"
                ) &&
                !area.includes(
                  "consumer"
                ) &&
                !area.includes(
                  "cgrf"
                )
              );
            })
            .map((item) => {
              const h =
                hierarchyMap[
                item.id
                ] || {};

              const area =
                normalize(
                  item.AREA
                );

              return {
                DISTRIBUTION:
                  h.region || "",

                CIRCLE:
                  h.circle || "",

                DIVISION:
                  area.includes(
                    "division"
                  ) &&
                    !area.includes(
                      "sub"
                    )
                    ? item.PLACE
                    : h.division ||
                    "",

                SUBDIVISION:
                  area.includes(
                    "subdivision"
                  )
                    ? item.PLACE
                    : h.subdivision ||
                    "",

                SECTION:
                  area.includes(
                    "section"
                  )
                    ? item.PLACE
                    : "",

                TALLY_NAME:
                  item.tally_name ||
                  "",
              };
            });

        const sheet =
          XLSX.utils.json_to_sheet(
            nonContacted,
            {
              header: [
                "DISTRIBUTION",
                "CIRCLE",
                "DIVISION",
                "SUBDIVISION",
                "SECTION",
                "TALLY_NAME",
              ],
            }
          );

        XLSX.utils.book_append_sheet(
          workbook,
          sheet,
          new Date(
            year,
            m - 1
          ).toLocaleString(
            "default",
            {
              month: "short",
            }
          )
        );
      }

      const excelBuffer =
        XLSX.write(
          workbook,
          {
            bookType: "xlsx",
            type: "array",
          }
        );

      const file = new Blob(
        [excelBuffer],
        {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
      );

      saveAs(
        file,
        `Non_Contacted_${year}_Till_${month}.xlsx`
      );
    };

  // =========================================================
  // WEEK OF MONTH
  // =========================================================

  const getWeekOfMonth = (
    dateStr
  ) => {
    const date =
      new Date(dateStr);

    const firstDay =
      new Date(
        date.getFullYear(),
        date.getMonth(),
        1
      );

    return Math.ceil(
      (date.getDate() +
        firstDay.getDay()) /
      7
    );
  };

  // =========================================================
  // JSX
  // =========================================================

  return (
    <div className="kseb-directory-container">
      <Banner />

      <h2 className="title">
        KSEB DIRECTORY
      </h2>

      <div className="top-bar">
        <div className="left-section"></div>

        <div className="right-section">
          <div className="count-bar">
            <div className="count total">
              Total: {totalCount}
            </div>

            <div className="count contacted">
              Contacted:{" "}
              {contactedCount}
            </div>

            <div className="count non-contacted">
              Non Contacted:{" "}
              {nonContactedCount}
            </div>
          </div>
        </div>
      </div>

      {/* FILTERS */}

      <div className="filters">
        <select
          className="region-search"
          value={region}
          onChange={(e) =>
            setRegion(
              e.target.value
            )
          }
        >
          <option value="">
            REGION
          </option>

          {getRegions().map(
            (r, i) => (
              <option
                key={i}
                value={r}
              >
                {r}
              </option>
            )
          )}
        </select>

        <div className="filter-buttons">
          <button
            className={`btn-all ${areaFilter === ""
                ? "active"
                : ""
              }`}
            onClick={() =>
              setAreaFilter("")
            }
          >
            ALL
          </button>

          <button
            className={`btn-division ${areaFilter ===
                "distribution"
                ? "active"
                : ""
              }`}
            onClick={() =>
              setAreaFilter(
                "distribution"
              )
            }
          >
            DISTRIBUTION
          </button>

          <button
            className={`btn-cgrf ${areaFilter ===
                "CONSUMER GRIVENCES REDRESSAL FORUM"
                ? "active"
                : ""
              }`}
            onClick={() =>
              setAreaFilter(
                "CONSUMER GRIVENCES REDRESSAL FORUM"
              )
            }
          >
            CGRF
          </button>

          <button
            className={`btn-circle ${areaFilter ===
                "circle"
                ? "active"
                : ""
              }`}
            onClick={() =>
              setAreaFilter("circle")
            }
          >
            CIRCLE
          </button>

          <button
            className={`btn-pmu ${areaFilter ===
                "pmu(projectmanagementunit)"
                ? "active"
                : ""
              }`}
            onClick={() =>
              setAreaFilter(
                "pmu(projectmanagementunit)"
              )
            }
          >
            PMU
          </button>

          <button
            className={`btn-division ${areaFilter ===
                "division"
                ? "active"
                : ""
              }`}
            onClick={() =>
              setAreaFilter(
                "division"
              )
            }
          >
            DIVISION
          </button>

          <button
            className={`btn-subdivision ${areaFilter ===
                "subdivision"
                ? "active"
                : ""
              }`}
            onClick={() =>
              setAreaFilter(
                "subdivision"
              )
            }
          >
            SUBDIVISION
          </button>

          <button
            className={`btn-section ${areaFilter ===
                "section"
                ? "active"
                : ""
              }`}
            onClick={() =>
              setAreaFilter(
                "section"
              )
            }
          >
            SECTION
          </button>
        </div>

        <div className="contact-filter-group">
          <button
            className={`contact-btn contacted ${contactFilter ===
                "contacted"
                ? "active"
                : ""
              }`}
            onClick={() =>
              setContactFilter(
                "contacted"
              )
            }
          >
            CONTACTED
          </button>

          <select
            value={selectedMonth}
            onChange={(e) =>
              setSelectedMonth(
                e.target.value
              )
            }
          >
            {getMonthList().map(
              (m) => (
                <option
                  key={m.value}
                  value={m.value}
                >
                  {m.label}
                </option>
              )
            )}
          </select>

          <select
            value={selectedWeek}
            onChange={(e) =>
              setSelectedWeek(
                e.target.value
              )
            }
          >
            <option value="all">
              All Weeks
            </option>

            <option value="1">
              Week 1
            </option>

            <option value="2">
              Week 2
            </option>

            <option value="3">
              Week 3
            </option>

            <option value="4">
              Week 4
            </option>

            <option value="5">
              Week 5
            </option>
          </select>

          <div className="dropdown-wrapper">
            <button
              className={`contact-btn non-contacted ${contactFilter ===
                  "non_contacted"
                  ? "active"
                  : ""
                }`}
              onClick={() =>
                setContactFilter(
                  "non_contacted"
                )
              }
            >
              NON CONTACTED ▼
            </button>

            <div className="dropdown-menu">
              <button
                onClick={() =>
                  setContactFilter(
                    "non_contacted"
                  )
                }
              >
                View List
              </button>

              <button
                onClick={
                  downloadYearWiseNonContacted
                }
              >
                Download Report
              </button>
            </div>
          </div>
        </div>

        <button
          className="reset-btn"
          onClick={handleReset}
        >
          RESET
        </button>
      </div>

      {/* SEARCH */}

      <input
        type="text"
        placeholder="Search instantly..."
        className="search-box"
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
      />

      {activeCard && (
        <button
          className="back-btn"
          onClick={(e) => {
            e.stopPropagation();
            setActiveCard(null);
          }}
        >
          ←
        </button>
      )}

      {/* =====================================================
          CARDS
      ===================================================== */}

      <div className="card-container">
        {(activeCard
          ? [activeCard]
          : filteredData
        ).map((item) => {
          const h =
            hierarchyMap[
            item.id
            ] || {};

          const area =
            normalize(
              item.AREA
            );

          const hasTallyName =
            !!(
              item.tally_name &&
              item.tally_name.trim()
            );

          const availableTallyLedgers =
            getAvailableTallyLedgers(
              item
            );

          return (
            <div
              className="office-card"
              key={item.id}
              id={`place-${item.PLACE}`}
            >
              <div className="card-content">
                <h3
                  className="card-title"
                  style={{
                    cursor:
                      "pointer",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();

                    if (
                      area === "circle" ||
                      (area.includes("circle") &&
                        !area.includes("division"))
                    ) {
                      console.log(
                        "CIRCLE CLICKED:",
                        item.PLACE,
                        item.PARENT_AREA
                      );

                      setActiveCard(null);

                      setSelectedCircle({
                        name: item.PLACE,
                        region: item.PARENT_AREA || "",
                      });

                      return;
                    }

                    const h = hierarchyMap[item.id];

                    if (h?.circle) {
                      setSelectedCircle(null);
                      setActiveCard(item);
                    } else {
                      setActiveCard(item);
                    }
                  }}
                >
                  {item.PLACE}
                </h3>

                <h2>
                  {item.AREA}
                </h2>

                <p>
                  <strong
                    style={{
                      color:
                        "darkred",
                    }}
                  >
                    Decision Maker:{" "}
                    {item.NAME}

                    {item.DECISION_MAKER_DESIGNATION && (
                      <>
                        {" "}
                        (
                        {
                          item.DECISION_MAKER_DESIGNATION
                        }
                        )
                      </>
                    )}
                  </strong>

                  {item.decision_maker_updated_at && (
                    <span
                      style={{
                        display:
                          "block",
                        marginTop:
                          "4px",
                        fontSize:
                          "13px",
                        color:
                          "#666",
                      }}
                    >
                      Last Updated:{" "}
                      {new Date(
                        item.decision_maker_updated_at
                      ).toLocaleDateString(
                        "en-IN",
                        {
                          day: "2-digit",
                          month:
                            "short",
                          year:
                            "numeric",
                        }
                      )}
                    </span>
                  )}
                </p>

                {/* TALLY NAME */}
                <p style={{ fontSize: "14px", fontWeight: "400", margin: "8px 0" }}>
                  <strong>Tally Name:</strong>{" "}
                  {item.tally_name ? (
                    <span style={{ fontWeight: "400" }}>
                      {item.tally_name} 
                    </span>
                  ) : (
                    <span style={{ color: "#777", fontWeight: "400" }}>
                      Not Assigned
                    </span>
                  )}
                </p>

                {userLocation &&
                  item.latitude &&
                  item.longitude && (
                    <p>
                      <strong>
                        Distance:
                      </strong>{" "}
                      {calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        parseFloat(
                          item.latitude
                        ),
                        parseFloat(
                          item.longitude
                        )
                      )}{" "}
                      km
                    </p>
                  )}

                <p>
                  <strong>
                    Phone:
                  </strong>{" "}
                  {
                    item.RECEIPTION_CUG
                  }
                </p>

                <p>
                  <strong>
                    Landline:
                  </strong>{" "}
                  {
                    item.RECEIPTION_LAND
                  }
                </p>

                <p>
                  <strong>
                    Email:
                  </strong>{" "}
                  {item.MAIL_ID ||
                    "N/A"}
                </p>

                {area ===
                  "section" && (
                    <p>
                      <strong>
                        Sub Division:
                      </strong>{" "}
                      {
                        h.subdivision
                      }
                    </p>
                  )}

                {(
                  area ===
                  "subdivision" ||
                  area ===
                  "section"
                ) && (
                    <p>
                      <strong>
                        Division:
                      </strong>{" "}
                      {h.division}
                    </p>
                  )}

                {area !==
                  "circle" && (
                    <p>
                      <strong>
                        Circle:
                      </strong>{" "}
                      {h.circle}
                    </p>
                  )}

                <p>
                  <strong>
                    Region:
                  </strong>{" "}
                  {h.region}
                </p>

                {callHistoryMap[
                  item.id
                ] && (
                    <p>
                      <strong>
                        Status: ✅ Contacted :
                      </strong>{" "}
                      {
                        callHistoryMap[
                          item.id
                        ].status
                      }{" "}
                      (
                      {new Date(
                        callHistoryMap[
                          item.id
                        ].month +
                        "-01"
                      ).toLocaleString(
                        "default",
                        {
                          month:
                            "long",
                          year:
                            "numeric",
                        }
                      )}
                      )
                    </p>
                  )}
              </div>

              <button
                className="view-btn"
                onClick={() => {
                  setSelectedItem(
                    item
                  );

                  setEditData({
                    ...item,
                  });

                  setIsEditing(
                    false
                  );
                }}
              >
                View More
              </button>
            </div>
          );
        })}
      </div>

      {/* =====================================================
          SIDE PANEL
      ===================================================== */}

      {selectedCircle && (
        <div
          ref={panelRef}
          className="side-panel open"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-header">
            <h3>
              {
                selectedCircle?.name
              }{" "}
              (
              {
                selectedCircle?.region
              }
              )
            </h3>

            <button
              onClick={() =>
                setSelectedCircle(
                  null
                )
              }
            >
              ✕
            </button>
          </div>

          <div className="panel-content">
            {circleTree && (
              <>
                {Object.keys(
                  circleTree.pmu
                ).length > 0 ? (
                  Object.values(
                    circleTree.pmu
                  ).map(
                    (pmu) => (
                      <div
                        key={
                          pmu.data.id
                        }
                      >
                        <div className="tree-heading">
                          PMU
                        </div>

                        <div
                          className="tree-pmu"
                          onClick={(
                            e
                          ) => {
                            e.stopPropagation();

                            setActiveCard(
                              pmu.data
                            );

                            setSelectedCircle(
                              null
                            );
                          }}
                        >
                          {
                            pmu.data
                              .PLACE
                          }
                        </div>

                        {Object.values(
                          pmu.divisions
                        ).length >
                          0 ? (
                          Object.values(
                            pmu.divisions
                          ).map(
                            (
                              division
                            ) => (
                              <RenderDivision
                                key={
                                  division
                                    .data
                                    .id
                                }
                                division={
                                  division
                                }
                              />
                            )
                          )
                        ) : (
                          <div className="empty-msg">
                            No Divisions
                          </div>
                        )}
                      </div>
                    )
                  )
                ) : (
                  <>
                    <div className="tree-heading">
                      DIVISION
                    </div>

                    {Object.values(
                      circleTree
                        .noPmu
                        .divisions
                    ).length >
                      0 ? (
                      Object.values(
                        circleTree
                          .noPmu
                          .divisions
                      ).map(
                        (
                          division
                        ) => (
                          <RenderDivision
                            key={
                              division
                                .data
                                .id
                            }
                            division={
                              division
                            }
                          />
                        )
                      )
                    ) : (
                      <div className="empty-msg">
                        No Data Found
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          DETAILS MODAL
      ===================================================== */}

      {selectedItem && (
        <div className="modal-overlay">
          <div className="modal-box">
            <button
              className="close-icon"
              onClick={() =>
                setSelectedItem(
                  null
                )
              }
            >
              ×
            </button>

            <h2 className="details">
              {
                selectedItem.PLACE
              }{" "}
              {
                selectedItem.AREA
              }{" "}
              DETAILS
            </h2>

            <table className="details-table">
              <tbody>
                {[
                  [
                    "AREA",
                    "Area",
                  ],
                  [
                    "PARENT_AREA",
                    "Region",
                  ],
                  [
                    "RECEIPTION_CUG",
                    "Reception CUG",
                  ],
                  [
                    "RECEIPTION_LAND",
                    "Reception Land",
                  ],
                ].map(
                  ([
                    field,
                    label,
                  ]) => (
                    <tr
                      key={
                        field
                      }
                    >
                      <td>
                        {label}
                      </td>

                      <td>
                        {
                          selectedItem[
                          field
                          ]
                        }
                      </td>
                    </tr>
                  )
                )}

                {/* =================================================
                    TALLY NAME
                ================================================= */}

                <tr>
  <td>
    <strong>Tally Name</strong>
  </td>

  <td>
    {selectedItem?.tally_name ? (
      <span style={{ fontSize: "14px", fontWeight: "400" }}>
        {selectedItem.tally_name} 
      </span>
    ) : isEditing ? (
      <>
        <input
          type="text"
          list="tally-ledger-options"
          value={editData?.tally_name || ""}
          onChange={(e) => handleChange(e, "tally_name")}
          placeholder="Select or type Tally Name"
          autoComplete="off"
          style={{
            width: "100%",
            padding: "7px 10px",
            fontSize: "14px",
            fontWeight: "400",
            border: "1px solid #ccc",
            borderRadius: "4px",
            backgroundColor: "#fff",
            boxSizing: "border-box",
          }}
        />

        <datalist id="tally-ledger-options">
          {getAvailableTallyLedgers(selectedItem).map((ledger) => (
            <option key={ledger} value={ledger} />
          ))}
        </datalist>
      </>
    ) : (
      <span
        style={{
          fontSize: "14px",
          fontWeight: "400",
          color: "#777",
        }}
      >
        Not Assigned
      </span>
    )}
  </td>
</tr>

                {/* DECISION MAKER */}

                <tr>
                  <td>
                    Decision Maker
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        value={
                          editData?.NAME ??
                          ""
                        }
                        onChange={(
                          e
                        ) =>
                          handleChange(
                            e,
                            "NAME"
                          )
                        }
                      />
                    ) : (
                      selectedItem.NAME ||
                      "-"
                    )}
                  </td>
                </tr>

                {/* DESIGNATION */}

                <tr>
                  <td>
                    Designation
                  </td>

                  <td>
                    {isEditing ? (
                      <select
                        value={
                          editData?.DECISION_MAKER_DESIGNATION ??
                          ""
                        }
                        onChange={(
                          e
                        ) =>
                          handleChange(
                            e,
                            "DECISION_MAKER_DESIGNATION"
                          )
                        }
                      >
                        <option value="">
                          Select Designation
                        </option>

                        <option value="Deputy Chief Engineer">
                          Deputy Chief Engineer
                        </option>

                        <option value="Chief Engineer">
                          Chief Engineer
                        </option>

                        <option value="Executive Engineer">
                          Executive Engineer
                        </option>

                        <option value="Assistant Executive Engineer">
                          Assistant Executive Engineer
                        </option>

                        <option value="Assistant Engineer">
                          Assistant Engineer
                        </option>

                        <option value="Sub Engineer">
                          Sub Engineer
                        </option>

                        <option value="DB">
                          DB
                        </option>
                      </select>
                    ) : (
                      selectedItem.DECISION_MAKER_DESIGNATION ||
                      "-"
                    )}
                  </td>
                </tr>

                {[
                  [
                    "DEPUTY_CHIEF_ENGINEER_OFF_PER",
                    "Deputy Chief Engineer",
                  ],
                  [
                    "EXECUTIVE_ENGINEER",
                    "Executive Engineer",
                  ],
                  [
                    "ASSISTANT_EXECUTIVE_ENGINEER",
                    "Assistant Executive Engineer",
                  ],
                  [
                    "ASSISTANT_ENGINEER",
                    "Assistant Engineer",
                  ],
                  [
                    "SUB_REGIONAL_STORE",
                    "Sub Regional Store",
                  ],
                  [
                    "SRS_ASSISTANT_EXECUTIVE_ENGINEER",
                    "SRS Assistant Executive Engineer",
                  ],
                  [
                    "MAIL_ID",
                    "Email",
                  ],
                ].map(
                  ([
                    field,
                    label,
                  ]) => (
                    <tr
                      key={
                        field
                      }
                    >
                      <td>
                        {label}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            value={
                              editData?.[
                              field
                              ] ?? ""
                            }
                            onChange={(
                              e
                            ) =>
                              handleChange(
                                e,
                                field
                              )
                            }
                          />
                        ) : (
                          selectedItem[
                          field
                          ] || "-"
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>

            {/* =================================================
                ACTIONS
            ================================================= */}

            <div className="modal-actions">
              <div className="left-buttons">
                {isEditing ? (
                  <>
                    <button
                      className="save-btn"
                      onClick={
                        handleSave
                      }
                    >
                      Save
                    </button>

                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setIsEditing(
                          false
                        );

                        setEditData({
                          ...selectedItem,
                        });
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="edit-btn"
                    onClick={() =>
                      setIsEditing(
                        true
                      )
                    }
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="right-buttons">
                <button
                  className="call-btn"
                  onClick={() =>
                    navigate(
                      `/call-entry/${selectedItem.id}`,
                      {
                        state:
                          selectedItem,
                      }
                    )
                  }
                >
                  Call Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

