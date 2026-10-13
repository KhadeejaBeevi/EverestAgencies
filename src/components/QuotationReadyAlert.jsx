import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { X, CheckCircle, FileText } from "lucide-react";
import { apiFetch } from "../api/apiClient";

const API = "/serverphp";

/*
 * Notifies the person who added an enquiry (Enquiry Capture
 * "Added By") when a quotation number is attached to it, either
 * from the enquiry form or from the quotation page.
 */

// Same name the Enquiry Capture page saves as "added_by".
async function getUserFullName(user) {
  try {
    const userSnap = await getDoc(doc(db, "Users", user.uid));

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const fullName = `${String(userData.firstName || "").trim()} ${String(userData.lastName || "").trim()}`.trim();
      if (fullName) return fullName;
    }
  } catch (error) {
    console.error("Quotation ready user lookup error:", error);
  }

  try {
    const localUser = JSON.parse(localStorage.getItem("User") || "{}");
    return `${String(localUser.firstName || "").trim()} ${String(localUser.lastName || "").trim()}`.trim();
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// One key per enquiry + quotation, so a changed quotation counts as new.
const itemKey = (item) => `${item.id}|${item.quotation_no}`;

const QuotationReadyAlert = () => {
  const [userName, setUserName] = useState("");
  const [items, setItems] = useState([]);
  const [showAlert, setShowAlert] = useState(false);
  const [savingKey, setSavingKey] = useState(null);

  const knownKeys = useRef(new Set());
  const alertAudio = useRef(null);

  useEffect(() => {
    const audio = new Audio("/notification.mp3");
    audio.preload = "auto";
    alertAudio.current = audio;

    return () => {
      audio.pause();
      alertAudio.current = null;
    };
  }, []);

  const playAlertSound = async () => {
    try {
      if (!alertAudio.current) return;
      alertAudio.current.currentTime = 0;
      await alertAudio.current.play();
    } catch (error) {
      console.error("Quotation ready sound could not play:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      knownKeys.current = new Set();
      setItems([]);
      setShowAlert(false);
      setUserName(user ? await getUserFullName(user) : "");
    });

    return () => unsubscribe();
  }, []);

  const loadItems = async () => {
    if (!userName) return;

    try {
      const response = await apiFetch(
        `${API}/enquiry_report.php?quotation_ready=1&user=${encodeURIComponent(userName)}`,
        { method: "GET" }
      );
      const result = await response.json();
      const readyItems = Array.isArray(result?.data) ? result.data : [];

      const newFound = readyItems.some((item) => !knownKeys.current.has(itemKey(item)));
      readyItems.forEach((item) => knownKeys.current.add(itemKey(item)));

      setItems(readyItems);

      if (newFound) {
        setShowAlert(true);
        playAlertSound();
      }
    } catch (error) {
      console.error("Quotation ready load error:", error);
    }
  };

  useEffect(() => {
    if (!userName) return;

    loadItems();

    // Skip polling while the tab is in the background to avoid
    // "429 Too Many Requests" from the host.
    const interval = setInterval(() => {
      if (!document.hidden) loadItems();
    }, 20000);

    return () => clearInterval(interval);
  }, [userName]);

  const markSeen = async (item) => {
    const response = await apiFetch(`${API}/enquiry_report.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        quotation_ready_ack: "1",
        enquiry_id: String(item.id),
        quotation_no: item.quotation_no
      }).toString()
    });
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to update notification");
    }
  };

  const acknowledge = async (targets) => {
    if (savingKey) return;

    try {
      setSavingKey(targets.length === 1 ? itemKey(targets[0]) : "all");
      await Promise.all(targets.map(markSeen));

      const doneKeys = new Set(targets.map(itemKey));
      setItems((prev) => {
        const remaining = prev.filter((item) => !doneKeys.has(itemKey(item)));
        if (remaining.length === 0) setShowAlert(false);
        return remaining;
      });
    } catch (error) {
      console.error("Quotation ready acknowledge error:", error);
      alert(error.message || "Failed to update notification");
    } finally {
      setSavingKey(null);
    }
  };

  if (!showAlert || items.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[999998] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-green-700 text-white p-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <CheckCircle size={32} />
            <div>
              <h2 className="text-2xl font-bold">Quotation Ready</h2>
              <p className="text-green-100 text-sm">
                {items.length} enquir{items.length !== 1 ? "ies" : "y"} you added now ha
                {items.length !== 1 ? "ve" : "s"} a quotation
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAlert(false)}
            className="p-2 hover:bg-green-800 rounded-full transition"
            aria-label="Close"
          >
            <X size={26} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {items.map((item) => (
            <div
              key={itemKey(item)}
              className="border-2 border-green-200 bg-green-50 rounded-2xl p-4 mb-3"
            >
              <div className="flex justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-lg font-bold text-gray-900">{item.customer_name || "-"}</div>
                  <div className="mt-1 text-sm text-gray-600">
                    Enquiry <b>{item.enquiry_no}</b> · {formatDate(item.enquiry_date)}
                    {item.phone_number ? ` · ${item.phone_number}` : ""}
                  </div>
                </div>

                <div className="flex items-start gap-2 text-green-800 font-bold">
                  <FileText size={20} className="shrink-0 mt-0.5" />
                  <span className="break-all">{item.quotation_no}</span>
                </div>
              </div>

              <div className="mt-3 flex justify-between items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-700">
                  <b>Quotation by:</b> {item.entered_by || "-"}
                </span>

                <button
                  onClick={() => acknowledge([item])}
                  disabled={Boolean(savingKey)}
                  className="bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white px-4 py-1.5 rounded-xl text-sm font-bold transition"
                >
                  {savingKey === itemKey(item) ? "Saving..." : "OK, seen"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t flex justify-end gap-3">
          {items.length > 1 && (
            <button
              onClick={() => acknowledge(items)}
              disabled={Boolean(savingKey)}
              className="bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white px-5 py-2 rounded-xl font-bold transition"
            >
              {savingKey === "all" ? "Saving..." : "Mark all as seen"}
            </button>
          )}
          <button
            onClick={() => setShowAlert(false)}
            className="bg-gray-700 hover:bg-gray-800 text-white px-6 py-2 rounded-xl font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuotationReadyAlert;
