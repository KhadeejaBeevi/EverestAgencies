<?php
require_once __DIR__ . '/db_connect.php';

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = db_connect("salescollection");

if ($conn->connect_error) {
    echo json_encode([
        "error" => "Connection failed: " . $conn->connect_error
    ]);
    exit;
}

$inputJSON = file_get_contents("php://input");
$input = json_decode($inputJSON, true);

if (
    !$input ||
    !isset($input["PartyLedgerName"]) ||
    empty($input["PartyLedgerName"])
) {
    echo json_encode([
        "error" => "No PartyLedgerName provided"
    ]);
    exit;
}

$party = $input["PartyLedgerName"];

$stmt = $conn->prepare("
    SELECT *
    FROM salesdatalatest33
    WHERE `PartyLedgerName` = ?
    LIMIT 1
");

$stmt->bind_param("s", $party);
$stmt->execute();

$result = $stmt->get_result();

if ($result && $result->num_rows > 0) {

    $row = $result->fetch_assoc();

    /*
     * IMPORTANT
     * Return the MSID to React.
     */
    $msid = $row['Ledger.$_EveLedMstID'] ?? "";

    /*
     * Show edits saved in ledger_mirror (by the CRM popup or the
     * Ledger Edit page) on top of the original Tally data.
     */
    $mirrorToColumn = [
        'designation' => 'designation',
        'designator_name' => 'designator_name',
        'LedgerMobile' => 'Ledger.$LedgerMobile',
        'EMail' => 'Ledger.$EMail',
        'LedgerPhone' => 'Ledger.$_LedgerPhone',
        'OwnerName' => 'Ledger.$_Led_OwnerName_Form',
        'OwnerPhone' => 'Ledger.$_Led_OwnerPhone_Form',
        'PaymentContact' => 'Ledger.$_Led_Payment_Contact_P_Form',
        'PaymentContactPhone' => 'Ledger.$_Led_Payment_Contact_PHone_Form',
        'PurchaseContact' => 'Ledger.$_Led_Purchase_Contact_P_Form',
        'PurchaseContactPhone' => 'Ledger.$_Led_Purchase_Contact_PHone_Form',
        'LedGroup' => 'Ledger.$_LedGroup',
        'Address1' => 'Ledger.$_Address1',
        'Address2' => 'Ledger.$_Address2',
        'Address3' => 'Ledger.$_Address3',
        'Address4' => 'Ledger.$_Address4',
        'Address5' => 'Ledger.$_Address5',
    ];

    // ledger_mirror field => label used by the CRM popup highlight
    $fieldLabels = [
        'designation' => 'Designation',
        'designator_name' => 'Designator Name',
        'LedgerMobile' => 'Mobile',
        'EMail' => 'Email',
        'LedgerPhone' => 'Ledger Phone',
        'OwnerName' => 'Owner Name',
        'OwnerPhone' => 'Owner Phone',
        'PaymentContact' => 'Payment Contact',
        'PaymentContactPhone' => 'Payment Phone',
        'PurchaseContact' => 'Purchase Contact',
        'PurchaseContactPhone' => 'Purchase Phone',
        'LedGroup' => 'Group',
        'Address1' => 'Address',
        'Address2' => 'Address',
        'Address3' => 'Address',
        'Address4' => 'Address',
        'Address5' => 'Address',
    ];

    $editedFields = [];

    if ($msid !== "") {
        $mirrorStmt = $conn->prepare("SELECT * FROM ledger_mirror WHERE `MSID` = ? LIMIT 1");
        if ($mirrorStmt) {
            $mirrorStmt->bind_param("s", $msid);
            $mirrorStmt->execute();
            $mirror = $mirrorStmt->get_result()->fetch_assoc();
            $mirrorStmt->close();

            if ($mirror) {
                foreach ($mirrorToColumn as $field => $column) {
                    if (!isset($mirror[$field])) {
                        continue;
                    }

                    /*
                     * Red in the CRM popup while the CRM value differs from
                     * Tally. Once salesdatalatest33 is updated with the same
                     * value, it is no longer listed.
                     */
                    if (trim((string)$mirror[$field]) !== trim((string)($row[$column] ?? ""))) {
                        $editedFields[] = $fieldLabels[$field];
                    }

                    $row[$column] = $mirror[$field];
                }
            }
        }
    }

    /*
     * Existing CRM response structure
     */
    $response = [
        "PartyLedgerName" => $row["PartyLedgerName"] ?? "",
        "fullyUpdated" => $row["fully_updated"] ?? false,

        // Fields changed in the CRM but not yet updated in Tally
        "editedFields" => array_values(array_unique($editedFields)),

        "designation" => $row["designation"] ?? "",
        "designator_name" => $row["designator_name"] ?? "",

        'Ledger.$_EveLedMstID' => $msid,

        'Ledger.$LedgerMobile' => $row['Ledger.$LedgerMobile'] ?? "",
        'Ledger.$EMail' => $row['Ledger.$EMail'] ?? "",
        'Ledger.$_LedgerPhone' => $row['Ledger.$_LedgerPhone'] ?? "",

        'Ledger.$_Led_OwnerName_Form' =>
            $row['Ledger.$_Led_OwnerName_Form'] ?? "",

        'Ledger.$_Led_OwnerPhone_Form' =>
            $row['Ledger.$_Led_OwnerPhone_Form'] ?? "",

        'Ledger.$_Led_Payment_Contact_P_Form' =>
            $row['Ledger.$_Led_Payment_Contact_P_Form'] ?? "",

        'Ledger.$_Led_Payment_Contact_PHone_Form' =>
            $row['Ledger.$_Led_Payment_Contact_PHone_Form'] ?? "",

        'Ledger.$_Led_Purchase_Contact_P_Form' =>
            $row['Ledger.$_Led_Purchase_Contact_P_Form'] ?? "",

        'Ledger.$_Led_Purchase_Contact_PHone_Form' =>
            $row['Ledger.$_Led_Purchase_Contact_PHone_Form'] ?? "",

        'Ledger.$_LedGroup' =>
            $row['Ledger.$_LedGroup'] ?? "",

        'Ledger.$_Address1' =>
            $row['Ledger.$_Address1'] ?? "",

        'Ledger.$_Address2' =>
            $row['Ledger.$_Address2'] ?? "",

        'Ledger.$_Address3' =>
            $row['Ledger.$_Address3'] ?? "",

        'Ledger.$_Address4' =>
            $row['Ledger.$_Address4'] ?? "",

        'Ledger.$_Address5' =>
            $row['Ledger.$_Address5'] ?? ""
    ];

    echo json_encode($response);

} else {

    echo json_encode([
        "error" => "Party not found"
    ]);
}

$stmt->close();
$conn->close();
?>