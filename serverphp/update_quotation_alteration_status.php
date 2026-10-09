<?php

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);

$id = isset($input['id']) ? intval($input['id']) : 0;
$status = isset($input['status'])
    ? trim($input['status'])
    : "";
$revisedBy = isset($input['revised_by'])
    ? trim($input['revised_by'])
    : "";

if ($id <= 0) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid negotiation request ID"
    ]);
    exit;
}

if ($status !== "Pending" && $status !== "Revised") {
    echo json_encode([
        "success" => false,
        "message" => "Invalid status"
    ]);
    exit;
}

/* Who completed the rework and when (added once if missing). */
foreach ([
    "enquiry_id" => "ADD COLUMN enquiry_id INT NULL",
    "revised_by" => "ADD COLUMN revised_by VARCHAR(150) NULL",
    "revised_at" => "ADD COLUMN revised_at DATETIME NULL"
] as $column => $definition) {
    $check = $conn->query("SHOW COLUMNS FROM quotation_alteration_requests LIKE '$column'");
    if ($check && $check->num_rows === 0) {
        $conn->query("ALTER TABLE quotation_alteration_requests $definition");
    }
}

/* Revised = rework completed; Pending clears the completion details. */
$stmt = $conn->prepare("
    UPDATE quotation_alteration_requests
    SET
        request_status = ?,
        revised_by = IF(? = 'Revised', ?, NULL),
        revised_at = IF(? = 'Revised', NOW(), NULL),
        updated_at = NOW()
    WHERE id = ?
");

$stmt->bind_param("ssssi", $status, $status, $revisedBy, $status, $id);

if ($stmt->execute()) {

    /* Rework done -> the linked enquiry shows "Negotiation Rework Completed". */
    if ($status === "Revised") {
        $enquiryStmt = $conn->prepare("
            UPDATE enquiry_report e
            JOIN quotation_alteration_requests r ON r.id = ?
            SET e.remarks = 'Negotiation Rework Completed', e.updated_at = NOW()
            WHERE e.remarks = 'Negotiation'
              AND (
                  e.id = r.enquiry_id
                  OR (r.enquiry_id IS NULL AND r.quotation_no <> '' AND e.sales_order_no = r.quotation_no)
              )
        ");
        $enquiryStmt->bind_param("i", $id);
        $enquiryStmt->execute();
        $enquiryStmt->close();
    }

    echo json_encode([
        "success" => true,
        "message" => "Negotiation request updated successfully",
        "id" => $id,
        "request_status" => $status
    ]);

} else {

    echo json_encode([
        "success" => false,
        "message" => "Failed to update negotiation request",
        "error" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();
?>