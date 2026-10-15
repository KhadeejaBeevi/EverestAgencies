<?php
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = db_connect("tally_db");

$res = $conn->query("SELECT * FROM sales_orders ORDER BY id DESC");

$data = [];

while ($row = $res->fetch_assoc()) {
    $data[] = $row;
}

echo json_encode($data);
?>