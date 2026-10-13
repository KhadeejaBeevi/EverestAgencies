import Banner from "../../components/Banner/Banner.jsx";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import "./CallHistory.css";
import { auth, db } from "../../components/firebase";

import { doc, getDoc } from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";
import { apiFetch } from "../../api/apiClient";

/* ------------------------------------------------------------------ */
/* Status definitions                                                  */
/* ------------------------------------------------------------------ */

// Statuses are compared case-insensitively so "Quotation Notice" and
// "quotation notice" are always treated as the same stage.
const normalize = (value) => (value || "").toString().trim().toLowerCase();

const QUOTATION_STATUSES = new Set([
  "quotation",
  "quotation sent",
  "quotation requested",
  "quotation notice",
]);

const PO_STATUSES = new Set(["po", "po received"]);

// A lead whose most recent call has one of these statuses is finished.
const CLOSED_STATUSES = new Set([
  "not interested",
  "no requirements",
  "no response",
  "do not call",
  "lost",
  "closed",
  "po",
  "po received",
  "no purchase authority",
]);

const isQuotation = (status) => QUOTATION_STATUSES.has(normalize(status));
const isPO = (status) => PO_STATUSES.has(normalize(status));
const isClosed = (status) => CLOSED_STATUSES.has(normalize(status));

// Quotations with no newer call for this many days are "pending".
const PENDING_QUOTATION_DAYS = 7;

const STAGE_FILTERS = [
  { key: "ALL", label: "All", match: () => true },
  { key: "Interested", label: "Interested", match: (s) => normalize(s) === "interested" },
  { key: "Call Back", label: "Call Back", match: (s) => normalize(s) === "call back" },
  { key: "Quotation", label: "Quotation", match: isQuotation },
  { key: "PO", label: "PO Received", match: isPO },
  { key: "No Requirements", label: "No Requirement", match: (s) => normalize(s) === "no requirements" },
  { key: "Not Interested", label: "Not Interested", match: (s) => normalize(s) === "not interested" },
  { key: "Do not call", label: "Do Not Call", match: (s) => normalize(s) === "do not call" },
];

const stageTone = (status) => {
  const s = normalize(status);
  if (isPO(s)) return "won";
  if (isQuotation(s)) return "quotation";
  if (s === "interested" || s === "negotiation") return "positive";
  if (s === "call back" || s === "followup") return "pending";
  if (isClosed(s)) return "negative";
  return "neutral";
};

/* ------------------------------------------------------------------ */
/* Date helpers (all in local time, never UTC)                         */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, "0");

const toDateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const todayKey = () => toDateKey(new Date());

// "2026-10-13" or "2026-10-13 10:30:00" -> "2026-10-13"
const dateKeyOf = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value || "").toString().trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
};

