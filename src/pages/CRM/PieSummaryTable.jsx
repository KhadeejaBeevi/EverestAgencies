import React, { useMemo } from "react";

const PieSummaryTable = ({ pieData }) => {
  const categories = ["Below 0.0", "0.00 - 0.10", "0.10 - 1.00", "Above 1.0"];

  const colorMap = {
    "Below 0.0": "#e41a1c",
    "0.00 - 0.10": "#377eb8",
    "0.10 - 1.00": "#4daf4a",
    "Above 1.0": "#984ea3"
  };

  // ✅ Safe check: ensure pieData is an array
  const validData = Array.isArray(pieData) ? pieData : [];

  const totalValue = useMemo(() => {
    return validData.reduce((sum, d) => sum + d.value, 0);
  }, [validData]);

  return (
    <div className="mt-4 overflow-x-auto">
  <table className="table-auto border border-gray-700 text-xs w-auto">
        <thead className="bg-gray-100">
          <tr>
            {categories.map((cat) => (
              <th
                key={cat}
                className="border border-gray-700 px-4 py-2 font-bold text-white-700 text-center"
              >
                {cat}
              </th>
            ))}
            <th className="border border-gray-700 px-4 py-2 font-bold text-white-700 text-center">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Row 1: Color indicators */}
          <tr>
            {categories.map((cat) => (
              <td key={cat} className="border border-gray-700 px-4 py-2 text-center">
                <div
                  className="w-4 h-4 mx-auto rounded-full"
                  style={{ backgroundColor: colorMap[cat] }}
                />
              </td>
            ))}
            <td className="border border-white-700 px-4 py-2 text-center">—</td>
          </tr>

          {/* Row 2: Count */}
          <tr>
            {categories.map((cat) => {
              const item = validData.find((d) => d.id === cat);
              return (
                <td key={cat} className="border border-white-700 px-4 py-2 text-right">
                  {item ? item.value : 0}
                </td>
              );
            })}
            <td className="border border-white-700 px-4 py-2 font-semibold text-right">
              {totalValue}
            </td>
          </tr>

          {/* Row 3: Percentage */}
          <tr>
            {categories.map((cat) => {
              const item = validData.find((d) => d.id === cat);
              const percent = item ? ((item.value / totalValue) * 100).toFixed(1) : "0.0";
              return (
                <td key={cat} className="border border-white-700 px-4 py-2 text-right">
                  {percent}%
                </td>
              );
            })}
            <td className="border border-white-700 px-4 py-2 font-semibold text-right">
              100%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default PieSummaryTable;
