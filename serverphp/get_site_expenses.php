<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

$site_visit_id = $_GET['site_visit_id'];

$result = $conn->query("
    SELECT *
    FROM site_visit_expenses
    WHERE site_visit_id = '$site_visit_id'
    ORDER BY id DESC
");

$data = [];

while($row = $result->fetch_assoc()) {

    $data[] = $row;
}

echo json_encode($data);

?>