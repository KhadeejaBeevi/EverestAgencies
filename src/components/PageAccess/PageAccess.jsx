import Banner from "../Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import "./PageAccess.css";

import {
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
const ALL_PAGES = [
    "Dashboard",
    "Admin Dashboard",
    "Sales Dashboard",
    "User Dashboard",
    "KSEB User Dashboard",

    "Create User",
    "Create Kseb User",
    "Create Sales User",

    "Post Dated Cheques",

    "KSEB Directory",
    "Kseb Directory Table",
    "Call History",
    "Call Entry",
    "Attendance",
    "View Attendance",
    "New Kseb Lead",
    "Site Visit",
    "Travel Plan",
    "Tender Details",
    "Tender Executive",
    "PO Details",

    "Sales CRM",
    "New Party",
    "Stock Items",
    "Stock Check",

    "Sales Orders",
    "Solar New Leads",
    "Lorry Receipt",
    "Sales Site Visit",

    "User Activity Report",
    "Manage Users",
    "Page Access",
    "Quotation Followup",
    "Enquiry Report",
    "Quotation Wise Followup",

    "Telecaller Report",
    "Lead Contribution Report",
    "Ledger Changes",
    "KSEB Payment",
    "KSEB Overall Sales",
    "KSEB Location Report",
    "KSEB Detail Report",
    "Solar Customers",
    "Job Application",
    "Job Application Response",

];

export default function PageAccess() {

    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(false);


    const loadUsers = async () => {
        try {
            const snap = await getDocs(collection(db, "Users"));

            const arr = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setUsers(arr);

        } catch (error) {
            console.error("Error loading users:", error);
            console.log("Current UID:", auth.currentUser?.uid);
        }
    };
    const selectUser = async (user) => {

        try {

            setSelectedUser(user);
            setLoading(true);

            const snap = await getDoc(
                doc(db, "PagePermissions", user.id)
            );

            if (snap.exists()) {

                setPermissions(snap.data());

            } else {

                const defaults = {};

                ALL_PAGES.forEach(page => {
                    defaults[page] = false;
                });

                if (snap.exists()) {

                    setPermissions({
                        ...defaults,
                        ...snap.data()
                    });

                } else {

                    setPermissions(defaults);

                }
            }
        } catch (err) {

            console.error(err);

        } finally {

            setLoading(false);

        }

    };
    useEffect(() => {

        const unsubscribe = onAuthStateChanged(auth, async (user) => {

            if (!user) {
                console.log("User not logged in");
                return;
            }

            console.log("Logged in:", user.uid);

            await loadUsers();

        });

        return () => unsubscribe();

    }, []);

    const togglePermission = (page) => {

        setPermissions(prev => ({
            ...prev,
            [page]: !prev[page]
        }));

    };



    

    const savePermissions = async () => {

        if (!selectedUser) return;

        const data = {};

        ALL_PAGES.forEach(page => {
            data[page] = permissions[page] || false;
        });

        await setDoc(
            doc(db, "PagePermissions", selectedUser.id),
            data
        );

        alert("Permissions Saved Successfully");
    };

    return (

        <div className="pageAccess">
            <Banner />
            <h2>Page Access Management</h2>

            <div className="permissionContainer">

                {/* LEFT */}

                <div className="userPanel">

                    <h3>Users</h3>

                    <div className="userList">

                        {users.map(user => (

                            <div
                                key={user.id}
                                className={`userCard ${selectedUser?.id === user.id ? "active" : ""}`}
                                onClick={() => selectUser(user)}
                            >

                                <div>

                                    <strong>
                                        {user.firstName} {user.lastName}
                                    </strong>

                                    <small>{user.designation}</small>

                                </div>

                            </div>

                        ))}

                    </div>

                </div>

                {/* RIGHT */}

                <div className="permissionPanel">

                    {!selectedUser ? (

                        <div className="selectUser">

                            Select a User

                        </div>

                    ) : (

                        <>
                            <div className="permissionContent">
                                <div className="userInfo">

                                    <h3>
                                        {selectedUser.firstName} {selectedUser.lastName}
                                    </h3>

                                    <p>{selectedUser.designation}</p>

                                </div>

                                {loading ? (

                                    <p>Loading...</p>

                                ) : (

                                    <table className="permissionTable">

                                        <thead>

                                            <tr>

                                                <th>Page</th>
                                                <th>Status</th>

                                            </tr>

                                        </thead>

                                        <tbody>

                                            {ALL_PAGES.map(page => (

                                                <tr key={page}>

                                                    <td>{page}</td>

                                                    <td>

                                                        <label className="switch">

                                                            <input
                                                                type="checkbox"
                                                                checked={permissions[page] || false}
                                                                onChange={() => togglePermission(page)}
                                                            />

                                                            <span className="slider"></span>

                                                        </label>

                                                    </td>

                                                </tr>

                                            ))}

                                        </tbody>

                                    </table>

                                )}
                            </div>

                            <div className="permissionFooter">
                                <button
                                    className="saveBtn"
                                    onClick={savePermissions}
                                >

                                    Save Permissions

                                </button>
                            </div>
                        </>

                    )}

                </div>

            </div>

        </div>

    );

}