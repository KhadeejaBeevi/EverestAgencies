<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die(json_encode([
        "success" => false,
        "message" => "Database connection failed."
    ]));
}

$data = json_decode(file_get_contents("php://input"), true);

$id = intval($data["id"] ?? 0);

if ($id <= 0) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid Tender ID."
    ]);
    exit;
}

/* Get image path */
$get = $conn->prepare("SELECT tender_photo FROM tender_details WHERE id=?");
$get->bind_param("i", $id);
$get->execute();
$res = $get->get_result();

if ($row = $res->fetch_assoc()) {

    if (!empty($row["tender_photo"])) {

        $file = basename($row["tender_photo"]);
        $path = __DIR__ . "/uploads/tenders/" . $file;

        if (file_exists($path)) {
            unlink($path);
        }
    }
}

/* Delete record */
$stmt = $conn->prepare("DELETE FROM tender_details WHERE id=?");
$stmt->bind_param("i", $id);

if ($stmt->execute()) {
    echo json_encode([
        "success" => true
    ]);
} else {
    echo json_encode([
        "success" => false,
        "message" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();
?>