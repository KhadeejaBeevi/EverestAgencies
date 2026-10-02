import React, { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import "./Banner.css";
import everestlogo from '/everestlogo.png'; // ✅ Vite will resolve this from /public

function Banner() {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div>
      <div className="red-banner">
        <div className="hamburger-container" onClick={toggleMenu}>
          &#9776;
          {menuOpen && (
            <div className="dropdown-menu">
              <Link to="/dashboard">DASHBOARD</Link>
              <Link to="/stock-check">CHECK STOCK</Link>
            </div>
          )}
        </div>
        <img src={everestlogo} alt="Everest Logo" className="banner-logo" />
      </div>

      {/* ✅ Outlet renders the nested component like <StockSearch /> */}
      <div className="stock-content">
        <Outlet />
      </div>
    </div>
  );
}

export default Banner;

