<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die(json_encode([
        "status" => "error",
        "message" => "Database connection failed"
    ]));
}


$data = json_decode(file_get_contents("php://input"), true);

$contractor_id = $data['contractor_id'];
$user_name = $data['user_name'];
$remark = $data['remark'];
$followup_date = $data['followup_date'];

$sql = "INSERT INTO remarks 
(contractor_id, user_name, remark, followup_date) 
VALUES 
('$contractor_id', '$user_name', '$remark', '$followup_date')";

if ($conn->query($sql)) {
    echo json_encode(["status" => "success"]);
} else {
    echo json_encode(["status" => "error"]);
}
?>