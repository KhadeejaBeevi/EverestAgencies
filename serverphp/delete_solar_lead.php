<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// HANDLE PREFLIGHT REQUEST
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// DATABASE CONNECTION
$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

// CHECK CONNECTION
if ($conn->connect_error) {

    die(json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]));

}

// GET JSON DATA
$data = json_decode(
    file_get_contents("php://input"),
    true
);

// CHECK ID
if (!isset($data['id'])) {

    echo json_encode([
        "success" => false,
        "message" => "Lead ID missing"
    ]);

    exit();

}

$id = $data['id'];

// DELETE QUERY
$stmt = $conn->prepare(
    "DELETE FROM solar_new_leads WHERE id = ?"
);

$stmt->bind_param("i", $id);

if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Lead deleted successfully"
    ]);

} else {

    echo json_encode([
        "success" => false,
        "message" => "Delete failed"
    ]);

}

$stmt->close();

$conn->close();

?>