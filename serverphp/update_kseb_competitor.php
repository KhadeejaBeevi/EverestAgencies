<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "status" => "error"
    ]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

$id = $data['id'] ?? '';
$competitors = $data['competitors'] ?? '';

$stmt = $conn->prepare("
    UPDATE kseb_contractors
    SET competitors=?
    WHERE id=?
");

$stmt->bind_param("si", $competitors, $id);

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