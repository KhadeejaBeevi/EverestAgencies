import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import everestlogo from "/everestlogo.png";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import "./Banner.css";

import {
  ChevronDown,
  ChevronRight,
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
  PackageSearch,
  Truck,
  Boxes,
  Sun,
  Sunrise,
  CreditCard,
  ShieldCheck,
  Activity,
  Menu,
  X,
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
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openSubMenu, setOpenSubMenu] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
    setMenuOpen(false);
    setOpenMenu(null);
    setOpenSubMenu(null);
  };

  // =====================================================
  // CLOSE MOBILE MENU
  // =====================================================

  const closeMobileMenu = () => {
    setMobileMenu(false);
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
        <div className="relative flex items-center justify-between px-3 md:px-6 py-3">

          {/* =====================================================
              DESKTOP MENU
          ===================================================== */}

          <div className="flex items-center">
            <nav className="relative hidden lg:block">

              {/* MAIN MENU BUTTON */}

              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="
                  flex items-center gap-2
                  px-4 py-2
                  rounded-xl
                  font-medium
                  text-slate-300
                  hover:text-white
                  hover:bg-slate-800
                  transition-all
                "
              >
                <Menu size={20} />

                MENU

                <ChevronDown
                  size={16}
                  className={`transition-transform ${
                    menuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* =================================================
                  DESKTOP DROPDOWN
              ================================================= */}

              {menuOpen && (
                <div className="menu-popup">

                  {/* DASHBOARD */}

                  <Link
                    to={dashboardPath}
                    onClick={closeDesktopMenu}
                    className={`menu-item ${
                      location.pathname === dashboardPath
                        ? "active-menu"
                        : ""
                    }`}
                  >
                    <LayoutDashboard size={18} />
                    <span>DASHBOARD</span>
                  </Link>

                  {/* PDC */}

                  <Link
                    to="/postdatedcheques"
                    onClick={closeDesktopMenu}
                    className="menu-item"
                  >
                    <CreditCard size={18} />
                    <span>PDC</span>
                  </Link>

                  {/* =================================================
                      QUOTATION TRACKING
                  ================================================= */}

                  <div className="submenu-parent">

                    <button
                      onClick={() =>
                        toggleDropdown(
                          "sales order tracking"
                        )
                      }
                      className="menu-dropdown-btn"
                    >
                      <span className="flex items-center gap-3">
                        <FileSearch size={18} />
                        QUOTATION TRACKING
                      </span>

                      <ChevronRight
                        size={16}
                        className={`transition ${
                          openMenu ===
                          "sales order tracking"
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                    </button>

                    {openMenu === "sales order tracking" && (
                      <div className="menu-flyout">

                        <Link
                          to="/enquiryreport"
                          onClick={closeDesktopMenu}
                        >
                          <FileQuestion size={16} />
                          <span>Enquiry Capture</span>
                        </Link>

                        <Link
                          to="/quotationfollowup"
                          onClick={closeDesktopMenu}
                        >
                          <Files size={16} />
                          <span>Quotation List</span>
                        </Link>

                        <Link
                          to="/quotationwise"
                          onClick={closeDesktopMenu}
                        >
                          <ListChecks size={16} />
                          <span>
                            Quotation Wise Followup
                          </span>
                        </Link>

                          <Link
                          to="/telecallerreport"
                          onClick={closeDesktopMenu}
                        >
                          <PhoneCall size={16} />
                          <span>SalesCoordinator Report</span>
                        </Link>

                      </div>
                    )}

                  </div>

                  {/* =================================================
                      CRM
                  ================================================= */}

                  <div className="submenu-parent">

                    <button
                      onClick={() =>
                        toggleDropdown("crm")
                      }
                      className="menu-dropdown-btn"
                    >
                      <span className="flex items-center gap-3">
                        <ContactRound size={18} />
                        CRM
                      </span>

                      <ChevronRight
                        size={16}
                        className={`transition ${
                          openMenu === "crm"
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                    </button>

                    {openMenu === "crm" && (
                      <div className="menu-flyout">

                        <Link
                          to="/salescrm"
                          onClick={closeDesktopMenu}
                        >
                          <ContactRound size={16} />
                          <span>Sales CRM</span>
                        </Link>

                        <Link
                          to="/CRMstockitem"
                          onClick={closeDesktopMenu}
                        >
                          <Boxes size={16} />
                          <span>Stock Items</span>
                        </Link>

                        <Link
                          to="/stock-check"
                          onClick={closeDesktopMenu}
                        >
                          <ClipboardCheck size={16} />
                          <span>Stock Check</span>
                        </Link>

                      </div>
                    )}

                  </div>

                  {/* =================================================
                      SALES
                  ================================================= */}

                  <div className="submenu-parent">

                    <button
                      onClick={() =>
                        toggleDropdown("sales")
                      }
                      className="menu-dropdown-btn"
                    >
                      <span className="flex items-center gap-3">
                        <ShoppingBag size={18} />
                        SALES
                      </span>

                      <ChevronRight
                        size={16}
                        className={`transition ${
                          openMenu === "sales"
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                    </button>

                    {openMenu === "sales" && (
                      <div className="menu-flyout">

                        <Link
                          to="/salesorders"
                          onClick={closeDesktopMenu}
                        >
                          <PackageSearch size={16} />
                          <span>Pending Orders</span>
                        </Link>

                        <Link
                          to="/lrdetails"
                          onClick={closeDesktopMenu}
                        >
                          <Truck size={16} />
                          <span>LR Details</span>
                        </Link>

                        <Link
                          to="/salessitevisit"
                          onClick={closeDesktopMenu}
                        >
                          <MapPinned size={16} />
                          <span>Site Visits</span>
                        </Link>

                        <Link
                          to="/newpartyledgerdetails"
                          onClick={closeDesktopMenu}
                        >
                          <UserPlus size={16} />
                          <span>New Lead GEN</span>
                        </Link>

                      

                      </div>
                    )}

                  </div>

                  {/* =================================================
                      KSEB
                  ================================================= */}

                  <div className="submenu-parent">

                    <button
                      onClick={() =>
                        toggleDropdown("kseb")
                      }
                      className="menu-dropdown-btn"
                    >
                      <span className="flex items-center gap-3">
                        <Building2 size={18} />
                        KSEB
                      </span>

                      <ChevronRight
                        size={16}
                        className={`transition ${
                          openMenu === "kseb"
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                    </button>

                    {openMenu === "kseb" && (
                      <div className="menu-flyout">

                        {/* KSEB DIRECTORY */}

                        <div className="submenu-parent">

                          <button
                            onClick={() =>
                              toggleSubMenu(
                                "ksebDirectory"
                              )
                            }
                            className="menu-dropdown-btn w-full"
                          >
                            <span className="flex items-center gap-3">
                              <BookUser size={17} />
                              KSEB Directory
                            </span>

                            <ChevronRight
                              size={15}
                              className={`transition ${
                                openSubMenu ===
                                "ksebDirectory"
                                  ? "rotate-180"
                                  : ""
                              }`}
                            />
                          </button>

                          {openSubMenu ===
                            "ksebDirectory" && (
                            <div className="menu-submenu-inner">

                              <Link
                                to="/ksebdirectory"
                                onClick={
                                  closeDesktopMenu
                                }
                                className={
                                  location.pathname ===
                                  "/ksebdirectory"
                                    ? "active-submenu"
                                    : ""
                                }
                              >
                                <BookUser size={15} />

                                <span>
                                  Card View
                                </span>
                              </Link>

                              <Link
                                to="/ksebdirectorytable"
                                onClick={
                                  closeDesktopMenu
                                }
                                className={
                                  location.pathname ===
                                  "/ksebdirectorytable"
                                    ? "active-submenu"
                                    : ""
                                }
                              >
                                <Files size={15} />

                                <span>
                                  Table View
                                </span>
                              </Link>

                            </div>
                          )}

                        </div>

                        {/* CALL HISTORY */}

                        <Link
                          to="/callhistory"
                          onClick={closeDesktopMenu}
                        >
                          <PhoneCall size={16} />
                          <span>Call History</span>
                        </Link>

                        {/* SITE VISIT */}

                        <Link
                          to="/sitevisitdetails"
                          onClick={closeDesktopMenu}
                        >
                          <MapPinned size={16} />

                          <span>
                            Site Visit Details
                          </span>
                        </Link>

                        {/* ATTENDANCE */}

                        <div className="submenu-parent">

                          <button
                            onClick={() =>
                              toggleSubMenu(
                                "attendance"
                              )
                            }
                            className="menu-dropdown-btn"
                          >
                            <span className="flex items-center gap-3">
                              <CalendarCheck size={16} />
                              Attendance
                            </span>

                            <ChevronRight
                              size={16}
                              className={`transition ${
                                openSubMenu ===
                                "attendance"
                                  ? "rotate-180"
                                  : ""
                              }`}
                            />
                          </button>

                          {openSubMenu ===
                            "attendance" && (
                            <div className="menu-flyout">

                              <Link
                                to="/attendance"
                                onClick={
                                  closeDesktopMenu
                                }
                                className={
                                  location.pathname ===
                                  "/attendance"
                                    ? "active-submenu"
                                    : ""
                                }
                              >
                                <CalendarCheck size={15} />

                                <span>
                                  Mark Attendance
                                </span>
                              </Link>

                              <Link
                                to="/viewattendance"
                                onClick={
                                  closeDesktopMenu
                                }
                                className={
                                  location.pathname ===
                                  "/viewattendance"
                                    ? "active-submenu"
                                    : ""
                                }
                              >
                                <CalendarCheck size={15} />

                                <span>
                                  View Attendance
                                </span>
                              </Link>

                            </div>
                          )}

                        </div>

                        {/* NEW KSEB LEAD */}

                        <Link
                          to="/new-kseb-lead"
                          onClick={closeDesktopMenu}
                        >
                          <UserPlus size={16} />
                          <span>
                            New Lead KSEB
                          </span>
                        </Link>

                        {/* =================================================
                            TENDER
                            
                            ADMIN + SPECIAL USER
                                -> /tenderdetails

                            ALL OTHER USERS
                                -> /tenderexecutive
                        ================================================= */}

                        <Link
                          to={tenderPath}
                          onClick={closeDesktopMenu}
                        >
                          <FileText size={16} />
                          <span>
                            Tender Details
                          </span>
                        </Link>

                        {/* PO */}

                        <Link
                          to="/podetails"
                          onClick={closeDesktopMenu}
                        >
                          <ClipboardCheck size={16} />
                          <span>
                            PO Details
                          </span>
                        </Link>

                        <Link
                          to="/kseboverallsales"
                          onClick={closeDesktopMenu}
                        >
                          <BarChart3 size={16} />
                          <span>KSEB Overall Sales</span>
                        </Link>

                        <Link
                          to="/ksebpayment"
                          onClick={closeDesktopMenu}
                        >
                          <CreditCard size={16} />
                          <span>KSEB Payment</span>
                        </Link>

                      </div>
                    )}

                  </div>

                  {/* =================================================
                      SOLAR
                  ================================================= */}

                  <div className="submenu-parent">

                    <button
                      onClick={() =>
                        toggleDropdown("solar")
                      }
                      className="menu-dropdown-btn"
                    >
                      <span className="flex items-center gap-3">
                        <Sun size={18} />
                        SOLAR
                      </span>

                      <ChevronRight
                        size={16}
                        className={`transition ${
                          openMenu === "solar"
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                    </button>

                    {openMenu === "solar" && (
                      <div className="menu-flyout">

                        <Link
                          to="/solarnewleads"
                          onClick={closeDesktopMenu}
                        >
                          <Sunrise size={16} />
                          <span>
                            New Lead Solar
                          </span>
                        </Link>

                            <Link
                          to="/solarcustomers"
                          onClick={closeDesktopMenu}
                        >
                          <Sunrise size={16} />
                          <span>
                            Solar Customers
                          </span>
                        </Link>

                      </div>
                    )}

                  </div>

                  {/* =================================================
                      USERS
                  ================================================= */}

                  <div className="submenu-parent">

                    <button
                      onClick={() =>
                        toggleDropdown("users")
                      }
                      className="menu-dropdown-btn"
                    >
                      <span className="flex items-center gap-3">
                        <UsersRound size={18} />
                        USERS
                      </span>

                      <ChevronRight
                        size={16}
                        className={`transition ${
                          openMenu === "users"
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                    </button>

                    {openMenu === "users" && (
                      <div className="menu-flyout">

                        <Link
                          to="/Createuser"
                          onClick={closeDesktopMenu}
                        >
                          <UserPlus size={16} />
                          <span>
                            Create User
                          </span>
                        </Link>

                        <Link
                          to="/Createksebuser"
                          onClick={closeDesktopMenu}
                        >
                          <UserRoundCheck size={16} />

                          <span>
                            Create KSEB User
                          </span>
                        </Link>

                        <Link
                          to="/createsalesuser"
                          onClick={closeDesktopMenu}
                        >
                          <UserPlus size={16} />

                          <span>
                            Create Sales User
                          </span>
                        </Link>

                        <Link
                          to="/manageusers"
                          onClick={closeDesktopMenu}
                        >
                          <UserCog size={16} />
                          <span>
                            Manage Users
                          </span>
                        </Link>

                        <Link
                          to="/useractivityreport"
                          onClick={closeDesktopMenu}
                        >
                          <Activity size={16} />

                          <span>
                            User Activity Report
                          </span>
                        </Link>

                        <Link
                          to="/pageaccess"
                          onClick={closeDesktopMenu}
                        >
                          <ShieldCheck size={16} />

                          <span>
                            Page Access Permissions
                          </span>
                        </Link>

                      </div>
                    )}

                  </div>

                </div>
              )}

            </nav>
          </div>

          {/* =====================================================
              CENTER LOGO
          ===================================================== */}

          <div className="absolute left-1/2 -translate-x-1/2">

            <Link to={dashboardPath}>

              <img
                src={everestlogo}
                alt="Everest Logo"
                className="
                  h-7
                  md:h-12
                  max-w-[100px]
                  md:max-w-[140px]
                "
              />

            </Link>

          </div>

          {/* =====================================================
              RIGHT SIDE
          ===================================================== */}

          <div className="flex items-center gap-1 md:gap-4">

            {/* MOBILE MENU BUTTON */}

            <button
              onClick={() => {
                setMobileMenu(!mobileMenu);

                if (mobileMenu) {
                  setMobileDropdown(null);
                  setMobileSubDropdown(null);
                }
              }}
              className="
                lg:hidden
                p-2
                rounded-xl
                text-slate-300
                hover:bg-slate-800
              "
              aria-label="Open menu"
            >
              {mobileMenu ? (
                <X size={22} />
              ) : (
                <Menu size={22} />
              )}
            </button>

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
      </header>

      {/* =========================================================
          MOBILE MENU
      ========================================================= */}

      {mobileMenu && (
        <div
          className="
            lg:hidden
            bg-slate-900
            border-t border-slate-800
            px-4 py-4
            space-y-2
          "
        >

          {/* DASHBOARD */}

          <Link
            to={dashboardPath}
            onClick={closeMobileMenu}
            className="mobile-link"
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </Link>

          {/* MY PROFILE */}

          <Link
            to="/myprofile"
            onClick={closeMobileMenu}
            className="mobile-link"
          >
            <UserRound size={18} />
            <span>My Profile</span>
          </Link>

          {/* USERS */}

          <button
            onClick={() =>
              toggleMobileDropdown("users")
            }
            className="mobile-dropdown-btn"
          >
            <span className="flex items-center gap-3">
              <UsersRound size={18} />
              Users
            </span>

            <ChevronRight
              size={18}
              className={`transition ${
                mobileDropdown === "users"
                  ? "rotate-180"
                  : ""
              }`}
            />
          </button>

          {mobileDropdown === "users" && (
            <div className="mobile-submenu">

              <Link
                to="/Createuser"
                onClick={closeMobileMenu}
              >
                <UserPlus size={16} />
                <span>Create User</span>
              </Link>

              <Link
                to="/Createksebuser"
                onClick={closeMobileMenu}
              >
                <UserRoundCheck size={16} />
                <span>
                  Create KSEB User
                </span>
              </Link>

              <Link
                to="/createsalesuser"
                onClick={closeMobileMenu}
              >
                <UserPlus size={16} />
                <span>
                  Create Sales User
                </span>
              </Link>

              <Link
                to="/manageusers"
                onClick={closeMobileMenu}
              >
                <UserCog size={16} />
                <span>
                  Manage Users
                </span>
              </Link>

              <Link
                to="/useractivityreport"
                onClick={closeMobileMenu}
              >
                <Activity size={16} />
                <span>
                  User Activity Report
                </span>
              </Link>

              <Link
                to="/pageaccess"
                onClick={closeMobileMenu}
              >
                <ShieldCheck size={16} />

                <span>
                  Page Access Permissions
                </span>
              </Link>

            </div>
          )}

          {/* CRM */}

          <button
            onClick={() =>
              toggleMobileDropdown("crm")
            }
            className="mobile-dropdown-btn"
          >
            <span className="flex items-center gap-3">
              <ContactRound size={18} />
              CRM
            </span>

            <ChevronRight
              size={18}
              className={`transition ${
                mobileDropdown === "crm"
                  ? "rotate-180"
                  : ""
              }`}
            />
          </button>

          {mobileDropdown === "crm" && (
            <div className="mobile-submenu">

              <Link
                to="/salescrm"
                onClick={closeMobileMenu}
              >
                <ContactRound size={16} />
                <span>
                  Sales CRM
                </span>
              </Link>

              <Link
                to="/CRMstockitem"
                onClick={closeMobileMenu}
              >
                <Boxes size={16} />
                <span>
                  Stock Items
                </span>
              </Link>

              <Link
                to="/stock-check"
                onClick={closeMobileMenu}
              >
                <ClipboardCheck size={16} />
                <span>
                  Stock Check
                </span>
              </Link>

            </div>
          )}

          {/* =====================================================
              KSEB MOBILE
          ===================================================== */}

          <button
            onClick={() =>
              toggleMobileDropdown("kseb")
            }
            className="mobile-dropdown-btn"
          >
            <span className="flex items-center gap-3">
              <Building2 size={18} />
              KSEB
            </span>

            <ChevronRight
              size={18}
              className={`transition ${
                mobileDropdown === "kseb"
                  ? "rotate-180"
                  : ""
              }`}
            />
          </button>

          {mobileDropdown === "kseb" && (
            <div className="mobile-submenu">

              {/* KSEB DIRECTORY */}

              <button
                onClick={() =>
                  toggleMobileSubDropdown(
                    "ksebDirectory"
                  )
                }
                className="
                  mobile-dropdown-btn
                  mobile-sub-btn
                "
              >
                <span className="flex items-center gap-3">
                  <BookUser size={17} />
                  KSEB Directory
                </span>

                <ChevronRight
                  size={16}
                  className={`transition ${
                    mobileSubDropdown ===
                    "ksebDirectory"
                      ? "rotate-180"
                      : ""
                  }`}
                />
              </button>

              {mobileSubDropdown ===
                "ksebDirectory" && (
                <div className="mobile-submenu-inner">

                  <Link
                    to="/ksebdirectory"
                    onClick={closeMobileMenu}
                  >
                    <BookUser size={15} />
                    <span>
                      Card View
                    </span>
                  </Link>

                  <Link
                    to="/ksebdirectorytable"
                    onClick={closeMobileMenu}
                  >
                    <Files size={15} />
                    <span>
                      Table View
                    </span>
                  </Link>

                </div>
              )}

              {/* CALL HISTORY */}

              <Link
                to="/callhistory"
                onClick={closeMobileMenu}
              >
                <PhoneCall size={16} />
                <span>
                  Call History
                </span>
              </Link>

              {/* SITE VISIT */}

              <Link
                to="/sitevisitdetails"
                onClick={closeMobileMenu}
              >
                <MapPinned size={16} />
                <span>
                  Site Visit Details
                </span>
              </Link>

              {/* ATTENDANCE */}

              <button
                onClick={() =>
                  toggleMobileSubDropdown(
                    "attendance"
                  )
                }
                className="
                  mobile-dropdown-btn
                  mobile-sub-btn
                "
              >
                <span className="flex items-center gap-3">
                  <CalendarCheck size={17} />
                  Attendance
                </span>

                <ChevronRight
                  size={16}
                  className={`transition ${
                    mobileSubDropdown ===
                    "attendance"
                      ? "rotate-180"
                      : ""
                  }`}
                />
              </button>

              {mobileSubDropdown ===
                "attendance" && (
                <div className="mobile-submenu-inner">

                  <Link
                    to="/attendance"
                    onClick={closeMobileMenu}
                  >
                    <CalendarCheck size={15} />

                    <span>
                      Mark Attendance
                    </span>
                  </Link>

                  <Link
                    to="/viewattendance"
                    onClick={closeMobileMenu}
                  >
                    <CalendarCheck size={15} />

                    <span>
                      View Attendance
                    </span>
                  </Link>

                </div>
              )}

              {/* NEW KSEB LEAD */}

              <Link
                to="/new-kseb-lead"
                onClick={closeMobileMenu}
              >
                <UserPlus size={16} />

                <span>
                  New Lead KSEB
                </span>
              </Link>

              {/* =================================================
                  TENDER MOBILE

                  ADMIN + SPECIAL USER
                      -> /tenderdetails

                  ALL OTHER USERS
                      -> /tenderexecutive
              ================================================= */}

              <Link
                to={tenderPath}
                onClick={closeMobileMenu}
              >
                <FileText size={16} />

                <span>
                  Tender Details
                </span>
              </Link>

              {/* PO */}

              <Link
                to="/podetails"
                onClick={closeMobileMenu}
              >
                <ClipboardCheck size={16} />

                <span>
                  PO Details
                </span>
              </Link>

              <Link
                to="/kseboverallsales"
                onClick={closeMobileMenu}
              >
                <BarChart3 size={16} />
                <span>KSEB Overall Sales</span>
              </Link>

              <Link
                to="/ksebpayment"
                onClick={closeMobileMenu}
              >
                <CreditCard size={16} />
                <span>KSEB Payment</span>
              </Link>

            </div>
          )}

          {/* =====================================================
              SALES
          ===================================================== */}

          <button
            onClick={() =>
              toggleMobileDropdown("sales")
            }
            className="mobile-dropdown-btn"
          >
            <span className="flex items-center gap-3">
              <ShoppingBag size={18} />
              Sales
            </span>

            <ChevronRight
              size={18}
              className={`transition ${
                mobileDropdown === "sales"
                  ? "rotate-180"
                  : ""
              }`}
            />
          </button>

          {mobileDropdown === "sales" && (
            <div className="mobile-submenu">

              <Link
                to="/salesorders"
                onClick={closeMobileMenu}
              >
                <PackageSearch size={16} />
                <span>
                  Pending Orders
                </span>
              </Link>

              <Link
                to="/lrdetails"
                onClick={closeMobileMenu}
              >
                <Truck size={16} />
                <span>
                  LR Details
                </span>
              </Link>

              <Link
                to="/salessitevisit"
                onClick={closeMobileMenu}
              >
                <MapPinned size={16} />
                <span>
                  Site Visits
                </span>
              </Link>

              <Link
                to="/newpartyledgerdetails"
                onClick={closeMobileMenu}
              >
                <UserPlus size={16} />
                <span>
                  New Lead GEN
                </span>
              </Link>

          

           

            </div>
          )}

          {/* =====================================================
              QUOTATION TRACKING
          ===================================================== */}

          <button
            onClick={() =>
              toggleMobileDropdown(
                "quotationTracking"
              )
            }
            className="mobile-dropdown-btn"
          >
            <span className="flex items-center gap-3">
              <FileSearch size={18} />
              Quotation Tracking
            </span>

            <ChevronRight
              size={18}
              className={`transition ${
                mobileDropdown ===
                "quotationTracking"
                  ? "rotate-180"
                  : ""
              }`}
            />
          </button>

          {mobileDropdown ===
            "quotationTracking" && (
            <div className="mobile-submenu">

              <Link
                to="/enquiryreport"
                onClick={closeMobileMenu}
              >
                <FileQuestion size={16} />

                <span>
                  Enquiry Capture
                </span>
              </Link>

              <Link
                to="/quotationfollowup"
                onClick={closeMobileMenu}
              >
                <Files size={16} />

                <span>
                  Quotation List
                </span>
              </Link>

              <Link
                to="/quotationwise"
                onClick={closeMobileMenu}
              >
                <ListChecks size={16} />

                <span>
                  Quotation Wise Followup
                </span>
              </Link>
                  <Link
                to="/telecallerreport"
                onClick={closeMobileMenu}
              >
                <PhoneCall size={16} />
                <span>
                  SalesCoordinator Report
                </span>
              </Link>

            </div>
          )}

          {/* SOLAR */}

          <button
            onClick={() =>
              toggleMobileDropdown("solar")
            }
            className="mobile-dropdown-btn"
          >
            <span className="flex items-center gap-3">
              <Sun size={18} />
              Solar
            </span>

            <ChevronRight
              size={18}
              className={`transition ${
                mobileDropdown === "solar"
                  ? "rotate-180"
                  : ""
              }`}
            />
          </button>

          {mobileDropdown === "solar" && (
            <div className="mobile-submenu">

              <Link
                to="/solarnewleads"
                onClick={closeMobileMenu}
              >
                <Sunrise size={16} />

                <span>
                  New Lead Solar
                </span>
              </Link>

                <Link
                to="/solarcustomers"
                onClick={closeMobileMenu}
              >
                
                <Sunrise size={16} />
                <span>
                  Solar Customers
                </span>
              </Link>

            </div>
          )}

          {/* PDC */}

          <Link
            to="/postdatedcheques"
            onClick={closeMobileMenu}
            className="mobile-link"
          >
            <CreditCard size={18} />

            <span>
              Postdated Cheques
            </span>
          </Link>

        </div>
      )}
    </>
  );
}

export default Banner;