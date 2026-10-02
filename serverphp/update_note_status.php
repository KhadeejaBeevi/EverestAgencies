<?php
require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database connection
$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed: " . $conn->connect_error
    ]);
    exit;
}

// Read JSON input
$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['partyLedger']) || trim($data['partyLedger']) === '') {
    echo json_encode([
        "success" => false,
        "error" => "Missing partyLedger"
    ]);
    exit;
}

$partyLedger = trim($data['partyLedger']);

// Update contact status
$stmt = $conn->prepare("
    UPDATE newpartyledgerdetails
    SET note_updated = 1
    WHERE party_ledger_name = ?
");

if (!$stmt) {
    echo json_encode([
        "success" => false,
        "error" => $conn->error
    ]);
    exit;
}

$stmt->bind_param("s", $partyLedger);

if ($stmt->execute()) {
    echo json_encode([
        "success" => true,
        "message" => "Company marked as contacted",
        "partyLedger" => $partyLedger,
        "affected_rows" => $stmt->affected_rows
    ]);
} else {
    echo json_encode([
        "success" => false,
        "error" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();
?>