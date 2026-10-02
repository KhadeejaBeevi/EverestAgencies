import { useState, useEffect } from "react";
import { apiFetch } from "../../api/apiClient";

export default function UnusedPartyPopup({ show, setShow }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchUnused = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/serverphp/get_unusedparty_list.php");
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching unused party list:", err);
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) fetchUnused();
  }, [show]);

  const handleUnhide = async (partyLedger) => {
    try {
      const res = await apiFetch("/serverphp/unhide_unusedparty.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyLedger }),
      });
      const data = await res.json();
      if (data.success) {
        fetchUnused();
        if (window.refreshMainTable) window.refreshMainTable();
      }
    } catch (err) {
      console.error("Error restoring party:", err);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative p-6">
        <button
          className="absolute top-2 right-3 text-xl font-bold text-gray-500 hover:text-red-600"
          onClick={() => setShow(false)}
        >
          ×
        </button>

        <h2 className="text-xl font-semibold text-gray-700 mb-4 text-center">
          💤 Unused Party List
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full border border-gray-300 text-sm divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="border p-2 w-[50px] text-center">SL</th>
                <th className="border p-2 w-[200px]">Party Ledger</th>
                <th className="border p-2">Note</th>
                <th className="border p-2 w-[150px]">Removed Date</th>
                <th className="border p-2 w-[100px] text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center p-4 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : list.length > 0 ? (
                list.map((item, index) => (
                  <tr key={item.id || index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border p-2 text-center">{index + 1}</td>
                    <td className="border p-2">{item.PartyLedgerName}</td>
                    <td className="border p-2">{item.note || "-"}</td>
                    <td className="border p-2">{item.created_at || "-"}</td>
                    <td className="border p-2 text-center">
                      <button
                        onClick={() => handleUnhide(item.PartyLedgerName)}
                        className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Unhide
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center p-4 text-gray-500">
                    No unused parties found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
