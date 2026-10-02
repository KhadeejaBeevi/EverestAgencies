import React, { useState } from "react";
import EditPartyModal from "./EditNewPartyModal";
import NewNotesPanel from "./NewNotesPanel";

export default function PartyDetailsPopup({ partyDetails, onClose, onShowNotes, refreshPartyList, onEditSave, onNoteSaved }) {
  const [editingParty, setEditingParty] = useState(null);
  const [showNotesPopup, setShowNotesPopup] = useState(false);

  if (!partyDetails) return null;

  const handleEditClick = () => {
    setEditingParty(partyDetails);
  };

  const handleModalClose = () => {
    setEditingParty(null);
  };

  const handleModalSave = (updatedParty) => {
    setEditingParty(null);

    if (onEditSave) {
      onEditSave(updatedParty); // ✅ Notify parent to mark it green & update state
    }

    refreshPartyList(); // Refresh latest data
    onClose(); // Close popup
  };


  const handleShowNotes = () => {
    setShowNotesPopup(true);
  };
  

  return (
    <div className="fixed top-20 right-4 w-80 p-4 bg-white shadow-lg border border-gray-300 rounded-lg z-50 max-h-[85vh] overflow-y-auto">
      <h3 className="text-lg font-bold mb-3 text-blue-800">
        {partyDetails.party_ledger_name}
      </h3>

      <div className="space-y-2 text-sm">
        <p><strong>Mobile:</strong> {partyDetails.mobile}</p>
        <p><strong>Address:</strong> {partyDetails.address}</p>
        <p><strong>Email:</strong> {partyDetails.email}</p>
        <p><strong>Designation:</strong> {partyDetails.designation}</p>
        <p><strong>Designator Name:</strong> {partyDetails.designator_name}</p>
        <p><strong>Ledger Phone:</strong> {partyDetails.ledger_phone}</p>

        <p><strong>Owner Name:</strong> {partyDetails.owner_name}</p>
        <p><strong>Owner Phone:</strong> {partyDetails.owner_phone}</p>
        <p><strong>Payment Contact Person:</strong> {partyDetails.payment_contact_person}</p>
        <p><strong>Payment Contact Phone:</strong> {partyDetails.payment_contact_phone}</p>
        <p><strong>Purchase Contact Person:</strong> {partyDetails.purchase_contact_person}</p>
        <p><strong>Purchase Contact Phone:</strong> {partyDetails.purchase_contact_phone}</p>

        {/* ✅ New Fields */}
        <p><strong>Field Executive:</strong> {partyDetails.field_executive}</p>
        <p><strong>Requirement Type:</strong> {partyDetails.requirement_type}</p>
        <p><strong>Decision Maker:</strong> {partyDetails.decision_maker}</p>
        <p><strong>Source:</strong> {partyDetails.referred_by}</p>
      </div>
      
      <div className="flex flex-wrap gap-2 mt-4">

        <button className="bg-red-500 text-white px-3 py-1 rounded" onClick={onClose}>
          Close
        </button>
        <button
          className="bg-blue-600 text-white px-3 py-1 rounded"
          onClick={handleShowNotes}
        >
          Open Notes
        </button>
        <button
          className="bg-yellow-500 text-white px-3 py-1 rounded"
          onClick={handleEditClick}
        >
          Edit
        </button>
      </div>

      {/* Show modal if editing */}
      {editingParty && (
        <EditPartyModal
          party={editingParty}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}

      <NewNotesPanel
        partyId={partyDetails.id}
        partyLedger={partyDetails.party_ledger_name}
        showPopup={showNotesPopup}
        setShowPopup={setShowNotesPopup}
        onNoteSaved={onNoteSaved}
      />
    </div>
  );
}
