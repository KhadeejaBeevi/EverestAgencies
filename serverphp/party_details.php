<?php

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

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
    $msid = $row["Ledger.$_EveLedMstID"] ?? "";

    /*
     * Existing CRM response structure
     */
    $response = [
        "PartyLedgerName" => $row["PartyLedgerName"] ?? "",
        "fullyUpdated" => $row["fully_updated"] ?? false,

        "designation" => $row["designation"] ?? "",
        "designator_name" => $row["designator_name"] ?? "",

        "Ledger.$_EveLedMstID" => $msid,

        "Ledger.$LedgerMobile" => $row["Ledger.$LedgerMobile"] ?? "",
        "Ledger.$EMail" => $row["Ledger.$EMail"] ?? "",
        "Ledger.$_LedgerPhone" => $row["Ledger.$_LedgerPhone"] ?? "",

        "Ledger.$_Led_OwnerName_Form" =>
            $row["Ledger.$_Led_OwnerName_Form"] ?? "",

        "Ledger.$_Led_OwnerPhone_Form" =>
            $row["Ledger.$_Led_OwnerPhone_Form"] ?? "",

        "Ledger.$_Led_Payment_Contact_P_Form" =>
            $row["Ledger.$_Led_Payment_Contact_P_Form"] ?? "",

        "Ledger.$_Led_Payment_Contact_PHone_Form" =>
            $row["Ledger.$_Led_Payment_Contact_PHone_Form"] ?? "",

        "Ledger.$_Led_Purchase_Contact_P_Form" =>
            $row["Ledger.$_Led_Purchase_Contact_P_Form"] ?? "",

        "Ledger.$_Led_Purchase_Contact_PHone_Form" =>
            $row["Ledger.$_Led_Purchase_Contact_PHone_Form"] ?? "",

        "Ledger.$_LedGroup" =>
            $row["Ledger.$_LedGroup"] ?? "",

        "Ledger.$_Address1" =>
            $row["Ledger.$_Address1"] ?? "",

        "Ledger.$_Address2" =>
            $row["Ledger.$_Address2"] ?? "",

        "Ledger.$_Address3" =>
            $row["Ledger.$_Address3"] ?? "",

        "Ledger.$_Address4" =>
            $row["Ledger.$_Address4"] ?? "",

        "Ledger.$_Address5" =>
            $row["Ledger.$_Address5"] ?? ""
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