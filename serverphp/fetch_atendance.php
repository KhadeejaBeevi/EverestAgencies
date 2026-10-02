<?php
require_once __DIR__ . '/api_auth.php';
$conn = new mysqli("localhost", "root", "", "kseb_db");

$result = $conn->query("
    SELECT * FROM attendance 
    ORDER BY check_time DESC
");

$data = [];

while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}

echo json_encode($data);
?>