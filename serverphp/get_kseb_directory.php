<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 1);

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {

    echo json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]);

    exit;
}

$salesExecutiveName =
    $_GET['salesExecutiveName'] ?? '';

$sql = "
SELECT *
FROM kseb_directory
WHERE LOWER(TRIM(SALES_EXECUTIVE))
=
LOWER(TRIM(?))
";

$stmt = $conn->prepare($sql);

if (!$stmt) {

    echo json_encode([
        "status" => "error",
        "message" => $conn->error
    ]);

    exit;
}

$stmt->bind_param(
    "s",
    $salesExecutiveName
);

$stmt->execute();

$result = $stmt->get_result();

$data = [];

while ($row = $result->fetch_assoc()) {

    $data[] = $row;
}

echo json_encode($data);

$conn->close();

?>