import React, { useEffect, useState } from "react";
import { db } from "./firebase"; // Update path to your Firebase setup
import { doc, getDoc, setDoc } from "firebase/firestore";
import { apiFetch } from "../api/apiClient";

export default function AdminToggleGroups() {
  const [allGroups, setAllGroups] = useState([]);
  const [disabledGroups, setDisabledGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const saveDisabledGroups = async (groups) => {
  await setDoc(doc(db, "ui_settings", "popup_control"), {
    disabledGroups: groups
  });
};

  
  useEffect(() => {
    apiFetch("/serverphp/get_groupsforedit.php")
      .then((res) => res.json())
      .then((data) => {
        console.log("Group response:", data);  
        setAllGroups(data.groups);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching groups:", err);
        setLoading(false);
      });
  }, []);

  
  useEffect(() => {
    const loadDisabledGroups = async () => {
      try {
        const snap = await getDoc(doc(db, "ui_settings", "popup_control"));
        if (snap.exists()) {
          setDisabledGroups(snap.data().disabledGroups || []);
        }
      } catch (err) {
        console.error("Error loading disabled groups:", err);
      }
    };
    loadDisabledGroups();
  }, []);

 
  const toggleGroup = (group) => {
    setDisabledGroups((prev) =>
      prev.includes(group)
        ? prev.filter((g) => g !== group)
        : [...prev, group]
    );
  };

  
  const saveToFirestore = async () => {
    try {
      await setDoc(doc(db, "ui_settings", "popup_control"), {
        disabledGroups,
      });
      alert("Saved successfully!");
    } catch (err) {
      console.error("Failed to save:", err);
      alert("Error saving to Firestore.");
    }
  };

  if (loading) return <div>Loading groups...</div>;

  return (
    <div className="max-w-md mx-auto mt-8 p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Disable Party Popups by Group</h2>

      <ul className="space-y-2">
        {allGroups.map((group, index) => (
          <li key={index} className="flex items-center justify-between">
            <span>{group}</span>
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={disabledGroups.includes(group)}
                  onChange={() => toggleGroup(group)}
                />
                <div className="w-10 h-4 bg-gray-300 rounded-full shadow-inner"></div>
                <div
                  className={`dot absolute w-6 h-6 bg-white rounded-full shadow -left-1 -top-1 transition ${
                    disabledGroups.includes(group) ? "translate-x-full" : ""
                  }`}
                ></div>
              </div>
            </label>
          </li>
        ))}
      </ul>

      <button
        onClick={saveToFirestore}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Save Settings
      </button>
    </div>
  );
}
