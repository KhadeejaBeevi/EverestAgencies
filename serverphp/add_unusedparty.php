<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

$mysqli = new mysqli("localhost", "root", "", "salescollection");

if ($mysqli->connect_error) {
    echo json_encode(["success" => false, "error" => $mysqli->connect_error]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['partyLedger'])) {
    echo json_encode(["success" => false, "error" => "Missing partyLedger"]);
    exit;
}

$party = $mysqli->real_escape_string($data['partyLedger']);
$note = isset($data['note']) ? $mysqli->real_escape_string($data['note']) : "";

// ✅ Insert into unused_party_list
$query = "INSERT IGNORE INTO unused_party_list (PartyLedgerName, note) VALUES ('$party', '$note')";

if ($mysqli->query($query)) {
    echo json_encode(["success" => true]);
} else {
    echo json_encode(["success" => false, "error" => $mysqli->error]);
}

$mysqli->close();
?>
