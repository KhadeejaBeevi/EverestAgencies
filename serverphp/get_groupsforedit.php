<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    echo json_encode(["error" => "DB connection failed"]);
    exit;
}

// ✅ Correct way: wrap the column name in **backticks**, and use single quotes for the query string so PHP doesn't treat $_LedGroup as a variable
$sql = 'SELECT DISTINCT `Ledger.$_LedGroup` AS group_name FROM salesdatalatest33 ORDER BY `Ledger.$_LedGroup`';

$result = $conn->query($sql);

$groups = [];
while ($row = $result->fetch_assoc()) {
    $groups[] = $row["group_name"];
}

echo json_encode(["groups" => $groups]);
$conn->close();
