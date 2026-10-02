import { useLocation, useParams, useNavigate } from "react-router-dom";
import Banner from "../../components/Banner/Banner.jsx";
import { useState, useEffect } from "react";
import "./CallEntry.css";
import { auth, db } from "../../components/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { apiFetch } from "../../api/apiClient";




export default function CallEntry() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [fetchedData, setFetchedData] = useState(null);
  const [previousRemarks, setPreviousRemarks] = useState([]);

  const [form, setForm] = useState({
    call_date: "",
    telecaller_name: "",
    status: "",
    phone: "",
    remarks: "",
    followup_date: "",
    executive_name: "",

    quotation_no: "",
    quotation_date: "",
    quotation_amount: "",
    item_details: "",

    po_no: "",
    po_date: "",

    lost_reason: "",

    contact_person: "",
    contact_designation: "",
  });

  // ✅ fallback fetch
  useEffect(() => {
    if (!location.state) {
      apiFetch(`/serverphp/get_kseb_by_id.php?id=${id}`)
        .then((res) => res.json())
        .then((res) => {
          if (res.status === "success") {
            setFetchedData(res.data);
          }
        });
    }
  }, [id, location.state]);

  // ✅ final data source
  const finalData = location.state || fetchedData;
  const handleCancel = () => {
    navigate(-1); // goes back
  };
  useEffect(() => {
    if (finalData) {
      setForm((prev) => ({
        ...prev,
        executive_name:
          finalData.SALES_EXECUTIVE ||
          finalData.executive_name ||
          ""
      }));
    }
  }, [finalData]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "Users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();

          setForm((prev) => ({
            ...prev,
            telecaller_name: `${userData.firstName || ""} ${userData.lastName || ""}`.trim()
            // ✅ YOUR USER NAME
          }));
        }
      }
    });

    return () => unsubscribe();
  }, []);


  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = () => {
    // 🔥 REQUIRED FIELDS CHECK
    if (
      !form.call_date ||
      !form.status ||
      !form.phone ||
      !form.remarks ||
      !form.followup_date
    ) {
      alert("Please fill all mandatory fields");
      return;
    }

    apiFetch("/serverphp/save_call.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...form, kseb_id: id }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("Server Response:", data);

        if (data.status === "success") {
          alert("Saved successfully");

          setForm({
            call_date: "",
            telecaller_name: form.telecaller_name,
            status: "",
            phone: "",
            remarks: "",
            followup_date: "",
            executive_name: form.executive_name,

            quotation_no: "",
            quotation_date: "",
            quotation_amount: "",
            item_details: "",

            po_no: "",
            po_date: "",

            lost_reason: "",

            contact_person: "",
            contact_designation: "",
          });

          navigate("/ksebdirectory");
        } else {
          alert("Save failed: " + (data.message || "Unknown error"));
        }
      })
      .catch((err) => {
        console.error("Error:", err);
      });
  };


  // ⛔ wait for data
  if (!finalData) {
    return <p>Loading...</p>;
  }
  useEffect(() => {
    if (!finalData?.PLACE || !finalData?.AREA) return;

    apiFetch("/serverphp/get_all_calls.php")
      .then((res) => res.json())
      .then((res) => {
        if (res.status === "success") {

          // ✅ FILTER SAME PLACE + AREA
          const filtered = (res.data || []).filter(
            (item) =>
              item.PLACE === finalData.PLACE &&
              item.AREA === finalData.AREA
          );

          setPreviousRemarks(filtered);
        }
      })
      .catch((err) => {
        console.error("Remarks Fetch Error:", err);
      });

  }, [finalData]);
  return (
    <>
          <Banner />

      <div className="call-container">

      <div className="call-header">
        <h2>{finalData.PLACE}</h2>
        <p><strong>Area:</strong> {finalData.AREA}</p>
        <p><strong>Region:</strong> {finalData.PARENT_AREA}</p>
        <p><strong>Phone:</strong> {finalData.RECEIPTION_CUG}</p>
        <p><strong>Name:</strong>{finalData.NAME}</p>
        <p><strong>Email:</strong> {finalData.MAIL_ID}</p>
      </div>

      <h2 className="call-title">
        CALL UPDATE
      </h2>

      <div className="call-form">

        <div className="form-group">
          <label>Call Date</label>
          <input type="date" name="call_date" onChange={handleChange} />
        </div>

        <div className="form-group">
          <label>Telecaller</label>
          <input
            type="text"
            name="telecaller_name"
            value={form.telecaller_name}
            readOnly
          />


        </div>

        <div className="form-group">
          <label>Status</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
          >
            <option value="">Select Stage</option>

            <option>New Enquiry</option>
            <option>Rate Enquiry</option>
            <option>Interested</option>

            <option>Quotation Requested</option>
            <option>Quotation Sent</option>
            <option>Quotation Notice</option>

            <option>FollowUp</option>
            <option>Negotiation</option>

            <option>PO Received</option>

            <option>Lost</option>
            <option>Closed</option>

            <option>No Purchase Authority</option>

            <option>Not Interested</option>
            <option>No Requirements</option>
            <option>No Response</option>
            <option>Call Back</option>
            <option>Do not call</option>
          </select>
          {form.status === "Quotation Sent" && (
            <>
              <div className="form-group">
                <label>Quotation No</label>
                <input
                  type="text"
                  name="quotation_no"
                  value={form.quotation_no}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>Quotation Date</label>
                <input
                  type="date"
                  name="quotation_date"
                  value={form.quotation_date}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>Quotation Amount</label>
                <input
                  type="number"
                  name="quotation_amount"
                  value={form.quotation_amount}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group full-width">
                <label>Item Details</label>

                <textarea
                  name="item_details"
                  value={form.item_details}
                  onChange={handleChange}
                  rows="4"
                  placeholder="Example:

100W LED Flood Light - 25 Nos
Street Light Timer - 10 Nos
Cable 2.5 sqmm - 500 Mtrs"
                />
              </div>
            </>
          )}
          {form.status === "PO Received" && (
            <>
              <div className="form-group">
                <label>PO Number</label>
                <input
                  type="text"
                  name="po_no"
                  value={form.po_no}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>PO Date</label>
                <input
                  type="date"
                  name="po_date"
                  value={form.po_date}
                  onChange={handleChange}
                />
              </div>
            </>
          )}
          {form.status === "Lost" && (
            <div className="form-group">
              <label>Lost Reason</label>

              <select
                name="lost_reason"
                value={form.lost_reason}
                onChange={handleChange}
              >
                <option value="">Select Reason</option>
                <option>Price High</option>
                <option>Competitor Won</option>
                <option>Budget Not Approved</option>
                <option>Requirement Cancelled</option>
                <option>No Response</option>
                <option>Other</option>
              </select>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input
            type="text"
            name="phone"
            value={form.phone}
            onChange={handleChange}   // ✅ important
            placeholder="Enter phone number"
          />
        </div>
        <div className="form-group">
          <label>Contact Person</label>
          <input
            type="text"
            name="contact_person"
            value={form.contact_person}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Designation</label>
          <input
            type="text"
            name="contact_designation"
            value={form.contact_designation}
            onChange={handleChange}
          />
        </div>

        <div className="form-group full-width">
          <label>Previous Remarks</label>

          <div className="remarks-history">
            {previousRemarks.length > 0 ? (
              previousRemarks.map((item, index) => (
                <div key={index} className="remark-item">
                  <div className="remark-header">
                    <strong>{item.call_date}</strong> | {item.telecaller_name}
                  </div>

                  <div className="remark-status">
                    Status: {item.status}
                  </div>

                  <div className="remark-text">
                    {item.remarks}
                  </div>
                  <div className="remark-phone">
                    Phone:{item.phone}
                  </div>

                </div>
              ))
            ) : (
              <p>No previous remarks</p>
            )}
          </div>

          <label style={{ marginTop: "15px", display: "block" }}>
            Add New Remark
          </label>

          <textarea
            name="remarks"
            value={form.remarks}
            onChange={handleChange}
            placeholder="Enter new remark..."
          ></textarea>
        </div>

        <div className="form-group">
          <label>Follow-up Date</label>
          <input
            type="date"
            name="followup_date"
            value={form.followup_date}
            onChange={handleChange}
          />

        </div>

        <div className="form-group">
          <label>Sales Executive</label>
          <input
            type="text"
            name="executive_name"
            value={form.executive_name}
            readOnly
          />

        </div>

      </div>
      <div className="button-group">
        <button className="save-btn" onClick={handleSubmit}>
          Save
        </button>

        <button className="cancel-btn" onClick={handleCancel}>
          Cancel
        </button>
      </div>

    </div>
    </>
  );
}
