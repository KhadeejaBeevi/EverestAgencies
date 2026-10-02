import React from "react";
import EditPartyModal from "./EditPartyPopup";
import { apiFetch } from "../../api/apiClient";

export default function PartyDetailsPanel({
  partyDetails,
  setPartyDetails,
  highlightedFieldsPerParty,
  isEditModalOpen,
  setIsEditModalOpen,
  setHighlightedFieldsPerParty,
  setShowNotes,
  setTableData,
}) {
  if (!partyDetails) return null;

  return (
    <div className="fixed top-4 right-4 w-80 p-4 bg-white shadow-lg border border-gray-300 rounded-lg z-70">
      <h3 className="text-lg font-bold mb-2">{partyDetails.PartyLedgerName}</h3>

      {/* Ledger Group */}
      <p>
        <strong>Ledger Group:</strong>{" "}
        <span
          className={
            highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Group")
              ? "text-red-600 font-bold"
              : ""
          }
        >
          {partyDetails["Ledger.$_LedGroup"]}
        </span>
      </p>

      {/* Mobile */}
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

      {/* Address */}
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

      {/* Email */}
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

      {/* Ledger Phone */}
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

      {/* Owner Name */}
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

      {/* Owner Phone */}
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

      {/* Payment Contact Person */}
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

      {/* Payment Contact Phone */}
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

      {/* Purchase Contact Person */}
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

      {/* Purchase Contact Phone */}
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

      <div className="flex justify-between mt-3">
        <button
          onClick={() => setPartyDetails(null)}
          className="px-3 py-1 bg-red-500 text-white rounded"
        >
          Close
        </button>
        <button
          onClick={() => setShowNotes(true)}
          className="px-3 py-1 bg-blue-600 text-white rounded"
        >
          Open Notes
        </button>
        <button
          onClick={() => setIsEditModalOpen(true)}
          className="px-3 py-1 bg-yellow-500 text-white rounded"
        >
          Edit
        </button>
      </div>

      {isEditModalOpen && partyDetails && (
        <EditPartyModal
          partyDetails={partyDetails}
          onClose={() => setIsEditModalOpen(false)}
          onSave={(updated) => {
            const changed = [];

            // Compare fields
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

            // Compare and push label names if values differ
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

            // Handle new fields using the label map
            for (const [key, label] of Object.entries(fieldLabelMap)) {
              if ((updated[key] || "") !== (partyDetails[key] || "")) {
                if (!changed.includes(label)) {
                  changed.push(label);
                }
              }
            }

            console.log("✅ Changed fields:", changed);

            // Update local state immediately
            setPartyDetails(updated);

            // Update the row in the table
            setTableData((prevData) =>
              prevData.map((row) =>
                row.PartyLedgerName === updated.PartyLedgerName
                  ? { ...row, _LedGroup: updated["Ledger.$_LedGroup"] }
                  : row
              )
            );

            // Update highlighted fields properly and persist them
            setHighlightedFieldsPerParty(prev => {
              const existingFields = prev[updated.PartyLedgerName] || [];
              const allHighlightedFields = [...new Set([...existingFields, ...changed])];

              const newHighlights = {
                ...prev,
                [updated.PartyLedgerName]: allHighlightedFields,
              };

              // SAVE TO DATABASE: Send updated highlights to backend
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

            setIsEditModalOpen(false);
            console.log("✅ UI updated successfully");
          }}
        />
      )}
    </div>
  );
}