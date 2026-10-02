import React, { useState, useEffect } from "react";
import { apiFetch } from "../../api/apiClient";

export default function EditPartyModal({ partyDetails, onClose, onSave }) {
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [ledgerPhone, setLedgerPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [paymentContactPerson, setPaymentContactPerson] = useState("");
  const [paymentContactPhone, setPaymentContactPhone] = useState("");
  const [purchaseContactPerson, setPurchaseContactPerson] = useState("");
  const [purchaseContactPhone, setPurchaseContactPhone] = useState("");
  const [ledgerGroup, setLedgerGroup] = useState("");
  const [fullyUpdated, setFullyUpdated] = useState(false);
  const [addressLines, setAddressLines] = useState(["", "", "", "", ""]);
  const [designation, setDesignation] = useState("");
  const [designatorName, setDesignatorName] = useState("");
  const [groupList, setGroupList] = useState([]);


  useEffect(() => {
    apiFetch("/serverphp/get_groupsforedit.php")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.groups)) {
          setGroupList(data.groups.filter((g) => g.trim() !== ""));
        } else {
          console.error("Unexpected group response format:", data);
        }
      })
      .catch((err) => {
        console.error("Error fetching groups:", err);
      });
  }, []); 


useEffect(() => {
  if (partyDetails) {
    setMobile(partyDetails["Ledger.$LedgerMobile"] || "");
    setEmail(partyDetails["Ledger.$EMail"] || "");
    setLedgerPhone(partyDetails["Ledger.$_LedgerPhone"] || "");
    setOwnerName(partyDetails["Ledger.$_Led_OwnerName_Form"] || "");
    setOwnerPhone(partyDetails["Ledger.$_Led_OwnerPhone_Form"] || "");
    setPaymentContactPerson(partyDetails["Ledger.$_Led_Payment_Contact_P_Form"] || "");
    setPaymentContactPhone(partyDetails["Ledger.$_Led_Payment_Contact_PHone_Form"] || "");
    setPurchaseContactPerson(partyDetails["Ledger.$_Led_Purchase_Contact_P_Form"] || "");
    setPurchaseContactPhone(partyDetails["Ledger.$_Led_Purchase_Contact_PHone_Form"] || "");
    setLedgerGroup(partyDetails["Ledger.$_LedGroup"] || "");
    setDesignation(partyDetails["Ledger.$_Designation"] || "");
    setDesignatorName(partyDetails["Ledger.$_DesignatorName"] || "");

   
    if (partyDetails.fullyUpdated === true || partyDetails.fullyUpdated === "true" || partyDetails.fullyUpdated === 1 || partyDetails.fullyUpdated === "1") {
      setFullyUpdated(true);
    } else {
      setFullyUpdated(false);
    }

    const newAddress = [];
    for (let i = 1; i <= 5; i++) {
      newAddress.push(partyDetails[`Ledger.$_Address${i}`] || "");
    }
    setAddressLines(newAddress);
  }
}, [partyDetails]);


  
  const handleNumberInput = (e, setter) => {
    const value = e.target.value.replace(/\D/g, "");
    setter(value);
  };

  const handleTextInput = (e, setter) => {
    const value = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setter(value);
  };


  const handleSave = async () => {
    const updatedParty = {
      PartyLedgerName: partyDetails.PartyLedgerName,
      fullyUpdated,
      designation,
      designator_name: designatorName,
      "Ledger.$LedgerMobile": mobile,
      "Ledger.$EMail": email,
      "Ledger.$_LedgerPhone": ledgerPhone,
      "Ledger.$_Led_OwnerName_Form": ownerName,
      "Ledger.$_Led_OwnerPhone_Form": ownerPhone,
      "Ledger.$_Led_Payment_Contact_P_Form": paymentContactPerson,
      "Ledger.$_Led_Payment_Contact_PHone_Form": paymentContactPhone,
      "Ledger.$_Led_Purchase_Contact_P_Form": purchaseContactPerson,
      "Ledger.$_Led_Purchase_Contact_PHone_Form": purchaseContactPhone,
      "Ledger.$_LedGroup": ledgerGroup,
    };

    addressLines.forEach((line, idx) => {
      updatedParty[`Ledger.$_Address${idx + 1}`] = line;
    });

    try {
      const res = await apiFetch(
        "/serverphp/update_party.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedParty),
        }
      );

      const text = await res.text();
      console.log("Raw response:", text);

      try {
        const result = JSON.parse(text);
        if (result.success) {
          onSave(updatedParty);
          onClose();
          if (window.refreshMainTable) window.refreshMainTable();
        } else {
          alert("Update failed: " + (result.error || "Unknown error"));
        }
      } catch (parseErr) {
        console.error("JSON parse error:", parseErr);
        alert("Error parsing server response: " + parseErr.message);
      }
    } catch (err) {
      console.error("Network error:", err);
      alert("Network error: " + err.message);
    }
  };


 
  const isChanged = () => false;


  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[95%] max-w-xl max-h-[90vh] flex flex-col shadow-xl">
        
        <div className="px-6 py-4 border-b bg-gray-50">
          <h2 className="text-xl font-semibold text-gray-800">
            Edit {partyDetails?.PartyLedgerName}
          </h2>
        </div>

       
        <div className="flex-1 overflow-y-auto px-6 py-4">

          <select
            value={ledgerGroup}
            onChange={(e) => setLedgerGroup(e.target.value)}
            className="w-full p-2 border rounded mb-4"
          >
            <option value="">Select Group</option>
            {groupList.map((group, idx) => (
              <option key={idx} value={group}>
                {group}
              </option>
            ))}
          </select>

         
          {addressLines.map((line, index) => (
            <div key={index} className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address Line {index + 1}
              </label>
              <input
                value={line}
                onChange={(e) => {
                  const newLines = [...addressLines];
                  newLines[index] = e.target.value;
                  setAddressLines(newLines);
                }}
                className="w-full p-2 border rounded"
                placeholder={`Address Line ${index + 1}`}
              />
            </div>
          ))}

          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Designation
            </label>
            <input
              value={designation}
              onChange={(e) => handleTextInput(e, setDesignation)}
              placeholder="Designation"
              className="w-full p-2 border rounded"
            />
          </div>

          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Designator Name
            </label>
            <input
              value={designatorName}
              onChange={(e) => handleTextInput(e, setDesignatorName)}
              placeholder="Designator Name"
              className="w-full p-2 border rounded"
            />
          </div>

          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
            <input
              type="text"
              value={mobile}
              onChange={(e) => handleNumberInput(e, setMobile)}
              placeholder="Mobile"
              className="w-full p-2 border rounded"
            />
          </div>

         
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full p-2 border rounded"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ledger Phone</label>
            <input
              value={ledgerPhone}
              onChange={(e) => handleNumberInput(e,setLedgerPhone)}
              placeholder="Ledger Phone"
              className="w-full p-2 border rounded"
            />
          </div>

         
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
            <input
              value={ownerName}
              onChange={(e) => handleTextInput(e, setOwnerName)}
              placeholder="Owner Name"
              className="w-full p-2 border rounded"
            />
          </div>

        
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner Phone</label>
            <input
              value={ownerPhone}
              onChange={(e) => handleNumberInput(e, setOwnerPhone)}
              placeholder="Owner Phone"
              className="w-full p-2 border rounded"
            />
          </div>

          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Contact Person
            </label>
            <input
              value={paymentContactPerson}
              onChange={(e) => handleTextInput(e, setPaymentContactPerson)}
              placeholder="Payment Contact Person"
              className="w-full p-2 border rounded"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Contact Phone
            </label>
            <input
              value={paymentContactPhone}
              onChange={(e) => handleNumberInput(e, setPaymentContactPhone)}
              placeholder="Payment Contact Phone"
              className="w-full p-2 border rounded"
            />
          </div>

         
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purchase Contact Person
            </label>
            <input
              value={purchaseContactPerson}
              onChange={(e) => handleTextInput(e, setPurchaseContactPerson)}
              placeholder="Purchase Contact Person"
              className="w-full p-2 border rounded"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purchase Contact Phone
            </label>
            <input
              value={purchaseContactPhone}
              onChange={(e) => handleNumberInput(e, setPurchaseContactPhone)}
              placeholder="Purchase Contact Phone"
              className="w-full p-2 border rounded"
            />
          </div>

          <div className="mb-4">
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={fullyUpdated}
                onChange={(e) => setFullyUpdated(e.target.checked)}
                className="mr-2 w-4 h-4 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700">
                Mark as Fully Updated
              </span>
            </label>
          </div>
        </div>

       
        <div className="border-t bg-white px-6 py-4 flex justify-end gap-3 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-500 text-white rounded-md font-medium hover:bg-gray-600 transition-colors duration-200 shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors duration-200 shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
 