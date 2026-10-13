<?php

require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/ledger_tally_common.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");

error_reporting(E_ALL);
ini_set('display_errors', 0);


/*
|--------------------------------------------------------------------------
| Edited ledgers for the Ledger Changes page
|--------------------------------------------------------------------------
|
| Request (POST JSON, all optional):
|
|   {
|     "include_done": false,   // true = also ledgers already in Tally
|     "MSIDs": ["123"]         // only these ledgers
|   }
|
| Each ledger comes with ALL its fields (Tally value, new value,
| changed flag) for the popup, plus the XML that would be sent.
|
|--------------------------------------------------------------------------
*/

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}


$conn = openLedgerDb();

$input = json_decode(file_get_contents("php://input"), true);

if (!is_array($input)) {
    $input = [];
}

$mirrorRows = loadMirrorRows(
    $conn,
    requestedMsids($input),
    !empty($input["include_done"])
);

$originalStmt = prepareOriginalQuery($conn, $ledgerFields);

$ledgers = [];

foreach ($mirrorRows as $mirror) {

    $msid = (string)$mirror["MSID"];

    $original = loadOriginal($originalStmt, $msid);

    if (!$original) {
        $ledgers[] = [
            "MSID" => $msid,
            "PartyLedgerName" => $mirror["PartyLedgerName"] ?? "",
            "found" => false,
            "fields" => [],
            "changed_count" => 0,
            "edited_by" => $mirror["edited_by"] ?? "",
            "tally_pending" => (int)($mirror["tally_pending"] ?? 0) === 1,
            "tally_pushed_at" => $mirror["tally_pushed_at"] ?? null,
            "tally_error" => "Original ledger not found in salesdatalatest33",
            "xml" => "",
        ];
        continue;
    }

    $fieldRows = buildFieldRows($mirror, $original, $ledgerFields, $tallyUdfMap);

    $changedCount = 0;

    foreach ($fieldRows as $row) {
        if ($row["changed"]) {
            $changedCount++;
        }
    }

    $ledgers[] = [
        "MSID" => $msid,
        "PartyLedgerName" => $fieldRows["PartyLedgerName"]["tally_value"],
        "found" => true,
        "fields" => array_values($fieldRows),
        "changed_count" => $changedCount,
        "edited_by" => $mirror["edited_by"] ?? "",
        "tally_pending" => (int)($mirror["tally_pending"] ?? 0) === 1,
        "tally_pushed_at" => $mirror["tally_pushed_at"] ?? null,
        "tally_error" => $mirror["tally_error"] ?? null,
        "xml" => buildEnvelope(
            [buildLedgerXml($fieldRows, $ledgerFields, $tallyUdfMap)],
            $tallyCompany
        ),
    ];
}

$originalStmt->close();
$conn->close();

usort($ledgers, function ($a, $b) {
    return strcasecmp($a["PartyLedgerName"], $b["PartyLedgerName"]);
});

sendJson([
    "success" => true,
    "ledgers" => $ledgers,
]);
