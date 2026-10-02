<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli("localhost","root","","salescollection");

$data = json_decode(file_get_contents("php://input"), true);

$quotationNo = trim($data["quotationNo"] ?? "");

if ($quotationNo == "") {
    echo json_encode([
        "success" => false,
        "message" => "Quotation number is empty"
    ]);
    exit;
}

$stmt = $conn->prepare("
    SELECT
        call_date,
        followup_date,
        telecaller,
        status,
        remarks,
        created_at
    FROM quotation_followups
    WHERE quotation_no = ?
    ORDER BY id DESC
");

$stmt->bind_param("s", $quotationNo);
$stmt->execute();

$result = $stmt->get_result();

$rows = [];

while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode([
    "quotationNo" => $quotationNo,
    "count" => count($rows),
    "data" => $rows
]);

$stmt->close();
$conn->close();