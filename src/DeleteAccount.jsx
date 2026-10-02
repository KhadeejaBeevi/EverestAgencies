import React from "react";

export default function DeleteAccount() {
  return (
    <div style={{maxWidth:"900px",margin:"40px auto",padding:"20px"}}>
      <h1>Delete Your Account</h1>

      <p>
        If you wish to delete your Everest Agencies account and associated
        personal data, please send a request to:
      </p>

      <h3>info@everestagencies.in</h3>

      <p>
        Include your registered email address in the request.
      </p>

      <p>
        We will verify your identity and process your request within
        7 business days.
      </p>

      <h2>Data that will be deleted</h2>

      <ul>
        <li>User account</li>
        <li>Profile information</li>
        <li>Attendance records (where applicable)</li>
        <li>Site visit information associated with your account</li>
      </ul>

      <h2>Data that may be retained</h2>

      <p>
        Some records may be retained where required by law or for legitimate
        business record-keeping purposes.
      </p>
    </div>
  );
}