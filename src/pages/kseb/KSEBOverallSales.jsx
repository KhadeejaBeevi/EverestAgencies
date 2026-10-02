import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { ResponsiveBar } from "@nivo/bar";
import { apiFetch } from "../../api/apiClient";
import { useNavigate } from "react-router-dom";

/*
  KSEB OVERALL SALES — STEP 1

  Flow:

  1. Overall Monthly 
  2. Distribution Sales


     - South
     - North
     - Central
     - Transmission
  3. Location-wise Sales

  Clicking a distribution in the pie/donut chart filters
  the location-wise graph.

  KSEB Directory mapping:
  tally_name -> invoice / ledger tally name

  IMPORTANT:
  React should NOT connect directly to tally_db.
  The PHP API should perform the database JOIN and return
  the directory information along with each invoice.
*/

const API_URL =
  "/serverphp/kseb_payment.php";


/* =========================================================
   DATE
========================================================= */

function parseDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  const match = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/
  );

  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


/* =========================================================
   CURRENCY
========================================================= */

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}


function formatCompact(value) {
  const amount = Number(value || 0);

  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(1)} Cr`;
  }

  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)} L`;
  }

  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)} K`;
  }

  return `₹${Math.round(amount)}`;
}


/* =========================================================
   FINANCIAL YEAR
========================================================= */

function getFinancialYear(date) {
  if (!date) return null;

  const year = date.getFullYear();
  const month = date.getMonth();

  /*
    April = financial year starting month

    Apr 2025 -> FY 2025-26
    Mar 2026 -> FY 2025-26
  */

  return month >= 3
    ? year
    : year - 1;
}


/* =========================================================
   SAFE FIELD READER
========================================================= */

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }

  return "";
}


/* =========================================================
   TALLY NAME
========================================================= */

function normalizeTallyName(row) {
  /*
   * Display the actual Tally Party Ledger Name from salesdata.
   *
   * kseb_directory.tally_name may contain multiple comma-separated
   * ledger names for mapping, so it should NOT be displayed here.
   */
  return firstValue(row, [
    "party_ledger_name",
    "partyLedgerName",
    "party_name",
    "partyName",

    "tally_name",
    "tallyName",
    "mapped_tally_name",
    "mappedTallyName",

    "party_tally_name",
    "partyTallyName",

    "ledger_name",
    "ledgerName",
  ]);
}


/* =========================================================
   DISTRIBUTION TYPE

   Expected:

   South
   North
   Central
   Transmission
========================================================= */

function normalizeDistributionType(row) {
  const raw = firstValue(row, [
    "distribution_type", "distributionType",
    "parent_area", "parentArea",
    "kseb_parent_area", "ksebParentArea",
    "distribution", "zone_type", "zoneType",
    "region_type", "regionType",
  ]);
  return raw || "Unmapped";
}


/* =========================================================
   LOCATION

   This can be changed depending on your KSEB directory.

   For example:

   distribution_name
   circle_name
   division_name

   The first available value is used.
========================================================= */

function normalizeDistributionName(row) {
  return (
    firstValue(row, [
      "distribution_name", "distributionName",
      "place", "PLACE",
      "kseb_place", "ksebPlace",
      "directory_area", "area", "AREA",
      "distribution", "circle", "circle_name", "circleName",
      "division", "division_name", "divisionName",
      "kseb_directory_name",
    ]) || "Unmapped"
  );
}

function normalizeArea(row) {
  return firstValue(row, [
    "directory_area", "area", "AREA",
    "kseb_area", "ksebArea",
  ]);
}

function normalizeHierarchyLevel(value) {
  const text = String(value || "").trim().toUpperCase();

  if (text === "SECTION") return "section";
  if (text === "SUB DIVISION" || text === "SUBDIVISION" || text === "SUB-DIVISION") return "subDivision";
  if (text === "SUB STATION" || text === "SUBSTATION" || text === "SUB-STATION") return "subStation";
  if (text === "DIVISION") return "division";
  if (text === "CIRCLE") return "circle";

  return "";
}

function hierarchyLabel(level) {
  if (level === "section") return "Section";
  if (level === "subDivision") return "Sub Division";
  if (level === "division") return "Division";
  if (level === "circle") return "Circle";
  if (level === "subStation") return "Sub Station";
  return "";
}

/*
   KSEB ledger prefix is the most reliable indicator of the ledger
   hierarchy for the sales graph/table.  Some kseb_directory rows can
   have AREA values that do not match the ledger prefix.

   KSEB-ES  -> Section
   KSEB-ESD -> Sub Division
   KSEB-ED  -> Division
   KSEB-EC  -> Circle

   Check ESD before ES because ESD also starts with ES.
*/
function hierarchyLevelFromTallyName(value) {
  const text = String(value || "").trim().toUpperCase();

  // Transmission Sub Station ledgers do not use the EC/ED/ES/ESD prefix.
  // They are identified by the ledger name itself, e.g.
  // KSEB-Substation Thrikodithanam C/o Libin.
  if (/\bKSEB[-\s]?(?:SUB[-\s]?STATION|SUBSTATION)\b/.test(text)) return "subStation";

  // Transmission hierarchy names. Check these before generic matching.
  if (/\bKSEB[-\s]?TRANSMISSION[-\s]+SUB[-\s]?DIVISION\b/.test(text)) return "subDivision";
  if (/\bKSEB[-\s]?TRANSMISSION[-\s]+DIVISION\b/.test(text)) return "division";

  if (/\bKSEB[-\s]?ESD[-\s]?/.test(text)) return "subDivision";
  if (/\bKSEB[-\s]?ES[-\s]?/.test(text)) return "section";
  if (/\bKSEB[-\s]?ED[-\s]?/.test(text)) return "division";
  if (/\bKSEB[-\s]?EC[-\s]?/.test(text)) return "circle";

  return "";
}

function extractSubStationNameFromTallyName(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  return text
    .replace(/^KSEB[-\s]?(?:SUB[-\s]?STATION|SUBSTATION)[-\s:]*/i, "")
    .replace(/\s+C\/O\s+.*$/i, "")
    .replace(/\s+CO\s+.*$/i, "")
    .replace(/^[-:–—\s]+|[-:–—\s]+$/g, "")
    .trim();
}

function parseKsebArea(raw) {
  const text = String(raw || "").trim();

  if (!text) {
    return {
      circle: "",
      division: "",
      subDivision: "",
      section: "",
    };
  }

  const parts = text
    .split(/\s*(?:>|→|\||\/|;|\n|,)\s*/u)
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length >= 4) {
    return {
      circle: parts[0],
      division: parts[1],
      subDivision: parts[2],
      section: parts[3],
    };
  }

  return {
    circle: text.match(/(.+?\bCircle\b)/i)?.[1]?.trim() || "",
    division: text.match(/(.+?\bDivision\b)/i)?.[1]?.trim() || "",
    subDivision: text.match(/(.+?\bSub[ -]?Division\b)/i)?.[1]?.trim() || "",
    section: text.match(/(.+?\bSection\b)/i)?.[1]?.trim() || "",
  };
}

function getKsebHierarchy(row) {
  const rawArea = firstValue(row, [
    "directory_area", "area", "AREA",
    "kseb_area", "ksebArea",
  ]);

  const parsed = parseKsebArea(rawArea);

  const apiLevel = normalizeHierarchyLevel(
    firstValue(row, [
      "hierarchy_level",
      "hierarchyLevel",
      "area_level",
      "areaLevel",
      "directory_area",
      "area",
      "AREA",
      "kseb_area",
      "ksebArea",
    ])
  );

  // Prefer the KSEB ledger prefix when it explicitly identifies the
  // hierarchy. This fixes cases such as KSEB-ESD-* being returned as
  // DIVISION in the directory data.
  const tallyLevel = hierarchyLevelFromTallyName(
    normalizeTallyName(row)
  );

  const level = tallyLevel || apiLevel;

  const hierarchyName = firstValue(row, [
    "hierarchy_name",
    "hierarchyName",
    "distribution_name",
    "distributionName",
    "place",
    "PLACE",
    "kseb_place",
    "ksebPlace",
  ]) || (
    tallyLevel === "subStation"
      ? extractSubStationNameFromTallyName(normalizeTallyName(row))
      : ""
  );

  const circle = firstValue(row, [
    "circle", "circle_name", "circleName",
    "kseb_circle", "ksebCircle",
  ]) || parsed.circle;

  const division = firstValue(row, [
    "division", "division_name", "divisionName",
    "kseb_division", "ksebDivision",
  ]) || parsed.division;

  const subDivision = firstValue(row, [
    "subdivision",
    "sub_division", "subDivision",
    "sub_division_name", "subDivisionName",
    "kseb_sub_division", "ksebSubDivision",
  ]) || parsed.subDivision;

  const section = firstValue(row, [
    "section", "section_name", "sectionName",
    "kseb_section", "ksebSection",
  ]) || parsed.section;

  const subStation = firstValue(row, [
    "sub_station", "subStation",
    "sub_station_name", "subStationName",
    "kseb_sub_station", "ksebSubStation",
  ]) || (normalizeHierarchyLevel(rawArea) === "subStation" ? hierarchyName : "");

  return {
    level,
    name: hierarchyName,
    circle,
    division,
    subDivision,
    section,
    subStation,
  };
}

function isMappedRow(row) {
  const status = firstValue(row, [
    "mapping_status",
    "mappingStatus",
  ]).toUpperCase();

  if (status === "MAPPED") return true;

  return Boolean(
    firstValue(row, [
      "mapped_kseb_code",
      "mappedKsebCode",
    ]) &&
    firstValue(row, [
      "directory_id",
      "directoryId",
      "kseb_directory_id",
      "ksebDirectoryId",
    ])
  );
}


/* =========================================================
   FINANCIAL MONTHS
========================================================= */

const FINANCIAL_MONTHS = [
  {
    month: "Apr",
    monthIndex: 3,
  },
  {
    month: "May",
    monthIndex: 4,
  },
  {
    month: "Jun",
    monthIndex: 5,
  },
  {
    month: "Jul",
    monthIndex: 6,
  },
  {
    month: "Aug",
    monthIndex: 7,
  },
  {
    month: "Sep",
    monthIndex: 8,
  },
  {
    month: "Oct",
    monthIndex: 9,
  },
  {
    month: "Nov",
    monthIndex: 10,
  },
  {
    month: "Dec",
    monthIndex: 11,
  },
  {
    month: "Jan",
    monthIndex: 0,
  },
  {
    month: "Feb",
    monthIndex: 1,
  },
  {
    month: "Mar",
    monthIndex: 2,
  },
];


/* =========================================================
   DISTRIBUTIONS
========================================================= */

// Parent areas are read dynamically from kseb_directory.PARENT_AREA.
const DISTRIBUTIONS = [];


/* =========================================================
   REPORT STEPS
========================================================= */

function ReportSteps({ activeStep = 1 }) {
  const navigate = useNavigate();

  const steps = [
    {
      number: 1,
      label: "Overall Sales",
      path: "/kseboverallsales",
    },
    {
      number: 2,
      label: "Location-wise Report",
      path: "/kseblocationreport",
    },
    {
      number: 3,
      label: "Detailed Report",
      path: "/ksebdetailreport",
    },
  ];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: "14px 18px",
        marginBottom: 20,
        boxShadow:
          "0 2px 8px rgba(15,23,42,.04)",
        overflowX: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 620,
          gap: 0,
        }}
      >
        {steps.map((step, index) => {
          const active =
            activeStep === step.number;

          return (
            <React.Fragment key={step.number}>
              <button
                type="button"
                onClick={() =>
                  navigate(step.path)
                }
                style={{
                  border: "none",
                  background: "transparent",
                  padding: "6px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  color: active
                    ? "#2563eb"
                    : "#6b7280",
                  fontWeight: active
                    ? 800
                    : 650,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: active
                      ? "#2563eb"
                      : "#f3f4f6",
                    color: active
                      ? "#fff"
                      : "#6b7280",
                    border: active
                      ? "2px solid #2563eb"
                      : "2px solid #d1d5db",
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {step.number}
                </span>

                <span
                  style={{
                    fontSize: 13,
                  }}
                >
                  {step.label}
                </span>
              </button>

              {index <
                steps.length - 1 && (
                <div
                  aria-hidden="true"
                  style={{
                    width: 70,
                    height: 2,
                    background:
                      activeStep >
                      step.number
                        ? "#2563eb"
                        : "#e5e7eb",
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position:
                        "absolute",
                      right: -1,
                      top: -5,
                      fontSize: 14,
                      color:
                        activeStep >
                        step.number
                          ? "#2563eb"
                          : "#9ca3af",
                      lineHeight: 1,
                    }}
                  >
                    →
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}


/* =========================================================
   KPI CARD
========================================================= */

function KpiCard({
  title,
  value,
  subtitle,
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 18,
        boxShadow:
          "0 2px 8px rgba(15,23,42,.04)",
      }}
    >
      <div
        style={{
          color: "#6b7280",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-.02em",
        }}
      >
        {value}
      </div>

      {subtitle && (
        <div
          style={{
            marginTop: 5,
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}


/* =========================================================
   DONUT / PIE CHART
========================================================= */

function DonutChart({
  data,
  selected,
  onSelect,
  compact = false,
}) {
  const total = data.reduce(
    (sum, item) =>
      sum + item.value,
    0
  );

  const size = compact ? 220 : 320;

  const center = size / 2;

  const radius = compact ? 78 : 116;

  const innerRadius = compact ? 44 : 68;

  if (!total) {
    return (
      <div
        style={{
          height: compact ? 220 : 320,
          display: "grid",
          placeItems: "center",
          color: "#9ca3af",
          fontSize: 13,
        }}
      >
        No distribution sales
        available.
      </div>
    );
  }

  let cursor = -Math.PI / 2;

  const paths = data.map(
    (item) => {
      const fraction =
        item.value / total;

      const angle =
        fraction *
        Math.PI *
        2;

      const start = cursor;

      const end =
        cursor + angle;

      cursor = end;

      const x1 =
        center +
        radius *
          Math.cos(start);

      const y1 =
        center +
        radius *
          Math.sin(start);

      const x2 =
        center +
        radius *
          Math.cos(end);

      const y2 =
        center +
        radius *
          Math.sin(end);

      const ix1 =
        center +
        innerRadius *
          Math.cos(end);

      const iy1 =
        center +
        innerRadius *
          Math.sin(end);

      const ix2 =
        center +
        innerRadius *
          Math.cos(start);

      const iy2 =
        center +
        innerRadius *
          Math.sin(start);

      const largeArc =
        angle > Math.PI
          ? 1
          : 0;

      const d = [
        `M ${x1} ${y1}`,

        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,

        `L ${ix1} ${iy1}`,

        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2}`,

        "Z",
      ].join(" ");

      return {
        ...item,

        d,

        percentage: (
          fraction * 100
        ).toFixed(2),
      };
    }
  );

  const selectedValue =
    selected === "Overall"
      ? total
      : data.find(
          (item) =>
            item.name ===
            selected
        )?.value || 0;

  return (
    <div
      className="kseb-donut-wrap"
      style={{
        display: "grid",
        gridTemplateColumns: compact
          ? "1fr"
          : "minmax(260px, 320px) minmax(0, 1fr)",
        gap: compact ? 12 : 24,
        alignItems: "center",
        justifyItems: compact ? "center" : "stretch",
      }}
    >
      {/* DONUT */}
      <div
        style={{
          position:
            "relative",
          width: size,
          height: size,
          maxWidth: "100%",
        }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width="100%"
          height="100%"
        >
          {paths.map(
            (item) => (
              <path
                key={
                  item.name
                }
                d={item.d}
                fill={
                  item.fill
                }
                stroke="#fff"
                strokeWidth={3}
                opacity={
                  selected ===
                    "Overall" ||
                  selected ===
                    item.name
                    ? 1
                    : 0.32
                }
                style={{
                  cursor:
                    "pointer",
                  transition:
                    "opacity .18s ease",
                }}
                onClick={() =>
                  onSelect(
                    item.name
                  )
                }
              >
                <title>
                  {item.name}:{" "}
                  {formatCurrency(
                    item.value
                  )}{" "}
                  (
                  {
                    item.percentage
                  }
                  %)
                </title>
              </path>
            )
          )}

          <circle
            cx={center}
            cy={center}
            r={innerRadius - 2}
            fill="#fff"
          />

          <text
            x={center}
            y={center - 8}
            textAnchor="middle"
            fontSize="12"
            fill="#6b7280"
          >
            {selected ===
            "Overall"
              ? "Overall"
              : selected}
          </text>

          <text
            x={center}
            y={center + 18}
            textAnchor="middle"
            fontSize="18"
            fontWeight="800"
            fill="#111827"
          >
            {formatCompact(
              selectedValue
            )}
          </text>
        </svg>
      </div>

      {/* LEGEND */}
      <div
        style={{
          display: "grid",
          gap: 10,
          width: compact ? "100%" : "auto",
        }}
      >
        {paths.map(
          (item) => (
            <button
              key={
                item.name
              }
              type="button"
              onClick={() =>
                onSelect(
                  item.name
                )
              }
              style={{
                display: "grid",
                gridTemplateColumns:
                  "12px 1fr auto",
                gap: 10,
                alignItems:
                  "center",
                border:
                  selected ===
                  item.name
                    ? "1px solid #bfdbfe"
                    : "1px solid #e5e7eb",
                background:
                  selected ===
                  item.name
                    ? "#eff6ff"
                    : "#fff",
                borderRadius: 10,
                padding:
                  "10px 12px",
                cursor:
                  "pointer",
                textAlign:
                  "left",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius:
                    "50%",
                  background:
                    item.fill,
                }}
              />

              <span>
                <strong
                  style={{
                    fontSize: 13,
                  }}
                >
                  {item.name}
                </strong>

                <span
                  style={{
                    display:
                      "block",
                    color:
                      "#6b7280",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {formatCurrency(
                    item.value
                  )}
                </span>
              </span>

              <strong
                style={{
                  fontSize: 13,
                }}
              >
                {
                  item.percentage
                }
                %
              </strong>
            </button>
          )
        )}
      </div>
    </div>
  );
}
/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function KsebOverallSales() {

  const [rows, setRows] = useState([]);

  const [year, setYear] =
    useState("all");

  // Financial month filter. "all" keeps all Apr-Mar months.
  const [month, setMonth] =
    useState("all");

  const [
    selectedDistribution,
    setSelectedDistribution,
  ] = useState("Overall");

  const [selectedAreaLevel, setSelectedAreaLevel] =
    useState("circle");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  /* =======================================================
     LOAD DATA FROM PHP API
  ======================================================= */

  useEffect(() => {

    let cancelled = false;


    async function loadKsebSales() {

      try {

        setLoading(true);

        setError("");


        const response =
          await apiFetch(
            API_URL,
            {
              method: "GET",

              headers: {
                Accept:
                  "application/json",
              },
            }
          );


        const contentType =
          response.headers.get(
            "content-type"
          ) || "";


        const responseText =
          await response.text();


        if (!response.ok) {

          throw new Error(
            `PHP API returned ${response.status}. ${responseText.slice(
              0,
              300
            )}`
          );

        }


        if (
          !contentType
            .toLowerCase()
            .includes(
              "application/json"
            )
        ) {

          throw new Error(
            "The KSEB PHP API did not return JSON. Check the PHP URL/path and make sure the PHP file is running on the same server."
          );

        }


        let json;


        try {

          json =
            JSON.parse(
              responseText
            );

        } catch {

          throw new Error(
            `Invalid JSON returned by the PHP API: ${responseText.slice(
              0,
              300
            )}`
          );

        }


        if (!json.success) {

          throw new Error(
            json.message ||
              "The KSEB PHP API returned success=false."
          );

        }


        if (!cancelled) {

          setRows(
            Array.isArray(
              json.data
            )
              ? json.data
              : []
          );

        }

      } catch (err) {

        if (!cancelled) {

          setError(
            err?.message ||
              "Unable to load KSEB sales data."
          );

        }

      } finally {

        if (!cancelled) {

          setLoading(false);

        }

      }

    }


    loadKsebSales();


    return () => {

      cancelled = true;

    };

  }, []);


  /* =======================================================
     AVAILABLE FINANCIAL YEARS
  ======================================================= */

  const availableYears =
    useMemo(() => {

      const years =
        new Set();


      rows.forEach(
        (row) => {

          const date =
            parseDate(
              row.invoice_date ||
                row.Date
            );


          const fyStart =
            getFinancialYear(
              date
            );


          if (
            fyStart !== null
          ) {

            years.add(
              fyStart
            );

          }

        }
      );


      return Array.from(
        years
      ).sort(
        (a, b) => b - a
      );

    }, [rows]);


  /* =======================================================
     FILTER BY FINANCIAL YEAR

     This is the base dataset for the dashboard and for the
     Apr-Mar monthly graph. The month selector must NOT change
     the Apr-Mar graph.
  ======================================================= */

  const yearFilteredRows =
    useMemo(() => {

      return rows.filter(
        (row) => {

          const date =
            parseDate(
              row.invoice_date ||
                row.Date
            );

          if (!date) {
            return false;
          }

          const rowFinancialYear =
            getFinancialYear(date);

          if (
            year !== "all" &&
            rowFinancialYear !== Number(year)
          ) {
            return false;
          }

          return true;
        }
      );

    }, [rows, year]);


  /* =======================================================
     FILTER BY FINANCIAL MONTH

     This filter changes KPIs, distribution, location graph
     and detailed data, but NOT the Apr-Mar monthly graph.
  ======================================================= */

  const filteredRows =
    useMemo(() => {

      if (month === "all") {
        return yearFilteredRows;
      }

      const selectedMonth =
        FINANCIAL_MONTHS.find(
          (item) => item.month === month
        );

      if (!selectedMonth) {
        return yearFilteredRows;
      }

      return yearFilteredRows.filter(
        (row) => {

          const date =
            parseDate(
              row.invoice_date ||
                row.Date
            );

          return (
            date &&
            date.getMonth() ===
              selectedMonth.monthIndex
          );
        }
      );

    }, [yearFilteredRows, month]);


  /* =======================================================
     DISTRIBUTION TOTALS

     South
     North
     Central
     Transmission
  ======================================================= */

  const distributionData =
    useMemo(() => {
      const totals = new Map();

      filteredRows.forEach((row) => {
        if (!isMappedRow(row)) return;

        const parentArea = normalizeDistributionType(row);
        const amount = Number(row.invoice_amount || 0);

        if (!Number.isFinite(amount)) return;

        totals.set(parentArea, (totals.get(parentArea) || 0) + amount);
      });

      return Array.from(totals.entries())
        .map(([name, value], index) => ({
          name,
          value: Math.round(value * 100) / 100,
          fill: [
            "#2563eb", "#16a34a", "#f59e0b", "#9333ea",
            "#dc2626", "#0891b2", "#7c3aed", "#ca8a04",
          ][index % 8],
        }))
        .sort((a, b) => b.value - a.value);
    }, [filteredRows]);


  /* =======================================================
     SELECTED DISTRIBUTION ROWS

     Overall:
       all invoices

     South:
       only South invoices

     North:
       only North invoices

     Central:
       only Central invoices

     Transmission:
       only Transmission invoices
  ======================================================= */

  const selectedRows =
    useMemo(() => {

      if (
        selectedDistribution ===
        "Overall"
      ) {

        return filteredRows;

      }


      return filteredRows.filter(
        (row) =>
          normalizeDistributionType(
            row
          ) ===
          selectedDistribution
      );

    }, [
      filteredRows,
      selectedDistribution,
    ]);


  /* =======================================================
     OVERALL SALES
  ======================================================= */

  const overallTotalSales =
    useMemo(() => {

      return filteredRows.reduce(
        (total, row) => {

          const amount =
            Number(
              row.invoice_amount ||
                0
            );


          return (
            total +
            (Number.isFinite(
              amount
            )
              ? amount
              : 0)
          );

        },
        0
      );

    }, [filteredRows]);


  /* =======================================================
     SELECTED SALES
  ======================================================= */

  const totalSales =
    useMemo(() => {

      return selectedRows.reduce(
        (total, row) => {

          const amount =
            Number(
              row.invoice_amount ||
                0
            );


          return (
            total +
            (Number.isFinite(
              amount
            )
              ? amount
              : 0)
          );

        },
        0
      );

    }, [selectedRows]);


  /* =======================================================
     DISTRIBUTION PERCENTAGE

     Example:

     Overall = 100%

     South = South Sales / Overall Sales * 100
  ======================================================= */

  const selectedPercentage =
    useMemo(() => {

      if (
        !overallTotalSales
      ) {

        return 0;

      }


      if (
        selectedDistribution ===
        "Overall"
      ) {

        return 100;

      }


      return (
        (totalSales /
          overallTotalSales) *
        100
      );

    }, [
      totalSales,
      overallTotalSales,
      selectedDistribution,
    ]);


  /* =======================================================
     MONTHLY GRAPH DATA

     IMPORTANT:
     This intentionally uses yearFilteredRows, NOT filteredRows.
     Therefore selecting Sep/Oct/etc. changes the rest of the
     dashboard but leaves the Apr-Mar graph unchanged.
  ======================================================= */

  const monthlyGraphRows =
    useMemo(() => {

      if (
        selectedDistribution ===
        "Overall"
      ) {
        return yearFilteredRows;
      }

      return yearFilteredRows.filter(
        (row) =>
          normalizeDistributionType(row) ===
          selectedDistribution
      );

    }, [
      yearFilteredRows,
      selectedDistribution,
    ]);


  /* =======================================================
     MONTHLY SALES GRAPH
  ======================================================= */

  const monthlyData =
    useMemo(() => {

      const totals =
        FINANCIAL_MONTHS.map(
          (item) => ({

            month:
              item.month,

            monthIndex:
              item.monthIndex,

            sales: 0,

          })
        );


      monthlyGraphRows.forEach(
        (row) => {

          const date =
            parseDate(
              row.invoice_date ||
                row.Date
            );


          if (!date) {

            return;

          }


          const monthPosition =
            FINANCIAL_MONTHS.findIndex(
              (item) =>
                item.monthIndex ===
                date.getMonth()
            );


          if (
            monthPosition ===
            -1
          ) {

            return;

          }


          const amount =
            Number(
              row.invoice_amount ||
                0
            );


          if (
            Number.isFinite(
              amount
            )
          ) {

            totals[
              monthPosition
            ].sales +=
              amount;

          }

        }
      );


      return totals.map(
        (item) => ({

          ...item,

          sales:
            Math.round(
              item.sales *
                100
            ) / 100,

        })
      );

    }, [monthlyGraphRows]);


  /* =======================================================
     LOCATION-WISE SALES

     IMPORTANT:

     This is where the KSEB directory
     information is used.

     Initially:
       All locations

     After clicking South:
       Only South locations

     After clicking North:
       Only North locations

     etc.
  ======================================================= */

  const hierarchyRows = useMemo(() => {
    return selectedRows
      .filter((row) => isMappedRow(row))
      .map((row) => {
        const hierarchy = getKsebHierarchy(row);
        return {
          ...hierarchy,
          parentArea: normalizeDistributionType(row),
          tallyName: normalizeTallyName(row),
          invoiceAmount: Number(row.invoice_amount || 0),
        };
      })
      .filter((row) => Number.isFinite(row.invoiceAmount));
  }, [selectedRows]);

  /*
    GRAPH:
    Show every ledger separately.
    Sort the ledger bars in this exact hierarchy order:
      1. Sub Station
      2. Section
      3. Sub Division
      4. Division
      5. Circle
  */
  const locationData = useMemo(() => {
    const ledgerMap = new Map();

    hierarchyRows.forEach((row) => {
      const ledgerName = String(row.tallyName || "").trim();
      if (!ledgerName) return;

      // Ledger prefix is authoritative for the graph hierarchy.
      const areaLevel = hierarchyLevelFromTallyName(ledgerName) || normalizeHierarchyLevel(row.level);
      if (!areaLevel) return;

      const areaName = String(row.name || row[areaLevel] || "").trim();
      if (!areaName) return;

      const key = `${areaLevel}|||${areaName}|||${ledgerName}`;
      const current = ledgerMap.get(key) || {
        ledgerName,
        areaLevel,
        areaName,
        circle: row.circle,
        division: row.division,
        subDivision: row.subDivision,
        section: row.section,
        subStation: row.subStation,
        sales: 0,
      };

      current.sales += row.invoiceAmount;
      ledgerMap.set(key, current);
    });

    // Nivo horizontal bars render the first data item at the bottom.
    // Therefore the data is built in reverse hierarchy order so the chart shows:
    // TOP    → Circle → Division → Sub Division → Section → Sub Station → BOTTOM
    // Inside each group: LOWEST SALE → HIGHEST SALE from top to bottom.
    const levelOrder = {
      subStation: 1,
      section: 2,
      subDivision: 3,
      division: 4,
      circle: 5,
    };

    const sortedLedgers = Array.from(ledgerMap.values())
      .map((item) => ({
        ...item,
        sales: Math.round(item.sales * 100) / 100,
        percentage: totalSales
          ? Number(((item.sales / totalSales) * 100).toFixed(2))
          : 0,
      }))
      .sort((a, b) => {
        const levelDifference = levelOrder[a.areaLevel] - levelOrder[b.areaLevel];
        if (levelDifference !== 0) return levelDifference;

        // Nivo renders the first horizontal category at the bottom.
        // To show LOWEST SALE at the TOP and HIGHEST SALE at the BOTTOM
        // inside every hierarchy group, keep the data in DESCENDING sales order.
        if (b.sales !== a.sales) return b.sales - a.sales;

        // If sales are equal, keep the area and ledger names in ascending order.
        const areaDifference = String(a.areaName).localeCompare(
          String(b.areaName),
          undefined,
          { numeric: true, sensitivity: "base" }
        );
        if (areaDifference !== 0) return areaDifference;

        return String(a.ledgerName).localeCompare(
          String(b.ledgerName),
          undefined,
          { numeric: true, sensitivity: "base" }
        );
      });

    // Insert exactly one heading row for each hierarchy level.
    // These rows have zero sales, so they act only as visual headings.
    const result = [];
    let previousLevel = null;

    sortedLedgers.forEach((item, index) => {
      if (item.areaLevel !== previousLevel) {
        result.push({
          id: `${item.areaLevel}`,
          location: hierarchyLabel(item.areaLevel),
          ledgerName: hierarchyLabel(item.areaLevel),
          areaLevel: item.areaLevel,
          areaName: "",
          circle: "",
          division: "",
          subDivision: "",
          section: "",
          subStation: "",
          sales: 0,
          percentage: 0,
          isHeader: true,
        });
        previousLevel = item.areaLevel;
      }

      result.push({
        ...item,
        id: `${item.ledgerName}`,
        location: item.ledgerName,
        isHeader: false,
      });
    });

    return result;
  }, [hierarchyRows, totalSales]);

  /* =======================================================
     AVERAGE MONTHLY SALES
  ======================================================= */

  const averageMonthlySales =
    monthlyData.length > 0
      ? totalSales / monthlyData.length
      : 0;


  /* =======================================================
     HIGHEST SALES MONTH
  ======================================================= */

  const highestMonth =
    useMemo(() => {

      if (
        !monthlyData.length
      ) {

        return {

          month: "-",

          sales: 0,

        };

      }


      return monthlyData.reduce(
        (
          highest,
          current
        ) =>
          current.sales >
          highest.sales
            ? current
            : highest
      );

    }, [monthlyData]);


  /* =======================================================
     DISTRIBUTION TOTAL
  ======================================================= */

  const distributionTotal =
    distributionData.reduce(
      (sum, item) =>
        sum + item.value,
      0
    );


  /* =======================================================
     UNMAPPED SALES

     If invoices exist but the KSEB
     directory did not match their
     tally name, they appear here.

     This is useful for finding
     directory mapping problems.
  ======================================================= */

  const unmappedSales =
    Math.max(
      0,
      overallTotalSales -
        distributionTotal
    );


  /* =======================================================
     LOCATION BAR NAVIGATION

     Clicking a real ledger/place bar opens the location report
     with the current year/month/distribution filters preserved.
  ======================================================= */

  const navigate = useNavigate();

  function openLocationReport(locationRow) {
    if (!locationRow || locationRow.isHeader) return;

    const params = new URLSearchParams();

    if (year !== "all") {
      params.set("year", String(year));
    }

    if (month !== "all") {
      params.set("month", month);
    }

    if (selectedDistribution !== "Overall") {
      params.set("distribution", selectedDistribution);
    }

    const place =
      String(
        locationRow.ledgerName ||
        locationRow.location ||
        ""
      ).trim();

    if (place) {
      params.set("place", place);
      params.set("selectedPlace", place);
      params.set("tallyName", place);
    }

    if (locationRow.areaLevel) {
      params.set("level", locationRow.areaLevel);
    }

    if (locationRow.areaName) {
      params.set("area", locationRow.areaName);
    }

    navigate(`/kseblocationreport?${params.toString()}`);
  }


  /* =======================================================
     AUTOMATICALLY RESET SELECTION

     If a selected distribution
     contains no sales after changing
     the financial year, return to
     Overall.
  ======================================================= */

  useEffect(() => {

    if (
      selectedDistribution !==
      "Overall" &&
      !distributionData.some(
        (item) =>
          item.name ===
            selectedDistribution &&
          item.value > 0
      )
    ) {

      setSelectedDistribution(
        "Overall"
      );

    }

  }, [
    distributionData,
    selectedDistribution,
  ]);


  /* =======================================================
     DEBUG INFORMATION

     You can temporarily uncomment
     this while connecting PHP.
  ======================================================= */

  /*
  console.log(
    "KSEB rows:",
    rows
  );

  console.log(
    "Selected distribution:",
    selectedDistribution
  );

  console.log(
    "Distribution data:",
    distributionData
  );

  console.log(
    "Location data:",
    locationData
  );
  */


  /* =======================================================
     RETURN STARTS IN PART 3
  ======================================================= */

  return (
    <>
      <Banner />
      <div
      className="kseb-page-root"
      style={{
        minHeight:
          "100vh",

        background:
          "#f6f8fb",

        padding: "20px clamp(12px, 2vw, 28px)",
        width: "100vw",
        maxWidth: "none",
        marginLeft: "calc(50% - 50vw)",
        boxSizing: "border-box",

        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",

        color:
          "#111827",
      }}
    >
      <style>{`
        .kseb-page-root {
          max-width: 100vw;
          overflow-x: hidden;
        }
        .kseb-dashboard-main {
          display: grid;
          grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
          gap: 20px;
          align-items: start;
          width: 100%;
        }
        .kseb-sidebar {
          min-width: 0;
          width: 100%;
          max-width: none !important;
          box-sizing: border-box;
        }
        .kseb-dashboard-main > main {
          width: 100% !important;
          min-width: 0 !important;
          max-width: none !important;
          margin: 0 !important;
          box-sizing: border-box;
        }
        .kseb-graph-card {
          min-width: 0 !important;
          width: 100% !important;
          max-width: none !important;
          overflow: hidden;
          box-sizing: border-box;
        }
        .kseb-dashboard-main > main > .kseb-graph-card {
          width: 100% !important;
          max-width: none !important;
        }
        @media (max-width: 1100px) {
          .kseb-dashboard-main { grid-template-columns: 280px minmax(0, 1fr); }
        }
        @media (max-width: 820px) {
          .kseb-dashboard-main { grid-template-columns: 1fr; }
          .kseb-sidebar { position: static !important; }
        }
        @media (max-width: 640px) {
          .kseb-donut-wrap { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div
        style={{
          width: "100%",
          width: "100%",
          maxWidth: 1800,
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >

        {/* =================================================
            STEP 1 / 2 / 3
        ================================================== */}

        <ReportSteps activeStep={1} />


        {/* =================================================
            HEADER
        ================================================== */}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >

          <div>

            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#2563eb",
                textTransform:
                  "uppercase",
                letterSpacing: ".08em",
              }}
            >
              KSEB Sales
            </div>


            <h1
              style={{
                margin:
                  "5px 0 4px",
                fontSize: 30,
                lineHeight: 1.15,
              }}
            >
              Overall Sales
            </h1>


            <p
              style={{
                margin: 0,
                color: "#6b7280",
              }}
            >
              Overall performance →
              distribution mix →
              location-wise sales
            </p>

          </div>


          {/* FINANCIAL YEAR + MONTH FILTERS */}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <select
              aria-label="Financial year"
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setSelectedDistribution("Overall");
              }}
              style={{
                minWidth: 170,
                padding: "10px 14px",
                borderRadius: 9,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="all">
                All Financial Years
              </option>

              {availableYears.map((item) => (
                <option key={item} value={item}>
                  FY {item}-{String(Number(item) + 1).slice(-2)}
                </option>
              ))}
            </select>

            <select
              aria-label="Financial month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setSelectedDistribution("Overall");
              }}
              style={{
                minWidth: 150,
                padding: "10px 14px",
                borderRadius: 9,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="all">
                All Months
              </option>

              {FINANCIAL_MONTHS.map((item) => (
                <option key={item.month} value={item.month}>
                  {item.month}
                </option>
              ))}
            </select>
          </div>

        </div>


        {/* =================================================
            KPI CARDS
        ================================================== */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >

          <KpiCard
            title={
              selectedDistribution ===
              "Overall"
                ? "Total KSEB Sales"
                : `${selectedDistribution} Sales`
            }
            value={formatCurrency(
              totalSales
            )}
            subtitle={
              selectedDistribution ===
              "Overall"
                ? "All KSEB invoice sales"
                : `Selected: ${selectedDistribution}`
            }
          />


          <KpiCard
            title="Average Monthly Sales"
            value={formatCurrency(
              averageMonthlySales
            )}
            subtitle={
              selectedDistribution ===
              "Overall"
                ? "Overall"
                : selectedDistribution
            }
          />


          <KpiCard
            title="Highest Sales Month"
            value={
              highestMonth.month
            }
            subtitle={formatCurrency(
              highestMonth.sales
            )}
          />


          <KpiCard
            title="KSEB Invoices"
            value={selectedRows.length.toLocaleString(
              "en-IN"
            )}
            subtitle={
              selectedDistribution ===
              "Overall"
                ? "All distributions"
                : selectedDistribution
            }
          />

        </div>


        {/* =================================================
            LOADING
        ================================================== */}

        {loading && (

          <div
            style={{
              background: "#fff",
              border:
                "1px solid #e5e7eb",
              borderRadius: 14,
              minHeight: 300,
              display: "grid",
              placeItems:
                "center",
              color: "#6b7280",
            }}
          >
            Loading KSEB sales...
          </div>

        )}


        {/* =================================================
            ERROR
        ================================================== */}

        {!loading && error && (

          <div
            style={{
              background: "#fff",
              border:
                "1px solid #fecaca",
              borderRadius: 14,
              padding: 24,
              color: "#b91c1c",
            }}
          >

            <strong>
              Unable to load
              KSEB sales.
            </strong>


            <div
              style={{
                marginTop: 6,
              }}
            >
              {error}
            </div>


            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              API URL:

              <strong
                style={{
                  marginLeft: 5,
                }}
              >
                {API_URL}
              </strong>

            </div>

          </div>

        )}


        {/* =================================================
            MAIN CONTENT
        ================================================== */}

        {!loading && !error && (

          <div
            className="kseb-dashboard-main"
            style={{
              width: "100%",
              minWidth: 0,
            }}
          >


            {/* =================================================
                LEFT SIDE PANE
            ================================================== */}

            <aside
              className="kseb-sidebar"
              style={{
                background: "#fff",

                border:
                  "1px solid #e5e7eb",

                borderRadius: 14,

                padding: 18,

                boxShadow:
                  "0 2px 8px rgba(15,23,42,.04)",

                position:
                  "sticky",

                top: 16,
                minWidth: 0,
              }}
            >

              {/* =================================================
                  DISTRIBUTION PIE — LEFT PANE
              ================================================== */}

              <div
                style={{
                  marginBottom: 20,
                  paddingBottom: 18,
                  borderBottom: "1px solid #eef0f3",
                }}
              >

                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    marginBottom: 3,
                  }}
                >
                  KSEB Sales Distribution
                </div>

                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 11,
                    lineHeight: 1.4,
                    marginBottom: 8,
                  }}
                >
                  Click a distribution to filter the dashboard.
                </div>

                <DonutChart
                  data={distributionData}
                  selected={selectedDistribution}
                  onSelect={setSelectedDistribution}
                  compact
                />

              </div>


              {/* TITLE */}

              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    ".06em",
                  fontWeight: 800,
                }}
              >
                Sales Share
              </div>


              {/* MAIN PERCENTAGE */}

              <div
                style={{
                  fontSize: 32,
                  fontWeight: 850,
                  marginTop: 6,
                }}
              >
                {selectedPercentage.toFixed(
                  2
                )}
                %
              </div>


              {/* PERCENTAGE DESCRIPTION */}

              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginTop: 3,
                }}
              >

                {selectedDistribution ===
                "Overall"
                  ? "Overall KSEB sales"
                  : `Share from ${selectedDistribution}`}

              </div>


              {/* SALES VALUE */}

              <div
                style={{
                  marginTop: 14,
                  padding:
                    "12px 0",
                  borderTop:
                    "1px solid #eef0f3",
                  borderBottom:
                    "1px solid #eef0f3",
                }}
              >

                <div
                  style={{
                    fontSize: 11,
                    color:
                      "#9ca3af",
                    textTransform:
                      "uppercase",
                    fontWeight: 700,
                  }}
                >
                  Selected Sales
                </div>


                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    marginTop: 4,
                  }}
                >
                  {formatCurrency(
                    totalSales
                  )}
                </div>

              </div>


              {/* OVERALL BUTTON */}

              <button
                type="button"
                onClick={() =>
                  setSelectedDistribution(
                    "Overall"
                  )
                }
                style={{
                  width: "100%",

                  border:
                    selectedDistribution ===
                    "Overall"
                      ? "1px solid #2563eb"
                      : "1px solid #e5e7eb",

                  background:
                    selectedDistribution ===
                    "Overall"
                      ? "#eff6ff"
                      : "#fff",

                  borderRadius: 10,

                  padding:
                    "11px 12px",

                  textAlign:
                    "left",

                  cursor:
                    "pointer",

                  fontWeight: 800,

                  color:
                    selectedDistribution ===
                    "Overall"
                      ? "#1d4ed8"
                      : "#374151",

                  marginTop: 16,
                }}
              >
                Overall
              </button>


              {/* DISTRIBUTION FILTERS */}

              <div
                style={{
                  display:
                    "grid",

                  gap: 8,

                  marginTop: 8,
                }}
              >

                {distributionData.map(
                  (item) => {

                    const share =
                      overallTotalSales
                        ? (item.value /
                            overallTotalSales) *
                          100
                        : 0;


                    return (
                      <button
                        key={
                          item.name
                        }
                        type="button"
                        onClick={() =>
                          setSelectedDistribution(
                            item.name
                          )
                        }
                        style={{
                          width:
                            "100%",

                          border:
                            selectedDistribution ===
                            item.name
                              ? "1px solid #bfdbfe"
                              : "1px solid #e5e7eb",

                          background:
                            selectedDistribution ===
                            item.name
                              ? "#eff6ff"
                              : "#fff",

                          borderRadius:
                            10,

                          padding:
                            "10px 12px",

                          display:
                            "grid",

                          gridTemplateColumns:
                            "10px 1fr auto",

                          gap: 9,

                          alignItems:
                            "center",

                          textAlign:
                            "left",

                          cursor:
                            "pointer",
                        }}
                      >

                        {/* DOT */}

                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius:
                              "50%",
                            background:
                              item.fill,
                          }}
                        />


                        {/* NAME */}

                        <span
                          style={{
                            fontSize:
                              13,
                            fontWeight:
                              700,
                          }}
                        >
                          {item.name}
                        </span>


                        {/* % */}

                        <strong
                          style={{
                            fontSize:
                              12,
                          }}
                        >
                          {share.toFixed(
                            2
                          )}
                          %
                        </strong>

                      </button>

                    );

                  }
                )}

              </div>


              {/* =================================================
                  UNMAPPED WARNING
              ================================================== */}

              {unmappedSales > 1 && (

                <div
                  style={{
                    marginTop: 14,

                    padding: 10,

                    borderRadius: 9,

                    background:
                      "#fffbeb",

                    color:
                      "#92400e",

                    fontSize: 11,

                    lineHeight:
                      1.45,
                  }}
                >

                  <strong>
                    Directory mapping
                    needed:
                  </strong>

                  {" "}

                  {formatCurrency(
                    unmappedSales
                  )}

                  {" "}
                  of invoice sales
                  do not currently
                  match South /
                  North / Central /
                  Transmission.

                </div>

              )}

            </aside>


            {/* =================================================
                RIGHT SIDE
            ================================================== */}

            <main
              style={{
                display:
                  "grid",

                gap: 18,

                minWidth: 0,
              }}
            >


              {/* =================================================
                  GRAPH 1 — OVERALL MONTHLY SALES
              ================================================== */}

              <section
                className="kseb-graph-card"
                style={{
                  background:
                    "#fff",

                  border:
                    "1px solid #e5e7eb",

                  borderRadius:
                    14,

                  padding:
                    "20px 20px 18px",

                  boxShadow:
                    "0 2px 8px rgba(15,23,42,.04)",
                }}
              >

                <div
                  style={{
                    marginBottom:
                      12,
                  }}
                >

                  <h2
                    style={{
                      margin: 0,
                      fontSize:
                        18,
                    }}
                  >

                    {selectedDistribution ===
                    "Overall"
                      ? "KSEB Sales — Overall Financial Year"
                      : `KSEB Sales — ${selectedDistribution}`}

                  </h2>


                  <div
                    style={{
                      color:
                        "#6b7280",

                      fontSize:
                        13,

                      marginTop:
                        4,
                    }}
                  >

                    {year === "all"
                      ? "Combined Apr–Mar sales across all available financial years"
                      : `Financial year ${year}-${String(
                          Number(year) + 1
                        ).slice(-2)}`}
                  </div>

                </div>


                <div
                  style={{
                    height: 430,
                    width: "100%",
                    maxWidth: "none",
                    margin: 0,
                    minWidth: 0,
                  }}
                >

                  <ResponsiveBar
                    data={
                      monthlyData
                    }

                    keys={[
                      "sales",
                    ]}

                    indexBy="month"

                    margin={{
                      top: 20,
                      right: 20,
                      bottom: 52,
                      left: 72,
                    }}

                    padding={0.28}

                    valueScale={{
                      type: "linear",
                    }}

                    indexScale={{
                      type: "band",
                      round: true,
                    }}

                    borderRadius={5}

                    enableLabel={
                      false
                    }

                    enableGridX={
                      false
                    }

                    enableGridY={
                      true
                    }


                    axisBottom={{
                      tickSize: 0,

                      tickPadding:
                        12,

                      tickRotation:
                        0,

                      legend:
                        "Month",

                      legendPosition:
                        "middle",

                      legendOffset:
                        42,
                    }}


                    axisLeft={{
                      tickSize: 0,

                      tickPadding:
                        8,

                      tickRotation:
                        0,

                      legend:
                        "Sales",

                      legendPosition:
                        "middle",

                      legendOffset:
                        -65,

                      format:
                        (value) =>
                          formatCompact(
                            value
                          ),
                    }}


                    valueFormat={
                      (value) =>
                        formatCurrency(
                          value
                        )
                    }


                    tooltip={({
                      data,
                    }) => (

                      <div
                        style={{
                          background:
                            "#fff",

                          padding:
                            "10px 14px",

                          border:
                            "1px solid #e5e7eb",

                          borderRadius:
                            8,

                          boxShadow:
                            "0 8px 25px rgba(0,0,0,.10)",
                        }}
                      >

                        <div
                          style={{
                            fontWeight:
                              700,
                          }}
                        >
                          {
                            data.month
                          }
                        </div>


                        <div
                          style={{
                            fontWeight:
                              700,

                            marginTop:
                              4,
                          }}
                        >
                          {formatCurrency(
                            data.sales
                          )}
                        </div>

                      </div>

                    )}


                    theme={{
                      axis: {

                        ticks: {
                          text: {
                            fontSize:
                              12,
                            fill:
                              "#6b7280",
                          },
                        },

                        legend: {
                          text: {
                            fontSize:
                              12,
                            fill:
                              "#374151",
                            fontWeight:
                              600,
                          },
                        },

                      },

                      grid: {
                        line: {
                          stroke:
                            "#e5e7eb",

                          strokeWidth:
                            1,
                        },
                      },

                    }}
                  />

                </div>

              </section>


          
              {/* =================================================
                  GRAPH 3 — KSEB AREA HIERARCHY SALES
              ================================================== */}

              <section
                className="kseb-graph-card"
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: "20px 20px 18px",
                  boxShadow: "0 2px 8px rgba(15,23,42,.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18 }}>
                      {selectedDistribution === "Overall"
                        ? "KSEB Ledger-wise Sales by Area"
                        : `${selectedDistribution} — KSEB Ledger-wise Sales`}
                    </h2>

                    <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
                      One heading for each hierarchy level. Area names are used for ascending sorting; only ledger names are shown under each heading.
                    </div>
                  </div>
                </div>

                {locationData.length > 0 ? (
                  <div
                    style={{
                      height: Math.max(500, Math.min(1800, locationData.length * 38)),
                    }}
                  >
                    <ResponsiveBar
                      data={locationData}
                      keys={["sales"]}
                      indexBy="id"
                      layout="horizontal"
                      margin={{
                        top: 10,
                        right: 90,
                        bottom: 42,
                        left: 360,
                      }}
                      padding={0.18}
                      valueScale={{ type: "linear" }}
                      indexScale={{ type: "band", round: true }}
                      borderRadius={5}
                      enableGridX={true}
                      enableGridY={false}
                      axisBottom={{
                        tickSize: 0,
                        tickPadding: 8,
                        legend: "Sales",
                        legendPosition: "middle",
                        legendOffset: 34,
                        format: (value) => formatCompact(value),
                      }}
                      axisLeft={{
                        tickSize: 0,
                        tickPadding: 8,
                        renderTick: ({ value, x, y, textBaseline }) => {
                          const row = locationData.find((item) => item.id === value);
                          const isHeader = row?.isHeader;

                          return (
                            <g transform={`translate(${x},${y})`}>
                              <text
                                x={-8}
                                y={0}
                                textAnchor="end"
                                dominantBaseline={textBaseline || "middle"}
                                style={{
                                  fontSize: isHeader ? 13 : 11,
                                  fontWeight: isHeader ? 800 : 500,
                                  fill: isHeader ? "#111827" : "#4b5563",
                                  textTransform: isHeader ? "uppercase" : "none",
                                }}
                              >
                                {value}
                              </text>
                            </g>
                          );
                        },
                      }}
                      valueFormat={(value) => formatCurrency(value)}
                      colors={(bar) => bar.data.isHeader ? "transparent" : "#e9c19f"}
                      enableLabel={false}
                      onClick={(bar) => {
                        openLocationReport(bar?.data);
                      }}
                      onMouseEnter={(data) => {
                        if (!data?.data?.isHeader) {
                          document.body.style.cursor = "pointer";
                        }
                      }}
                      onMouseLeave={() => {
                        document.body.style.cursor = "";
                      }}
                      tooltip={({ data }) => {
                        if (data.isHeader) return null;
                        return (
                        <div
                          style={{
                            background: "#fff",
                            padding: "10px 14px",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            boxShadow: "0 8px 25px rgba(0,0,0,.10)",
                            minWidth: 220,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              color: "#6b7280",
                              marginBottom: 3,
                              textTransform: "uppercase",
                              fontWeight: 700,
                            }}
                          >
                            {hierarchyLabel(data.areaLevel)}
                          </div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>
                            {data.ledgerName}
                          </div>
                          <div style={{ color: "#4b5563", fontSize: 12, marginBottom: 3 }}>
                            Area: {data.areaName}
                          </div>
                          <div style={{ color: "#6b7280", fontSize: 11, lineHeight: 1.5 }}>
                            Circle: {data.circle}
                            <br />
                            Division: {data.division}
                            <br />
                            Sub Division: {data.subDivision}
                            <br />
                            Section: {data.section}
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 14, marginTop: 8 }}>
                            {formatCurrency(data.sales)}
                          </div>
                          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 3 }}>
                            {data.percentage}% of selected total
                          </div>
                        </div>
                        );
                      }}
                      theme={{
                        axis: {
                          ticks: { text: { fontSize: 11, fill: "#6b7280" } },
                          legend: {
                            text: {
                              fontSize: 12,
                              fill: "#374151",
                              fontWeight: 600,
                            },
                          },
                        },
                        grid: {
                          line: { stroke: "#e5e7eb", strokeWidth: 1 },
                        },
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      height: 260,
                      display: "grid",
                      placeItems: "center",
                      color: "#9ca3af",
                      fontSize: 13,
                    }}
                  >
                    No directory-mapped {hierarchyLabel(selectedAreaLevel).toLowerCase()} sales found for this selection.
                  </div>
                )}
              </section>

              {/* =================================================
                  DIRECTORY MATCH DETAILS

                  Useful for checking whether the
                  Tally Name mapping is working.
              ================================================== */}

              <section
                className="kseb-graph-card"
                style={{
                  background:
                    "#fff",

                  border:
                    "1px solid #e5e7eb",

                  borderRadius:
                    14,

                  padding:
                    "18px 20px",

                  boxShadow:
                    "0 2px 8px rgba(15,23,42,.04)",
                }}
              >

                <div
                  style={{
                    display:
                      "flex",

                    justifyContent:
                      "space-between",

                    alignItems:
                      "center",

                    gap: 12,

                    flexWrap:
                      "wrap",
                  }}
                >

                  <div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize:
                          16,
                      }}
                    >
                      KSEB Directory Mapping
                    </h3>

                    <div
                      style={{
                        marginTop:
                          4,

                        color:
                          "#6b7280",

                        fontSize:
                          12,
                      }}
                    >
                      Tally Name → KSEB
                      Directory → Distribution →
                      Circle → Division →
                      Sub Division → Section
                    </div>

                  </div>


                  <div
                    style={{
                      fontSize:
                        12,

                      color:
                        "#6b7280",
                    }}
                  >

                    Showing{" "}

                    <strong
                      style={{
                        color:
                          "#111827",
                      }}
                    >
                      {
                        selectedRows.length
                      }
                    </strong>

                    {" "}
                    invoices

                  </div>

                </div>


                {/* SAMPLE MATCHED DATA */}

                {selectedRows.length >
                0 && (

                  <div
                    style={{
                      marginTop:
                        14,

                      maxHeight:
                        620,

                      overflowX:
                        "auto",

                      overflowY:
                        "auto",

                      border:
                        "1px solid #eef0f3",

                      borderRadius:
                        10,
                    }}
                  >

                    <table
                      style={{
                        width:
                          "100%",

                        borderCollapse:
                          "collapse",

                        fontSize:
                          12,
                      }}
                    >

                      <thead>

                        <tr
                          style={{
                            background:
                              "#f9fafb",
                          }}
                        >

                          <th
                            style={{
                              padding:
                                "10px 12px",

                              textAlign:
                                "left",

                              color:
                                "#6b7280",
                            }}
                          >
                            Tally Name
                          </th>


                          <th
                            style={{
                              padding:
                                "10px 12px",

                              textAlign:
                                "left",

                              color:
                                "#6b7280",
                            }}
                          >
                            Distribution
                          </th>


                          <th
                            style={{
                              padding: "10px 12px",
                              textAlign: "left",
                              color: "#6b7280",
                            }}
                          >
                            Area
                          </th>

                          <th
                            style={{
                              padding: "10px 12px",
                              textAlign: "right",
                              color: "#6b7280",
                            }}
                          >
                            Invoice Amount
                          </th>

                        </tr>

                      </thead>


                      <tbody>

                        {selectedRows
                          .map(
                            (
                              row,
                              index
                            ) => (

                              <tr
                                key={
                                  row.invoice_id ||
                                  row.voucher_id ||
                                  `${normalizeTallyName(
                                    row
                                  )}-${index}`
                                }
                                style={{
                                  borderTop:
                                    "1px solid #f0f1f3",
                                }}
                              >

                                <td
                                  style={{
                                    padding:
                                      "10px 12px",
                                    fontWeight:
                                      650,
                                  }}
                                >
                                  {normalizeTallyName(
                                    row
                                  ) ||
                                    "Not returned"}
                                </td>


                                <td
                                  style={{
                                    padding:
                                      "10px 12px",
                                  }}
                                >
                                  {normalizeDistributionType(
                                    row
                                  )}
                                </td>


                                {(() => {
                                  const hierarchy = getKsebHierarchy(row);
                                  const areaLevel = normalizeHierarchyLevel(hierarchy.level);
                                  const areaName = String(
                                    hierarchy.name ||
                                    (areaLevel ? hierarchy[areaLevel] : "") ||
                                    ""
                                  ).trim();

                                  if (!areaLevel || !areaName) {
                                    return <td style={{ padding: "10px 12px" }} />;
                                  }

                                  return (
                                    <td
                                      style={{
                                        padding: "10px 12px",
                                        fontWeight: 700,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: "inline-block",
                                          padding: "4px 8px",
                                          borderRadius: 7,
                                          background: "#f3f4f6",
                                          color: "#374151",
                                          fontSize: 11,
                                          marginRight: 7,
                                        }}
                                      >
                                        {hierarchyLabel(areaLevel)}
                                      </span>
                                      {areaName}
                                    </td>
                                  );
                                })()}


                                <td
                                  style={{
                                    padding:
                                      "10px 12px",

                                    textAlign:
                                      "right",

                                    fontWeight:
                                      700,
                                  }}
                                >
                                  {formatCurrency(
                                    Number(
                                      row.invoice_amount ||
                                        0
                                    )
                                  )}
                                </td>

                              </tr>

                            )
                          )}

                      </tbody>

                    </table>


                  </div>

                )}

              </section>

            </main>

          </div>

        )}


        {/* =================================================
            FOOTER / SOURCE
        ================================================== */}

        <div
          style={{
            marginTop: 12,

            fontSize: 12,

            color: "#6b7280",
          }}
        >

          Source: KSEB invoice sales +
          KSEB directory mapping.

          The PHP API performs the exact
          Tally Name → KSEB mapping and
          returns the directory hierarchy.

        </div>

      </div>

    </div>
    </>
  );
}