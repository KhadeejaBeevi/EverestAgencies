<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {

    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed"
    ]);

    exit();
}

$id = $_GET['id'] ?? '';

if (empty($id)) {

    echo json_encode([
        "status" => "error",
        "message" => "Expense ID missing"
    ]);

    exit();
}

/* GET EXPENSE DATA */

$getData = $conn->query("
    SELECT site_visit_id, bill_image
    FROM site_visit_expenses
    WHERE id = '$id'
");

if ($getData->num_rows == 0) {

    echo json_encode([
        "status" => "error",
        "message" => "Expense not found"
    ]);

    exit();
}

$row = $getData->fetch_assoc();

$site_visit_id = $row['site_visit_id'];
$bill_image = $row['bill_image'];

/* DELETE IMAGE */

if (
    !empty($bill_image) &&
    file_exists($bill_image)
) {

    unlink($bill_image);
}

/* DELETE EXPENSE */

$delete = $conn->query("
    DELETE FROM site_visit_expenses
    WHERE id = '$id'
");

if ($delete) {

    /* UPDATE TOTAL EXPENSE */

    $conn->query("
        UPDATE site_visits
        SET total_expense = (
            SELECT IFNULL(SUM(amount),0)
            FROM site_visit_expenses
            WHERE site_visit_id = '$site_visit_id'
        )
        WHERE id = '$site_visit_id'
    ");

    echo json_encode([
        "status" => "success"
    ]);

} else {

    echo json_encode([
        "status" => "error",
        "message" => "Delete failed"
    ]);
}

$conn->close();

?>