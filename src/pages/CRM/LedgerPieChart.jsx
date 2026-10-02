import React, { useEffect, useState, useRef } from "react";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveBar } from "@nivo/bar";
import NotesPanel from "./NotesPanel";
import EditPartyModal from "./EditPartyPopup";
import ExportToExcel from "./ExportToExcel";
import { auth } from "../../components/firebase";
import NotesByDatePopup from "../newpartydetails/NotesByDatePopup";
import DoNotCallPopup from "./DoNotCallPopup";
import EnquiryReport from "./EnquiryReport";
import CallLaterPopup from "./CallLaterPopup";
import SorryCallPopup from "./SorryCallPopup";
import FollowUpNotesButton from "./FollowUpNotesButton";
import { apiFetch } from "../../api/apiClient";


const API = "/serverphp";

export default function LedgerPieChart() {
  const [pieData, setPieData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [visibleRows, setVisibleRows] = useState(20);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [partyDetails, setPartyDetails] = useState(null);
  const [noteParty, setNoteParty] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [viewOnlyParty, setViewOnlyParty] = useState("");
  const [showReadOnlyNotes, setShowReadOnlyNotes] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState("All");
  const [selectedGstType, setSelectedGstType] = useState("All");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [highlightedFields, setHighlightedFields] = useState([]);
  const [highlightedFieldsPerParty, setHighlightedFieldsPerParty] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [partiesWithNotes, setPartiesWithNotes] = useState([]);
  const [selectedAlphabet, setSelectedAlphabet] = useState("");
  const [groupedData, setGroupedData] = useState({});
  const [showOnlyWithEmail, setShowOnlyWithEmail] = useState(false);
  const [notesData, setNotesData] = useState([]);
  const tableScrollRef = useRef();
  const [doNotCallList, setDoNotCallList] = useState([]);
  const [showDoNotCall, setShowDoNotCall] = useState(false);
  const [showEnquiryReport, setShowEnquiryReport] = useState(false);
  const [showCallLater, setShowCallLater] = useState(false);
  const [drillData, setDrillData] = useState([]);
  const [selectedRange, setSelectedRange] = useState("");
  const [showSorryCall, setShowSorryCall] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#000"); // default black/blue
  const [partyRatings, setPartyRatings] = useState({});


  const handleRating = async (ledger, rating) => {
    setPartyRatings(prev => ({ ...prev, [ledger]: rating }));

    try {
      const res = await apiFetch(`${API}/save_rating_crm.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party_ledger_name: ledger, rating }),
      });

      const data = await res.json();
      if (!data.success) console.error("Failed to save rating:", data.message);
    } catch (err) {
      console.error("Error saving rating:", err);
    }
  };

  const handlePartyDetailsClick = (partyLedgerName) => {
    console.log("Clicked party from follow-up notes:", partyLedgerName);
    setNoteParty(partyLedgerName); // Add this line

    // First check if we have the party in tableData with the correct structure
    const partyFromTable = tableData.find(party =>
      party.PartyLedgerName === partyLedgerName
    );

    if (partyFromTable) {
      console.log("Found party in tableData:", partyFromTable);
      setPartyDetails(partyFromTable);
    } else {
      // ... rest of your existing code
    }
  };

  // Add this useEffect to debug the partyDetails structure
  useEffect(() => {
    if (partyDetails) {
      console.log("Current partyDetails structure:", partyDetails);
      console.log("Available properties:", Object.keys(partyDetails));
    }
  }, [partyDetails]);

  const fetchNotes = () => {
    apiFetch(`${API}/get_notes.php`)
      .then((res) => res.json())
      .then((data) => setNotesData(data))
      .catch((err) => console.error("Failed to fetch notes:", err));
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchTableData = () => {
    apiFetch(`${API}/grouped_table.php`)
      .then((res) => res.json())
      .then(setTableData)
      .catch((err) => console.error("Initial table fetch error:", err));
  };

  useEffect(() => {
    window.refreshMainTable = fetchTableData;
    fetchTableData();
  }, []);

  useEffect(() => {
    const bottomScrollbar = document.getElementById("bottom-scrollbar");

    const syncScroll = () => {
      if (bottomScrollbar && tableScrollRef.current) {
        bottomScrollbar.scrollLeft = tableScrollRef.current.scrollLeft;
      }
    };

    if (tableScrollRef.current) {
      tableScrollRef.current.addEventListener("scroll", syncScroll);
    }

    return () => {
      if (tableScrollRef.current) {
        tableScrollRef.current.removeEventListener("scroll", syncScroll);
      }
    };
  }, []);

  useEffect(() => {
    apiFetch(`${API}/get_tablegrouped_summary.php`)
      .then((res) => res.json())
      .then((data) => setGroupedData(data))
      .catch((err) => console.error("Failed to fetch grouped data:", err));
  }, []);

  useEffect(() => {
    apiFetch(`${API}/getgreenparties_with_notes.php`)
      .then(res => res.json())
      .then(data => {
        setPartiesWithNotes(data);
      })
      .catch(console.error);
  }, []);

  const searchRef = useRef();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchSuggestions([]);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const labelMap = {
      "Below 0.0": "Lost Clients",
    };

    apiFetch(`${API}/grouped_pie.php`)
      .then((res) => res.json())
      .then((data) => {
        const mapped = data.map((d) => ({
          ...d,
          label: labelMap[d.label] || d.label,
          id: labelMap[d.id] || d.id,
        }));
        setPieData(mapped);
      })
      .catch((err) => console.error("Pie data fetch error:", err));

    apiFetch(`${API}/grouped_table.php`)
      .then((res) => res.json())
      .then(setTableData)
      .catch((err) => console.error("Initial table fetch error:", err));
  }, []);




  const handleSliceClick2 = (slice) => {
    const label = slice.label;

    setSelectedRange(label);

    apiFetch(`${API}/grouped_pie_drilldown.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        range: label === "Lost Clients" ? "Below 0.0" : label
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("DRILL CUSTOMERS:", data);
        const formatted = data.map((row, index) => ({
          id: `${row.label}-${index}`,
          label: row.label,
          value: Number(row.value || row.total_amount || 0),
          parties: row.parties,
        }));

        setDrillData(formatted);
      })
      .catch(console.error);
  };

  const handleSliceClick = (slice) => {
    const label = slice.label;
    const parties = slice.data.parties;

    const actualRange =
      label === "Lost Clients"
        ? "Below 0.0"
        : label;

    setSelectedLabel(label);
    setVisibleRows(20);

    console.log("Selected Range:", actualRange);
    console.log("Selected Group:", label);

    apiFetch(`${API}/grouped_table.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parties,
        range: actualRange,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log(data);
        setTableData(data);
      })
      .catch((err) => console.error("Filtered data fetch error:", err));
  };

  const handleMainPieClick = (slice) => {
    handleSliceClick2(slice);
    handleSliceClick(slice);
    setSelectedLabel(slice.label);
    setSelectedColor(slice.color); // 🎨 save slice color
  };

  const handlePartyClick = (name) => {
    setPartyDetails(null);
    setNoteParty(name);
    apiFetch(`${API}/party_details.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PartyLedgerName: name }),
    })
      .then((res) => res.json())
      .then((data) => setPartyDetails(data))
      .catch((err) => console.error(err));
  };

  const uniqueGroups = Array.from(
    new Set(tableData.map((row) => row._LedGroup))
  ).filter(Boolean);

  const uniqueGstTypes = Array.from(
    new Set(tableData.map((row) => row._GSTRegistrationType))
  ).filter(Boolean);

  const filteredRows = tableData.filter((row) => {
    const partyName = row.PartyLedgerName.toLowerCase();
    const searchMatch = partyName.includes(searchTerm.toLowerCase());
    const groupMatch = selectedGroup === "All" || row._LedGroup === selectedGroup;
    const gstMatch = selectedGstType === "All" || row._GSTRegistrationType === selectedGstType;
    const alphabetMatch = selectedAlphabet === "" || partyName.startsWith(selectedAlphabet.toLowerCase());
    const emailMatch = !showOnlyWithEmail || (row.email && row.email.trim() !== "");

    return searchMatch && groupMatch && gstMatch && alphabetMatch && emailMatch;
  });

  // Only run once when tableData changes
  useEffect(() => {
    const ratings = {};
    tableData.forEach(row => {
      if (row.rating !== undefined) ratings[row.PartyLedgerName] = row.rating;
    });
    setPartyRatings(ratings);
  }, [tableData]); // <- use tableData, not filteredRows



  const totalFilteredCount = filteredRows.length;


  useEffect(() => {
    apiFetch(`${API}/fetch_edited_fields.php`)
      .then(res => res.json())
      .then(data => {
        setHighlightedFieldsPerParty(data);
      })
      .catch(err => console.error("Failed to load edited highlights:", err));
  }, []);

  const handleDrillSliceClick = (slice) => {
    const actualRange =
      selectedRange === "Lost Clients"
        ? "Below 0.0"
        : selectedRange;

    console.log(slice); // <-- keep this temporarily

    apiFetch(`${API}/grouped_table.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        range: actualRange,
        group: slice.label,
        parties: slice.data?.parties || slice.parties || [],
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setTableData(data);
        setVisibleRows(20);
        setSelectedLabel(`${selectedRange} - ${slice.label}`);
      })
      .catch(console.error);
  };
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setCurrentUserEmail(user.email);
      }
    });

    return () => unsubscribe();
  }, []);

  const isRestrictedUser = currentUserEmail === "demo@gmail.com";
  useEffect(() => {
    if (pieData.length > 0) {
      const total = pieData.reduce((sum, item) => sum + item.value, 0);

      pieData.forEach(item => {
        const percentage = (item.value / total) * 100;

        if (percentage >= 1) {
          console.log(
            "Customer:",
            item.id,
            "Amount:",
            item.value,
            "Percentage:",
            percentage.toFixed(2) + "%"
          );
        }
      });
    }
  }, [pieData]);


  const allMonths = [
    "Apr", "May", "Jun", "Jul", "Aug", "Sep",
    "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"
  ];

  const visibleMonths = allMonths.filter((month) =>
    filteredRows.some((row) => Number(row[month] || 0) !== 0)
  );


const barData = pieData.map((item, index) => ({
  range: item.label,
  value: Number(item.value),
  parties: item.parties,
  color: [
    "#e41a1c",
    "#377eb8",
    "#4daf4a",
    "#984ea3",
    "#ff7f00",
    "#ffff33",
    "#a65628",
    "#f781bf",
    "#999999",
  ][index % 9],
}));


  return (
    <>
      <div className="px-2 sm:px-4 lg:px-6 max-w-full overflow-x-hidden">
        {/* Pie Charts Section - Responsive */}
        <div className="flex flex-col lg:flex-row justify-center items-center gap-6 lg:gap-10 mb-6">
          {/* Main Pie */}
          <div className="flex flex-col items-center w-full lg:w-auto">
            <h2 className="text-sm sm:text-base font-bold text-center mb-2">Main Distribution</h2>
            <div className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px]">
           <ResponsiveBar
  data={barData}
  keys={["value"]}
  indexBy="range"
  margin={{ top: 20, right: 20, bottom: 80, left: 70 }}
  padding={0.35}
  valueScale={{
  type: "symlog",
}}
  indexScale={{ type: "band", round: true }}
  colors={({ data }) => data.color}
  borderRadius={4}
  axisTop={null}
  axisRight={null}
axisLeft={{
  tickSize: 0,
  tickPadding: 0,
  tickRotation: 0,
  format: () => "",
}}
  axisBottom={{
    tickRotation: -25,
  }}
  labelSkipWidth={12}
  labelSkipHeight={12}
 enableLabel={false}
  animate={true}
  onClick={(bar) => {
    handleMainPieClick({
      label: bar.data.range,
      color: bar.color,
      data: {
        parties: bar.data.parties,
      },
    });
  }}
  tooltip={({ value, indexValue }) => (
    <div
      style={{
        background: "white",
        padding: "8px",
        border: "1px solid #ccc",
      }}
    >
      <strong>{indexValue}</strong>
      <br />
      Amount: {Number(value).toLocaleString()}
    </div>
  )}
/>
            </div>
          </div>

          {/* Drilldown Pie */}
          <div className="flex flex-col items-center w-full lg:w-auto">
            <h2 className="text-sm sm:text-base font-bold text-center mb-2">
              {selectedRange ? `${selectedRange} by Group` : "Click a slice to drill down"}
            </h2>
            <div className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px]">
              {drillData.length > 0 ? (
                <ResponsivePie
                  data={drillData}
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                  innerRadius={0.5}
                  padAngle={1}
                  cornerRadius={3}
                  colors={{ scheme: "set2" }}
                  arcLabelsSkipAngle={10}
                  arcLabelsTextColor="#fff"
                  arcLinkLabelsSkipAngle={10}
                  arcLinkLabelsTextColor="#000"
                  arcLinkLabelsThickness={2}
                  arcLinkLabelsColor={{ from: "color" }}
                  enableArcLinkLabels={false}
                  onClick={(slice) => {
                    handleDrillSliceClick(slice);
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  No data to display
                </div>
              )}
            </div>
          </div>
        </div>

        <h2
          className="text-lg sm:text-xl font-semibold mb-4 text-center"
          style={{ color: selectedLabel ? selectedColor : "#1e40af" }} // default blue
        >
          {selectedLabel
            ? `Party Ledgers in "${selectedLabel}"`
            : "All Party Ledgers"}
        </h2>


        {/* Search and Filters - Responsive Grid */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Search Party Name */}
          <div className="relative" ref={searchRef}>
            <label className="text-xs sm:text-sm font-medium text-gray-700 block mb-1">Search Party:</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);

                  if (value.length > 0) {
                    const matches = tableData
                      .filter((row) =>
                        row.PartyLedgerName.toLowerCase().includes(value.toLowerCase())
                      )
                      .map((row) => row.PartyLedgerName);
                    const uniqueMatches = [...new Set(matches)];
                    setSearchSuggestions(uniqueMatches.slice(0, 10));
                  } else {
                    setSearchSuggestions([]);
                  }
                }}
                placeholder="Enter party name..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm pr-8"
              />
              {searchTerm && (
                <button
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-black text-sm"
                  onClick={() => {
                    setSearchTerm("");
                    setSearchSuggestions([]);
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {searchSuggestions.length > 0 && (
              <ul className="absolute z-10 bg-white border border-gray-300 rounded mt-1 w-full max-h-40 overflow-y-auto shadow-md">
                {searchSuggestions.map((suggestion, idx) => (
                  <li
                    key={idx}
                    onClick={() => {
                      setSearchTerm(suggestion);
                      setSearchSuggestions([]);
                    }}
                    className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm"
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Filter by Group */}
          <div>
            <label className="text-xs sm:text-sm font-medium text-gray-700 block mb-1">Group:</label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="All">All</option>
              {uniqueGroups.map((group, idx) => (
                <option key={idx} value={group}>{group}</option>
              ))}
            </select>
          </div>

          {/* Filter by GST Type */}
          <div>
            <label className="text-xs sm:text-sm font-medium text-gray-700 block mb-1">GST Type:</label>
            <select
              value={selectedGstType}
              onChange={(e) => setSelectedGstType(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="All">All</option>
              {uniqueGstTypes.map((type, idx) => (
                <option key={idx} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons Row with Parties Found Card */}
        <div className="mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-center flex-wrap">
          {/* Parties Found Card - Same height as buttons */}
          <div className="px-2 py-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-md shadow-sm flex items-center justify-between gap-2 min-w-[100px]">
            <span className="text-[10px] sm:text-xs font-semibold text-white whitespace-nowrap">
              Parties Found
            </span>
            <span className="text-sm sm:text-base font-bold text-white">
              {filteredRows.length}
            </span>
          </div>


          {/* Reset Button */}
          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedGroup("All");
              setSelectedGstType("All");
              setSelectedAlphabet("");
              setSearchSuggestions([]);
            }}
            className="px-4 py-2 text-xs sm:text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-sm whitespace-nowrap"
          >
            Reset
          </button>

          {/* Notes by Date Button */}
          <FollowUpNotesButton />



          {/* Do Not Call Button */}
          <button
            onClick={() => setShowDoNotCall(true)}
            className="px-4 py-2 text-xs sm:text-sm font-medium bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-sm whitespace-nowrap"
          >
            🚫 Do Not Call
          </button>

          {/* Sorry Call Button */}
          <button
            onClick={() => setShowSorryCall(true)}
            className="px-4 py-2 text-xs sm:text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg shadow-sm whitespace-nowrap"
          >
            📞 Sorry Call
          </button>

          {/* Call Later Button */}
          <button
            onClick={() => setShowCallLater(true)}
            className="px-4 py-2 text-xs sm:text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg shadow-sm whitespace-nowrap"
          >
            📞 Update Details
          </button>

          {/* Enquiry Report Button */}
          <button
            onClick={() => setShowEnquiryReport(true)}
            className="px-4 py-2 text-xs sm:text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-sm whitespace-nowrap"
          >
            📑 Enquiry Report
          </button>
        </div>

        {/* Alphabet Filter Bar - Responsive */}
        <div className="w-full mb-4">
          <div className="flex flex-wrap justify-center items-center gap-1 p-2 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg">
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
              <button
                key={letter}
                className={`px-2 py-1 text-xs sm:text-sm rounded border font-semibold transition-colors ${selectedAlphabet === letter
                  ? "bg-green-600 text-white border-green-700"
                  : "bg-white text-blue-700 border-blue-600 hover:bg-blue-200"
                  }`}
                onClick={() => setSelectedAlphabet(letter)}
              >
                {letter}
              </button>
            ))}
            <button
              className={`px-2 py-1 text-xs sm:text-sm rounded border font-semibold transition-colors ${selectedAlphabet === ""
                ? "bg-gray-700 text-white border-gray-800"
                : "bg-white text-gray-700 border-gray-700 hover:bg-gray-200"
                }`}
              onClick={() => setSelectedAlphabet("")}
            >
              All
            </button>
            <button
              className={`px-2 py-1 text-xs sm:text-sm rounded border font-semibold transition-colors ${showOnlyWithEmail
                ? "bg-green-600 text-white border-green-700"
                : "bg-white text-green-700 border-green-700 hover:bg-green-200"
                }`}
              onClick={() => setShowOnlyWithEmail((prev) => !prev)}
            >
              ✉ Email
            </button>
          </div>
        </div>

        {/* Export Button */}
        <div className="flex justify-end mb-3">
          <ExportToExcel
            data={filteredRows}
            notesData={notesData}
          />
        </div>

        {/* Table - Horizontal Scroll on Mobile */}
        <div className="overflow-x-auto -mx-2 sm:mx-0" ref={tableScrollRef}>
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full table-fixed border-separate border-spacing-0 border border-gray-300 text-xs sm:text-sm">

              <colgroup>
                <col className="w-[50px]" /> {/* S.No */}
                <col className="w-[200px]" /> {/* Party Name */}
                <col className="w-[80px]" /> {/* Rating */}
                <col className="w-[200px]" /> {/* Group */}
                <col className="w-[120px]" /> {/* GST Type */}
                <col className="w-[180px]" /> {/* GSTIN */}
                <col className="w-[150px]" /> {/* Mobile */}
                <col className="w-[150px]" /> {/* Purchase */}
                <col className="w-[180px]" /> {/* Email */}
                {visibleMonths.map((month) => (
                  <col key={month} className="w-[160px]" />
                ))}

                <col className="w-[140px]" /> {/* Total */}
                <col className="w-[90px]" />  {/* % */}
                <col className="w-[80px]" />  {/* Notes */}
              </colgroup>

              <thead className="bg-gradient-to-r from-blue-50 to-blue-100 text-gray-800">
                <tr>
                  <th
                    className="sticky left-0 z-50 border border-gray-400 px-2 py-2 font-semibold"
                    style={{ backgroundColor: "#032185" }}   // blue-200
                  >
                    S.No.
                  </th>

                  <th
                    className="sticky left-[50px] z-50 border border-gray-400 px-2 py-2 font-semibold"
                    style={{ backgroundColor: "#032185" }}
                  >
                    PartyLedgerName
                  </th>

                  <th className="border border-gray-400 px-2 py-2 text-center font-semibold">
                    Rating
                  </th>

                  <th className="border border-gray-400 px-2 py-2 text-left font-semibold">
                    Group
                  </th>

                  <th className="border border-gray-400 px-2 py-2 text-left font-semibold">
                    GST Type
                  </th>

                  <th className="border border-gray-400 px-2 py-2 text-left font-semibold">
                    GSTIN
                  </th>

                  <th className="border border-gray-400 px-2 py-2 text-left font-semibold">
                    Mobile
                  </th>

                  <th className="border border-gray-400 px-2 py-2 text-left font-semibold">
                    Purchase Cont No
                  </th>

                  <th className="border border-gray-400 px-2 py-2 text-left font-semibold">
                    Email
                  </th>

                  {visibleMonths.map((month) => (
                    <th
                      key={month}
                      className="border border-gray-400 px-2 py-2 text-center font-semibold min-w-[120px]"
                      style={{
                        width: "90px",
                        minWidth: "90px",
                        maxWidth: "90px"
                      }}
                    >
                      {month}
                    </th>
                  ))}

                  <th className="border border-gray-400 px-2 py-2 text-center font-semibold min-w-[140px]"
                    style={{
                      width: "90px",
                      minWidth: "90px",
                      maxWidth: "90px"
                    }}>
                    Total
                  </th>

                  <th className="border border-gray-400 px-2 py-2 text-center font-semibold min-w-[90px]"
                    style={{
                      width: "90px",
                      minWidth: "90px",
                      maxWidth: "90px"
                    }}>
                    %
                  </th>
                  <th className="border border-gray-400 px-2 py-2 text-center font-semibold"
                    style={{
                      width: "90px",
                      minWidth: "90px",
                      maxWidth: "90px"
                    }}>
                    Notes
                  </th>

                </tr>
              </thead>

              <tbody>
                {(showOnlyWithEmail
                  ? filteredRows.filter((row) => row.email && row.email.trim() !== "")
                  : filteredRows
                )
                  .sort((a, b) => a.PartyLedgerName.localeCompare(b.PartyLedgerName))
                  .slice(0, visibleRows)
                  .map((row, idx) => (
                    <tr
                      key={idx}
                      className={`${idx % 2 === 0 ? "bg-white" : "bg-blue-50"} hover:bg-blue-100`}
                    >
                      <td
                        className={`border border-gray-300 px-2 sm:px-3 py-2 text-center sticky left-0 z-20 ${idx % 2 === 0 ? "bg-white" : "bg-blue-50"
                          }`}
                      >
                        {idx + 1}
                      </td>
                      <td
                        onClick={() => handlePartyClick(row.PartyLedgerName)}
                        className={`border border-gray-300 px-2 sm:px-3 py-2 font-medium cursor-pointer hover:underline max-w-[150px] sm:max-w-[200px] sticky left-[50px] z-20 ${partiesWithNotes.includes(row.PartyLedgerName)
                          ? "bg-green-100 text-green-800"
                          : idx % 2 === 0
                            ? "bg-white text-blue-600"
                            : "bg-blue-50 text-blue-600"
                          }`}
                      >
                        <div className="truncate">
                          {row.PartyLedgerName}
                        </div>
                        {row.fullyUpdated === "1" || row.fullyUpdated === 1 ? (
                          <span className="ml-1 text-[11px] font-bold text-yellow-900 bg-yellow-300 px-2 py-0.5 rounded">
                            FULLY UPDATED
                          </span>
                        ) : null}


                      </td>
                      {/* 5-Star Rating Column */}
                      <td className="border border-gray-300 px-2 py-2 text-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            onClick={() => handleRating(row.PartyLedgerName, star)}
                            className={`cursor-pointer text-sm sm:text-base ${(partyRatings[row.PartyLedgerName] || row.rating || 0) >= star
                              ? "text-yellow-500"
                              : "text-gray-300"
                              }`}
                          >
                            ★
                          </span>
                        ))}
                      </td>

                      <td className="border border-gray-300 px-2 sm:px-3 py-2 max-w-[100px] sm:max-w-[120px] truncate" title={row._LedGroup}>
                        {row._LedGroup}
                      </td>
                      <td className="border border-gray-300 px-2 sm:px-3 py-2 max-w-[100px] sm:max-w-[120px] truncate" title={row._GSTRegistrationType}>
                        {row._GSTRegistrationType}
                      </td>
                      <td className="border border-gray-300 px-2 sm:px-3 py-2 max-w-[120px] sm:max-w-[150px] truncate" title={row._PartyGSTIN}>
                        {row._PartyGSTIN}
                      </td>
                      <td className="border border-gray-300 px-2 sm:px-3 py-2 max-w-[140px] sm:max-w-[180px] truncate" title={row.mobile}>
                        {row.mobile}
                      </td>
                      <td className="border border-gray-300 px-2 sm:px-3 py-2 max-w-[140px] sm:max-w-[180px] truncate" title={row.purchase_contact}>
                        {row.purchase_contact}
                      </td>
                      <td className="border border-gray-300 px-2 sm:px-3 py-2 max-w-[140px] sm:max-w-[180px] truncate" title={row.email}>
                        {row.email}
                      </td>

                      {visibleMonths.map((month) => (
                        <td
                          key={month}
                          className="border border-gray-300 px-2 py-2 text-right whitespace-nowrap min-w-[160px]"
                          style={{
                            width: "90px",
                            minWidth: "90px",
                            maxWidth: "90px",
                            textAlign: "right"
                          }}
                        >
                          {Number(row[month]) === 0
                            ? ""
                            : Number(row[month]).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                        </td>
                      ))}

                      <td className="border border-gray-300 px-2 py-2 font-semibold text-blue-800 text-right whitespace-nowrap"
                        style={{
                          width: "90px",
                          minWidth: "90px",
                          maxWidth: "90px",
                          textAlign: "right"
                        }}>
                        {Number(row.total_amount) === 0
                          ? ""
                          : Number(row.total_amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                      </td>

                      <td className="border border-gray-300 px-2 py-2 font-semibold text-blue-600 text-right whitespace-nowrap"
                        style={{
                          width: "90px",
                          minWidth: "90px",
                          maxWidth: "90px",
                          textAlign: "right"
                        }}>
                        {Number(row.percentage) === 0
                          ? ""
                          : `${Number(row.percentage).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}%`}
                      </td>

                      <td className="border border-gray-300 px-2 py-2 text-center"
                        style={{
                          width: "90px",
                          minWidth: "90px",
                          maxWidth: "90px",
                          textAlign: "right"
                        }}>
                        <button
                          onClick={() => {
                            setViewOnlyParty(row.PartyLedgerName);
                            setShowReadOnlyNotes(true);
                          }}
                          className="text-base text-blue-600 hover:underline"
                          title="View Notes"
                        >
                          📝
                        </button>



                      </td>
                    </tr>
                  ))}

              </tbody>
            </table>
          </div>
        </div>

        {visibleRows < filteredRows.length && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setVisibleRows((prev) => prev + 200)}
              disabled={isRestrictedUser}
              className={`px-6 py-2 rounded text-sm sm:text-base ${isRestrictedUser
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
            >
              Show More
            </button>
          </div>
        )}
      </div>

      {/* Party Details Popup - Responsive */}
      {partyDetails && (
        <div className="fixed top-20 right-4 w-[90%] sm:w-96 max-h-[calc(100vh-100px)] overflow-y-auto p-4 bg-white shadow-2xl border border-gray-300 rounded-lg z-[9999]">
          <h3 className="text-base sm:text-lg font-bold mb-2 break-words">{partyDetails.PartyLedgerName}</h3>

          <div className="space-y-2 text-xs sm:text-sm">
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

            <p>
              <strong>Designation:</strong>{" "}
              <span
                className={
                  highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Designation")
                    ? "text-red-600 font-bold"
                    : ""
                }
              >
                {partyDetails.designation || "-"}
              </span>
            </p>

            <p>
              <strong>Designator Name:</strong>{" "}
              <span
                className={
                  highlightedFieldsPerParty[partyDetails.PartyLedgerName]?.includes("Designator Name")
                    ? "text-red-600 font-bold"
                    : ""
                }
              >
                {partyDetails.designator_name || "-"}
              </span>
            </p>


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
          </div>

          <div className="flex justify-between mt-3">
            <button
              onClick={() => setPartyDetails(null)}
              className="px-3 py-1 bg-red-500 text-white rounded text-xs sm:text-sm hover:bg-red-600"
            >
              Close
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="px-3 py-1 bg-blue-600 text-white rounded text-xs sm:text-sm hover:bg-blue-700"
            >
              Open Notes
            </button>
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="px-3 py-1 bg-yellow-500 text-white rounded text-xs sm:text-sm hover:bg-yellow-600"
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && partyDetails && (
        <EditPartyModal
          partyDetails={partyDetails}
          onClose={() => setIsEditModalOpen(false)}
          onSave={(updated) => {
            const changed = [];

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

            if ((updated.designation || "") !== (partyDetails.designation || "")) {
              changed.push("Designation");
            }
            if ((updated.designator_name || "") !== (partyDetails.designator_name || "")) {
              changed.push("Designator Name");
            }


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

            for (const [key, label] of Object.entries(fieldLabelMap)) {
              if ((updated[key] || "") !== (partyDetails[key] || "")) {
                if (!changed.includes(label)) {
                  changed.push(label);
                }
              }
            }

            console.log("✅ Changed fields:", changed);

            setPartyDetails(updated);


            setTableData((prevData) =>
              prevData.map((row) =>
                row.PartyLedgerName === updated.PartyLedgerName
                  ? { ...row, _LedGroup: updated["Ledger.$_LedGroup"] }
                  : row
              )
            );

            setHighlightedFieldsPerParty(prev => {
              const existingFields = prev[updated.PartyLedgerName] || [];
              const allHighlightedFields = [...new Set([...existingFields, ...changed])];

              const newHighlights = {
                ...prev,
                [updated.PartyLedgerName]: allHighlightedFields,
              };

              apiFetch(`${API}/fetch_edited_fields.php`, {
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

            setPartiesWithNotes(prev => [...new Set([...prev, updated.PartyLedgerName])]);

            setIsEditModalOpen(false);
            console.log("✅ UI updated successfully");
          }}
        />
      )}

      {/* Popups */}
      <DoNotCallPopup show={showDoNotCall} setShow={setShowDoNotCall} />

      <NotesPanel
        partyLedger={noteParty}
        showPopup={showNotes}
        setShowPopup={setShowNotes}
        onNoteSaved={(ledger, removed) => {
          if (removed) {
            setTableData((prev) => prev.filter((row) => row.PartyLedgerName !== ledger));
          } else {
            setPartiesWithNotes((prev) => [...new Set([...prev, ledger])]);
            fetchNotes();
          }
        }}
      />

      <CallLaterPopup
        show={showCallLater}
        setShow={setShowCallLater}
        handlePartyClick={handlePartyClick}
        highlightedFieldsPerParty={highlightedFieldsPerParty}
        partiesWithNotes={partiesWithNotes}
      />

      <SorryCallPopup
        show={showSorryCall}
        setShow={setShowSorryCall}
        handlePartyClick={handlePartyClick}
        partiesWithNotes={partiesWithNotes}
        highlightedFieldsPerParty={highlightedFieldsPerParty}
      />

      <EnquiryReport show={showEnquiryReport} setShow={setShowEnquiryReport} />

      {showReadOnlyNotes && (
        <NotesPanel
          partyLedger={viewOnlyParty}
          showPopup={showReadOnlyNotes}
          setShowPopup={setShowReadOnlyNotes}
          readOnly={true}
        />
      )}



      {/* Bottom Scrollbar */}
      <div
        id="bottom-scrollbar"
        className="fixed bottom-0 left-0 w-full overflow-x-auto bg-white border-t border-gray-300 z-50 hidden sm:block"
        style={{ height: "12px" }}
        onScroll={(e) => {
          if (tableScrollRef.current) {
            tableScrollRef.current.scrollLeft = e.target.scrollLeft;
          }
        }}
      >
        <div
          style={{
            width: tableScrollRef.current
              ? `${tableScrollRef.current.scrollWidth * 2}px`
              : "2000px",
            height: "1px",
          }}
        />
      </div>
    </>
  );
}