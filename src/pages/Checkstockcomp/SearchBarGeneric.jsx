import React, { useState, useEffect, useRef } from "react";
import { apiFetch } from "../../api/apiClient";

const SearchBarGeneric = ({
  value,
  onChange,
  fieldName,
  placeholder,
  parentFilter,
  categoryFilter, // ✅ added
}) => {
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
      const parsed = data.map((prod) => ({
        name: prod.name,
        parent: prod.parent,
        category: prod.category,
      }));

      setAllItems(parsed);
    })
    .catch((err) => console.error("Failed to fetch:", err));
}, []);

  const getFilteredValues = () => {
    let filtered = allItems;

    if (fieldName === "ITEMCATEGORY" && parentFilter) {
      filtered = filtered.filter(
        (item) =>
item.parent?.trim().toLowerCase() === parentFilter?.trim().toLowerCase()
      );
      return [...new Set(filtered.map((item) => item.category))];
    }

    if (fieldName === "ITEMPARENT" && categoryFilter) {
      filtered = filtered.filter(
        (item) =>
item.parent?.trim().toLowerCase() === parentFilter?.trim().toLowerCase()
      );
      return [...new Set(filtered.map((item) => item.parent))];
    }

    // Default case: return unique values of the selected field
    return [...new Set(filtered.map((item) => item[fieldName.toLowerCase().replace("item", "")]))];
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      const values = getFilteredValues();
      const filteredSuggestions = values.filter((item) =>
        item.toLowerCase().includes(localTerm.toLowerCase())
      );
      setSuggestions(filteredSuggestions);
    }, 200);

    return () => clearTimeout(handler);
  }, [localTerm, allItems, fieldName, parentFilter, categoryFilter]);

  const handleSearch = () => {
    onChange(localTerm);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (item) => {
    setLocalTerm(item);
    onChange(item);
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
              const values = getFilteredValues();
              const filtered = values.filter((item) =>
                item.toLowerCase().includes(term.toLowerCase())
              );
              setSuggestions(filtered);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              const values = getFilteredValues();
              setSuggestions(values);
              setShowSuggestions(true);
            }}
            placeholder={placeholder}
            className="w-full border px-4 py-2 pr-10 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />

          {localTerm && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
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

        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Search
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-10 bg-white border w-full mt-1 rounded shadow max-h-40 overflow-y-auto">
          {suggestions.map((item, idx) => (
            <li
              key={idx}
              onMouseDown={() => handleSuggestionClick(item)}
              className="px-4 py-2 cursor-pointer hover:bg-gray-100"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBarGeneric;
