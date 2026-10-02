<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
  die(json_encode(["error" => "Database connection failed"]));
}

$sql = "SELECT PartyLedgerName, percentage, _LedGroup FROM sales_summary_table4";
$result = $conn->query($sql);

$groups = [];

if ($result && $result->num_rows > 0) {
  while ($row = $result->fetch_assoc()) {
    $party = $row['PartyLedgerName'];
    $percentage = floatval($row['percentage']);
    $groupName = $row['_LedGroup'] ?: "Unknown";

    // Initialize group entry
    if (!isset($groups[$groupName])) {
      $groups[$groupName] = [
        "Below 0.0" => [],
        "0.00 - 0.10" => [],
        "0.10 - 1.00" => [],
        "Above 1.0" => []
      ];
    }

    // Assign to correct category
    if ($percentage <= 0.0) {
      $groups[$groupName]["Below 0.0"][] = $party;
    } elseif ($percentage > 0.0 && $percentage < 0.1) {
      $groups[$groupName]["0.00 - 0.10"][] = $party;
    } elseif ($percentage >= 0.1 && $percentage <= 1.0) {
      $groups[$groupName]["0.10 - 1.00"][] = $party;
    } elseif ($percentage > 1.0) {
      $groups[$groupName]["Above 1.0"][] = $party;
    }
  }
}

echo json_encode($groups);
$conn->close();
