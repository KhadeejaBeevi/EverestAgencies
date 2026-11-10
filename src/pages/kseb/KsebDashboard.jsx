import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  BookUser,
  PhoneCall,
  MapPinned,
  UserPlus,
  CalendarCheck,
  CalendarSearch,
  Table2,
  FileText,
  ClipboardCheck,
  BarChart3,
  CreditCard,
  Wallet,
  MapPin,
  FileBarChart,
  BellRing,
  ArrowRight,
} from "lucide-react";

import Banner from "../../components/Banner/Banner.jsx";
import { auth, db } from "../../components/firebase";
import { apiFetch } from "../../api/apiClient";

const API = "/serverphp";

// Same UID as Banner.jsx — gets the full Tender Details page
const SPECIAL_UID = "Zj0y6xogiIQLiP0qnYWoHFSLGrf2";

// =====================================================
// DATE HELPERS (local time, "YYYY-MM-DD")
// =====================================================
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateKey = (v) => {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
};
const niceDate = (v) => {
  const k = dateKey(v);
  if (!k) return "-";
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
};
const norm = (v) => String(v || "").trim().toLowerCase();
const clean = (v) => (v && v !== "-" ? v : "");

// Fetch JSON and always return an array (handles {data: [...]} too)
const fetchList = async (url) => {
  const res = await apiFetch(url);
  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  return [];
};

