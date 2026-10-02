import { useState, useEffect, useCallback } from "react";
import { auth } from "../../components/firebase";
import { apiFetch } from "../../api/apiClient";

export default function NotesByDatePopup({ onPartyDetailsClick }) {
  const [showPopup, setShowPopup] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().substring(0, 10)
  );
  const [selectedGroup, setSelectedGroup] = useState("All");
  const [notes, setNotes] = useState([]);
  const [uniqueGroups, setUniqueGroups] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);


  const showPartyDetails = (partyObj) => {
  setSelectedParty(partyObj);
};

  // 🔹 Helpers
  const normalize = (val) => {
    if (!val) return "";
    const lower = val.toLowerCase().trim();
    return lower.includes("@") ? lower.split("@")[0] : lower;
  };

  const formatDMYtoYMD = (dmy) => {
    if (!dmy) return "";
    const [day, month, year] = dmy.split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  const formatYMDtoDMY = (ymd) => {
    if (!ymd) return "";
    const [year, month, day] = ymd.split("-");
    return `${day}-${month}-${year}`;
  };

  const formatDateDisplay = (dmyDate) => {
    if (!dmyDate) return "";
    const [day, month, year] = dmyDate.split("-");
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // ✅ Fetch Notes
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(
        "/serverphp/get_notes.php"
      );
      const data = await res.json();
      setAllNotes(data);

      // Filter notes for the current user
      const userNotes = data.filter(
        (n) => normalize(n.username) === normalize(user)
      );

      // Extract unique groups
      const groups = Array.from(
        new Set(
          userNotes.map((n) => n.group_name?.trim() || "No Group").filter(Boolean)
        )
      ).sort();

      setUniqueGroups(groups);
      applyFilters(data);
    } catch (err) {
      console.error("Error fetching notes:", err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Apply Filters
  const applyFilters = useCallback(
    (notesData = allNotes) => {
      if (!user) return;

      const userNotes = notesData.filter(
        (n) => normalize(n.username) === normalize(user)
      );

      // Match by follow-up date
      const dateFiltered = userNotes.filter((n) => {
        if (!n.followUpDate) return false;
        return formatDMYtoYMD(n.followUpDate) === selectedDate;
      });

      // Match by group
      const groupFiltered =
        selectedGroup === "All"
          ? dateFiltered
          : dateFiltered.filter((n) => {
              const noteGroup = n.group_name?.trim() || "No Group";
              return noteGroup === selectedGroup;
            });

      // Sort latest first
      const sorted = groupFiltered.sort((a, b) => {
        const dateA = new Date(formatDMYtoYMD(a.followUpDate));
        const dateB = new Date(formatDMYtoYMD(b.followUpDate));
        return dateB - dateA;
      });

      setNotes(sorted);
    },
    [user, selectedDate, selectedGroup, allNotes]
  );

  // ✅ Handle Party Click
const handlePartyClick = async (partyLedger) => {
  setShowPopup(false);

  try {
    const res = await apiFetch(
      `/serverphp/get_party_details.php?partyLedger=${encodeURIComponent(partyLedger)}`
    );
    const data = await res.json();

    if (data && data.length > 0) {
      if (onPartyDetailsClick) onPartyDetailsClick(data[0]); // 👈 Send full details
    } else {
      console.error("Party details not found");
    }
  } catch (err) {
    console.error("Error fetching party details:", err);
  }
};


  // ✅ Reset Filters
  const handleResetFilters = () => {
    setSelectedGroup("All");
    setSelectedDate(new Date().toISOString().substring(0, 10));
  };

  // ✅ Auth Listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u ? u.displayName || u.email : null);
    });
    return unsubscribe;
  }, []);

  // ✅ Fetch Notes when popup opens
  useEffect(() => {
    if (showPopup && user) fetchNotes();
  }, [showPopup, user]);

  // ✅ Re-apply filters when date/group/user/allNotes change
  useEffect(() => {
    if (showPopup && user && allNotes.length > 0) applyFilters(allNotes);
  }, [selectedDate, selectedGroup, user, allNotes, showPopup, applyFilters]);

  const isToday = selectedDate === new Date().toISOString().substring(0, 10);


  return (
    <>
      {/* Open Button */}
      <button
        onClick={() => setShowPopup(true)}
        className="w-[130px] h-[36px] text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow"
      >
        View Notes
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
              Follow Up Notes
            </h2>

            {/* Filters Section */}
            <div className="mb-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* Date Selector */}
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <label className="text-sm font-medium text-gray-700">
                  Select Date:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().substring(0, 10))}
                  className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md border border-gray-300"
                >
                  Today
                </button>
              </div>

              {/* Group Filter */}
              <div className="w-full sm:w-[220px]">
                <label className="text-xs sm:text-sm font-medium text-gray-700 block mb-1">Group:</label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Groups</option>
                  {uniqueGroups.map((group, idx) => (
                    <option key={`group-${idx}-${group}`} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset Filters Button */}
              <div className="flex items-end">
                <button
                  onClick={handleResetFilters}
                  className="px-3 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-md border border-red-600 whitespace-nowrap"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center p-4">
                <p className="text-gray-600">Loading notes...</p>
              </div>
            )}

            {/* Table container with scroll */}
            <div className="flex-1 overflow-y-auto overflow-x-auto">
              {!loading && notes && notes.length > 0 ? (
                <div>
                  <h3 className={`text-md sm:text-lg font-bold mb-3 flex items-center ${isToday ? 'text-red-600' : 'text-blue-600'}`}>
                    {isToday ? '🔴 TODAY\'S' : '📅'} FOLLOW UPS - {formatDateDisplay(formatYMDtoDMY(selectedDate))}
                    {selectedGroup !== "All" && ` | Group: ${selectedGroup}`}
                  </h3>

                  <table className="w-full border border-gray-300 text-xs sm:text-sm">
                    <thead className={`sticky top-0 z-10 ${isToday ? 'bg-red-50' : 'bg-blue-50'}`}>
                      <tr>
                        <th className="border p-2 w-[50px]">SL</th>
                        <th className="border p-2 w-[90px]">Follow Up Date</th>
                        <th className="border p-2 w-[90px]">User</th>
                        <th className="border p-2 w-[200px]">Party Ledger</th>
                        <th className="border p-2 w-[150px]">Group</th>
                        <th className="border p-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notes.map((n, index) => (
                        <tr key={n.id || index} className={isToday ? 'bg-red-50 hover:bg-red-100' : 'bg-blue-50 hover:bg-blue-100'}>
                          <td className="border p-2 text-center">
                            {index + 1}
                          </td>
                          <td className="border p-2 font-medium">
                            {n.followUpDate}
                          </td>
                          <td className="border p-2">{n.username}</td>
                          <td
                            onClick={() => handlePartyClick(n.partyLedger)}
                            className="border p-2 font-medium cursor-pointer hover:underline text-blue-600"
                          >
                            {n.partyLedger}
                          </td>
                          <td className="border p-2 text-gray-700">
                            {n.group_name || "No Group"}
                          </td>
                          <td className="border p-2 whitespace-pre-wrap">
                            {n.note}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Summary */}
              <div className="mt-3 text-sm text-gray-600">
                    Showing {notes.length} note(s) for {formatDateDisplay(formatYMDtoDMY(selectedDate))}
                    {selectedGroup !== "All" && ` in group "${selectedGroup}"`}
                  </div>
                </div>
              ) : (
                !loading && (
                  <div className="text-center p-8 text-gray-500">
                    <p className="text-lg">No follow-up notes found for {formatDateDisplay(formatYMDtoDMY(selectedDate))}</p>
                    <p className="text-sm mt-2">
                      {selectedGroup !== "All" ? `in group "${selectedGroup}".` : "Try selecting a different date."}
                    </p>
                  </div>
                )
              )}
            </div>

{selectedParty && (
  <PartyDetailsPopup
    partyDetails={selectedParty}
    onClose={() => setSelectedParty(null)}
    onEditSave={refreshPartyList}
    refreshPartyList={refreshPartyList}
  />
)}

          </div>
        </div>        
      )}
    </>
  );
}