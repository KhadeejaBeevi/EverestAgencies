import React, { useEffect, useMemo, useRef, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { ResponsiveBar } from "@nivo/bar";
import { apiFetch } from "../../api/apiClient";
import { useNavigate } from "react-router-dom";

const API_URL = "/serverphp/kseb_payment.php";

const FINANCIAL_MONTHS = [
  { month: "Apr", monthIndex: 3 },
  { month: "May", monthIndex: 4 },
  { month: "Jun", monthIndex: 5 },
  { month: "Jul", monthIndex: 6 },
  { month: "Aug", monthIndex: 7 },
  { month: "Sep", monthIndex: 8 },
  { month: "Oct", monthIndex: 9 },
  { month: "Nov", monthIndex: 10 },
  { month: "Dec", monthIndex: 11 },
  { month: "Jan", monthIndex: 0 },
  { month: "Feb", monthIndex: 1 },
  { month: "Mar", monthIndex: 2 },
];

// Change this ONE value if your PHP API returns the party name under
// another field, for example "party_name" or "ledger_name".
const PARTY_FIELD = "party_name";

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

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

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

function KpiCard({ title, value, subtitle }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 18,
        boxShadow: "0 2px 8px rgba(15,23,42,.04)",
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

function ReportSteps({
  activeStep = 2,
  selectedParty = "",
  selectedYear = "all",
}) {
  const navigate = useNavigate();

  const steps = [
    {
      number: 1,
      label: "Overall Sales",
      path: "/kseboverallsales",
    },
    {
      number: 2,
      label: "Party-wise Report",
      path: "/kseblocationreport",
    },
    {
      number: 3,
      label: "Detailed Report",
      path: selectedParty
        ? `/ksebdetailreport?party=${encodeURIComponent(
            selectedParty
          )}&year=${encodeURIComponent(selectedYear || "all")}`
        : "/ksebdetailreport",
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
        boxShadow: "0 2px 8px rgba(15,23,42,.04)",
        overflowX: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 620,
        }}
      >
        {steps.map((step, index) => {
          const active = activeStep === step.number;

          return (
            <React.Fragment key={step.number}>
              <button
                type="button"
                onClick={() => navigate(step.path)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: "6px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  color: active ? "#2563eb" : "#6b7280",
                  fontWeight: active ? 800 : 650,
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
                    background: active ? "#2563eb" : "#f3f4f6",
                    color: active ? "#fff" : "#6b7280",
                    border: active
                      ? "2px solid #2563eb"
                      : "2px solid #d1d5db",
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {step.number}
                </span>

                <span style={{ fontSize: 13 }}>
                  {step.label}
                </span>
              </button>

              {index < steps.length - 1 && (
                <div
                  aria-hidden="true"
                  style={{
                    width: 70,
                    height: 2,
                    background:
                      activeStep > step.number
                        ? "#2563eb"
                        : "#e5e7eb",
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      right: -1,
                      top: -5,
                      fontSize: 14,
                      color:
                        activeStep > step.number
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

function CustomTooltip({ data }) {
  return (
    <div
      style={{
        background: "#fff",
        padding: "10px 14px",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        boxShadow: "0 8px 25px rgba(0,0,0,.10)",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {data.month}
      </div>

      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {formatCurrency(data.sales)}
      </div>
    </div>
  );
}

function normalizePartyName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}


export default function KsebPartyWiseReport() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [parties, setParties] = useState([]);

  // Read the place/year/month passed from KSEB Overall Sales.
  // The Overall page sends selectedPlace, tallyName and place;
  // selectedPlace is preferred.
  const initialQuery = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );

  const requestedPlace =
    String(
      initialQuery.get("selectedPlace") ||
      initialQuery.get("tallyName") ||
      initialQuery.get("place") ||
      ""
    ).trim();

  const requestedMonth =
    String(
      initialQuery.get("month") || ""
    ).trim();

  const [party, setParty] =
    useState(requestedPlace);

  // Empty initially. It will automatically become the
  // current financial year after the API data loads.
  const [year, setYear] = useState(
    initialQuery.get("year") || ""
  );

  const [month, setMonth] = useState(
    requestedMonth
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const locationRefs = useRef({});
  const selectedLocationRef = useRef(null);

  /*
   * IMPORTANT:
   * Clicking any location graph/card opens the detailed report
   * with the exact location and currently selected financial year.
   */
  const openLocationDetails = (locationName) => {
    if (!locationName) return;

    navigate(
      `/ksebdetailreport?party=${encodeURIComponent(
        locationName
      )}&year=${encodeURIComponent(
        year || "all"
      )}${month ? `&month=${encodeURIComponent(month)}` : ""}`
    );
  };

  useEffect(() => {
    let cancelled = false;

    async function loadKsebSales() {
      try {
        setLoading(true);
        setError("");

        const response = await apiFetch(API_URL, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        const responseText = await response.text();

        if (!response.ok) {
          throw new Error(
            `PHP API returned ${response.status}. ${responseText.slice(
              0,
              300
            )}`
          );
        }

        let json;

        try {
          json = JSON.parse(responseText);
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

        const data = Array.isArray(json.data)
          ? json.data
          : [];

        if (!cancelled) {
          setRows(data);

          const uniqueParties = Array.from(
            new Set(
              data
                .map((row) => {
                  const value = row[PARTY_FIELD];

                  return value === null ||
                    value === undefined
                    ? ""
                    : String(value).trim();
                })
                .filter(Boolean)
            )
          ).sort((a, b) => a.localeCompare(b));

          setParties(uniqueParties);

          // If this page was opened from the Overall Sales graph,
          // keep the exact requested location. Otherwise show all.
          const requested =
            String(
              initialQuery.get("selectedPlace") ||
              initialQuery.get("tallyName") ||
              initialQuery.get("place") ||
              ""
            ).trim();

          if (requested) {
            const requestedNormalized =
              normalizePartyName(requested);

            const exactMatch =
              uniqueParties.find(
                (item) =>
                  normalizePartyName(item) ===
                  requestedNormalized
              );

            if (exactMatch) {
              setParty(exactMatch);
              selectedLocationRef.current =
                exactMatch;
            } else {
              // Keep the requested value visible so the UI can show
              // that the passed place was not found in party_name.
              setParty(requested);
              selectedLocationRef.current =
                requested;

              console.warn(
                "KSEB selected place was not found in party_name:",
                requested
              );
            }
          } else {
            setParty("");
          }

          // Automatically select the current financial year only
          // when no year was supplied by the Overall page.
          if (!initialQuery.get("year")) {
            const today = new Date();

            const currentFinancialYear =
              today.getMonth() >= 3
                ? today.getFullYear()
                : today.getFullYear() - 1;

            setYear(String(currentFinancialYear));
          }
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

  function handleLocationChange(event) {
    const selectedLocation = event.target.value;

    setParty(selectedLocation);
    selectedLocationRef.current = selectedLocation;

    if (!selectedLocation) {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element =
          locationRefs.current[selectedLocation];

        if (element) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      });
    });
  }

  useEffect(() => {
    function handleOutsideClick(event) {
      const selectedLocation =
        selectedLocationRef.current;

      if (!selectedLocation) return;

      const selectedElement =
        locationRefs.current[selectedLocation];

      if (!selectedElement) return;

      // If clicked inside the selected graph/card, do nothing
      if (selectedElement.contains(event.target)) {
        return;
      }

      // Clicked outside the selected graph
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }

    document.addEventListener(
      "click",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "click",
        handleOutsideClick
      );
    };
  }, []);

  function getFinancialYear(date) {
    if (!date) return null;

    const yearValue = date.getFullYear();
    const monthValue = date.getMonth();

    return monthValue >= 3
      ? yearValue
      : yearValue - 1;
  }

  const availableYears = useMemo(() => {
    const years = new Set();

    rows.forEach((row) => {
      const date = parseDate(
        row.invoice_date || row.Date
      );

      const financialYear =
        getFinancialYear(date);

      if (financialYear !== null) {
        years.add(financialYear);
      }
    });

    return Array.from(years).sort(
      (a, b) => b - a
    );
  }, [rows]);

  const monthlyData = useMemo(() => {
    const totals = FINANCIAL_MONTHS.map(
      (item) => ({
        month: item.month,
        monthIndex: item.monthIndex,
        sales: 0,
      })
    );

    rows.forEach((row) => {
      const date = parseDate(
        row.invoice_date || row.Date
      );

      if (!date) return;

      const rowParty =
        row[PARTY_FIELD] == null
          ? ""
          : String(
              row[PARTY_FIELD]
            ).trim();

      if (
        party &&
        rowParty !== party
      ) {
        return;
      }

      const rowFinancialYear =
        getFinancialYear(date);

      if (
        year !== "all" &&
        year !== "" &&
        rowFinancialYear !== Number(year)
      ) {
        return;
      }

      const amount = Number(
        row.invoice_amount || 0
      );

      const monthPosition =
        FINANCIAL_MONTHS.findIndex(
          (item) =>
            item.monthIndex ===
            date.getMonth()
        );

      if (monthPosition === -1) return;

      totals[monthPosition].sales +=
        Number.isFinite(amount)
          ? amount
          : 0;
    });

    return totals.map((item) => ({
      ...item,
      sales: Math.round(
        item.sales * 100
      ) / 100,
    }));
  }, [rows, party, year]);

  // All KSEB locations grouped into their own
  // April-March monthly series.
  const locationMonthlyData = useMemo(() => {
    const grouped = {};

    rows.forEach((row) => {
      const date = parseDate(
        row.invoice_date || row.Date
      );

      if (!date) return;

      const location =
        row[PARTY_FIELD] == null
          ? ""
          : String(
              row[PARTY_FIELD]
            ).trim();

      if (!location) return;

      const financialYear =
        getFinancialYear(date);

      if (
        year !== "all" &&
        year !== "" &&
        financialYear !== Number(year)
      ) {
        return;
      }

      const amount = Number(
        row.invoice_amount || 0
      );

      if (!Number.isFinite(amount)) {
        return;
      }

      const monthPosition =
        FINANCIAL_MONTHS.findIndex(
          (item) =>
            item.monthIndex ===
            date.getMonth()
        );

      if (monthPosition === -1) {
        return;
      }

      if (!grouped[location]) {
        grouped[location] =
          FINANCIAL_MONTHS.map(
            (item) => ({
              month: item.month,
              monthIndex:
                item.monthIndex,
              sales: 0,
            })
          );
      }

      grouped[location][
        monthPosition
      ].sales += amount;
    });

    return Object.entries(grouped)
      .map(
        ([location, months]) => ({
          location,
          months: months.map(
            (item) => ({
              ...item,
              sales:
                Math.round(
                  item.sales * 100
                ) / 100,
            })
          ),
          totalSales:
            months.reduce(
              (sum, item) =>
                sum + item.sales,
              0
            ),
        })
      )
      .sort(
        (a, b) =>
          b.totalSales -
          a.totalSales
      );
  }, [rows, year]);


  /* =======================================================
     AUTO-FOCUS PLACE PASSED FROM OVERALL SALES

     The Overall page opens this route with:
       ?selectedPlace=<exact ledger name>
       ?tallyName=<exact ledger name>
       ?place=<exact ledger name>

     Wait until location cards exist, then select and scroll
     to the matching card.
  ======================================================= */

  useEffect(() => {
    if (!requestedPlace || !locationMonthlyData.length) {
      return;
    }

    const requestedNormalized =
      normalizePartyName(requestedPlace);

    const matchedLocation =
      locationMonthlyData.find(
        (item) =>
          normalizePartyName(item.location) ===
          requestedNormalized
      );

    if (!matchedLocation) {
      console.warn(
        "Selected KSEB place not found in locationMonthlyData:",
        requestedPlace
      );
      return;
    }

    setParty(matchedLocation.location);
    selectedLocationRef.current =
      matchedLocation.location;

    const focusTimer =
      window.setTimeout(() => {
        const element =
          locationRefs.current[
            matchedLocation.location
          ];

        if (element) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 150);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [
    requestedPlace,
    locationMonthlyData,
  ]);


  const locationTotals = useMemo(
    () =>
      locationMonthlyData.map(
        (item) => ({
          location:
            item.location,
          sales:
            Math.round(
              item.totalSales * 100
            ) / 100,
        })
      ),
    [locationMonthlyData]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const date = parseDate(
        row.invoice_date || row.Date
      );

      if (!date) return false;

      const rowParty =
        row[PARTY_FIELD] === null ||
        row[PARTY_FIELD] === undefined
          ? ""
          : String(
              row[PARTY_FIELD]
            ).trim();

      if (
        party &&
        rowParty !== party
      ) {
        return false;
      }

      const financialYear =
        getFinancialYear(date);

      if (
        year !== "all" &&
        year !== "" &&
        financialYear !== Number(year)
      ) {
        return false;
      }

      return true;
    });
  }, [rows, party, year]);

  const totalSales = useMemo(() => {
    return monthlyData.reduce(
      (total, item) =>
        total + item.sales,
      0
    );
  }, [monthlyData]);

  const averageMonthlySales =
    totalSales / 12;

  const highestMonth = useMemo(() => {
    if (!monthlyData.length) {
      return {
        month: "-",
        sales: 0,
      };
    }

    return monthlyData.reduce(
      (highest, current) =>
        current.sales >
        highest.sales
          ? current
          : highest
    );
  }, [monthlyData]);

  return (
    <>
      <Banner />
      <div
      style={{
        minHeight: "100vh",
        background: "#f6f8fb",
        padding: 24,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <ReportSteps
          activeStep={2}
          selectedParty={party}
          selectedYear={year}
        />

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
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
                letterSpacing:
                  ".08em",
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
              Party-wise Sales
              Report
            </h1>

            <p
              style={{
                margin: 0,
                color: "#6b7280",
              }}
            >
              Select a KSEB
              location to
              automatically jump
              to its monthly sales
              graph
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems:
                "center",
            }}
          >
            {/* LOCATION DROPDOWN */}
            <select
              value={party}
              onChange={
                handleLocationChange
              }
              disabled={
                loading ||
                !parties.length
              }
              style={{
                minWidth: 280,
                maxWidth: 420,
                padding:
                  "10px 14px",
                borderRadius: 9,
                border:
                  "1px solid #d1d5db",
                background: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor:
                  "pointer",
              }}
            >
              {!parties.length ? (
                <option value="">
                  {loading
                    ? "Loading locations..."
                    : "No locations found"}
                </option>
              ) : (
                <>
                  <option value="">
                    All Locations
                  </option>

                  {parties.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    )
                  )}
                </>
              )}
            </select>

            {/* FINANCIAL YEAR DROPDOWN */}
            <select
              value={year}
              onChange={(event) =>
                setYear(
                  event.target.value
                )
              }
              style={{
                minWidth: 170,
                padding:
                  "10px 14px",
                borderRadius: 9,
                border:
                  "1px solid #d1d5db",
                background: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor:
                  "pointer",
              }}
            >
              <option value="all">
                All Financial Years
              </option>

              {availableYears.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    FY {item}-
                    {String(
                      item + 1
                    ).slice(-2)}
                  </option>
                )
              )}
            </select>

            {/* FINANCIAL MONTH */}
            <select
              value={month}
              onChange={(event) =>
                setMonth(event.target.value)
              }
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
              <option value="">
                All Months
              </option>

              {FINANCIAL_MONTHS.map(
                (item) => (
                  <option
                    key={item.month}
                    value={item.month}
                  >
                    {item.month}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {/* LOCATION-WISE MONTHLY SALES */}
        <div
          style={{
            background: "#fff",
            border:
              "1px solid #e5e7eb",
            borderRadius: 14,
            padding:
              "20px 20px 18px",
            boxShadow:
              "0 2px 8px rgba(15,23,42,.04)",
          }}
        >
          <div
            style={{
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
              }}
            >
              Location-wise
              Monthly Sales
            </h2>

            <div
              style={{
                color: "#6b7280",
                fontSize: 13,
                marginTop: 4,
              }}
            >
              Every location is
              displayed separately
              — April to March
            </div>
          </div>

          {loading ? (
            <div
              style={{
                minHeight: 250,
                display: "grid",
                placeItems:
                  "center",
                color: "#6b7280",
              }}
            >
              Loading location
              charts...
            </div>
          ) : error ? (
            <div
              style={{
                minHeight: 200,
                display: "grid",
                placeItems:
                  "center",
                color: "#b91c1c",
                textAlign:
                  "center",
                padding: 20,
              }}
            >
              {error}
            </div>
          ) : locationMonthlyData.length ===
            0 ? (
            <div
              style={{
                minHeight: 200,
                display: "grid",
                placeItems:
                  "center",
                color: "#6b7280",
              }}
            >
              No location data
              found.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(430px, 1fr))",
                gap: 16,
              }}
            >
              {locationMonthlyData.map(
                (location) => (
                  <div
                    key={location.location}
                    ref={(element) => {
                      if (element) {
                        locationRefs.current[
                          location.location
                        ] = element;
                      }
                    }}
                    onClick={() =>
                      openLocationDetails(
                        location.location
                      )
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " "
                      ) {
                        event.preventDefault();
                        openLocationDetails(
                          location.location
                        );
                      }
                    }}
                    style={{
                      border:
                        party ===
                        location.location
                          ? "2px solid #2563eb"
                          : "1px solid #e5e7eb",

                      borderRadius: 12,

                      padding:
                        "14px 14px 8px",

                      background:
                        party ===
                        location.location
                          ? "#eff6ff"
                          : "#fafbfc",

                      minWidth: 0,

                      boxShadow:
                        party ===
                        location.location
                          ? "0 0 0 3px rgba(37,99,235,.12)"
                          : "none",

                      transition:
                        "all .25s ease",
                      cursor: "pointer",
                    }}
                  >
                    {/* LOCATION HEADER */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        alignItems:
                          "center",
                        gap: 10,
                        marginBottom: 4,
                      }}
                    >
                      <div
                        title={
                          location.location
                        }
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          overflow:
                            "hidden",
                          textOverflow:
                            "ellipsis",
                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {location.location}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems:
                            "center",
                          gap: 8,
                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {party ===
                          location.location && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color:
                                "#2563eb",
                              background:
                                "#dbeafe",
                              padding:
                                "3px 7px",
                              borderRadius:
                                999,
                            }}
                          >
                            Selected
                          </span>
                        )}

                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color:
                              "#2563eb",
                          }}
                        >
                          {formatCompact(
                            location.totalSales
                          )}
                        </div>
                      </div>
                    </div>

                    {/* MONTHLY GRAPH */}
                    <div
                      onClick={() =>
                        openLocationDetails(
                          location.location
                        )
                      }
                      style={{
                        height: 250,
                        cursor: "pointer",
                        position: "relative",
                        zIndex: 1,
                      }}
                      title={`Open detailed report for ${location.location}`}
                    >
                      <ResponsiveBar
                        role="application"
                        data={
                          location.months
                        }
                        keys={["sales"]}
                        indexBy="month"
                        margin={{
                          top: 10,
                          right: 10,
                          bottom: 42,
                          left: 62,
                        }}
                        padding={0.22}
                        valueScale={{
                          type: "linear",
                        }}
                        indexScale={{
                          type: "band",
                          round: true,
                        }}
                        borderRadius={3}
                        colors={(bar) =>
                          month &&
                          bar?.data?.month === month
                            ? "#2563eb"
                            : "#e9c19f"
                        }
                        enableLabel={false}
                        enableGridX={false}
                        enableGridY={true}
                        axisBottom={{
                          tickSize: 0,
                          tickPadding: 7,
                        }}
                        axisLeft={{
                          tickSize: 0,
                          tickPadding: 5,
                          format: (value) =>
                            formatCompact(
                              value
                            ),
                        }}
                        valueFormat={(value) =>
                          formatCurrency(
                            value
                          )
                        }
                        tooltip={({ data }) => (
                          <div
                            style={{
                              background:
                                "#fff",
                              padding:
                                "9px 12px",
                              border:
                                "1px solid #e5e7eb",
                              borderRadius: 8,
                              boxShadow:
                                "0 8px 25px rgba(0,0,0,.10)",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 700,
                              }}
                            >
                              {
                                location.location
                              }
                            </div>

                            <div
                              style={{
                                marginTop: 3,
                              }}
                            >
                              {
                                data.month
                              }
                              :{" "}
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
                                fontSize: 10,
                                fill: "#6b7280",
                              },
                            },
                          },
                          grid: {
                            line: {
                              stroke:
                                "#e5e7eb",
                              strokeWidth: 1,
                            },
                          },
                        }}
                      />
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* SOURCE */}
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          Source: salesdata → KSEB
          invoices. Party is read from{" "}
          <strong>
            {PARTY_FIELD}
          </strong>
          .
        </div>
      </div>
    </div>
    </>
  );
}