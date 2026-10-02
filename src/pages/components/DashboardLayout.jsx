import Banner from "../../components/Banner/Banner.jsx";
import React from "react";
import { Link, Outlet } from "react-router-dom";
import '../../assets/DashboardLayout.css';

import { NavLink } from 'react-router-dom';
import { useState } from "react";
import { TrendingUp, PackageOpen,ListCollapse } from 'lucide-react';
function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="dashboard-wrapper">
      <Banner />

      <div className="dashboard-layout">


<aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
  <div className="sidebar-top">
    {!collapsed && <h2>DASHBOARD</h2>}
    <button className="collapse-toggle" onClick={() => setCollapsed(!collapsed)}>
      <ListCollapse size={20} color="white" />
    </button>
  </div>


  <div className="sidebar-links">
    <NavLink
      to="/dashboard/dashsales"
      className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
    >
      <TrendingUp className="sidebar-icon" />
      {!collapsed && <span>Sales Overview</span>}
    </NavLink>

    <NavLink
      to="/dashboard/dashdata"
      className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
    >
      <PackageOpen className="sidebar-icon" />
      {!collapsed && <span>Product Overview</span>}
    </NavLink>
  </div>
</aside>

      <div className="main-content">
  <Outlet />
</div>
      </div>
    </div>
  );
}

export default DashboardLayout;
    