<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "amal1234", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

$input = json_decode(file_get_contents("php://input"), true);

if (!isset($input['partyLedger'])) {
    echo json_encode(["success" => false, "error" => "Missing partyLedger"]);
    exit;
}

$partyLedger = $conn->real_escape_string($input['partyLedger']);

// Begin transaction
$conn->begin_transaction();

try {
    // 1️⃣ Get full record from sorry_call_list
    $getRow = $conn->query("SELECT * FROM sorry_call_list WHERE party_ledger_name = '$partyLedger' LIMIT 1");
    
    if (!$getRow || $getRow->num_rows === 0) {
        throw new Exception("Party not found in Sorry Call list");
    }
    
    $row = $getRow->fetch_assoc();
    
    // 2️⃣ Insert into main table (newparty_table based on your code)
    $mainTableFields = [
        'party_ledger_name',
        'group_name', 
        'gst_registration_type',
        'gstin',
        'email',
        'mobile',
        'address',
        'field_executive',
        'rating'
    ];
    
    $fieldValues = [];
    foreach ($mainTableFields as $field) {
        $value = isset($row[$field]) ? "'" . $conn->real_escape_string($row[$field]) . "'" : "NULL";
        $fieldValues[] = $value;
    }
    
    $fieldsStr = implode(', ', $mainTableFields);
    $valuesStr = implode(', ', $fieldValues);
    
    $insertMain = $conn->query("
        INSERT INTO newparty_table ($fieldsStr) 
        VALUES ($valuesStr)
    ");
    
    if (!$insertMain) {
        throw new Exception("Failed to insert into main table: " . $conn->error);
    }
    
    // 3️⃣ Delete from sorry_call_list
    $delete = $conn->query("DELETE FROM sorry_call_list WHERE party_ledger_name = '$partyLedger'");
    
    if (!$delete) {
        throw new Exception("Failed to delete from Sorry Call list: " . $conn->error);
    }
    
    // 4️⃣ Log the restoration
    $logStmt = $conn->prepare("
        INSERT INTO sorry_call_restore_log 
        (party_name, restored_at, restored_by) 
        VALUES (?, NOW(), ?)
    ");
    
    $user = $_SESSION['user_email'] ?? 'system';
    $logStmt->bind_param("ss", $partyLedger, $user);
    $logStmt->execute();
    
    $conn->commit();
    
    echo json_encode([
        "success" => true, 
        "message" => "Party restored successfully to main list"
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