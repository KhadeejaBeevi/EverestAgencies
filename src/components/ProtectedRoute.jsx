import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function ProtectedRoute({ page, children }) {

    const [loading, setLoading] = useState(true);
    const [allowed, setAllowed] = useState(false);
    const [role, setRole] = useState("");

   useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

        if (!user) {
            setAllowed(false);
            setLoading(false);
            return;
        }

        try {

            const permissionDoc = await getDoc(
                doc(db, "PagePermissions", user.uid)
            );

            if (permissionDoc.exists()) {

                const permissions = permissionDoc.data();

                setAllowed(permissions[page] === true);

            } else {

                setAllowed(false);

            }

        } catch (err) {

            console.log(err);
            setAllowed(false);

        }

        setLoading(false);

    });

    return () => unsubscribe();

}, [page]);

    if (loading) return <div>Loading...</div>;

    if (!allowed) {
        return (
            <Navigate
                to="/unauthorized"
                replace
                state={{ role }}
            />
        );
    }

    return children;
}