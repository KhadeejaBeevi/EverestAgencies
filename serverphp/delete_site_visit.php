<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: DELETE, GET");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

$id = $_GET['id'];

if (!$id) {
    echo json_encode(["status" => "error", "message" => "No ID"]);
    exit;
}

$stmt = $conn->prepare("DELETE FROM site_visits WHERE id = ?");
$stmt->bind_param("i", $id);

if ($stmt->execute()) {
    echo json_encode(["status" => "success"]);
} else {
    echo json_encode(["status" => "error"]);
}
