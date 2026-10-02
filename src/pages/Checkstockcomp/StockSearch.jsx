import React, { useState, useEffect } from "react";
import "./StockSearch.css";
import ProductCard from "./ProductCard";
import { Search,UsersRound } from "lucide-react";


const StockSearch = () => {
  const [stockData, setStockData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  
  useEffect(() => {
    fetch("/record.json")
      .then((res) => res.json())
      .then((data) => setStockData(data))
      .catch((err) => console.error("Error loading JSON:", err));
  }, []);

  const handleSearchClick = () => {
    setSearchQuery(searchTerm);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (name) => {
    setSearchTerm(name);
    setSearchQuery(name);
    setShowSuggestions(false);
  };

  const suggestions = stockData.filter((item) =>
    item.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredData = stockData.filter((item) =>
    item.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (

      <div className="stock-dashboard">
      
    <div className="stock-search-container">
    <h1 className="stock-title">STOCK CHECK</h1>
    <hr className="stock-underline" />


      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by product name..."
          className="stock-input"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowSuggestions(true);
          }}
        />
        <button className="search-button" onClick={handleSearchClick}>
          Search
        </button>
      </div>
    <div/>        
      {/* Suggestions dropdown */}
      {showSuggestions && searchTerm && (
        <ul className="suggestions-list">
          {suggestions.slice(0, 5).map((item) => (
            <li
              key={item.id}
              className="suggestion-item"
              onClick={() => handleSuggestionClick(item.name)}
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}

<div className="product-list">
  {searchQuery ? (
    filteredData.length > 0 ? (
      filteredData.map((item) => (
          <ProductCard
        key={item.id}
        name={item.name}
        image={item.image}
        price={item.price}
        description={item.description}
    />
      ))
    ) : (
      <p>No product found.</p>
    )
  ) : (
    stockData.length > 0 && (
      <ProductCard
        key={stockData[0].id}
        name={stockData[0].name}
        image={stockData[0].image}
        price={stockData[0].price}
        description={stockData[0].description}
      />
    )
  )}
</div>
</div>
</div>
  );
};

export default StockSearch;
