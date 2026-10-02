<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

error_reporting(E_ALL);
ini_set('display_errors', 1);

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die(json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]));
}

$data = json_decode(file_get_contents("php://input"), true);



if (!$data) {
    echo json_encode([
        "status" => "error",
        "message" => "No data received"
    ]);
    exit;
}

$id = intval($data['id']);

$sql = "UPDATE kseb_contractors SET
            firm_name=?,
            contractor_name=?,
            decision_maker=?,
            address=?,
            phone=?,
            email=?,
            sales_executive=?,
            sales_coordinator=?,
            status=?
        WHERE id=?";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    echo json_encode([
        "status" => "error",
        "message" => $conn->error
    ]);
    exit;
}

$stmt->bind_param(
    "sssssssssi",
    $data['firm_name'],
    $data['contractor_name'],
    $data['decision_maker'],
    $data['address'],
    $data['phone'],
    $data['email'],
    $data['sales_executive'],
    $data['sales_coordinator'],
    $data['status'],
    $id
);


if ($stmt->execute()) {
    echo json_encode([
        "status" => "success",
        "affected_rows" => $stmt->affected_rows
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