<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: *");
$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "status" => "error",
        "message" => "DB connection failed"
    ]);
    exit();
}

$id = $_GET['id'];

$getImage = $conn->query(
    "SELECT lr_image FROM lorry_receipts WHERE id=$id"
);

$imageRow = $getImage->fetch_assoc();

if ($imageRow && file_exists($imageRow['lr_image'])) {

    unlink($imageRow['lr_image']);
}

$conn->query(
    "DELETE FROM lorry_receipts WHERE id=$id"
);

echo "Deleted";

?>