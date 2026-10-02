<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 1); // ✅ Enable during development (set to 0 in production)

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    echo json_encode(["success" => false, "message" => "Database connection failed: " . $conn->connect_error]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$PartyLedgerName = $data['party_ledger_name'] ?? '';
$rating = intval($data['rating'] ?? 0);

if (!$PartyLedgerName) {
    echo json_encode(["success" => false, "message" => "Missing party name"]);
    exit;
}

$query = "UPDATE sales_summary_table4 SET rating = ? WHERE PartyLedgerName = ?";
$stmt = $conn->prepare($query);
$stmt->bind_param("is", $rating, $PartyLedgerName);

if ($stmt->execute()) {
    echo json_encode(["success" => true, "message" => "Rating saved successfully"]);
} else {
    echo json_encode(["success" => false, "message" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
