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

/*
|--------------------------------------------------------------------------
| CRM party update (used by src/pages/CRM/EditPartyPopup.jsx)
|
| salesdatalatest33 is the original Tally data and is never updated.
| Edits are saved to ledger_mirror through update_ledger_mirror.php,
| which also flags them for the Ledger Changes (Tally) page.
|
| Column names contain "$", so they MUST stay in single quotes.
|--------------------------------------------------------------------------
*/

$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "error" => "Database connection failed: " . $conn->connect_error
    ]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

if (!$data || empty($data["PartyLedgerName"])) {
    echo json_encode([
        "success" => false,
        "error" => "No PartyLedgerName provided"
    ]);
    exit;
}

// CRM popup key => [salesdatalatest33 column, ledger_mirror field]
$fieldMap = [
    'designation' => ['designation', 'designation'],
    'designator_name' => ['designator_name', 'designator_name'],
    'Ledger.$LedgerMobile' => ['Ledger.$LedgerMobile', 'LedgerMobile'],
    'Ledger.$EMail' => ['Ledger.$EMail', 'EMail'],
    'Ledger.$_LedgerPhone' => ['Ledger.$_LedgerPhone', 'LedgerPhone'],
    'Ledger.$_Led_OwnerName_Form' => ['Ledger.$_Led_OwnerName_Form', 'OwnerName'],
    'Ledger.$_Led_OwnerPhone_Form' => ['Ledger.$_Led_OwnerPhone_Form', 'OwnerPhone'],
    'Ledger.$_Led_Payment_Contact_P_Form' => ['Ledger.$_Led_Payment_Contact_P_Form', 'PaymentContact'],
    'Ledger.$_Led_Payment_Contact_PHone_Form' => ['Ledger.$_Led_Payment_Contact_PHone_Form', 'PaymentContactPhone'],
    'Ledger.$_Led_Purchase_Contact_P_Form' => ['Ledger.$_Led_Purchase_Contact_P_Form', 'PurchaseContact'],
    'Ledger.$_Led_Purchase_Contact_PHone_Form' => ['Ledger.$_Led_Purchase_Contact_PHone_Form', 'PurchaseContactPhone'],
    'Ledger.$_LedGroup' => ['Ledger.$_LedGroup', 'LedGroup'],
    'Ledger.$_Address1' => ['Ledger.$_Address1', 'Address1'],
    'Ledger.$_Address2' => ['Ledger.$_Address2', 'Address2'],
    'Ledger.$_Address3' => ['Ledger.$_Address3', 'Address3'],
    'Ledger.$_Address4' => ['Ledger.$_Address4', 'Address4'],
    'Ledger.$_Address5' => ['Ledger.$_Address5', 'Address5'],
];

// Original row
$stmt = $conn->prepare("
    SELECT * FROM salesdatalatest33
    WHERE `PartyLedgerName` = ?
    LIMIT 1
");
$stmt->bind_param("s", $data["PartyLedgerName"]);
$stmt->execute();
$original = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$original) {
    echo json_encode([
        "success" => false,
        "error" => "Party not found"
    ]);
    exit;
}

$msid = trim((string)($original['Ledger.$_EveLedMstID'] ?? ""));

if ($msid === "") {
    echo json_encode([
        "success" => false,
        "error" => "This party has no Tally ID (MSID), so it cannot be edited"
    ]);
    exit;
}

// Values already saved in ledger_mirror (what the popup currently shows)
$mirror = [];
$mStmt = $conn->prepare("SELECT * FROM ledger_mirror WHERE `MSID` = ? LIMIT 1");
if ($mStmt) {
    $mStmt->bind_param("s", $msid);
    $mStmt->execute();
    $mirror = $mStmt->get_result()->fetch_assoc() ?: [];
    $mStmt->close();
}

/*
| Only send fields the user actually changed in the popup, so untouched
| fields are never recorded as edits.
*/
$mirrorInput = ["MSID" => $msid];

foreach ($fieldMap as $key => [$column, $mirrorField]) {
    if (!array_key_exists($key, $data)) {
        continue;
    }

    $shown = isset($mirror[$mirrorField])
        ? $mirror[$mirrorField]
        : ($original[$column] ?? "");

    $new = trim((string)($data[$key] ?? ""));

    if ($new !== trim((string)$shown)) {
        $mirrorInput[$mirrorField] = $new;
    }
}

$conn->close();

if (count($mirrorInput) === 1) {
    echo json_encode([
        "success" => true,
        "changed" => false,
        "message" => "No fields were changed"
    ]);
    exit;
}

$mirrorInput["edited_by"] = trim((string)($data["edited_by"] ?? "")) ?: "CRM";

// Hand over to the shared ledger_mirror save (prints the JSON response)
$LEDGER_MIRROR_INPUT = $mirrorInput;
require __DIR__ . '/update_ledger_mirror.php';
