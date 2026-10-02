<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);

// Handle preflight (CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ✅ Connect to DB
$mysqli = new mysqli("localhost", "root", "", "salescollection");
if ($mysqli->connect_error) {
    echo json_encode(["success" => false, "error" => $mysqli->connect_error]);
    exit;
}

// ✅ Get JSON input
$data = json_decode(file_get_contents("php://input"), true);
if (!isset($data['party_ledger_name'])) {
    echo json_encode(["success" => false, "error" => "Missing party_ledger_name"]);
    exit;
}

$partyLedger = $data['party_ledger_name'];

// ✅ Prepare and execute query
$sql = "UPDATE newpartyledgerdetails SET is_hidden = 1 WHERE party_ledger_name = ?";
$stmt = $mysqli->prepare($sql);
$stmt->bind_param("s", $partyLedger);

if ($stmt->execute()) {
    echo json_encode(["success" => true]);
} else {
    echo json_encode(["success" => false, "error" => $stmt->error]);
}

$stmt->close();
$mysqli->close();
?>

