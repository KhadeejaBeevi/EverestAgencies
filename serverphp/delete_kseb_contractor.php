<?php
require_once __DIR__ . '/api_auth.php';
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// ✅ Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ✅ DB CONNECTION
$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed"
    ]);
    exit;
}

// ✅ GET INPUT
$data = json_decode(file_get_contents("php://input"), true);

// ⚠️ Validate ID
if (empty($data['id'])) {
    echo json_encode([
        "status" => "error",
        "message" => "Valid ID is required"
    ]);
    exit;
}

$id = (int)$data['id'];

// ✅ PREPARE DELETE
$stmt = $conn->prepare("DELETE FROM kseb_contractors WHERE id = ?");
$stmt->bind_param("i", $id);

// ✅ EXECUTE
if ($stmt->execute()) {

    // ⚠️ Check if row actually deleted
    if ($stmt->affected_rows > 0) {
        echo json_encode([
            "status" => "success",
            "message" => "Deleted successfully"
        ]);
    } else {
        echo json_encode([
            "status" => "error",
            "message" => "No record found with this ID"
        ]);
    }

} else {
    echo json_encode([
        "status" => "error",
        "message" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();
?>