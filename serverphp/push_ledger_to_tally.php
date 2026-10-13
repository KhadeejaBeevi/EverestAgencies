<?php

require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/ledger_tally_common.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('max_execution_time', 300);


/*
|--------------------------------------------------------------------------
| Insert ledger_mirror edits directly into Tally
|--------------------------------------------------------------------------
|
| Replaces the "export to Excel and re-enter in Tally" step.
|
| The selected ledgers are sent to Tally together in ONE
| "Import Data / All Masters" XML request, one <TALLYMESSAGE> per
| ledger, with ACTION="Alter" and ALL its fields (new values where
| edited, Tally's own values elsewhere).
|
| Request (POST JSON):
|
|   {
|     "MSIDs": ["123", "456"],   // optional, default = all tally_pending
|     "mode":  "push"            // "push" (send to Tally) or "xml"
|   }
|
| mode "xml" sends nothing: it returns the XML so it can be downloaded
| and imported in Tally manually (Import > Masters).
|
| A ledger is marked as no longer pending only when Tally reports it
| as altered with no errors.
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

$mode = ($input["mode"] ?? "push") === "xml" ? "xml" : "push";

$mirrorRows = loadMirrorRows($conn, requestedMsids($input));

$originalStmt = prepareOriginalQuery($conn, $ledgerFields);

$markDone = $conn->prepare(
    "UPDATE `ledger_mirror`
     SET `tally_pending` = 0, `tally_pushed_at` = NOW(), `tally_error` = NULL
     WHERE `MSID` = ?"
);

$markError = $conn->prepare(
    "UPDATE `ledger_mirror`
     SET `tally_error` = ?
     WHERE `MSID` = ?"
);


/*
| A ledger stays pending while it has edits Tally could not take,
| so they still show up for manual entry in Tally.
*/
$markPushed = function ($msid, array $notSent) use ($markDone, $markError) {

    if (count($notSent) === 0) {
        $markDone->bind_param("s", $msid);
        $markDone->execute();
        return;
    }

    $note = "Not sent to Tally (no Tally field mapped): " . implode(", ", $notSent);

    $markError->bind_param("ss", $note, $msid);
    $markError->execute();
};


$results = [];
$ledgerXmls = [];

// Ledgers going into the single Tally request: index in $results => info
$queue = [];

foreach ($mirrorRows as $mirror) {

    $msid = (string)$mirror["MSID"];

    $original = loadOriginal($originalStmt, $msid);

    if (!$original) {
        $results[] = [
            "MSID" => $msid,
            "PartyLedgerName" => $mirror["PartyLedgerName"] ?? "",
            "status" => "error",
            "message" => "Original ledger not found in salesdatalatest33",
        ];
        continue;
    }

    $fieldRows = buildFieldRows($mirror, $original, $ledgerFields, $tallyUdfMap);

    $changed = [];
    $notSent = [];
    $toSend = 0;

    foreach ($fieldRows as $key => $row) {
        if (!$row["changed"]) {
            continue;
        }

        $changed[] = $key;

        if ($row["sent_to_tally"]) {
            $toSend++;
        } elseif (!$row["app_only"]) {
            // A Tally field with no UDF name mapped yet.
            $notSent[] = $row["label"];
        }
    }

    $result = [
        "MSID" => $msid,
        "PartyLedgerName" => $fieldRows["PartyLedgerName"]["tally_value"],
        "changed_fields" => $changed,
        "skipped_fields" => $notSent,
    ];

    /*
    | Nothing Tally can take. App-only edits (designation etc.) never
    | go to Tally, so such a ledger is cleared from pending.
    */
    if ($toSend === 0) {

        $result["status"] = "nothing_to_send";
        $result["message"] = count($notSent) > 0
            ? "These fields have no Tally field mapped yet"
            : (count($changed) > 0
                ? "Only app fields changed (not stored in Tally); cleared from pending"
                : "No differences from Tally data");

        if ($mode === "push") {
            $markPushed($msid, $notSent);
        }

        $results[] = $result;
        continue;
    }

    $ledgerXml = buildLedgerXml($fieldRows, $ledgerFields, $tallyUdfMap);

    $ledgerXmls[] = $ledgerXml;

    if ($mode === "xml") {
        $result["status"] = "ready";
        $results[] = $result;
        continue;
    }

    $queue[count($results)] = [
        "msid" => $msid,
        "notSent" => $notSent,
        "names" => array_unique(array_filter([
            $fieldRows["PartyLedgerName"]["tally_value"],
            $fieldRows["PartyLedgerName"]["new_value"],
        ])),
    ];

    $result["status"] = "queued";
    $results[] = $result;
}


