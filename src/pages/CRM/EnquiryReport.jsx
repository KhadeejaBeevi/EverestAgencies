import { useState, useEffect } from "react";
import { apiFetch } from "../../api/apiClient";

export default function EnquiryReport({ show, setShow }) {
  const [enquiredReport, setEnquiredReport] = useState([]);

  const fetchEnquiredReport = () => {
    apiFetch("/serverphp/getenquiry.php")
      .then((res) => res.json())
      .then((data) => setEnquiredReport(data))
      .catch((err) => console.error("Error fetching enquiry report:", err));
  };

  useEffect(() => {
    if (show) fetchEnquiredReport();
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-3xl relative max-h-[90vh] overflow-hidden">
        <button
          className="absolute top-2 right-3 text-xl font-bold text-gray-500 hover:text-red-600"
          onClick={() => setShow(false)}
        >
          ×
        </button>

        <h2 className="text-xl font-semibold text-gray-700 mb-4 text-center">
          Enquiry Report
        </h2>

        <div className="overflow-y-auto max-h-[70vh] border rounded">
          <table className="w-full border border-gray-300 text-sm">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="border p-2">SL</th>
                <th className="border p-2">Party</th>
                <th className="border p-2">User</th>
                <th className="border p-2">Enquired</th>
              </tr>
            </thead>
            <tbody>
              {enquiredReport.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center p-4 text-gray-500">
                    No records found
                  </td>
                </tr>
              ) : (
                enquiredReport.map((row, i) => (
                  <tr key={row.id || i}>
                    <td className="border p-2 text-center">{i + 1}</td>
                    <td className="border p-2">{row.partyLedger}</td>
                    <td className="border p-2">{row.username}</td>
                    <td className="border p-2 font-semibold text-green-600">
                      {row.enquired}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
