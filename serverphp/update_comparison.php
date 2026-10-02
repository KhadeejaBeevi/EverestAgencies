<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die(json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]));
}

$id = $_POST["id"] ?? "";
$order_received_status = $_POST["order_received_status"] ?? "";

if (!$id) {
    echo json_encode([
        "success" => false,
        "message" => "Tender ID missing"
    ]);
    exit;
}

// Get existing comparison image
$stmt = $conn->prepare("SELECT comparison FROM tender_details WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();

$comparisonPath = $row["comparison"] ?? "";

/* Upload comparison image */
if (
    isset($_FILES["comparisonFile"]) &&
    $_FILES["comparisonFile"]["error"] === 0
) {

    $uploadDir = "uploads/comparison/";

    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    $fileName = time() . "_" . basename($_FILES["comparisonFile"]["name"]);
    $targetFile = $uploadDir . $fileName;

    if (
        move_uploaded_file(
            $_FILES["comparisonFile"]["tmp_name"],
            $targetFile
        )
    ) {
        $comparisonPath = "/" . $targetFile;
    }
}

// Update comparison and status
$stmt = $conn->prepare("
    UPDATE tender_details
    SET comparison = ?, order_received_status = ?
    WHERE id = ?
");

$stmt->bind_param(
    "ssi",
    $comparisonPath,
    $order_received_status,
    $id
);

if ($stmt->execute()) {
    echo json_encode([
        "success" => true,
        "comparison" => $comparisonPath
    ]);
} else {
    echo json_encode([
        "success" => false,
        "message" => "Update failed"
    ]);
}

$stmt->close();
$conn->close();

?>