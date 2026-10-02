<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ✅ DB CONNECTION
$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed"
    ]);
    exit();
}

// ✅ QUERY
$sql = "
SELECT 
    kc.*,

    (
        SELECT r.remark
        FROM remarks r
        WHERE r.contractor_id = kc.id
        ORDER BY r.created_at DESC
        LIMIT 1
    ) AS latest_remark

FROM kseb_contractors kc
ORDER BY kc.id DESC
";

$result = $conn->query($sql);

if (!$result) {
    echo json_encode([
        "status" => "error",
        "message" => $conn->error
    ]);
    exit();
}

// ✅ FETCH
$data = [];

while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}

// ✅ RESPONSE
echo json_encode([
    "status" => "success",
    "data" => $data
]);

$conn->close();
?>