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
    die(json_encode(["success" => false, "message" => $conn->connect_error]));
}

$data = json_decode(file_get_contents("php://input"), true);
$partyName = $data["party_ledger_name"] ?? '';

if (!$partyName) {
    echo json_encode(["success" => false, "message" => "Missing party_ledger_name"]);
    exit;
}

$stmt = $conn->prepare("UPDATE newpartyledgerdetails SET is_hidden = 0 WHERE party_ledger_name = ?");
$stmt->bind_param("s", $partyName);
$success = $stmt->execute();

if ($success) {
    echo json_encode(["success" => true, "message" => "Party hidden successfully"]);
} else {
    echo json_encode(["success" => false, "message" => $stmt->error]);
}$stmt->close();
$conn->close();
?>
