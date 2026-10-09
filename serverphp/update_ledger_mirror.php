<?php

require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/ledger_mirror_tally.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");


/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}


/*
|--------------------------------------------------------------------------
| Database
|--------------------------------------------------------------------------
*/

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed",
        "error" => $conn->connect_error
    ]);

    exit;
}

$conn->set_charset("utf8mb4");


/*
|--------------------------------------------------------------------------
| Read JSON request
|--------------------------------------------------------------------------
*/

$input = json_decode(
    file_get_contents("php://input"),
    true
);

if (!is_array($input)) {
    $input = [];
}


/*
|--------------------------------------------------------------------------
| MSID
|--------------------------------------------------------------------------
*/

$MSID = trim(
    (string)($input["MSID"] ?? "")
);


if ($MSID === "") {

    http_response_code(400);

    echo json_encode([
        "success" => false,
        "message" => "MSID is required"
    ]);

    $conn->close();

    exit;
}


/*
|--------------------------------------------------------------------------
| User
|--------------------------------------------------------------------------
*/

$editedBy = trim(
    (string)(
        $input["edited_by"]
        ?? "React User"
    )
);

if ($editedBy === "") {
    $editedBy = "React User";
}


/*
|--------------------------------------------------------------------------
| SOURCE FIELD MAP
|--------------------------------------------------------------------------
|
| Left side:
|   Field name used by React / ledger_mirror
|
| Right side:
|   Actual column name in salesdatalatest33
|
|--------------------------------------------------------------------------
*/

$fieldMap = [

    "PartyLedgerName" =>
        "`PartyLedgerName`",

    "LedgerContact" =>
        "`Ledger.\$LedgerContact`",

    "LedgerMobile" =>
        "`Ledger.\$LedgerMobile`",

    "LedgerPhone" =>
        "`Ledger.\$LedgerPhone`",

    "EMail" =>
        "`Ledger.\$EMail`",

    "Address1" =>
        "`Ledger.\$_Address1`",

    "Address2" =>
        "`Ledger.\$_Address2`",

    "Address3" =>
        "`Ledger.\$_Address3`",

    "Address4" =>
        "`Ledger.\$_Address4`",

    "Address5" =>
        "`Ledger.\$_Address5`",

    "PrimaryGroup" =>
        "`Ledger.\$_PrimaryGroup`",

    "LedgerFax" =>
        "`Ledger.\$_LedgerFax`",

    "MainContactNo" =>
        "`Ledger.\$_Led_Main_ContactNo_Form`",

    "OwnerName" =>
        "`Ledger.\$_Led_OwnerName_Form`",

    "OwnerPhone" =>
        "`Ledger.\$_Led_OwnerPhone_Form`",

    "PaymentContact" =>
        "`Ledger.\$_Led_Payment_Contact_P_Form`",

    "PaymentContactPhone" =>
        "`Ledger.\$_Led_Payment_Contact_PHone_Form`",

    "PurchaseContact" =>
        "`Ledger.\$_Led_Purchase_Contact_P_Form`",

    "PurchaseContactPhone" =>
        "`Ledger.\$_Led_Purchase_Contact_PHone_Form`",

    "LedGroup" =>
        "`Ledger.\$_LedGroup`",

    "GSTRegistrationType" =>
        "`Ledger.\$_GSTRegistrationType`",

    "PartyGSTIN" =>
        "`Ledger.\$_PartyGSTIN`",

    "designation" =>
        "`designation`",

    "designator_name" =>
        "`designator_name`"
];


/*
|--------------------------------------------------------------------------
| Build SELECT query
|--------------------------------------------------------------------------
*/

$selectParts = [];

foreach ($fieldMap as $alias => $column) {

    $selectParts[] =
        $column . " AS `" . $alias . "`";
}

$selectSQL = implode(
    ",\n        ",
    $selectParts
);


/*
|--------------------------------------------------------------------------
| Get ORIGINAL data from salesdatalatest33
|--------------------------------------------------------------------------
|
| IMPORTANT:
| We NEVER update this table.
|
|--------------------------------------------------------------------------
*/

$sourceSQL = "
    SELECT
        $selectSQL

    FROM `salesdatalatest33`

    WHERE `Ledger.\$_EveLedMstID` = ?

    LIMIT 1
";


$sourceStmt = $conn->prepare($sourceSQL);


if (!$sourceStmt) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Failed to prepare source query",
        "error" => $conn->error
    ]);

    $conn->close();

    exit;
}


$sourceStmt->bind_param(
    "s",
    $MSID
);


