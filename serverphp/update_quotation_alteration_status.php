<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);

$id = isset($input['id']) ? intval($input['id']) : 0;
$status = isset($input['status'])
    ? trim($input['status'])
    : "";

if ($id <= 0) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid negotiation request ID"
    ]);
    exit;
}

if ($status !== "Pending" && $status !== "Revised") {
    echo json_encode([
        "success" => false,
        "message" => "Invalid status"
    ]);
    exit;
}

$stmt = $conn->prepare("
    UPDATE quotation_alteration_requests
    SET
        request_status = ?,
        updated_at = NOW()
    WHERE id = ?
");

$stmt->bind_param("si", $status, $id);

if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Negotiation request updated successfully",
        "id" => $id,
        "request_status" => $status
    ]);

} else {

    echo json_encode([
        "success" => false,
        "message" => "Failed to update negotiation request",
        "error" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();
?>