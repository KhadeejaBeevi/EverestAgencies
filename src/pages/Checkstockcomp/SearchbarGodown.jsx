import React, { useState, useEffect, useRef } from "react";
import { apiFetch } from "../../api/apiClient";

const SearchBar = ({ value, onChange, parentFilter, categoryFilter }) => {
  const [localTerm, setLocalTerm] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
  setLocalTerm(value);
}, [value]);


useEffect(() => {
apiFetch("/serverphp/getProducts.php", { mode: "cors" })
    .then((res) => res.json())
    .then((data) => {
      const parsedItems = data.map((prod) => ({
        name: prod.name,
        parent: prod.parent,
        category: prod.category,
      }));

      console.log("Parsed items:", parsedItems);
      setAllItems(parsedItems);
    })
    .catch((err) => console.error("Fetch error:", err));
}, []);



  useEffect(() => {
    const timer = setTimeout(() => {
      if (!localTerm) {
        setSuggestions([]);
        return;
      }

      const filtered = allItems
        .filter((item) =>
          item.name.toLowerCase().includes(localTerm.toLowerCase())
        )
        .filter((item) => {
          const matchParent = parentFilter
            ? item.parent?.trim().toLowerCase() === parentFilter.trim().toLowerCase()
            : true;
          const matchCategory = categoryFilter
            ? item.category?.trim().toLowerCase() === categoryFilter.trim().toLowerCase()
            : true;
          return matchParent && matchCategory;
        })
        .map((item) => item.name);

      console.log("Suggestions after filtering:", filtered); // ✅ Debug
      setSuggestions([...new Set(filtered)]);
    }, 200);

    return () => clearTimeout(timer);
  }, [localTerm, allItems, parentFilter, categoryFilter]);

  const handleSearch = () => {
    onChange(localTerm);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (name) => {
    setLocalTerm(name);
    onChange(name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

const handleClear = () => {
  setLocalTerm("");
  onChange("");
  setSuggestions([]);
  setShowSuggestions(false);
};


  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="mb-6 relative w-full max-w-[700px]" ref={wrapperRef}>
      <div className="flex gap-2">
        <div className="relative w-full">
      <input
        type="text"
        value={localTerm}
        onChange={(e) => {
          const term = e.target.value;
          setLocalTerm(term);

          const filtered = allItems
            .filter((item) =>
              item.name.toLowerCase().includes(term.toLowerCase())
            )
            .filter((item) => {
              const matchParent = parentFilter
                ? item.parent?.trim().toLowerCase() === parentFilter.trim().toLowerCase()
                : true;
              const matchCategory = categoryFilter
                ? item.category?.trim().toLowerCase() === categoryFilter.trim().toLowerCase()
                : true;
              return matchParent && matchCategory;
            })
            .map((item) => item.name);

          setSuggestions([...new Set(filtered)]);
          setShowSuggestions(true);
        }}
        onFocus={() => {
          const filtered = allItems
            .filter((item) => {
              const matchParent = parentFilter
                ? item.parent?.trim().toLowerCase() === parentFilter.trim().toLowerCase()
                : true;
              const matchCategory = categoryFilter
                ? item.category?.trim().toLowerCase() === categoryFilter.trim().toLowerCase()
                : true;
              return matchParent && matchCategory;
            })
            .map((item) => item.name);

          setSuggestions([...new Set(filtered)]);
          setShowSuggestions(true);
        }}
        placeholder="Search by Product ..."
        className="w-full border px-4 py-2 pr-10 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400"
      />

      {/* Clear (X) button inside input */}
      {localTerm && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          type="button"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>

    {/* Search button on the right */}
    <button
      onClick={handleSearch}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
    >
      Search
    </button>
  </div>

  {/* Suggestions dropdown */}
  {showSuggestions && suggestions.length > 0 && (
    <ul className="absolute z-10 bg-white border w-full mt-1 rounded shadow max-h-40 overflow-y-auto">
      {suggestions.map((name, idx) => (
        <li
          key={idx}
          onMouseDown={() => handleSuggestionClick(name)}
          className="px-4 py-2 cursor-pointer hover:bg-gray-100"
        >
          {name}
        </li>
      ))}
    </ul>
  )}
</div>

  );
};

export default SearchBar;