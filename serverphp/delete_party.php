<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, DELETE");

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    echo json_encode(["success" => false, "message" => "DB connection failed"]);
    exit;
}

if (isset($_GET['id'])) {
    $id = intval($_GET['id']);
    $stmt = $conn->prepare("DELETE FROM newpartyledgerdetails WHERE id = ?");
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        echo json_encode(["success" => true, "message" => "Deleted successfully"]);
    } else {
        echo json_encode(["success" => false, "message" => "Delete failed: ".$stmt->error]);
    }

    $stmt->close();
}

$conn->close();
?>
