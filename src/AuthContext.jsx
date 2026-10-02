import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { auth, db } from "./components/firebase";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {

  const [userRole, setUserRole] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

      try {

        if (user) {

          const roleRef = doc(db, "roles", user.uid);

          const roleSnap = await getDoc(roleRef);

          if (roleSnap.exists()) {

            setUserRole(roleSnap.data().role || "");

          } else {

            setUserRole("");

          }

        } else {

          setUserRole("");

        }

      } catch (err) {

        console.log(err);

      } finally {

        setLoading(false);

      }

    });

    return () => unsubscribe();

  }, []);

  return (

    <AuthContext.Provider
      value={{ userRole, loading }}
    >

      {children}

    </AuthContext.Provider>

  );

};

export const useAuth = () => useContext(AuthContext);