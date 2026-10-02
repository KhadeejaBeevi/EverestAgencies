import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { apiFetch } from "../../api/apiClient";

export default function SalesSummaryTable() {
  const [salesData, setSalesData] = useState([]);
  const [visibleRows, setVisibleRows] = useState(50);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedParent, setSelectedParent] = useState("All");
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [selectedAlphabet, setSelectedAlphabet] = useState("");
  const [sortConfig, setSortConfig] = useState([]);

  useEffect(() => {
    apiFetch("/serverphp/get_crmsales_summary.php")
      .then((res) => res.json())
      .then((data) => setSalesData(data))
      .catch((err) => console.error("Error fetching sales summary:", err));
  }, []);

  // Indian number formatting function
  const formatIndianNumber = (value) => {
    if (value === null || value === undefined || value === "") return "0.00";
    
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : Number(value);
    
    if (isNaN(num)) return "0.00";
    if (num === 0) return "0.00";
    
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

function exportToExcel(data, filename = "SalesSummary.xlsx") {
  // Format the data for Excel export
  const formattedData = data.map(row => {
    const formattedRow = {};
    
    // Text fields
    formattedRow['S.No'] = row.SNo || '';
    formattedRow['Stock Item'] = row.StockItemName || '';
    formattedRow['Parent'] = row.Parent || '';
    formattedRow['Category'] = row.Category || '';
    formattedRow['Brand'] = row._EveProdBrand || '';
    
    // Opening - numeric fields
    formattedRow['Opening Balance'] = row.OpeningBalance !== undefined && row.OpeningBalance !== null 
      ? Number(parseFloat(row.OpeningBalance.toString().replace(/,/g, '')) || 0)
      : 0;
    formattedRow['Opening Rate'] = row.OpeningRate !== undefined && row.OpeningRate !== null 
      ? Number(parseFloat(row.OpeningRate.toString().replace(/,/g, '')) || 0)
      : 0;
    formattedRow['Opening Value'] = row.OpeningValue !== undefined && row.OpeningValue !== null 
      ? Number(parseFloat(row.OpeningValue.toString().replace(/,/g, '')) || 0)
      : 0;
    
    // Monthly data - numeric fields
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
    months.forEach(month => {
      const qty = row[`${month}_BilledQty`];
      const amount = row[`${month}_Amount`];
      const rate = row[`${month}_Rate`];
      
      formattedRow[`${month} Qty`] = qty !== undefined && qty !== null 
        ? Number(parseFloat(qty.toString().replace(/,/g, '')) || 0)
        : 0;
      formattedRow[`${month} Value`] = amount !== undefined && amount !== null 
        ? Number(parseFloat(amount.toString().replace(/,/g, '')) || 0)
        : 0;
      formattedRow[`${month} Rate`] = rate !== undefined && rate !== null 
        ? Number(parseFloat(rate.toString().replace(/,/g, '')) || 0)
        : 0;
    });
    
    // Totals and other numeric fields
    formattedRow['Total Qty'] = row.TotalQty !== undefined && row.TotalQty !== null 
      ? Number(parseFloat(row.TotalQty.toString().replace(/,/g, '')) || 0)
      : 0;
    formattedRow['Total Value'] = row.TotalValue !== undefined && row.TotalValue !== null 
      ? Number(parseFloat(row.TotalValue.toString().replace(/,/g, '')) || 0)
      : 0;
    
    // Percentage - calculate if not available
const totalValue = row.TotalValue ? parseFloat(row.TotalValue.toString().replace(/,/g, '')) : 0;
formattedRow['Percentage'] = totalValue ? Number(((totalValue / 223567209.51) * 100).toFixed(3)) : 0;
    
    // Price fields
    formattedRow['Cost Price'] = row.EveCostPrice !== undefined && row.EveCostPrice !== null 
      ? Number(parseFloat(row.EveCostPrice.toString().replace(/,/g, '')) || 0)
      : 0;
    formattedRow['Sell Price'] = row.EveSellPrice !== undefined && row.EveSellPrice !== null 
      ? Number(parseFloat(row.EveSellPrice.toString().replace(/,/g, '')) || 0)
      : 0;
    
    return formattedRow;
  });

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  
  // Set column widths for better readability
  const colWidths = [
    { wch: 5 },   // S.No
    { wch: 30 },  // Stock Item
    { wch: 20 },  // Parent
    { wch: 15 },  // Category
    { wch: 15 },  // Brand
    { wch: 12 },  // Opening Balance
    { wch: 10 },  // Opening Rate
    { wch: 12 },  // Opening Value
    // Monthly columns (8 months × 3 columns each = 24 columns)
    ...Array(24).fill().map(() => ({ wch: 10 })),
    { wch: 10 },  // Total Qty
    { wch: 12 },  // Total Value
    { wch: 10 },  // Percentage
    { wch: 10 },  // Cost Price
    { wch: 10 },  // Sell Price
  ];
  
  worksheet['!cols'] = colWidths;

  // Create workbook and add worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SalesSummary");

  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  
  const blob = new Blob([excelBuffer], { 
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
  });
  
  saveAs(blob, filename);
}

  // Unique filters
  const uniqueCategories = [...new Set(salesData.map((row) => row.Category))].filter(Boolean);
  const uniqueParents = [...new Set(salesData.map((row) => row.Parent))].filter(Boolean);
  const uniqueBrands = [...new Set(salesData.map((row) => row._EveProdBrand))].filter(Boolean);

  // Filtering logic
  let filteredRows = salesData.filter((row) => {
    const nameMatch = row.StockItemName.toLowerCase().includes(searchTerm.toLowerCase());
    const categoryMatch = selectedCategory === "All" || row.Category === selectedCategory;
    const parentMatch = selectedParent === "All" || row.Parent === selectedParent;
    const brandMatch = selectedBrand === "All" || row._EveProdBrand === selectedBrand;
    const alphabetMatch =
      selectedAlphabet === "" ||
      row.StockItemName.toUpperCase().startsWith(selectedAlphabet);

    return nameMatch && categoryMatch && parentMatch && brandMatch && alphabetMatch;
  });

  // ✅ Updated months array to include November
  const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];

  // ✅ Multi-column sorting
  const sortedRows = [...filteredRows].sort((a, b) => {
    for (const { key, direction } of sortConfig) {
      let aValue, bValue;
      if (key === "Percentage") {
        const totalSales = 223567209.51; // Your total sales value
        aValue = a.TotalValue ? (parseFloat(a.TotalValue.replace(/,/g, '')) / totalSales) * 100 : 0;
        bValue = b.TotalValue ? (parseFloat(b.TotalValue.replace(/,/g, '')) / totalSales) * 100 : 0;
      } else if (key === "OpeningBalance") {
        aValue = parseFloat(a.OpeningBalance) || 0;
        bValue = parseFloat(b.OpeningBalance) || 0;
      } else if (key === "TotalValue") {
        // Handle TotalValue with Indian number formatting (remove commas)
        aValue = a.TotalValue ? parseFloat(a.TotalValue.replace(/,/g, '')) : 0;
        bValue = b.TotalValue ? parseFloat(b.TotalValue.replace(/,/g, '')) : 0;
      } else if (key === "TotalQty") {
        aValue = parseFloat(a.TotalQty) || 0;
        bValue = parseFloat(b.TotalQty) || 0;
      } else {
        aValue = a[key];
        bValue = b[key];
        
        // Handle other numeric fields
        if (typeof aValue === 'string' && aValue.includes(',')) {
          aValue = parseFloat(aValue.replace(/,/g, ''));
          bValue = parseFloat(bValue.replace(/,/g, ''));
        } else {
          aValue = parseFloat(aValue) || 0;
          bValue = parseFloat(bValue) || 0;
        }
      }

      if (aValue < bValue) return direction === "asc" ? -1 : 1;
      if (aValue > bValue) return direction === "asc" ? 1 : -1;
    }
    return 0;
  });


  const requestSort = (key) => {
    setSortConfig((prevConfig) => {
      const existingSort = prevConfig.find((s) => s.key === key);

      if (existingSort) {
        const newDirection =
          existingSort.direction === "asc"
            ? "desc"
            : existingSort.direction === "desc"
            ? null
            : "asc";

        if (!newDirection) {
          return prevConfig.filter((s) => s.key !== key);
        }

        return prevConfig.map((s) =>
          s.key === key ? { ...s, direction: newDirection } : s
        );
      } else {
        return [...prevConfig, { key, direction: "asc" }];
      }
    });
  };

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {/* Search */}
        <div>
          <label className="text-sm font-medium text-gray-700">Search Item:</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Enter stock item..."
            className="ml-2 border border-gray-300 rounded px-3 py-1 text-sm"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-sm font-medium text-gray-700">Category:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="All">All</option>
            {uniqueCategories.map((cat, idx) => (
              <option key={idx} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Parent */}
        <div>
          <label className="text-sm font-medium text-gray-700">Parent:</label>
          <select
            value={selectedParent}
            onChange={(e) => setSelectedParent(e.target.value)}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="All">All</option>
            {uniqueParents.map((parent, idx) => (
              <option key={idx} value={parent}>
                {parent}
              </option>
            ))}
          </select>
        </div>

        {/* Brand */}
        <div>
          <label className="text-sm font-medium text-gray-700">Brand:</label>
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="All">All</option>
            {uniqueBrands.map((brand, idx) => (
              <option key={idx} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </div>

        {/* Reset */}
        <button
          onClick={() => {
            setSearchTerm("");
            setSelectedCategory("All");
            setSelectedParent("All");
            setSelectedBrand("All");
            setSelectedAlphabet("");
          }}
          className="px-4 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
        >
          Reset
        </button>
      </div>

      {/* Export Button and Row Count */}
      <div className="mb-4 flex items-center gap-4">
        <button
          onClick={() => exportToExcel(filteredRows)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Export to Excel
        </button>

        {/* Row Count Card - Same size as button */}
        <div className="px-4 py-2 bg-blue-600 text-white rounded border border-blue-700">
          <div className="flex items-center justify-center gap-2 h-full">
            <span className="font-bold">{sortedRows.length}</span>
            <span className="text-sm">records</span>
          </div>
        </div>
      </div>

      {/* Alphabet Filter */}
      <div className="w-full mb-4 px-4">
        <div className="flex flex-wrap justify-center items-center gap-1 p-2 bg-red-100 border border-red-100 rounded-md">
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
            <button
              key={letter}
              className={`px-2 py-0.5 text-xs rounded border font-semibold ${
                selectedAlphabet === letter
                  ? "bg-green-600 text-white"
                  : "bg-white text-blue-700 border-blue-600 hover:bg-blue-200"
              }`}
              onClick={() => setSelectedAlphabet(letter)}
            >
              {letter}
            </button>
          ))}
          <button
            className={`px-2 py-0.5 text-xs rounded border font-semibold ${
              selectedAlphabet === ""
                ? "bg-gray-700 text-white"
                : "bg-white text-gray-700 border-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => setSelectedAlphabet("")}
          >
            All
          </button>
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <h2 className="text-xl font-bold mb-4">Monthly Sales Summary</h2>
        <table className="min-w-full border   border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-200 text-black">
              <th rowSpan="2" className="border p-2 text-black">S.No</th>
              <th rowSpan="2" className="border p-2 text-black">Stock Item</th>
              <th rowSpan="2" className="border p-2 text-black">Parent</th>
              <th rowSpan="2" className="border p-2 text-black">Category</th>
              <th rowSpan="2" className="border p-2 text-black">Brand</th>

              {/* Opening column */}
              <th colSpan="3" className="border p-2 text-center bg-red-100 text-black">
                Opening
              </th>

              {/* Months including November */}
              {months.map((month) => (
                <th key={month} colSpan="3" className="border p-2 text-center text-black">
                  {month}
                </th>
              ))}

              <th rowSpan="2" className="border p-2 bg-yellow-100 text-black cursor-pointer select-none"
                onClick={() => requestSort("TotalQty")}>
                Total Qty
                {sortConfig.find((s) => s.key === "TotalQty") && (
                  <span>
                    {sortConfig.find((s) => s.key === "TotalQty").direction === "asc" ? " 🔼" : " 🔽"}
                  </span>
                )}
              </th>
              <th rowSpan="2" className="border p-2 bg-yellow-100 text-black cursor-pointer select-none"
                onClick={() => requestSort("TotalValue")}>
                Total Value
                {sortConfig.find((s) => s.key === "TotalValue") && (
                  <span>
                    {sortConfig.find((s) => s.key === "TotalValue").direction === "asc" ? " 🔼" : " 🔽"}
                  </span>
                )}
              </th>

              <th
                rowSpan="2"
                className="border p-2 bg-green-100 cursor-pointer text-black select-none"
                onClick={() => requestSort("Percentage")}
              >
                Percentage
                {sortConfig.find((s) => s.key === "Percentage") && (
                  <span>
                    {sortConfig.find((s) => s.key === "Percentage").direction === "asc" ? " 🔼" : " 🔽"}
                  </span>
                )}
              </th>

              <th rowSpan="2" className="border p-2 bg-orange-100 text-black">Cost Price</th>
              <th rowSpan="2" className="border p-2 bg-orange-100 text-black">Sell Price</th>
            </tr>

            <tr className="bg-gray-100 text-black">
              {/* Opening subcolumns */}
              <th
                className="border p-2 cursor-pointer select-none bg-red-50 text-black"
                onClick={() => requestSort("OpeningBalance")}
              >
                Balance
                {sortConfig.find((s) => s.key === "OpeningBalance") && (
                  <span>
                    {sortConfig.find((s) => s.key === "OpeningBalance").direction === "asc" ? " 🔼" : " 🔽"}
                  </span>
                )}
              </th>
              <th className="border p-2 text-black">Rate</th>
              <th className="border p-2 text-black">Value</th>

              {/* Month subcolumns */}
              {months.map((month) => (
                <React.Fragment key={month}>
                  <th className="border p-2 text-black">Qty</th>
                  <th className="border p-2 text-black">Value</th>
                  <th className="border p-2 text-black">Rate</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRows
              .slice(0, visibleRows)
              .map((row, idx) => {
                const totalValue = row.TotalValue ? parseFloat(row.TotalValue.replace(/,/g, '')) : 0;
                const percentage = totalValue ? ((totalValue / 223567209.51) * 100).toFixed(3) : "0.00";

                return (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border p-2">{idx + 1}</td>
                    <td className="border p-2">{row.StockItemName}</td>
                    <td className="border p-2">{row.Parent}</td>
                    <td className="border p-2">{row.Category}</td>
                    <td className="border p-2">{row._EveProdBrand || "-"}</td>

                    {/* Opening data */}
                    <td className="border p-2 text-right">{formatIndianNumber(row.OpeningBalance)}</td>
                    <td className="border p-2 text-right">{formatIndianNumber(row.OpeningRate)}</td>
                    <td className="border p-2 text-right">
                      {formatIndianNumber(Math.abs(parseFloat(row.OpeningValue) || 0))}
                    </td>

                    {/* Monthly data including November */}
                    {months.map((month) => {
                      const qty = row[`${month}_BilledQty`] || "0.00";
                      const amount = row[`${month}_Amount`] || "0.00";
                      const rate = row[`${month}_Rate`] || "0.00";

                      return (
                        <React.Fragment key={month}>
                          <td className="border p-2 text-right">{formatIndianNumber(qty)}</td>
                          <td className="border p-2 text-right">{formatIndianNumber(amount)}</td>
                          <td className="border-l p-2 text-right border-r-2 border-gray-600">
                            {formatIndianNumber(rate)}
                          </td>
                        </React.Fragment>
                      );
                    })}

                    <td className="border p-2 text-right font-bold bg-yellow-50">
                      {formatIndianNumber(row.TotalQty)}
                    </td>
                    <td className="border p-2 text-right font-bold bg-yellow-50">
                      {formatIndianNumber(row.TotalValue)}
                    </td>
                    <td className="border p-2 text-right font-bold bg-green-50">
                      {percentage}%
                    </td>
                    <td className="border p-2 text-right font-bold bg-orange-50">
                      {formatIndianNumber(row.EveCostPrice)}
                    </td>
                    <td className="border p-2 text-right font-bold bg-orange-50">
                      {formatIndianNumber(row.EveSellPrice)}
                    </td>
                  </tr>
                );
              })}
          </tbody>

        </table>
      </div>

      {/* Show More */}
      {visibleRows < filteredRows.length && (
        <div className="mt-4">
          <button
            onClick={() => setVisibleRows((prev) => prev + 500)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Show More
          </button>
        </div>
      )}
    </div>
  );
}