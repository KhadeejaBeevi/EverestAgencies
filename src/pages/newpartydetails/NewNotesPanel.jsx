import { useState, useEffect } from "react";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { apiFetch } from "../../api/apiClient";

export default function NewNotesPanel({
  partyLedger,
  partyId,
  showPopup,
  setShowPopup,
  readOnly = false,
  onNoteSaved,
}) {
  const [notes, setNotes] = useState([]);
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() =>
    new Date().toISOString().substring(0, 10)
  );
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpStatus, setFollowUpStatus] = useState("Open");
  const [enquired, setEnquired] = useState("No");

  // 🎨 Dropdown color logic
  const statusClass =
    followUpStatus === "Closed"
      ? "bg-red-600"
      : followUpStatus === "Do Not Call"
        ? "bg-gray-600"
        : followUpStatus === "Update Details"
          ? "bg-orange-500"
          : followUpStatus === "Sorry Call"
            ? "bg-purple-600"
            : followUpStatus === "Hidden Party"
              ? "bg-blue-800"
              : "bg-green-600";

  // ✅ Fetch username from Firestore
  useEffect(() => {
    if (!readOnly) {
      auth.onAuthStateChanged(async (user) => {
        if (user) {
          const docRef = doc(db, "Users", user.uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            setUsername(snap.data().firstName || "User");
          }
        }
      });
    }
  }, [readOnly]);

  // ✅ Fetch notes for selected party (latest first)
  const fetchNotes = () => {
    apiFetch("/serverphp/get_notes.php")
      .then((res) => res.json())
      .then((allNotes) => {
        const filtered = allNotes
          .filter((n) => n.partyLedger === partyLedger)
          .sort((a, b) => {
            const dateA = new Date(a.date || 0).getTime();
            const dateB = new Date(b.date || 0).getTime();
            return dateB - dateA;
          });

        setNotes(filtered);
      })
      .catch((err) => console.error("Error fetching notes:", err));
  };

  useEffect(() => {
    if (showPopup && partyLedger) {
      fetchNotes();
    }
  }, [showPopup, partyLedger]);

  // ✅ Save note handler
  const handleSave = () => {
    if (!partyLedger) return;

    console.log("📝 Saving note for:", partyLedger, "Status:", followUpStatus);

    // Handle special categories
    if (
      ["Do Not Call", "Call Later", "Sorry Call", "Hidden Party"].includes(
        followUpStatus
      )
    ) {
      const endpoint =
        followUpStatus === "Do Not Call"
          ? "/serverphp/add_donotcall.php"
          : followUpStatus === "Call Later"
            ? "/serverphp/add_calllater.php"
            : followUpStatus === "Sorry Call"
              ? "/serverphp/add_sorrycall.php"
              : "/serverphp/hide_partyNL.php";

      apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyLedger, note }),
      })
        .then((res) => res.json())
        .then(async (data) => {
          if (data.success) {
            await updateNoteStatusInDB(partyLedger);

            console.log("🎯 Calling onNoteSaved with:", partyLedger, followUpStatus);

            if (onNoteSaved) {
              onNoteSaved(partyId ?? partyLedger, followUpStatus);
            } else {
              console.log("❌ onNoteSaved callback is undefined!");
            }

            fetchNotes();

            setNote("");
            setFollowUpDate("");
            setFollowUpStatus("Open");
            setShowPopup(false);
          } else {
            alert("Failed: " + (data.error || data.message || "Unknown error"));
          }
        })
        .catch((err) => console.error("Error saving:", err));
      return;
    }

    // ✅ Normal save (non-special statuses)
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
      .then((res) => res.json())
      .then(async (data) => {
        if (data.success) {
          await updateNoteStatusInDB(partyLedger);

          console.log("✅ Normal note saved, calling onNoteSaved with:", partyLedger, followUpStatus);

          if (onNoteSaved) {
            onNoteSaved(partyId ?? partyLedger, followUpStatus);
          } else {
            console.log("❌ onNoteSaved callback is undefined!");
          }

          fetchNotes();

          setNote("");
          setFollowUpDate("");
          setFollowUpStatus("Open");
          setEnquired("No");
          setShowPopup(false);
        } else {
          alert("Failed to save note.");
        }
      })
      .catch((err) => console.error("Error saving note:", err));
  };

  // ✅ Update SQL column `note_updated = 1`
  const updateNoteStatusInDB = async (partyLedger) => {
    try {
      const response = await apiFetch(
        "/serverphp/update_note_status.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partyLedger }),
        }
      );
      const result = await response.json();
      if (!result.success) {
        console.error("Failed to update note flag:", result.error);
      }
    } catch (err) {
      console.error("Error updating note flag:", err);
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


              <h2 className="text-lg sm:text-xl font-semibold text-gray-700 text-center pr-6">
                {readOnly ? "View Notes for" : "Notes for"}{" "}
                <span className="text-blue-600 underline break-all">{partyLedger}</span>
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
                      {readOnly && (
                        <>
                          <th className="border p-2 text-left whitespace-nowrap">
                            Follow-Up
                          </th>
                          <th className="border p-2 text-left whitespace-nowrap">Status</th>
                          <th className="border p-2 text-left whitespace-nowrap">Enquired</th>
                        </>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {notes.map((n, index) => (
                      <tr key={n.id} className="hover:bg-gray-50">
                        <td className="border p-2 text-center">{index + 1}</td>
                        <td className="border p-2 whitespace-nowrap">{n.date}</td>
                        <td className="border p-2 whitespace-nowrap">{n.username}</td>
                        <td className="border p-2 whitespace-pre-wrap break-words min-w-[200px]">
                          {n.note}
                        </td>
                        {readOnly && (
                          <>
                            <td className="border p-2 whitespace-nowrap">
                              {n.followUpDate || "-"}
                            </td>
                            <td className="border p-2 font-semibold">
                              <span
                                className={`px-2 py-1 rounded text-white text-xs whitespace-nowrap inline-block ${n.followUpStatus === "Closed"
                                    ? "bg-red-600"
                                    : n.followUpStatus === "Do Not Call"
                                      ? "bg-gray-600"
                                      : n.followUpStatus === "Call Later"
                                        ? "bg-orange-500"
                                        : n.followUpStatus === "Sorry Call"
                                          ? "bg-purple-600"
                                          : n.followUpStatus === "Hidden Party"
                                            ? "bg-blue-800"
                                            : "bg-green-600"
                                  }`}
                              >
                                {n.followUpStatus || "Open"}
                              </span>
                            </td>
                            <td className="border p-2">{n.enquired || "No"}</td>
                          </>
                        )}
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
                        <td colSpan={3} className="border p-2">
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
                      <label className="font-medium text-sm whitespace-nowrap">Next Follow Up:</label>
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
                          if (["Do Not Call", "Hidden Party"].includes(selected)) {
                            const today = new Date().toISOString().substring(0, 10);
                            setFollowUpDate(today);
                          }
                        }}
                        className={`border px-3 py-1 rounded text-white font-medium text-sm flex-1 sm:w-auto ${statusClass}`}
                      >
                        <option value="Open" className="text-black">
                          Open
                        </option>
                        <option value="Closed" className="text-black">
                          Closed
                        </option>
                        <option value="Update Details" className="text-black">
                          Update Details
                        </option>
                        <option value="Sorry Call" className="text-black">
                          Sorry Call
                        </option>
                        <option value="Hidden Party" className="text-black">
                          Do Not Call
                        </option>
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

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleSave}
                      disabled={
                        ![
                          "Do Not Call",
                          "Call Later",
                          "Sorry Call",
                          "Hidden Party",
                        ].includes(followUpStatus) &&
                        (!note.trim() || !followUpDate.trim())
                      }
                      className={`flex-1 px-6 py-2 rounded text-white font-medium text-sm ${![
                          "Do Not Call",
                          "Call Later",
                          "Sorry Call",
                          "Hidden Party",
                        ].includes(followUpStatus) &&
                          (!note.trim() || !followUpDate.trim())
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700"
                        }`}
                    >
                      Save Note
                    </button>

                    <button
                      onClick={() => setShowPopup(false)}
                      className="flex-1 px-6 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium text-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}