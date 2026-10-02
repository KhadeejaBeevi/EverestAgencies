// src/components/ExportToExcel.jsx
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { auth } from "../../components/firebase"; // adjust path if needed
import { useEffect, useState } from "react";

export default function ExportToExcel({ data, notesData }) {
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  // ✅ Track current logged-in user
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) setCurrentUserEmail(user.email);
    });
    return () => unsubscribe();
  }, []);

  // ✅ Check if a party has "Do Not Call" status
  const hasDoNotCallStatus = (partyName) => {
    return notesData?.some(
      (note) =>
        note.partyLedger === partyName &&
        note.followUpStatus &&
        note.followUpStatus.toLowerCase() === "do not call"
    );
  };

  // ✅ Filter out parties with "Do Not Call" status
  const filteredData = data.filter(
    (row) => !hasDoNotCallStatus(row.PartyLedgerName)
  );

  // ✅ Prepare export format
  const exportData = filteredData.map((row, idx) => ({
    "S.No.": idx + 1,
    PartyLedgerName: row.PartyLedgerName,
    Group: row._LedGroup,
    "GST Type": row._GSTRegistrationType,
    GSTIN: row._PartyGSTIN,
    "Phone Number": row.mobile || "",
    "Email ID": row.email || "",
  }));

  // ✅ Export as Excel
  const exportAsExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Filtered Data");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const blob = new Blob([excelBuffer], {
      type: "application/octet-stream",
    });
    saveAs(blob, "FilteredPartyExport.xlsx");
  };

  // ✅ Export as CSV
  const exportAsCSV = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "FilteredPartyExport.csv");
  };

  // ✅ Restrict access: only "admin@gmail.com" can download
  const isRestrictedUser = currentUserEmail !== "everestagencies1991@gmail.com";

  return (
    <div className="flex gap-2 mb-2">
      <button
        onClick={exportAsExcel}
        disabled={isRestrictedUser}
        className={`px-3 py-1.5 text-xs font-semibold rounded border ${
          isRestrictedUser
            ? "bg-gray-300 border-gray-400 text-gray-600 cursor-not-allowed"
            : "border-green-700 text-green-700 bg-white hover:bg-green-100"
        }`}
      >
        ⬇ Excel
      </button>
      <button
        onClick={exportAsCSV}
        disabled={isRestrictedUser}
        className={`px-3 py-1.5 text-xs font-semibold rounded border ${
          isRestrictedUser
            ? "bg-gray-300 border-gray-400 text-gray-600 cursor-not-allowed"
            : "border-blue-700 text-blue-700 bg-white hover:bg-blue-100"
        }`}
      >
        ⬇ CSV
      </button>
    </div>
  );
}
