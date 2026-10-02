<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "salescollection"); // Replace with your DB name
if ($conn->connect_error) {
  die(json_encode(["error" => "Connection failed"]));
}

$sql = "SELECT PartyLedgerName, percentage FROM sales_summary_table4";
$result = $conn->query($sql);

// Groups with list of parties
$groups = [
  "Below 0.0" => [],
  "0.00 - 0.10" => [],
  "0.10 - 1.00" => [],
  "Above 1.0" => [],
  "Other" => []
];

if ($result && $result->num_rows > 0) {
  while ($row = $result->fetch_assoc()) {
    $p = floatval($row['percentage']);
    $party = $row['PartyLedgerName'];

    if ($p <= 0.0) {
      $groups["Below 0.0"][] = $party;
    } elseif ($p >= 0.1 && $p <= 1.0) {
      $groups["0.10 - 1.00"][] = $party;
    } elseif ($p > 1.0) {
      $groups["Above 1.0"][] = $party;
    } else {
      $groups["0.00 - 0.10"][] = $party;
    }
  }
}


// Format for Nivo Pie
$response = [];
foreach ($groups as $label => $parties) {
  if (count($parties) > 0) {
    $response[] = [
      "id" => $label,
      "label" => $label,
      "value" => count($parties),
      "parties" => $parties
    ];
  }
}

echo json_encode($response);
$conn->close();
