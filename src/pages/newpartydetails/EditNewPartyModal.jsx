import React, { useState, useEffect } from "react";
import { apiFetch } from "../../api/apiClient";

export default function EditPartyModal({ party, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: null,
    party_ledger_name: "",
    group_name: "",
    gst_registration_type: "",
    gstin: "",
    mobile: "",
    address: "",
    email: "",
    ledger_phone: "",
    owner_name: "",
    owner_phone: "",
    payment_contact_person: "",
    payment_contact_phone: "",
    purchase_contact_person: "",
    purchase_contact_phone: "",
    field_executive: "",
    requirement_type: "",
    decision_maker: "",
    referred_by: "",
    designation: "",
    designator_name: "",
  });

  const [groupList, setGroupList] = useState([]);

  useEffect(() => {
    if (party) setFormData({ ...party });

    apiFetch("/serverphp/get_groupsforedit.php")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.groups)) {
          setGroupList(data.groups.filter((g) => g.trim() !== ""));
        }
      })
      .catch((err) => console.error("Error fetching groups:", err));
  }, [party]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      const res = await apiFetch(
        "/serverphp/update_newparty.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      const data = await res.json();
      if (data.success) {
        onSave(formData);
        onClose();
      } else {
        alert("Update failed: " + (data.message || "No message from server"));
      }
    } catch (err) {
      alert("Update failed: " + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50">

      <div className="bg-white rounded-lg w-full max-w-[600px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold text-blue-700">Edit Party Details</h2>
        </div>

        {/* Scrollable Form */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Company Name */}
          <div>
            <label
              htmlFor="party_ledger_name"
              className="block font-medium text-sm text-gray-700 mb-1"
            >
              Company Name
            </label>
            <input
              id="party_ledger_name"
              name="party_ledger_name"
              value={formData.party_ledger_name || ""}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="Enter Company Name"
            />
          </div>

          {/* Group Name */}
          <div>
            <label
              htmlFor="group_name"
              className="block font-medium text-sm text-gray-700 mb-1"
            >
              Group Name
            </label>
            <select
              id="group_name"
              name="group_name"
              value={formData.group_name || ""}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value="">Select Group</option>
              {groupList.map((group, idx) => (
                <option key={idx} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>

          {/* Added By - preserved from the original creator */}
          <div>
            <label
              htmlFor="added_by"
              className="block font-medium text-sm text-gray-700 mb-1"
            >
              Added By
            </label>
            <input
              id="added_by"
              name="added_by"
              value={formData.added_by || formData.addedBy || ""}
              readOnly
              className="w-full p-2 border border-gray-300 rounded bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          {/* Designation */}
          <div>
            <label
              htmlFor="designation"
              className="block font-medium text-sm text-gray-700 mb-1"
            >
              Designation
            </label>
            <input
              id="designation"
              name="designation"
              value={formData.designation || ""}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="Enter Designation"
            />
          </div>

          {/* Designator Name */}
          <div>
            <label
              htmlFor="designator_name"
              className="block font-medium text-sm text-gray-700 mb-1"
            >
              Designator Name
            </label>
            <input
              id="designator_name"
              name="designator_name"
              value={formData.designator_name || ""}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="Enter Designator Name"
            />
          </div>

          {/* Mobile */}
          <div>
            <label
              htmlFor="mobile"
              className="block font-medium text-sm text-gray-700 mb-1"
            >
              Mobile
            </label>
            <input
              id="mobile"
              name="mobile"
              value={formData.mobile || ""}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="Enter Mobile Number"
            />
          </div>

          {/* Rest of the fields */}
          {[
            ["gst_registration_type", "GST Registration Type"],
            ["gstin", "GSTIN"],
            ["address", "Address"],
            ["email", "Email"],
            ["ledger_phone", "Ledger Phone"],
            ["owner_name", "Owner Name"],
            ["owner_phone", "Owner Phone"],
            ["payment_contact_person", "Payment Contact Person"],
            ["payment_contact_phone", "Payment Contact Phone"],
            ["purchase_contact_person", "Purchase Contact Person"],
            ["purchase_contact_phone", "Purchase Contact Phone"],
            ["field_executive", "Field Executive"],
            ["requirement_type", "Types of Requirement"],
            ["decision_maker", "Decision Maker Name"],
            ["referred_by", "Referred By"],
          ].map(([key, label]) => (
            <div key={key}>
              <label
                htmlFor={key}
                className="block font-medium text-sm text-gray-700 mb-1"
              >
                {label}
              </label>
              <input
                id={key}
                name={key}
                value={formData[key] || ""}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t bg-white px-6 py-4 flex justify-end gap-3 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-500 text-white rounded-md font-medium hover:bg-gray-600 transition-colors duration-200 shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
