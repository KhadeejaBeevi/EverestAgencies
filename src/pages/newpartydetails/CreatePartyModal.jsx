import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/apiClient";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function CreatePartyModal({ onClose, onPartyCreated }) {
  const [formData, setFormData] = useState({
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
    added_by: "",
  });

  const [loading, setLoading] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState("");

  // Duplicate information is kept per field so the user can see
  // exactly which value is already present in the database.
  const [duplicateFields, setDuplicateFields] = useState({});
  const [checkingField, setCheckingField] = useState("");
  const [existingParties, setExistingParties] = useState([]);

  const duplicateTimerRef = useRef(null);

  // Get the logged-in Firebase user's name. Prefer displayName, then the
  // firstName stored in Firestore, and finally email as a fallback.
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoggedInUser("");
        return;
      }

      let name = user.displayName || "";

      if (!name) {
        try {
          const userSnap = await getDoc(doc(db, "Users", user.uid));
          if (userSnap.exists()) {
            const userData = userSnap.data();
            name =
              userData.firstName ||
              userData.name ||
              userData.displayName ||
              "";
          }
        } catch (error) {
          console.error("Error fetching Firebase user name:", error);
        }
      }

      name = name || user.email || "User";
      setLoggedInUser(name);
      setFormData((prev) => ({ ...prev, added_by: name }));
    });

    return unsubscribe;
  }, []);

  const groupList = [
    "ARCHITECT AND INTERIAL DESIGNERS",
    "BUILDERS",
    "CONTRACTORS",
    "ELECTRICIANS",
    "KSEB",
    "LOCAL ELECTRICAL SHOP",
    "MEDICAL COLLAGES HOSPITALS AND INDUSTRIES",
    "PERSONAL",
    "SOLAR",
    "SUPPLIER",
    "EXPO"
  ];

  // These are ALL phone/number fields in this form.
  // A number is considered duplicate even if it exists under a
  // different column in another company (for example, a new mobile
  // matching an old purchase-contact phone).
  const NUMBER_FIELDS = [
    "mobile",
    "ledger_phone",
    "owner_phone",
    "payment_contact_phone",
    "purchase_contact_phone",
  ];

  const normalizeName = (value) =>
    String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

  const normalizeNumber = (value) =>
    String(value || "").replace(/\D/g, "");

  const getPartyName = (party) =>
    party?.party_ledger_name ??
    party?.PartyLedgerName ??
    party?.partyLedgerName ??
    "";

  const getNumberValues = (party) =>
    NUMBER_FIELDS.map((field) => ({
      field,
      value: normalizeNumber(party?.[field]),
    })).filter((item) => item.value);

  // Load the existing party list ONCE when the modal opens.
  // We do not make a request for every keystroke.
  useEffect(() => {
    let cancelled = false;

    const loadExistingParties = async () => {
      try {
        const res = await apiFetch("/serverphp/fetch_newparty.php");
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();

        if (!cancelled) {
          setExistingParties(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Error loading existing parties for duplicate check:", error);
        if (!cancelled) setExistingParties([]);
      } finally {
      }
    };

    loadExistingParties();

    return () => {
      cancelled = true;
      if (duplicateTimerRef.current) {
        clearTimeout(duplicateTimerRef.current);
      }
    };
  }, []);

  const findDuplicateForField = (field, value) => {
    if (!value) return null;

    if (field === "party_ledger_name") {
      const normalized = normalizeName(value);

      if (!normalized) return null;

      return (
        existingParties.find(
          (party) => normalizeName(getPartyName(party)) === normalized
        ) || null
      );
    }

    if (NUMBER_FIELDS.includes(field)) {
      const normalized = normalizeNumber(value);

      // Do not check an incomplete phone number.
      // This prevents a warning while the user is still entering it.
      if (normalized.length < 7) return null;

      for (const party of existingParties) {
        const numberMatch = getNumberValues(party).find(
          (item) => item.value === normalized
        );

        if (numberMatch) {
          return {
            party,
            matchedField: numberMatch.field,
          };
        }
      }
    }

    return null;
  };

  const checkFieldForDuplicate = (field, value) => {
    const duplicate = findDuplicateForField(field, value);

    setDuplicateFields((prev) => {
      const next = { ...prev };

      if (duplicate) {
        next[field] = duplicate;
      } else {
        delete next[field];
      }

      return next;
    });

    return duplicate;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({ ...prev, [name]: value }));

    // Remove the old warning immediately when the user changes the value.
    setDuplicateFields((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });

    // Check while typing, with a short debounce.
    // This means the warning appears before the user reaches Save.
    if (name === "party_ledger_name" || NUMBER_FIELDS.includes(name)) {
      if (duplicateTimerRef.current) {
        clearTimeout(duplicateTimerRef.current);
      }

      setCheckingField(name);

      duplicateTimerRef.current = setTimeout(() => {
        checkFieldForDuplicate(name, value);
        setCheckingField("");
      }, 350);
    }
  };

  // Also check when leaving a field, so moving to the next field
  // immediately gives the duplicate result.
  const handleFieldBlur = (field) => {
    if (duplicateTimerRef.current) {
      clearTimeout(duplicateTimerRef.current);
    }

    const value = formData[field];

    if (field !== "party_ledger_name" && !NUMBER_FIELDS.includes(field)) {
      return;
    }

    setCheckingField(field);
    checkFieldForDuplicate(field, value);
    setCheckingField("");
  };

  const hasDuplicates = Object.keys(duplicateFields).length > 0;

  const handleSave = async () => {
    if (!formData.party_ledger_name.trim()) {
      alert("Company Name is required!");
      return;
    }

    // Re-check all relevant fields immediately before saving.
    // This protects against another user adding a duplicate after
    // the initial list was loaded.
    setLoading(true);

    try {
      const fieldsToCheck = ["party_ledger_name", ...NUMBER_FIELDS];
      const freshRes = await apiFetch("/serverphp/fetch_newparty.php");

      if (!freshRes.ok) {
        throw new Error(`HTTP error! status: ${freshRes.status}`);
      }

      const freshData = await freshRes.json();
      const parties = Array.isArray(freshData) ? freshData : [];

      const duplicates = {};

      for (const field of fieldsToCheck) {
        const duplicate = (() => {
          const value = formData[field];

          if (field === "party_ledger_name") {
            const normalized = normalizeName(value);
            if (!normalized) return null;

            return (
              parties.find(
                (party) => normalizeName(getPartyName(party)) === normalized
              ) || null
            );
          }

          const normalized = normalizeNumber(value);
          if (normalized.length < 7) return null;

          for (const party of parties) {
            const match = getNumberValues(party).find(
              (item) => item.value === normalized
            );

            if (match) {
              return {
                party,
                matchedField: match.field,
              };
            }
          }

          return null;
        })();

        if (duplicate) {
          duplicates[field] = duplicate;
        }
      }

      if (Object.keys(duplicates).length > 0) {
        setDuplicateFields(duplicates);
        setExistingParties(parties);
        return;
      }

      const res = await apiFetch("/serverphp/save_newparty.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onPartyCreated();
        onClose();
      } else {
        const text = await res.text();
        alert("Save failed: " + text);
      }
    } catch (error) {
      console.error("Error during save process:", error);
      alert("An error occurred while checking/saving. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white w-full sm:w-[95%] sm:max-w-4xl sm:rounded-lg rounded-t-2xl shadow-lg overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b px-4 sm:px-6 py-4 shadow-sm z-10">
          <h2 className="text-lg sm:text-xl font-bold">Create New Party</h2>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="space-y-6">
            {/* Section 1: Basic Information */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
                Basic Information
              </h3>
              <div className="space-y-4">
                {/* Company Name */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    name="party_ledger_name"
                    value={formData.party_ledger_name}
                    onChange={handleChange}
                    onBlur={() => handleFieldBlur("party_ledger_name")}
                    className={`w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base ${duplicateFields.party_ledger_name ? "border-red-500 bg-red-50" : ""
                      }`}
                    placeholder="Enter company name"
                  />
                  {duplicateFields.party_ledger_name && (
                    <p className="text-red-600 text-sm mt-1 font-medium">
                      ⚠️ This company name already exists:{" "}
                      {getPartyName(duplicateFields.party_ledger_name)}
                    </p>
                  )}
                  {checkingField === "party_ledger_name" && (
                    <p className="text-gray-500 text-xs mt-1">Checking...</p>
                  )}
                </div>

                {/* Group Name */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Group Name</label>
                  <select
                    name="group_name"
                    value={formData.group_name}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  >
                    <option value="">Select Group</option>
                    {groupList.map((group, idx) => (
                      <option key={idx} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Added By - automatically taken from the logged-in Firebase user */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Added By</label>
                  <input
                    type="text"
                    name="added_by"
                    value={loggedInUser || formData.added_by || ""}
                    readOnly
                    className="w-full border p-3 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                  />
                </div>

                {/* Field Executive */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Field Executive
                  </label>
                  <select
                    name="field_executive"
                    value={formData.field_executive}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  >
                    <option value="">Select Executive</option>
                    <option value="SHINOY">SHINOY</option>
                    <option value="SANOOP">SANOOP</option>
                    <option value="SAYAL">SAYAL</option>
                    <option value="ASHWIN">ASHWIN</option>
                  </select>
                </div>

                {/* Requirement Type */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Types of Requirement
                  </label>
                  <select
                    name="requirement_type"
                    value={formData.requirement_type}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  >
                    <option value="">Select Requirement</option>
                    <option value="ELECTRICAL">ELECTRICAL</option>
                    <option value="SOLAR">SOLAR</option>
                  </select>
                </div>
                {/* Source */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Source
                  </label>

                  <select
                    name="referred_by"
                    value={formData.referred_by}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  >
                    <option value="">Select Source</option>
                    <option value="Walk In">Walk In</option>
                    <option value="Exhibition">Exhibition</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Google">Google</option>
                    <option value="Referral">Referral</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 2: GST & Contact Details */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
                GST & Contact Details
              </h3>
              <div className="space-y-4">
                {/* GST Registration Type */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    GST Registration Type
                  </label>
                  <select
                    name="gst_registration_type"
                    value={formData.gst_registration_type}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  >
                    <option value="">Select Type</option>
                    <option value="Regular">Regular</option>
                    <option value="Consumer">Consumer</option>
                    <option value="Unregistered">Unregistered</option>
                  </select>
                </div>

                {/* GSTIN Number */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">GSTIN Number</label>
                  <input
                    type="text"
                    name="gstin"
                    value={formData.gstin}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter GSTIN"
                  />
                </div>

                {/* Mobile */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    name="mobile"
                    value={formData.mobile}
                    onChange={handleChange}
                    onBlur={() => handleFieldBlur("mobile")}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter mobile number"
                  />
                  {duplicateFields.mobile && (
                    <p className="text-red-600 text-sm mt-1 font-medium">
                      ⚠️ This number already exists in {""}
                      {getPartyName(duplicateFields.mobile.party)}
                    </p>
                  )}
                  {checkingField === "mobile" && (
                    <p className="text-gray-500 text-xs mt-1">Checking...</p>
                  )}
                </div>

                {/* Ledger Phone */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Ledger Phone</label>
                  <input
                    type="tel"
                    name="ledger_phone"
                    value={formData.ledger_phone}
                    onChange={handleChange}
                    onBlur={() => handleFieldBlur("ledger_phone")}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter ledger phone"
                  />
                  {duplicateFields.ledger_phone && (
                    <p className="text-red-600 text-sm mt-1 font-medium">
                      ⚠️ This number already exists in {""}
                      {getPartyName(duplicateFields.ledger_phone.party)}
                    </p>
                  )}
                  {checkingField === "ledger_phone" && (
                    <p className="text-gray-500 text-xs mt-1">Checking...</p>
                  )}
                </div>

                {/* Decision Maker */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Decision Maker</label>
                  <select
                    name="decision_maker"
                    value={formData.decision_maker}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  >
                    <option value="">Select Decision Maker</option>
                    <option value="PURCHASE MANAGER">PURCHASE MANAGER</option>
                    <option value="CONTRACTOR">CONTRACTOR</option>
                    <option value="OWNER">OWNER</option>
                    <option value="ELECTRICIAN">ELECTRICIAN</option>
                  </select>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter email address"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows="3"
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base resize-none"
                    placeholder="Enter full address"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Owner Details */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
                Owner Details
              </h3>
              <div className="space-y-4">
                {/* Owner Name */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Owner Name</label>
                  <input
                    type="text"
                    name="owner_name"
                    value={formData.owner_name}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter owner name"
                  />
                </div>

                {/* Owner Phone */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Owner Phone</label>
                  <input
                    type="tel"
                    name="owner_phone"
                    value={formData.owner_phone}
                    onChange={handleChange}
                    onBlur={() => handleFieldBlur("owner_phone")}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter owner phone"
                  />
                  {duplicateFields.owner_phone && (
                    <p className="text-red-600 text-sm mt-1 font-medium">
                      ⚠️ This number already exists in {""}
                      {getPartyName(duplicateFields.owner_phone.party)}
                    </p>
                  )}
                  {checkingField === "owner_phone" && (
                    <p className="text-gray-500 text-xs mt-1">Checking...</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 4: Payment Contact */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
                Payment Contact
              </h3>
              <div className="space-y-4">
                {/* Payment Contact Person */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Payment Contact Person
                  </label>
                  <input
                    type="text"
                    name="payment_contact_person"
                    value={formData.payment_contact_person}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter payment contact name"
                  />
                </div>

                {/* Payment Contact Phone */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Payment Contact Phone
                  </label>
                  <input
                    type="tel"
                    name="payment_contact_phone"
                    value={formData.payment_contact_phone}
                    onChange={handleChange}
                    onBlur={() => handleFieldBlur("payment_contact_phone")}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter payment contact phone"
                  />
                  {duplicateFields.payment_contact_phone && (
                    <p className="text-red-600 text-sm mt-1 font-medium">
                      ⚠️ This number already exists in {""}
                      {getPartyName(duplicateFields.payment_contact_phone.party)}
                    </p>
                  )}
                  {checkingField === "payment_contact_phone" && (
                    <p className="text-gray-500 text-xs mt-1">Checking...</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 5: Purchase Contact */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
                Purchase Contact
              </h3>
              <div className="space-y-4">
                {/* Purchase Contact Person */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Purchase Contact Person
                  </label>
                  <input
                    type="text"
                    name="purchase_contact_person"
                    value={formData.purchase_contact_person}
                    onChange={handleChange}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter purchase contact name"
                  />
                </div>

                {/* Purchase Contact Phone */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Purchase Contact Phone
                  </label>
                  <input
                    type="tel"
                    name="purchase_contact_phone"
                    value={formData.purchase_contact_phone}
                    onChange={handleChange}
                    onBlur={() => handleFieldBlur("purchase_contact_phone")}
                    className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    placeholder="Enter purchase contact phone"
                  />
                  {duplicateFields.purchase_contact_phone && (
                    <p className="text-red-600 text-sm mt-1 font-medium">
                      ⚠️ This number already exists in {""}
                      {getPartyName(duplicateFields.purchase_contact_phone.party)}
                    </p>
                  )}
                  {checkingField === "purchase_contact_phone" && (
                    <p className="text-gray-500 text-xs mt-1">Checking...</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer with Action Buttons */}
        {hasDuplicates && (
          <div className="mx-4 sm:mx-6 mb-0 p-3 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm font-medium">
            ⚠️ Duplicate data found. Change the highlighted field(s) before saving.
          </div>
        )}

        <div className="sticky bottom-0 bg-white border-t px-4 sm:px-6 py-4 shadow-lg">
          <div className="flex gap-3">
            <button
              className="flex-1 bg-gray-500 active:bg-gray-600 text-white px-4 py-3 rounded-lg transition-colors font-medium text-base disabled:opacity-50"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSave}
              disabled={loading || hasDuplicates}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Checking...
                </span>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}