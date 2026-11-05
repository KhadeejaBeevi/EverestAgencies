import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { Bell, X, AlertTriangle, CheckCircle, FileText } from "lucide-react";
import { apiFetch } from "../api/apiClient";

const API = "/serverphp";

const QUOTATION_TEAM_EMAILS = [
  "sion.everestagencies@gmail.com",
  "rahida.everestagencies@gmail.com",
];

/* Enquiry statuses the person who added the enquiry is told about. */
const STATUS_ALERT_STYLES = {
  "Negotiation": {
    card: "border-amber-300 bg-amber-50",
    chip: "bg-amber-100 text-amber-900 border border-amber-400"
  },
  "Technical Clarification": {
    card: "border-sky-300 bg-sky-50",
    chip: "bg-sky-100 text-sky-900 border border-sky-400"
  }
};

const statusAlertKey = (item) => `${item.id}|${item.token}`;

function formatAlertDate(value) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T"));
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const GlobalAlterationAlert = () => {
  const [isQuotationTeam, setIsQuotationTeam] = useState(false);
  const [requests, setRequests] = useState([]);
  const [showAlert, setShowAlert] = useState(false);
  const [userName, setUserName] = useState("");
  const [completingId, setCompletingId] = useState(null);

  // Enquiry status alerts (Negotiation / Technical Clarification) for
  // the person who added the enquiry. Shown to every logged-in user.
  const [statusAlerts, setStatusAlerts] = useState([]);
  const [showStatusAlert, setShowStatusAlert] = useState(false);
  const [statusSavingKey, setStatusSavingKey] = useState(null);
  const knownStatusKeys = useRef(new Set());

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
      knownStatusKeys.current = new Set();
      setStatusAlerts([]);
      setShowStatusAlert(false);

      if (!user) {
        setUserName("");
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

        const userData = userSnap.exists() ? userSnap.data() : {};
        const fullName = `${String(userData?.firstName || "").trim()} ${String(userData?.lastName || "").trim()}`.trim();
        setUserName(fullName || firebaseEmail);

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
      // apiFetch adds the X-API-Key header that api_auth.php requires.
      const response = await apiFetch(
        `${API}/get_quotation_alteration_requests.php`,
        { method: "GET" }
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

  /* ---------- Enquiry status alerts (for the enquiry's Added By) ---------- */

  const loadStatusAlerts = async () => {
    if (!userName) return;

    try {
      const response = await apiFetch(
        `${API}/enquiry_report.php?status_alert=1&user=${encodeURIComponent(userName)}`,
        { method: "GET" }
      );
      const result = await response.json();
      const items = Array.isArray(result?.data) ? result.data : [];

      const newFound = items.some((item) => !knownStatusKeys.current.has(statusAlertKey(item)));
      items.forEach((item) => knownStatusKeys.current.add(statusAlertKey(item)));

      setStatusAlerts(items);

      if (newFound) {
        setShowStatusAlert(true);
        playAlertSound();
      }
    } catch (error) {
      console.error("Enquiry status alert error:", error);
    }
  };

  useEffect(() => {
    if (!userName) return;

    loadStatusAlerts();

    const interval = setInterval(() => {
      if (!document.hidden) loadStatusAlerts();
    }, 30000);

    return () => clearInterval(interval);
  }, [userName]);

  const acknowledgeStatus = async (targets) => {
    if (statusSavingKey) return;

    try {
      setStatusSavingKey(targets.length === 1 ? statusAlertKey(targets[0]) : "all");

      await Promise.all(
        targets.map(async (item) => {
          const response = await apiFetch(`${API}/enquiry_report.php`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              status_alert_ack: "1",
              enquiry_id: String(item.id),
              token: item.token
            }).toString()
          });
          const result = await response.json();
          if (!result.success) {
            throw new Error(result.message || "Failed to update notification");
          }
        })
      );

      const doneKeys = new Set(targets.map(statusAlertKey));
      setStatusAlerts((prev) => {
        const remaining = prev.filter((item) => !doneKeys.has(statusAlertKey(item)));
        if (remaining.length === 0) setShowStatusAlert(false);
        return remaining;
      });
    } catch (error) {
      console.error("Enquiry status acknowledge error:", error);
      alert(error.message || "Failed to update notification");
    } finally {
      setStatusSavingKey(null);
    }
  };

  const statusAlertPopup =
    showStatusAlert && statusAlerts.length > 0 ? (
      <div className="fixed inset-0 z-[999997] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
          <div className="bg-amber-600 text-white p-5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <AlertTriangle size={32} />
              <div>
                <h2 className="text-2xl font-bold">Enquiry Status Update</h2>
                <p className="text-amber-100 text-sm">
                  {statusAlerts.length} enquir{statusAlerts.length !== 1 ? "ies" : "y"} you added
                  {statusAlerts.length !== 1 ? " are" : " is"} in Negotiation / Technical Clarification
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowStatusAlert(false)}
              className="p-2 hover:bg-amber-700 rounded-full transition"
              aria-label="Close"
            >
              <X size={26} />
            </button>
          </div>

          <div className="p-5 overflow-y-auto">
            {statusAlerts.map((item) => {
              const style = STATUS_ALERT_STYLES[item.status] || STATUS_ALERT_STYLES["Negotiation"];
              const key = statusAlertKey(item);

              return (
                <div key={key} className={`border-2 rounded-2xl p-4 mb-3 ${style.card}`}>
                  <div className="flex justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-lg font-bold text-gray-900">{item.customer_name || "-"}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        Enquiry <b>{item.enquiry_no}</b> · {formatAlertDate(item.enquiry_date)}
                        {item.phone_number ? ` · ${item.phone_number}` : ""}
                      </div>
                    </div>

                    <span className={`self-start px-3 py-1 rounded-xl text-sm font-bold ${style.chip}`}>
                      {item.status}
                    </span>
                  </div>

                  <div className="mt-3 flex justify-between items-center gap-3 flex-wrap">
                    <div className="text-sm text-gray-700 flex flex-col gap-1">
                      {item.quotation_no && (
                        <span className="flex items-center gap-1">
                          <FileText size={16} className="shrink-0" />
                          <b>Quotation:</b> <span className="break-all">{item.quotation_no}</span>
                        </span>
                      )}
                      <span>
                        <b>Changed by:</b> {item.changed_by || "-"}
                        {item.changed_at ? ` · ${formatAlertDate(item.changed_at)}` : ""}
                      </span>
                    </div>

                    <button
                      onClick={() => acknowledgeStatus([item])}
                      disabled={Boolean(statusSavingKey)}
                      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-xl text-sm font-bold transition"
                    >
                      {statusSavingKey === key ? "Saving..." : "OK, seen"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t flex justify-end gap-3">
            {statusAlerts.length > 1 && (
              <button
                onClick={() => acknowledgeStatus(statusAlerts)}
                disabled={Boolean(statusSavingKey)}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-5 py-2 rounded-xl font-bold transition"
              >
                {statusSavingKey === "all" ? "Saving..." : "Mark all as seen"}
              </button>
            )}
            <button
              onClick={() => setShowStatusAlert(false)}
              className="bg-gray-700 hover:bg-gray-800 text-white px-6 py-2 rounded-xl font-bold transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    ) : null;

  // Marks the negotiation rework as done. The request becomes "Revised"
  // and a linked enquiry's remark becomes "Negotiation Rework Completed".
  const markReworkCompleted = async (request) => {
    if (completingId) return;

    try {
      setCompletingId(request.id);

      const response = await apiFetch(
        `${API}/update_quotation_alteration_status.php`,
        {
          method: "POST",
          body: JSON.stringify({
            id: request.id,
            status: "Revised",
            revised_by: userName
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update request");
      }

      setRequests((prev) =>
        prev.filter((item) => String(item.id) !== String(request.id))
      );
    } catch (error) {
      console.error("Mark rework completed error:", error);
      alert(error.message || "Failed to mark rework completed");
    } finally {
      setCompletingId(null);
    }
  };

  if (!isQuotationTeam || !showAlert || requests.length === 0) {
    return statusAlertPopup;
  }

  return (
    <>
    {statusAlertPopup}
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

                  {request.enquiry_no && (
                    <div className="mt-1 text-sm text-gray-600">
                      From Enquiry: <b>{request.enquiry_no}</b>
                    </div>
                  )}
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

              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => markReworkCompleted(request)}
                  disabled={Boolean(completingId)}
                  className="
                    flex items-center gap-2 bg-green-700 hover:bg-green-800
                    disabled:opacity-60 text-white px-5 py-2
                    rounded-xl font-bold transition
                  "
                >
                  <CheckCircle size={18} />
                  {String(completingId) === String(request.id)
                    ? "Saving..."
                    : "Rework Completed"}
                </button>
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
    </>
  );
};

export default GlobalAlterationAlert;
