import React, { useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import "./QuotationEntry.css";
import { apiFetch } from "../../api/apiClient";

export default function QuotationEntry() {
    const emptyRow = {
        itemName: "",
        remarks: "",
        hsn: "",
        costPrice: "",
        qty: "",
        rate: "",
        tax: "",
        discount: "",
        sPrice: "",
        saleAmount: "",
        gst: "",
        netAmount: "",
    };

    const [items, setItems] = useState(
        Array.from({ length: 15 }, () => ({ ...emptyRow }))
    );

    const firms = [
        "EVEREST AGENCIES",
        "USHA AGENCIES",
        "LIGHT & LIGHT",
    ];

    const [fromFirm, setFromFirm] = useState(firms[0]);
    const [suggestions, setSuggestions] = useState([]);
    const [activeRow, setActiveRow] = useState(null);
    const [to, setTo] = useState("");
    const [deliveryAddress, setDeliveryAddress] = useState("");

    const [ksebSuggestions, setKsebSuggestions] = useState([]);
    const [showKsebSuggestions, setShowKsebSuggestions] = useState(false);


    const handleChange = (index, field, value) => {
        const updated = [...items];
        updated[index][field] = value;

        const qty = parseFloat(updated[index].qty || 0);
        const rate = parseFloat(updated[index].rate || 0);
        const tax = parseFloat(updated[index].tax || 0);

        const amount = qty * rate;
        const gst = (amount * tax) / 100;
        const net = amount + gst;

        updated[index].saleAmount = amount.toFixed(2);
        updated[index].gst = gst.toFixed(2);
        updated[index].netAmount = net.toFixed(2);

        setItems(updated);
    };

    const total = items.reduce(
        (sum, item) => sum + parseFloat(item.netAmount || 0),
        0
    );

    const handleKeyDown = (e) => {
        const key = e.key;

        if (
            key !== "Enter" &&
            key !== "ArrowRight" &&
            key !== "ArrowLeft" &&
            key !== "ArrowUp" &&
            key !== "ArrowDown"
        ) {
            return;
        }

        e.preventDefault();

        const current = e.target;

        const allInputs = Array.from(
            document.querySelectorAll(".quotation-table tbody input")
        );

        const currentIndex = allInputs.indexOf(current);

        let nextIndex = currentIndex;

        // NEXT
        if (key === "Enter" || key === "ArrowRight") {
            nextIndex = currentIndex + 1;
        }

        // PREVIOUS
        if (key === "ArrowLeft") {
            nextIndex = currentIndex - 1;
        }

        // DOWN
        if (key === "ArrowDown") {
            nextIndex = currentIndex + 9;
        }

        // UP
        if (key === "ArrowUp") {
            nextIndex = currentIndex - 9;
        }

        if (
            nextIndex >= 0 &&
            nextIndex < allInputs.length
        ) {
            allInputs[nextIndex].focus();
            allInputs[nextIndex].select();
        }
    };
    const handleDateChange = (e) => {
        let value = e.target.value.replace(/\D/g, "");

        // AUTO FORMAT
        if (value.length >= 2) {
            value = value.slice(0, 2) + "-" + value.slice(2);
        }

        if (value.length >= 5) {
            value = value.slice(0, 5) + "-" + value.slice(5, 9);
        }

        e.target.value = value;
    };
    const fetchProducts = async (value, index) => {
        setActiveRow(index);

        if (!value) {
            setSuggestions([]);
            return;
        }

        try {
            const res = await apiFetch(
                `/serverphp/get_item.php?search=${value}`
            );

            const data = await res.json();

            setSuggestions(data);

        } catch (err) {
            console.log(err);
        }
    };
    const fetchKseb = async (value) => {

        setTo(value);

        if (!value) {
            setKsebSuggestions([]);
            return;
        }

        const res = await apiFetch(
            `/serverphp/get_kseb.php?search=${value}`
        );

        const data = await res.json();

        setKsebSuggestions(data);
        setShowKsebSuggestions(true);
    };
    return (
        <>
                    <Banner />
        <div className="quotation-page">
            <div className="quotation-layout">

                {/* MAIN CONTENT */}

                <div className="quotation-main">

                    {/* HEADER */}

                    <div className="quotation-header">

                        {/* LEFT */}

                        <div className="header-left">

                            <div className="row">
                                <label>Quotation No</label>
                                <input placeholder="Quotation Number" />
                            </div>

                            <div className="row">
                                <label>Quotation Date</label>
                                <input
                                    type="text"
                                    placeholder="DD-MM-YYYY"
                                    maxLength={10}
                                    onChange={(e) => handleDateChange(e)}
                                />
                            </div>

                            <div className="row">
                                <label>Due Date</label>
                                <input
                                    type="text"
                                    placeholder="DD-MM-YYYY"
                                    maxLength={10}
                                    onChange={(e) => handleDateChange(e)}
                                />
                            </div>

                            <div className="row">
                                <label>From</label>

                                <select
                                    value={fromFirm}
                                    onChange={(e) => setFromFirm(e.target.value)}
                                >
                                    {firms.map((firm) => (
                                        <option key={firm} value={firm}>
                                            {firm}
                                        </option>
                                    ))}
                                </select>
                            </div>

                        </div>

                        {/* RIGHT */}

                        <div className="header-right">

                            <div className="row">
                                <label>To</label>
                                <div style={{ position: "relative" }}>

                                    <input
                                        placeholder="KSEB Code"
                                        value={to}
                                        onChange={(e) => fetchKseb(e.target.value)}
                                    />

                                    {showKsebSuggestions &&
                                        ksebSuggestions.length > 0 && (

                                            <div className="suggestion-box">

                                                {ksebSuggestions.map((kseb, index) => (

                                                    <div
                                                        key={index}
                                                        className="suggestion-item"
                                                        onClick={() => {
                                                            setTo(kseb.kseb_code);

                                                            setDeliveryAddress(
                                                                kseb.address || ""
                                                            );

                                                            setKsebSuggestions([]);
                                                            setShowKsebSuggestions(false);
                                                        }}
                                                    >
                                                        <strong>{kseb.kseb_code}</strong>

                                                        <br />

                                                        <small>{kseb.address}</small>
                                                    </div>

                                                ))}

                                            </div>

                                        )}

                                </div>
                            </div>

                            <div className="row top-align">
                                <label>Delivery Address</label>

                                <textarea
                                    rows="5"
                                    value={deliveryAddress}
                                    placeholder="Customer Address"
                                    readOnly
                                />
                            </div>

                        </div>

                    </div>

                    {/* TABLE */}

                    <div className="table-wrapper">
                        <table className="quotation-table">

                            <thead>
                                <tr>
                                    <th>Sl</th>
                                    <th>Item Name</th>
                                    <th>Remarks</th>
                                    <th>HSN</th>
                                    <th>Cost Price</th>
                                    <th>Qty</th>
                                    <th>Rate</th>
                                    <th>Tax %</th>
                                    <th>Disc %</th>
                                    <th>S.Price</th>
                                    <th>Sale Amount</th>
                                    <th>GST</th>
                                    <th>Net Amount</th>

                                </tr>
                            </thead>

                            <tbody>
                                {items.map((item, index) => (
                                    <tr key={index}>

                                        <td>{index + 1}</td>
                                        <td className="item-cell">

                                            <input
                                                value={item.itemName}
                                                onKeyDown={handleKeyDown}
                                                onChange={(e) => {

                                                    handleChange(
                                                        index,
                                                        "itemName",
                                                        e.target.value
                                                    );

                                                    fetchProducts(
                                                        e.target.value,
                                                        index
                                                    );

                                                }}
                                            />

                                            {activeRow === index &&
                                                suggestions.length > 0 && (

                                                    <div className="suggestion-box">

                                                        {suggestions.map((product, i) => (

                                                            <div
                                                                key={i}
                                                                className="suggestion-item"
                                                                onClick={() => {

                                                                    handleChange(
                                                                        index,
                                                                        "itemName",
                                                                        product.name
                                                                    );

                                                                    setSuggestions([]);

                                                                }}
                                                            >
                                                                {product.name}
                                                            </div>

                                                        ))}

                                                    </div>

                                                )}

                                        </td>

                                        <td>
                                            <input
                                                value={item.remarks}
                                                onChange={(e) =>
                                                    handleChange(index, "remarks", e.target.value)
                                                }
                                            />
                                        </td>

                                        <td>
                                            <input
                                                value={item.hsn}
                                                onChange={(e) =>
                                                    handleChange(index, "hsn", e.target.value)
                                                }
                                            />
                                        </td>

                                        <td>
                                            <input
                                                value={item.costPrice}
                                                onChange={(e) =>
                                                    handleChange(index, "costPrice", e.target.value)
                                                }
                                            />
                                        </td>

                                        <td>
                                            <input
                                                value={item.qty}
                                                onChange={(e) =>
                                                    handleChange(index, "qty", e.target.value)
                                                }
                                            />
                                        </td>

                                        <td>
                                            <input
                                                value={item.rate}
                                                onChange={(e) =>
                                                    handleChange(index, "rate", e.target.value)
                                                }
                                            />
                                        </td>

                                        <td>
                                            <input
                                                value={item.tax}
                                                onChange={(e) =>
                                                    handleChange(index, "tax", e.target.value)
                                                }
                                            />
                                        </td>

                                        <td>
                                            <input
                                                value={item.discount}
                                                onChange={(e) =>
                                                    handleChange(index, "discount", e.target.value)
                                                }
                                            />
                                        </td>

                                        <td>
                                            <input
                                                value={item.sPrice}
                                                onChange={(e) =>
                                                    handleChange(index, "sPrice", e.target.value)
                                                }
                                            />
                                        </td>

                                        <td>{item.saleAmount}</td>

                                        <td>{item.gst}</td>

                                        <td>{item.netAmount}</td>



                                    </tr>
                                ))}
                            </tbody>

                        </table>
                    </div>

                    {/* FOOTER */}

                    <div className="quotation-footer">

                        <div className="footer-left">

                            <div className="row">
                                <label>Delivery</label>
                                <input />
                            </div>

                            <div className="row">
                                <label>F.O.R</label>
                                <input />
                            </div>

                            <div className="row">
                                <label>Payment</label>
                                <input />
                            </div>

                            <div className="row">
                                <label>Validity</label>
                                <input />
                            </div>
                            <div className="row">
                                <label>Prepared By</label>
                                <input />
                            </div>

                        </div>

                        <div className="footer-right">
                            <h2>Total : ₹ {total.toFixed(2)}</h2>
                        </div>

                    </div>

                </div>

                {/* SIDE PANEL */}

                <div className="side-panel">

                    <button>New</button>

                    <button>Save</button>

                    <button>Print</button>

                    <button>Add Item</button>

                    <button>Edit</button>

                    <button>Close</button>



                </div>

            </div>
        </div>
        </>
    );
}