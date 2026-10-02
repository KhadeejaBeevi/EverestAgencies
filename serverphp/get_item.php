<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {
    die(json_encode([
        "status" => "error",
        "message" => "DB Connection Failed"
    ]));
}

$search = $_GET['search'] ?? '';

$sql = "
SELECT *
FROM products_table
WHERE name LIKE '%$search%'
LIMIT 10
";

$result = $conn->query($sql);

$data = [];

while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}

echo json_encode($data);