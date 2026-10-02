import React, { useState } from "react";
import Banner from "../../components/Banner/Banner.jsx";
import axios from "axios";

export default function ExcelSplit() {
  const [files, setFiles] = useState([]);

  const handleProcess = async () => {
    const res = await axios.get("/serverphp/split_excel.php");
    setFiles(res.data);
  };

  return (
    <>
          <Banner />
      <div>
      <button onClick={handleProcess}>Generate Excel Files</button>

      <h3>Download</h3>
      {files.map((f, i) => (
        <div key={i}>
          <a href={`/serverphp/${f}`} download>
            {f}
          </a>
        </div>
      ))}
    </div>
    </>
  );
}