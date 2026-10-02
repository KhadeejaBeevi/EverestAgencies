import { useState, useEffect, useCallback } from "react";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import NotesPanel from "./NotesPanel";
import EditPartyModal from "./EditPartyPopup";
import { apiFetch } from "../../api/apiClient";

export default function FollowUpNotesButton({ onPartyDetailsClick }) {
  const [showPopup, setShowPopup] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().substring(0, 10)
  );
  const [notes, setNotes] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [partyDetails, setPartyDetails] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [highlightedFieldsPerParty, setHighlightedFieldsPerParty] = useState({});
  const [partiesWithNotes, setPartiesWithNotes] = useState([]);
  const [notesData, setNotesData] = useState([]);

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

  // ✅ Fetch notes data
  const fetchNotesData = () => {
    apiFetch("/serverphp/get_notes.php")
      .then((res) => res.json())
      .then((data) => setNotesData(data))
      .catch((err) => console.error("Failed to fetch notes:", err));
  };

  // ✅ Fetch highlighted fields
  const fetchHighlightedFields = () => {
    apiFetch("/serverphp/fetch_edited_fields.php")
      .then(res => res.json())
      .then(data => {
        setHighlightedFieldsPerParty(data);
      })
      .catch(err => console.error("Failed to load edited highlights:", err));
  };

  // ✅ Fetch parties with notes
  const fetchPartiesWithNotes = () => {
    apiFetch("/serverphp/getgreenparties_with_notes.php")
      .then(res => res.json())
      .then(data => {
        setPartiesWithNotes(data);
      })
      .catch(console.error);
  };

  // ✅ Fetch party details when party name is clicked
  const handlePartyClick = async (partyLedgerName) => {
    try {
      const response = await apiFetch("/serverphp/party_details.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ PartyLedgerName: partyLedgerName }),
      });
      
      const data = await response.json();
      setPartyDetails(data);
      
      // Also call the parent component's handler if provided
      if (onPartyDetailsClick) {
        onPartyDetailsClick(partyLedgerName);
      }
    } catch (err) {
      console.error("Error fetching party details:", err);
    }
  };

  // ✅ Close party details popup
  const closePartyDetails = () => {
    setPartyDetails(null);
  };

  // ✅ Fetch all notes for the follow-up table
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

  // ✅ Handle edit modal save
  const handleEditSave = (updated) => {
    const changed = [];

    const fieldLabelMap = {
      "Ledger.$LedgerMobile": "Mobile",
      "Ledger.$EMail": "Email",
      "Ledger.$_LedgerPhone": "Ledger Phone",
      "Ledger.$_Led_OwnerName_Form": "Owner Name",
      "Ledger.$_Led_OwnerPhone_Form": "Owner Phone",
      "Ledger.$_Led_Payment_Contact_P_Form": "Payment Contact",
      "Ledger.$_Led_Payment_Contact_PHone_Form": "Payment Phone",
      "Ledger.$_Led_Purchase_Contact_P_Form": "Purchase Contact",
      "Ledger.$_Led_Purchase_Contact_PHone_Form": "Purchase Phone",
      "Ledger.$_LedGroup": "Group",
    };

    if ((updated.designation || "") !== (partyDetails.designation || "")) {
      changed.push("Designation");
    }
    if ((updated.designator_name || "") !== (partyDetails.designator_name || "")) {
      changed.push("Designator Name");
    }

    if ((updated["Ledger.$LedgerMobile"] || "") !== (partyDetails["Ledger.$LedgerMobile"] || "")) {
      changed.push("Mobile");
    }
    if ((updated["Ledger.$EMail"] || "") !== (partyDetails["Ledger.$EMail"] || "")) {
      changed.push("Email");
    }
    for (let i = 1; i <= 5; i++) {
      const key = `Ledger.$_Address${i}`;
      if ((updated[key] || "") !== (partyDetails[key] || "")) {
        changed.push("Address");
        break;
      }
    }

    for (const [key, label] of Object.entries(fieldLabelMap)) {
      if ((updated[key] || "") !== (partyDetails[key] || "")) {
        if (!changed.includes(label)) {
          changed.push(label);
        }
      }
    }

    console.log("✅ Changed fields:", changed);

    setPartyDetails(updated);

    setHighlightedFieldsPerParty(prev => {
      const existingFields = prev[updated.PartyLedgerName] || [];
      const allHighlightedFields = [...new Set([...existingFields, ...changed])];

      const newHighlights = {
        ...prev,
        [updated.PartyLedgerName]: allHighlightedFields,
      };

      apiFetch("/serverphp/fetch_edited_fields.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyName: updated.PartyLedgerName,
          editedFields: allHighlightedFields
        })
      })
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            console.log("✅ Highlighted fields saved to database");
          } else {
            console.error("❌ Failed to save highlighted fields:", result.error);
          }
        })
        .catch(err => console.error("❌ Error saving highlighted fields:", err));

      return newHighlights;
    });

    setPartiesWithNotes(prev => [...new Set([...prev, updated.PartyLedgerName])]);

    setIsEditModalOpen(false);
    console.log("✅ UI updated successfully");
  };

  // ✅ Auth listener to get current user from Firestore
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        // Get user's display name or email as fallback
        setUser(u.displayName || u.email || "User");
        
        // Fetch username from Firestore
        try {
          const docRef = doc(db, "Users", u.uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            const firestoreUsername = data.firstName || "User";
            setUsername(firestoreUsername);
            setUser(firestoreUsername);
          }
        } catch (error) {
          console.error("Error fetching user data from Firestore:", error);
          setUsername(u.displayName || u.email || "User");
        }
      } else {
        setUser(null);
        setUsername("");
      }
    });
    return unsubscribe;
  }, []);

  // ✅ Fetch data when popup opens
  useEffect(() => {
    if (showPopup && user) {
      fetchNotes();
      fetchNotesData();
      fetchHighlightedFields();
      fetchPartiesWithNotes();
    }
  }, [showPopup, user]);

  // ✅ Re-apply filters when date or user changes
  useEffect(() => {
    if (showPopup && user && allNotes.length > 0) {
      applyFilters(allNotes);
    }
  }, [selectedDate, user, allNotes, showPopup, applyFilters]);

  const isToday = selectedDate === new Date().toISOString().substring(0, 10);

  // Status color function
  const getStatusClass = (status) => {
    return status === "Closed"
      ? "bg-red-600"
      : status === "Do Not Call"
      ? "bg-gray-600"
      : status === "Call Later"
      ? "bg-orange-500"
      : status === "Sorry Call"
      ? "bg-purple-600"
      : "bg-green-600";
  };

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
                        <th className="border p-2 w-[80px]">Enquired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notes.map((n, index) => (
                        <tr 
                          key={n.id || index} 
                          className={`${isToday ? 'bg-red-50 hover:bg-red-100' : 'bg-green-50 hover:bg-green-100'} cursor-pointer`}
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
                          <td 
                            className="border p-2 font-medium text-blue-600 hover:underline cursor-pointer"
                            onClick={() => handlePartyClick(n.partyLedger)}
                            title="Click to view party details"
                          >
                            {n.partyLedger}
                          </td>
                          <td className="border p-2 whitespace-pre-wrap">
                            {n.note}
                          </td>
                          <td className="border p-2">
                            <span
                              className={`px-2 py-1 rounded text-white text-xs ${getStatusClass(n.followUpStatus)}`}
                            >
                              {n.followUpStatus || "Open"}
                            </span>
                          </td>
                          <td className="border p-2 text-center">
                            <span
                              className={`px-2 py-1 rounded text-white text-xs ${
                                n.enquired === "Yes" ? "bg-green-600" : "bg-gray-400"
                              }`}
                            >
                              {n.enquired || "No"}
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

      {/* Party Details Popup - Same as your main component */}
      {partyDetails && (
        <div className="fixed top-4 right-4 w-[90%] sm:w-80 max-h-[90vh] overflow-y-auto p-4 bg-white shadow-lg border border-gray-300 rounded-lg z-50">
          <h3 className="text-base sm:text-lg font-bold mb-2 break-words">{partyDetails.PartyLedgerName}</h3>

          <div className="space-y-2 text-xs sm:text-sm">
            <p>
              <strong>Ledger Group:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Group")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$_LedGroup"]}
              </span>
            </p>

            <p>
              <strong>Mobile:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Mobile")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$LedgerMobile"]}
              </span>
            </p>

            <p>
              <strong>Address:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Address")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {[1, 2, 3, 4, 5]
                  .map((i) => partyDetails[`Ledger.$_Address${i}`])
                  .filter((line) => !!line && line.trim() !== "")
                  .join(", ")}
              </span>
            </p>

            <p>
              <strong>Designation:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Designation")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails.designation || "-"}
              </span>
            </p>

            <p>
              <strong>Designator Name:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Designator Name")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails.designator_name || "-"}
              </span>
            </p>

            <p>
              <strong>Email:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Email")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$EMail"]}
              </span>
            </p>

            <p>
              <strong>Ledger Phone:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Ledger Phone")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$_LedgerPhone"]}
              </span>
            </p>

            <p>
              <strong>Owner Name:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Owner Name")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$_Led_OwnerName_Form"]}
              </span>
            </p>

            <p>
              <strong>Owner Phone:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Owner Phone")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$_Led_OwnerPhone_Form"]}
              </span>
            </p>

            <p>
              <strong>Payment Contact Name:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Payment Contact")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$_Led_Payment_Contact_P_Form"]}
              </span>
            </p>

            <p>
              <strong>Payment Phone No:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Payment Phone")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$_Led_Payment_Contact_PHone_Form"]}
              </span>
            </p>

            <p>
              <strong>Purchase Contact Name:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Purchase Contact")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$_Led_Purchase_Contact_P_Form"]}
              </span>
            </p>

            <p>
              <strong>Purchase Phone No:</strong>{" "}
              <span className={
                highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Purchase Phone")
                  ? "text-red-600 font-bold"
                  : ""
              }>
                {partyDetails["Ledger.$_Led_Purchase_Contact_PHone_Form"]}
              </span>
            </p>
          </div>

          <div className="flex justify-between mt-3">
            <button
              onClick={closePartyDetails}
              className="px-3 py-1 bg-red-500 text-white rounded text-xs sm:text-sm hover:bg-red-600"
            >
              Close
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="px-3 py-1 bg-blue-600 text-white rounded text-xs sm:text-sm hover:bg-blue-700"
            >
              Open Notes
            </button>
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="px-3 py-1 bg-yellow-500 text-white rounded text-xs sm:text-sm hover:bg-yellow-600"
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {/* Notes Panel */}
      <NotesPanel
        partyLedger={partyDetails?.PartyLedgerName}
        showPopup={showNotes}
        setShowPopup={setShowNotes}
        onNoteSaved={(ledger, removed) => {
          if (removed) {
            // Handle removal if needed
            console.log("Note removed for:", ledger);
          } else {
            setPartiesWithNotes(prev => [...new Set([...prev, ledger])]);
            fetchNotesData();
            fetchNotes(); // Refresh the follow-up notes
          }
        }}
      />

      {/* Edit Modal */}
      {isEditModalOpen && partyDetails && (
        <EditPartyModal
          partyDetails={partyDetails}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleEditSave}
        />
      )}
    </>
  );
}