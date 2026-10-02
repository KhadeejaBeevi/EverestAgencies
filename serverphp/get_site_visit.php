<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die(json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]));
}

$sales_executive = isset($_GET['sales_executive'])
    ? trim($_GET['sales_executive'])
    : '';

if ($sales_executive != "") {

    $stmt = $conn->prepare("
        SELECT
            sv.*,
            COALESCE(SUM(se.amount), 0) AS total_expense
        FROM site_visits sv
        LEFT JOIN site_visit_expenses se
            ON sv.id = se.site_visit_id
        WHERE sv.sales_executive = ?
        GROUP BY sv.id
        ORDER BY sv.id DESC
    ");

    $stmt->bind_param("s", $sales_executive);

} else {

    // Admin can see all visits
    $stmt = $conn->prepare("
        SELECT
            sv.*,
            COALESCE(SUM(se.amount), 0) AS total_expense
        FROM site_visits sv
        LEFT JOIN site_visit_expenses se
            ON sv.id = se.site_visit_id
        GROUP BY sv.id
        ORDER BY sv.id DESC
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

?>