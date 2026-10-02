import { useState, useEffect, useCallback } from "react";
import { auth } from "../../components/firebase";
import { apiFetch } from "../../api/apiClient";

export default function FollowUpNotesButtonnew({ onPartyDetailsClick }) {
  const [showPopup, setShowPopup] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().substring(0, 10)
  );
  const [notes, setNotes] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  // 🔹 Helper function to format date from DD-MM-YYYY to YYYY-MM-DD
  const formatDMYtoYMD = (dmy) => {
    if (!dmy) return "";
    const [day, month, year] = dmy.split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  // 🔹 Helper function to format date from YYYY-MM-DD to DD-MM-YYYY
  const formatYMDtoDMY = (ymd) => {
    if (!ymd) return "";
    const [year, month, day] = ymd.split("-");
    return `${day}-${month}-${year}`;
  };

  // 🔹 Helper function to normalize username for comparison
  const normalizeUsername = (username) => {
    if (!username) return "";
    return username.toLowerCase().trim();
  };

  // ✅ Fetch all notes
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(
        "/serverphp/get_notes.php"
      );
      const data = await res.json();
      setAllNotes(data);
      applyFilters(data);
    } catch (err) {
      console.error("Error fetching notes:", err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Apply filters to show only current user's notes for selected date
  const applyFilters = useCallback(
    (notesData = allNotes) => {
      if (!user) return;

      // Filter notes for current user only and by follow-up date
      const filteredNotes = notesData.filter((n) => {
        // Check if note belongs to current user
        const isCurrentUser = normalizeUsername(n.username) === normalizeUsername(user);
        
        // Check if follow-up date matches selected date
        const isDateMatch = n.followUpDate && formatDMYtoYMD(n.followUpDate) === selectedDate;
        
        return isCurrentUser && isDateMatch;
      });

      // Sort by follow-up date (newest first)
      const sorted = filteredNotes.sort((a, b) => {
        const dateA = new Date(formatDMYtoYMD(a.followUpDate));
        const dateB = new Date(formatDMYtoYMD(b.followUpDate));
        return dateB - dateA;
      });

      setNotes(sorted);
    },
    [user, selectedDate, allNotes]
  );

  // ✅ Handle party click to show details
  const handlePartyClick = (partyLedger) => {
    setShowPopup(false);
    if (onPartyDetailsClick) onPartyDetailsClick(partyLedger);
  };

  // ✅ Auth listener to get current user
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        // Get user's display name or email
        setUser(u.displayName || u.email || "User");
      } else {
        setUser(null);
      }
    });
    return unsubscribe;
  }, []);

  // ✅ Fetch notes when popup opens
  useEffect(() => {
    if (showPopup && user) {
      fetchNotes();
    }
  }, [showPopup, user]);

  // ✅ Re-apply filters when date or user changes
  useEffect(() => {
    if (showPopup && user && allNotes.length > 0) {
      applyFilters(allNotes);
    }
  }, [selectedDate, user, allNotes, showPopup, applyFilters]);

  const isToday = selectedDate === new Date().toISOString().substring(0, 10);

  return (
    <>
      {/* Button to open popup */}
      <button
        onClick={() => setShowPopup(true)}
        className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md shadow"
      >
        My Follow-ups
      </button>

      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-2">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl w-full max-w-full sm:max-w-6xl relative max-h-[90vh] flex flex-col">
            {/* Close Button */}
            <button
              className="absolute top-2 right-3 text-xl font-bold text-gray-500 hover:text-red-600 z-10"
              onClick={() => setShowPopup(false)}
            >
              ×
            </button>

            <h2 className="text-lg sm:text-xl font-semibold text-gray-700 mb-4 text-center">
              My Follow-up Notes
            </h2>

            {/* Date Filter Section */}
            <div className="mb-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <label className="text-sm font-medium text-gray-700">
                  Follow-up Date:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().substring(0, 10))}
                  className="px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md border border-blue-300"
                >
                  Today
                </button>
              </div>
            </div>

            {/* User Info */}
            {user && (
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-600">
                  Showing notes for: <span className="font-semibold text-blue-600">{user}</span>
                </p>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="text-center p-4">
                <p className="text-gray-600">Loading your follow-up notes...</p>
              </div>
            )}

            {/* Table container with scroll */}
            <div className="flex-1 overflow-y-auto overflow-x-auto">
              {!loading && notes.length > 0 ? (
                <div>
                  <h3 className={`text-md sm:text-lg font-bold mb-3 text-center ${isToday ? 'text-red-600' : 'text-green-600'}`}>
                    {isToday ? "🔴 TODAY'S" : "📅"} FOLLOW-UP NOTES
                  </h3>

                  <table className="w-full border border-gray-300 text-xs sm:text-sm">
                    <thead className={`sticky top-0 z-10 ${isToday ? 'bg-red-50' : 'bg-green-50'}`}>
                      <tr>
                        <th className="border p-2 w-[50px]">SL</th>
                        <th className="border p-2 w-[110px]">Follow-up Date</th>
                        <th className="border p-2 w-[120px]">User</th>
                        <th className="border p-2 w-[200px]">Party Ledger</th>
                        <th className="border p-2">Note</th>
                        <th className="border p-2 w-[100px]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notes.map((n, index) => (
                        <tr 
                          key={n.id || index} 
                          className={`${isToday ? 'bg-red-50 hover:bg-red-100' : 'bg-green-50 hover:bg-green-100'} cursor-pointer`}
                          onClick={() => handlePartyClick(n.partyLedger)}
                        >
                          <td className="border p-2 text-center">
                            {index + 1}
                          </td>
                          <td className="border p-2 font-medium">
                            {n.followUpDate}
                          </td>
                          <td className="border p-2 font-semibold text-blue-600">
                            {n.username}
                          </td>
                          <td className="border p-2 font-medium text-blue-600 hover:underline">
                            {n.partyLedger}
                          </td>
                          <td className="border p-2 whitespace-pre-wrap">
                            {n.note}
                          </td>
                          <td className="border p-2">
                            <span
                              className={`px-2 py-1 rounded text-white text-xs ${
                                n.followUpStatus === "Closed"
                                  ? "bg-red-600"
                                  : n.followUpStatus === "Do Not Call"
                                  ? "bg-gray-600"
                                  : n.followUpStatus === "Call Later"
                                  ? "bg-orange-500"
                                  : n.followUpStatus === "Sorry Call"
                                  ? "bg-purple-600"
                                  : "bg-green-600"
                              }`}
                            >
                              {n.followUpStatus || "Open"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Summary */}
                  <div className="mt-3 text-sm text-gray-600 text-center">
                    Showing {notes.length} note(s) for {formatYMDtoDMY(selectedDate)}
                  </div>
                </div>
              ) : (
                !loading && (
                  <div className="text-center p-8 text-gray-500">
                    <p className="text-lg">No follow-up notes found for {formatYMDtoDMY(selectedDate)}</p>
                    <p className="text-sm mt-2">
                      You don't have any follow-ups scheduled for this date.
                    </p>
                  </div>
                )
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex justify-center gap-4 pt-4 border-t">
              <button
                onClick={() => setShowPopup(false)}
                className="px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}