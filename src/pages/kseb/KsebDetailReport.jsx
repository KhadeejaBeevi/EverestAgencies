import React, { useEffect, useMemo, useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import { apiFetch } from "../../api/apiClient";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_URL = "/serverphp/kseb_payment.php";

const FINANCIAL_MONTHS = [
  { name: "April", short: "Apr", monthIndex: 3 },
  { name: "May", short: "May", monthIndex: 4 },
  { name: "June", short: "Jun", monthIndex: 5 },
  { name: "July", short: "Jul", monthIndex: 6 },
  { name: "August", short: "Aug", monthIndex: 7 },
  { name: "September", short: "Sep", monthIndex: 8 },
  { name: "October", short: "Oct", monthIndex: 9 },
  { name: "November", short: "Nov", monthIndex: 10 },
  { name: "December", short: "Dec", monthIndex: 11 },
  { name: "January", short: "Jan", monthIndex: 0 },
  { name: "February", short: "Feb", monthIndex: 1 },
  { name: "March", short: "Mar", monthIndex: 2 },
];

function parseDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  const ymd = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/
  );

  if (ymd) {
    const date = new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3])
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmy = text.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/
  );

  if (dmy) {
    const date = new Date(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1])
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getFinancialYear(date) {
  if (!date) return null;

  return date.getMonth() >= 3
    ? date.getFullYear()
    : date.getFullYear() - 1;
}

function formatDate(value) {
  const date = parseDate(value);

  if (!date) return value || "";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(value) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) return "0.00";

  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getPartyName(row) {
  return String(
    row?.party_name ||
      row?.PartyLedgerName ||
      ""
  ).trim();
}

function getInvoiceNo(row) {
  return String(
    row?.invoice_no ||
      row?.VoucherNumber ||
      ""
  ).trim();
}

function getInvoiceDate(row) {
  return row?.invoice_date || row?.Date || "";
}

function getInvoiceAmount(row) {
  const value = Number(row?.invoice_amount || 0);

  return Number.isFinite(value) ? value : 0;
}

function getFinancialMonth(date) {
  if (!date) return null;

  return (
    FINANCIAL_MONTHS.find(
      (month) =>
        month.monthIndex === date.getMonth()
    ) || null
  );
}

function isFutureDate(value) {
  const date = parseDate(value);

  if (!date) return false;

  const today = new Date();

  today.setHours(
    23,
    59,
    59,
    999
  );

  return date > today;
}

