// src/components/GroupSummaryTable.jsx
import React, { useMemo } from "react";

const GroupSummaryTable = ({ groupedData, selectedGroup }) => {
  const categories = ["Below 0.0", "0.00 - 0.10", "0.10 - 1.00", "Above 1.0"];
  const colorMap = {
    "Below 0.0": "#e41a1c",
    "0.00 - 0.10": "#377eb8",
    "0.10 - 1.00": "#4daf4a",
    "Above 1.0": "#984ea3"

  };

  // Compute rows for each group
  const rows = useMemo(() => {
    const data = [];

    Object.entries(groupedData).forEach(([groupName, parties]) => {
      if (selectedGroup !== "All" && groupName !== selectedGroup) return;

      const row = { group: groupName, total: 0 };
      categories.forEach((cat) => {
        row[cat] = (parties[cat] || []).length;
        row.total += row[cat];
      });

      data.push(row);
    });

    return data;
  }, [groupedData, selectedGroup]);

  // Compute column totals
  const columnTotals = useMemo(() => {
    const totals = { total: 0 };
    categories.forEach((cat) => (totals[cat] = 0));

    rows.forEach((row) => {
      categories.forEach((cat) => {
        totals[cat] += row[cat];
      });
      totals.total += row.total;
    });

    return totals;
  }, [rows]);

  return (
    <div className="mt-6 w-full overflow-x-auto">
  <table className="min-w-[700px] table-fixed border border-gray-700 text-xs">
        <thead className="bg-gray-100">
          <tr>
            <th className="border border-gray-700 px-1 py-1 text-left">
              Group
            </th>

            {categories.map((cat) => (
              <th key={cat} className="border border-gray-700 px-1 py-1 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: colorMap[cat] }}
                  ></span>
                  {cat}
                </div>
              </th>
            ))}

            <th className="border border-gray-700 px-1 py-1 font-semibold text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td className="border border-gray-700 px-1 py-1 font-medium text-left">
                {row.group}
              </td>

              {categories.map((cat) => (
                <td key={cat} className="border border-gray-700 px-1 py-1 text-right">
                  {row[cat]}
                </td>
              ))}

              <td className="border border-gray-700 px-1 py-1 font-semibold text-right">
                {row.total}
              </td>
            </tr>
          ))}

          {/* Final row: totals */}
          <tr className="bg-gray-200 font-bold">
            <td className="border border-gray-700 px-1 py-1 text-left">
              Total
            </td>

            {categories.map((cat) => (
              <td key={cat} className="border border-gray-700 px-1 py-1 text-right">
                {columnTotals[cat]}
              </td>
            ))}

            <td className="border border-gray-700 px-1 py-1 text-right">
              {columnTotals.total}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default GroupSummaryTable;
