<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// For debugging (set to 1 to debug)
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Handle preflight (CORS)
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

// Decode input
$data = json_decode(file_get_contents("php://input"), true);
if (!$data || !isset($data["id"])) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid JSON input or missing ID"
    ]);
    exit;
}

// ✅ Updated SQL query (added designation, designator_name)
$stmt = $conn->prepare("
    UPDATE newpartyledgerdetails SET 
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
        referred_by = ?, 
        designation = ?, 
        designator_name = ?
    WHERE id = ?
");

if (!$stmt) {
    echo json_encode([
        "success" => false,
        "message" => "Failed to prepare statement: " . $conn->error
    ]);
    exit;
}

// ✅ Bind all 21 parameters (19 old + 2 new + ID)
$stmt->bind_param(
    "ssssssssssssssssssssi",
    $data['party_ledger_name'],
    $data['group_name'],
    $data['gst_registration_type'],
    $data['gstin'],
    $data['mobile'],
    $data['address'],
    $data['email'],
    $data['ledger_phone'],
    $data['owner_name'],
    $data['owner_phone'],
    $data['payment_contact_person'],
    $data['payment_contact_phone'],
    $data['purchase_contact_person'],
    $data['purchase_contact_phone'],
    $data['field_executive'],
    $data['requirement_type'],
    $data['decision_maker'],
    $data['referred_by'],
    $data['designation'],
    $data['designator_name'],
    $data['id']
);

// Execute
if (!$stmt->execute()) {
    echo json_encode([
        "success" => false,
        "message" => "Update failed",
        "error" => $stmt->error
    ]);
    $stmt->close();
    $conn->close();
    exit;
}

echo json_encode([
    "success" => true,
    "message" => "Update successful"
]);

$stmt->close();
$conn->close();
?>
