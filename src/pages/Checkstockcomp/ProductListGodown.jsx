// src/components/ProductList.jsx
import React, { useEffect, useState } from "react";
import SearchBar from "./SearchbarGodown"; // ✅ import search bar
import SearchBarGeneric from "./SearchBarGeneric";
import { apiFetch } from "../../api/apiClient";

function ProductList() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryTerm, setCategoryTerm] = useState("");
  const [parentTerm, setParentTerm] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    loadProducts();       // Show existing stock immediately
    updateStock();        // Start background update
  }, []);

  const loadProducts = async () => {
    try {
      const res = await apiFetch("/serverphp/getProducts.php");
      const data = await res.json();

      const products = [];
      const seenNames = new Set();

      data.forEach((prod) => {
        if (seenNames.has(prod.name)) return;
        seenNames.add(prod.name);

        products.push({
          name: prod.name || "",
          parent: prod.parent || "",
          category: prod.category || "",
          GD1ITEMOPBAL: prod.GD1ITEMOPBAL || "",
          GD1ITEMCLBAL: prod.GD1ITEMCLBAL || "",
          GD2ITEMOPBAL: prod.GD2ITEMOPBAL || "",
          GD2ITEMCLBAL: prod.GD2ITEMCLBAL || "",
          GD3ITEMOPBAL: prod.GD3ITEMOPBAL || "",
          GD3ITEMCLBAL: prod.GD3ITEMCLBAL || "",
          GD4ITEMOPBAL: prod.GD4ITEMOPBAL || "",
          GD4ITEMCLBAL: prod.GD4ITEMCLBAL || "",
          GD5ITEMOPBAL: prod.GD5ITEMOPBAL || "",
          GD5ITEMCLBAL: prod.GD5ITEMCLBAL || "",
          GD6ITEMOPBAL: prod.GD6ITEMOPBAL || "",
          GD6ITEMCLBAL: prod.GD6ITEMCLBAL || "",
          GD7ITEMOPBAL: prod.GD7ITEMOPBAL || "",
          GD7ITEMCLBAL: prod.GD7ITEMCLBAL || "",
        });
      });

      setProducts(products);
    } catch (err) {
      console.error(err);
    }
  };
  const updateStock = async () => {
    setUpdating(true);
    setUpdateMessage("🟡 Updating stock from Tally...");

    try {
      const res = await apiFetch("/serverphp/updateProducts.php");

      const text = await res.text();

      console.log("RAW RESPONSE:", text);

      const result = JSON.parse(text);

      console.log("JSON RESULT:", result);

      if (result.status === "success") {
        await loadProducts();

        setUpdateMessage("🟢 Latest stock loaded successfully.");
      } else {
        setUpdateMessage(
          "🔴 Stock update failed: " + (result.message || "")
        );
      }

    } catch (err) {
      console.error("UPDATE ERROR:", err);
      setUpdateMessage("🔴 Unable to update stock");
    } finally {
      setUpdating(false);
    }
  };




  const filteredProducts = products.filter((prod) =>
    prod.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    prod.category.toLowerCase().includes(categoryTerm.toLowerCase()) &&
    prod.parent.toLowerCase().includes(parentTerm.toLowerCase())
  );


  // Show either:
  // - filtered results if user is typing
  // - first item by default (optional)
  const visibleProducts =
    searchTerm.trim() === "" &&
      categoryTerm.trim() === "" &&
      parentTerm.trim() === ""
      ? products.slice(0, 1) // only first product when no filters applied
      : filteredProducts;

  const ProductImage = ({ name }) => {
    const [attemptedPng, setAttemptedPng] = useState(false);

    const handleError = (e) => {
      if (!attemptedPng) {
        setAttemptedPng(true);
        e.target.src = `https://app.everestagencies.com/light-images/${encodeURIComponent(name)}.png`;
      } else {
        e.target.src = "/imagenotfound.png";
      }
    };

    return (
      <img
        src={`https://app.everestagencies.com/light-images/${encodeURIComponent(name)}.jpg`}
        alt={name}
        onError={handleError}
        className="h-64 w-64 object-contain"
      />
    );
  };


  return (

    <div className="px-4 py-6 w-full bg-blue-50">

      <h2 className="text-xl font-bold mb-4 text-center uppercase underline underline-offset-4 decoration-red-600">
        Product Godown Stock Check
      </h2>
      {updateMessage && (
        <div
          className={`mb-4 rounded border p-3 text-center font-semibold ${updateMessage.includes("🟡")
            ? "bg-yellow-100 border-yellow-400 text-yellow-800"
            : updateMessage.includes("🟢")
              ? "bg-green-100 border-green-400 text-green-800"
              : "bg-red-100 border-red-400 text-red-800"
            }`}
        >
          {updateMessage}
        </div>
      )}
      <div className="flex justify-end mb-5">
        <button
          className="mt-2 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
          onClick={() => {
            setSearchTerm("");
            setCategoryTerm("");
            setParentTerm("");
          }}
        >
          Clear Filters
        </button>
      </div>
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Product Search - Wider (e.g., 50%) */}
        <div className="w-full">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            parentFilter={parentTerm}
            categoryFilter={categoryTerm}
          />
        </div>


        {/* Parent Search - Medium Width (e.g., 25%) */}
        <div className="basis-[80%]">
          <SearchBarGeneric
            value={parentTerm}
            onChange={setParentTerm}
            fieldName="ITEMPARENT"
            categoryFilter={categoryTerm}
            placeholder="Search Parent..."
          />
        </div>

        {/* Category Search - Medium Width (e.g., 25%) */}
        <div className="basis-[80%]">
          <SearchBarGeneric
            value={categoryTerm}
            onChange={setCategoryTerm}
            fieldName="ITEMCATEGORY"
            parentFilter={parentTerm}
            placeholder="Search Category..."
          />
        </div>
      </div>



      <div className="w-full px-4">
        {visibleProducts.map((prod, idx) => (
          <div key={idx} className="w-full max-w-[1600px] mx-auto mb-10">
            <div className="w-full border-4 border-black bg-white">
              {/* Responsive Columns: Stack on mobile */}
              <div className="flex flex-col md:flex-row">

                {/* Column 1: Product Info */}
                <div className="w-full md:w-1/3 border border-black overflow-x-auto">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr>
                        <th className="bg-red-100 p-2 font-bold text-center border-b border-black text-xs text-black sm:text-sm md:text-base">
                          PRODUCT NAME
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-4 text-sm sm:text-base md:text-xl font-semibold border-b border-black break-words">
                          {prod.name}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b border-black text-xs sm:text-sm break-words">
                          <span className="font-semibold">Parent:</span> {prod.parent}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 text-xs sm:text-sm break-words">
                          <span className="font-semibold">Category:</span> {prod.category}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>


                {/* Column 2: Image */}
                {/* Column 2: Image */}
                <div className="bg-neutral-100 w-full md:w-1/3 border border-black flex justify-center items-center p-4">
                  <ProductImage name={prod.name} />
                </div>
                {/* Column 3: Godown Info (No <table>) */}
                <div className="w-full md:w-1/3 border border-black bg-white overflow-x-auto">
                  <div className="grid grid-cols-3 text-sm font-bold text-center bg-red-100 border-b border-black break-words">
                    <div className="p-2 pt-4 border-r border-black whitespace-normal break-words text-wrap">
                      GODOWN
                    </div>
                    <div className="p-2 border-r border-black flex flex-col items-center justify-center whitespace-normal break-words text-wrap">
                      <span>AS ON</span>
                      <span>
                        {`01 APRIL ${new Date().getMonth() >= 3
                            ? new Date().getFullYear()
                            : new Date().getFullYear() - 1
                          }`}
                      </span>
                    </div>
                    <div className="p-0 flex flex-col items-center justify-center whitespace-normal break-words text-wrap">
                      <span className="p-2">STOCK IN HAND</span>
                      <span className="w-full border-t border-black bg-blue-100 text-blue-900 text-sm font-bold px-2 py-1">
                        {new Date().toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>


                  {["1", "2", "3", "4", "5", "6", "7"].map((num) => (
                    <div
                      key={num}
                      className="grid grid-cols-3 text-center text-sm border-t border-black"
                    >
                      <div className="p-2 border-r border-black font-semibold text-gray-800">
                        GD{num}
                      </div>
                      <div
                        className={`p-2 border-r border-black text-right font-semibold ${Number(prod[`GD${num}ITEMOPBAL`]) > 0
                          ? "text-green-600"
                          : Number(prod[`GD${num}ITEMOPBAL`]) < 0
                            ? "text-red-600"
                            : "text-transparent"
                          }`}
                      >
                        {Number(prod[`GD${num}ITEMOPBAL`]) === 0
                          ? ""
                          : Number(prod[`GD${num}ITEMOPBAL`]).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                      </div>

                      <div
                        className={`p-2 text-right font-semibold ${Number(prod[`GD${num}ITEMCLBAL`]) > 0
                          ? "text-green-600"
                          : Number(prod[`GD${num}ITEMCLBAL`]) < 0
                            ? "text-red-600"
                            : "text-transparent"
                          }`}
                      >
                        {Number(prod[`GD${num}ITEMCLBAL`]) === 0
                          ? ""
                          : Number(prod[`GD${num}ITEMCLBAL`]).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProductList;
