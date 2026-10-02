<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "amal1234", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

$input = json_decode(file_get_contents("php://input"), true);

if (!isset($input['id']) && !isset($input['partyLedger'])) {
    echo json_encode(["success" => false, "error" => "Missing party identifier"]);
    exit;
}

$partyId = isset($input['id']) ? $input['id'] : null;
$partyLedger = isset($input['partyLedger']) ? $input['partyLedger'] : null;

// Get party details
if ($partyId) {
    $partyQuery = $conn->prepare("SELECT * FROM newparty_table WHERE id = ?");
    $partyQuery->bind_param("i", $partyId);
} else {
    $partyQuery = $conn->prepare("SELECT * FROM newparty_table WHERE party_ledger_name = ?");
    $partyQuery->bind_param("s", $partyLedger);
}

$partyQuery->execute();
$partyResult = $partyQuery->get_result();
$party = $partyResult->fetch_assoc();

if (!$party) {
    echo json_encode(["success" => false, "error" => "Party not found"]);
    exit;
}

$conn->begin_transaction();

try {
    // 1. Copy to sorry_call_list
    $insertStmt = $conn->prepare("
        INSERT INTO sorry_call_list 
        (party_ledger_name, group_name, gst_registration_type, gstin, email, mobile, 
         address, field_executive, rating, note, reason, added_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    
    $note = $input['note'] ?? '';
    $reason = $input['reason'] ?? 'Sorry Call';
    $addedBy = $_SESSION['user_email'] ?? 'system';
    
    $insertStmt->bind_param(
        "ssssssssisss",
        $party['party_ledger_name'],
        $party['group_name'],
        $party['gst_registration_type'],
        $party['gstin'],
        $party['email'],
        $party['mobile'],
        $party['address'],
        $party['field_executive'],
        $party['rating'],
        $note,
        $reason,
        $addedBy
    );
    
    $insertStmt->execute();
    
    // 2. Delete from main table
    $deleteStmt = $conn->prepare("DELETE FROM newparty_table WHERE id = ?");
    $deleteStmt->bind_param("i", $party['id']);
    $deleteStmt->execute();
    
    $conn->commit();
    
    echo json_encode([
        "success" => true,
        "message" => "Party moved to Sorry Call list"
    ]);
    
} catch (Exception $e) {
    $conn->rollback();
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}

$conn->close();
?>