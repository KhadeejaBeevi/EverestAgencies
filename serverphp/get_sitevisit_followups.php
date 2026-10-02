<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");
// ================= GET DATE =================

$date = $_GET['date'] ?? '';

// ================= QUERY =================

if (!empty($date)) {

    $stmt = $conn->prepare(
        "SELECT *
         FROM site_visits
         WHERE followup_date = ?
         ORDER BY id DESC"
    );

    $stmt->bind_param("s", $date);

} else {

    $stmt = $conn->prepare(
        "SELECT *
         FROM site_visits
         ORDER BY id DESC"
    );

}

// ================= EXECUTE =================

$stmt->execute();

$result = $stmt->get_result();

$data = [];

while ($row = $result->fetch_assoc()) {

    $data[] = $row;

}

echo json_encode($data);

// ================= CLOSE =================

$stmt->close();
$conn->close();

?>