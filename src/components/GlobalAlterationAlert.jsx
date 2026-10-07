import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { Bell, X, AlertTriangle } from "lucide-react";

const API = "/serverphp";

const QUOTATION_TEAM_EMAILS = [
  "sion.everestagencies@gmail.com",
  "rahida.everestagencies@gmail.com",
];

const GlobalAlterationAlert = () => {
  const [isQuotationTeam, setIsQuotationTeam] = useState(false);
  const [requests, setRequests] = useState([]);
  const [showAlert, setShowAlert] = useState(false);

  const knownRequestIds = useRef(new Set());
  const firstLoad = useRef(true);
  const alertAudio = useRef(null);

  useEffect(() => {
    const audio = new Audio("/notification.mp3");
    audio.volume = 1;
    audio.preload = "auto";
    alertAudio.current = audio;
    audio.load();

    return () => {
      if (alertAudio.current) {
        alertAudio.current.pause();
        alertAudio.current = null;
      }
    };
  }, []);

  const playAlertSound = async () => {
    try {
      if (!alertAudio.current) {
        console.log("Alert audio not loaded");
        return;
      }

      alertAudio.current.pause();
      alertAudio.current.currentTime = 0;
      await alertAudio.current.play();
      console.log("🔊 Alert sound played");
    } catch (error) {
      console.error("🔇 Sound could not play:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsQuotationTeam(false);
        setRequests([]);
        setShowAlert(false);
        knownRequestIds.current = new Set();
        firstLoad.current = true;
        return;
      }

      try {
        const userRef = doc(db, "Users", user.uid);
        const userSnap = await getDoc(userRef);

        const firebaseEmail = String(
          user.email ||
          (userSnap.exists() ? userSnap.data()?.email || "" : "") ||
          ""
        ).trim().toLowerCase();

        console.log("AUTH USER EMAIL:", user.email);
        console.log("FINAL EMAIL:", firebaseEmail);

        const allowed = QUOTATION_TEAM_EMAILS.includes(firebaseEmail);

        console.log("IS QUOTATION TEAM:", allowed);

        setIsQuotationTeam(allowed);
        knownRequestIds.current = new Set();
        firstLoad.current = true;
      } catch (error) {
        console.error("Quotation team check error:", error);
        setIsQuotationTeam(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadRequests = async () => {
    if (!isQuotationTeam) return;

    try {
      const response = await fetch(
        `${API}/get_quotation_alteration_requests.php`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      console.log("GLOBAL ALTERATION ALERT:", result);

      const pendingRequests = Array.isArray(result?.data)
        ? result.data
        : [];

      let newRequestFound = false;

      pendingRequests.forEach((request) => {
        const requestId = String(request.id || "");

        if (!requestId) return;

        if (!knownRequestIds.current.has(requestId)) {
          if (!firstLoad.current) {
            newRequestFound = true;
          }

          knownRequestIds.current.add(requestId);
        }
      });

      setRequests(pendingRequests);

      if (firstLoad.current) {
        if (pendingRequests.length > 0) {
          setShowAlert(true);
        }

        firstLoad.current = false;
        return;
      }

      if (newRequestFound) {
        console.log("🚨 NEW ALTERATION REQUEST DETECTED");
        setShowAlert(true);
        playAlertSound();
      }
    } catch (error) {
      console.error("Global alteration request error:", error);
    }
  };

  useEffect(() => {
    if (!isQuotationTeam) return;

    loadRequests();

    // Skip polling while the tab is in the background to avoid
    // "429 Too Many Requests" from the host.
    const interval = setInterval(() => {
      if (!document.hidden) loadRequests();
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [isQuotationTeam]);

  const closeAlert = () => {
    setShowAlert(false);
  };

  if (!isQuotationTeam || !showAlert || requests.length === 0) {
    return null;
  }

  return (
    <div
      className="
        fixed inset-0 z-[999999] bg-black/50
        flex items-center justify-center p-4
      "
    >
      <div
        className="
          bg-white w-full max-w-3xl rounded-3xl shadow-2xl
          overflow-hidden max-h-[85vh] flex flex-col
        "
      >
        <div
          className="
            bg-red-700 text-white p-5
            flex justify-between items-center
          "
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={32} />

            <div>
              <h2 className="text-2xl font-bold">
                🚨 Alter Quotation Required
              </h2>

              <p className="text-red-100 text-sm">
                {requests.length} pending request
                {requests.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <button
            onClick={closeAlert}
            className="
              p-2 hover:bg-red-800 rounded-full transition
            "
          >
            <X size={26} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {requests.map((request) => (
            <div
              key={request.id}
              className="
                border-2 border-red-200 bg-red-50
                rounded-2xl p-5 mb-4
              "
            >
              <div
                className="
                  flex justify-between gap-4 flex-wrap
                "
              >
                <div>
                  <div
                    className="
                      text-xl font-bold text-red-800
                    "
                  >
                    📄 {request.quotation_no}
                  </div>

                  <div
                    className="
                      mt-2 font-semibold text-gray-800
                    "
                  >
                    🏢 {request.party}
                  </div>
                </div>

                <Bell
                  className="
                    text-red-700 animate-bounce
                  "
                  size={28}
                />
              </div>

              <div
                className="
                  mt-4 text-sm text-gray-700 space-y-2
                "
              >
                <p>
                  <b>Requested By:</b>{" "}
                  {request.requested_by || "-"}
                </p>

                <p>
                  <b>Request Date:</b>{" "}
                  {request.created_at || "-"}
                </p>

                {request.order_no && (
                  <p>
                    <b>Order No:</b>{" "}
                    {request.order_no}
                  </p>
                )}

                {request.invoice_no && (
                  <p>
                    <b>Invoice No:</b>{" "}
                    {request.invoice_no}
                  </p>
                )}
              </div>

              <div
                className="
                  mt-4 bg-white border border-red-200
                  rounded-xl p-4
                "
              >
                <b>Negotiation Details:</b>

                <div
                  className="
                    mt-2 whitespace-pre-wrap text-gray-800
                  "
                >
                  {request.remarks || "No remarks provided"}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className="
            p-4 border-t flex justify-end
          "
        >
          <button
            onClick={closeAlert}
            className="
              bg-gray-700 hover:bg-gray-800 text-white
              px-6 py-2 rounded-xl font-bold transition
            "
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalAlterationAlert;
