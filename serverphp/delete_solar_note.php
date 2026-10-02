<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

$data = json_decode(
    file_get_contents("php://input"),
    true
);

$note_id = $data['note_id'];

$stmt = $conn->prepare(
    "DELETE FROM solar_lead_notes WHERE id=?"
);

$stmt->bind_param("i", $note_id);

if ($stmt->execute()) {
    echo json_encode([
        "success" => true
    ]);
} else {
    echo json_encode([
        "success" => false
    ]);
}