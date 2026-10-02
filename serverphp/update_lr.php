<?php
require_once __DIR__ . '/api_auth.php';
header("Content-Type: application/json");

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: *");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}


$data = json_decode(file_get_contents("php://input"), true);

$id = $data['id'];
$payment_status = $data['paymentStatus'];

$sql = "UPDATE lorry_receipts
SET payment_status=?
WHERE id=?";

$stmt = $conn->prepare($sql);

$stmt->bind_param(
    "si",
    $payment_status,
    $id
);

if ($stmt->execute()) {

    echo json_encode([
        "status" => "success"
    ]);

} else {

    echo json_encode([
        "status" => "error"
    ]);
}

?>