if (!$sourceStmt->execute()) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Failed to execute source query",
        "error" => $sourceStmt->error
    ]);

    $sourceStmt->close();
    $conn->close();

    exit;
}


$sourceResult =
    $sourceStmt->get_result();


if ($sourceResult->num_rows === 0) {

    http_response_code(404);

    echo json_encode([
        "success" => false,
        "message" =>
            "Original ledger was not found in salesdatalatest33",
        "MSID" => $MSID
    ]);

    $sourceStmt->close();
    $conn->close();

    exit;
}


$original =
    $sourceResult->fetch_assoc();


$sourceStmt->close();


/*
|--------------------------------------------------------------------------
| Get existing ledger_mirror record
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
        `edited_by`

    FROM `ledger_mirror`

    WHERE `MSID` = ?

    LIMIT 1
";


$mirrorStmt =
    $conn->prepare($mirrorSQL);


if (!$mirrorStmt) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" =>
            "Failed to prepare ledger_mirror query",
        "error" =>
            $conn->error
    ]);

    $conn->close();

    exit;
}


$mirrorStmt->bind_param(
    "s",
    $MSID
);


if (!$mirrorStmt->execute()) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" =>
            "Failed to execute ledger_mirror query",
        "error" =>
            $mirrorStmt->error
    ]);

    $mirrorStmt->close();
    $conn->close();

    exit;
}


$mirrorResult =
    $mirrorStmt->get_result();


$existingMirror = null;


if ($mirrorResult->num_rows > 0) {

    $existingMirror =
        $mirrorResult->fetch_assoc();
}


$mirrorStmt->close();


/*
|--------------------------------------------------------------------------
| Detect CHANGED fields
|--------------------------------------------------------------------------
|
| Compare:
|
| salesdatalatest33 original
|          VS
| React submitted value
|
|--------------------------------------------------------------------------
*/

$changedFields = [];


foreach ($fieldMap as $field => $sourceColumn) {

    /*
    |--------------------------------------------------------------------------
    | Ignore fields not submitted by React
    |--------------------------------------------------------------------------
    */

    if (!array_key_exists($field, $input)) {
        continue;
    }


    $originalValue =
        trim(
            (string)(
                $original[$field]
                ?? ""
            )
        );


    $newValue =
        trim(
            (string)(
                $input[$field]
                ?? ""
            )
        );


    /*
    |--------------------------------------------------------------------------
    | Different from ORIGINAL
    |--------------------------------------------------------------------------
    */

    if ($originalValue !== $newValue) {

        $changedFields[$field] = [

            "old" =>
                $originalValue,

            "new" =>
                $newValue

        ];

    } else {

        /*
        |--------------------------------------------------------------------------
        | User changed the field BACK to original.
        |
        | This means the mirror override should be removed.
        |--------------------------------------------------------------------------
        */

        $changedFields[$field] = null;
    }
}


/*
|--------------------------------------------------------------------------
| Check whether anything was submitted
|--------------------------------------------------------------------------
*/

if (count($changedFields) === 0) {

    echo json_encode([
        "success" => true,
        "changed" => false,
        "message" => "No fields were changed"
    ]);

    $conn->close();

    exit;
}


/*
|--------------------------------------------------------------------------
| Current active mirror values
|--------------------------------------------------------------------------
*/

$mirrorValues = [];


if ($existingMirror) {

    foreach ($fieldMap as $field => $sourceColumn) {

        if (
            array_key_exists(
                $field,
                $existingMirror
            )
            &&
            $existingMirror[$field] !== null
        ) {

            $mirrorValues[$field] =
                $existingMirror[$field];
        }
    }
}


/*
|--------------------------------------------------------------------------
| Apply current changes
|--------------------------------------------------------------------------
*/

foreach (
    $changedFields
    as $field => $change
) {

    if ($change === null) {

        /*
        |--------------------------------------------------------------------------
        | Reverted to original.
        |
        | Remove the field from mirror.
        |--------------------------------------------------------------------------
        */

        unset(
            $mirrorValues[$field]
        );

    } else {

        /*
        |--------------------------------------------------------------------------
        | Store new edited value.
        |--------------------------------------------------------------------------
        */

        $mirrorValues[$field] =
            $change["new"];
    }
}


/*
|--------------------------------------------------------------------------
| Existing edit history
|--------------------------------------------------------------------------
*/

$history = [];


if (
    $existingMirror
    &&
    !empty(
        $existingMirror["edited_fields"]
    )
) {

    $decoded =
        json_decode(
            $existingMirror["edited_fields"],
            true
        );

    if (is_array($decoded)) {

        $history = $decoded;
    }
}


