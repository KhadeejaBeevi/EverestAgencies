import { useState } from "react";
import { apiFetch } from "../../api/apiClient";


export default function UploadPartyFile({ onProcessed }) {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [showDoNotCall, setShowDoNotCall] = useState(false);

  const handleUpload = () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("partyFile", file);

    apiFetch("/serverphp/process_partyfile.php", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        setMessage(
          `${data.matched_count || 0} parties moved to Do Not Call list`
        );
        if (onProcessed) onProcessed(data); // notify parent if needed
      })
      .catch((err) => setMessage("Error: " + err));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* File Upload */}
      <div className="flex gap-2 items-center">
        <input
          type="file"
          accept=".txt,.xlsx"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <button
          onClick={handleUpload}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Upload & Process
        </button>
      </div>

      {/* Show status message */}
      {message && <p className="text-sm text-gray-700">{message}</p>}

      {/* View Do Not Call button */}
      <button
        onClick={() => setShowDoNotCall(true)}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 w-fit"
      >
        View Do Not Call List
      </button>

      {/* Popup */}
      <DoNotCallPopup show={showDoNotCall} setShow={setShowDoNotCall} />
    </div>
  );
}
