<?php
require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    echo json_encode([]);
    exit;
}

$sql = "SELECT * 
        FROM newpartyledgerdetails 
        WHERE is_hidden = 0 
        ORDER BY id DESC";

$result = $conn->query($sql);

if (!$result) {
    echo json_encode([]);
    $conn->close();
    exit;
}

$data = [];

while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}

echo json_encode($data);

$conn->close();
?>