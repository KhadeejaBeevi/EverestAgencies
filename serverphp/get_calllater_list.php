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
// Query with correct column names
$result = $conn->query("SELECT id, PartyLedgerName, created_at, note FROM call_later ORDER BY created_at DESC");

$list = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $list[] = $row;
    }
    echo json_encode($list);
} else {
    echo json_encode(["success" => false, "error" => $conn->error]);
}
?>
