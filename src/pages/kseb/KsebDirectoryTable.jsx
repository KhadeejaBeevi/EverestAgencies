import Banner from "../../components/Banner/Banner.jsx";
import "./KsebDirectoryTable.css";
import { auth, db } from "../../components/firebase";

import { onAuthStateChanged } from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";

import { useNavigate, useLocation } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/apiClient";

const API = "/serverphp";

export default function KsebDirectoryTable() {

    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [search, setSearch] = useState("");
    const [areaFilter, setAreaFilter] = useState(""); 

    

    const [callHistoryMap, setCallHistoryMap] = useState({});
    const [hierarchyMap, setHierarchyMap] = useState({});

    const [region, setRegion] = useState("");
    const [callHistorySet, setCallHistorySet] = useState(new Set());

    const navigate = useNavigate();
    const location = useLocation();
    const [userLocation, setUserLocation] = useState(null);
    const targetPlace = location.state?.targetPlace || "";

    const [contactFilter, setContactFilter] = useState("");

    const [selectedMonth, setSelectedMonth] = useState(
        new Date().toISOString().slice(0, 7)
    );
    const [selectedWeek, setSelectedWeek] = useState("all");
    const [userRole, setUserRole] = useState("");
    const [callHistory, setCallHistory] = useState([]);

    const totalCount = data.length;

    const contactedCount = data.filter((i) =>
        callHistorySet.has(i.id)
    ).length;

    const nonContactedCount =
        totalCount - contactedCount;



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

        apiFetch(`${API}/ksebdirectory.php`)
            .then((res) => res.json())
            .then((result) => {

                if (result.status === "success") {
                    setData(result.data);
                    setFilteredData(result.data);
                }

            })
            .catch(console.error);

    }, []);


    useEffect(() => {

        apiFetch(`${API}/get_all_calls.php`)
            .then((res) => res.json())
            .then((res) => {

                if (res.status === "success") {
                    setCallHistory(res.data);
                }

            })
            .catch(console.error);

    }, []);


    const normalize = (text) =>
        (text || "")
            .toLowerCase()
            .replace(/[\s-]/g, "");


    useEffect(() => {

        const ids = [];
        const map = {};

        callHistory.forEach((c) => {

            if (!c.call_date) return;

            const month = c.call_date.slice(0, 7);

            // latest call
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

    useEffect(() => {

        let currentCircle = "";
        let currentDivision = "";
        let currentSubdivision = "";

        const map = {};

        data.forEach((item) => {

            const area = normalize(item.AREA);

            if (area.includes("circle")) {
                currentCircle = item.PLACE;
            }

            if (
                area.includes("division") &&
                !area.includes("subdivision")
            ) {
                currentDivision = item.PLACE;
            }

            if (area.includes("subdivision")) {
                currentSubdivision = item.PLACE;
            }

            map[item.id] = {
                region: item.PARENT_AREA,
                circle: currentCircle,
                division: currentDivision,
                subdivision: currentSubdivision,
            };

        });

        setHierarchyMap(map);

    }, [data]);
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

                element.classList.add("highlight-row");

                setTimeout(() => {
                    element.classList.remove("highlight-row");
                }, 3000);

            }

            navigate(location.pathname, {
                replace: true,
                state: {},
            });

        }, 500);

    }, [targetPlace, filteredData]);
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
            2 * Math.atan2(
                Math.sqrt(a),
                Math.sqrt(1 - a)
            );

        return (R * c).toFixed(1);

    };

    useEffect(() => {

        let temp = [...data];

        // hide distribution default
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

        if (contactFilter === "non_contacted") {

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


    const handleReset = () => {

        setRegion("");
        setSearch("");
        setAreaFilter("");
        setContactFilter("");

        setSelectedMonth(
            new Date().toISOString().slice(0, 7)
        );

        setSelectedWeek("all");

    };


    const getRegions = () => {

        return [
            ...new Set(
                data.map((i) => i.PARENT_AREA)
            ),
        ];

    };


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
                String(d.getMonth() + 1).padStart(2, "0");

            const label = d.toLocaleString(
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
    const getWeekOfMonth = (dateStr) => {
        const date = new Date(dateStr);

        const firstDay = new Date(
            date.getFullYear(),
            date.getMonth(),
            1
        );

        return Math.ceil(
            (date.getDate() + firstDay.getDay()) / 7
        );
    };

    return (

        <div className="kseb-directory-container">

            <Banner />

            <h2 className="title">
                KSEB DIRECTORY TABLE
            </h2>


            <div className="top-bar">

                <div className="right-section">

                    <div className="count-bar">

                        <div className="count total">
                            Total: {totalCount}
                        </div>

                        <div className="count contacted">
                            Contacted: {contactedCount}
                        </div>

                        <div className="count non-contacted">
                            Non Contacted: {nonContactedCount}
                        </div>

                    </div>

                </div>

            </div>


            <div className="filters">


                <select
                    className="region-search"
                    value={region}
                    onChange={(e) =>
                        setRegion(e.target.value)
                    }
                >

                    <option value="">
                        REGION
                    </option>

                    {getRegions().map((r, i) => (
                        <option
                            key={i}
                            value={r}
                        >
                            {r}
                        </option>
                    ))}

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
                        className={`btn-division ${areaFilter === "distribution"
                            ? "active"
                            : ""
                            }`}
                        onClick={() =>
                            setAreaFilter("distribution")
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
                        className={`btn-circle ${areaFilter === "circle"
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
                        className={`btn-division ${areaFilter === "division"
                            ? "active"
                            : ""
                            }`}
                        onClick={() =>
                            setAreaFilter("division")
                        }
                    >
                        DIVISION
                    </button>

                    <button
                        className={`btn-subdivision ${areaFilter === "subdivision"
                            ? "active"
                            : ""
                            }`}
                        onClick={() =>
                            setAreaFilter("subdivision")
                        }
                    >
                        SUBDIVISION
                    </button>

                    <button
                        className={`btn-section ${areaFilter === "section"
                            ? "active"
                            : ""
                            }`}
                        onClick={() =>
                            setAreaFilter("section")
                        }
                    >
                        SECTION
                    </button>

                </div>


                <div className="contact-filter-group">

                    <button
                        className={`contact-btn contacted ${contactFilter === "contacted"
                            ? "active"
                            : ""
                            }`}
                        onClick={() =>
                            setContactFilter("contacted")
                        }
                    >
                        CONTACTED
                    </button>

                    <select
                        value={selectedMonth}
                        onChange={(e) =>
                            setSelectedMonth(e.target.value)
                        }
                    >

                        {getMonthList().map((m) => (
                            <option
                                key={m.value}
                                value={m.value}
                            >
                                {m.label}
                            </option>
                        ))}

                    </select>
                    <select
                        value={selectedWeek}
                        onChange={(e) => setSelectedWeek(e.target.value)}
                    >
                        <option value="all">All Weeks</option>
                        <option value="1">Week 1</option>
                        <option value="2">Week 2</option>
                        <option value="3">Week 3</option>
                        <option value="4">Week 4</option>
                        <option value="5">Week 5</option>
                    </select>

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
                        NON CONTACTED
                    </button>

                </div>


                <button
                    className="reset-btn"
                    onClick={handleReset}
                >
                    RESET
                </button>

            </div>


            <input
                type="text"
                placeholder="Search instantly..."
                className="search-box"
                value={search}
                onChange={(e) =>
                    setSearch(e.target.value)
                }
            />

            <div className="table-container">

                <table className="kseb-table">

                    <thead>

                        <tr>
                            <th>Place</th>
                            <th>Area</th>
                            <th>Decision Maker</th>
                            <th>Distance</th>
                            <th>Phone</th>
                            <th>Landline</th>
                            <th>Email</th>
                            <th>Circle</th>
                            <th>Division</th>
                            <th>Subdivision</th>
                            <th>Region</th>
                            <th>Status</th>
                        </tr>

                    </thead>

                    <tbody>

                        {filteredData.map((item) => {

                            const h =
                                hierarchyMap[item.id] || {};

                            return (

                                <tr
                                    key={item.id}
                                    id={`place-${item.PLACE}`}
                                >

                                    <td>{item.PLACE}</td>

                                    <td>{item.AREA}</td>

                                    <td className="decision-maker-cell">

                                        <div className="decision-maker-name">
                                            {item.NAME}
                                            {item.DECISION_MAKER_DESIGNATION && (
                                                <span className="designation">
                                                    {" "}
                                                    ({item.DECISION_MAKER_DESIGNATION})
                                                </span>
                                            )}
                                        </div>

                                        {item.NAME?.trim() && (
                                            <div className="last-updated">
                                                Last Updated :{" "}
                                                {callHistoryMap[item.id]?.call_date
                                                    ? new Date(
                                                        callHistoryMap[item.id].call_date
                                                    ).toLocaleDateString("en-IN", {
                                                        day: "2-digit",
                                                        month: "short",
                                                        year: "numeric",
                                                    })
                                                    : "-"}
                                            </div>
                                        )}

                                    </td>
                                    <td>
                                        {userLocation &&
                                            item.latitude &&
                                            item.longitude
                                            ? `${calculateDistance(
                                                userLocation.lat,
                                                userLocation.lng,
                                                parseFloat(item.latitude),
                                                parseFloat(item.longitude)
                                            )} km`
                                            : "-"
                                        }
                                    </td>

                                    <td>{item.RECEIPTION_CUG}</td>

                                    <td>{item.RECEIPTION_LAND}</td>

                                    <td>
                                        {item.MAIL_ID || "-"}
                                    </td>

                                    <td>{h.circle}</td>

                                    <td>{h.division}</td>

                                    <td>{h.subdivision}</td>

                                    <td>{h.region}</td>

                                    <td>
                                        {callHistoryMap[item.id]
                                            ? "✅ Contacted"
                                            : "❌ Not Contacted"}
                                    </td>

                                </tr>

                            );

                        })}

                    </tbody>

                </table>

            </div>

        </div>

    );
}