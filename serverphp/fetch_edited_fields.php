<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// For debugging (set to 1 to debug)
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Handle preflight (CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}


$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    echo json_encode(["success" => false, "error" => "Database connection failed"]);
    exit;
}

$result = $conn->query("SELECT party_name, field_name FROM edited_field");
  
$highlights = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $party = $row["party_name"];
        $field = $row["field_name"];

        if (!isset($highlights[$party])) {
            $highlights[$party] = [];
        }

        $highlights[$party][] = $field;
    }

    echo json_encode($highlights);
} else {
    echo json_encode(["success" => false, "error" => "Query failed"]);
}

$conn->close();
?>
