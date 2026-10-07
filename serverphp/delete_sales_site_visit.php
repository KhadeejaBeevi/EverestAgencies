<?php
require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/sales_site_visit_db.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: DELETE, GET");
header("Content-Type: application/json");

$id = (int) ($_GET['id'] ?? 0);

if (!$id) {
    echo json_encode(["status" => "error", "message" => "No ID"]);
    exit;
}

$conn = sales_site_visit_conn();

$find = $conn->prepare("SELECT image FROM sales_site_visits WHERE id = ?");
$find->bind_param("i", $id);
$find->execute();
$row = $find->get_result()->fetch_assoc();
$find->close();

$stmt = $conn->prepare("DELETE FROM sales_site_visits WHERE id = ?");
$stmt->bind_param("i", $id);

if ($stmt->execute()) {

    if ($row && !empty($row["image"]) && is_file(__DIR__ . "/" . $row["image"])) {
        unlink(__DIR__ . "/" . $row["image"]);
    }

    echo json_encode(["status" => "success"]);

} else {
    echo json_encode(["status" => "error"]);
}

$stmt->close();
$conn->close();
