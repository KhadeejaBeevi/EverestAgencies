<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode(["status" => "error", "message" => "DB connection failed"]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
$quotation_status = $data['quotation_status'] ?? null;
$quotation_no = $data['quotation_no'] ?? null;
$quotation_amount = $data['quotation_amount'] ?? null;
$item_details = $data['item_details'] ?? '';
$quotation_date = $data['quotation_date'] ?? null;

$po_no = $data['po_no'] ?? null;
$po_date = $data['po_date'] ?? null;

$lost_reason = $data['lost_reason'] ?? null;

$contact_person = $data['contact_person'] ?? null;
$contact_designation = $data['contact_designation'] ?? null;
if ($data === null) {
    echo json_encode(["status" => "error", "message" => "Invalid JSON"]);
    exit();
}

$required = ['kseb_id','call_date','telecaller_name','status','remarks','followup_date','executive_name','phone'];

foreach ($required as $field) {
    if (!isset($data[$field])) {
        echo json_encode(["status"=>"error","message"=>"Missing field: $field"]);
        exit();
    }
}

$sql = "INSERT INTO kseb_calls
(
    kseb_id,
    call_date,
    telecaller_name,
    status,
    remarks,
    followup_date,
    executive_name,
    phone,
    quotation_status,
    quotation_no,
    quotation_amount,
    item_details,
    quotation_date,
    po_no,
    po_date,
    lost_reason,
    contact_person,
    contact_designation
)
VALUES
(
    ?,?,?,?,?,?,?,?,
    ?,?,?,?,
    ?,?,?,?,?,?
)";


$stmt = $conn->prepare($sql);

if (!$stmt) {
    echo json_encode(["status" => "error", "message" => $conn->error]);
    exit();
}

$stmt->bind_param(
    "isssssssssssssssss",
    $data['kseb_id'],
    $data['call_date'],
    $data['telecaller_name'],
    $data['status'],
    $data['remarks'],
    $data['followup_date'],
    $data['executive_name'],
    $data['phone'],

    $quotation_status,
    $quotation_no,
    $quotation_amount,
    $item_details,
    $quotation_date,

    $po_no,
    $po_date,

    $lost_reason,

    $contact_person,
    $contact_designation
);

if ($stmt->execute()) {
  echo json_encode(["status" => "success"]);
} else {
  echo json_encode(["status" => "error", "message" => $stmt->error]);
}

$stmt->close();
$conn->close();