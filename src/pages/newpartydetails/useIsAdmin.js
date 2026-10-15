import { useEffect, useState } from "react";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// Admin = role "admin" in roles/{uid} or in Users/{uid}.
export default function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAdmin(false);
        setLoaded(true);
        return;
      }

      try {
        const roleSnap = await getDoc(doc(db, "roles", user.uid));
        const adminRole = roleSnap.exists()
          ? String(roleSnap.data().role || "").toLowerCase().trim()
          : "";

        if (adminRole === "admin") {
          setIsAdmin(true);
        } else {
          const userSnap = await getDoc(doc(db, "Users", user.uid));
          setIsAdmin(
            userSnap.exists() &&
              String(userSnap.data().role || "").toLowerCase().trim() === "admin"
          );
        }
      } catch (err) {
        console.log(err);
        setIsAdmin(false);
      }

      setLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  return { isAdmin, loaded };
}
