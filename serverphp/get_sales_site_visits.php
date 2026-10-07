<?php
require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/sales_site_visit_db.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = sales_site_visit_conn();

// Empty = all visits (admin). Otherwise only that executive's visits.
$sales_executive = trim($_GET['sales_executive'] ?? '');

if ($sales_executive !== '') {

    $stmt = $conn->prepare("
        SELECT *
        FROM sales_site_visits
        WHERE LOWER(TRIM(sales_executive)) = LOWER(?)
        ORDER BY id DESC
    ");

    $stmt->bind_param("s", $sales_executive);

} else {

    $stmt = $conn->prepare("
        SELECT *
        FROM sales_site_visits
        ORDER BY id DESC
    ");
}

$stmt->execute();

$result = $stmt->get_result();

$data = [];

while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}

echo json_encode($data);

$stmt->close();
$conn->close();
