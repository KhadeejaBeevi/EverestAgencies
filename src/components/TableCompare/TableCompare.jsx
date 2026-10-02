import React, { useState } from "react";
import Banner from "../Banner/Banner.jsx";
import * as XLSX from "xlsx";
import "./TableCompare.css";
import { CompareTables } from "./CompareTables";





const TableCompare = () => {
    const [table1, setTable1] = useState([]);
    const [table2, setTable2] = useState([]);

    const [headers1, setHeaders1] = useState([]);
    const [headers2, setHeaders2] = useState([]);

    const [differences, setDifferences] = useState({});

    const readFile = (file, tableSetter, headerSetter) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            let data = e.target.result;

            let workbook;

            // Read CSV as text, Excel as binary
            if (file.name.toLowerCase().endsWith(".csv")) {
                const delimiter = data.includes(";") ? ";" : ",";

                workbook = XLSX.read(data, {
                    type: "string",
                    raw: false,
                    FS: delimiter
                });
                
            } else {
                workbook = XLSX.read(data, {
                    type: "binary"
                });
            }

            const sheet = workbook.Sheets[workbook.SheetNames[0]];

            const json = XLSX.utils.sheet_to_json(sheet, {
                defval: ""
            });

            // Normalize column names
            const normalized = json.map(row => {
                const obj = {};

                Object.keys(row).forEach(key => {
                    const cleanKey = key
                        .replace(/`/g, "")
                        .replace(/"/g, "")
                        .trim();

                    obj[cleanKey] = row[key];
                });

                return obj;
            });

            if (normalized.length > 0) {
                headerSetter(Object.keys(normalized[0]));
            }

            tableSetter(normalized);
        };

        if (file.name.toLowerCase().endsWith(".csv"))
            reader.readAsText(file);
        else
            reader.readAsBinaryString(file);
    };
    const handleCompare = () => {

        if (table1.length === 0 || table2.length === 0) {
            alert("Please upload both files.");
            return;
        }

       const report = CompareTables(
    table1,
    table2,
    "StockItemName",
    "StockItem.$Name"
);
        console.log(report);
        console.log(report.changedCells[0]);

        const grouped = {};

        report.changedCells.forEach(item => {

            if (!grouped[item.ledgerName]) {

                grouped[item.ledgerName] = {
                    table1: {},
                    table2: {}
                };

            }

            grouped[item.ledgerName].table1[item.field] = item.table1;
            grouped[item.ledgerName].table2[item.field] = item.table2;

        });

        setDifferences(grouped);

    };
    const allFields = [
        ...new Set(
            Object.values(differences).flatMap(d =>
                Object.keys(d.table1)
            )
        )
    ];
    const downloadExcel = () => {
        if (Object.keys(differences).length === 0) {
            alert("No comparison data to export.");
            return;
        }

        const exportData = [];

        Object.entries(differences).forEach(([ledger, data]) => {
            // Table 1 Row
            const row1 = {
                Type: "Table 1",
                "Ledger Name": ledger,
            };

            allFields.forEach(field => {
                row1[field] = data.table1[field] || "";
            });

            exportData.push(row1);

            // Table 2 Row
            const row2 = {
                Type: "Table 2",
                "Ledger Name": ledger,
            };

            allFields.forEach(field => {
                row2[field] = data.table2[field] || "";
            });

            exportData.push(row2);

            // Blank row for separation
            exportData.push({});
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Differences");

        XLSX.writeFile(workbook, "Table_Comparison_Report.xlsx");
    };

    return (
        <>
                    <Banner />
        <div className="container">

            <h2>SQL Table Comparison Tool</h2>

            <div className="upload-section">

                <div>
                    <h4>Upload Table 1</h4>

                    <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) =>
                            readFile(
                                e.target.files[0],
                                setTable1,
                                setHeaders1
                            )
                        }
                    />
                </div>

                <div>
                    <h4>Upload Table 2</h4>

                    <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) =>
                            readFile(
                                e.target.files[0],
                                setTable2,
                                setHeaders2
                            )
                        }
                    />
                </div>

            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button
                    className="compare-btn"
                    onClick={handleCompare}
                >
                    Compare Tables
                </button>

                <button
                    className="download-btn"
                    onClick={downloadExcel}
                >
                    Download Excel
                </button>
            </div>

            <hr />

            <h3>Total Differences : {Object.keys(differences).length}</h3>
            <div className="table-container"></div>
            <table>

                <thead>

                    <tr>
                        <th>Type</th>
                        <th>Ledger Name</th>

                        {allFields.map(field => (
                            <th key={field}>{field}</th>
                        ))}

                    </tr>

                </thead>

                <tbody>

                    {Object.entries(differences).map(([ledger, data]) => (

                        <React.Fragment key={ledger}>

                            <tr>

                                <td><b>Table 1</b></td>

                                <td>{ledger}</td>

                                {allFields.map(field => (

                                    <td
                                        key={field}
                                        style={{
                                            backgroundColor:
                                                data.table1[field] !== data.table2[field]
                                                    ? "#ffd6d6"
                                                    : "white"
                                        }}
                                    >
                                        {data.table1[field] || ""}
                                    </td>

                                ))}

                            </tr>

                            <tr>

                                <td><b>Table 2</b></td>

                                <td>{ledger}</td>

                                {allFields.map(field => (

                                    <td
                                        key={field}
                                        style={{
                                            backgroundColor:
                                                data.table1[field] !== data.table2[field]
                                                    ? "#d6ffd6"
                                                    : "white"
                                        }}
                                    >
                                        {data.table2[field] || ""}
                                    </td>

                                ))}

                            </tr>

                            <tr>
                                <td
                                    colSpan={allFields.length + 2}
                                    style={{
                                        background: "#f5f5f5",
                                        height: "10px"
                                    }}
                                />
                            </tr>

                        </React.Fragment>

                    ))}

                </tbody>

            </table>

        </div>
        </>
    );
};

export default TableCompare;