/*
|--------------------------------------------------------------------------
| Send all selected ledgers in ONE request
|--------------------------------------------------------------------------
|
| Tally only returns totals for the whole request, plus a LINEERROR
| text per rejected master. When something fails, each error is matched
| to a ledger by its name; if every failure can be matched, the others
| are marked as updated. Otherwise none are marked, so nothing is
| wrongly cleared (re-sending is safe: ACTION="Alter" just applies the
| same values again).
|
|--------------------------------------------------------------------------
*/

if ($mode === "push" && count($queue) > 0) {

    $tally = sendToTally($tallyUrl, buildEnvelope($ledgerXmls, $tallyCompany));

    $failed = [];      // index => error message
    $attributed = true;

    if (!$tally["ok"]) {

        foreach ($tally["line_errors"] as $lineError) {

            $matched = false;

            foreach ($queue as $idx => $q) {
                foreach ($q["names"] as $name) {
                    if (mb_stripos($lineError, $name) !== false) {
                        $failed[$idx] = isset($failed[$idx])
                            ? $failed[$idx] . "; " . $lineError
                            : $lineError;
                        $matched = true;
                        break 2;
                    }
                }
            }

            if (!$matched) {
                $attributed = false;
            }
        }

        $okCount = $tally["created"] + $tally["altered"];

        if (
            count($tally["line_errors"]) === 0
            || !$attributed
            || $okCount !== count($queue) - count($failed)
        ) {
            // Cannot tell which ledgers went in: keep them all pending.
            $failed = [];

            foreach ($queue as $idx => $q) {
                $failed[$idx] = $tally["error"]
                    . " (Tally altered $okCount of " . count($queue)
                    . " in this request; still marked pending, sending again is safe)";
            }
        }
    }

    foreach ($queue as $idx => $q) {

        if (isset($failed[$idx])) {

            $markError->bind_param("ss", $failed[$idx], $q["msid"]);
            $markError->execute();

            $results[$idx]["status"] = "error";
            $results[$idx]["message"] = $failed[$idx];
            $results[$idx]["tally_response"] = $tally["raw"];

        } else {

            $markPushed($q["msid"], $q["notSent"]);

            $results[$idx]["status"] = "updated";
            $results[$idx]["message"] = "Updated in Tally";
        }
    }
}

$originalStmt->close();
$markDone->close();
$markError->close();
$conn->close();


$summary = [
    "total" => count($results),
    "updated" => 0,
    "ready" => 0,
    "errors" => 0,
    "nothing_to_send" => 0,
];

foreach ($results as $r) {
    if ($r["status"] === "updated") $summary["updated"]++;
    if ($r["status"] === "ready") $summary["ready"]++;
    if ($r["status"] === "error") $summary["errors"]++;
    if ($r["status"] === "nothing_to_send") $summary["nothing_to_send"]++;
}

$response = [
    "success" => $summary["errors"] === 0,
    "mode" => $mode,
    "tally_requests" => ($mode === "push" && count($queue) > 0) ? 1 : 0,
    "summary" => $summary,
    "results" => $results,
];

if ($mode === "xml") {
    $response["xml"] = count($ledgerXmls) > 0
        ? buildEnvelope($ledgerXmls, $tallyCompany)
        : "";
}

sendJson($response);
