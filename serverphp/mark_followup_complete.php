<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {
    die(json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]));
}

$data = json_decode(file_get_contents("php://input"), true);

$id = $data['id'] ?? '';
$type = $data['type'] ?? '';

if (!$id || !$type) {
    echo json_encode([
        "status" => "error",
        "message" => "Missing data"
    ]);
    exit;
}

$table = "";

if ($type === "Call History") {
    $table = "kseb_calls";
}

if ($type === "Site Visit") {
    $table = "site_visits";
}

if (!$table) {
    echo json_encode([
        "status" => "error",
        "message" => "Invalid type"
    ]);
    exit;
}

$sql = "UPDATE $table 
        SET followup_status='Completed' 
        WHERE id='$id'";

if ($conn->query($sql)) {

    echo json_encode([
        "status" => "success"
    ]);

} else {

    echo json_encode([
        "status" => "error",
        "message" => $conn->error
    ]);

}

$conn->close();

?>