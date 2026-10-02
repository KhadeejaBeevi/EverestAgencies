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

$search = $_GET['search'] ?? '';

$sql = "SELECT kseb_code,address
        FROM kseb_directory
        WHERE kseb_code LIKE ?
        LIMIT 10";

$stmt = $conn->prepare($sql);

$term = "%".$search."%";

$stmt->bind_param("s",$term);
$stmt->execute();

$result = $stmt->get_result();

$data = [];

while($row = $result->fetch_assoc()){
    $data[] = $row;
}

echo json_encode($data);
?>