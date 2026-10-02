<?php
require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database connection
$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed: " . $conn->connect_error
    ]);
    exit;
}

// Get JSON
$data = json_decode(file_get_contents("php://input"), true);

if (!$data) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid JSON input"
    ]);
    exit;
}

// ID is required
$id = isset($data["id"]) ? (int)$data["id"] : 0;

if ($id <= 0) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid party ID"
    ]);
    exit;
}


/*
|--------------------------------------------------------------------------
| Get fields
|--------------------------------------------------------------------------
*/

$party_ledger_name = $data["party_ledger_name"] ?? "";
$group_name = $data["group_name"] ?? "";
$gst_registration_type = $data["gst_registration_type"] ?? "";
$gstin = $data["gstin"] ?? "";
$mobile = $data["mobile"] ?? "";
$address = $data["address"] ?? "";
$email = $data["email"] ?? "";
$ledger_phone = $data["ledger_phone"] ?? "";
$owner_name = $data["owner_name"] ?? "";
$owner_phone = $data["owner_phone"] ?? "";
$payment_contact_person = $data["payment_contact_person"] ?? "";
$payment_contact_phone = $data["payment_contact_phone"] ?? "";
$purchase_contact_person = $data["purchase_contact_person"] ?? "";
$purchase_contact_phone = $data["purchase_contact_phone"] ?? "";
$field_executive = $data["field_executive"] ?? "";
$requirement_type = $data["requirement_type"] ?? "";
$decision_maker = $data["decision_maker"] ?? "";
$referred_by = $data["referred_by"] ?? "";


/*
|--------------------------------------------------------------------------
| Update party
|
| IMPORTANT:
| added_by is NOT updated here.
| The original creator remains recorded.
|--------------------------------------------------------------------------
*/

$sql = "UPDATE newpartyledgerdetails SET
    party_ledger_name = ?,
    group_name = ?,
    gst_registration_type = ?,
    gstin = ?,
    mobile = ?,
    address = ?,
    email = ?,
    ledger_phone = ?,
    owner_name = ?,
    owner_phone = ?,
    payment_contact_person = ?,
    payment_contact_phone = ?,
    purchase_contact_person = ?,
    purchase_contact_phone = ?,
    field_executive = ?,
    requirement_type = ?,
    decision_maker = ?,
    referred_by = ?
    WHERE id = ?";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    echo json_encode([
        "success" => false,
        "message" => "SQL prepare failed: " . $conn->error
    ]);
    exit;
}

$stmt->bind_param(
    "ssssssssssssssssssi",
    $party_ledger_name,
    $group_name,
    $gst_registration_type,
    $gstin,
    $mobile,
    $address,
    $email,
    $ledger_phone,
    $owner_name,
    $owner_phone,
    $payment_contact_person,
    $payment_contact_phone,
    $purchase_contact_person,
    $purchase_contact_phone,
    $field_executive,
    $requirement_type,
    $decision_maker,
    $referred_by,
    $id
);

if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Party updated successfully",
        "id" => $id
    ]);

} else {

    echo json_encode([
        "success" => false,
        "message" => "Update failed",
        "error" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();
?>