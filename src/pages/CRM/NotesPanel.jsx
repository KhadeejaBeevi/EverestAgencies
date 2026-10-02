import { useState, useEffect } from "react";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { apiFetch } from "../../api/apiClient";

export default function NotesPanel({ partyLedger, showPopup, setShowPopup, readOnly = false, onNoteSaved }) {
  const [notes, setNotes] = useState([]);
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpStatus, setFollowUpStatus] = useState("Open");
  const [enquired, setEnquired] = useState("No"); // default No
  const [showEnquiredPopup, setShowEnquiredPopup] = useState(false);
  const [enquiredReport, setEnquiredReport] = useState([]);


  const fetchEnquiredReport = () => {
    apiFetch("/serverphp/getenquiry.php")
      .then((res) => res.json())
      .then((data) => {
        // If you only want the *latest note per party*, filter here
        // else just keep all
        setEnquiredReport(data);
      });
  };


  useEffect(() => {
    if (showEnquiredPopup) fetchEnquiredReport();
  }, [showEnquiredPopup]);



  useEffect(() => {
    if (!readOnly) {
      auth.onAuthStateChanged(async (user) => {
        if (user) {
          const docRef = doc(db, "Users", user.uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            setUsername(data.firstName || "User");
          }
        }
      });
    }
  }, [readOnly]);


  const fetchNotes = () => {
    apiFetch("/serverphp/get_notes.php")
      .then((res) => res.json())
      .then((allNotes) => {
        const filtered = allNotes
          .filter((n) => n.partyLedger === partyLedger)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        setNotes(filtered);
      });
  };

  useEffect(() => {
    if (showPopup && partyLedger) fetchNotes();
  }, [showPopup, partyLedger]);
  useEffect(() => {
    if (showPopup) {
      setNote("");
      setFollowUpDate("");
      setFollowUpStatus("Open");
      setEnquired("No");
    }
  }, [showPopup]);

  // place this above return() in your component render scope
const statusClass =
  followUpStatus === "Closed"
    ? "bg-red-600"
    : followUpStatus === "Do Not Call"
    ? "bg-gray-600"
    : followUpStatus === "Call Later"
    ? "bg-orange-500"
    : followUpStatus === "Sorry Call"
    ? "bg-purple-600"
    : "bg-green-600";



