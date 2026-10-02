<?php
require_once __DIR__ . '/api_auth.php';
header("Content-Type: application/json");

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: *");
$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {

    die(json_encode([
        "success" => false,
        "error" => $conn->connect_error
    ]));
}


$sql = "SELECT * FROM lorry_receipts ORDER BY id DESC";

$result = $conn->query($sql);

$data = [];

while ($row = $result->fetch_assoc()) {

    $data[] = $row;
}

echo json_encode($data);

?>