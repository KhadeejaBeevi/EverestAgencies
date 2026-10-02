// src/pages/Sales.jsx
import React from 'react';
import './Salesimage.css'; // Optional CSS file
import salesImage from "/Screenshot 2025-04-26 121725.png"

const Sales = () => {
  return (
    <div className="sales-page">
      <h1>Welcome to the Sales Page</h1>
      <p>Track and manage your sales data effectively here.</p>

      <img src={salesImage} alt="Sales graph" className="sales-image" />
    </div>
  );
};

export default Sales;
