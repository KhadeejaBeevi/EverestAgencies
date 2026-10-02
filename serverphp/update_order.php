<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "", "tally_db");

$data = json_decode(file_get_contents("php://input"), true);

$id = $data['id'];
$status = $data['status'];

$stmt = $conn->prepare("UPDATE sales_orders SET status=? WHERE id=?");
$stmt->bind_param("si", $status, $id);
$stmt->execute();

echo json_encode(["status" => "updated"]);
?>