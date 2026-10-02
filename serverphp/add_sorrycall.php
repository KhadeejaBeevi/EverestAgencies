<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["success" => false, "error" => $conn->connect_error]));
}

$input = json_decode(file_get_contents("php://input"), true);

// Validate input
if (!isset($input['partyLedger'])) {
    echo json_encode(["success" => false, "error" => "Missing partyLedger"]);
    exit;
}

$partyLedger = $conn->real_escape_string($input['partyLedger']);
$note = isset($input['note']) && trim($input['note']) !== ""
    ? $conn->real_escape_string($input['note'])
    : null;

// Build SQL dynamically (skip note if empty)
if ($note) {
    $sql = "INSERT INTO sorry_call (PartyLedgerName, note, created_at) 
            VALUES ('$partyLedger', '$note', NOW())";
} else {
    $sql = "INSERT INTO sorry_call (PartyLedgerName, created_at) 
            VALUES ('$partyLedger', NOW())";
}

if ($conn->query($sql)) {
    echo json_encode(["success" => true]);
} else {
    echo json_encode(["success" => false, "error" => $conn->error]);
}

$conn->close();
?>
