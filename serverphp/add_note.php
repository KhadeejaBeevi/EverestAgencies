<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Headers: Content-Type");

// DB connection
$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

// Get JSON input
$data = json_decode(file_get_contents("php://input"), true);

// Escape all inputs safely
$username       = $conn->real_escape_string($data['username']);
$note           = $conn->real_escape_string($data['note']);
$date           = $conn->real_escape_string($data['date']);
$partyLedger    = isset($data['partyLedger']) ? $conn->real_escape_string($data['partyLedger']) : '';
$followUpDate   = isset($data['followUpDate']) ? $conn->real_escape_string($data['followUpDate']) : null;
$followUpStatus = isset($data['followUpStatus']) ? $conn->real_escape_string($data['followUpStatus']) : null;
$enquired       = isset($data['enquired']) ? $conn->real_escape_string($data['enquired']) : 'No';

// SQL insert with enquired
$sql = "INSERT INTO notes (username, note, date, partyLedger, followUpDate, followUpStatus, enquired)
        VALUES (
            '$username',
            '$note',
            '$date',
            '$partyLedger',
            " . ($followUpDate ? "'$followUpDate'" : "NULL") . ",
            " . ($followUpStatus ? "'$followUpStatus'" : "NULL") . ",
            '$enquired'
        )";

if ($conn->query($sql)) {
    echo json_encode(["success" => true]);
} else {
    echo json_encode(["error" => $conn->error]);
}

$conn->close();
?>
