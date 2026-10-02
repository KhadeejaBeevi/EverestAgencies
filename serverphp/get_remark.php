<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die(json_encode([
        "status" => "error",
        "message" => "Database connection failed"
    ]));
}

if (!isset($_GET['id'])) {
    echo json_encode([
        "status" => "error",
        "message" => "ID missing"
    ]);
    exit;
}

$id = $_GET['id'];

$result = $conn->query("
    SELECT id, user_name, remark, followup_date, created_at 
    FROM remarks 
    WHERE contractor_id='$id'
    ORDER BY created_at DESC
");

$data = [];

while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}

echo json_encode([
    "status" => "success",
    "data" => $data
]);
?>