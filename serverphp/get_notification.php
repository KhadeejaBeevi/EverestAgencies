<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");

$conn = new mysqli("localhost", "root", "", "tally_db");

$role = $_GET['role'] ?? '';

if($role == ''){
    echo json_encode([]);
    exit;
}

$result = mysqli_query($conn,
    "SELECT * FROM notifications
     WHERE target_role='$role'
     AND is_read=0
     ORDER BY created_at DESC"
);

$data = [];

while($row = mysqli_fetch_assoc($result)){
    $data[] = $row;
}

echo json_encode($data);
?>