const parseDate = (value) => {
  const key = dateKeyOf(value);
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const formatDate = (value) => {
  const date = parseDate(value);
  if (!date) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const daysSince = (value) => {
  const date = parseDate(value);
  if (!date) return 0;
  const today = parseDate(todayKey());
  return Math.round((today - date) / (1000 * 60 * 60 * 24));
};

const formatAmount = (value) => {
  if (value === null || value === undefined || value === "" || value === "-") {
    return "-";
  }
  const amount = Number(value.toString().replace(/,/g, ""));
  return Number.isFinite(amount)
    ? `₹${amount.toLocaleString("en-IN")}`
    : "-";
};

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString("en-IN", { month: "long" })
);

const weekOfMonth = (day) => Math.min(Math.ceil(day / 7), 5);

// Newer call wins; calls on the same day fall back to the higher id.
const isNewer = (a, b) => {
  const aKey = dateKeyOf(a.call_date);
  const bKey = dateKeyOf(b.call_date);
  if (aKey !== bKey) return aKey > bKey;
  return Number(a.id) > Number(b.id);
};

const byNewestFirst = (a, b) => (isNewer(a, b) ? -1 : isNewer(b, a) ? 1 : 0);

const groupByPlace = (records) => {
  const groups = new Map();
  records.forEach((item) => {
    const key = `${item.PLACE || ""}|${item.AREA || ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        PLACE: item.PLACE,
        AREA: item.AREA,
        REGION: item.PARENT_AREA,
        records: [],
      });
    }
    groups.get(key).records.push(item);
  });
  return [...groups.values()];
};

/* ------------------------------------------------------------------ */
/* Completed follow-ups (kept in localStorage)                         */
/* ------------------------------------------------------------------ */

const COMPLETED_KEY = "completedFollowups";
const DISMISSED_KEY = "followupModalDismissed";

const readCompleted = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(COMPLETED_KEY));
    return Array.isArray(stored) ? stored.map(String) : [];
  } catch {
    return [];
  }
};

const writeCompleted = (ids) => {
  try {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable; the follow-up simply shows again next time.
  }
};

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function StageBadge({ status }) {
  return (
    <span className={`ch-badge ch-badge--${stageTone(status)}`}>
      {status || "-"}
    </span>
  );
}

// Active / Closed for the stage recorded on this call.
function StatusBadge({ status }) {
  return isClosed(status) ? (
    <span className="ch-lead ch-lead--closed">Closed</span>
  ) : (
    <span className="ch-lead ch-lead--open">Active</span>
  );
}

function FollowupDate({ value, highlight }) {
  const key = dateKeyOf(value);
  if (!key) return <span className="ch-muted">-</span>;

  const today = todayKey();
  let tone = "";
  let hint = "";
  if (highlight && key < today) {
    tone = "overdue";
    hint = "Overdue";
  } else if (highlight && key === today) {
    tone = "today";
    hint = "Today";
  }

  return (
    <span className={`ch-followup ${tone ? `ch-followup--${tone}` : ""}`}>
      {formatDate(value)}
      {hint && <small>{hint}</small>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function CallHistory() {
  const navigate = useNavigate();
  const now = new Date();

  const [callHistory, setCallHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loggedUser, setLoggedUser] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [telecallerFilter, setTelecallerFilter] = useState("ALL");
  const [followupFilter, setFollowupFilter] = useState("");
  // One exact call date inside the selected month ("" = whole month).
  const [callDateFilter, setCallDateFilter] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  // Follow-up reminder
  const [completedIds, setCompletedIds] = useState(readCompleted);
  const [showFollowupModal, setShowFollowupModal] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  /* ---------------------------- effects ---------------------------- */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoggedUser("");
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "Users", user.uid));
        if (userSnap.exists()) {
          const { firstName, lastName } = userSnap.data();
          setLoggedUser(`${firstName || ""} ${lastName || ""}`.trim());
        }
      } catch (err) {
        console.error("USER LOOKUP ERROR:", err);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    apiFetch("/serverphp/get_all_calls.php")
      .then((res) => res.json())
      .then((res) => {
        if (res.status === "success") {
          setCallHistory(res.data || []);
        } else {
          setLoadError(res.message || "Could not load call history.");
        }
      })
      .catch((err) => {
        console.error("FETCH ERROR:", err);
        setLoadError(err.message || "Could not load call history.");
      })
      .finally(() => setLoading(false));
  }, []);

  /* ------------------------- derived data -------------------------- */

  const telecallers = useMemo(
    () =>
      [
        ...new Set(
          callHistory
            .map((item) => (item.telecaller_name || "").trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [callHistory]
  );

  // Years that actually have calls, plus the current year.
  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    callHistory.forEach((item) => {
      const date = parseDate(item.call_date);
      if (date) set.add(date.getFullYear());
    });
    return [...set].sort((a, b) => b - a);
  }, [callHistory]);

  // Most recent call for every lead (kseb_id).
  const latestByLead = useMemo(() => {
    const map = {};
    callHistory.forEach((item) => {
      const current = map[item.kseb_id];
      if (!current || isNewer(item, current)) {
        map[item.kseb_id] = item;
      }
    });
    return map;
  }, [callHistory]);

  const isLatestOfLead = (item) => latestByLead[item.kseb_id]?.id === item.id;

  // Search + telecaller apply everywhere, including pending quotations.
  const matchesPeopleFilters = (c) => {
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      [
        c.NAME,
        c.phone,
        c.RECEIPTION_CUG,
        c.PLACE,
        c.AREA,
        c.telecaller_name,
        c.executive_name,
        c.quotation_no,
        c.po_no,
      ].some((field) => (field ?? "").toString().toLowerCase().includes(term));

    const matchesTelecaller =
      telecallerFilter === "ALL" ||
      (c.telecaller_name || "").trim() === telecallerFilter;

    return matchesSearch && matchesTelecaller;
  };

  // Calls in the selected month, before the stage filter is applied.
  const periodCalls = callHistory.filter((c) => {
    if (!matchesPeopleFilters(c)) return false;

    const date = parseDate(c.call_date);
    if (
      !date ||
      date.getMonth() + 1 !== selectedMonth ||
      date.getFullYear() !== selectedYear
    ) {
      return false;
    }

    if (callDateFilter && dateKeyOf(c.call_date) !== callDateFilter) {
      return false;
    }

    return !followupFilter || dateKeyOf(c.followup_date) === followupFilter;
  });

  // Leads whose latest call is a quotation older than the threshold.
  // Not limited to the selected month: an old quotation is still pending.
  const pendingQuotations = Object.values(latestByLead)
    .filter(
      (c) =>
        isQuotation(c.status) &&
        dateKeyOf(c.call_date) &&
        daysSince(c.call_date) >= PENDING_QUOTATION_DAYS &&
        matchesPeopleFilters(c)
    )
    .sort((a, b) => byNewestFirst(b, a));

  const stageCounts = Object.fromEntries(
    STAGE_FILTERS.map((f) => [
      f.key,
      periodCalls.filter((c) => f.match(c.status)).length,
    ])
  );

  const activeStage = STAGE_FILTERS.find((f) => f.key === stageFilter);

  const visibleCalls = showPendingOnly
    ? pendingQuotations
    : periodCalls.filter((c) => activeStage.match(c.status)).sort(byNewestFirst);

  // Sections shown in the list: weeks of the month, or one section for
  // pending quotations.
  const sections = showPendingOnly
    ? visibleCalls.length
      ? [
          {
            key: "pending",
            title: "Quotations without a response",
            subtitle: `No call in the last ${PENDING_QUOTATION_DAYS} days · oldest first`,
            places: groupByPlace(visibleCalls),
            count: visibleCalls.length,
          },
        ]
      : []
    : Object.values(
        visibleCalls.reduce((acc, item) => {
          const week = weekOfMonth(parseDate(item.call_date).getDate());
          if (!acc[week]) acc[week] = { week, records: [] };
          acc[week].records.push(item);
          return acc;
        }, {})
      )
        .sort((a, b) => b.week - a.week)
        .map(({ week, records }) => {
          const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
          const from = (week - 1) * 7 + 1;
          const to = week === 5 ? lastDay : week * 7;
          const month = MONTH_NAMES[selectedMonth - 1].slice(0, 3);
          return {
            key: `week-${week}`,
            title: `Week ${week}`,
            subtitle: `${from}–${to} ${month}`,
            places: groupByPlace(records),
            count: records.length,
          };
        });

  // Today's follow-ups for the logged-in telecaller. A follow-up only
  // counts while it is still the lead's latest call; a newer call means
  // it has already been handled.
  const today = todayKey();
  const todayFollowups = loggedUser
    ? callHistory.filter(
        (c) =>
          dateKeyOf(c.followup_date) === today &&
          isLatestOfLead(c) &&
          !completedIds.includes(String(c.id)) &&
          normalize(c.telecaller_name) === normalize(loggedUser)
      )
    : [];

  // Open the reminder once per day per browser session.
  useEffect(() => {
    if (todayFollowups.length === 0) return;
    let dismissedToday = false;
    try {
      dismissedToday = sessionStorage.getItem(DISMISSED_KEY) === todayKey();
    } catch {
      // sessionStorage unavailable; just show the reminder.
    }
    if (!dismissedToday) setShowFollowupModal(true);
    // Only re-check once data and the user are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayFollowups.length > 0]);

  /* ---------------------------- actions ---------------------------- */

  const openCallEntry = (record) =>
    navigate(`/call-entry/${record.kseb_id}`, { state: record });

  const closeFollowupModal = () => {
    setShowFollowupModal(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, todayKey());
    } catch {
      // Ignore; the reminder may show again on the next visit.
    }
  };

  const handleFollowupDone = (id) => {
    // Keep only ids whose follow-up is today or later so the list
    // does not grow forever.
    const stillRelevant = completedIds.filter((completedId) => {
      const record = callHistory.find((c) => String(c.id) === completedId);
      return record && dateKeyOf(record.followup_date) >= today;
    });
    const updated = [...new Set([...stillRelevant, String(id)])];

    writeCompleted(updated);
    setCompletedIds(updated);

    if (todayFollowups.length <= 1) {
      closeFollowupModal();
    }
  };

  const handleDelete = (record) => {
    const label = record.NAME ? ` for ${record.NAME}` : "";
    if (
      !window.confirm(
        `Delete the call entry${label} on ${formatDate(record.call_date)}? This cannot be undone.`
      )
    ) {
      return;
    }

    apiFetch(`/serverphp/delete_call.php?id=${record.id}`, {
      method: "DELETE",
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.status === "success") {
          setCallHistory((prev) => prev.filter((item) => item.id !== record.id));
          toast.success("Call entry deleted");
        } else {
          toast.error(res.message || "Delete failed");
        }
      })
      .catch((err) => {
        console.error("DELETE ERROR:", err);
        toast.error(err.message || "Delete failed");
      });
  };

  const selectStage = (key) => {
    setShowPendingOnly(false);
    setStageFilter(key);
  };

  const showPending = () => {
    setShowPendingOnly(true);
    setStageFilter("ALL");
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    stageFilter !== "ALL" ||
    telecallerFilter !== "ALL" ||
    followupFilter !== "" ||
    callDateFilter !== "" ||
    showPendingOnly ||
    selectedMonth !== now.getMonth() + 1 ||
    selectedYear !== now.getFullYear();

  const resetFilters = () => {
    setSearch("");
    setStageFilter("ALL");
    setTelecallerFilter("ALL");
    setFollowupFilter("");
    setShowPendingOnly(false);
    setCallDateFilter("");
    setSelectedMonth(now.getMonth() + 1);
    setSelectedYear(now.getFullYear());
  };

  /* ---------------------------- render ----------------------------- */

  const periodLabel = callDateFilter
    ? formatDate(callDateFilter)
    : `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  // Picking a call date also moves the month/year to that date.
  const changeCallDate = (value) => {
    setCallDateFilter(value);
    const date = parseDate(value);
    if (date) {
      setSelectedMonth(date.getMonth() + 1);
      setSelectedYear(date.getFullYear());
    }
  };

  // A different month/year clears the single-day filter.
  const changeMonth = (month) => {
    setCallDateFilter("");
    setSelectedMonth(month);
  };

  const changeYear = (year) => {
    setCallDateFilter("");
    setSelectedYear(year);
  };

  const listDescription = showPendingOnly
    ? `${visibleCalls.length} pending quotation${visibleCalls.length === 1 ? "" : "s"}`
    : `${visibleCalls.length} call${visibleCalls.length === 1 ? "" : "s"} ${callDateFilter ? "on" : "in"} ${periodLabel}${
        stageFilter !== "ALL" ? ` · ${activeStage.label}` : ""
      }${followupFilter ? ` · follow-up on ${formatDate(followupFilter)}` : ""}`;

  if (loading) {
    return (
      <>
        <Banner />
        <div className="ch-page">
          <div className="ch-state">
            <div className="ch-spinner" />
            <p>Loading call history…</p>
          </div>
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <Banner />
        <div className="ch-page">
          <div className="ch-state ch-state--error">
            <h3>Could not load call history</h3>
            <p>{loadError}</p>
            <button
              className="ch-btn ch-btn--primary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Banner />

      {showFollowupModal && todayFollowups.length > 0 && (
        <div className="ch-modal-overlay" onClick={closeFollowupModal}>
          <div
            className="ch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ch-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ch-modal-header">
              <div>
                <h2 id="ch-modal-title">Today's follow-ups</h2>
                <p>
                  {todayFollowups.length} customer
                  {todayFollowups.length === 1 ? "" : "s"} to call today
                </p>
              </div>
              <button
                className="ch-icon-btn"
                onClick={closeFollowupModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="ch-modal-body">
              {todayFollowups.map((item) => (
                <div key={item.id} className="ch-followup-card">
                  <div className="ch-followup-info">
                    <strong>{item.NAME || "-"}</strong>
                    {item.phone && (
                      <a href={`tel:${item.phone}`} className="ch-phone">
                        {item.phone}
                      </a>
                    )}
                    <span className="ch-muted">
                      {[item.PLACE, item.AREA].filter(Boolean).join(" · ")}
                    </span>
                    {item.remarks && (
                      <p className="ch-followup-remark">{item.remarks}</p>
                    )}
                  </div>

                  <div className="ch-followup-actions">
                    <button
                      className="ch-btn ch-btn--primary"
                      onClick={() => openCallEntry(item)}
                    >
                      Update call
                    </button>
                    <button
                      className="ch-btn ch-btn--success"
                      onClick={() => handleFollowupDone(item.id)}
                    >
                      Mark done
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="ch-page">
        {/* Header */}
        <div className="ch-header">
          <div>
            <h1 className="ch-title">Call History</h1>
            <p className="ch-subtitle">
              Track calls, quotations and purchase orders for KSEB leads.
            </p>
          </div>

          {todayFollowups.length > 0 && (
            <button
              className="ch-btn ch-btn--outline"
              onClick={() => setShowFollowupModal(true)}
            >
              Today's follow-ups
              <span className="ch-count">{todayFollowups.length}</span>
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="ch-summary">
          <button
            className={`ch-stat ch-stat--total ${
              !showPendingOnly && stageFilter === "ALL" ? "is-selected" : ""
            }`}
            onClick={() => selectStage("ALL")}
          >
            <span className="ch-stat-label">Total calls</span>
            <span className="ch-stat-value">{stageCounts.ALL}</span>
            <span className="ch-stat-hint">{periodLabel}</span>
          </button>

          <button
            className={`ch-stat ch-stat--quotation ${
              !showPendingOnly && stageFilter === "Quotation" ? "is-selected" : ""
            }`}
            onClick={() => selectStage("Quotation")}
          >
            <span className="ch-stat-label">Quotations</span>
            <span className="ch-stat-value">{stageCounts.Quotation}</span>
            <span className="ch-stat-hint">{periodLabel}</span>
          </button>

          <button
            className={`ch-stat ch-stat--po ${
              !showPendingOnly && stageFilter === "PO" ? "is-selected" : ""
            }`}
            onClick={() => selectStage("PO")}
          >
            <span className="ch-stat-label">PO received</span>
            <span className="ch-stat-value">{stageCounts.PO}</span>
            <span className="ch-stat-hint">{periodLabel}</span>
          </button>

          <button
            className={`ch-stat ch-stat--pending ${
              showPendingOnly ? "is-selected" : ""
            }`}
            onClick={showPending}
          >
            <span className="ch-stat-label">Pending quotations</span>
            <span className="ch-stat-value">{pendingQuotations.length}</span>
            <span className="ch-stat-hint">
              No response for {PENDING_QUOTATION_DAYS}+ days
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="ch-filters">
          <div className="ch-filter-row">
            <div className="ch-field ch-field--search">
              <label htmlFor="ch-search">Search</label>
              <input
                id="ch-search"
                type="search"
                placeholder="Name, phone, place, quotation or PO no…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="ch-field">
              <label htmlFor="ch-telecaller">Telecaller</label>
              <select
                id="ch-telecaller"
                value={telecallerFilter}
                onChange={(e) => setTelecallerFilter(e.target.value)}
              >
                <option value="ALL">All telecallers</option>
                {telecallers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="ch-field">
              <label htmlFor="ch-month">Month</label>
              <div className="ch-inline">
                <select
                  id="ch-month"
                  value={selectedMonth}
                  disabled={showPendingOnly}
                  onChange={(e) => changeMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Year"
                  value={selectedYear}
                  disabled={showPendingOnly}
                  onChange={(e) => changeYear(Number(e.target.value))}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ch-field">
              <label htmlFor="ch-calldate">Call date</label>
              <div className="ch-inline">
                <input
                  id="ch-calldate"
                  type="date"
                  value={callDateFilter}
                  disabled={showPendingOnly}
                  onChange={(e) => changeCallDate(e.target.value)}
                />
                {callDateFilter && (
                  <button
                    className="ch-btn ch-btn--ghost"
                    onClick={() => setCallDateFilter("")}
                    aria-label="Clear call date"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="ch-field">
              <label htmlFor="ch-followup">Follow-up date</label>
              <div className="ch-inline">
                <input
                  id="ch-followup"
                  type="date"
                  value={followupFilter}
                  disabled={showPendingOnly}
                  onChange={(e) => setFollowupFilter(e.target.value)}
                />
                {followupFilter && (
                  <button
                    className="ch-btn ch-btn--ghost"
                    onClick={() => setFollowupFilter("")}
                    aria-label="Clear follow-up date"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="ch-chips" role="tablist" aria-label="Filter by stage">
            {STAGE_FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={!showPendingOnly && stageFilter === f.key}
                className={`ch-chip ${
                  !showPendingOnly && stageFilter === f.key ? "is-active" : ""
                }`}
                onClick={() => selectStage(f.key)}
              >
                {f.label}
                <span className="ch-chip-count">{stageCounts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Result bar */}
        <div className="ch-resultbar">
          <span>{listDescription}</span>
          {hasActiveFilters && (
            <button className="ch-btn ch-btn--ghost" onClick={resetFilters}>
              Reset filters
            </button>
          )}
        </div>

        {sections.length === 0 ? (
          <div className="ch-state">
            <h3>No calls found</h3>
            <p>
              {showPendingOnly
                ? "Every quotation has had a call in the last week."
                : "Try another month, stage or telecaller, or reset the filters."}
            </p>
          </div>
        ) : !isMobile ? (
          <div className="ch-table-wrap">
            <table className="ch-table">
              {/* Fixed column widths so the whole table fits the screen. */}
              <colgroup>
                <col style={{ width: "7%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "6%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Call date</th>
                  <th>Customer</th>
                  <th>Stage</th>
                  <th>Quotation</th>
                  <th>PO no</th>
                  <th>Items</th>
                  <th>Remarks</th>
                  <th>Follow-up</th>
                  <th>Called by</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>

              <tbody>
                {sections.map((section) => (
                  <React.Fragment key={section.key}>
                    <tr className="ch-section-row">
                      <td colSpan="11">
                        <strong>{section.title}</strong>
                        <span>{section.subtitle}</span>
                        <span className="ch-count">{section.count}</span>
                      </td>
                    </tr>

                    {section.places.map((group) => (
                      <React.Fragment key={`${section.key}-${group.key}`}>
                        <tr className="ch-place-row">
                          <td colSpan="11">
                            <button
                              className="ch-link"
                              onClick={() => openCallEntry(group.records[0])}
                              title="Open call entry"
                            >
                              {group.PLACE || "Unknown place"}
                            </button>
                            <span className="ch-muted">
                              {[group.AREA, group.REGION]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </td>
                        </tr>

                        {group.records.map((c) => {
                          const latest = isLatestOfLead(c);
                          const leadStatus = latestByLead[c.kseb_id]?.status;
                          return (
                            <tr
                              key={c.id}
                              className={latest ? "" : "ch-row--superseded"}
                            >
                              <td className="ch-nowrap">
                                {formatDate(c.call_date)}
                                {showPendingOnly && (
                                  <small className="ch-age">
                                    {daysSince(c.call_date)} days ago
                                  </small>
                                )}
                              </td>
                              <td>
                                <div className="ch-customer">
                                  <strong>{c.NAME || "-"}</strong>
                                  {c.phone && (
                                    <a href={`tel:${c.phone}`} className="ch-phone">
                                      {c.phone}
                                    </a>
                                  )}
                                </div>
                              </td>
                              <td>
                                <StageBadge status={c.status} />
                              </td>
                              <td>
                                {c.quotation_no || c.quotation_amount ? (
                                  <div className="ch-stack">
                                    <span>{c.quotation_no || "-"}</span>
                                    <small>{formatAmount(c.quotation_amount)}</small>
                                  </div>
                                ) : (
                                  <span className="ch-muted">-</span>
                                )}
                              </td>
                              <td>{c.po_no || <span className="ch-muted">-</span>}</td>
                              <td>
                                <div className="ch-clamp" title={c.item_details || ""}>
                                  {c.item_details || <span className="ch-muted">-</span>}
                                </div>
                              </td>
                              <td>
                                <div className="ch-remarks">
                                  {c.remarks || <span className="ch-muted">-</span>}
                                </div>
                              </td>
                              <td className="ch-nowrap">
                                <FollowupDate
                                  value={c.followup_date}
                                  highlight={latest && !isClosed(leadStatus)}
                                />
                              </td>
                              <td>{c.telecaller_name || "-"}</td>
                              <td>
                                <StatusBadge status={c.status} />
                              </td>
                              <td className="ch-actions">
                                <div className="ch-actions-inner">
                                  <button
                                    className="ch-btn ch-btn--small ch-btn--primary"
                                    onClick={() => openCallEntry(c)}
                                  >
                                    Update
                                  </button>
                                  <button
                                    className="ch-icon-btn ch-icon-btn--danger"
                                    onClick={() => handleDelete(c)}
                                    title="Delete entry"
                                    aria-label="Delete entry"
                                  >
                                    🗑
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ch-mobile">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="ch-mobile-section">
                  <strong>{section.title}</strong>
                  <span>{section.subtitle}</span>
                  <span className="ch-count">{section.count}</span>
                </div>

                {section.places.map((group) => (
                  <div key={`${section.key}-${group.key}`}>
                    <button
                      className="ch-mobile-place"
                      onClick={() => openCallEntry(group.records[0])}
                    >
                      <strong>{group.PLACE || "Unknown place"}</strong>
                      <span>
                        {[group.AREA, group.REGION].filter(Boolean).join(" · ")}
                      </span>
                    </button>

                    {group.records.map((c) => {
                      const latest = isLatestOfLead(c);
                      const leadStatus = latestByLead[c.kseb_id]?.status;
                      return (
                        <div
                          key={c.id}
                          className={`ch-card ${latest ? "" : "ch-row--superseded"}`}
                        >
                          <div className="ch-card-top">
                            <div>
                              <h4>{c.NAME || "-"}</h4>
                              {c.phone && (
                                <a href={`tel:${c.phone}`} className="ch-phone">
                                  {c.phone}
                                </a>
                              )}
                            </div>
                            <StageBadge status={c.status} />
                          </div>

                          <dl className="ch-card-details">
                            <dt>Call date</dt>
                            <dd>
                              {formatDate(c.call_date)}
                              {showPendingOnly &&
                                ` · ${daysSince(c.call_date)} days ago`}
                            </dd>

                            <dt>Follow-up</dt>
                            <dd>
                              <FollowupDate
                                value={c.followup_date}
                                highlight={latest && !isClosed(leadStatus)}
                              />
                            </dd>

                            {(c.quotation_no || c.quotation_amount) && (
                              <>
                                <dt>Quotation</dt>
                                <dd>
                                  {c.quotation_no || "-"} ·{" "}
                                  {formatAmount(c.quotation_amount)}
                                </dd>
                              </>
                            )}

                            {c.po_no && (
                              <>
                                <dt>PO no</dt>
                                <dd>{c.po_no}</dd>
                              </>
                            )}

                            {c.item_details && (
                              <>
                                <dt>Items</dt>
                                <dd>{c.item_details}</dd>
                              </>
                            )}

                            {c.remarks && (
                              <>
                                <dt>Remarks</dt>
                                <dd>{c.remarks}</dd>
                              </>
                            )}

                            <dt>Called by</dt>
                            <dd>{c.telecaller_name || "-"}</dd>

                            <dt>Status</dt>
                            <dd>
                              <StatusBadge status={c.status} />
                            </dd>
                          </dl>

                          <div className="ch-card-actions">
                            <button
                              className="ch-btn ch-btn--primary"
                              onClick={() => openCallEntry(c)}
                            >
                              Update
                            </button>
                            <button
                              className="ch-btn ch-btn--danger-outline"
                              onClick={() => handleDelete(c)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
