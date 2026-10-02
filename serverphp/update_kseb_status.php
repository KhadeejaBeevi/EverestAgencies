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
        "message" => "DB failed"
    ]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

$id = $data['id'] ?? null;

if (!$id) {
    echo json_encode([
        "status" => "error",
        "message" => "Missing ID"
    ]);
    exit();
}

/* ================= STATUS UPDATE ================= */

if (isset($data['status'])) {

    $status = $data['status'];

    $stmt = $conn->prepare(
        "UPDATE kseb_contractors
         SET status = ?
         WHERE id = ?"
    );

    $stmt->bind_param("si", $status, $id);

}

/* ================= LEAD STAGE UPDATE ================= */

else if (isset($data['lead_stage'])) {

    $lead_stage = $data['lead_stage'];

    $stmt = $conn->prepare(
        "UPDATE kseb_contractors
         SET lead_stage = ?
         WHERE id = ?"
    );

    $stmt->bind_param("si", $lead_stage, $id);

}

/* ================= NO DATA ================= */

else {

    echo json_encode([
        "status" => "error",
        "message" => "No update field"
    ]);

    exit();
}

/* ================= EXECUTE ================= */

if ($stmt->execute()) {

    echo json_encode([
        "status" => "success"
    ]);

} else {

    echo json_encode([
        "status" => "error"
    ]);
}

$stmt->close();
$conn->close();
?>