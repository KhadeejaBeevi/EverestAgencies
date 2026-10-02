import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/apiClient";

export default function HiddenPartyPopup({ show, setShow, onUnhide }) {
  const [hiddenParties, setHiddenParties] = useState([]);

  useEffect(() => {
    if (show) fetchHiddenParties();
  }, [show]);

  const fetchHiddenParties = async () => {
    try {
      const res = await apiFetch("/serverphp/fetch_hidden_parties.php");
      const data = await res.json();
      setHiddenParties(data);
    } catch (err) {
      console.error("Error fetching hidden parties:", err);
    }
  };

  const handleUnhide = async (partyLedgerName) => {
    try {
      const res = await apiFetch("/serverphp/unhide_partyNL.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party_ledger_name: partyLedgerName }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Party Unhidden Successfully");
        fetchHiddenParties();
        if (onUnhide) onUnhide(); // Refresh main table
      }
    } catch (err) {
      console.error("Error unhiding:", err);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
      <div className="relative bg-white p-5 rounded-lg shadow-lg w-[90%] sm:w-[600px] max-h-[85vh] overflow-y-auto">

        {/* ❌ Close Button (top-right corner) */}
        <button
          onClick={() => setShow(false)}
          className="absolute top-2 right-3 text-gray-500 hover:text-red-600 text-2xl font-bold"
          title="Close"
        >
          &times;
        </button>

        {/* Header */}
        <h2 className="text-lg font-bold mb-4 text-center border-b pb-2">Do Not Call</h2>

        {/* Table Content */}
        {hiddenParties.length === 0 ? (
          <p className="text-gray-500 text-center">No hidden parties</p>
        ) : (
          <table className="w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2">Company Name</th>
                <th className="border p-2">Note</th>
                <th className="border p-2">Unhide</th>
              </tr>
            </thead>
            <tbody>
              {hiddenParties.map((p, idx) => (
                <tr key={idx}>
                  <td className="border p-2 font-medium">{p.party_ledger_name}</td>
                  <td className="border p-2 text-gray-700">{p.latest_note}</td>
                  <td className="border p-2 text-center">
                    <button
                      onClick={() => handleUnhide(p.party_ledger_name)}
                      className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 text-xs"
                    >
                      Unhide
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
