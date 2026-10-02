<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;

if ($id > 0) {
    $conn->query("DELETE FROM notes WHERE id = $id");
    echo json_encode(["success" => true]);
} else {
    echo json_encode(["error" => "Invalid ID"]);
}

$conn->close();
