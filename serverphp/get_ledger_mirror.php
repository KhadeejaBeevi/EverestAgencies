<?php

error_reporting(E_ALL);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/*
|--------------------------------------------------------------------------
| Database
|--------------------------------------------------------------------------
*/

$host = "localhost";
$dbname = "salescollection";
$username = "root";
$password = "";


/*
|--------------------------------------------------------------------------
| JSON response helpers
|--------------------------------------------------------------------------
*/

function sendJson($data, $status = 200)
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE
    );

    exit;
}

function sendError($message, $step = null, $details = null)
{
    $response = [
        "success" => false,
        "message" => $message
    ];

    if ($step !== null) {
        $response["step"] = $step;
    }

    if ($details !== null) {
        $response["details"] = $details;
    }

    sendJson($response, 500);
}


/*
|--------------------------------------------------------------------------
| Main
|--------------------------------------------------------------------------
*/

try {

    /*
    |--------------------------------------------------------------------------
    | Database connection
    |--------------------------------------------------------------------------
    */

    $pdo = new PDO(
        "mysql:host={$host};dbname={$dbname};charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );


    /*
    |--------------------------------------------------------------------------
    | Read JSON body
    |--------------------------------------------------------------------------
    */

    $rawInput = file_get_contents("php://input");

    $input = json_decode($rawInput, true);

    if (!is_array($input)) {
        sendError(
            "Invalid JSON request.",
            "json_decode",
            json_last_error_msg()
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Party name
    |--------------------------------------------------------------------------
    */

    $partyLedgerName = trim(
        (string)($input["PartyLedgerName"] ?? "")
    );

    if ($partyLedgerName === "") {

        sendJson([
            "success" => false,
            "message" => "PartyLedgerName is required"
        ], 400);
    }


    /*
    |--------------------------------------------------------------------------
    | Find party in salesdatalatest33
    |--------------------------------------------------------------------------
    */

    $sql = "
        SELECT

            `Ledger.\$_EveLedMstID` AS MSID,

            `PartyLedgerName`,

            `Ledger.\$LedgerContact` AS LedgerContact,
            `Ledger.\$LedgerMobile` AS LedgerMobile,
            `Ledger.\$LedgerPhone` AS LedgerPhone,
            `Ledger.\$EMail` AS EMail,

            `Ledger.\$_Address1` AS Address1,
            `Ledger.\$_Address2` AS Address2,
            `Ledger.\$_Address3` AS Address3,
            `Ledger.\$_Address4` AS Address4,
            `Ledger.\$_Address5` AS Address5,

            `Ledger.\$_PrimaryGroup` AS PrimaryGroup,
            `Ledger.\$_LedgerFax` AS LedgerFax,

            `Ledger.\$_Led_Main_ContactNo_Form` AS MainContactNo,

            `Ledger.\$_Led_OwnerName_Form` AS OwnerName,
            `Ledger.\$_Led_OwnerPhone_Form` AS OwnerPhone,

            `Ledger.\$_Led_Payment_Contact_P_Form` AS PaymentContact,
            `Ledger.\$_Led_Payment_Contact_PHone_Form` AS PaymentContactPhone,

            `Ledger.\$_Led_Purchase_Contact_P_Form` AS PurchaseContact,
            `Ledger.\$_Led_Purchase_Contact_PHone_Form` AS PurchaseContactPhone,

            `Ledger.\$_LedGroup` AS LedGroup,

            `Ledger.\$_GSTRegistrationType` AS GSTRegistrationType,

            `Ledger.\$_PartyGSTIN` AS PartyGSTIN,

            `designation`,
            `designator_name`

        FROM `salesdatalatest33`

        WHERE `PartyLedgerName` = ?

        LIMIT 1
    ";

    try {

        $stmt = $pdo->prepare($sql);

        $stmt->execute([
            $partyLedgerName
        ]);

        $original = $stmt->fetch();

    } catch (PDOException $e) {

        sendError(
            "Failed to query salesdatalatest33.",
            "salesdatalatest33_query",
            $e->getMessage()
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Party not found
    |--------------------------------------------------------------------------
    */

    if (!$original) {

        sendJson([
            "success" => false,
            "message" => "Party not found in salesdatalatest33",
            "PartyLedgerName" => $partyLedgerName
        ], 404);
    }


    /*
    |--------------------------------------------------------------------------
    | MSID
    |--------------------------------------------------------------------------
    */

    $MSID = trim(
        (string)($original["MSID"] ?? "")
    );


    /*
    |--------------------------------------------------------------------------
    | No MSID
    |--------------------------------------------------------------------------
    */

    if ($MSID === "") {

        sendJson([
            "success" => true,
            "message" => "Party found but MSID is empty",
            "MSID" => null,
            "data" => $original,
            "original" => $original,
            "edited" => null
        ]);
    }


    /*
    |--------------------------------------------------------------------------
    | Find mirror record
    |--------------------------------------------------------------------------
    */

    $mirrorSQL = "
        SELECT

            `MSID`,
            `PartyLedgerName`,

            `LedgerContact`,
            `LedgerMobile`,
            `LedgerPhone`,
            `EMail`,

            `Address1`,
            `Address2`,
            `Address3`,
            `Address4`,
            `Address5`,

            `PrimaryGroup`,
            `LedgerFax`,
            `MainContactNo`,

            `OwnerName`,
            `OwnerPhone`,

            `PaymentContact`,
            `PaymentContactPhone`,

            `PurchaseContact`,
            `PurchaseContactPhone`,

            `LedGroup`,
            `GSTRegistrationType`,
            `PartyGSTIN`,

            `designation`,
            `designator_name`,

            `edited_fields`,
            `edited_by`,
            `created_at`,
            `updated_at`

        FROM `ledger_mirror`

        WHERE `MSID` = ?

        LIMIT 1
    ";

    try {

        $mirrorStmt = $pdo->prepare($mirrorSQL);

        $mirrorStmt->execute([
            $MSID
        ]);

        $mirror = $mirrorStmt->fetch();

    } catch (PDOException $e) {

        sendError(
            "Failed to query ledger_mirror.",
            "ledger_mirror_query",
            $e->getMessage()
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Editable fields
    |--------------------------------------------------------------------------
    */

    $editableFields = [

        "PartyLedgerName",

        "LedgerContact",
        "LedgerMobile",
        "LedgerPhone",
        "EMail",

        "Address1",
        "Address2",
        "Address3",
        "Address4",
        "Address5",

        "PrimaryGroup",
        "LedgerFax",
        "MainContactNo",

        "OwnerName",
        "OwnerPhone",

        "PaymentContact",
        "PaymentContactPhone",

        "PurchaseContact",
        "PurchaseContactPhone",

        "LedGroup",
        "GSTRegistrationType",
        "PartyGSTIN",

        "designation",
        "designator_name"
    ];


    /*
    |--------------------------------------------------------------------------
    | Start with original data
    |--------------------------------------------------------------------------
    */

    $finalData = $original;


    /*
    |--------------------------------------------------------------------------
    | Overlay mirror changes
    |--------------------------------------------------------------------------
    */

    if ($mirror !== false) {

        foreach ($editableFields as $field) {

            if (
                array_key_exists($field, $mirror) &&
                $mirror[$field] !== null
            ) {

                $finalData[$field] = $mirror[$field];
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | Success
    |--------------------------------------------------------------------------
    */

    sendJson([

        "success" => true,

        "message" => "Party details loaded successfully",

        "MSID" => $MSID,

        "data" => $finalData,

        "original" => $original,

        "edited" => $mirror ?: null

    ]);


} catch (PDOException $e) {

    sendError(
        "Database connection error.",
        "database",
        $e->getMessage()
    );

} catch (Throwable $e) {

    sendError(
        "Server error.",
        "server",
        $e->getMessage()
    );
}

