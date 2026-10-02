<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// Connect to database
$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    echo json_encode(["success" => false, "error" => "Connection failed: " . $conn->connect_error]);
    exit;
}
 
// Check if table exists
$checkTable = $conn->query("SHOW TABLES LIKE 'edited_fields'");
if ($checkTable->num_rows === 0) {
    echo json_encode(["success" => false, "error" => "Table 'edited_fields' does not exist"]);
    exit;
}

// Run query
$result = $conn->query("SELECT party_name, field_name FROM edited_fields");

if (!$result) {
    echo json_encode(["success" => false, "error" => "Query failed: " . $conn->error]);
    exit;
}

// Build response
$highlights = [];
while ($row = $result->fetch_assoc()) {
    $party = $row['party_name'];
    $field = $row['field_name'];

    if (!isset($highlights[$party])) {
        $highlights[$party] = [];
    }
    if (!in_array($field, $highlights[$party])) {
        $highlights[$party][] = $field;
    }
}

echo json_encode($highlights);
$conn->close();
