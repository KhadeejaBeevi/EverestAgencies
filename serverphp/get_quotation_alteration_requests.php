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

/* Link to the enquiry that raised the request (added once if missing). */
$check = $conn->query("SHOW COLUMNS FROM quotation_alteration_requests LIKE 'enquiry_id'");
if ($check && $check->num_rows === 0) {
    $conn->query("ALTER TABLE quotation_alteration_requests ADD COLUMN enquiry_id INT NULL");
}

$sql = "
    SELECT
        r.id,
        r.quotation_no,
        r.party,
        r.order_no,
        r.invoice_no,
        r.requested_by,
        r.remarks,
        r.request_status,
        r.created_at,
        r.updated_at,
        r.enquiry_id,
        e.enquiry_no
    FROM quotation_alteration_requests r
    LEFT JOIN enquiry_report e ON e.id = r.enquiry_id
    WHERE r.request_status = 'Pending'
    ORDER BY r.created_at DESC
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