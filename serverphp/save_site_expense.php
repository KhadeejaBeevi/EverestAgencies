<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {

    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed"
    ]);

    exit();
}

$site_visit_id = $_POST['site_visit_id'] ?? '';
$expense_type = $_POST['expense_type'] ?? '';
$amount = $_POST['amount'] ?? '';
$remarks = $_POST['remarks'] ?? '';
$sales_executive = $_POST['sales_executive'] ?? '';
$bill_image = $_POST['bill_image'] ?? '';

if (
    empty($site_visit_id) ||
    empty($expense_type) ||
    empty($amount)
) {

    echo json_encode([
        "status" => "error",
        "message" => "Missing required fields"
    ]);

    exit();
}

$imagePath = "";

/* CREATE FOLDER IF NOT EXISTS */

if (!file_exists("expense_bills")) {

    mkdir("expense_bills", 0777, true);
}

/* SAVE IMAGE */

if (!empty($bill_image)) {

    if (strpos($bill_image, ";base64,") !== false) {

        $image_parts = explode(";base64,", $bill_image);

        $image_type_aux = explode("image/", $image_parts[0]);

        $image_type = $image_type_aux[1] ?? 'png';

        $image_base64 = base64_decode($image_parts[1]);

        $fileName =
            "expense_" .
            time() .
            "_" .
            rand(1000,9999) .
            "." .
            $image_type;

        $folder = "expense_bills/" . $fileName;

        file_put_contents($folder, $image_base64);

        $imagePath = $folder;
    }
}

/* INSERT EXPENSE */

$stmt = $conn->prepare("
    INSERT INTO site_visit_expenses
    (
        site_visit_id,
        expense_date,
        expense_type,
        amount,
        remarks,
        bill_image,
        sales_executive
    )
    VALUES
    (?, CURDATE(), ?, ?, ?, ?, ?)
");

$stmt->bind_param(
    "isdsss",
    $site_visit_id,
    $expense_type,
    $amount,
    $remarks,
    $imagePath,
    $sales_executive
);

if ($stmt->execute()) {

    /* UPDATE TOTAL EXPENSE */

    $updateQuery = "
        UPDATE site_visits
        SET total_expense = (
            SELECT IFNULL(SUM(amount),0)
            FROM site_visit_expenses
            WHERE site_visit_id = '$site_visit_id'
        )
        WHERE id = '$site_visit_id'
    ";

    $conn->query($updateQuery);

    echo json_encode([
        "status" => "success",
        "message" => "Expense saved successfully"
    ]);

} else {

    echo json_encode([
        "status" => "error",
        "message" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();

?>