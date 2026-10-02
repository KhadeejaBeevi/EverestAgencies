import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/apiClient";

const emptyForm = {
    PartyLedgerName: "",
    LedgerContact: "",
    LedgerMobile: "",
    LedgerPhone: "",
    EMail: "",

    Address1: "",
    Address2: "",
    Address3: "",
    Address4: "",
    Address5: "",

    PrimaryGroup: "",
    LedgerFax: "",
    MainContactNo: "",

    OwnerName: "",
    OwnerPhone: "",

    PaymentContact: "",
    PaymentContactPhone: "",

    PurchaseContact: "",
    PurchaseContactPhone: "",

    LedGroup: "",
    GSTRegistrationType: "",
    PartyGSTIN: "",

    designation: "",
    designator_name: ""
};

const LedgerEdit = ({
    open,
    party,
    onClose,
    onSaved,
    editedBy = ""
}) => {

    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    /*
    |--------------------------------------------------------------------------
    | Load ledger details
    |--------------------------------------------------------------------------
    */

    useEffect(() => {

        if (!open || !party) {
            return;
        }

        loadLedgerDetails();

    }, [open, party]);


    const loadLedgerDetails = async () => {

        try {

            setLoading(true);

            setForm({
                ...emptyForm,
                PartyLedgerName:
                    party?.PartyLedgerName || ""
            });

            console.log("=================================");
            console.log("LEDGER EDIT OPENED");
            console.log("PARTY OBJECT:", party);
            console.log(
                "PARTY NAME:",
                party?.PartyLedgerName
            );
            console.log("=================================");

            const requestBody = {
                PartyLedgerName:
                    party?.PartyLedgerName || ""
            };

            console.log(
                "REQUEST BODY:",
                requestBody
            );

            console.log(
                "BEFORE API CALL"
            );

            let response;

            try {

                /*
                |--------------------------------------------------------------------------
                | IMPORTANT:
                | apiFetch does NOT add /serverphp.
                |--------------------------------------------------------------------------
                */

            const response = await apiFetch(
    "http://localhost/everest/serverphp/get_ledger_mirror.php",
    {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(requestBody)
    }
);

                console.log(
                    "AFTER API CALL"
                );

                console.log(
                    "STATUS:",
                    response.status
                );

                console.log(
                    "STATUS TEXT:",
                    response.statusText
                );

                console.log(
                    "URL:",
                    response.url
                );

            } catch (fetchError) {

                console.error(
                    "API FETCH FAILED:",
                    fetchError
                );

                alert(
                    "API connection failed: " +
                    (
                        fetchError.message ||
                        "Unknown error"
                    )
                );

                return;
            }


            /*
            |--------------------------------------------------------------------------
            | Read raw response
            |--------------------------------------------------------------------------
            */

            const rawText =
                await response.text();

            console.log(
                "RAW PHP RESPONSE:",
                rawText
            );


            /*
            |--------------------------------------------------------------------------
            | Parse JSON
            |--------------------------------------------------------------------------
            */

            let result;

            try {

                result =
                    JSON.parse(rawText);

            } catch (jsonError) {

                console.error(
                    "INVALID JSON FROM PHP:",
                    jsonError
                );

                alert(
                    "PHP returned an invalid response. Check Console."
                );

                return;
            }


            console.log(
                "PARSED RESPONSE:",
                result
            );


            /*
            |--------------------------------------------------------------------------
            | API error
            |--------------------------------------------------------------------------
            */

            if (
                !response.ok ||
                !result.success
            ) {

                console.error(
                    "SERVER ERROR:",
                    result
                );

                alert(
                    result.message ||
                    "Unable to load party details."
                );

                return;
            }


            /*
            |--------------------------------------------------------------------------
            | Load data
            |--------------------------------------------------------------------------
            */

            const data =
                result.data || {};

            console.log(
                "LEDGER DATA:",
                data
            );


            setForm({

                PartyLedgerName:
                    data.PartyLedgerName || "",

                LedgerContact:
                    data.LedgerContact || "",

                LedgerMobile:
                    data.LedgerMobile || "",

                LedgerPhone:
                    data.LedgerPhone || "",

                EMail:
                    data.EMail || "",


                Address1:
                    data.Address1 || "",

                Address2:
                    data.Address2 || "",

                Address3:
                    data.Address3 || "",

                Address4:
                    data.Address4 || "",

                Address5:
                    data.Address5 || "",


                PrimaryGroup:
                    data.PrimaryGroup || "",

                LedgerFax:
                    data.LedgerFax || "",

                MainContactNo:
                    data.MainContactNo || "",


                OwnerName:
                    data.OwnerName || "",

                OwnerPhone:
                    data.OwnerPhone || "",


                PaymentContact:
                    data.PaymentContact || "",

                PaymentContactPhone:
                    data.PaymentContactPhone || "",


                PurchaseContact:
                    data.PurchaseContact || "",

                PurchaseContactPhone:
                    data.PurchaseContactPhone || "",


                LedGroup:
                    data.LedGroup || "",

                GSTRegistrationType:
                    data.GSTRegistrationType || "",

                PartyGSTIN:
                    data.PartyGSTIN || "",


                designation:
                    data.designation || "",

                designator_name:
                    data.designator_name || ""
            });


        } catch (error) {

            console.error(
                "LEDGER LOAD EXCEPTION:",
                error
            );

            alert(
                "Failed to load party details. Check browser console."
            );

        } finally {

            setLoading(false);

        }

    };


    /*
    |--------------------------------------------------------------------------
    | Change field
    |--------------------------------------------------------------------------
    */

    const handleChange = (
        field,
        value
    ) => {

        setForm(prev => ({
            ...prev,
            [field]: value
        }));

    };


    /*
    |--------------------------------------------------------------------------
    | Save
    |--------------------------------------------------------------------------
    */

    const handleSave = async () => {

        if (
            !String(
                form.PartyLedgerName
            ).trim()
        ) {

            alert(
                "Party Name cannot be empty."
            );

            return;
        }


        try {

            setSaving(true);


            /*
            |--------------------------------------------------------------------------
            | IMPORTANT:
            | Use the same /serverphp path here.
            |--------------------------------------------------------------------------
            */
const response = await apiFetch(
    "http://localhost/everest/serverphp/update_ledger_mirror.php",
    {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            ...form,
            edited_by: editedBy || "React User"
        })
    }
);


            const result =
                await response.json();


            console.log(
                "update_ledger_mirror response:",
                result
            );


            if (
                !response.ok ||
                !result.success
            ) {

                alert(
                    result.message ||
                    "Failed to save party details."
                );

                return;
            }


            alert(
                "Party details updated successfully."
            );


            if (onSaved) {

                onSaved(result);

            }


        } catch (error) {

            console.error(
                "Error saving ledger:",
                error
            );

            alert(
                "Failed to save party details."
            );

        } finally {

            setSaving(false);

        }

    };


    /*
    |--------------------------------------------------------------------------
    | Don't render when closed
    |--------------------------------------------------------------------------
    */

    if (!open) {
        return null;
    }


    /*
    |--------------------------------------------------------------------------
    | Form fields
    |--------------------------------------------------------------------------
    */

    const fields = [

        {
            field: "PartyLedgerName",
            label: "Party Name",
            fullWidth: true
        },

        {
            field: "LedgerContact",
            label: "Ledger Contact"
        },

        {
            field: "LedgerMobile",
            label: "Ledger Mobile"
        },

        {
            field: "LedgerPhone",
            label: "Ledger Phone"
        },

        {
            field: "EMail",
            label: "Email"
        },

        {
            field: "PrimaryGroup",
            label: "Primary Group"
        },

        {
            field: "LedGroup",
            label: "Ledger Group"
        },

        {
            field: "GSTRegistrationType",
            label: "GST Registration Type"
        },

        {
            field: "PartyGSTIN",
            label: "Party GSTIN"
        },

        {
            field: "LedgerFax",
            label: "Ledger Fax"
        },

        {
            field: "MainContactNo",
            label: "Main Contact No"
        },

        {
            field: "OwnerName",
            label: "Owner Name"
        },

        {
            field: "OwnerPhone",
            label: "Owner Phone"
        },

        {
            field: "PaymentContact",
            label: "Payment Contact"
        },

        {
            field: "PaymentContactPhone",
            label: "Payment Contact Phone"
        },

        {
            field: "PurchaseContact",
            label: "Purchase Contact"
        },

        {
            field: "PurchaseContactPhone",
            label: "Purchase Contact Phone"
        },

        {
            field: "designation",
            label: "Designation"
        },

        {
            field: "designator_name",
            label: "Designator Name"
        },

        {
            field: "Address1",
            label: "Address 1"
        },

        {
            field: "Address2",
            label: "Address 2"
        },

        {
            field: "Address3",
            label: "Address 3"
        },

        {
            field: "Address4",
            label: "Address 4"
        },

        {
            field: "Address5",
            label: "Address 5"
        }

    ];


    return (

        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 100000,

                background:
                    "rgba(0,0,0,0.50)",

                display: "flex",

                justifyContent:
                    "center",

                alignItems:
                    "flex-start",

                overflowY:
                    "auto",

                padding:
                    "70px 20px 30px",

                boxSizing:
                    "border-box"
            }}

            onMouseDown={(e) => {

                if (
                    e.target ===
                    e.currentTarget
                ) {

                    if (!saving) {
                        onClose();
                    }

                }

            }}
        >

            <div
                style={{
                    width: "100%",
                    maxWidth: "950px",

                    background: "#fff",

                    borderRadius: "10px",

                    boxShadow:
                        "0 10px 35px rgba(0,0,0,0.30)",

                    overflow: "hidden"
                }}
            >

                {/* HEADER */}

                <div
                    style={{
                        display: "flex",

                        alignItems:
                            "center",

                        justifyContent:
                            "space-between",

                        padding:
                            "16px 20px",

                        borderBottom:
                            "1px solid #ddd",

                        background:
                            "#f8f9fa"
                    }}
                >

                    <div>

                        <h3
                            style={{
                                margin: 0,

                                color:
                                    "#05693a",

                                fontSize:
                                    "20px",

                                fontWeight:
                                    "600"
                            }}
                        >
                            Edit Party Details
                        </h3>


                        {form.PartyLedgerName && (

                            <div
                                style={{
                                    marginTop:
                                        "4px",

                                    fontSize:
                                        "13px",

                                    color:
                                        "#666"
                                }}
                            >
                                {
                                    form.PartyLedgerName
                                }
                            </div>

                        )}

                    </div>


                    <button
                        type="button"

                        onClick={() => {

                            if (!saving) {
                                onClose();
                            }

                        }}

                        style={{
                            width: "34px",
                            height: "34px",

                            border: "none",

                            borderRadius:
                                "50%",

                            background:
                                "#e9ecef",

                            color:
                                "#333",

                            fontSize:
                                "22px",

                            lineHeight:
                                "30px",

                            cursor:
                                saving
                                    ? "not-allowed"
                                    : "pointer"
                        }}
                    >
                        ×
                    </button>

                </div>


                {/* LOADING */}

                {loading ? (

                    <div
                        style={{
                            padding:
                                "60px 20px",

                            textAlign:
                                "center",

                            color:
                                "#666",

                            fontSize:
                                "15px"
                        }}
                    >
                        Loading party details...
                    </div>

                ) : (

                    <>

                        {/* BODY */}

                        <div
                            style={{
                                padding:
                                    "20px",

                                display:
                                    "grid",

                                gridTemplateColumns:
                                    "repeat(2, minmax(0, 1fr))",

                                gap:
                                    "16px"
                            }}
                        >

                            {fields.map(item => (

                                <div
                                    key={
                                        item.field
                                    }

                                    style={{
                                        gridColumn:
                                            item.fullWidth
                                                ? "1 / -1"
                                                : "auto"
                                    }}
                                >

                                    <label
                                        style={{
                                            display:
                                                "block",

                                            marginBottom:
                                                "6px",

                                            fontSize:
                                                "13px",

                                            fontWeight:
                                                "600",

                                            color:
                                                "#444"
                                        }}
                                    >
                                        {
                                            item.label
                                        }
                                    </label>


                                    <input
                                        type="text"

                                        value={
                                            form[
                                                item.field
                                            ] || ""
                                        }

                                        onChange={(e) =>
                                            handleChange(
                                                item.field,
                                                e.target.value
                                            )
                                        }

                                        disabled={
                                            saving
                                        }

                                        style={{
                                            width:
                                                "100%",

                                            height:
                                                "40px",

                                            padding:
                                                "8px 10px",

                                            border:
                                                "1px solid #ccc",

                                            borderRadius:
                                                "5px",

                                            outline:
                                                "none",

                                            fontSize:
                                                "14px",

                                            boxSizing:
                                                "border-box",

                                            background:
                                                saving
                                                    ? "#f5f5f5"
                                                    : "#fff"
                                        }}
                                    />

                                </div>

                            ))}

                        </div>


                        {/* FOOTER */}

                        <div
                            style={{
                                display:
                                    "flex",

                                justifyContent:
                                    "flex-end",

                                gap:
                                    "10px",

                                padding:
                                    "15px 20px",

                                borderTop:
                                    "1px solid #ddd",

                                background:
                                    "#f8f9fa"
                            }}
                        >

                            <button
                                type="button"

                                onClick={() => {

                                    if (!saving) {
                                        onClose();
                                    }

                                }}

                                disabled={
                                    saving
                                }

                                style={{
                                    padding:
                                        "9px 20px",

                                    border:
                                        "1px solid #ccc",

                                    borderRadius:
                                        "5px",

                                    background:
                                        "#fff",

                                    color:
                                        "#444",

                                    cursor:
                                        saving
                                            ? "not-allowed"
                                            : "pointer",

                                    fontSize:
                                        "14px"
                                }}
                            >
                                Cancel
                            </button>


                            <button
                                type="button"

                                onClick={
                                    handleSave
                                }

                                disabled={
                                    saving ||
                                    loading
                                }

                                style={{
                                    padding:
                                        "9px 22px",

                                    border:
                                        "none",

                                    borderRadius:
                                        "5px",

                                    background:
                                        "#198754",

                                    color:
                                        "#fff",

                                    cursor:
                                        saving
                                            ? "not-allowed"
                                            : "pointer",

                                    fontSize:
                                        "14px",

                                    fontWeight:
                                        "600"
                                }}
                            >
                                {
                                    saving
                                        ? "Saving..."
                                        : "Save Changes"
                                }
                            </button>

                        </div>

                    </>

                )}

            </div>

        </div>
    );
};

export default LedgerEdit;

