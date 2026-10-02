<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["error" => "Database connection failed"]);
    exit;
}

// Get parties with notes
$sqlNotes = "SELECT DISTINCT partyLedger FROM notes";
$resultNotes = $conn->query($sqlNotes);

$highlighted = [];

if ($resultNotes) {
    while ($row = $resultNotes->fetch_assoc()) {
        $highlighted[] = $row['partyLedger'];
    }
}

// Get parties with edits
$sqlEdits = "SELECT DISTINCT party_name FROM edited_field";
$resultEdits = $conn->query($sqlEdits);

if ($resultEdits) {
    while ($row = $resultEdits->fetch_assoc()) {
        $highlighted[] = $row['party_name'];
    }
}

// Remove duplicates
$highlighted = array_values(array_unique($highlighted));

echo json_encode($highlighted);

$conn->close();
?>