/*
|--------------------------------------------------------------------------
| Add current changes to history
|--------------------------------------------------------------------------
*/

foreach (
    $changedFields
    as $field => $change
) {

    if ($change === null) {

        if (
            !isset(
                $history[$field]
            )
        ) {

            $history[$field] = [];
        }


        $history[$field][] = [

            "action" =>
                "reverted",

            "value" =>
                $original[$field] ?? "",

            "edited_by" =>
                $editedBy,

            "time" =>
                date("Y-m-d H:i:s")
        ];

    } else {

        if (
            !isset(
                $history[$field]
            )
        ) {

            $history[$field] = [];
        }


        $history[$field][] = [

            "old" =>
                $change["old"],

            "new" =>
                $change["new"],

            "edited_by" =>
                $editedBy,

            "time" =>
                date("Y-m-d H:i:s")
        ];
    }
}


/*
|--------------------------------------------------------------------------
| Prepare INSERT / UPDATE
|--------------------------------------------------------------------------
*/

$columns = [
    "MSID"
];

$values = [
    $MSID
];


foreach (
    $mirrorValues
    as $field => $value
) {

    $columns[] =
        $field;

    $values[] =
        $value;
}


$columns[] =
    "edited_fields";

$values[] =
    json_encode(
        $history,
        JSON_UNESCAPED_UNICODE
    );


$columns[] =
    "edited_by";

$values[] =
    $editedBy;


/*
|--------------------------------------------------------------------------
| SQL columns
|--------------------------------------------------------------------------
*/

$escapedColumns = [];


foreach ($columns as $column) {

    $escapedColumns[] =
        "`" . $column . "`";
}


$columnSQL =
    implode(
        ", ",
        $escapedColumns
    );


/*
|--------------------------------------------------------------------------
| Placeholders
|--------------------------------------------------------------------------
*/

$placeholders =
    implode(
        ", ",
        array_fill(
            0,
            count($values),
            "?"
        )
    );


/*
|--------------------------------------------------------------------------
| ON DUPLICATE KEY UPDATE
|--------------------------------------------------------------------------
*/

$updateParts = [];


foreach ($columns as $column) {

    if ($column === "MSID") {
        continue;
    }

    $updateParts[] =
        "`$column` = VALUES(`$column`)";
}


$updateSQL =
    implode(
        ", ",
        $updateParts
    );


/*
|--------------------------------------------------------------------------
| Final query
|--------------------------------------------------------------------------
*/

$sql = "
    INSERT INTO `ledger_mirror`
        ($columnSQL)

    VALUES
        ($placeholders)

    ON DUPLICATE KEY UPDATE
        $updateSQL
";


$stmt =
    $conn->prepare($sql);


if (!$stmt) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" =>
            "Failed to prepare ledger_mirror save query",
        "error" =>
            $conn->error
    ]);

    $conn->close();

    exit;
}


/*
|--------------------------------------------------------------------------
| Bind parameters
|--------------------------------------------------------------------------
*/

$types =
    str_repeat(
        "s",
        count($values)
    );


$stmt->bind_param(
    $types,
    ...$values
);


/*
|--------------------------------------------------------------------------
| Execute
|--------------------------------------------------------------------------
*/

if (!$stmt->execute()) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" =>
            "Failed to save ledger changes",
        "error" =>
            $stmt->error
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


/*
|--------------------------------------------------------------------------
| Flag the ledger as "pending" for Tally
|--------------------------------------------------------------------------
|
| Shown on the Ledger Changes page until someone marks it as
| updated in Tally. A failure here must not undo the saved edit.
|
|--------------------------------------------------------------------------
*/

try {

    ensureLedgerMirrorTallyColumns($conn);

    $pendingStmt = $conn->prepare("
        UPDATE `ledger_mirror`
        SET `tally_pending` = 1
        WHERE `MSID` = ?
    ");

    $pendingStmt->bind_param("s", $MSID);
    $pendingStmt->execute();
    $pendingStmt->close();

} catch (Throwable $e) {
    // ignore
}


/*
|--------------------------------------------------------------------------
| Response
|--------------------------------------------------------------------------
*/

echo json_encode([

    "success" => true,

    "changed" => true,

    "message" =>
        "Ledger changes saved successfully",

    "MSID" =>
        $MSID,

    "changed_fields" =>
        $changedFields,

    "active_mirror_values" =>
        $mirrorValues

], JSON_UNESCAPED_UNICODE);


$stmt->close();
$conn->close();

?>

