<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "status" => "error",
        "message" => "DB connection failed"
    ]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

if (empty($data['contractor_name'])) {
    echo json_encode([
        "status" => "error",
        "message" => "Contractor Name required"
    ]);
    exit();
}

$firm_name = $data['firm_name'] ?? "";
$contractor_name = $data['contractor_name'];
$decision_maker = $data['decision_maker'] ?? "";
$address = $data['address'] ?? "";
$phone = $data['phone'] ?? "";
$email = $data['email'] ?? "";
$sales_executive = $data['sales_executive'] ?? "";
$sales_coordinator = $data['sales_coordinator'] ?? "";
$status = $data['status'] ?? "NEW"; // ✅ added

$sql = "INSERT INTO kseb_contractors 
(firm_name, contractor_name, decision_maker, address, phone, email, sales_executive, sales_coordinator, status) 
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

$stmt = $conn->prepare($sql);

$stmt->bind_param(
    "sssssssss",
    $firm_name,
    $contractor_name,
    $decision_maker,
    $address,
    $phone,
    $email,
    $sales_executive,
    $sales_coordinator,
    $status
);

if ($stmt->execute()) {
    echo json_encode([
        "status" => "success"
    ]);
} else {
    echo json_encode([
        "status" => "error",
        "message" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();
?>