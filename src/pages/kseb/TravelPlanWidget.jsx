import Banner from "../../components/Banner/Banner.jsx";
import "./TravelPlanWidget.css";
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
} from "firebase/firestore";

import { auth, db } from "../../components/firebase";
import React, { useEffect, useState } from "react";
import {
    Plus,
    Trash2,
    MapPin,
    User,
    Calendar,
    CheckCircle2,
} from "lucide-react";
import { apiFetch } from "../../api/apiClient";

const TravelPlanWidget = () => {


    const [executives, setExecutives] = useState([]);

    const [selectedExecutive, setSelectedExecutive] =
        useState("");

    const [travelDate, setTravelDate] = useState(
        new Date().toISOString().split("T")[0]
    );
    const [userData, setUserData] = useState(null);
    const [plans, setPlans] = useState([]);

    const [loading, setLoading] = useState(false);

    const [newStop, setNewStop] = useState({
        customer: "",
        location: "",
        purpose: "",
    });

    const [mapQuery, setMapQuery] = useState("");


    useEffect(() => {

        if (!selectedExecutive) return;

        fetchPlans();

    }, [selectedExecutive, travelDate]);


    useEffect(() => {

        const fetchUserData = async () => {

            try {

                const user = auth.currentUser;

                if (!user) return;



                const userDoc = await getDoc(
                    doc(db, "Users", user.uid)
                );

                if (!userDoc.exists()) return;

                const loggedUser = userDoc.data();

                setUserData(loggedUser);



                if (
                    loggedUser.designation ===
                    "SalesCoordinator"
                ) {

                    const executiveQuery = query(
                        collection(db, "Users"),
                        where(
                            "designation",
                            "==",
                            "SalesExecutive"
                        ),
                        where(
                            "distribution",
                            "==",
                            loggedUser.distribution
                        )
                    );

                    const executiveSnapshot =
                        await getDocs(executiveQuery);

                    const teamExecutives = [];

                    executiveSnapshot.forEach((docSnap) => {

                        teamExecutives.push({
                            id: docSnap.id,
                            ...docSnap.data(),
                        });

                    });

                    setExecutives(teamExecutives);



                    if (teamExecutives.length > 0) {

                        setSelectedExecutive(
                            teamExecutives[0]
                                ?.firstName
                                ?.toUpperCase()
                        );

                    }

                }



                else if (
                    loggedUser.designation ===
                    "SalesExecutive"
                ) {

                    const executiveName =
                        loggedUser.firstName.toUpperCase();

                    setSelectedExecutive(
                        executiveName
                    );

                    setExecutives([
                        {
                            firstName: executiveName,
                        },
                    ]);

                }

            } catch (err) {

                console.log(err);

            }

        };

        fetchUserData();

    }, []);

    const fetchPlans = async () => {

        try {

            setLoading(true);

            const response = await apiFetch(
                `/serverphp/travel_plans.php?executive=${selectedExecutive}&travel_date=${travelDate}`
            );

            const data = await response.json();

            if (data.status === "success") {

                setPlans(data.data);

            } else {

                setPlans([]);
            }

        } catch (err) {

            console.log(err);

        } finally {

            setLoading(false);
        }
    };


    const addStop = async () => {

        try {

            if (
                !selectedExecutive ||
                !newStop.customer ||
                !newStop.location
            ) {

                alert("Fill all required fields");
                return;
            }

            const response = await apiFetch(
                "/serverphp/travel_plans.php",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                    },

                    body: JSON.stringify({
                        executive: selectedExecutive,
                        travel_date: travelDate,
                        customer: newStop.customer,
                        location: newStop.location,
                        purpose: newStop.purpose,
                    }),
                }
            );

            const data = await response.json();

            if (data.status === "success") {

                setNewStop({
                    customer: "",
                    location: "",
                    purpose: "",
                });

                setMapQuery(newStop.location);

                fetchPlans();

            } else {

                alert(data.message);
            }

        } catch (err) {

            console.log(err);
        }
    };


    const deleteStop = async (id) => {

        try {

            const response = await apiFetch(
                `/serverphp/travel_plans.php?id=${id}`,
                {
                    method: "DELETE",
                }
            );

            const data = await response.json();

            if (data.status === "success") {

                fetchPlans();
            }

        } catch (err) {

            console.log(err);
        }
    };


    const toggleComplete = async (plan) => {

        try {

            const response = await apiFetch(
                "/serverphp/travel_plans.php",
                {
                    method: "PUT",

                    headers: {
                        "Content-Type": "application/json",
                    },

                    body: JSON.stringify({
                        id: plan.id,
                        completed: plan.completed == 1 ? 0 : 1,
                    }),
                }
            );

            const data = await response.json();

            if (data.status === "success") {

                fetchPlans();
            }

        } catch (err) {

            console.log(err);
        }
    };



    const mapURL = mapQuery
        ? `https://maps.google.com/maps?q=${encodeURIComponent(
            mapQuery
        )}&output=embed`
        : "";



    return (

        <div className="travelPage">

            <Banner />

         

            <div className="travelTopBar">

                <div>

                    <h2>Travel Plan Manager</h2>

                    <p>
                        Coordinator assigned travel planning system
                    </p>

                </div>

            </div>



            <div className="plannerFormCard">

                <div className="plannerGrid">


                    <div className="inputGroup">

                        <label>
                            <User size={15} />
                            Executive
                        </label>



                        {userData?.designation === "SalesExecutive" ? (

                            <input
                                type="text"
                                value={selectedExecutive}
                                disabled
                            />

                        ) : executives.length <= 1 ? (



                            <input
                                type="text"
                                value={
                                    executives.length === 1
                                        ? executives[0]?.firstName?.toUpperCase()
                                        : ""
                                }
                                disabled
                            />

                        ) : (



                            <select
                                value={selectedExecutive}
                                onChange={(e) =>
                                    setSelectedExecutive(e.target.value)
                                }
                            >

                                {executives.map((exec, index) => (

                                    <option
                                        key={index}
                                        value={exec.firstName?.toUpperCase()}
                                    >

                                        {exec.firstName?.toUpperCase()}

                                    </option>

                                ))}

                            </select>

                        )}

                    </div>


                    <div className="inputGroup">

                        <label>
                            <Calendar size={15} />
                            Date
                        </label>

                        <input
                            type="date"
                            value={travelDate}
                            onChange={(e) =>
                                setTravelDate(e.target.value)
                            }
                        />

                    </div>



                    <div className="inputGroup">

                        <label>
                            Customer
                        </label>

                        <input
                            type="text"
                            placeholder="Customer name"
                            value={newStop.customer}
                            onChange={(e) =>
                                setNewStop({
                                    ...newStop,
                                    customer: e.target.value,
                                })
                            }
                        />

                    </div>



                    <div className="inputGroup">

                        <label>
                            Location
                        </label>

                        <input
                            type="text"
                            placeholder="Area / Place"
                            value={newStop.location}
                            onChange={(e) =>
                                setNewStop({
                                    ...newStop,
                                    location: e.target.value,
                                })
                            }
                        />

                    </div>



                    <div className="inputGroup">

                        <label>
                            Purpose
                        </label>

                        <input
                            type="text"
                            placeholder="Visit purpose"
                            value={newStop.purpose}
                            onChange={(e) =>
                                setNewStop({
                                    ...newStop,
                                    purpose: e.target.value,
                                })
                            }
                        />

                    </div>

                </div>



                {userData?.designation ===
                    "SalesCoordinator" && (

                        <button
                            className="addStopBtn"
                            onClick={addStop}
                        >

                            <Plus size={18} />

                            Add Stop

                        </button>

                    )}

            </div>



            <div className="travelLayout">



                <div className="travelTableSection">

                    <div className="tableHeader">
                        Assigned Travel Stops
                    </div>

                    {loading ? (

                        <div className="loadingBox">
                            Loading plans...
                        </div>

                    ) : (

                        <div className="tableWrapper">

                            <table>

                                <thead>

                                    <tr>
                                        <th>#</th>
                                        <th>Customer</th>
                                        <th>Purpose</th>
                                        <th>Status</th>
                                        {userData?.designation ===
                                            "SalesCoordinator" && (
                                                <th>Delete</th>
                                            )}
                                    </tr>

                                </thead>
                                <tbody>

                                    {plans.map((plan, index) => (

                                        <tr
                                            key={plan.id}
                                            onClick={() =>
                                                setMapQuery(
                                                    plan.location_name || plan.location
                                                )
                                            }
                                            style={{ cursor: "pointer" }}
                                        >

                                            <td>

                                                <div className="stepCircle">
                                                    {index + 1}
                                                </div>

                                            </td>

                                            <td>

                                                <div className="customerName">
                                                    {plan.customer}
                                                </div>

                                                <div className="customerLocation">

                                                    <MapPin size={13} />

                                                    {plan.location_name}

                                                </div>

                                            </td>

                                            <td>
                                                {plan.purpose}
                                            </td>

                                            <td>

                                                <button
                                                    className={`statusBtn ${plan.completed == 1
                                                        ? "completed"
                                                        : "pending"
                                                        }`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleComplete(plan);
                                                    }}
                                                >

                                                    <CheckCircle2 size={16} />

                                                    {plan.completed == 1
                                                        ? "Completed"
                                                        : "Pending"}

                                                </button>

                                            </td>

                                            {userData?.designation ===
                                                "SalesCoordinator" && (

                                                    <td>

                                                        <button
                                                            className="deleteBtn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteStop(plan.id);
                                                            }}
                                                        >

                                                            <Trash2 size={16} />

                                                        </button>

                                                    </td>

                                                )}

                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                            {plans.length === 0 && (

                                <div className="emptyBox">
                                    No travel plans added
                                </div>

                            )}

                        </div>


                    )}

                </div>
                <div className="travelCards">
                    {plans.map((plan, index) => (
                        <div
                            key={plan.id}
                            className="travelCard"
                            onClick={() =>
                                setMapQuery(
                                    plan.location_name || plan.location
                                )
                            }
                        >
                            <div className="travelCardHeader">
                                Stop #{index + 1}
                            </div>

                            <div className="travelCardRow">
                                <strong>Customer</strong>
                                <span>{plan.customer}</span>
                            </div>

                            <div className="travelCardRow">
                                <strong>Location</strong>
                                <span>
                                    <MapPin size={14} />
                                    {plan.location_name}
                                </span>
                            </div>

                            <div className="travelCardRow">
                                <strong>Purpose</strong>
                                <span>{plan.purpose}</span>
                            </div>

                            <div className="travelCardRow">
                                <strong>Status</strong>

                                <button
                                    className={`statusBtn ${plan.completed == 1
                                        ? "completed"
                                        : "pending"
                                        }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleComplete(plan);
                                    }}
                                >
                                    <CheckCircle2 size={16} />

                                    {plan.completed == 1
                                        ? "Completed"
                                        : "Pending"}
                                </button>
                            </div>

                            {userData?.designation ===
                                "SalesCoordinator" && (
                                    <button
                                        className="deleteBtn mobileDelete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteStop(plan.id);
                                        }}
                                    >
                                        <Trash2 size={16} />
                                        Delete
                                    </button>
                                )}
                        </div>
                    ))}

                    {plans.length === 0 && (
                        <div className="emptyBox">
                            No travel plans added
                        </div>
                    )}
                </div>

                {/* MAP */}

                <div className="travelMapSection">

                    <div className="mapHeader">
                        Location Preview
                    </div>

                    {mapQuery ? (

                        <iframe
                            title="Travel Map"
                            className="travelMapFrame"
                            loading="lazy"
                            allowFullScreen
                            src={mapURL}
                        />

                    ) : (

                        <div className="noMap">
                            Select location to preview map
                        </div>

                    )}

                </div>

            </div>

        </div>
    );
};

export default TravelPlanWidget;