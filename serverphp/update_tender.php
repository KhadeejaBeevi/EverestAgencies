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




$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]);
    exit();
}


$data = json_decode(file_get_contents("php://input"), true);

$id = $data["id"] ?? 0;

$tender_info_given_to_gibin =
    $data["tender_info_given_to_gibin"] ?? "";

$tender_info_given_date =
    $data["tender_info_given_date"] ?? "";

$rate_given_by_gibin =
    $data["rate_given_by_gibin"] ?? "";

$everest_quotation_no =
    $data["everest_quotation_no"] ?? "";

$everest_quotation_date =
    $data["everest_quotation_date"] ?? "";

$sku_rate =
    $data["sku_rate"] ?? "";



$formula =
    $data["formula"] ?? "";

$order_received_status =
    $data["order_received_status"] ?? "";
$comparison =
    $data["comparison"] ?? "";   

/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
*/

if (empty($id)) {
    echo json_encode([
        "success" => false,
        "message" => "Tender ID missing"
    ]);
    exit();
}

/*
|--------------------------------------------------------------------------
| CHECK RECORD EXISTS
|--------------------------------------------------------------------------
*/

$checkStmt = $conn->prepare(
    "SELECT id FROM tender_details WHERE id = ?"
);

$checkStmt->bind_param("i", $id);
$checkStmt->execute();

$result = $checkStmt->get_result();

if ($result->num_rows === 0) {

    echo json_encode([
        "success" => false,
        "message" => "Tender not found"
    ]);

    exit();
}

$checkStmt->close();

/*
|--------------------------------------------------------------------------
| UPDATE ONLY EDITABLE FIELDS
|--------------------------------------------------------------------------
*/

$stmt = $conn->prepare("
UPDATE tender_details
SET
    tender_info_given_to_gibin = ?,
    tender_info_given_date = ?,
    rate_given_by_gibin = ?,
    everest_quotation_no = ?,
    everest_quotation_date = ?,
    sku_rate = ?,
  
    formula = ?,
    order_received_status = ?,
    comparison = ?,
    updated_at = NOW()
WHERE id = ?
");

$stmt->bind_param(
    "sssssssssi",
    $tender_info_given_to_gibin,
    $tender_info_given_date,
    $rate_given_by_gibin,
    $everest_quotation_no,
    $everest_quotation_date,
    $sku_rate,
   
    $formula,
    $order_received_status,
    $comparison,
    $id
);

if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Tender updated successfully"
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