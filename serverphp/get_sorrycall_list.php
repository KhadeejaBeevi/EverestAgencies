<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["success" => false, "error" => $conn->connect_error]));
}

$sql = "SELECT PartyLedgerName, note, created_at FROM sorry_call ORDER BY created_at DESC";
$result = $conn->query($sql);

$data = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $data[] = $row;
    }
}

echo json_encode($data);
$conn->close();
?>
