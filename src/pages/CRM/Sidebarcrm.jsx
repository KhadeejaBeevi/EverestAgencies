import React, { useEffect, useState } from "react";
import { ResponsivePie } from "@nivo/pie";
import PieSummaryTable from "./PieSummaryTable";
import GroupSummaryTable from "./GroupSummaryTable";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "../../api/apiClient";

export default function SidebarDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [groupedData, setGroupedData] = useState([]);
  const [groupTableData, setGroupTableData] = useState({});
  const [selectedGroup, setSelectedGroup] = useState("All");

  // Fetch Pie Data
  useEffect(() => {
    apiFetch("/serverphp/grouped_pie.php")
      .then((res) => res.json())
      .then((data) => setGroupedData(data))
      .catch((err) => console.error("Pie summary fetch error:", err));
  }, []);

  // Fetch Table Data
  useEffect(() => {
    apiFetch("/serverphp/get_tablegrouped_summary.php")
      .then((res) => res.json())
      .then((data) => setGroupTableData(data))
      .catch((err) => console.error("Group summary fetch error:", err));
  }, []);

  return (
    <>
      {/* Enhanced Sidebar Panel */}
 <div className={`fixed top-0 left-0 z-[60] transition-transform duration-500 ease-in-out
                      lg:w-[950px] xl:w-[1050px] md:w-[95vw] w-[calc(100vw-32px)] h-full ${
    isOpen ? "translate-x-0" : "-translate-x-full"
  }`}
  style={{
    top: "60px",
    height: "calc(100vh - 60px)",
  }}
>
        {/* Toggle Button - attached to the panel's right edge so it always moves with it */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
          className="group absolute top-1/2 left-full -translate-y-1/2 z-50 bg-gradient-to-r from-blue-600 to-blue-700
                     hover:from-blue-700 hover:to-blue-800 text-white px-1.5 py-3 shadow-lg transition-colors duration-300
                     focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-r-md"
        >
          {isOpen ? (
            <ChevronLeft size={16} className="transition-transform duration-200 group-hover:scale-110" />
          ) : (
            <ChevronRight size={16} className="transition-transform duration-200 group-hover:scale-110" />
          )}
        </button>

        {/* Backdrop with subtle pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100"></div>
        
        {/* Main content */}
        <div className="relative h-full overflow-y-auto">


          {/* Content area with better spacing */}
          <div className="p-6 space-y-8">
            {/* Enhanced Pie Chart Container */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 hover:shadow-xl transition-shadow duration-300">
              <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                Distribution Overview
              </h3>
              <div className="w-full h-[280px] rounded-xl overflow-hidden relative z-50">
                <ResponsivePie
                  data={groupedData}
                  margin={{ top: 30, right: 30, bottom: 30, left: 30 }}
                  innerRadius={0.55}
                  padAngle={2}
                  cornerRadius={4}
                  colors={{ scheme: "set1" }}
                  arcLabelsSkipAngle={8}
                  arcLabelsTextColor="#fff"
                  arcLinkLabelsSkipAngle={8}
                  arcLinkLabelsTextColor="#374151"
                  arcLinkLabelsThickness={3}
                  arcLinkLabelsColor={{ from: "color" }}
                  enableArcLinkLabels={true}
                  arcLinkLabelsDiagonalLength={16}
                  arcLinkLabelsStraightLength={24}
                  tooltip={({ datum }) => (
                    <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded shadow border border-slate-200">
                      <div className="flex items-center space-x-1">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: datum.color }}
                        ></div>
                        <span className="text-xs font-medium text-slate-700">{datum.label}: </span>
                        <span className="text-xs font-bold text-slate-900">{datum.value}</span>
                      </div>
                    </div>
                  )}
                  isInteractive={true}
                  animate={true}
                  motionConfig="gentle"
                />
              </div>
            </div>

            {/* Enhanced Pie Summary Table */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden hover:shadow-xl transition-shadow duration-300">
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200
                             lg:px-6 lg:py-4 md:px-4 md:py-3 sm:px-3 sm:py-2 px-2 py-2">
                <h3 className="font-semibold text-slate-700 flex items-center
                              lg:text-lg md:text-base sm:text-sm text-sm">
                  <div className="bg-green-500 rounded-full lg:w-2 lg:h-2 md:w-1.5 md:h-1.5 sm:w-1 sm:h-1 w-1 h-1 
                                 lg:mr-3 md:mr-2 sm:mr-2 mr-2"></div>
                  Summary Details
                </h3>
              </div>
              <div className="lg:p-6 md:p-4 sm:p-3 p-2">
                <PieSummaryTable pieData={groupedData} />
              </div>
            </div>

            {/* Enhanced Group Summary Table */}
            {Object.keys(groupTableData).length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden hover:shadow-xl transition-shadow duration-300">
                <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200
                               lg:px-6 lg:py-4 md:px-4 md:py-3 sm:px-3 sm:py-2 px-2 py-2">
                  <h3 className="font-semibold text-slate-700 flex items-center
                                lg:text-lg md:text-base sm:text-sm text-sm">
                    <div className="bg-purple-500 rounded-full lg:w-2 lg:h-2 md:w-1.5 md:h-1.5 sm:w-1 sm:h-1 w-1 h-1 
                                   lg:mr-3 md:mr-2 sm:mr-2 mr-2"></div>
                    Group Analysis
                  </h3>
                </div>
                <div className="lg:p-6 md:p-4 sm:p-3 p-2">
                  <GroupSummaryTable
                    groupedData={groupTableData}
                    selectedGroup={selectedGroup}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Decorative right border */}
        <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-blue-500 via-purple-500 to-blue-600"></div>
      </div>

      {/* Overlay for mobile/smaller screens */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[55] md:hidden"
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
}