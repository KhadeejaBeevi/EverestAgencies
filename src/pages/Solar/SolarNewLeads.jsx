import Banner from "../../components/Banner/Banner.jsx";

import React, { useEffect, useState } from "react";

import { auth, db } from "../../components/firebase";

import { doc, getDoc } from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { apiFetch } from "../../api/apiClient";



const API_BASE = "/serverphp/";



const SolarNewLeads = () => {

  const [leads, setLeads] = useState([]);

  const [permissions, setPermissions] = useState([]);

  const [loading, setLoading] = useState(true);

  const [editLeadId, setEditLeadId] = useState(null);

  const [search, setSearch] = useState("");

  const [userRole, setUserRole] = useState("");

  const [followupDate, setFollowupDate] = useState("");

  const [callStatus, setCallStatus] = useState("Not Contacted");

  const [followupTime, setFollowupTime] = useState("");

  const [districtFilter, setDistrictFilter] = useState("All");

  const [groupFilter, setGroupFilter] = useState("All");

  const [leadTypeFilter, setLeadTypeFilter] = useState("All");

  const [coordinatorFilter, setCoordinatorFilter] = useState("All");

  const [executiveFilter, setExecutiveFilter] = useState("All");

  const [selectedLetter, setSelectedLetter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);

  const [showNotesModal, setShowNotesModal] = useState(false);

  const [addedBy, setAddedBy] = useState("");

  const [noteDate, setNoteDate] = useState("");

  const [selectedLead, setSelectedLead] = useState(null);

  const [notes, setNotes] = useState([]);

  const [newNote, setNewNote] = useState("");



  const [newLead, setNewLead] = useState({

    lead_type: "New Lead",

    company_name: "",

    address: "",

    decision_maker: "",

    contact_no: "",

    group_name: "",

    sales_coordinator: "",

    field_executive: "",

  });



  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

      if (!user) {

        setUserRole("");

        return;

      }



      try {

        const roleRef = doc(db, "roles", user.uid);

        const roleSnap = await getDoc(roleRef);



        if (roleSnap.exists()) {

          const adminRole = roleSnap.data().role || "";



          if (adminRole.toLowerCase().trim() === "admin") {

            setUserRole("admin");

            return;

          }

        }



        const userRef = doc(db, "Users", user.uid);

        const userSnap = await getDoc(userRef);



        if (userSnap.exists()) {

          const userData = userSnap.data();



          console.log("USER DATA:", userData);



          setUserRole(userData.role || "");

          setPermissions(userData.permissions || []);

        }

      } catch (err) {

        console.log(err);

      }

    });



    return () => unsubscribe();

  }, []);



  useEffect(() => {

    apiFetch(`${API_BASE}get_solar_leads.php`)

      .then((res) => res.json())

      .then((data) => {

        console.log("SOLAR LEADS:", data);



        setLeads(Array.isArray(data) ? data : []);

        setLoading(false);

      })

      .catch((err) => {

        console.log("FETCH ERROR:", err);



        setLeads([]);

        setLoading(false);

      });

  }, []);



  const formatTime = (time) => {

    if (!time) return "-";



    const [hours, minutes] = time.split(":");

    const hour = parseInt(hours, 10);



    const ampm = hour >= 12 ? "PM" : "AM";

    const formattedHour = hour % 12 || 12;



    return `${formattedHour}:${minutes} ${ampm}`;

  };



  const deleteNote = async (noteId) => {

    if (!window.confirm("Delete this note?")) return;



    try {

      const response = await apiFetch(

        `${API_BASE}delete_solar_note.php`,

        {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

          },

          body: JSON.stringify({

            note_id: noteId,

          }),

        }

      );



      const result = await response.json();



      if (result.success) {

        openNotes(selectedLead);

      }

    } catch (error) {

      console.error(error);

    }

  };



  const getDistrict = (address) => {

    if (!address) return "";



    const districts = [

      "Thiruvananthapuram",

      "Kollam",

      "Pathanamthitta",

      "Alappuzha",

      "Kottayam",

      "Idukki",

      "Ernakulam",

      "Thrissur",

      "Palakkad",

      "Malappuram",

      "Kozhikode",

      "Wayanad",

      "Kannur",

      "Kasaragod",

    ];



    const found = districts.find((district) =>

      address.toLowerCase().includes(district.toLowerCase())

    );



    return found || "Others";

  };



  const districts = [

    ...new Set(leads.map((item) => getDistrict(item.address))),

  ].sort();



  const filteredLeads = Array.isArray(leads)

    ? leads

        .filter((item) => {

          const matchesSearch = item.company_name

            ?.toLowerCase()

            .includes(search.toLowerCase());



          const matchesGroup =

            groupFilter === "All" || item.group_name === groupFilter;



          const matchesCoordinator =

            coordinatorFilter === "All" ||

            item.sales_coordinator === coordinatorFilter;



          const matchesExecutive =

            executiveFilter === "All" ||

            item.field_executive === executiveFilter;



          const matchesLeadType =

            leadTypeFilter === "All" || item.lead_type === leadTypeFilter;



          const matchesLetter =

            selectedLetter === "All" ||

            item.company_name?.charAt(0)?.toUpperCase() === selectedLetter;



          const matchesDistrict =

            districtFilter === "All" ||

            getDistrict(item.address) === districtFilter;



          return (

            matchesSearch &&

            matchesGroup &&

            matchesCoordinator &&

            matchesExecutive &&

            matchesLetter &&

            matchesLeadType &&

            matchesDistrict

          );

        })

        .sort((a, b) =>

          (a.company_name || "").localeCompare(b.company_name || "")

        )

    : [];



  const alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");



  const resetFilters = () => {

    setSearch("");

    setGroupFilter("All");

    setCoordinatorFilter("All");

    setExecutiveFilter("All");

    setSelectedLetter("All");

    setLeadTypeFilter("All");

    setDistrictFilter("All");

  };



  const deleteLead = async (id) => {

    const confirmDelete = window.confirm("Delete this lead?");



    if (!confirmDelete) return;



    try {

      const response = await apiFetch(

        `${API_BASE}delete_solar_lead.php`,

        {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

          },

          body: JSON.stringify({

            id,

          }),

        }

      );



      const result = await response.json();



      console.log(result);



      if (result.success !== false) {

        setLeads((prev) => prev.filter((item) => item.id !== id));

      }

    } catch (error) {

      console.log("DELETE ERROR:", error);

    }

  };



  const handleChange = (e) => {

    setNewLead({

      ...newLead,

      [e.target.name]: e.target.value,

    });

  };



  const openNotes = async (lead) => {

    setSelectedLead(lead);

    setShowNotesModal(true);



    try {

      const response = await apiFetch(

        `${API_BASE}get_solar_notes.php?lead_id=${lead.id}`

      );



      const data = await response.json();



      setNotes(Array.isArray(data) ? data : []);

    } catch (error) {

      console.log(error);

      setNotes([]);

    }

  };



  const addNote = async () => {

    if (

      !newNote.trim() ||

      !addedBy.trim() ||

      !noteDate ||

      !followupDate ||

      !followupTime

    ) {

      alert("Enter note, added by and date");

      return;

    }



    try {

      const response = await apiFetch(

        `${API_BASE}add_solar_note.php`,

        {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

          },

          body: JSON.stringify({

            lead_id: selectedLead.id,

            note: newNote,

            added_by: addedBy,

            note_date: noteDate,

            followup_date: followupDate,

            followup_time: followupTime,

            call_status: callStatus,

          }),

        }

      );



      const result = await response.json();



      if (result.success) {

        const newNoteObj = {

          id: result.id,

          note: newNote,

          added_by: addedBy,

          note_date: noteDate,

          followup_date: followupDate,

          followup_time: followupTime,

          call_status: callStatus,

          created_at: new Date().toLocaleString(),

        };



        setNotes([newNoteObj, ...notes]);



        setNewNote("");

        setAddedBy("");

        setNoteDate("");

        setFollowupDate("");

        setFollowupTime("");

        setCallStatus("Not Contacted");

      }

    } catch (error) {

      console.log(error);

    }

  };



  const openEditModal = (item) => {

    setEditLeadId(item.id);



    setNewLead({

      lead_type: item.lead_type || "New Lead",

      company_name: item.company_name || "",

      address: item.address || "",

      decision_maker: item.decision_maker || "",

      contact_no: item.contact_no || "",

      group_name: item.group_name || "",

      sales_coordinator: item.sales_coordinator || "",

      field_executive: item.field_executive || "",

    });



    setShowAddModal(true);

  };



  const resetLeadForm = () => {

    setEditLeadId(null);



    setNewLead({

      lead_type: "New Lead",

      company_name: "",

      address: "",

      decision_maker: "",

      contact_no: "",

      group_name: "",

      sales_coordinator: "",

      field_executive: "",

    });

  };



  if (

    userRole?.toLowerCase()?.trim() === "sales" &&

    permissions.includes("lr")

  ) {

    return (

      <div className="dashboard-wrapper">

        <Banner />



        <div className="min-h-screen flex items-center justify-center">

          <h1 className="text-3xl font-bold text-red-600">

            Access Denied

          </h1>

        </div>

      </div>

    );

  }



  return (

    <div className="min-h-screen bg-[#dfe7f3]">

      <Banner />



      <div className="bg-gradient-to-r from-blue-700 to-blue-400 py-5 shadow-lg">

        <h1 className="text-center text-2xl sm:text-3xl md:text-4xl font-bold text-white px-2">

          Solar New Leads

        </h1>

      </div>



      <div className="p-2 sm:p-4 md:p-6">

        <div className="flex justify-between flex-wrap gap-4 mb-8">

          <button

            onClick={() => {

              resetLeadForm();

              setShowAddModal(true);

            }}

            className="bg-green-600 hover:bg-green-700 transition text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold shadow-lg text-sm sm:text-base w-full sm:w-auto"

          >

            + Add Solar Lead

          </button>

        </div>



        <div className="bg-white rounded-3xl shadow-xl p-6">

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

            <div className="w-full">

              <label className="text-sm font-semibold text-gray-700">

                Search Lead

              </label>



              <input

                type="text"

                placeholder="Enter company..."

                value={search}

                onChange={(e) => setSearch(e.target.value)}

                className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500"

              />

            </div>



            <div className="w-full">

              <label className="text-sm font-semibold text-gray-700">

                Group

              </label>



              <select

                value={groupFilter}

                onChange={(e) => setGroupFilter(e.target.value)}

                className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2"

              >

                <option>All</option>

                <option>Solar Distributors</option>

                <option>Solar Customers</option>

              </select>

            </div>



            <div className="w-full">

              <label className="text-sm font-semibold text-gray-700">

                Sales Coordinator

              </label>



              <select

                value={coordinatorFilter}

                onChange={(e) => setCoordinatorFilter(e.target.value)}

                className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2"

              >

                <option>All</option>



                {[...new Set(leads.map((item) => item.sales_coordinator))]

                  .filter(Boolean)

                  .map((coordinator, index) => (

                    <option key={index}>{coordinator}</option>

                  ))}

              </select>

            </div>



            <div className="w-full">

              <label className="text-sm font-semibold text-gray-700">

                Field Executive

              </label>



              <select

                value={executiveFilter}

                onChange={(e) => setExecutiveFilter(e.target.value)}

                className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2"

              >

                <option>All</option>



                {[...new Set(leads.map((item) => item.field_executive))]

                  .filter(Boolean)

                  .map((executive, index) => (

                    <option key={index}>{executive}</option>

                  ))}

              </select>

            </div>



            <div className="w-full">

              <label className="text-sm font-semibold text-gray-700">

                Lead Type

              </label>



              <select

                value={leadTypeFilter}

                onChange={(e) => setLeadTypeFilter(e.target.value)}

                className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2"

              >

                <option>All</option>

                <option>New Lead</option>

                <option>Old Lead</option>

              </select>

            </div>



            <div className="w-full">

              <label className="text-sm font-semibold text-gray-700">

                District

              </label>



              <select

                value={districtFilter}

                onChange={(e) => setDistrictFilter(e.target.value)}

                className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2"

              >

                <option>All</option>



                {districts.map((district, index) => (

                  <option key={index}>{district}</option>

                ))}

              </select>

            </div>

          </div>



          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">

            <div className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold shadow text-sm">

              Total Leads : {filteredLeads.length}

            </div>



            <button

              onClick={resetFilters}

              className="bg-red-500 hover:bg-red-600 transition text-white px-5 py-2 rounded-xl font-semibold text-sm"

            >

              Reset

            </button>

          </div>

        </div>



        <div className="bg-[#f6dede] rounded-2xl p-4 mt-8">

          <div className="flex flex-wrap gap-2 justify-center">

            {alphabets.map((letter) => (

              <button

                key={letter}

                onClick={() => setSelectedLetter(letter)}

                className={`px-4 py-2 rounded-lg border font-semibold transition ${

                  selectedLetter === letter

                    ? "bg-blue-700 text-white"

                    : "bg-white text-blue-700 border-blue-700"

                }`}

              >

                {letter}

              </button>

            ))}



            <button

              onClick={() => setSelectedLetter("All")}

              className={`w-10 h-10 rounded-lg border text-sm font-semibold transition flex items-center justify-center ${

                selectedLetter === "All"

                  ? "bg-black text-white"

                  : "bg-white border"

              }`}

            >

              All

            </button>

          </div>

        </div>



        {/* MOBILE CARD VIEW */}

        <div className="block lg:hidden space-y-4 mt-6">

          {filteredLeads.map((item, index) => (

            <div

              key={item.id}

              className="bg-white rounded-2xl shadow p-4"

            >

              <div className="flex justify-between items-start gap-3">

                <div>

                  <h2 className="font-bold text-blue-700 text-lg">

                    {item.company_name}

                  </h2>



                  <p className="text-sm text-gray-500 mt-1">

                    {item.address}

                  </p>

                </div>



                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">

                  #{index + 1}

                </span>

              </div>



              <div className="mt-4 space-y-2 text-sm">

                <p>

                  <strong>Decision Maker:</strong>{" "}

                  {item.decision_maker || "-"}

                </p>



                <p>

                  <strong>Contact:</strong>{" "}

                  {item.contact_no || "-"}

                </p>



                <p>

                  <strong>Coordinator:</strong>{" "}

                  {item.sales_coordinator || "-"}

                </p>



                <p>

                  <strong>Executive:</strong>{" "}

                  {item.field_executive || "-"}

                </p>



                <p>

                  <strong>Status:</strong>{" "}

                  {item.call_status || "Not Contacted"}

                </p>

              </div>



              <div className="flex flex-wrap gap-2 mt-4">

                <button

                  onClick={() => openNotes(item)}

                  className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm"

                >

                  Notes

                </button>



                <button

                  onClick={() => openEditModal(item)}

                  className="bg-yellow-100 px-3 py-2 rounded-lg text-sm"

                >

                  Edit

                </button>



                <button

                  onClick={() => deleteLead(item.id)}

                  className="bg-red-100 px-3 py-2 rounded-lg text-sm"

                >

                  Delete

                </button>

              </div>

            </div>

          ))}

        </div>



        {/* DESKTOP TABLE */}

        <div className="bg-white rounded-2xl shadow-xl overflow-x-auto mt-6">

          {loading ? (

            <div className="p-10 text-center text-xl font-semibold text-gray-500">

              Loading...

            </div>

          ) : (

            <table className="hidden lg:table w-full min-w-[1800px] text-xs sm:text-sm table-fixed">

              <colgroup>

                <col className="w-[60px]" />

                <col className="w-[180px]" />

                <col className="w-[220px]" />

                <col className="w-[150px]" />

                <col className="w-[130px]" />

                <col className="w-[150px]" />

                <col className="w-[150px]" />

                <col className="w-[150px]" />

                <col className="w-[120px]" />

                <col className="w-[110px]" />

                <col className="w-[140px]" />

                <col className="w-[100px]" />

                <col className="w-[130px]" />

                <col className="w-[100px]" />

              </colgroup>



              <thead className="bg-[#173b96] text-white">

                <tr>

                  <th className="p-3 text-left align-top break-words whitespace-normal">S.No</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Company Name</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Address</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Decision Maker</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Contact No</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Group</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">

                    Sales Coordinator

                  </th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">

                    Field Executive

                  </th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">

                    Follow Up Date

                  </th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">

                    Follow Up Time

                  </th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Call Status</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Notes</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Lead Type</th>

                  <th className="p-3 text-left align-top break-words whitespace-normal">Action</th>

                </tr>

              </thead>



              <tbody>

                {filteredLeads.length > 0 ? (

                  filteredLeads.map((item, index) => (

                    <tr

                      key={item.id}

                      className="border-b bg-[#dff3df] hover:bg-[#cceacc]"

                    >

                      <td className="p-3 align-top break-words whitespace-normal">

                        {index + 1}

                      </td>



                      <td className="p-3 text-blue-700 font-medium align-top break-words whitespace-normal">

                        {item.company_name || "-"}

                      </td>



                      <td className="p-3 text-blue-700 font-medium align-top break-words whitespace-normal">

                        <div className="break-words whitespace-normal">

                          {item.address || "-"}

                        </div>

                      </td>



                      <td className="p-3 text-blue-700 font-medium align-top break-words whitespace-normal">

                        {item.decision_maker || "-"}

                      </td>



                      <td className="p-3 text-blue-700 font-medium align-top break-words whitespace-normal">

                        {item.contact_no || "-"}

                      </td>



                      <td className="p-3 align-top break-words whitespace-normal">

                        {item.group_name || "-"}

                      </td>



                      <td className="p-3 text-blue-700 font-medium align-top break-words whitespace-normal">

                        {item.sales_coordinator || "-"}

                      </td>



                      <td className="p-3 align-top break-words whitespace-normal">

                        {item.field_executive || "-"}

                      </td>



                      <td className="p-3 align-top whitespace-normal">

                        {item.followup_date || "-"}

                      </td>



                      <td className="p-3 align-top whitespace-normal">

                        {formatTime(item.followup_time)}

                      </td>



                      <td className="p-3 align-top break-words whitespace-normal">

                        <span

                          className={`inline-block max-w-full px-3 py-1 rounded-full text-xs font-semibold break-words whitespace-normal ${

                            item.call_status === "Interested"

                              ? "bg-green-100 text-green-700"

                              : item.call_status === "Do Not Call"

                              ? "bg-red-100 text-red-700"

                              : item.call_status === "Call Back"

                              ? "bg-yellow-100 text-yellow-700"

                              : "bg-gray-100 text-gray-700"

                          }`}

                        >

                          {item.call_status || "Not Contacted"}

                        </span>

                      </td>



                      <td className="p-3 align-top">

                        <button

                          onClick={() => openNotes(item)}

                          className="text-blue-600 font-semibold hover:underline whitespace-nowrap"

                        >

                          📝 Notes

                        </button>

                      </td>



                      <td className="p-3 align-top break-words whitespace-normal">

                        <span

                          className={`inline-block max-w-full px-3 py-1 rounded-full text-xs font-semibold break-words whitespace-normal ${

                            item.lead_type === "New Lead"

                              ? "bg-green-100 text-green-700"

                              : item.lead_type === "Old Lead"

                              ? "bg-orange-100 text-orange-700"

                              : item.lead_type === "Contacted Lead"

                              ? "bg-blue-100 text-blue-700"

                              : item.lead_type === "Contacted Lead (Old)"

                              ? "bg-purple-100 text-purple-700"

                              : "bg-gray-100 text-gray-700"

                          }`}

                        >

                          {item.lead_type || "-"}

                        </span>

                      </td>



                      <td className="p-3 align-top">

                        <div className="flex flex-wrap gap-2">

                          <button

                            onClick={() => openEditModal(item)}

                            className="bg-yellow-100 hover:bg-yellow-200 transition px-3 py-2 rounded-lg"

                            title="Edit"

                          >

                            ✏️

                          </button>



                          <button

                            onClick={() => deleteLead(item.id)}

                            className="bg-red-100 hover:bg-red-200 transition px-3 py-2 rounded-lg"

                            title="Delete"

                          >

                            🗑️

                          </button>

                        </div>

                      </td>

                    </tr>

                  ))

                ) : (

                  <tr>

                    <td

                      colSpan="14"

                      className="text-center p-10 text-gray-500 text-lg"

                    >

                      No Leads Found

                    </td>

                  </tr>

                )}

              </tbody>

            </table>

          )}

        </div>

      </div>



      {/* ADD / EDIT MODAL */}

      {showAddModal && (

        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">

          <div className="bg-white w-full h-full sm:h-auto sm:max-w-3xl rounded-none sm:rounded-3xl p-4 sm:p-8 shadow-2xl overflow-y-auto">

            <div className="flex justify-between items-center mb-6">

              <h2 className="text-3xl font-bold text-blue-700">

                {editLeadId ? "Edit Solar Lead" : "Add Solar Lead"}

              </h2>



              <button

                onClick={() => {

                  setShowAddModal(false);

                  resetLeadForm();

                }}

                className="text-2xl font-bold text-red-500"

              >

                ✕

              </button>

            </div>



            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>

                <label className="font-semibold text-gray-700">

                  Lead Type

                </label>



                <select

                  name="lead_type"

                  value={newLead.lead_type}

                  onChange={handleChange}

                  className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                >

                  <option value="New Lead">New Lead</option>

                  <option value="Old Lead">Old Lead</option>

                </select>

              </div>



              <div>

                <label className="font-semibold text-gray-700">

                  Company Name

                </label>



                <input

                  type="text"

                  name="company_name"

                  value={newLead.company_name}

                  onChange={handleChange}

                  className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  placeholder="Enter company name"

                />

              </div>



              <div>

                <label className="font-semibold text-gray-700">

                  Address

                </label>



                <input

                  type="text"

                  name="address"

                  value={newLead.address}

                  onChange={handleChange}

                  className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  placeholder="Enter address"

                />

              </div>



              <div>

                <label className="font-semibold text-gray-700">

                  Decision Maker

                </label>



                <input

                  type="text"

                  name="decision_maker"

                  value={newLead.decision_maker}

                  onChange={handleChange}

                  className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  placeholder="Decision maker name"

                />

              </div>



              <div>

                <label className="font-semibold text-gray-700">

                  Contact Number

                </label>



                <input

                  type="text"

                  name="contact_no"

                  value={newLead.contact_no}

                  onChange={handleChange}

                  className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  placeholder="Enter contact number"

                />

              </div>



              <div>

                <label className="font-semibold text-gray-700">

                  Group

                </label>



                <select

                  name="group_name"

                  value={newLead.group_name}

                  onChange={handleChange}

                  className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                >

                  <option value="">Select Group</option>

                  <option value="Solar Distributors">

                    Solar Distributors

                  </option>

                  <option value="Solar Customers">Solar Customers</option>

                </select>

              </div>



              <div>

                <label className="font-semibold text-gray-700">

                  Sales Coordinator

                </label>



                <input

                  type="text"

                  name="sales_coordinator"

                  value={newLead.sales_coordinator}

                  onChange={handleChange}

                  className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  placeholder="Sales coordinator"

                />

              </div>



              <div>

                <label className="font-semibold text-gray-700">

                  Field Executive

                </label>



                <input

                  type="text"

                  name="field_executive"

                  value={newLead.field_executive}

                  onChange={handleChange}

                  className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  placeholder="Field executive"

                />

              </div>

            </div>



            <div className="flex justify-end gap-4 mt-8">

              <button

                onClick={() => {

                  setShowAddModal(false);

                  resetLeadForm();

                }}

                className="bg-gray-300 hover:bg-gray-400 px-6 py-3 rounded-xl font-semibold"

              >

                Cancel

              </button>



              <button

                onClick={async () => {

                  try {

                    const url = editLeadId

                      ? `${API_BASE}update_solar_lead.php`

                      : `${API_BASE}add_solar_lead.php`;



                    const payload = editLeadId

                      ? {

                          id: editLeadId,

                          ...newLead,

                        }

                      : newLead;



                    const response = await apiFetch(url, {

                      method: "POST",

                      headers: {

                        "Content-Type": "application/json",

                      },

                      body: JSON.stringify(payload),

                    });



                    const result = await response.json();



                    console.log(result);



                    if (result.success) {

                      if (editLeadId) {

                        setLeads((prev) =>

                          prev.map((lead) =>

                            String(lead.id) === String(editLeadId)

                              ? {

                                  ...lead,

                                  ...newLead,

                                }

                              : lead

                          )

                        );



                        alert("Lead Updated Successfully");

                      } else {

                        setLeads((prev) => [

                          ...prev,

                          {

                            ...newLead,

                            id: result.id,

                          },

                        ]);



                        alert("Lead Added Successfully");

                      }



                      resetLeadForm();

                      setShowAddModal(false);

                    } else {

                      alert(

                        editLeadId

                          ? "Failed to update lead"

                          : "Failed to add lead"

                      );

                    }

                  } catch (error) {

                    console.log(error);

                    alert("Server Error");

                  }

                }}

                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold"

              >

                {editLeadId ? "Update Lead" : "Save Lead"}

              </button>

            </div>

          </div>

        </div>

      )}



      {/* NOTES MODAL */}

      {showNotesModal && (

        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">

          <div className="bg-white w-full h-full sm:h-auto sm:max-w-3xl rounded-none sm:rounded-3xl shadow-2xl p-4 sm:p-6 overflow-y-auto">

            <div className="flex justify-between items-center mb-6">

              <div>

                <h2 className="text-3xl font-bold text-blue-700">

                  Lead Notes

                </h2>



                <p className="text-gray-500 mt-1">

                  {selectedLead?.company_name}

                </p>

              </div>



              <button

                onClick={() => setShowNotesModal(false)}

                className="text-red-500 text-3xl font-bold"

              >

                ×

              </button>

            </div>



            <div className="bg-gray-100 rounded-2xl p-4 mb-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

                <div>

                  <label className="font-semibold text-gray-700">

                    Note Date

                  </label>



                  <input

                    type="date"

                    value={noteDate}

                    onChange={(e) => setNoteDate(e.target.value)}

                    className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  />

                </div>



                <div>

                  <label className="font-semibold text-gray-700">

                    Follow Up Date

                  </label>



                  <input

                    type="date"

                    value={followupDate}

                    onChange={(e) => setFollowupDate(e.target.value)}

                    className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  />

                </div>



                <div>

                  <label className="font-semibold text-gray-700">

                    Follow Up Time

                  </label>



                  <input

                    type="time"

                    value={followupTime}

                    onChange={(e) => setFollowupTime(e.target.value)}

                    className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  />

                </div>



                <div>

                  <label className="font-semibold text-gray-700">

                    Added By

                  </label>



                  <input

                    type="text"

                    value={addedBy}

                    onChange={(e) => setAddedBy(e.target.value)}

                    placeholder="Enter staff name"

                    className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  />

                </div>



                <div>

                  <label className="font-semibold text-gray-700">

                    Call Status

                  </label>



                  <select

                    value={callStatus}

                    onChange={(e) => setCallStatus(e.target.value)}

                    className="w-full mt-2 border border-gray-300 rounded-xl px-4 py-3"

                  >

                    <option>Not Contacted</option>

                    <option>Call Back</option>

                    <option>Interested</option>

                    <option>Not Interested</option>

                    <option>Do Not Call</option>

                    <option>Busy</option>

                    <option>Switched Off</option>

                    <option>Wrong Number</option>

                    <option>Meeting Scheduled</option>

                    <option>Quotation Sent</option>

                    <option>Converted</option>

                  </select>

                </div>

              </div>



              <textarea

                rows="4"

                value={newNote}

                onChange={(e) => setNewNote(e.target.value)}

                placeholder="Enter note..."

                className="w-full border border-gray-300 rounded-xl p-4 outline-none"

              />



              <button

                onClick={addNote}

                className="mt-4 bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-xl font-semibold"

              >

                Add Note

              </button>

            </div>



            <div className="space-y-4">

              {notes.length > 0 ? (

                notes.map((item) => (

                  <div

                    key={item.id}

                    className="bg-[#eef4ff] border border-blue-100 rounded-2xl p-5"

                  >

                    <div className="flex flex-wrap justify-between items-center mb-3 gap-3">

                      <div className="flex flex-wrap gap-2">

                        <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full">

                          📝 Note Date: {item.note_date}

                        </span>



                        <span className="text-sm bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">

                          📅 Follow Up: {item.followup_date || "-"}

                        </span>



                        <span className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full">

                          ⏰ {formatTime(item.followup_time)}

                        </span>



                        <span className="text-sm bg-red-100 text-red-700 px-3 py-1 rounded-full">

                          📞 {item.call_status || "Not Updated"}

                        </span>



                        <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full">

                          👤 {item.added_by}

                        </span>

                      </div>

                    </div>



                    <div className="flex justify-between items-start gap-4">

                      <p className="text-gray-800 whitespace-pre-wrap flex-1">

                        {item.note}

                      </p>



                      <button

                        onClick={() => deleteNote(item.id)}

                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm"

                      >

                        🗑 Delete

                      </button>

                    </div>

                  </div>

                ))

              ) : (

                <div className="text-center text-gray-500 py-10">

                  No Notes Added

                </div>

              )}

            </div>

          </div>

        </div>

      )}

    </div>

  );

};



export default SolarNewLeads;
