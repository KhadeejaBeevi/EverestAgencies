<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

$data = json_decode(file_get_contents("php://input"), true);

$id = intval($data["id"] ?? 0);

if ($id <= 0) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid ID"
    ]);
    exit;
}

// Get image names before deleting
$stmt = $conn->prepare("
    SELECT
        quotation_image,
        po_image,
        invoice_image
    FROM po_details
    WHERE id = ?
");
$stmt->bind_param("i", $id);
$stmt->execute();

$result = $stmt->get_result();

if ($result->num_rows == 0) {
    echo json_encode([
        "success" => false,
        "message" => "Record not found"
    ]);
    exit;
}

$row = $result->fetch_assoc();

$uploadDir = "uploads/po/";

// Delete quotation image
if (!empty($row["quotation_image"])) {
    $file = $uploadDir . $row["quotation_image"];
    if (file_exists($file)) {
        unlink($file);
    }
}

// Delete PO image
if (!empty($row["po_image"])) {
    $file = $uploadDir . $row["po_image"];
    if (file_exists($file)) {
        unlink($file);
    }
}

// Delete invoice image
if (!empty($row["invoice_image"])) {
    $file = $uploadDir . $row["invoice_image"];
    if (file_exists($file)) {
        unlink($file);
    }
}

// Delete record
$stmt = $conn->prepare("DELETE FROM po_details WHERE id = ?");
$stmt->bind_param("i", $id);

if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Purchase Order deleted successfully."
    ]);

} else {

    echo json_encode([
        "success" => false,
        "message" => $conn->error
    ]);

}

$stmt->close();
$conn->close();
?>