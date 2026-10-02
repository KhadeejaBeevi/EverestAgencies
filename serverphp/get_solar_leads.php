<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {

    die(
        json_encode([
            "status" => "error",
            "message" => "DB Connection Failed"
        ])
    );

}

$sql = "
SELECT *
FROM solar_new_leads
ORDER BY id DESC
";

$result = $conn->query($sql);

$data = [];

while ($row = $result->fetch_assoc()) {

    $data[] = $row;

}

echo json_encode($data);