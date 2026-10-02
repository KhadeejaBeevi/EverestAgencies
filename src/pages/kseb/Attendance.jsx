import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useState } from "react";
import "./Attendance.css";
import { auth, db } from "../../components/firebase";

import { onAuthStateChanged } from "firebase/auth";

import {
  doc,
  getDoc
} from "firebase/firestore";
import { Geolocation } from "@capacitor/geolocation";
import { apiFetch } from "../../api/apiClient";

export default function Attendance() {

  const [loading, setLoading] = useState(false);

  const [location, setLocation] = useState(null);

  const [status, setStatus] = useState("");

  
  const [userData, setUserData] = useState(null);

  
  useEffect(() => {

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {

        if (user) {

          try {

            const docRef = doc(
              db,
              "Users",
              user.uid
            );

            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {

              const data = docSnap.data();

              setUserData({

                uid: user.uid,

                name:
                  `${data.firstName || ""} ${data.lastName || ""}`.trim()

              });

            }

          } catch (err) {

            console.log(err);
          }
        }
      }
    );

    return () => unsubscribe();

  }, []);

  
const getLocation = async () => {
  try {
    
    const permission = await Geolocation.requestPermissions();

    console.log("Permission:", permission);

    if (
      permission.location !== "granted" &&
      permission.coarseLocation !== "granted"
    ) {
      throw new Error("Location permission denied");
    }

    
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (err) {
    console.error("Geolocation Error:", err);
    throw err;
  }
};

  
  const getPlaceName = async (lat, lng) => {

    try {

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );

      const data = await res.json();

      return data.display_name || "Unknown Location";

    } catch (err) {

      return "Location Not Found";
    }
  };

  
  const handleCheckIn = async () => {

    try {

      setLoading(true);

      if (!userData) {

        setStatus("User not logged in");
        return;
      }

      
      const loc = await getLocation();

      setLocation(loc);

      
      const placeName = await getPlaceName(
        loc.latitude,
        loc.longitude
      );

     
      const payload = {

        userId: userData.uid,

        user_name: userData.name,

        type: "CHECK_IN",

        latitude: loc.latitude,

        longitude: loc.longitude,

        location_text: placeName,

        time: new Date()
          .toLocaleString("sv-SE", {
            timeZone: "Asia/Kolkata",
          })
          .replace(" ", "T"),

      };

      console.log(payload);

      
      const response = await apiFetch(
        "/serverphp/attendance.php",
        {

          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      console.log(data);

      if (data.success) {

        setStatus("✅ Checked In Successfully");

      } else {

        setStatus("❌ " + data.error);
      }

    } catch (err) {

      console.log(err);

      setStatus("❌ Error: " + err);

    } finally {

      setLoading(false);
    }
  };


  const handleCheckOut = async () => {

    try {

      setLoading(true);

      if (!userData) {

        setStatus("User not logged in");
        return;
      }

      
      const loc = await getLocation();

      setLocation(loc);

      
      const placeName = await getPlaceName(
        loc.latitude,
        loc.longitude
      );

      
      const payload = {

        userId: userData.uid,

        user_name: userData.name,

        type: "CHECK_OUT",

        latitude: loc.latitude,

        longitude: loc.longitude,

        location_text: placeName,

        time: new Date()
          .toLocaleString("sv-SE", {
            timeZone: "Asia/Kolkata",
          })
          .replace(" ", "T"),

      };

      console.log(payload);

      
      const response = await apiFetch(
        "/serverphp/attendance.php",
        {

          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      console.log(data);

      if (data.success) {

        setStatus("✅ Checked Out Successfully");

      } else {

        setStatus("❌ " + data.error);
      }

    } catch (err) {

      console.log(err);

      setStatus("❌ Error: " + err);

    } finally {

      setLoading(false);
    }
  };

  return (

    <div>

      <Banner />

      <div className="attendance-box">

        <h2>Attendance</h2>

      
        {userData && (

          <div className="user-box">

            <p>

              <strong>Logged User:</strong>

              {" "}

              {userData.name}

            </p>

          </div>
        )}

        
        <button
          onClick={handleCheckIn}
          disabled={loading}
        >
          {loading
            ? "Processing..."
            : "Check In"}
        </button>

        <button
          onClick={handleCheckOut}
          disabled={loading}
        >
          {loading
            ? "Processing..."
            : "Check Out"}
        </button>

        
        {status && (

          <p className="status">

            {status}

          </p>
        )}

       
        {location && (

          <div className="location-box">

            <p>

              <strong>Latitude:</strong>

              {" "}

              {location.latitude}

            </p>

            <p>

              <strong>Longitude:</strong>

              {" "}

              {location.longitude}

            </p>

          </div>
        )}

      </div>
    </div>
  );
}
