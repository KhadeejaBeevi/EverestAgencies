import { useState, useEffect } from "react";
import { apiFetch } from "../../api/apiClient";

export default function SorryCallPopup({ show, setShow, handlePartyClick, partiesWithNotes, highlightedFieldsPerParty }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch Sorry Call list
  const fetchSorryCallList = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(
        "/serverphp/get_sorrycall_listNL.php"
      );
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching Sorry Call list:", err);
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch only when popup is shown
  useEffect(() => {
    if (show) fetchSorryCallList();
  }, [show]);

  // Restore a party from Sorry Call list
  const handleRestore = async (partyLedger) => {
    if (!partyLedger) {
      console.error("Cannot restore: partyLedger is missing");
      return;
    }

    try {
      const res = await apiFetch(
        "/serverphp/restore_sorrycall_partyNL.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partyLedger }),
        }
      );

      const data = await res.json();
      if (data.success) {
        fetchSorryCallList(); // Refresh list
        if (window.refreshMainTable) window.refreshMainTable(); // Refresh main table
        alert(`Party "${partyLedger}" restored successfully!`);
      } else {
        console.error("Failed to restore:", data);
        alert(`Failed to restore: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Error restoring party:", err);
      alert("Network error. Please try again.");
    }
  };

  // View party details
  const handleViewDetails = (party) => {
    handlePartyClick(party);
    setShow(false); // Close popup when viewing details
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative p-6">
        {/* Close button */}
        <button
          className="absolute top-2 right-3 text-xl font-bold text-gray-500 hover:text-red-600"
          onClick={() => setShow(false)}
        >
          ×
        </button>

        <h2 className="text-xl font-semibold text-gray-700 mb-4 text-center">
          📞 Sorry Call List
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full border border-gray-300 text-sm divide-y divide-gray-200">
            <thead className="bg-orange-100 sticky top-0 z-10">
              <tr>
                <th className="border p-2 w-[50px] text-center">SL</th>
                <th className="border p-2 w-[200px]">Company Name</th>
                <th className="border p-2 w-[150px]">Added Date</th>
                <th className="border p-2">Reason/Notes</th>
                <th className="border p-2 w-[120px]">Field Executive</th>
                <th className="border p-2 w-[250px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center p-4 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : list.length > 0 ? (
                list.map((item, index) => {
                  const partyLedger = item.party_ledger_name || item.PartyLedgerName;
                  const hasNotes = partiesWithNotes.includes(partyLedger);
                  const highlighted = highlightedFieldsPerParty[partyLedger] || [];

                  return (
                    <tr
                      key={item.id || index}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50 hover:bg-orange-50"}
                    >
                      <td className="border p-2 text-center">{index + 1}</td>
                      <td className="border p-2 font-medium">
                        <button
                          onClick={() => handleViewDetails(item)}
                          className="text-blue-600 hover:underline text-left"
                          title="View party details"
                        >
                          {partyLedger}
                        </button>
                        {hasNotes && (
                          <span className="ml-2 text-green-600 text-xs" title="Has notes">
                            📝
                          </span>
                        )}
                        {highlighted.length > 0 && (
                          <span className="ml-2 text-red-600 text-xs" title={`Edited fields: ${highlighted.join(", ")}`}>
                            ✏️
                          </span>
                        )}
                      </td>
                      <td className="border p-2">{item.created_at || item.added_date || "-"}</td>
                      <td className="border p-2">
                        <div className="max-h-20 overflow-y-auto">
                          {item.note || item.reason || item.notes || "-"}
                        </div>
                      </td>
                      <td className="border p-2">{item.field_executive || "-"}</td>
                      <td className="border p-2 text-center space-x-2">
                        <button
                          className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 text-xs"
                          onClick={() => handleViewDetails(item)}
                          title="View Details"
                        >
                          👁️ View
                        </button>
                        <button
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs"
                          onClick={() => handleRestore(partyLedger)}
                          title="Restore to Main List"
                        >
                          ↪️ Restore
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="text-center p-4 text-gray-500">
                    No parties in Sorry Call list.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Total: <span className="font-bold">{list.length}</span> parties
          </div>
          <button
            onClick={() => setShow(false)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}