<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

// Connect to database
$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

// Read POST body to get the selected percentage range
$data = json_decode(file_get_contents("php://input"), true);
$range = $data["range"] ?? "";

// Build WHERE condition based on the clicked percentage range
$where = "1=1"; 
if ($range === "Below 0.0" || $range === "Lost Clients") {
    $where = "CAST(percentage AS DECIMAL(10,6)) <= 0.0";
} elseif ($range === "0.00 - 0.10") {
    $where = "CAST(percentage AS DECIMAL(10,6)) > 0.0 AND CAST(percentage AS DECIMAL(10,6)) < 0.1";
} elseif ($range === "0.10 - 1.00") {
    $where = "CAST(percentage AS DECIMAL(10,6)) >= 0.1 AND CAST(percentage AS DECIMAL(10,6)) <= 1.0";
} elseif ($range === "Above 1.0") {
    $where = "CAST(percentage AS DECIMAL(10,6)) > 1.0";
} elseif ($range === "Other") {
    $where = "percentage IS NULL OR percentage = ''";
}

// Query to get parties within the selected percentage range
$sql = "SELECT PartyLedgerName, _LedGroup, percentage 
        FROM sales_summary_table4 
        WHERE $where";

$result = $conn->query($sql);

// Initialize groups array - exactly like the main pie chart
$groups = [];

if ($result && $result->num_rows > 0) {

    while ($row = $result->fetch_assoc()) {

        $group = $row["_LedGroup"] ?: "Unknown Group";
        $party = $row["PartyLedgerName"];

        if (!isset($groups[$group])) {
            $groups[$group] = [];
        }

        // Avoid duplicate party names
        if (!in_array($party, $groups[$group])) {
            $groups[$group][] = $party;
        }
    }
}

// Format for Nivo Pie - EXACTLY like the main pie chart
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
?>