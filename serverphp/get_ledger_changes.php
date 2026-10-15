<?php
require_once __DIR__ . '/db_connect.php';

require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/ledger_mirror_tally.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}


/*
|--------------------------------------------------------------------------
| Lists every ledger in ledger_mirror whose edited values are still
| different from the original in salesdatalatest33, with old / new
| value of each changed field.
|
| Request (JSON, optional):
|   { "status": "pending" }   only ledgers not yet updated in Tally (default)
|   { "status": "all" }       every ledger that still differs
|--------------------------------------------------------------------------
*/

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {

    $conn = db_connect("salescollection");

    $conn->set_charset("utf8mb4");

    ensureLedgerMirrorTallyColumns($conn);

} catch (Throwable $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed",
        "error" => $e->getMessage()
    ]);

    exit;
}


$input = json_decode(
    file_get_contents("php://input"),
    true
);

if (!is_array($input)) {
    $input = [];
}

$status = ($input["status"] ?? "pending") === "all"
    ? "all"
    : "pending";


/*
|--------------------------------------------------------------------------
| Field map: ledger_mirror field => salesdatalatest33 column
|--------------------------------------------------------------------------
*/

$fieldMap = [
    "PartyLedgerName"      => "`PartyLedgerName`",
    "LedgerContact"        => "`Ledger.\$LedgerContact`",
    "LedgerMobile"         => "`Ledger.\$LedgerMobile`",
    "LedgerPhone"          => "`Ledger.\$LedgerPhone`",
    "EMail"                => "`Ledger.\$EMail`",
    "Address1"             => "`Ledger.\$_Address1`",
    "Address2"             => "`Ledger.\$_Address2`",
    "Address3"             => "`Ledger.\$_Address3`",
    "Address4"             => "`Ledger.\$_Address4`",
    "Address5"             => "`Ledger.\$_Address5`",
    "PrimaryGroup"         => "`Ledger.\$_PrimaryGroup`",
    "LedgerFax"            => "`Ledger.\$_LedgerFax`",
    "MainContactNo"        => "`Ledger.\$_Led_Main_ContactNo_Form`",
    "OwnerName"            => "`Ledger.\$_Led_OwnerName_Form`",
    "OwnerPhone"           => "`Ledger.\$_Led_OwnerPhone_Form`",
    "PaymentContact"       => "`Ledger.\$_Led_Payment_Contact_P_Form`",
    "PaymentContactPhone"  => "`Ledger.\$_Led_Payment_Contact_PHone_Form`",
    "PurchaseContact"      => "`Ledger.\$_Led_Purchase_Contact_P_Form`",
    "PurchaseContactPhone" => "`Ledger.\$_Led_Purchase_Contact_PHone_Form`",
    "LedGroup"             => "`Ledger.\$_LedGroup`",
    "GSTRegistrationType"  => "`Ledger.\$_GSTRegistrationType`",
    "PartyGSTIN"           => "`Ledger.\$_PartyGSTIN`",
    "designation"          => "`designation`",
    "designator_name"      => "`designator_name`"
];

$fields = array_keys($fieldMap);


try {

    /*
    |--------------------------------------------------------------------------
    | Mirror rows
    |--------------------------------------------------------------------------
    */

    $mirrorColumns = [];

    foreach ($fields as $field) {
        $mirrorColumns[] = "`$field`";
    }

    $mirrorSQL = "
        SELECT
            `MSID`,
            " . implode(", ", $mirrorColumns) . ",
            `edited_fields`,
            `edited_by`,
            `updated_at`,
            `tally_pending`,
            `tally_synced_at`,
            `tally_synced_by`
        FROM `ledger_mirror`
        " . ($status === "pending" ? "WHERE `tally_pending` = 1" : "") . "
        ORDER BY `updated_at` DESC
    ";

    $mirrorRows = $conn
        ->query($mirrorSQL)
        ->fetch_all(MYSQLI_ASSOC);


    /*
    |--------------------------------------------------------------------------
    | Original values (one row per MSID)
    |--------------------------------------------------------------------------
    */

    $selectParts = [];

    foreach ($fieldMap as $alias => $column) {
        $selectParts[] = "$column AS `$alias`";
    }

    $sourceStmt = $conn->prepare("
        SELECT " . implode(", ", $selectParts) . "
        FROM `salesdatalatest33`
        WHERE `Ledger.\$_EveLedMstID` = ?
        LIMIT 1
    ");

    $ledgers = [];

    foreach ($mirrorRows as $mirror) {

        $MSID = (string)$mirror["MSID"];

        $sourceStmt->bind_param("s", $MSID);
        $sourceStmt->execute();

        $original = $sourceStmt
            ->get_result()
            ->fetch_assoc();

        if (!$original) {
            $original = array_fill_keys($fields, "");
        }

        $current = [];
        $changes = [];

        foreach ($fields as $field) {

            $oldValue = trim((string)($original[$field] ?? ""));

            $current[$field] = $oldValue;

            if ($mirror[$field] === null) {
                continue;
            }

            $newValue = trim((string)$mirror[$field]);

            $current[$field] = $newValue;

            if ($oldValue !== $newValue) {

                $changes[$field] = [
                    "old" => $oldValue,
                    "new" => $newValue
                ];
            }
        }

        /*
        |--------------------------------------------------------------------------
        | Nothing differs any more (e.g. Tally data was re-imported
        | with the new values) -> nothing to show.
        |--------------------------------------------------------------------------
        */

        if (count($changes) === 0) {
            continue;
        }

        $history = json_decode(
            (string)($mirror["edited_fields"] ?? ""),
            true
        );

        $ledgers[] = [
            "MSID" => $MSID,
            "OriginalName" => trim((string)($original["PartyLedgerName"] ?? "")),
            "original" => $original,
            "current" => $current,
            "changes" => $changes,
            "history" => is_array($history) ? $history : [],
            "edited_by" => $mirror["edited_by"],
            "updated_at" => $mirror["updated_at"],
            "tally_pending" => (int)$mirror["tally_pending"] === 1,
            "tally_synced_at" => $mirror["tally_synced_at"],
            "tally_synced_by" => $mirror["tally_synced_by"]
        ];
    }

    $sourceStmt->close();

    echo json_encode([
        "success" => true,
        "status" => $status,
        "count" => count($ledgers),
        "fields" => $fields,
        "ledgers" => $ledgers
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Failed to load ledger changes",
        "error" => $e->getMessage()
    ]);
}

$conn->close();

?>
