<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Headers: Content-Type");

// DB connection
$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

$input = json_decode(file_get_contents("php://input"), true);

if (!isset($input['partyLedger'])) {
    echo json_encode(["success" => false, "error" => "Missing partyLedger"]);
    exit;
}

$partyLedger = $conn->real_escape_string($input['partyLedger']);

// 1️⃣ Get details before deleting
$getRow = $conn->query("SELECT * FROM sorry_call WHERE PartyLedgerName = '$partyLedger' LIMIT 1");
$note = "";
if ($getRow && $getRow->num_rows > 0) {
    $row = $getRow->fetch_assoc();
    $note = $conn->real_escape_string($row['note']);
}

// 2️⃣ Delete from do_not_call_list
$delete = $conn->query("DELETE FROM sorry_call WHERE PartyLedgerName = '$partyLedger'");

// 3️⃣ Reinsert into main table only if not already exists
if ($delete) {
    $exists = $conn->query("SELECT 1 FROM sales_summary_table4 WHERE PartyLedgerName = '$partyLedger' LIMIT 1");

    if ($exists && $exists->num_rows == 0) {
        $insert = $conn->query("
            INSERT INTO sales_summary_table4 (PartyLedgerName)
            VALUES ('$partyLedger')
        ");

        if ($insert) {
            echo json_encode(["success" => true, "message" => "Party restored successfully"]);
        } else {
            echo json_encode(["success" => false, "error" => $conn->error]);
        }
    } else {
        // Already exists, so just return success
        echo json_encode(["success" => true, "message" => "Party already exists in main table"]);
    }
} else {
    echo json_encode(["success" => false, "error" => $conn->error]);
}
