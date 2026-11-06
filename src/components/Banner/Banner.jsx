import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import everestlogo from "/everestlogo.png";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import "./Banner.css";

import {
  ChevronDown,
  Bell,
  LayoutDashboard,
  UsersRound,
  UserPlus,
  UserCog,
  ContactRound,
  ShoppingBag,
  FileSearch,
  FileQuestion,
  Files,
  ListChecks,
  Building2,
  BookUser,
  PhoneCall,
  MapPinned,
  CalendarCheck,
  FileText,
  ClipboardCheck,
  ClipboardList,
  PackageSearch,
  Truck,
  Boxes,
  Sun,
  Sunrise,
  CreditCard,
  Wallet,
  ShieldCheck,
  Activity,
  UserRoundCheck,
  BarChart3,
  UserRound,
} from "lucide-react";

function Banner() {
  const [dashboardPath, setDashboardPath] = useState("/");
  const [tenderPath, setTenderPath] = useState("/tenderexecutive");
  const [profile, setProfile] = useState({ photo: "", initials: "" });

  // =====================================================
  // PROFILE AVATAR
  // Re-read when MyProfile saves changes
  // =====================================================

  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "Users", user.uid));
        const data = snap.exists() ? snap.data() : {};

        setProfile({
          photo: data.photo || "",
          initials: `${(data.firstName || "").charAt(0)}${(data.lastName || "").charAt(0)}`.toUpperCase(),
        });
      } catch (error) {
        console.error("Banner profile lookup failed:", error);
      }
    };

    window.addEventListener("profile-updated", loadProfile);
    return () => window.removeEventListener("profile-updated", loadProfile);
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setDashboardPath("/");
        setTenderPath("/tenderexecutive");
        return;
      }

      try {
        // =====================================================
        // SPECIAL USER
        // This UID has access to full Tender Details
        // =====================================================
        const SPECIAL_UID = "Zj0y6xogiIQLiP0qnYWoHFSLGrf2";

        // =====================================================
        // GET ROLE
        // Users/{uid} is the primary source
        // =====================================================
        const userSnap = await getDoc(doc(db, "Users", user.uid));

        let role = userSnap.exists()
          ? userSnap.data().role || ""
          : "";

        const userData = userSnap.exists() ? userSnap.data() : {};
        setProfile({
          photo: userData.photo || "",
          initials: `${(userData.firstName || "").charAt(0)}${(userData.lastName || "").charAt(0)}`.toUpperCase(),
        });

        // =====================================================
        // FALLBACK TO ROLES COLLECTION
        // =====================================================
        if (!role) {
          const roleSnap = await getDoc(doc(db, "roles", user.uid));

          role = roleSnap.exists()
            ? roleSnap.data().role || ""
            : "";
        }

        const normalizedRole = String(role)
          .trim()
          .toLowerCase();

        // =====================================================
        // DASHBOARD BASED ON ROLE
        // =====================================================
        const dashboardByRole = {
          admin: "/admin-dashboard",
          user: "/user-dashboard",
          ksebuser: "/ksebuserdashboard",
          sales: "/salesdashboard",
        };

        setDashboardPath(
          dashboardByRole[normalizedRole] || "/"
        );

        // =====================================================
        // TENDER PAGE BASED ON USER
        //
        // ADMIN
        //      -> /tenderdetails
        //
        // SPECIAL USER
        //      -> /tenderdetails
        //
        // ALL OTHER USERS
        //      -> /tenderexecutive
        // =====================================================

        if (
          normalizedRole === "admin" ||
          user.uid === SPECIAL_UID
        ) {
          setTenderPath("/tenderdetails");
        } else {
          setTenderPath("/tenderexecutive");
        }
      } catch (error) {
        console.error(
          "Banner role lookup failed:",
          error
        );

        setDashboardPath("/");
        setTenderPath("/tenderexecutive");
      }
    });

    return () => unsubscribe();
  }, []);

  const [openMenu, setOpenMenu] = useState(null);
  const [openSubMenu, setOpenSubMenu] = useState(null);

  const location = useLocation();

  const [mobileDropdown, setMobileDropdown] = useState(null);
  const [mobileSubDropdown, setMobileSubDropdown] = useState(null);

  // =====================================================
  // DESKTOP DROPDOWN
  // =====================================================

  const toggleDropdown = (menu) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const toggleSubMenu = (menu) => {
    setOpenSubMenu(
      openSubMenu === menu ? null : menu
    );
  };

  // =====================================================
  // MOBILE DROPDOWN
  // =====================================================

  const toggleMobileDropdown = (menu) => {
    setMobileDropdown(
      mobileDropdown === menu ? null : menu
    );
  };

  const toggleMobileSubDropdown = (menu) => {
    setMobileSubDropdown(
      mobileSubDropdown === menu ? null : menu
    );
  };

  // =====================================================
  // CLOSE DESKTOP MENU
  // =====================================================

  const closeDesktopMenu = () => {
    setOpenMenu(null);
    setOpenSubMenu(null);
  };

  // =====================================================
  // CLOSE DESKTOP MENU ON OUTSIDE CLICK / ROUTE CHANGE
  // =====================================================

  const navRef = useRef(null);
  const mobileNavRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenMenu(null);
        setOpenSubMenu(null);
      }
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(e.target)
      ) {
        setMobileDropdown(null);
        setMobileSubDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setOpenMenu(null);
    setOpenSubMenu(null);
    setMobileDropdown(null);
    setMobileSubDropdown(null);
  }, [location.pathname]);

  // =====================================================
  // DESKTOP MENU CONFIG
  // =====================================================

  const desktopMenu = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: dashboardPath },
    { key: "pdc", label: "PDC", icon: CreditCard, to: "/postdatedcheques" },
    {
      key: "quotation",
      label: "Quotation Tracking",
      icon: FileSearch,
      children: [
        { label: "Enquiry Capture", icon: FileQuestion, to: "/enquiryreport" },
        { label: "Quotation List", icon: Files, to: "/quotationfollowup" },
        { label: "Quotation Wise Followup", icon: ListChecks, to: "/quotationwise" },
        { label: "SalesCoordinator Report", icon: PhoneCall, to: "/telecallerreport" },
        { label: "Customer PO", icon: ClipboardList, to: "/customerpo" },
        { label: "Order To Delivery", icon: Truck, to: "/ordertodelivery" },
      ],
    },
    {
      key: "crm",
      label: "CRM",
      icon: ContactRound,
      children: [
        { label: "Sales CRM", icon: ContactRound, to: "/salescrm" },
        { label: "Stock Items", icon: Boxes, to: "/CRMstockitem" },
        { label: "Stock Check", icon: ClipboardCheck, to: "/stock-check" },
      ],
    },
    {
      key: "sales",
      label: "Sales",
      icon: ShoppingBag,
      children: [
        { label: "Pending Orders", icon: PackageSearch, to: "/salesorders" },
        { label: "LR Details", icon: Truck, to: "/lrdetails" },
        { label: "Site Visits", icon: MapPinned, to: "/salessitevisit" },
        { label: "New Lead GEN", icon: UserPlus, to: "/newpartyledgerdetails" },
      ],
    },
    {
      key: "kseb",
      label: "KSEB",
      icon: Building2,
      children: [
        {
          key: "ksebDirectory",
          label: "KSEB Directory",
          icon: BookUser,
          children: [
            { label: "Card View", icon: BookUser, to: "/ksebdirectory" },
            { label: "Table View", icon: Files, to: "/ksebdirectorytable" },
          ],
        },
        { label: "Call History", icon: PhoneCall, to: "/callhistory" },
        { label: "Site Visit Details", icon: MapPinned, to: "/sitevisitdetails" },
        {
          key: "attendance",
          label: "Attendance",
          icon: CalendarCheck,
          children: [
            { label: "Mark Attendance", icon: CalendarCheck, to: "/attendance" },
            { label: "View Attendance", icon: CalendarCheck, to: "/viewattendance" },
          ],
        },
        { label: "New Lead KSEB", icon: UserPlus, to: "/new-kseb-lead" },
        // ADMIN + SPECIAL USER -> /tenderdetails, others -> /tenderexecutive
        { label: "Tender Details", icon: FileText, to: tenderPath },
        { label: "PO Details", icon: ClipboardCheck, to: "/podetails" },
        { label: "KSEB Overall Sales", icon: BarChart3, to: "/kseboverallsales" },
        { label: "KSEB Invoices", icon: CreditCard, to: "/ksebinvoices" },
        { label: "KSEB Outstanding", icon: Wallet, to: "/kseboutstanding" },
      ],
    },
    {
      key: "solar",
      label: "Solar",
      icon: Sun,
      children: [
        { label: "New Lead Solar", icon: Sunrise, to: "/solarnewleads" },
        { label: "Solar Customers", icon: Sunrise, to: "/solarcustomers" },
      ],
    },
    {
      key: "users",
      label: "Users",
      icon: UsersRound,
      alignRight: true,
      children: [
        { label: "Create User", icon: UserPlus, to: "/Createuser" },
        { label: "Create KSEB User", icon: UserRoundCheck, to: "/Createksebuser" },
        { label: "Create Sales User", icon: UserPlus, to: "/createsalesuser" },
        { label: "Manage Users", icon: UserCog, to: "/manageusers" },
        { label: "User Activity Report", icon: Activity, to: "/useractivityreport" },
        { label: "Page Access Permissions", icon: ShieldCheck, to: "/pageaccess" },
      ],
    },
  ];

  const openMobileItem = desktopMenu.find(
    (item) => item.key === mobileDropdown && item.children
  );

  // =====================================================
  // CLOSE MOBILE MENU
  // =====================================================

  const closeMobileMenu = () => {
    setMobileDropdown(null);
    setMobileSubDropdown(null);
  };

  // =====================================================
  // LOGOUT
  // =====================================================

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = "/";
    } catch (error) {
      console.error(
        "Error logging out:",
        error.message
      );
    }
  };

  return (
    <>
      {/* =========================================================
          HEADER
      ========================================================= */}

      <header
        className="
          banner-header
          sticky top-0
          bg-slate-900/95
          backdrop-blur-xl
          border-b border-slate-800
          shadow-lg
        "
      >
        <div className="relative flex items-center justify-between gap-3 px-3 md:px-6 py-3">

          {/* =====================================================
              LOGO (left)
          ===================================================== */}

          <Link to={dashboardPath} className="shrink-0">
            <img
              src={everestlogo}
              alt="Everest Logo"
              className="banner-logo h-7 md:h-12 max-w-[100px] md:max-w-[140px]"
            />
          </Link>

          {/* =====================================================
              DESKTOP NAV BAR (horizontal, Amazon-style)
              Sits between the logo and the right-side buttons, always
              visible on large screens.
          ===================================================== */}

          <nav
            ref={navRef}
            className="desktop-navbar hidden lg:flex"
            onMouseLeave={closeDesktopMenu}
          >
            {desktopMenu.map((item) => {
              const Icon = item.icon;

              if (!item.children) {
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    onClick={closeDesktopMenu}
                    onMouseEnter={() => setOpenMenu(null)}
                    className={`navbar-item ${
                      location.pathname === item.to
                        ? "navbar-item-active"
                        : ""
                    }`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              }

              const isOpen = openMenu === item.key;
              const isActive = item.children.some((c) =>
                c.children
                  ? c.children.some(
                      (g) => g.to === location.pathname
                    )
                  : c.to === location.pathname
              );

              return (
                <div
                  key={item.key}
                  className="navbar-parent"
                  onMouseEnter={() => {
                    if (openMenu !== item.key) {
                      setOpenMenu(item.key);
                      setOpenSubMenu(null);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleDropdown(item.key)}
                    className={`navbar-item ${
                      isOpen || isActive
                        ? "navbar-item-active"
                        : ""
                    }`}
                    aria-expanded={isOpen}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div
                      className={`navbar-dropdown ${
                        item.alignRight
                          ? "navbar-dropdown-right"
                          : ""
                      }`}
                    >
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;

                        if (child.children) {
                          const subOpen =
                            openSubMenu === child.key;

                          return (
                            <div key={child.key}>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleSubMenu(child.key)
                                }
                                className="navbar-dropdown-link navbar-dropdown-toggle"
                              >
                                <ChildIcon size={16} />
                                <span>{child.label}</span>
                                <ChevronDown
                                  size={14}
                                  className={`ml-auto transition-transform ${
                                    subOpen ? "rotate-180" : ""
                                  }`}
                                />
                              </button>

                              {subOpen && (
                                <div className="navbar-dropdown-nested">
                                  {child.children.map((g) => {
                                    const GIcon = g.icon;
                                    return (
                                      <Link
                                        key={g.to}
                                        to={g.to}
                                        onClick={closeDesktopMenu}
                                        className={`navbar-dropdown-link ${
                                          location.pathname === g.to
                                            ? "active-submenu"
                                            : ""
                                        }`}
                                      >
                                        <GIcon size={15} />
                                        <span>{g.label}</span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={child.label}
                            to={child.to}
                            onClick={closeDesktopMenu}
                            className={`navbar-dropdown-link ${
                              location.pathname === child.to
                                ? "active-submenu"
                                : ""
                            }`}
                          >
                            <ChildIcon size={16} />
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* =====================================================
              RIGHT SIDE
          ===================================================== */}

          <div className="flex items-center gap-1 md:gap-4 shrink-0">

            {/* NOTIFICATION */}

            <button
              className="
                hidden md:flex
                p-2
                rounded-xl
                text-slate-300
                hover:text-white
                hover:bg-slate-800
                transition
              "
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>

            {/* PROFILE */}

            <Link
              to="/myprofile"
              className="
                w-8 h-8 md:w-9 md:h-9
                rounded-full
                overflow-hidden
                bg-red-600
                text-white
                text-xs md:text-sm
                font-semibold
                flex items-center justify-center
                ring-2 ring-slate-700
                hover:ring-slate-400
                transition
              "
              title="My Profile"
              aria-label="My Profile"
            >
              {profile.photo ? (
                <img
                  src={profile.photo}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : profile.initials ? (
                profile.initials
              ) : (
                <UserRound size={18} />
              )}
            </Link>

            {/* LOGOUT */}

            <button
              onClick={handleLogout}
              className="
                bg-red-600/95
                hover:bg-red-700
                text-white
                px-2 md:px-5
                py-1.5 md:py-2
                rounded-2xl
                text-xs md:text-base
                font-medium
                transition
              "
            >
              Logout
            </button>

          </div>

        </div>


        {/* =====================================================
            MOBILE / TABLET NAV BAR
            Horizontally scrollable row (Amazon mobile style).
            Tapping a section opens its items in a panel below.
        ===================================================== */}

        <div ref={mobileNavRef} className="lg:hidden">
          <nav className="mobile-navbar">
            {desktopMenu.map((item) => {
              const Icon = item.icon;

              if (!item.children) {
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    onClick={closeMobileMenu}
                    className={`mobile-navbar-item ${
                      location.pathname === item.to
                        ? "mobile-navbar-item-active"
                        : ""
                    }`}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </Link>
                );
              }

              const isOpen = mobileDropdown === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    toggleMobileDropdown(item.key);
                    setMobileSubDropdown(null);
                  }}
                  className={`mobile-navbar-item ${
                    isOpen ? "mobile-navbar-item-active" : ""
                  }`}
                  aria-expanded={isOpen}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {openMobileItem && (
            <div className="mobile-nav-panel">
              <div className="mobile-nav-panel-title">
                {openMobileItem.label}
              </div>

              {openMobileItem.children.map((child) => {
                const ChildIcon = child.icon;

                if (child.children) {
                  const subOpen = mobileSubDropdown === child.key;

                  return (
                    <div key={child.key}>
                      <button
                        type="button"
                        onClick={() => toggleMobileSubDropdown(child.key)}
                        className="navbar-dropdown-link"
                      >
                        <ChildIcon size={16} />
                        <span>{child.label}</span>
                        <ChevronDown
                          size={14}
                          className={`ml-auto transition-transform ${
                            subOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {subOpen && (
                        <div className="navbar-dropdown-nested">
                          {child.children.map((g) => {
                            const GIcon = g.icon;
                            return (
                              <Link
                                key={g.to}
                                to={g.to}
                                onClick={closeMobileMenu}
                                className={`navbar-dropdown-link ${
                                  location.pathname === g.to
                                    ? "active-submenu"
                                    : ""
                                }`}
                              >
                                <GIcon size={15} />
                                <span>{g.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={child.label}
                    to={child.to}
                    onClick={closeMobileMenu}
                    className={`navbar-dropdown-link ${
                      location.pathname === child.to
                        ? "active-submenu"
                        : ""
                    }`}
                  >
                    <ChildIcon size={16} />
                    <span>{child.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </header>
    </>
  );
}

export default Banner;