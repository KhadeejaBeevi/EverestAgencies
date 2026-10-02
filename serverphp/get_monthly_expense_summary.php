<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$currentMonth = date('m');
$currentYear = date('Y');

$sql = "
SELECT 
    sales_executive,
    SUM(amount) AS total_expense
FROM site_visit_expenses
WHERE 
    MONTH(created_at) = $currentMonth
    AND YEAR(created_at) = $currentYear
GROUP BY sales_executive
ORDER BY total_expense DESC
";

$result = $conn->query($sql);

if (!$result) {

    echo json_encode([
        "status" => "error",
        "message" => $conn->error
    ]);

    exit;
}

$data = [];

while ($row = $result->fetch_assoc()) {

    $data[] = $row;

}

echo json_encode($data);

$conn->close();

?>