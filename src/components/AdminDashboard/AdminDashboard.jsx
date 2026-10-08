import Banner from "../Banner/Banner.jsx";
import React, {
  useState,
  useEffect,
  useMemo,
} from "react";

import { auth, db } from "../firebase";

import { Link } from "react-router-dom";

import "./AdminDashboard.css";
import { EditProfileModal } from "../MyProfile/MyProfile.jsx";
import PhotoViewer from "../MyProfile/PhotoViewer.jsx";

import {
  Pencil,
  Users,
  FileClock,
  MapPinned,
  ClipboardList,
  CircleCheck,
  Clock3,
} from "lucide-react";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  ResponsiveBar,
} from "@nivo/bar";

import {
  apiFetch,
} from "../../api/apiClient";
const API = "/serverphp";


const AdminDashboard = () => {


  /* =========================================================
     ADMIN DETAILS
  ========================================================= */

  const [
    adminDetails,
    setAdminDetails,
  ] = useState(null);

  const [showEditProfile, setShowEditProfile] = useState(false);

  const [showPhoto, setShowPhoto] = useState(false);


  /* =========================================================
     DASHBOARD COUNTS
  ========================================================= */

  const [
    attendanceToday,
    setAttendanceToday,
  ] = useState(0);


  const [
    postdatedCheques,
    setPostdatedCheques,
  ] = useState(0);


  const [
    siteVisits,
    setSiteVisits,
  ] = useState(0);


  /* =========================================================
     CURRENT MONTH SUMMARY
  ========================================================= */

  const [
    totalEnquiries,
    setTotalEnquiries,
  ] = useState(0);


  const [
    totalBilled,
    setTotalBilled,
  ] = useState(0);


  const [
    quotationPending,
    setQuotationPending,
  ] = useState(0);


  const [
    summaryLoading,
    setSummaryLoading,
  ] = useState(true);


  /* =========================================================
     SALES GRAPH
  ========================================================= */

  const [
    salesChartData,
    setSalesChartData,
  ] = useState([]);


  const [
    salesMonths,
    setSalesMonths,
  ] = useState([]);


  const [
    salesFinancialYear,
    setSalesFinancialYear,
  ] = useState("");


  const [
    salesLoading,
    setSalesLoading,
  ] = useState(true);


  /* =========================================================
     DATE HELPER
     CONVERT DIFFERENT DATE FORMATS TO DATE OBJECT
  ========================================================= */

  const parseDashboardDate = (
    value
  ) => {

    if (
      !value
    ) {
      return null;
    }


    const dateValue =
      String(value)
        .trim();


    /*
    ========================================================
    YYYY-MM-DD
    ========================================================
    */

    if (
      /^\d{4}-\d{2}-\d{2}/.test(
        dateValue
      )
    ) {

      const [
        year,
        month,
        day,
      ] =
        dateValue
          .substring(
            0,
            10
          )
          .split("-")
          .map(Number);


      return new Date(
        year,
        month - 1,
        day
      );

    }


    /*
    ========================================================
    DD-MM-YYYY
    ========================================================
    */

    if (
      /^\d{2}-\d{2}-\d{4}$/.test(
        dateValue
      )
    ) {

      const [
        day,
        month,
        year,
      ] =
        dateValue
          .split("-")
          .map(Number);


      return new Date(
        year,
        month - 1,
        day
      );

    }


    /*
    ========================================================
    DD/MM/YYYY
    ========================================================
    */

    if (
      /^\d{2}\/\d{2}\/\d{4}$/.test(
        dateValue
      )
    ) {

      const [
        day,
        month,
        year,
      ] =
        dateValue
          .split("/")
          .map(Number);


      return new Date(
        year,
        month - 1,
        day
      );

    }


    const parsedDate =
      new Date(
        dateValue
      );


    if (
      Number.isNaN(
        parsedDate.getTime()
      )
    ) {
      return null;
    }


    return parsedDate;

  };


  /* =========================================================
     CHECK CURRENT MONTH
  ========================================================= */

  const isCurrentMonth = (
    dateValue
  ) => {

    const parsedDate =
      parseDashboardDate(
        dateValue
      );


    if (
      !parsedDate
    ) {
      return false;
    }


    const today =
      new Date();


    return (

      parsedDate.getFullYear() ===
      today.getFullYear()

      &&

      parsedDate.getMonth() ===
      today.getMonth()

    );

  };


  /* =========================================================
     GET CURRENT FINANCIAL YEAR
  ========================================================= */

  const getFinancialYear = () => {

    const currentDate =
      new Date();


    const currentYear =
      currentDate.getFullYear();


    const currentMonth =
      currentDate.getMonth() + 1;


    if (
      currentMonth >= 4
    ) {

      return currentYear;

    }


    return currentYear - 1;

  };


  /* =========================================================
     GET VISIBLE MONTHS
  ========================================================= */

  const getVisibleMonths = (
    financialYear
  ) => {

    const allMonths = [
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
    ];


    const currentDate =
      new Date();


    const currentMonth =
      currentDate.getMonth() + 1;


    const currentFinancialYear =
      getFinancialYear();


    if (
      financialYear ===
      currentFinancialYear
    ) {

      let currentFinancialMonthIndex;


      if (
        currentMonth >= 4
      ) {

        currentFinancialMonthIndex =
          currentMonth - 4;

      } else {

        currentFinancialMonthIndex =
          currentMonth + 8;

      }


      return allMonths.slice(
        0,
        currentFinancialMonthIndex + 1
      );

    }


    return allMonths;

  };


  /* =========================================================
     FETCH DASHBOARD DATA
  ========================================================= */

  useEffect(() => {

    const unsubscribe =
      auth.onAuthStateChanged(
        async (user) => {


          /* =================================================
             CHECK LOGIN
          ================================================= */

          if (
            !user
          ) {

            window.location.href =
              "/";

            return;

          }


          try {


            /* =================================================
               CHECK ADMIN ROLE
            ================================================= */

            const roleRef =
              doc(
                db,
                "roles",
                user.uid
              );


            const roleSnap =
              await getDoc(
                roleRef
              );


            if (
              !roleSnap.exists()
            ) {

              window.location.href =
                "/";

              return;

            }


            const roleData =
              roleSnap.data();


            if (
              roleData.role !==
              "admin"
            ) {

              alert(
                "Access Denied"
              );


              window.location.href =
                "/";

              return;

            }


            /* =================================================
               FETCH ADMIN DETAILS
            ================================================= */

            const userRef =
              doc(
                db,
                "Users",
                user.uid
              );


            const userSnap =
              await getDoc(
                userRef
              );


            if (
              userSnap.exists()
            ) {

              setAdminDetails(
                userSnap.data()
              );

            }


            /* =================================================
               TODAY
            ================================================= */

            const today =
              new Date()
                .toISOString()
                .split("T")[0];


            /* =================================================
               ATTENDANCE
            ================================================= */

            try {

              const attendanceResponse =
                await apiFetch(
                  `${API}/getattendance.php?date=${today}`
                );


              const attendanceData =
                await attendanceResponse.json();


              const uniqueUsers =
                {};


              if (
                Array.isArray(
                  attendanceData
                )
              ) {

                attendanceData.forEach(
                  (item) => {

                    if (
                      item.user_id !==
                      undefined

                      &&

                      item.user_id !==
                      null
                    ) {

                      uniqueUsers[
                        item.user_id
                      ] = true;

                    }

                  }
                );

              }


              setAttendanceToday(
                Object.keys(
                  uniqueUsers
                ).length
              );

            } catch (
              attendanceError
            ) {

              console.error(
                "Attendance error:",
                attendanceError
              );

            }


            /* =================================================
               POSTDATED CHEQUES
            ================================================= */

            try {

              const chequeResponse =
                await apiFetch(
                  `${API}/postdatedcheques.php`
                );


              const chequeData =
                await chequeResponse.json();


              if (

                chequeData.status ===
                "success"

                &&

                Array.isArray(
                  chequeData.data
                )

              ) {

                const pendingCheques =
                  chequeData.data.filter(
                    (c) => {

                      const bankDate =
                        String(
                          c.bank_date ||
                          ""
                        )
                          .trim()
                          .toLowerCase();


                      return (

                        bankDate === ""

                        ||

                        bankDate ===
                        "null"

                        ||

                        bankDate ===
                        "1970-01-01"

                        ||

                        bankDate ===
                        "0000-00-00"

                      );

                    }
                  );


                setPostdatedCheques(
                  pendingCheques.length
                );

              } else {

                setPostdatedCheques(
                  0
                );

              }

            } catch (
              chequeError
            ) {

              console.error(
                "Cheque error:",
                chequeError
              );

            }


            /* =================================================
               SITE VISITS
            ================================================= */

            try {

              const siteVisitResponse =
                await apiFetch(
                  `${API}/get_site_visit.php`
                );


              const siteVisitData =
                await siteVisitResponse.json();


              if (
                Array.isArray(
                  siteVisitData
                )
              ) {

                setSiteVisits(
                  siteVisitData.length
                );

              } else {

                setSiteVisits(
                  0
                );

              }

            } catch (
              siteVisitError
            ) {

              console.error(
                "Site visit error:",
                siteVisitError
              );

            }


            /* =================================================
               CURRENT MONTH SUMMARY
            ================================================= */

            try {

              setSummaryLoading(
                true
              );


              /*
              -------------------------------------------------
              FETCH BOTH APIs AT THE SAME TIME
              -------------------------------------------------
              */

              const [

                enquiryResponse,

                quotationResponse,

              ] =
                await Promise.all([

                  apiFetch(
                    `${API}/enquiry_report.php`
                  ),

                  apiFetch(
                    `${API}/quotation_wise.php`
                  ),

                ]);


              /*
              -------------------------------------------------
              CHECK HTTP RESPONSES
              -------------------------------------------------
              */

              if (
                !enquiryResponse.ok
              ) {

                throw new Error(
                  `Enquiry API failed: ${enquiryResponse.status}`
                );

              }


              if (
                !quotationResponse.ok
              ) {

                throw new Error(
                  `Quotation API failed: ${quotationResponse.status}`
                );

              }


              const [
                enquiryData,
                quotationData,
              ] =
                await Promise.all([

                  enquiryResponse.json(),

                  quotationResponse.json(),

                ]);


              console.log(
                "ENQUIRY DASHBOARD DATA:",
                enquiryData
              );


              console.log(
                "QUOTATION DASHBOARD DATA:",
                quotationData
              );


              /*
              -------------------------------------------------
              NORMALIZE ENQUIRY RESPONSE
              -------------------------------------------------
              */

              let enquiries =
                [];


              if (
                Array.isArray(
                  enquiryData
                )
              ) {

                enquiries =
                  enquiryData;

              } else if (
                Array.isArray(
                  enquiryData?.data
                )
              ) {

                enquiries =
                  enquiryData.data;

              }


              /*
              -------------------------------------------------
              NORMALIZE QUOTATION RESPONSE
              -------------------------------------------------
              */

              let quotations =
                [];


              if (
                Array.isArray(
                  quotationData
                )
              ) {

                quotations =
                  quotationData;

              } else if (
                Array.isArray(
                  quotationData?.data
                )
              ) {

                quotations =
                  quotationData.data;

              }


              /*
              -------------------------------------------------
              CURRENT MONTH ENQUIRIES
              -------------------------------------------------
              */

              const currentMonthEnquiries =
                enquiries.filter(
                  (item) => {

                    return isCurrentMonth(
                      item.enquiry_date
                    );

                  }
                );


              /*
              -------------------------------------------------
              CURRENT MONTH BILLED
              -------------------------------------------------
              */

              const currentMonthBilled =
                quotations.filter(
                  (item) => {

                    const status =
                      String(
                        item.status ||
                        ""
                      )
                        .trim()
                        .toLowerCase();


                    return (

                      isCurrentMonth(
                        item.date
                      )

                      &&

                      status ===
                      "billed"

                    );

                  }
                );


              /*
              -------------------------------------------------
              CURRENT MONTH QUOTATION PENDING
              -------------------------------------------------
              */

              const currentMonthQuotationPending =
                quotations.filter(
                  (item) => {

                    const status =
                      String(
                        item.status ||
                        ""
                      )
                        .trim()
                        .toLowerCase();


                    return (

                      isCurrentMonth(
                        item.date
                      )

                      &&

                      (
                        status ===
                        "quotation only"

                        ||

                        status ===
                        "quotation"

                        ||

                        status ===
                        "pending"
                      )

                    );

                  }
                );


              /*
              -------------------------------------------------
              UPDATE COUNTS
              -------------------------------------------------
              */

              setTotalEnquiries(
                currentMonthEnquiries.length
              );


              setTotalBilled(
                currentMonthBilled.length
              );


              setQuotationPending(
                currentMonthQuotationPending.length
              );


              console.log(
                "CURRENT MONTH SUMMARY:",
                {

                  enquiries:
                    currentMonthEnquiries.length,

                  billed:
                    currentMonthBilled.length,

                  quotationPending:
                    currentMonthQuotationPending.length,

                }
              );

            } catch (
              summaryError
            ) {

              console.error(
                "Current month summary error:",
                summaryError
              );


              setTotalEnquiries(
                0
              );


              setTotalBilled(
                0
              );


              setQuotationPending(
                0
              );

            } finally {

              setSummaryLoading(
                false
              );

            }


            /* =================================================
               TOP 10 MOVING ITEMS
            ================================================= */

            try {

              setSalesLoading(
                true
              );


              const financialYear =
                getFinancialYear();


              const salesResponse =
                await apiFetch(
                  `${API}/get_sales_movement.php?financial_year=${financialYear}`
                );


              const salesData =
                await salesResponse.json();


              console.log(
                "TOP 10 SALES DATA:",
                salesData
              );


              if (

                salesData.status !==
                "success"

                ||

                !Array.isArray(
                  salesData.data
                )

              ) {

                console.error(
                  "Invalid sales API response:",
                  salesData
                );


                setSalesChartData(
                  []
                );


                setSalesMonths(
                  []
                );


                setSalesFinancialYear(
                  `${financialYear}-${String(
                    financialYear + 1
                  ).slice(-2)}`
                );

              } else {


                const visibleMonths =
                  getVisibleMonths(
                    financialYear
                  );


                const formattedChartData =
                  salesData.data
                    .slice(0, 10)
                    .map(
                      (item) => {

                        const row = {
                          item:
                            item.item ||
                            "Unknown",
                        };


                        let itemTotalQty =
                          0;


                        let itemTotalValue =
                          0;


                        visibleMonths.forEach(
                          (month) => {

                            const monthData =
                              item?.months?.[
                                month
                              ] || {};


                            const qty =
                              Number(
                                monthData.qty ||
                                0
                              );


                            const value =
                              Number(
                                monthData.value ||
                                monthData.total_value ||
                                0
                              );


                            row[month] =
                              qty;


                            row[
                              `${month}_value`
                            ] =
                              value;


                            row[
                              `${month}_rate`
                            ] =
                              Number(
                                monthData.avg_rate ||
                                monthData.rate ||
                                0
                              );


                            itemTotalQty +=
                              qty;


                            itemTotalValue +=
                              value;

                          }
                        );


                        row.totalQty =
                          itemTotalQty;


                        row.totalValue =
                          itemTotalValue;


                        row.avgRate =
                          itemTotalQty > 0
                            ? itemTotalValue /
                              itemTotalQty
                            : 0;


                        return row;

                      }
                    );


                setSalesChartData(
                  formattedChartData
                );


                setSalesMonths(
                  visibleMonths
                );


                setSalesFinancialYear(
                  `${financialYear}-${String(
                    financialYear + 1
                  ).slice(-2)}`
                );

              }

            } catch (
              salesError
            ) {

              console.error(
                "Sales graph error:",
                salesError
              );


              setSalesChartData(
                []
              );


              setSalesMonths(
                []
              );

            } finally {

              setSalesLoading(
                false
              );

            }


          } catch (
            error
          ) {

            console.error(
              "Dashboard Error:",
              error
            );


            setSalesLoading(
              false
            );


            setSummaryLoading(
              false
            );

          }

        }
      );


    return () =>
      unsubscribe();

  }, []);


  /* =========================================================
     MONTH LABELS INSIDE BARS
  ========================================================= */

  const MonthLabelsLayer = ({
    bars,
  }) => {

    return (

      <g>

        {
          bars.map(
            (bar) => {

              const {
                x,
                y,
                width,
                height,
                data,
              } =
                bar;


              if (
                height < 20
              ) {

                return null;

              }


              return (

                <text

                  key={
                    `${data.indexValue}-${data.id}`
                  }

                  x={
                    x +
                    width / 2
                  }

                  y={
                    y +
                    height -
                    6
                  }

                  textAnchor="middle"

                  fontSize={10}

                  fontWeight={700}

                  fill="#1e293b"

                  pointerEvents="none"
                >

                  {data.id}

                </text>

              );

            }
          )
        }

      </g>

    );

  };


  /* =========================================================
     ITEM TOTALS
  ========================================================= */

  const itemTotals =
    useMemo(() => {

      return salesChartData.map(
        (item) => {

          let totalQty =
            0;

          let totalValue =
            0;


          salesMonths.forEach(
            (month) => {

              totalQty +=
                Number(
                  item?.[
                    month
                  ] || 0
                );


              totalValue +=
                Number(
                  item?.[
                    `${month}_value`
                  ] || 0
                );

            }
          );


          const avgRate =
            totalQty > 0
              ? totalValue /
                totalQty
              : 0;


          return {

            item:
              item.item ||
              "Unknown",

            totalQty,

            totalValue,

            avgRate,

          };

        }
      );

    }, [

      salesChartData,

      salesMonths,

    ]);


  /* =========================================================
     CUSTOM X AXIS TICK
  ========================================================= */

  const ItemAxisTick = ({
    x,
    y,
    value,
  }) => {

    const itemName =
      String(
        value || ""
      );


    const words =
      itemName.split(
        " "
      );


    const lines =
      [];


    let currentLine =
      "";


    words.forEach(
      (word) => {

        const testLine =
          currentLine
            ? `${currentLine} ${word}`
            : word;


        if (
          testLine.length > 18
        ) {

          if (
            currentLine
          ) {

            lines.push(
              currentLine
            );

          }


          currentLine =
            word;

        } else {

          currentLine =
            testLine;

        }

      }
    );


    if (
      currentLine
    ) {

      lines.push(
        currentLine
      );

    }


    const visibleLines =
      lines.slice(
        0,
        4
      );


    return (

      <g
        transform={`
          translate(${x},${y})
        `}
      >

        {
          visibleLines.map(
            (
              line,
              index
            ) => (

              <text

                key={
                  `${line}-${index}`
                }

                x={0}

                y={
                  15 +
                  index * 14
                }

                textAnchor="middle"

                fontSize={11}

                fontWeight={600}

                fill="#334155"
              >

                {line}

              </text>

            )
          )
        }

      </g>

    );

  };


  /* =========================================================
     ITEM SUMMARY BOX
  ========================================================= */

  const ItemSummaryLayer = ({
    bars,
  }) => {

    const itemGroups =
      {};


    bars.forEach(
      (bar) => {

        const itemName =
          bar.data.indexValue;


        if (
          !itemGroups[
            itemName
          ]
        ) {

          itemGroups[
            itemName
          ] = {

            bars: [],

            data:
              bar.data.data,

          };

        }


        itemGroups[
          itemName
        ].bars.push(
          bar
        );

      }
    );


    return (

      <g>

        {
          Object.entries(
            itemGroups
          ).map(
            (
              [
                itemName,
                group,
              ]
            ) => {

              const itemBars =
                group.bars;


              const rowData =
                group.data || {};


              if (
                !itemBars.length
              ) {

                return null;

              }


              const leftX =
                Math.min(
                  ...itemBars.map(
                    (bar) =>
                      bar.x
                  )
                );


              const rightX =
                Math.max(
                  ...itemBars.map(
                    (bar) =>
                      bar.x +
                      bar.width
                  )
                );


              const groupWidth =
                rightX -
                leftX;


              const boxWidth =
                Math.max(
                  groupWidth + 8,
                  115
                );


              const boxHeight =
                66;


              const boxX =
                leftX +
                (
                  groupWidth -
                  boxWidth
                ) / 2;


              const boxY =
                -150;


              const totalQty =
                Number(
                  rowData.totalQty ||
                  0
                );


              const totalValue =
                Number(
                  rowData.totalValue ||
                  0
                );


              const avgRate =
                Number(
                  rowData.avgRate ||
                  0
                );


              return (

                <g
                  key={
                    `summary-${itemName}`
                  }
                >

                  <rect

                    x={boxX}

                    y={boxY}

                    width={boxWidth}

                    height={boxHeight}

                    rx={7}

                    ry={7}

                    fill="#ffffff"

                    stroke="#dbe3ed"

                    strokeWidth={1}

                    style={{
                      filter:
                        "drop-shadow(0px 2px 4px rgba(15,23,42,0.10))",
                    }}
                  />


                  <text
                    x={
                      boxX + 8
                    }
                    y={
                      boxY + 17
                    }
                    fontSize={9}
                    fontWeight={600}
                    fill="#64748b"
                  >
                    Total Qty
                  </text>

                  <text
                    x={
                      boxX +
                      boxWidth -
                      8
                    }
                    y={
                      boxY + 17
                    }
                    textAnchor="end"
                    fontSize={10}
                    fontWeight={700}
                    fill="#0f172a"
                  >
                    {
                      totalQty.toLocaleString(
                        "en-IN"
                      )
                    }
                  </text>


                  <text
                    x={
                      boxX + 8
                    }
                    y={
                      boxY + 35
                    }
                    fontSize={9}
                    fontWeight={600}
                    fill="#64748b"
                  >
                    Total Value
                  </text>

                  <text
                    x={
                      boxX +
                      boxWidth -
                      8
                    }
                    y={
                      boxY + 35
                    }
                    textAnchor="end"
                    fontSize={9}
                    fontWeight={700}
                    fill="#15803d"
                  >
                    ₹
                    {
                      totalValue.toLocaleString(
                        "en-IN",
                        {
                          maximumFractionDigits:
                            0,
                        }
                      )
                    }
                  </text>


                  <text
                    x={
                      boxX + 8
                    }
                    y={
                      boxY + 53
                    }
                    fontSize={9}
                    fontWeight={600}
                    fill="#64748b"
                  >
                    Avg Rate
                  </text>

                  <text
                    x={
                      boxX +
                      boxWidth -
                      8
                    }
                    y={
                      boxY + 53
                    }
                    textAnchor="end"
                    fontSize={9}
                    fontWeight={700}
                    fill="#2563eb"
                  >
                    ₹
                    {
                      avgRate.toLocaleString(
                        "en-IN",
                        {
                          minimumFractionDigits:
                            2,

                          maximumFractionDigits:
                            2,
                        }
                      )
                    }
                  </text>

                </g>

              );

            }
          )
        }

      </g>

    );

  };


  /* =========================================================
     CURRENT MONTH NAME
  ========================================================= */

  const currentMonthName =
    new Date().toLocaleString(
      "en-IN",
      {
        month:
          "long",

        year:
          "numeric",
      }
    );


  /* =========================================================
     RENDER
  ========================================================= */

  return (

    <div
      className="
        min-h-screen
        bg-gradient-to-br
        from-slate-100
        via-white
        to-slate-200
      "
    >

      <Banner />

      <PhotoViewer
        open={showPhoto}
        photo={adminDetails?.photo}
        name={`${adminDetails?.firstName || ""} ${adminDetails?.lastName || ""}`.trim()}
        onClose={() => setShowPhoto(false)}
      />

      <EditProfileModal
        open={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onSaved={(updates) =>
          setAdminDetails((prev) => ({ ...prev, ...updates }))
        }
      />


      <main
        className="
          p-4
          md:p-8
          space-y-6
          md:space-y-8
        "
      >


        {/* ===================================================
            WELCOME SECTION
        =================================================== */}

        <div
          className="
            bg-gradient-to-r
            from-slate-900
            via-slate-800
            to-slate-900
            rounded-3xl
            p-8
            shadow-lg
            border
            border-slate-700
            text-white
          "
        >

          <div
            className="
              flex
              flex-col
              md:flex-row
              items-center
              justify-between
              gap-8
            "
          >

            <div>

              <h1
                className="
                  text-4xl
                  font-bold
                "
              >

                Welcome Back,{" "}

                {
                  adminDetails?.firstName ||
                  "Admin"
                }

              </h1>


              <p
                className="
                  mt-3
                  text-slate-300
                  text-lg
                "
              >

                Manage your Everest operations
                easily from the dashboard.

              </p>

            </div>


            <div
              className="
                bg-slate-800/60
                backdrop-blur-xl
                border
                border-slate-700
                p-6
                rounded-3xl
                min-w-[320px]
              "
            >

              <div
                className="
                  flex
                  items-center
                  gap-4
                "
              >

                {
                  adminDetails?.photo ? (

                    <img

                      src={
                        adminDetails.photo
                      }
                    onClick={() => setShowPhoto(true)}
                    title="View photo"
                    style={{ cursor: "zoom-in" }}

                      alt="Profile"

                      className="
                        w-20
                        h-20
                        rounded-full
                        object-cover
                        border-4
                        border-white
                      "
                    />

                  ) : (

                    <div
                      className="
                        w-20
                        h-20
                        rounded-full
                        bg-white
                        text-red-600
                        flex
                        items-center
                        justify-center
                        text-3xl
                        font-bold
                      "
                    >

                      {
                        adminDetails
                          ?.firstName
                          ?.charAt(0) ||
                        "A"
                      }

                    </div>

                  )
                }


                <div>

                  <h2
                    className="
                      text-2xl
                      font-bold
                      text-white
                    "
                  >

                    {
                      adminDetails?.firstName ||
                      "Admin"
                    }

                  </h2>


                  <p
                    className="
                      text-slate-300
                    "
                  >

                    Administrator

                  </p>

                </div>

              </div>


              <div
                className="
                  mt-5
                  space-y-2
                  text-sm
                  text-white
                "
              >

                <p>

                  <span
                    className="
                      font-semibold
                    "
                  >
                    Email:
                  </span>{" "}

                  {
                    adminDetails?.email ||
                    "-"
                  }

                </p>


                <p>

                  <span
                    className="
                      font-semibold
                    "
                  >
                    First Name:
                  </span>{" "}

                  {
                    adminDetails?.firstName ||
                    "-"
                  }

                </p>


                <p>

                  <span
                    className="
                      font-semibold
                    "
                  >
                    Last Name:
                  </span>{" "}

                  {
                    adminDetails?.lastName ||
                    "-"
                  }

                </p>

                {adminDetails?.phone && (
                  <p>
                    <span className="font-semibold">Phone:</span>{" "}
                    {adminDetails.phone}
                  </p>
                )}

              </div>

              <button
                type="button"
                onClick={() => setShowEditProfile(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-white/90 hover:bg-white text-gray-800 text-sm font-semibold px-4 py-2 rounded-full transition"
              >
                <Pencil size={14} />
                Edit Profile
              </button>

            </div>

          </div>

        </div>


        {/* ===================================================
            CURRENT MONTH SUMMARY - SINGLE TILE
        =================================================== */}

        <div
          className="
            bg-white
            border
            border-slate-200
            rounded-3xl
            shadow-sm
            p-6
            md:p-8
          "
        >

          <div
            className="
              flex
              flex-col
              md:flex-row
              md:items-center
              md:justify-between
              gap-4
              mb-6
            "
          >

            <div>

              <h2
                className="
                  text-2xl
                  font-bold
                  text-gray-800
                "
              >

                Current Month Summary

              </h2>


              <p
                className="
                  text-sm
                  text-gray-500
                  mt-1
                "
              >

                {currentMonthName}

              </p>

            </div>


            {
              summaryLoading && (

                <div
                  className="
                    text-sm
                    text-blue-600
                    font-medium
                  "
                >

                  Loading summary...

                </div>

              )
            }

          </div>


          <div
            className="
              grid
              grid-cols-1
              md:grid-cols-3
              gap-5
            "
          >


            {/* TOTAL ENQUIRIES */}

            <div
              className="
                border
                border-blue-100
                bg-blue-50
                rounded-2xl
                p-5
              "
            >

              <div
                className="
                  flex
                  items-center
                  justify-between
                "
              >

                <div>

                  <p
                    className="
                      text-sm
                      font-semibold
                      text-blue-700
                    "
                  >
                    Total Enquiries
                  </p>


                  <p
                    className="
                      mt-3
                      text-4xl
                      font-bold
                      text-slate-900
                    "
                  >
                    {totalEnquiries}
                  </p>

                </div>


                <div
                  className="
                    w-12
                    h-12
                    rounded-xl
                    bg-white
                    flex
                    items-center
                    justify-center
                    shadow-sm
                  "
                >
                  <ClipboardList
                    size={24}
                    className="
                      text-blue-600
                    "
                  />
                </div>

              </div>

            </div>


            {/* TOTAL BILLED */}

            <div
              className="
                border
                border-green-100
                bg-green-50
                rounded-2xl
                p-5
              "
            >

              <div
                className="
                  flex
                  items-center
                  justify-between
                "
              >

                <div>

                  <p
                    className="
                      text-sm
                      font-semibold
                      text-green-700
                    "
                  >
                    Total Billed
                  </p>


                  <p
                    className="
                      mt-3
                      text-4xl
                      font-bold
                      text-slate-900
                    "
                  >
                    {totalBilled}
                  </p>

                </div>


                <div
                  className="
                    w-12
                    h-12
                    rounded-xl
                    bg-white
                    flex
                    items-center
                    justify-center
                    shadow-sm
                  "
                >
                  <CircleCheck
                    size={24}
                    className="
                      text-green-600
                    "
                  />
                </div>

              </div>

            </div>


            {/* QUOTATION PENDING */}

            <div
              className="
                border
                border-orange-100
                bg-orange-50
                rounded-2xl
                p-5
              "
            >

              <div
                className="
                  flex
                  items-center
                  justify-between
                "
              >

                <div>

                  <p
                    className="
                      text-sm
                      font-semibold
                      text-orange-700
                    "
                  >
                    Quotation Pending
                  </p>


                  <p
                    className="
                      mt-3
                      text-4xl
                      font-bold
                      text-slate-900
                    "
                  >
                    {quotationPending}
                  </p>

                </div>


                <div
                  className="
                    w-12
                    h-12
                    rounded-xl
                    bg-white
                    flex
                    items-center
                    justify-center
                    shadow-sm
                  "
                >
                  <Clock3
                    size={24}
                    className="
                      text-orange-600
                    "
                  />
                </div>

              </div>

            </div>

          </div>

        </div>


        {/* ===================================================
            DASHBOARD CARDS
        =================================================== */}

        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            xl:grid-cols-3
            gap-6
            mt-8
          "
        >

        </div>


        {/* ===================================================
            TOP 10 MOVING ITEMS
        =================================================== */}

        <div
          className="
            mt-10
          "
        >

          <div
            className="
              bg-white
              border
              border-slate-200
              rounded-3xl
              shadow-sm
              p-6
              md:p-8
            "
          >

            <div
              className="
                flex
                flex-col
                md:flex-row
                md:items-center
                md:justify-between
                gap-3
                mb-6
              "
            >

              <div>

                <h2
                  className="
                    text-2xl
                    font-bold
                    text-gray-800
                  "
                >
                  Top 10 Moving Items
                </h2>

              </div>


              <div
                className="
                  bg-blue-50
                  border
                  border-blue-100
                  px-4
                  py-2
                  rounded-xl
                  text-blue-700
                  font-semibold
                  text-sm
                  w-fit
                "
              >

                Financial Year{" "}

                {
                  salesFinancialYear ||
                  "Loading..."
                }

              </div>

            </div>


            {
              salesLoading ? (

                <div
                  className="
                    h-[600px]
                    flex
                    items-center
                    justify-center
                    text-gray-500
                  "
                >

                  Loading sales data...

                </div>

              ) : salesChartData.length === 0 ? (

                <div
                  className="
                    h-[600px]
                    flex
                    items-center
                    justify-center
                    text-gray-500
                  "
                >

                  No sales data available.

                </div>

              ) : (

                <div
                  className="
                    w-full
                    h-[650px]
                  "
                >

                  <ResponsiveBar

                    data={
                      salesChartData
                    }

                    keys={
                      salesMonths
                    }

                    indexBy="item"

                    margin={{
                      top: 170,
                      right: 40,
                      bottom: 150,
                      left: 80,
                    }}

                    padding={0.2}

                    groupMode="grouped"

                    valueScale={{
                      type:
                        "linear",
                    }}

                    indexScale={{
                      type:
                        "band",

                      round:
                        true,
                    }}

                    valueFormat={
                      (value) =>
                        Number(
                          value
                        ).toLocaleString()
                    }

                    axisBottom={{

                      tickSize: 0,

                      tickPadding: 15,

                      tickRotation: 0,

                      renderTick:
                        ItemAxisTick,

                      legend:
                        "",

                      legendPosition:
                        "middle",

                      legendOffset:
                        150,

                    }}

                    axisLeft={{

                      tickSize: 5,

                      tickPadding: 8,

                      tickRotation: 0,

                      legend:
                        "Quantity",

                      legendPosition:
                        "middle",

                      legendOffset:
                        -60,

                    }}

                    enableGridX={
                      false
                    }

                    enableGridY={
                      true
                    }

                    enableLabel={
                      false
                    }

                    layers={[

                      "grid",

                      "axes",

                      "bars",

                      ItemSummaryLayer,

                      MonthLabelsLayer,

                      "markers",

                      "legends",

                    ]}

                    colors={[

                      "#82a3eb",
                      "#ee7878",
                      "#8cd8a8",
                      "#c49beb",
                      "#dba182",
                      "#8ed0e0",
                      "#eed294",
                      "#dd87ae",
                      "#a19df5",
                      "#c7e69d",

                    ]}

                    colorBy="index"

                    tooltip={({

                      id,

                      value,

                      indexValue,

                      data,

                    }) => {

                      const totalQty =
                        Number(
                          value || 0
                        );


                      const totalValue =
                        Number(
                          data?.[
                            `${id}_value`
                          ] || 0
                        );


                      const avgRate =
                        Number(
                          data?.[
                            `${id}_rate`
                          ] || 0
                        );


                      return (

                        <div
                          style={{

                            background:
                              "#ffffff",

                            padding:
                              "12px 16px",

                            border:
                              "1px solid #e2e8f0",

                            borderRadius:
                              "10px",

                            boxShadow:
                              "0 10px 25px rgba(0,0,0,0.10)",

                            minWidth:
                              "200px",

                          }}
                        >

                          <div
                            style={{

                              fontWeight:
                                700,

                              marginBottom:
                                "10px",

                              color:
                                "#1e293b",

                            }}
                          >

                            {indexValue}

                          </div>


                          <div
                            style={{

                              marginBottom:
                                "8px",

                              color:
                                "#64748b",

                            }}
                          >

                            <strong>
                              {id}
                            </strong>

                          </div>


                          <div
                            style={{

                              fontSize:
                                "14px",

                              lineHeight:
                                "1.8",

                              color:
                                "#475569",

                            }}
                          >

                            <div>

                              Total Qty:{" "}

                              <strong>
                                {
                                  totalQty.toLocaleString()
                                }
                              </strong>

                            </div>


                            <div>

                              Total Value:{" "}

                              <strong>

                                ₹{
                                  totalValue.toLocaleString(
                                    "en-IN",
                                    {
                                      minimumFractionDigits:
                                        2,

                                      maximumFractionDigits:
                                        2,
                                    }
                                  )
                                }

                              </strong>

                            </div>


                            <div>

                              Avg Rate:{" "}

                              <strong>

                                ₹{
                                  avgRate.toLocaleString(
                                    "en-IN",
                                    {
                                      minimumFractionDigits:
                                        2,

                                      maximumFractionDigits:
                                        2,
                                    }
                                  )
                                }

                              </strong>

                            </div>

                          </div>

                        </div>

                      );

                    }}

                    role="application"

                    ariaLabel="
                      Top 10 moving items
                      monthly sales quantity
                    "

                  />

                </div>

              )
            }

          </div>

        </div>


        {/* ===================================================
            QUICK ACCESS
        =================================================== */}

        <div
          className="
            mt-10
          "
        >

          <h2
            className="
              text-2xl
              font-bold
              text-gray-800
              mb-5
            "
          >

            Quick Access

          </h2>


          <div
            className="
              grid
              grid-cols-1
              md:grid-cols-2
              xl:grid-cols-3
              gap-6
            "
          >


            <div
              className="
                bg-white
                border
                border-slate-200
                rounded-3xl
                p-6
                shadow-sm
                hover:shadow-lg
                transition-all
                duration-300
              "
            >

              <h3
                className="
                  text-xl
                  font-bold
                  text-red-600
                "
              >
                Sales CRM
              </h3>


              <p
                className="
                  text-gray-500
                  mt-2
                "
              >
                Manage leads and customer followups.
              </p>


              <a
                href="/salescrm"
                className="
                  inline-block
                  mt-5
                  bg-slate-900
                  hover:bg-slate-800
                  text-white
                  px-5
                  py-2
                  rounded-xl
                "
              >
                Open
              </a>

            </div>


            <div
              className="
                bg-white
                border
                border-slate-200
                rounded-3xl
                p-6
                shadow-sm
                hover:shadow-lg
                transition-all
                duration-300
              "
            >

              <h3
                className="
                  text-xl
                  font-bold
                  text-red-600
                "
              >
                Stock Check
              </h3>


              <p
                className="
                  text-gray-500
                  mt-2
                "
              >
                Verify warehouse stock details.
              </p>


              <a
                href="/stock-check"
                className="
                  inline-block
                  mt-5
                  bg-slate-900
                  hover:bg-slate-800
                  text-white
                  px-5
                  py-2
                  rounded-xl
                "
              >
                Open
              </a>

            </div>


            <div
              className="
                bg-gradient-to-br
                from-blue-50
                to-white
                rounded-3xl
                p-6
                shadow-md
                hover:shadow-xl
                transition
                border
                border-blue-100
              "
            >

              <h3
                className="
                  text-xl
                  font-bold
                  text-red-600
                "
              >
                Stock Items
              </h3>


              <p
                className="
                  text-gray-600
                  mt-2
                  leading-relaxed
                "
              >
                Browse detailed item-wise product information
                and CRM stock records.
              </p>


              <Link
                to="/CRMstockitem"
                className="
                  inline-block
                  mt-5
                  bg-slate-900
                  hover:bg-slate-800
                  text-white
                  px-5
                  py-2
                  rounded-xl
                  transition
                "
              >
                View Items
              </Link>

            </div>

          </div>

        </div>

      </main>

    </div>

  );

};


export default AdminDashboard;