export default function KsebDashboard() {
  // ---------------- user ----------------
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [permissions, setPermissions] = useState({});
  const [userInfo, setUserInfo] = useState({
    uid: "",
    firstName: "",
    fullName: "",
    isAdmin: false,
    tenderPath: "/tenderexecutive",
  });

  // ---------------- data ----------------
  const [calls, setCalls] = useState(null);
  const [tenders, setTenders] = useState(null);
  const [pos, setPos] = useState(null);
  const [visits, setVisits] = useState(null);

  const navigate = useNavigate();
  const can = (page) => permissions[page] === true;

  // =====================================================
  // LOAD USER, ROLE AND PAGE PERMISSIONS
  // =====================================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      setLoggedIn(true);

      try {
        const [permSnap, userSnap] = await Promise.all([
          getDoc(doc(db, "PagePermissions", user.uid)),
          getDoc(doc(db, "Users", user.uid)),
        ]);

        const data = userSnap.exists() ? userSnap.data() : {};

        let role = data.role || "";
        if (!role) {
          const roleSnap = await getDoc(doc(db, "roles", user.uid));
          role = roleSnap.exists() ? roleSnap.data().role || "" : "";
        }

        const isAdmin = norm(role) === "admin";

        setPermissions(permSnap.exists() ? permSnap.data() : {});
        setUserInfo({
          uid: user.uid,
          firstName: data.firstName || "",
          fullName: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
          isAdmin,
          tenderPath:
            isAdmin || user.uid === SPECIAL_UID
              ? "/tenderdetails"
              : "/tenderexecutive",
        });
      } catch (err) {
        console.error("KSEB dashboard load failed:", err);
        setPermissions({});
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const tenderPage =
    userInfo.tenderPath === "/tenderdetails"
      ? "Tender Details"
      : "Tender Executive";

  // =====================================================
  // LOAD DASHBOARD DATA
  // Only for pages the user is allowed to open.
  // =====================================================
  useEffect(() => {
    if (loading || !loggedIn) return;

    const { isAdmin, fullName } = userInfo;

    if (permissions["Call History"] === true) {
      fetchList(`${API}/get_all_calls.php`)
        .then(setCalls)
        .catch(() => setCalls([]));
    }

    if (permissions[tenderPage] === true) {
      fetchList(`${API}/get_tenders.php`)
        .then(setTenders)
        .catch(() => setTenders([]));
    }

    if (permissions["PO Details"] === true) {
      fetchList(`${API}/get_po.php`)
        .then(setPos)
        .catch(() => setPos([]));
    }

    if (permissions["Site Visit"] === true) {
      const q =
        isAdmin || !fullName
          ? ""
          : `?sales_executive=${encodeURIComponent(fullName)}`;
      fetchList(`${API}/get_site_visit.php${q}`)
        .then(setVisits)
        .catch(() => setVisits([]));
    }

  }, [loading, loggedIn, permissions, userInfo, tenderPage]);

  // =====================================================
  // NUMBERS
  // =====================================================
  const today = keyOf(new Date());
  const monthPrefix = today.slice(0, 7);
  // Follow-ups older than this are treated as stale and not shown
  const weekAgo = keyOf(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const stats = useMemo(() => {
    const out = {};

    if (calls) {
      // Non-admins see their own calls; admins see everyone's
      const mine = userInfo.isAdmin
        ? calls
        : calls.filter(
            (c) => norm(c.telecaller_name) === norm(userInfo.fullName)
          );

      const monthCalls = mine.filter((c) =>
        dateKey(c.call_date).startsWith(monthPrefix)
      );

      // Latest call per KSEB office — older follow-ups are already handled
      const latestByOffice = new Map();
      mine.forEach((c) => {
        const k = c.kseb_id;
        const prev = latestByOffice.get(k);
        if (
          !prev ||
          dateKey(c.call_date) > dateKey(prev.call_date) ||
          (dateKey(c.call_date) === dateKey(prev.call_date) &&
            Number(c.id) > Number(prev.id))
        ) {
          latestByOffice.set(k, c);
        }
      });

      const followups = [...latestByOffice.values()]
        .filter((c) => {
          const f = dateKey(c.followup_date);
          return (
            f &&
            f >= weekAgo &&
            f <= today &&
            !/closed|lost|po received/i.test(c.status)
          );
        })
        .sort((a, b) =>
          dateKey(a.followup_date).localeCompare(dateKey(b.followup_date))
        );

      out.callsToday = mine.filter((c) => dateKey(c.call_date) === today).length;
      out.callsMonth = monthCalls.length;
      out.quotesMonth = monthCalls.filter((c) =>
        /quotation sent/i.test(c.status)
      ).length;
      out.poMonth = monthCalls.filter((c) =>
        /po received/i.test(c.status)
      ).length;
      out.followups = followups;
      out.recentCalls = mine.slice(0, 5);
    }

    if (tenders) {
      const status = (t) => (clean(t.order_received_status) || "Active").trim();
      const active = tenders.filter((t) => status(t) === "Active");
      out.tendersActive = active.length;
      out.tendersWon = tenders.filter((t) => status(t) === "Won").length;
      out.deadlines = active
        .filter((t) => dateKey(t.quotation_submission_last_date) >= today)
        .sort((a, b) =>
          dateKey(a.quotation_submission_last_date).localeCompare(
            dateKey(b.quotation_submission_last_date)
          )
        )
        .slice(0, 4);
    }

    if (pos) {
      out.poNoInvoice = pos.filter(
        (p) => clean(p.po_number) && !clean(p.invoice_number)
      ).length;
      out.poTotal = pos.length;
    }

    if (visits) {
      out.visitsMonth = visits.filter((v) =>
        dateKey(v.created_at).startsWith(monthPrefix)
      ).length;
      out.visitsToday = visits.filter(
        (v) => dateKey(v.created_at) === today
      ).length;
    }

    return out;
  }, [calls, tenders, pos, visits, userInfo, today, monthPrefix, weekAgo]);

  // =====================================================
  // SIDE MENU (Tally style: press the letter to open)
  // "page" must match <ProtectedRoute page="..."> in App.jsx
  // =====================================================
  const menuGroups = [
    {
      title: "Daily Work",
      items: [
        { key: "D", label: "KSEB Directory", to: "/ksebdirectory", page: "KSEB Directory", icon: BookUser },
        { key: "T", label: "Directory Table", to: "/ksebdirectorytable", page: "Kseb Directory Table", icon: Table2 },
        { key: "C", label: "Call History", to: "/callhistory", page: "Call History", icon: PhoneCall, count: stats.callsToday },
        { key: "S", label: "Site Visits", to: "/sitevisitdetails", page: "Site Visit", icon: MapPinned },
        { key: "M", label: "Mark Attendance", to: "/attendance", page: "Attendance", icon: CalendarCheck },
        { key: "V", label: "View Attendance", to: "/viewattendance", page: "View Attendance", icon: CalendarSearch },
        { key: "N", label: "New Lead", to: "/new-kseb-lead", page: "New Kseb Lead", icon: UserPlus },
      ],
    },
    {
      title: "Office & Reports",
      items: [
        { key: "R", label: "Tender Details", to: userInfo.tenderPath, page: tenderPage, icon: FileText, count: stats.tendersActive },
        { key: "P", label: "PO Details", to: "/podetails", page: "PO Details", icon: ClipboardCheck, count: stats.poNoInvoice },
        { key: "O", label: "Overall Sales", to: "/kseboverallsales", page: "KSEB Overall Sales", icon: BarChart3 },
        { key: "I", label: "Invoices", to: "/ksebinvoices", page: "KSEB Invoices", icon: CreditCard },
        { key: "U", label: "Outstanding", to: "/kseboutstanding", page: "KSEB Outstanding", icon: Wallet },
        { key: "L", label: "Location Report", to: "/kseblocationreport", page: "KSEB Location Report", icon: MapPin },
        { key: "E", label: "Detail Report", to: "/ksebdetailreport", page: "KSEB Detail Report", icon: FileBarChart },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => can(i.page)) }))
    .filter((g) => g.items.length > 0);

  const hasAnyAccess = menuGroups.length > 0;

  // Keyboard shortcuts: letter -> page
  const shortcutMap = {};
  menuGroups.forEach((g) => g.items.forEach((i) => (shortcutMap[i.key] = i.to)));
  const shortcutKey = JSON.stringify(shortcutMap);

  useEffect(() => {
    const map = JSON.parse(shortcutKey);
    const onKey = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
      const to = map[String(e.key).toUpperCase()];
      if (to) {
        e.preventDefault();
        navigate(to);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutKey, navigate]);

  if (!loading && !loggedIn) {
    return <Navigate to="/login" replace />;
  }

  // Top stat boxes — only the ones with data
  const statBoxes = [
    stats.callsMonth != null && {
      label: "Calls this month",
      value: stats.callsMonth,
      sub: `${stats.callsToday} today`,
      to: "/callhistory",
    },
    stats.followups && {
      label: "Follow-ups due",
      value: stats.followups.length,
      sub: "today & last 7 days",
      to: "/callhistory",
      alert: stats.followups.length > 0,
    },
    stats.quotesMonth != null && {
      label: "Quotations sent",
      value: stats.quotesMonth,
      sub: `${stats.poMonth} PO received this month`,
      to: "/callhistory",
    },
    stats.visitsMonth != null && {
      label: "Site visits",
      value: stats.visitsMonth,
      sub: `this month · ${stats.visitsToday} today`,
      to: "/sitevisitdetails",
    },
    stats.tendersActive != null && {
      label: "Active tenders",
      value: stats.tendersActive,
      sub: `${stats.tendersWon} won so far`,
      to: userInfo.tenderPath,
    },
    stats.poNoInvoice != null && {
      label: "PO awaiting invoice",
      value: stats.poNoInvoice,
      sub: `of ${stats.poTotal} POs`,
      to: "/podetails",
    },
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#eef4fa]">
      <Banner />

      <div className="p-4 md:p-6 flex flex-col lg:flex-row gap-6 items-start">
      <main className="flex-1 min-w-0 w-full">
        {/* ================= NO ACCESS ================= */}
        {!loading && !hasAnyAccess && (
          <div className="bg-white rounded-3xl p-10 shadow-md text-center">
            <h2 className="text-2xl font-bold text-gray-800">
              No KSEB pages available
            </h2>
            <p className="text-gray-500 mt-3">
              You don't have access to any KSEB pages yet. Please contact your
              admin.
            </p>
          </div>
        )}

        {/* ================= STAT BOXES ================= */}
        {statBoxes.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
            {statBoxes.map((s) => (
              <Link
                key={s.label}
                to={s.to}
                className="bg-white rounded-3xl p-5 shadow-md hover:shadow-xl hover:scale-[1.02] transition"
              >
                <p className="text-gray-500 text-sm font-medium">{s.label}</p>
                <p
                  className={`text-3xl font-bold mt-2 ${
                    s.alert ? "text-red-600" : "text-[#0f4c81]"
                  }`}
                >
                  {s.value}
                </p>
                <p className="text-gray-400 text-xs mt-1">{s.sub}</p>
              </Link>
            ))}
          </div>
        )}

        {hasAnyAccess && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
            {/* ================= LEFT: FOLLOW-UPS ================= */}
            <div className="space-y-6">
              {/* FOLLOW-UPS */}
              {stats.followups && (
                <div className="bg-white rounded-3xl shadow-xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-2xl font-bold text-[#0f4c81] flex items-center gap-2">
                        <BellRing size={22} /> Follow-ups Due
                      </h2>
                      <p className="text-gray-500 text-sm mt-1">
                        Today and overdue (last 7 days)
                      </p>
                    </div>
                  </div>

                  {stats.followups.length === 0 ? (
                    <div className="border border-gray-200 rounded-2xl p-4 text-gray-500">
                      Nothing pending. 🎉
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[640px] overflow-y-auto">
                      {stats.followups.slice(0, 20).map((c) => {
                        const overdue = dateKey(c.followup_date) < today;
                        return (
                          <Link
                            key={c.id}
                            to={`/call-entry/${c.kseb_id}`}
                            state={{ ...c, from: "/kseb" }}
                            className="block border border-gray-200 rounded-2xl p-4 hover:border-blue-400 transition"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <h3 className="font-bold text-[#0f4c81]">
                                {clean(c.NAME) || clean(c.PLACE) || "KSEB Office"}
                              </h3>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                                  overdue
                                    ? "bg-red-100 text-red-700"
                                    : "bg-yellow-100 text-yellow-700"
                                }`}
                              >
                                {overdue ? `Overdue · ${niceDate(c.followup_date)}` : "Today"}
                              </span>
                            </div>
                            <p className="text-gray-500 text-sm mt-1">
                              {[clean(c.PLACE), clean(c.AREA)].filter(Boolean).join(" · ")}
                            </p>
                            <p className="text-sm mt-2">
                              <span className="font-semibold">Stage:</span>{" "}
                              {clean(c.status) || "-"}
                              {userInfo.isAdmin && clean(c.telecaller_name) && (
                                <> · {c.telecaller_name}</>
                              )}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* ================= RIGHT: TENDERS + RECENT CALLS ================= */}
            <div className="space-y-6">
              {/* TENDER DEADLINES */}
              {stats.deadlines && (
                <div className="bg-white rounded-3xl shadow-xl p-6">
                  <h2 className="text-2xl font-bold text-[#0f4c81] flex items-center gap-2 mb-5">
                    <FileText size={22} /> Tender Deadlines
                  </h2>

                  {stats.deadlines.length === 0 ? (
                    <div className="border border-gray-200 rounded-2xl p-4 text-gray-500">
                      No upcoming submission dates.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stats.deadlines.map((t) => (
                        <Link
                          key={t.id}
                          to={userInfo.tenderPath}
                          className="block border border-gray-200 rounded-2xl p-4 hover:border-blue-400 transition"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <h3 className="font-bold text-[#0f4c81]">
                              {clean(t.tender_invited_kseb_office) || "KSEB Office"}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                                dateKey(t.quotation_submission_last_date) === today
                                  ? "bg-red-100 text-red-700"
                                  : "bg-blue-50 text-[#0f4c81]"
                              }`}
                            >
                              {niceDate(t.quotation_submission_last_date)}
                            </span>
                          </div>
                          <p className="text-gray-500 text-sm mt-1">
                            {clean(t.quotation_notice_no)
                              ? `Notice ${t.quotation_notice_no}`
                              : "Submission last date"}
                            {clean(t.executive_name) && ` · ${t.executive_name}`}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* RECENT CALLS */}
              {stats.recentCalls && (
                <div className="bg-white rounded-3xl shadow-xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-2xl font-bold text-[#0f4c81] flex items-center gap-2">
                      <PhoneCall size={22} /> Recent Calls
                    </h2>
                    <Link
                      to="/callhistory"
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      All <ArrowRight size={14} />
                    </Link>
                  </div>

                  {stats.recentCalls.length === 0 ? (
                    <div className="border border-gray-200 rounded-2xl p-4 text-gray-500">
                      No calls yet.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {stats.recentCalls.map((c) => (
                        <div key={c.id} className="py-3 flex justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">
                              {clean(c.NAME) || clean(c.PLACE) || "KSEB Office"}
                            </p>
                            <p className="text-gray-500 text-sm truncate">
                              {clean(c.status) || "-"}
                              {userInfo.isAdmin && clean(c.telecaller_name) && (
                                <> · {c.telecaller_name}</>
                              )}
                            </p>
                          </div>
                          <span className="text-gray-400 text-sm shrink-0">
                            {niceDate(c.call_date)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ================= SIDE MENU ================= */}
      {hasAnyAccess && (
        <aside className="w-full lg:w-72 shrink-0 order-first lg:order-last lg:sticky lg:top-24 bg-white rounded-3xl shadow-md p-4">
          <h2 className="text-lg font-bold text-[#0f4c81] px-2">KSEB Menu</h2>
          <p className="hidden lg:block text-xs text-gray-400 px-2 mt-1">
            Press the letter key to open a page
          </p>

          {menuGroups.map((g) => (
            <div key={g.title} className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 px-2 mb-1">
                {g.title}
              </p>

              <div className="grid grid-cols-2 lg:grid-cols-1 gap-1">
                {g.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.key}
                      to={item.to}
                      className="group flex items-center gap-2 sm:gap-3 px-2 py-2 rounded-xl text-gray-700 hover:bg-[#eef4fa] hover:text-[#0f4c81] transition"
                    >
                      <span className="w-6 h-6 rounded-md bg-[#dbeafe] text-[#0f4c81] text-xs font-bold flex items-center justify-center shrink-0 group-hover:bg-[#0f4c81] group-hover:text-white transition">
                        {item.key}
                      </span>
                      <Icon size={16} className="hidden sm:block shrink-0 text-gray-400 group-hover:text-[#0f4c81]" />
                      <span className="text-sm font-medium truncate flex-1">
                        {item.label}
                      </span>
                      {item.count != null && item.count > 0 && (
                        <span className="hidden sm:inline text-xs font-semibold bg-blue-50 text-[#0f4c81] px-2 py-0.5 rounded-full">
                          {item.count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>
      )}
      </div>
    </div>
  );
}
