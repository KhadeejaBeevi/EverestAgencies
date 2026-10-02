<?php
require_once __DIR__ . '/api_auth.php';
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

include "db.php"; // your DB connection file

$response = [];

if (!isset($_GET['id'])) {
    echo json_encode([
        "status" => "error",
        "message" => "ID is required"
    ]);
    exit;
}

$id = $_GET['id'];

try {
    $stmt = $conn->prepare("SELECT * FROM kseb_table WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();

    $result = $stmt->get_result();
    $data = $result->fetch_assoc();

    if ($data) {
        $response = [
            "status" => "success",
            "data" => $data
        ];
    } else {
        $response = [
            "status" => "error",
            "message" => "No record found"
        ];
    }

    echo json_encode($response);

} catch (Exception $e) {
    echo json_encode([
        "status" => "error",
        "message" => $e->getMessage()
    ]);
}
?>
