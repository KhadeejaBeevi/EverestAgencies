<?php

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]);
    exit;
}

$sql = "
    SELECT
        id,
        quotation_no,
        party,
        order_no,
        invoice_no,
        requested_by,
        remarks,
        request_status,
        created_at,
        updated_at
    FROM quotation_alteration_requests
    WHERE request_status = 'Pending'
    ORDER BY created_at DESC
";

$result = $conn->query($sql);

$data = [];

while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}

echo json_encode([
    "success" => true,
    "count" => count($data),
    "data" => $data
]);

$conn->close();

?>