function ReportSteps({
  activeStep = 3,
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
      label: "Location-wise Report",
      path: "/kseblocationreport",
    },
    {
      number: 3,
      label: "Detailed Report",
      path: selectedParty
        ? `/ksebdetailreport?party=${encodeURIComponent(
            selectedParty
          )}&year=${encodeURIComponent(
            selectedYear || "all"
          )}`
        : "/ksebdetailreport",
    },
  ];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "8px 12px",
        marginBottom: 10,
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
                  padding: "5px 8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
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
                    width: 30,
                    height: 30,
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
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {step.number}
                </span>

                <span
                  style={{
                    fontSize: 12,
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
                    width: 45,
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
        borderRadius: 10,
        padding: 11,
        boxShadow:
          "0 2px 8px rgba(15,23,42,.04)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: "#6b7280",
          fontSize: 11,
          fontWeight: 700,
          textTransform:
            "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: "-.02em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>

      {subtitle && (
        <div
          style={{
            marginTop: 3,
            fontSize: 11,
            color: "#6b7280",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

export default function KsebDetailReport() {
  const navigate = useNavigate();

  const [searchParams] =
    useSearchParams();

  const selectedParty =
    searchParams.get("party") || "";

  const selectedYear =
    searchParams.get("year") || "all";

  const [rows, setRows] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [selectedMonth, setSelectedMonth] =
    useState("all");

  const [sortOrder, setSortOrder] =
    useState("newest");

  const [amountSort, setAmountSort] =
    useState("default");

  const [expandedInvoice, setExpandedInvoice] =
    useState(null);

  const [screenWidth, setScreenWidth] =
    useState(
      typeof window !== "undefined"
        ? window.innerWidth
        : 1200
    );

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
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

        let json;

        try {
          json = JSON.parse(
            responseText
          );
        } catch {
          throw new Error(
            `Invalid JSON returned by the KSEB API: ${responseText.slice(
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
            Array.isArray(json.data)
              ? json.data
              : []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.message ||
              "Unable to load KSEB detailed report."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleResize = () =>
      setScreenWidth(
        window.innerWidth
      );

    window.addEventListener(
      "resize",
      handleResize
    );

    return () =>
      window.removeEventListener(
        "resize",
        handleResize
      );
  }, []);

  /*
   * Filter API rows by selected location,
   * financial year and future-date protection.
   */
  const partyRows = useMemo(() => {
    return rows.filter((row) => {
      if (
        selectedParty &&
        getPartyName(row) !==
          selectedParty
      ) {
        return false;
      }

      /*
       * Never display an invoice dated
       * after today.
       */
      if (
        isFutureDate(
          getInvoiceDate(row)
        )
      ) {
        return false;
      }

      if (
        selectedYear !== "all"
      ) {
        const fy =
          getFinancialYear(
            parseDate(
              getInvoiceDate(row)
            )
          );

        if (
          fy !==
          Number(selectedYear)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    rows,
    selectedParty,
    selectedYear,
  ]);

  const filteredRows =
    useMemo(() => {
      const search = String(
        searchTerm || ""
      )
        .trim()
        .toLowerCase();

      let result = [
        ...partyRows,
      ];

      if (search) {
        const numericSearch =
          search.replace(
            /\D/g,
            ""
          );

        result =
          result.filter(
            (row) => {
              const fullText =
                JSON.stringify(
                  row || {}
                ).toLowerCase();

              if (
                fullText.includes(
                  search
                )
              ) {
                return true;
              }

              if (
                numericSearch
              ) {
                const digits =
                  JSON.stringify(
                    row || {}
                  ).replace(
                    /\D/g,
                    ""
                  );

                if (
                  digits.includes(
                    numericSearch
                  )
                ) {
                  return true;
                }
              }

              return false;
            }
          );
      }

      if (
        selectedMonth !==
        "all"
      ) {
        result =
          result.filter(
            (row) => {
              const date =
                parseDate(
                  getInvoiceDate(
                    row
                  )
                );

              return (
                date &&
                date.getMonth() ===
                  Number(
                    selectedMonth
                  )
              );
            }
          );
      }

      if (
        amountSort ===
          "highest" ||
        amountSort ===
          "lowest"
      ) {
        result.sort(
          (a, b) => {
            const difference =
              getInvoiceAmount(
                a
              ) -
              getInvoiceAmount(
                b
              );

            return amountSort ===
              "highest"
              ? -difference
              : difference;
          }
        );
      } else {
        result.sort(
          (a, b) => {
            const dateA =
              parseDate(
                getInvoiceDate(
                  a
                )
              )?.getTime() || 0;

            const dateB =
              parseDate(
                getInvoiceDate(
                  b
                )
              )?.getTime() || 0;

            if (
              dateA !== dateB
            ) {
              return sortOrder ===
                "newest"
                ? dateB -
                    dateA
                : dateA -
                    dateB;
            }

            return sortOrder ===
              "newest"
              ? getInvoiceNo(
                  b
                ).localeCompare(
                  getInvoiceNo(
                    a
                  ),
                  undefined,
                  {
                    numeric: true,
                    sensitivity:
                      "base",
                  }
                )
              : getInvoiceNo(
                  a
                ).localeCompare(
                  getInvoiceNo(
                    b
                  ),
                  undefined,
                  {
                    numeric: true,
                    sensitivity:
                      "base",
                  }
                );
          }
        );
      }

      return result;
    }, [
      partyRows,
      searchTerm,
      selectedMonth,
      sortOrder,
      amountSort,
    ]);

  const totalAmount =
    useMemo(
      () =>
        filteredRows.reduce(
          (
            sum,
            row
          ) =>
            sum +
            getInvoiceAmount(
              row
            ),
          0
        ),
      [filteredRows]
    );

  const activeMonths =
    useMemo(() => {
      const months =
        new Set();

      filteredRows.forEach(
        (row) => {
          const date =
            parseDate(
              getInvoiceDate(row)
            );

          if (date) {
            months.add(
              date.getMonth()
            );
          }
        }
      );

      return FINANCIAL_MONTHS.filter(
        (month) =>
          months.has(
            month.monthIndex
          )
      );
    }, [filteredRows]);

  const fyLabel =
    selectedYear === "all"
      ? "All Financial Years"
      : `FY ${selectedYear}-${String(
          Number(selectedYear) +
            1
        ).slice(-2)}`;

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedMonth(
      "all"
    );
    setSortOrder("newest");
    setAmountSort("default");
  };

  const getItemTotal = (
    items
  ) => {
    if (
      !Array.isArray(items)
    ) {
      return 0;
    }

    return items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item?.amount || 0
        ),
      0
    );
  };
    const renderInvoice = (
    row,
    index
  ) => {
    const invoiceNo =
      getInvoiceNo(row);

    const invoiceDate =
      getInvoiceDate(row);

    const amount =
      getInvoiceAmount(row);

    const isExpanded =
      expandedInvoice ===
      invoiceNo;

    const month =
      getFinancialMonth(
        parseDate(invoiceDate)
      );

    const items =
      Array.isArray(
        row?.items
      )
        ? row.items
        : Array.isArray(
            row?.invoice_items
          )
        ? row.invoice_items
        : [];

    return (
      <React.Fragment
        key={`${invoiceNo}-${index}`}
      >
        <tr
          onClick={() =>
            setExpandedInvoice(
              isExpanded
                ? null
                : invoiceNo
            )
          }
          style={{
            background:
              isExpanded
                ? "#f8fafc"
                : "#fff",
            borderBottom:
              "1px solid #e5e7eb",
            cursor:
              items.length > 0
                ? "pointer"
                : "default",
          }}
        >
          <td
            style={{
              ...tdStyle,
              width: 55,
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {index + 1}
          </td>

          {/* FINANCIAL MONTH */}
          <td
            style={{
              ...tdStyle,
              width: 90,
              textAlign: "center",
              whiteSpace: "nowrap",
              fontWeight: 800,
              color: "#2563eb",
            }}
          >
            {month?.short || "—"}
          </td>

          {/* ACTUAL INVOICE DATE */}
          <td
            style={{
              ...tdStyle,
              width: 125,
              whiteSpace: "nowrap",
              fontWeight: 700,
            }}
          >
            {formatDate(
              invoiceDate
            )}
          </td>

          <td
            style={{
              ...tdStyle,
              minWidth: 135,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {invoiceNo || "—"}
          </td>

          <td
            style={{
              ...tdStyle,
              minWidth: 180,
              maxWidth: 300,
            }}
          >
            {row?.order_reference ||
              row?.reference ||
              row?.order_no ||
              row?.OrderReference ||
              "—"}
          </td>

          <td
            style={{
              ...tdStyle,
              width: 150,
              textAlign: "right",
              whiteSpace: "nowrap",
              fontWeight: 800,
              color: "#111827",
            }}
          >
            ₹{" "}
            {formatAmount(
              amount
            )}
          </td>

          <td
            style={{
              ...tdStyle,
              minWidth: 125,
              whiteSpace: "nowrap",
            }}
          >
            {row?.voucher_type ||
              row?.VoucherType ||
              "—"}
          </td>
        </tr>

        {isExpanded &&
          items.length > 0 && (
            <tr>
              <td
                colSpan={7}
                style={{
                  padding: 0,
                  background:
                    "#f8fafc",
                  borderBottom:
                    "1px solid #dbeafe",
                }}
              >
                <div
                  style={{
                    padding:
                      "12px 16px 14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "space-between",
                      gap: 10,
                      marginBottom: 8,
                      flexWrap:
                        "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#1e3a8a",
                      }}
                    >
                      Invoice Items
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#111827",
                      }}
                    >
                      Items Total: ₹{" "}
                      {formatAmount(
                        getItemTotal(
                          items
                        )
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      overflowX:
                        "auto",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius: 8,
                      background:
                        "#fff",
                    }}
                  >
                    <table className="kseb-detail-item-table">
                      <thead>
                        <tr
                          style={{
                            background:
                              "#f1f5f9",
                              
                          }}
                        >
                          <th
                            style={
                              itemThStyle
                            }
                          >
                            S.No
                          </th>

                          <th
                            style={
                              itemThStyle
                            }
                          >
                            Item
                          </th>

                          <th
                            style={
                              itemThStyle
                            }
                          >
                            Quantity
                          </th>

                          <th
                            style={{
                              ...itemThStyle,
                              textAlign:
                                "right",
                            }}
                          >
                            Rate
                          </th>

                          <th
                            style={{
                              ...itemThStyle,
                              textAlign:
                                "right",
                            }}
                          >
                            Amount
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {items.map(
                          (
                            item,
                            itemIndex
                          ) => {
                            const quantity =
                              Number(
                                item?.quantity ||
                                  item?.qty ||
                                  0
                              );

                            const rate =
                              Number(
                                item?.rate ||
                                  item?.price ||
                                  0
                              );

                            const itemAmount =
                              Number(
                                item?.amount ||
                                  item?.value ||
                                  quantity *
                                    rate ||
                                  0
                              );

                            return (
                              <tr
                                key={`${invoiceNo}-item-${itemIndex}`}
                              >
                                <td
                                  style={
                                    itemTdStyle
                                  }
                                >
                                  {itemIndex +
                                    1}
                                </td>

                                <td
                                  style={
                                    itemTdStyle
                                  }
                                >
                                  {item?.item_name ||
                                    item?.name ||
                                    item?.product_name ||
                                    item?.stock_item ||
                                    item?.description ||
                                    "—"}
                                </td>

                                <td
                                  style={
                                    itemTdStyle
                                  }
                                >
                                  {quantity ||
                                    "—"}
                                </td>

                                <td
                                  style={{
                                    ...itemTdStyle,
                                    textAlign:
                                      "right",
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  ₹{" "}
                                  {formatAmount(
                                    rate
                                  )}
                                </td>

                                <td
                                  style={{
                                    ...itemTdStyle,
                                    textAlign:
                                      "right",
                                    whiteSpace:
                                      "nowrap",
                                    fontWeight:
                                      700,
                                  }}
                                >
                                  ₹{" "}
                                  {formatAmount(
                                    itemAmount
                                  )}
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </td>
            </tr>
          )}
      </React.Fragment>
    );
  };

  const tdStyle = {
    padding:
      "8px 10px",
    fontSize: 12,
    color: "#1f2937",
    verticalAlign:
      "middle",
  };

  const itemThStyle = {
    padding:
      "7px 9px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 800,
    color: "#374151",
    borderBottom:
      "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  };

  const itemTdStyle = {
    padding:
      "7px 9px",
    fontSize: 11,
    color: "#374151",
    borderBottom:
      "1px solid #f1f5f9",
  };

  /*
   * Months are shown only when they actually
   * contain invoices.
   *
   * Future months are automatically excluded
   * for the current financial year.
   */
  const visibleMonths =
    useMemo(() => {
      const currentDate =
        new Date();

      const currentFY =
        getFinancialYear(
          currentDate
        );

      const currentCalendarMonth =
        currentDate.getMonth();

      return FINANCIAL_MONTHS.filter(
        (month) => {
          if (
            selectedMonth !==
              "all" &&
            month.monthIndex !==
              Number(
                selectedMonth
              )
          ) {
            return false;
          }

          if (
            selectedYear !==
              "all" &&
            Number(selectedYear) ===
              currentFY &&
            month.monthIndex >
              currentCalendarMonth
          ) {
            return false;
          }

          return filteredRows.some(
            (row) => {
              const date =
                parseDate(
                  getInvoiceDate(
                    row
                  )
                );

              return (
                date &&
                date.getMonth() ===
                  month.monthIndex
              );
            }
          );
        }
      );
    }, [
      filteredRows,
      selectedMonth,
      selectedYear,
    ]);

  /*
   * Keep the main report as ONE table.
   * No separate month header rows are used.
   * The Month column itself identifies Apr,
   * May, Jun, etc.
   */
  const tableRows =
    useMemo(() => {
      return filteredRows;
    }, [filteredRows]);

  return (
    <>
      <Banner />

      <style>{`
        html,
        body,
        #root {
          overflow-x: hidden;
          overflow-y: auto;
          margin: 0;
          padding: 0;
        }

        * {
          box-sizing: border-box;
        }

        .kseb-detail-scroll {
          scrollbar-width: thin;
        }

        .kseb-detail-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .kseb-detail-scroll::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 5px;
        }

        .kseb-detail-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .kseb-detail-item-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .kseb-detail-item-table th,
        .kseb-detail-item-table td {
          border-bottom: 1px solid #f1f5f9;
        }

        .kseb-detail-main-table {
          width: 100%;
          min-width: 900px;
          border-collapse: separate;
          border-spacing: 0;
        }

        .kseb-detail-main-table thead th {
          position: sticky;
          top: 0;
          z-index: 5;
          background: #0f172a;
          color: #ffffff;
          box-shadow: 0 1px 0 rgba(0,0,0,.08);
        }

        .kseb-detail-main-table tbody tr:hover {
          background: #f8fafc !important;
        }

        .kseb-detail-filter-input {
          width: 100%;
          height: 34px;
          border: 1px solid #d1d5db;
          border-radius: 7px;
          padding: 0 10px;
          font-size: 12px;
          outline: none;
          background: #fff;
        }

        .kseb-detail-filter-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37,99,235,.10);
        }

        .kseb-detail-filter-select {
          width: 100%;
          height: 34px;
          border: 1px solid #d1d5db;
          border-radius: 7px;
          padding: 0 9px;
          font-size: 12px;
          outline: none;
          background: #fff;
          cursor: pointer;
        }

        .kseb-detail-filter-select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37,99,235,.10);
        }

        .kseb-detail-clear-btn {
          height: 34px;
          padding: 0 13px;
          border: 1px solid #d1d5db;
          border-radius: 7px;
          background: #fff;
          color: #374151;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        .kseb-detail-clear-btn:hover {
          background: #f9fafb;
        }

        @media (max-width: 700px) {
          .kseb-detail-main-table {
            min-width: 850px;
          }
        }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "#f6f8fb",
          padding:
            screenWidth < 700
              ? 8
              : 12,
        }}
      >
        <ReportSteps
          activeStep={3}
          selectedParty={
            selectedParty
          }
          selectedYear={
            selectedYear
          }
        />

        <div
          style={{
            background: "#fff",
            border:
              "1px solid #e5e7eb",
            borderRadius: 12,
            padding:
              screenWidth < 700
                ? 10
                : 13,
            marginBottom: 10,
            boxShadow:
              "0 2px 8px rgba(15,23,42,.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems:
                "flex-start",
              gap: 12,
              flexWrap:
                "wrap",
            }}
          >
            <div
              style={{
                minWidth: 0,
                flex: 1,
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize:
                    screenWidth < 700
                      ? 21
                      : 25,
                  lineHeight: 1.15,
                  fontWeight: 850,
                  color: "#111827",
                  letterSpacing:
                    "-.03em",
                }}
              >
                KSEB Detailed Report
              </h1>

              <div
                style={{
                  marginTop: 3,
                  fontSize:
                    screenWidth < 700
                      ? 15
                      : 18,
                  fontWeight: 750,
                  color: "#2563eb",
                  overflow:
                    "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {selectedParty ||
                  "All KSEB Parties"}
              </div>

              <p
                style={{
                  margin:
                    "3px 0 0",
                  fontSize: 11,
                  color: "#6b7280",
                }}
              >
                Invoice details by
                financial month,
                April to March.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: 6,
                flexWrap:
                  "wrap",
                justifyContent:
                  "flex-end",
              }}
            >
              <span
                style={{
                  padding:
                    "5px 9px",
                  borderRadius: 999,
                  background:
                    "#eff6ff",
                  color: "#1d4ed8",
                  border:
                    "1px solid #bfdbfe",
                  fontSize: 11,
                  fontWeight: 800,
                  whiteSpace:
                    "nowrap",
                }}
              >
                {fyLabel}
              </span>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    -1
                  )
                }
                style={{
                  height: 30,
                  padding:
                    "0 10px",
                  border:
                    "1px solid #d1d5db",
                  borderRadius: 7,
                  background:
                    "#fff",
                  color: "#374151",
                  fontSize: 11,
                  fontWeight: 750,
                  cursor:
                    "pointer",
                }}
              >
                ← Back
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                screenWidth < 650
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(4, minmax(0, 1fr))",
              gap: 8,
              marginTop: 8,
            }}
          >
            <KpiCard
              title="Invoices"
              value={
                filteredRows.length
              }
              subtitle="Visible transactions"
            />

            <KpiCard
              title="Total Amount"
              value={`₹ ${formatAmount(
                totalAmount
              )}`}
              subtitle={
                activeMonths.length
                  ? `${activeMonths.length} active months`
                  : "No active months"
              }
            />

            <KpiCard
              title="Financial Year"
              value={
                selectedYear ===
                "all"
                  ? "All"
                  : `FY ${selectedYear}-${String(
                      Number(
                        selectedYear
                      ) + 1
                    ).slice(-2)}`
              }
              subtitle="April – March"
            />

            <KpiCard
              title="Party"
              value={
                selectedParty
                  ? selectedParty
                  : "All Parties"
              }
              subtitle="Selected location"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                screenWidth < 700
                  ? "1fr"
                  : "minmax(220px, 2fr) repeat(3, minmax(140px, 1fr)) auto",
              gap: 7,
              marginTop: 8,
              alignItems:
                "center",
            }}
          >
            <input
              className="kseb-detail-filter-input"
              type="text"
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(
                  e.target.value
                )
              }
              placeholder="Search invoice, reference, party, amount..."
            />

            <select
              className="kseb-detail-filter-select"
              value={
                selectedMonth
              }
              onChange={(e) =>
                setSelectedMonth(
                  e.target.value
                )
              }
            >
              <option value="all">
                All Months
              </option>

              {FINANCIAL_MONTHS.map(
                (month) => (
                  <option
                    key={
                      month.monthIndex
                    }
                    value={
                      month.monthIndex
                    }
                  >
                    {month.name}
                  </option>
                )
              )}
            </select>

            <select
              className="kseb-detail-filter-select"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(
                  e.target.value
                );
                setAmountSort(
                  "default"
                );
              }}
            >
              <option value="newest">
                Date: Newest
              </option>
              <option value="oldest">
                Date: Oldest
              </option>
            </select>

            <select
              className="kseb-detail-filter-select"
              value={
                amountSort
              }
              onChange={(e) => {
                setAmountSort(
                  e.target.value
                );
                if (
                  e.target.value !==
                  "default"
                ) {
                  setSortOrder(
                    "newest"
                  );
                }
              }}
            >
              <option value="default">
                Amount: Default
              </option>
              <option value="highest">
                Amount: Highest
              </option>
              <option value="lowest">
                Amount: Lowest
              </option>
            </select>

            <button
              type="button"
              className="kseb-detail-clear-btn"
              onClick={
                clearFilters
              }
            >
              Clear
            </button>
          </div>
        </div>
                  {loading && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 25,
                textAlign: "center",
                color: "#6b7280",
                fontSize: 13,
                fontWeight: 650,
              }}
            >
              Loading KSEB detailed report...
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: 18,
                color: "#b91c1c",
                fontSize: 13,
                fontWeight: 650,
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && (
            <div
              className="kseb-detail-scroll"
              style={{
                paddingBottom: 30,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  overflow: "hidden",
                  boxShadow:
                    "0 2px 8px rgba(15,23,42,.04)",
                }}
              >
                <div
                  style={{
                    padding:
                      screenWidth < 700
                        ? "10px 12px"
                        : "11px 14px",
                    borderBottom:
                      "1px solid #e5e7eb",
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 850,
                        color: "#111827",
                      }}
                    >
                      Invoice Transactions
                    </div>

                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 11,
                        color: "#6b7280",
                      }}
                    >
                      Month • Invoice Date •
                      Invoice No • Reference •
                      Amount • Voucher Type
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        padding:
                          "5px 8px",
                        borderRadius: 6,
                        background:
                          "#f8fafc",
                        border:
                          "1px solid #e5e7eb",
                        color: "#475569",
                        fontSize: 11,
                        fontWeight: 750,
                      }}
                    >
                      {tableRows.length}{" "}
                      records
                    </span>

                    <span
                      style={{
                        padding:
                          "5px 8px",
                        borderRadius: 6,
                        background:
                          "#eff6ff",
                        border:
                          "1px solid #bfdbfe",
                        color: "#1d4ed8",
                        fontSize: 11,
                        fontWeight: 750,
                      }}
                    >
                      Future invoices hidden
                    </span>
                  </div>
                </div>

                {tableRows.length === 0 ? (
                  <div
                    style={{
                      padding: 35,
                      textAlign: "center",
                      color: "#6b7280",
                      fontSize: 13,
                    }}
                  >
                    No invoice transactions
                    found for the selected
                    filters.
                  </div>
                ) : (
                  <div
                    style={{
                      overflowX: "auto",
                      overflowY: "visible",
                      width: "100%",
                    }}
                  >
                    <table className="kseb-detail-main-table">
                      <thead>
                        <tr>
                          <th
                            style={{
                              padding:
                                "9px 10px",
                              width: 55,
                              textAlign:
                                "center",
                              fontSize: 11,
                              fontWeight: 800,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            S.No
                          </th>

                          <th
                            style={{
                              padding:
                                "9px 10px",
                              width: 90,
                              textAlign:
                                "center",
                              fontSize: 11,
                              fontWeight: 800,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            Month
                          </th>

                          <th
                            style={{
                              padding:
                                "9px 10px",
                              width: 125,
                              fontSize: 11,
                              fontWeight: 800,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            Invoice Date
                          </th>

                          <th
                            style={{
                              padding:
                                "9px 10px",
                              minWidth: 135,
                              fontSize: 11,
                              fontWeight: 800,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            Invoice No
                          </th>

                          <th
                            style={{
                              padding:
                                "9px 10px",
                              minWidth: 180,
                              fontSize: 11,
                              fontWeight: 800,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            Order / Reference
                          </th>

                          <th
                            style={{
                              padding:
                                "9px 10px",
                              width: 150,
                              textAlign:
                                "right",
                              fontSize: 11,
                              fontWeight: 800,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            Invoice Amount
                          </th>

                          <th
                            style={{
                              padding:
                                "9px 10px",
                              minWidth: 125,
                              fontSize: 11,
                              fontWeight: 800,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            Voucher Type
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {tableRows.map(
                          (
                            row,
                            index
                          ) =>
                            renderInvoice(
                              row,
                              index
                            )
                        )}
                      </tbody>

                      <tfoot>
                        <tr
                          style={{
                            background:
                              "#f8fafc",
                            borderTop:
                              "2px solid #cbd5e1",
                          }}
                        >
                          <td
                            colSpan={5}
                            style={{
                              padding:
                                "10px 12px",
                              textAlign:
                                "right",
                              fontSize: 12,
                              fontWeight: 850,
                              color:
                                "#374151",
                            }}
                          >
                            Total
                          </td>

                          <td
                            style={{
                              padding:
                                "10px 12px",
                              textAlign:
                                "right",
                              fontSize: 13,
                              fontWeight: 900,
                              color:
                                "#111827",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            ₹{" "}
                            {formatAmount(
                              totalAmount
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "10px 12px",
                            }}
                          />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      
    </>
  );
}