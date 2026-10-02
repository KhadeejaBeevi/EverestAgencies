<?php
require_once __DIR__ . '/api_auth.php';
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

$uid = $_GET['uid'] ?? '';

if (!$uid) {

    echo json_encode([]);
    exit;
}

$result = mysqli_query(
    $conn,
    "SELECT designation
     FROM users
     WHERE uid='$uid'
     LIMIT 1"
);

$row = mysqli_fetch_assoc($result);

echo json_encode($row);