const handleSave = () => {
 
  if (
    followUpStatus === "Do Not Call" ||
    followUpStatus === "Call Later" ||
    followUpStatus === "Sorry Call"
  ) {
    const endpoint =
      followUpStatus === "Do Not Call"
        ? "/serverphp/add_donotcall.php"
        : followUpStatus === "Call Later"
        ? "/serverphp/add_calllater.php"
        : "/serverphp/add_sorrycall.php";

    apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partyLedger, note }), // 👈 note will be ignored if empty
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setNote("");
          setFollowUpDate("");
          setFollowUpStatus("Open");
          setShowPopup(false);
          if (onNoteSaved) onNoteSaved(partyLedger, true);
        } else {
          console.error(`Failed to add to ${followUpStatus}:`, data.error);
        }
      })
      .catch((err) => console.error(`Error saving ${followUpStatus}:`, err));
  }

  // Case 2: Normal save (needs both note + followUpDate)
  else {
    if (!note.trim() || !followUpDate.trim()) return;

    apiFetch("/serverphp/add_note.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        note,
        date,
        partyLedger,
        followUpDate,
        followUpStatus,
        enquired,
      }),
    })
      .then(async (res) => {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (data.success) {
            setNote("");
            setFollowUpDate("");
            setFollowUpStatus("Open");
            fetchNotes();
            setShowPopup(false);
            if (onNoteSaved) onNoteSaved(partyLedger);
          } else {
            alert("Failed to save note: " + text);
          }
        } catch (err) {
          console.error("Invalid JSON from add_note.php:", text);
        }
      })
      .catch((err) => console.error("Error saving note:", err));
  }
};


  if (!partyLedger) return null;

  return (
   
    <>
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh] relative">
            {/* Header - Fixed */}
            <div className="flex-shrink-0 p-4 sm:p-6 border-b">
              <button
                className="absolute top-2 right-3 text-2xl sm:text-xl font-bold text-gray-500 hover:text-red-600"
                onClick={() => setShowPopup(false)}
              >
                ×
              </button>

              <h2 className="text-lg sm:text-xl font-semibold text-gray-700 text-center pr-6">
                {readOnly ? "View Notes for" : "Notes for"}{" "}
                <span className="text-blue-600 break-all">{partyLedger}</span>
              </h2>
            </div>

            {/* Scrollable Notes Table */}
            <div className="flex-1 overflow-auto p-4 sm:p-6">
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-300 text-xs sm:text-sm">
                  <thead className="bg-gray-100 sticky top-0 z-10">
                    <tr>
                      <th className="border p-2 text-left whitespace-nowrap">SL</th>
                      <th className="border p-2 text-left whitespace-nowrap">Date</th>
                      <th className="border p-2 text-left whitespace-nowrap">Name</th>
                      <th className="border p-2 text-left">Note</th>
                      {readOnly && <th className="border p-2 text-left whitespace-nowrap">Follow-Up Date</th>}
                      {readOnly && <th className="border p-2 text-left whitespace-nowrap">Status</th>}
                      {readOnly && <th className="border p-2 text-left whitespace-nowrap">Enquired</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {notes.map((n, index) => (
                      <tr key={n.id} className="hover:bg-gray-50">
                        <td className="border p-2 text-center">{index + 1}</td>
                        <td className="border p-2 whitespace-nowrap">{n.date}</td>
                        <td className="border p-2 whitespace-nowrap">{n.username}</td>
                        <td className="border p-2 whitespace-pre-wrap break-words min-w-[200px]">{n.note}</td>
                        {readOnly && <td className="border p-2 whitespace-nowrap">{n.followUpDate || "-"}</td>}
                        {readOnly && (
                          <td className="border p-2 font-semibold">
                            <span
                              className={`px-2 py-1 rounded text-white text-xs whitespace-nowrap inline-block ${n.followUpStatus === "Closed"
                                  ? "bg-red-600"
                                  : n.followUpStatus === "Do Not Call"
                                    ? "bg-gray-600"
                                    : "bg-green-600"
                                }`}
                            >
                              {n.followUpStatus || "Open"}
                            </span>
                          </td>
                        )}
                        {readOnly && <td className="border p-2">{n.enquired || "No"}</td>}
                      </tr>
                    ))}

                    {!readOnly && (
                      <tr className="bg-yellow-50">
                        <td className="border p-2 text-center text-gray-400">—</td>
                        <td className="border p-2">
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full border px-2 py-1 rounded text-xs sm:text-sm"
                          />
                        </td>
                        <td className="border p-2">
                          <input
                            type="text"
                            value={username}
                            readOnly
                            className="w-full border px-2 py-1 bg-gray-100 rounded text-xs sm:text-sm"
                          />
                        </td>
                        <td colSpan={readOnly ? 1 : 3} className="border p-2">
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            placeholder="Enter your note here..."
                            className="w-full border px-2 py-1 rounded text-xs sm:text-sm"
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Controls - Fixed */}
            {!readOnly && (
              <div className="flex-shrink-0 p-4 sm:p-6 border-t bg-gray-50">
                <div className="flex flex-col gap-3">
                  {/* All controls in one row on desktop, stacked on mobile */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    {/* Follow-up Date */}
                    <div className="flex gap-2 items-center">
                      <label className="font-medium text-sm whitespace-nowrap">Next Follow Up Date:</label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="border px-3 py-1 rounded flex-1 sm:w-40 text-sm"
                      />
                    </div>

                    {/* Status */}
                    <div className="flex gap-2 items-center">
                      <label className="font-medium text-sm whitespace-nowrap">Status:</label>
                      <select
                        value={followUpStatus}
                        onChange={(e) => {
                          const selected = e.target.value;
                          setFollowUpStatus(selected);
                          if (selected === "Do Not Call") {
                            const today = new Date().toISOString().substring(0, 10);
                            setFollowUpDate(today);
                          }
                        }}
                        aria-label="Follow up status"
                        className={`border px-3 py-1 rounded text-white focus:outline-none flex-1 sm:w-auto text-sm ${statusClass}`}
                      >
                        <option value="Open" className="text-black">Open</option>
                        <option value="Closed" className="text-black">Closed</option>
                        <option value="Do Not Call" className="text-black">Do Not Call</option>
                        <option value="Call Later" className="text-black">Update Details</option>
                        <option value="Sorry Call" className="text-black">Sorry Call</option>
                      </select>
                    </div>

                    {/* Enquiry */}
                    <div className="flex gap-2 items-center">
                      <label className="font-medium text-sm whitespace-nowrap">Enquiry:</label>
                      <select
                        value={enquired}
                        onChange={(e) => setEnquired(e.target.value)}
                        className="border px-3 py-1 rounded text-sm flex-1 sm:w-auto"
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                  </div>

                  {/* Save Button - Separate row */}
                  <button
                    onClick={handleSave}
                    disabled={
                      // disable if normal note save and fields missing
                      (followUpStatus !== "Do Not Call" &&
                        followUpStatus !== "Call Later" &&
                        followUpStatus !== "Sorry Call" &&
                        (!note.trim() || !followUpDate.trim()))
                    }
                    className={`w-full sm:w-auto px-6 py-2 rounded text-white font-medium text-sm ${
                      (followUpStatus !== "Do Not Call" &&
                        followUpStatus !== "Call Later" &&
                        followUpStatus !== "Sorry Call" &&
                        (!note.trim() || !followUpDate.trim()))
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  > 
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}