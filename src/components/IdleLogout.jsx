import { useEffect, useRef } from "react";
import { getAuth, signOut } from "firebase/auth";
import { auth } from "./firebase";

const IDLE_TIME = 40 * 60 * 1000; 

export default function IdleLogout() {
  const timer = useRef(null);

  const logout = async () => {
    try {
      alert("You have been logged out due to inactivity.");

      const authInstance = getAuth();

      await signOut(authInstance);

      window.location.href = "/";
    } catch (error) {
      console.error("Logout Error:", error);
      
    }
  };

  const resetTimer = () => {
    if (!auth.currentUser) return;

    clearTimeout(timer.current);
    timer.current = setTimeout(logout, IDLE_TIME);
  };

  useEffect(() => {
    const events = [
      "mousemove",
      "mousedown",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((event) =>
      window.addEventListener(event, resetTimer)
    );

    resetTimer();

    return () => {
      clearTimeout(timer.current);

      events.forEach((event) =>
        window.removeEventListener(event, resetTimer)
      );
    };
  }, []);

  return null;
}