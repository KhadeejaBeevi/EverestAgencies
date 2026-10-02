import Banner from "./components/Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import { auth, db } from "./components/firebase";
import { doc, getDoc } from "firebase/firestore";
const Unauthorized = () => {

    const [userRole, setUserRole] = useState("");

    useEffect(() => {

        const loadRole = async () => {

            if (!auth.currentUser) return;

            try {

                const snap = await getDoc(
                    doc(db, "Users", auth.currentUser.uid)
                );

                if (snap.exists()) {
                    setUserRole(snap.data().role || "");
                }

            } catch (err) {
                console.log(err);
            }

        };

        loadRole();

    }, []);

    const role = userRole.toLowerCase().trim();

    return (
        <div className="min-h-screen bg-gray-100">

            <Banner />

            <div
                style={{
                    height: "calc(100vh - 70px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column"
                }}
            >
                <h1
                    style={{
                        fontSize: "42px",
                        color: "#dc2626",
                        marginBottom: "15px"
                    }}
                >
                    🚫 Access Denied
                </h1>

                <p
                    style={{
                        fontSize: "18px",
                        color: "#555"
                    }}
                >
                    You don't have permission to access this page.
                </p>
            </div>

        </div>
    );
};

export default Unauthorized;