import { useEffect, useRef } from "react";
import { auth, db } from "./firebase";

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";

const UserSessionManager = () => {
  const sessionId = useRef(null);
  const loginTime = useRef(null);
  const intervalRef = useRef(null);
  console.log("UserSessionManager Loaded");
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      try {
        const q = query(
          collection(db, "Users"),
          where("email", "==", user.email)
        );

        const snapshot = await getDocs(q);

        let userData = {};

        if (!snapshot.empty) {
          userData = snapshot.docs[0].data();
        }

        console.log("User Data:", userData);

        loginTime.current = Date.now();

        const session = await addDoc(collection(db, "UserSessions"), {
          uid: user.uid,
          name:
            userData.firstName && userData.lastName
              ? `${userData.firstName} ${userData.lastName}`
              : user.displayName || "",

          email: user.email,

          role: userData.role || "",

          designation: userData.designation || "",

          distribution: userData.distribution || "",

          loginTime: serverTimestamp(),

          logoutTime: null,

          lastActive: serverTimestamp(),

          status: "online",

          currentPage: window.location.pathname,

          totalSeconds: 0,

          browser: navigator.userAgent,

          createdAt: serverTimestamp(),
        });
        console.log("Auth State:", user);
        sessionId.current = session.id;

        localStorage.setItem("sessionId", session.id);

        // Update activity every minute
        intervalRef.current = setInterval(async () => {
          if (!sessionId.current) return;
          const totalSeconds = Math.floor(
            (Date.now() - loginTime.current) / 1000
          );

          await updateDoc(doc(db, "UserSessions", sessionId.current), {
            lastActive: serverTimestamp(),
            currentPage: window.location.pathname,
            totalSeconds,
          });
        }, 60000);

        // Browser close
        window.addEventListener("beforeunload", endSession);
      } catch (err) {
        console.log(err);
      }
    });

    return () => {
      unsubscribe();

      clearInterval(intervalRef.current);

      window.removeEventListener("beforeunload", endSession);
    };
  }, []);

  const endSession = async () => {
    try {
      const id = sessionId.current || localStorage.getItem("sessionId");

      if (!id) return;

      const totalSeconds = Math.floor(
        (Date.now() - loginTime.current) / 1000
      );

      await updateDoc(doc(db, "UserSessions", id), {
        logoutTime: serverTimestamp(),

        lastActive: serverTimestamp(),

        status: "offline",

        totalSeconds,
      });

      localStorage.removeItem("sessionId");
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => {
    const logoutListener = auth.onAuthStateChanged((user) => {
      if (!user) {
        endSession();
      }
    });

    return () => logoutListener();
  }, []);

  return null;
};

export default UserSessionManager;