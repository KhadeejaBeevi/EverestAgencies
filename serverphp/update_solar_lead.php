<?php
require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/solar_lead_source_column.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

$conn->set_charset("utf8mb4");

ensure_solar_source_column($conn);

$data = json_decode(file_get_contents("php://input"), true);

$id = (int)($data['id'] ?? 0);

$company_name = $data['company_name'] ?? '';
$address = $data['address'] ?? '';
$decision_maker = $data['decision_maker'] ?? '';
$contact_no = $data['contact_no'] ?? '';
$group_name = $data['group_name'] ?? '';
$sales_coordinator = $data['sales_coordinator'] ?? '';
$field_executive = $data['field_executive'] ?? '';
$lead_type = $data['lead_type'] ?? '';
$source = $data['source'] ?? '';

$stmt = $conn->prepare(
    "UPDATE solar_new_leads SET
    company_name = ?,
    address = ?,
    decision_maker = ?,
    contact_no = ?,
    group_name = ?,
    sales_coordinator = ?,
    field_executive = ?,
    lead_type = ?,
    source = ?
    WHERE id = ?"
);

$stmt->bind_param(
    "sssssssssi",
    $company_name,
    $address,
    $decision_maker,
    $contact_no,
    $group_name,
    $sales_coordinator,
    $field_executive,
    $lead_type,
    $source,
    $id
);

if ($stmt->execute()) {

    echo json_encode([
        "success" => true
    ]);

} else {

    echo json_encode([
        "success" => false
    ]);

}

$conn->close();

?>
