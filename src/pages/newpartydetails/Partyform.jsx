import React, { useEffect, useState, useCallback } from "react";
import CreatePartyModal from "./CreatePartyModal";
import PartyDetailsPopup from "./PartyDetailsPopup";
import EditPartyModal from "./EditNewPartyModal";
import NewNotesPanel from "./NewNotesPanel";
import NotesByDatePopup from "./NotesByDatePopup";
import DoNotCallPopup from "../CRM/DoNotCallPopup";
import EnquiryReport from "../CRM/EnquiryReport";
import CallLaterPopup from "../CRM/CallLaterPopup";
import SorryCallPopup from "../CRM/SorryCallPopup";
import HiddenPartyPopup from "./DoNotCallPopupNL";
import { apiFetch } from "../../api/apiClient";

export default function PartyTable() {
  const [partyList, setPartyList] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [editingParty, setEditingParty] = useState(null);
  const [notesParty, setNotesParty] = useState({
    id: null,
    partyLedger: "",
    readOnly: true
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("All");
  const [selectedGstType, setSelectedGstType] = useState("All");
  const [selectedAlphabet, setSelectedAlphabet] = useState("");
  const [showDoNotCall, setShowDoNotCall] = useState(false);
  const [showEnquiryReport, setShowEnquiryReport] = useState(false);
  const [showCallLater, setShowCallLater] = useState(false);
  const [showSorryCall, setShowSorryCall] = useState(false);
  const [partiesWithNotes, setPartiesWithNotes] = useState([]);
  const [highlightedFieldsPerParty, setHighlightedFieldsPerParty] =
    useState({});
  const [selectedExecutive, setSelectedExecutive] = useState("All");

  // Contact status
  const [contactStatus, setContactStatus] =
    useState("non_contacted");

  const [doNotCallList, setDoNotCallList] = useState([]);
  const [callLaterList, setCallLaterList] = useState([]);
  const [sorryCallList, setSorryCallList] = useState([]);
  const [partyRatings, setPartyRatings] = useState({});
  const [highlightedParties, setHighlightedParties] = useState({});
  const [showHiddenPartyPopup, setShowHiddenPartyPopup] =
    useState(false);

  const [greenParties, setGreenParties] = useState(() => {
    const saved = localStorage.getItem("greenParties");
    return saved ? JSON.parse(saved) : [];
  });

  // =========================================================
  // SAVE EDIT
  // =========================================================

  const handleSaveEdit = (updatedParty) => {
    setPartyList((prev) =>
      prev.map((p) =>
        p.id === updatedParty.id ? updatedParty : p
      )
    );

    setGreenParties((prev) => {
      const updated = [
        ...new Set([...prev, updatedParty.id])
      ];

      localStorage.setItem(
        "greenParties",
        JSON.stringify(updated)
      );

      return updated;
    });

    setEditingParty(null);
  };

  // =========================================================
  // RATING
  // =========================================================

  const handleRating = async (id, rating) => {
    const currentRating = partyRatings[id] || 0;

    const newRating =
      currentRating === rating ? 0 : rating;

    setPartyRatings((prev) => ({
      ...prev,
      [id]: newRating
    }));

    try {
      const res = await apiFetch(
        "/serverphp/save_rating.php",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id: id,
            rating: newRating
          })
        }
      );

      const data = await res.json();

      if (!data.success) {
        console.error(
          "Failed to save rating:",
          data.message
        );
      }
    } catch (err) {
      console.error(
        "Error saving rating:",
        err
      );
    }
  };

  // =========================================================
  // NOTE SAVED
  // =========================================================

  const handleNoteSaved = useCallback(
    (id, status) => {
      console.log(
        "🔄 handleNoteSaved CALLED!",
        id,
        status
      );

      if (status === "Hidden Party") {
        setPartyList((prev) =>
          prev.filter(
            (p) =>
              Number(p.id) !== Number(id)
          )
        );

        setGreenParties((prev) => {
          const updated = prev.filter(
            (partyId) =>
              Number(partyId) !== Number(id)
          );

          localStorage.setItem(
            "greenParties",
            JSON.stringify(updated)
          );

          return updated;
        });

        return;
      }

      // Adding any note makes this company Contacted.
      setPartyList((prev) =>
        prev.map((p) =>
          Number(p.id) === Number(id)
            ? {
                ...p,
                note_updated: 1
              }
            : p
        )
      );

      setGreenParties((prev) => {
        const updated = [
          ...new Set([...prev, id])
        ];

        localStorage.setItem(
          "greenParties",
          JSON.stringify(updated)
        );

        return updated;
      });
    },
    []
  );

  // =========================================================
  // PARTY HIDDEN
  // =========================================================

  const handlePartyHidden = async (id) => {
    const hiddenParty = partyList.find(
      (p) => p.id === id
    );

    if (hiddenParty) {
      setDoNotCallList((prev) => [
        ...prev,
        hiddenParty
      ]);

      setPartyList((prev) =>
        prev.filter((p) => p.id !== id)
      );

      setShowDoNotCall(true);
    }
  };

  // =========================================================
  // SAVE NOTE
  // =========================================================

  const handleSaveNote = (id, status) => {
    const party = partyList.find(
      (p) => p.id === id
    );

    if (!party) return;

    if (status === "Do Not Call") {
      setDoNotCallList((prev) => [
        ...prev,
        party
      ]);

      setPartyList((prev) =>
        prev.filter((p) => p.id !== id)
      );

      setShowDoNotCall(true);
    }

    else if (status === "Call Later") {
      setCallLaterList((prev) => [
        ...prev,
        party
      ]);

      setPartyList((prev) =>
        prev.filter((p) => p.id !== id)
      );

      setShowCallLater(true);
    }

    else if (status === "Sorry Call") {
      setSorryCallList((prev) => [
        ...prev,
        party
      ]);

      setPartyList((prev) =>
        prev.filter((p) => p.id !== id)
      );

      setShowSorryCall(true);
    }
  };

  // =========================================================
  // UNIQUE EXECUTIVES
  // =========================================================

  const uniqueExecutives = Array.from(
    new Set(
      partyList.map(
        (p) => p.field_executive
      )
    )
  ).filter(Boolean);

  // =========================================================
  // DELETE
  // =========================================================

  const handleDelete = async (id) => {
    if (
      window.confirm(
        "Are you sure you want to delete this party?"
      )
    ) {
      try {
        const res = await apiFetch(
          `/serverphp/delete_party.php?id=${id}`,
          {
            method: "DELETE"
          }
        );

        const data = await res.json();

        if (data.success) {
          alert("Deleted successfully!");

          fetchParties();
        } else {
          alert(
            "Delete failed: " +
              data.message
          );
        }
      } catch (err) {
        alert(
          "Error: " +
            err.message
        );
      }
    }
  };

  // =========================================================
  // HIDE PARTY
  // =========================================================

  const hideParty = async (id) => {
    try {
      const res = await apiFetch(
        "/serverphp/hide_partyNL.php",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            id: id
          })
        }
      );

      const data = await res.json();

      if (data.success) {
        setPartyList((prev) =>
          prev.filter(
            (p) => p.id !== id
          )
        );

        setGreenParties((prev) =>
          prev.filter(
            (partyId) =>
              partyId !== id
          )
        );
      } else {
        console.error(
          "Failed to hide:",
          data.message
        );
      }
    } catch (err) {
      console.error(
        "Error hiding party:",
        err
      );
    }
  };

  // =========================================================
  // LOCAL STORAGE
  // =========================================================

  useEffect(() => {
    const saved = JSON.parse(
      localStorage.getItem(
        "greenParties"
      ) || "[]"
    );

    setGreenParties(saved);
  }, []);

  useEffect(() => {
    const saved =
      localStorage.getItem(
        "highlightedParties"
      );

    if (saved) {
      setHighlightedParties(
        JSON.parse(saved)
      );
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "highlightedParties",
      JSON.stringify(
        highlightedParties
      )
    );
  }, [highlightedParties]);

  // =========================================================
  // FETCH PARTIES
  // =========================================================

  const fetchParties = async () => {
    const res = await apiFetch(
      "/serverphp/fetch_newparty.php"
    );

    const data = await res.json();

    setPartyList(data);

    const ratings = {};

    data.forEach((p) => {
      if (p.rating !== undefined) {
        ratings[p.id] = p.rating;
      }
    });

    setPartyRatings(ratings);
  };

  useEffect(() => {
    fetchParties();
  }, []);

  // =========================================================
  // PARTY CLICK
  // =========================================================

  const handlePartyClick = (party) => {
    setSelectedParty(party);
  };

  // =========================================================
  // PARTY DETAILS FROM NOTES
  // =========================================================

  const handlePartyDetailsFromNotes =
    async (id) => {
      const party = partyList.find(
        (p) => p.id === id
      );

      if (party) {
        setSelectedParty(party);
      } else {
        try {
          const res = await apiFetch(
            "/serverphp/fetch_newparty.php"
          );

          const allParties =
            await res.json();

          const foundParty =
            allParties.find(
              (p) => p.id === id
            );

          if (foundParty) {
            setSelectedParty(
              foundParty
            );
          } else {
            alert(
              "Party not found!"
            );
          }
        } catch (err) {
          console.error(
            "Error fetching party details:",
            err
          );

          alert(
            "Error loading party details"
          );
        }
      }
    };

  // =========================================================
  // UNIQUE GROUPS
  // =========================================================

  const uniqueGroups = Array.from(
    new Set(
      partyList
        .map(
          (p) =>
            p.group_name
              ?.trim()
              .toLowerCase()
        )
        .filter(Boolean)
    )
  ).map(
    (name) =>
      name.charAt(0).toUpperCase() +
      name.slice(1)
  );

  // =========================================================
  // UNIQUE GST TYPES
  // =========================================================

  const uniqueGstTypes =
    Array.from(
      new Set(
        partyList.map(
          (p) =>
            p.gst_registration_type
        )
      )
    ).filter(Boolean);

  // =========================================================
  // FILTER PARTIES
  // =========================================================

  const filteredParties =
    partyList.filter((row) => {
      const name =
        row.party_ledger_name
          ?.toLowerCase() || "";

      const searchMatch =
        name.includes(
          searchTerm.toLowerCase()
        );

      const groupMatch =
        selectedGroup === "All" ||
        (row.group_name &&
          row.group_name
            .trim()
            .toLowerCase() ===
            selectedGroup
              .trim()
              .toLowerCase());

      const gstMatch =
        selectedGstType === "All" ||
        (row.gst_registration_type &&
          row.gst_registration_type
            .trim()
            .toLowerCase() ===
            selectedGstType
              .trim()
              .toLowerCase());

      const executiveMatch =
        selectedExecutive === "All" ||
        (row.field_executive &&
          row.field_executive
            .trim()
            .toLowerCase() ===
            selectedExecutive
              .trim()
              .toLowerCase());

      const alphaMatch =
        selectedAlphabet === "" ||
        name.startsWith(
          selectedAlphabet.toLowerCase()
        );

      const isContacted =
        Number(row.note_updated) === 1;

      const contactMatch =
        contactStatus === "all" ||
        (contactStatus ===
          "contacted" &&
          isContacted) ||
        (contactStatus ===
          "non_contacted" &&
          !isContacted);

      return (
        searchMatch &&
        groupMatch &&
        gstMatch &&
        executiveMatch &&
        alphaMatch &&
        contactMatch
      );
    });

  // =========================================================
  // SORT NEWEST FIRST
  // =========================================================

  const sortedParties = [
    ...filteredParties
  ].sort((a, b) => {
    const idA = Number(a.id);
    const idB = Number(b.id);

    if (
      !Number.isNaN(idA) &&
      !Number.isNaN(idB)
    ) {
      return idB - idA;
    }

    if (!Number.isNaN(idA))
      return -1;

    if (!Number.isNaN(idB))
      return 1;

    return 0;
  });

  const finalParties =
    sortedParties;

  // =========================================================
  // OPEN LEAD CONTRIBUTION REPORT
  // =========================================================

  const openLeadContributionReport =
    () => {
      window.location.href =
        "/leadcontributionreport";
    };

  // =========================================================
  // RETURN
  // =========================================================

  return (
    <div className="p-2 sm:p-4">

      {/* =====================================================
          TOP BUTTONS
      ====================================================== */}

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-4">

        {/* NEW LEAD */}

        <button
          onClick={() =>
            setShowModal(true)
          }
          className="bg-green-600 text-white px-3 py-2 sm:px-4 rounded text-sm sm:text-base w-full sm:w-auto hover:bg-green-700 transition-colors"
        >
          ➕ New Lead GEN
        </button>

        {/* LEAD CONTRIBUTION */}

        <button
          onClick={
            openLeadContributionReport
          }
          className="bg-blue-800 text-white px-3 py-2 sm:px-4 rounded text-sm sm:text-base w-full sm:w-auto hover:bg-blue-900 transition-colors shadow-sm font-semibold"
        >
          📊 Lead Contribution
        </button>

      </div>

      {/* =====================================================
          CREATE PARTY MODAL
      ====================================================== */}

      {showModal && (
        <CreatePartyModal
          onClose={() =>
            setShowModal(false)
          }
          onPartyCreated={
            fetchParties
          }
        />
      )}

      {/* =====================================================
          PARTY DETAILS
      ====================================================== */}

      {selectedParty && (
        <PartyDetailsPopup
          partyDetails={
            selectedParty
          }
          onClose={() =>
            setSelectedParty(null)
          }
          refreshPartyList={
            fetchParties
          }
          onEditSave={
            handleSaveEdit
          }
          onNoteSaved={
            handleNoteSaved
          }
        />
      )}

      {/* =====================================================
          EDIT PARTY
      ====================================================== */}

      {editingParty && (
        <EditPartyModal
          party={editingParty}
          onClose={() =>
            setEditingParty(null)
          }
          onSave={
            handleSaveEdit
          }
        />
      )}

      {/* =====================================================
          FILTERS
      ====================================================== */}

      <div className="mb-4 w-full px-1 sm:px-2">

        {/* SEARCH BARS ROW */}

        <div className="flex flex-col sm:flex-row flex-wrap justify-center items-start sm:items-center gap-3 sm:gap-4 mb-4">

          {/* SEARCH PARTY */}

          <div className="w-full sm:w-[220px] relative">

            <label className="text-sm font-medium text-gray-700">
              Search Party:
            </label>

            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                const value =
                  e.target.value;

                setSearchTerm(value);

                if (value) {
                  const matches =
                    partyList
                      .filter((p) =>
                        p.party_ledger_name
                          ?.toLowerCase()
                          .includes(
                            value.toLowerCase()
                          )
                      )
                      .map(
                        (p) =>
                          p.party_ledger_name
                      );

                  setSearchSuggestions(
                    [
                      ...new Set(
                        matches
                      )
                    ].slice(0, 10)
                  );
                } else {
                  setSearchSuggestions(
                    []
                  );
                }
              }}
              placeholder="Enter party name..."
              className="w-full border border-gray-300 rounded px-3 py-1 text-sm pr-8"
            />

            {searchTerm && (
              <button
                className="absolute right-2 top-[calc(50%+10px)] transform -translate-y-1/2 text-gray-500 hover:text-black text-sm"
                onClick={() => {
                  setSearchTerm("");
                  setSearchSuggestions(
                    []
                  );
                }}
              >
                ✕
              </button>
            )}

            {searchSuggestions.length >
              0 && (
              <ul className="absolute z-10 bg-white border border-gray-300 rounded mt-1 w-full max-h-40 overflow-y-auto shadow-lg">

                {searchSuggestions.map(
                  (
                    suggestion,
                    idx
                  ) => (
                    <li
                      key={`suggestion-${idx}`}
                      onClick={() => {
                        setSearchTerm(
                          suggestion
                        );

                        setSearchSuggestions(
                          []
                        );
                      }}
                      className="px-3 py-1 hover:bg-blue-100 cursor-pointer text-sm"
                    >
                      {suggestion}
                    </li>
                  )
                )}

              </ul>
            )}

          </div>

          {/* GROUP */}

          <div className="w-full sm:w-[220px]">

            <label className="text-xs sm:text-sm font-medium text-gray-700 block mb-1">
              Group:
            </label>

            <select
              value={selectedGroup}
              onChange={(e) =>
                setSelectedGroup(
                  e.target.value
                )
              }
              className="w-full border border-gray-300 rounded px-2 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >

              <option value="All">
                All
              </option>

              {uniqueGroups.map(
                (
                  group,
                  idx
                ) => (
                  <option
                    key={`group-${idx}-${group}`}
                    value={group}
                  >
                    {group}
                  </option>
                )
              )}

            </select>

          </div>

          {/* GST TYPE */}

          <div className="w-full sm:w-[220px]">

            <label className="text-xs sm:text-sm font-medium text-gray-700 block mb-1">
              GST Type:
            </label>

            <select
              value={
                selectedGstType
              }
              onChange={(e) =>
                setSelectedGstType(
                  e.target.value
                )
              }
              className="w-full border border-gray-300 rounded px-2 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >

              <option value="All">
                All
              </option>

              {uniqueGstTypes.map(
                (
                  type,
                  idx
                ) => (
                  <option
                    key={`gst-${idx}-${type}`}
                    value={type}
                  >
                    {type}
                  </option>
                )
              )}

            </select>

          </div>

          {/* FIELD EXECUTIVE */}

          <div className="w-full sm:w-[220px]">

            <label className="text-xs sm:text-sm font-medium text-gray-700 block mb-1">
              Field Executive:
            </label>

            <select
              value={
                selectedExecutive
              }
              onChange={(e) =>
                setSelectedExecutive(
                  e.target.value
                )
              }
              className="w-full border border-gray-300 rounded px-2 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >

              <option value="All">
                All
              </option>

              {uniqueExecutives.map(
                (
                  exec,
                  idx
                ) => (
                  <option
                    key={`exec-${idx}-${exec}`}
                    value={exec}
                  >
                    {exec}
                  </option>
                )
              )}

            </select>

          </div>

        </div>

        {/* =====================================================
            CONTACT STATUS
        ====================================================== */}

        <div className="flex flex-wrap justify-center items-center gap-2 mb-4">

          <button
            onClick={() =>
              setContactStatus(
                "non_contacted"
              )
            }
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              contactStatus ===
              "non_contacted"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📋 Non Contacted
          </button>

          <button
            onClick={() =>
              setContactStatus(
                "contacted"
              )
            }
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              contactStatus ===
              "contacted"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            ✅ Contacted
          </button>

          <button
            onClick={() =>
              setContactStatus("all")
            }
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              contactStatus === "all"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📊 All
          </button>

        </div>

        {/* =====================================================
            ACTION BUTTONS
        ====================================================== */}

        <div className="flex flex-col sm:flex-row flex-wrap justify-center items-center gap-2">

          {/* TOTAL PARTIES */}

          <div className="w-full sm:w-auto px-3 py-2 sm:px-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-md shadow-sm flex items-center justify-between gap-2 min-w-[100px]">

            <span className="text-[10px] sm:text-xs font-semibold text-white whitespace-nowrap">
              Total Parties
            </span>

            <span className="text-sm sm:text-base font-bold text-white">
              {filteredParties.length}
            </span>

          </div>

          {/* RESET */}

          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedGroup(
                "All"
              );
              setSelectedGstType(
                "All"
              );
              setSelectedAlphabet(
                ""
              );
              setSearchSuggestions(
                []
              );
              setSelectedExecutive(
                "All"
              );
              setContactStatus(
                "non_contacted"
              );
            }}
            className="w-full sm:w-auto px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-sm whitespace-nowrap transition-colors"
          >
            Reset
          </button>

          {/* NOTES BY DATE */}

          <NotesByDatePopup
            onPartyDetailsClick={
              handlePartyDetailsFromNotes
            }
            triggerClass="w-full sm:w-auto px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-sm whitespace-nowrap transition-colors"
          />

          {/* SORRY CALL */}

          <button
            onClick={() =>
              setShowSorryCall(true)
            }
            className="w-full sm:w-auto px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg shadow-sm whitespace-nowrap transition-colors"
          >
            📞 Sorry Call
          </button>

          {/* UPDATE DETAILS */}

          <button
            onClick={() =>
              setShowCallLater(true)
            }
            className="w-full sm:w-auto px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-sm whitespace-nowrap transition-colors"
          >
            📞 Update Details
          </button>

          {/* DO NOT CALL */}

          <button
            onClick={() =>
              setShowHiddenPartyPopup(
                true
              )
            }
            className="w-full sm:w-auto px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg shadow-sm whitespace-nowrap transition-colors"
          >
            🚫 Do Not Call
          </button>

          {/* ENQUIRY REPORT */}

          <button
            onClick={() =>
              setShowEnquiryReport(
                true
              )
            }
            className="w-full sm:w-auto px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-sm whitespace-nowrap transition-colors"
          >
            📑 Enquiry Report
          </button>

          {/* =================================================
              LEAD CONTRIBUTION REPORT
          ================================================== */}

          <button
            onClick={
              openLeadContributionReport
            }
            className="w-full sm:w-auto px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium bg-blue-800 hover:bg-blue-900 text-white rounded-lg shadow-sm whitespace-nowrap transition-colors font-semibold"
          >
            📊 Lead Contribution
          </button>

        </div>

      </div>

      {/* =====================================================
          ALPHABET FILTER
      ====================================================== */}

      <div className="mb-4 px-1">

        <div className="flex flex-wrap justify-center gap-1 p-2 bg-red-100 border border-red-100 rounded-md">

          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            .split("")
            .map(
              (
                letter,
                letterIdx
              ) => (
                <button
                  key={`letter-${letter}-${letterIdx}`}
                  className={`px-2 py-1 text-xs sm:text-sm rounded border font-semibold transition-colors ${
                    selectedAlphabet ===
                    letter
                      ? "bg-green-600 text-white"
                      : "bg-white text-blue-700 border-blue-600 hover:bg-blue-200"
                  }`}
                  onClick={() =>
                    setSelectedAlphabet(
                      letter
                    )
                  }
                >
                  {letter}
                </button>
              )
            )}

          <button
            className={`px-2 py-1 text-xs sm:text-sm rounded border font-semibold transition-colors ${
              selectedAlphabet ===
              ""
                ? "bg-gray-700 text-white"
                : "bg-white text-gray-700 border-gray-700 hover:bg-gray-200"
            }`}
            onClick={() =>
              setSelectedAlphabet(
                ""
              )
            }
          >
            All
          </button>

        </div>

      </div>

      {/* =====================================================
          TABLE
      ====================================================== */}

      <div className="w-full overflow-x-auto rounded-lg shadow border border-gray-300 bg-white">

        <table className="w-full table-auto border-collapse text-xs sm:text-sm min-w-[800px]">

          <thead className="bg-gradient-to-r from-blue-50 to-blue-100 text-gray-800">

            <tr>

              <th className="border border-gray-400 p-2 sm:p-3 text-left font-semibold">
                S.No.
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-left font-semibold">
                Company Name
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-center font-semibold">
                Rating
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-left font-semibold">
                Group
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-left font-semibold">
                GST Type
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-left font-semibold">
                GSTIN
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-left font-semibold">
                Field Executive
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-left font-semibold">
                Added By
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-center font-semibold">
                Notes
              </th>

              <th className="border border-gray-400 p-2 sm:p-3 text-center font-semibold">
                Delete
              </th>

            </tr>

          </thead>

          <tbody>

            {finalParties.map(
              (row, idx) => {

                return (
                  <React.Fragment
                    key={row.id}
                  >

                    <tr
                      className={`border-b ${
                        greenParties.includes(
                          row.id
                        ) ||
                        row.note_updated ==
                          1
                          ? "bg-green-100"
                          : "bg-white"
                      }`}
                    >

                      {/* S.NO */}

                      <td className="border border-gray-300 p-2 text-center">
                        {idx + 1}
                      </td>

                      {/* COMPANY */}

                      <td
                        className="border border-gray-300 p-2 text-blue-600 hover:underline cursor-pointer break-words"
                        onClick={() =>
                          handlePartyClick(
                            row
                          )
                        }
                      >
                        {
                          row.party_ledger_name
                        }
                      </td>

                      {/* RATING */}

                      <td className="border border-gray-300 p-2 text-center">

                        <div className="flex items-center justify-center gap-1">

                          {[1, 2, 3, 4, 5].map(
                            (star) => (
                              <span
                                key={star}
                                onClick={() =>
                                  handleRating(
                                    row.id,
                                    star
                                  )
                                }
                                className={`cursor-pointer text-base sm:text-lg ${
                                  (partyRatings[
                                    row.id
                                  ] ||
                                    0) >=
                                  star
                                    ? "text-yellow-500"
                                    : "text-gray-300"
                                }`}
                                title={
                                  (partyRatings[
                                    row.id
                                  ] ||
                                    0) ===
                                  star
                                    ? "Click to remove rating"
                                    : `Rate ${star} star${
                                        star >
                                        1
                                          ? "s"
                                          : ""
                                      }`
                                }
                              >
                                ★
                              </span>
                            )
                          )}

                        </div>

                      </td>

                      {/* GROUP */}

                      <td className="border border-gray-300 p-2">
                        {
                          row.group_name
                        }
                      </td>

                      {/* GST TYPE */}

                      <td className="border border-gray-300 p-2">
                        {
                          row.gst_registration_type
                        }
                      </td>

                      {/* GSTIN */}

                      <td className="border border-gray-300 p-2 break-all">
                        {row.gstin}
                      </td>

                      {/* FIELD EXECUTIVE */}

                      <td className="border border-gray-300 p-2">
                        {
                          row.field_executive
                        }
                      </td>

                      {/* ADDED BY */}

                      <td className="border border-gray-300 p-2">
                        {
                          row.added_by ||
                          row.addedBy
                        }
                      </td>

                      {/* NOTES */}

                      <td className="border border-gray-300 p-2 text-center">

                        <button
                          className="text-blue-600 hover:underline text-xs sm:text-sm whitespace-nowrap"
                          onClick={() =>
                            setNotesParty(
                              {
                                id: row.id,
                                partyLedger:
                                  row.party_ledger_name,
                                readOnly:
                                  false
                              }
                            )
                          }
                        >
                          📝 View Notes
                        </button>

                      </td>

                      {/* DELETE */}

                      <td className="border border-gray-300 p-2 text-center">

                        <button
                          onClick={() =>
                            handleDelete(
                              row.id
                            )
                          }
                          className="bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-600 hover:text-white text-sm transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>

                      </td>

                    </tr>

                  </React.Fragment>
                );
              }
            )}

          </tbody>

        </table>

      </div>

      {/* =====================================================
          HIDDEN PARTY POPUP
      ====================================================== */}

      <HiddenPartyPopup
        show={
          showHiddenPartyPopup
        }
        setShow={
          setShowHiddenPartyPopup
        }
      />

      {/* =====================================================
          SORRY CALL POPUP
      ====================================================== */}

      <SorryCallPopup
        show={showSorryCall}
        setShow={
          setShowSorryCall
        }
        handlePartyClick={
          handlePartyClick
        }
        partiesWithNotes={
          partiesWithNotes
        }
        highlightedFieldsPerParty={
          highlightedFieldsPerParty
        }
      />

      {/* =====================================================
          ENQUIRY REPORT
      ====================================================== */}

      <EnquiryReport
        show={
          showEnquiryReport
        }
        setShow={
          setShowEnquiryReport
        }
      />

      {/* =====================================================
          CALL LATER POPUP
      ====================================================== */}

      <CallLaterPopup
        show={showCallLater}
        setShow={
          setShowCallLater
        }
        handlePartyClick={
          handlePartyClick
        }
        highlightedFieldsPerParty={
          highlightedFieldsPerParty
        }
        partiesWithNotes={
          partiesWithNotes
        }
      />

      {/* =====================================================
          HIDDEN PARTY POPUP - REFRESH
      ====================================================== */}

      <HiddenPartyPopup
        show={
          showHiddenPartyPopup
        }
        setShow={
          setShowHiddenPartyPopup
        }
        onUnhide={
          fetchParties
        }
      />

      {/* =====================================================
          NOTES PANEL
      ====================================================== */}

      {notesParty.id && (
        <NewNotesPanel
          partyId={
            notesParty.id
          }
          partyLedger={
            notesParty.partyLedger
          }
          showPopup={true}
          setShowPopup={() =>
            setNotesParty({
              id: null,
              partyLedger: "",
              readOnly: true
            })
          }
          readOnly={
            notesParty.readOnly
          }
          onNoteSaved={
            handleNoteSaved
          }
        />
      )}

    </div>
  );
}