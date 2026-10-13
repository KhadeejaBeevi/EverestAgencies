<?php

/*
|--------------------------------------------------------------------------
| Shared code for sending ledger_mirror edits into Tally
|--------------------------------------------------------------------------
|
| Used by:
|   get_ledger_changes_tally.php   (list + popup data)
|   push_ledger_to_tally.php       (XML build + send)
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| Tally settings
|--------------------------------------------------------------------------
|
| TALLY_URL      Tally HTTP server (Help > Settings > Connectivity).
| TALLY_COMPANY  Company name exactly as in Tally. Leave empty to use
|                the company currently open in Tally.
|
|--------------------------------------------------------------------------
*/

$tallyUrl = getenv("TALLY_URL") ?: "http://117.221.70.147:14151";
$tallyCompany = getenv("TALLY_COMPANY") ?: "";


/*
|--------------------------------------------------------------------------
| All ledger fields, in popup order
|--------------------------------------------------------------------------
|
| label   shown in the popup
| source  column in salesdatalatest33 (the values Tally holds today)
| tally   Tally ledger tag, or:
|           "NAME"    ledger name (NAME / LANGUAGENAME.LIST)
|           "ADDRESS" one line of ADDRESS.LIST
|           "UDF"     custom TDL field, see $tallyUdfMap
|           null      only kept in this app, never sent to Tally
|
|--------------------------------------------------------------------------
*/

$ledgerFields = [
    "PartyLedgerName"      => ["label" => "Party Name",             "source" => "`PartyLedgerName`",                              "tally" => "NAME"],
    "LedGroup"             => ["label" => "Group (Under)",          "source" => "`Ledger.\$_LedGroup`",                           "tally" => "PARENT"],
    "PrimaryGroup"         => ["label" => "Primary Group",          "source" => "`Ledger.\$_PrimaryGroup`",                       "tally" => null],
    "Address1"             => ["label" => "Address Line 1",         "source" => "`Ledger.\$_Address1`",                           "tally" => "ADDRESS"],
    "Address2"             => ["label" => "Address Line 2",         "source" => "`Ledger.\$_Address2`",                           "tally" => "ADDRESS"],
    "Address3"             => ["label" => "Address Line 3",         "source" => "`Ledger.\$_Address3`",                           "tally" => "ADDRESS"],
    "Address4"             => ["label" => "Address Line 4",         "source" => "`Ledger.\$_Address4`",                           "tally" => "ADDRESS"],
    "Address5"             => ["label" => "Address Line 5",         "source" => "`Ledger.\$_Address5`",                           "tally" => "ADDRESS"],
    "LedgerContact"        => ["label" => "Contact Person",         "source" => "`Ledger.\$LedgerContact`",                       "tally" => "LEDGERCONTACT"],
    "LedgerMobile"         => ["label" => "Mobile",                 "source" => "`Ledger.\$LedgerMobile`",                        "tally" => "LEDGERMOBILE"],
    "LedgerPhone"          => ["label" => "Phone",                  "source" => "`Ledger.\$LedgerPhone`",                         "tally" => "LEDGERPHONE"],
    "LedgerFax"            => ["label" => "Fax",                    "source" => "`Ledger.\$_LedgerFax`",                          "tally" => "LEDGERFAX"],
    "EMail"                => ["label" => "Email",                  "source" => "`Ledger.\$EMail`",                               "tally" => "EMAIL"],
    "GSTRegistrationType"  => ["label" => "GST Registration Type",  "source" => "`Ledger.\$_GSTRegistrationType`",                "tally" => "GSTREGISTRATIONTYPE"],
    "PartyGSTIN"           => ["label" => "GSTIN",                  "source" => "`Ledger.\$_PartyGSTIN`",                         "tally" => "PARTYGSTIN"],
    "MainContactNo"        => ["label" => "Main Contact No",        "source" => "`Ledger.\$_Led_Main_ContactNo_Form`",            "tally" => "UDF"],
    "OwnerName"            => ["label" => "Owner Name",             "source" => "`Ledger.\$_Led_OwnerName_Form`",                 "tally" => "UDF"],
    "OwnerPhone"           => ["label" => "Owner Phone",            "source" => "`Ledger.\$_Led_OwnerPhone_Form`",                "tally" => "UDF"],
    "PaymentContact"       => ["label" => "Payment Contact Person", "source" => "`Ledger.\$_Led_Payment_Contact_P_Form`",         "tally" => "UDF"],
    "PaymentContactPhone"  => ["label" => "Payment Contact Phone",  "source" => "`Ledger.\$_Led_Payment_Contact_PHone_Form`",     "tally" => "UDF"],
    "PurchaseContact"      => ["label" => "Purchase Contact Person","source" => "`Ledger.\$_Led_Purchase_Contact_P_Form`",        "tally" => "UDF"],
    "PurchaseContactPhone" => ["label" => "Purchase Contact Phone", "source" => "`Ledger.\$_Led_Purchase_Contact_PHone_Form`",    "tally" => "UDF"],
    "designation"          => ["label" => "Designation",            "source" => "`designation`",                                  "tally" => null],
    "designator_name"      => ["label" => "Designator Name",        "source" => "`designator_name`",                              "tally" => null],
];


/*
|--------------------------------------------------------------------------
| Custom TDL fields -> Tally UDF name
|--------------------------------------------------------------------------
|
| These come from your TDL customisation, so their Tally names are
| specific to it. Fill in the UDF name (as in the TDL "[System: UDF]"
| definition) to send the field, e.g.
|
|   "OwnerName" => "LedOwnerNameForm",
|
| Fields left as null are not sent to Tally.
|
|--------------------------------------------------------------------------
*/

$tallyUdfMap = [
    "MainContactNo"        => null,
    "OwnerName"            => null,
    "OwnerPhone"           => null,
    "PaymentContact"       => null,
    "PaymentContactPhone"  => null,
    "PurchaseContact"      => null,
    "PurchaseContactPhone" => null,
];


function sendJson($data, $status = 200)
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function xmlEscape($value)
{
    return htmlspecialchars(
        (string)$value,
        ENT_XML1 | ENT_QUOTES,
        "UTF-8"
    );
}

function openLedgerDb()
{
    $conn = new mysqli("localhost", "root", "", "salescollection");

    if ($conn->connect_error) {
        sendJson([
            "success" => false,
            "message" => "Database connection failed",
            "error" => $conn->connect_error
        ], 500);
    }

    $conn->set_charset("utf8mb4");

    ensureTallyPushColumns($conn);

    return $conn;
}

function ensureTallyPushColumns(mysqli $conn)
{
    $columns = [
        "tally_pending"   => "TINYINT(1) NOT NULL DEFAULT 0",
        "tally_pushed_at" => "DATETIME NULL",
        "tally_error"     => "TEXT NULL",
    ];

    foreach ($columns as $name => $definition) {

        $check = $conn->query(
            "SHOW COLUMNS FROM `ledger_mirror` LIKE '" . $conn->real_escape_string($name) . "'"
        );

        if ($check && $check->num_rows === 0) {
            $conn->query(
                "ALTER TABLE `ledger_mirror` ADD COLUMN `$name` $definition"
            );
        }
    }
}


/*
|--------------------------------------------------------------------------
| ledger_mirror rows: the given MSIDs, or every pending one
|--------------------------------------------------------------------------
*/

function loadMirrorRows(mysqli $conn, array $msids, $includeDone = false)
{
    if (count($msids) > 0) {

        $placeholders = implode(", ", array_fill(0, count($msids), "?"));

        $stmt = $conn->prepare("SELECT * FROM `ledger_mirror` WHERE `MSID` IN ($placeholders)");
        $stmt->bind_param(str_repeat("s", count($msids)), ...$msids);

    } elseif ($includeDone) {

        $stmt = $conn->prepare("SELECT * FROM `ledger_mirror`");

    } else {

        $stmt = $conn->prepare("SELECT * FROM `ledger_mirror` WHERE `tally_pending` = 1");
    }

    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    return $rows;
}


/*
|--------------------------------------------------------------------------
| Original (Tally) values for one MSID from salesdatalatest33
|--------------------------------------------------------------------------
*/

function prepareOriginalQuery(mysqli $conn, array $ledgerFields)
{
    $selectParts = [];

    foreach ($ledgerFields as $key => $def) {
        $selectParts[] = $def["source"] . " AS `" . $key . "`";
    }

    return $conn->prepare(
        "SELECT " . implode(", ", $selectParts) . "
         FROM `salesdatalatest33`
         WHERE `Ledger.\$_EveLedMstID` = ?
         LIMIT 1"
    );
}

function loadOriginal(mysqli_stmt $stmt, $msid)
{
    $stmt->bind_param("s", $msid);
    $stmt->execute();

    return $stmt->get_result()->fetch_assoc() ?: null;
}


/*
|--------------------------------------------------------------------------
| Every field of a ledger: Tally value, new value, changed or not
|--------------------------------------------------------------------------
|
| The new value is the ledger_mirror edit when there is one, otherwise
| the value Tally already has.
|
|--------------------------------------------------------------------------
*/

function buildFieldRows(array $mirror, array $original, array $ledgerFields, array $tallyUdfMap)
{
    $rows = [];

    foreach ($ledgerFields as $key => $def) {

        $old = trim((string)($original[$key] ?? ""));

        $hasEdit = array_key_exists($key, $mirror) && $mirror[$key] !== null;

        $new = $hasEdit ? trim((string)$mirror[$key]) : $old;

        $tally = $def["tally"];

        $sendable = $tally !== null
            && ($tally !== "UDF" || !empty($tallyUdfMap[$key]));

        $rows[$key] = [
            "key" => $key,
            "label" => $def["label"],
            "tally_value" => $old,
            "new_value" => $new,
            "changed" => $new !== $old,
            "sent_to_tally" => $sendable,
            "app_only" => $tally === null,
        ];
    }

    return $rows;
}


/*
|--------------------------------------------------------------------------
| Build the full <LEDGER> element
|--------------------------------------------------------------------------
|
| Every Tally field is sent with its new value, so the ledger in Tally
| ends up exactly as shown in the popup. ACTION="Alter" updates the
| existing ledger (NAME is its current name in Tally).
|
|--------------------------------------------------------------------------
*/

function buildLedgerXml(array $fieldRows, array $ledgerFields, array $tallyUdfMap)
{
    $currentName = $fieldRows["PartyLedgerName"]["tally_value"];
    $newName = $fieldRows["PartyLedgerName"]["new_value"];

    if ($newName === "") {
        $newName = $currentName;
    }

    $lines = [];

    $lines[] = '<LEDGER NAME="' . xmlEscape($currentName) . '" RESERVEDNAME="" ACTION="Alter">';


    /*
    | Address: Tally replaces the whole list.
    */
    $address = [];

    foreach ($ledgerFields as $key => $def) {
        if ($def["tally"] === "ADDRESS") {
            $address[] = $fieldRows[$key]["new_value"];
        }
    }

    while (count($address) > 0 && end($address) === "") {
        array_pop($address);
    }

    $lines[] = '<ADDRESS.LIST TYPE="String">';

    foreach ($address as $value) {
        $lines[] = '<ADDRESS>' . xmlEscape($value) . '</ADDRESS>';
    }

    $lines[] = '</ADDRESS.LIST>';

    // Mailing name follows a rename; otherwise Tally keeps its own.
    if ($newName !== $currentName) {
        $lines[] = '<MAILINGNAME.LIST TYPE="String">';
        $lines[] = '<MAILINGNAME>' . xmlEscape($newName) . '</MAILINGNAME>';
        $lines[] = '</MAILINGNAME.LIST>';
    }


    foreach ($ledgerFields as $key => $def) {

        $tag = $def["tally"];

        if ($tag === null || in_array($tag, ["NAME", "ADDRESS", "UDF"], true)) {
            continue;
        }

        $value = $fieldRows[$key]["new_value"];

        // A ledger must stay under a group.
        if ($tag === "PARENT" && $value === "") {
            continue;
        }

        $lines[] = "<$tag>" . xmlEscape($value) . "</$tag>";
    }


    foreach ($tallyUdfMap as $key => $udfName) {

        if (!$udfName || !isset($fieldRows[$key])) {
            continue;
        }

        $tag = "UDF:" . strtoupper($udfName);
        $desc = xmlEscape("`" . $udfName . "`");

        $lines[] = "<$tag.LIST DESC=\"$desc\" ISLIST=\"YES\" TYPE=\"String\">";
        $lines[] = "<$tag DESC=\"$desc\">" . xmlEscape($fieldRows[$key]["new_value"]) . "</$tag>";
        $lines[] = "</$tag.LIST>";
    }


    $lines[] = '<LANGUAGENAME.LIST>';
    $lines[] = '<NAME.LIST TYPE="String">';
    $lines[] = '<NAME>' . xmlEscape($newName) . '</NAME>';
    $lines[] = '</NAME.LIST>';
    $lines[] = '<LANGUAGEID> 1033</LANGUAGEID>';
    $lines[] = '</LANGUAGENAME.LIST>';

    $lines[] = '</LEDGER>';

    return implode("\n", $lines);
}


function buildEnvelope(array $ledgerXmls, $company)
{
    $staticVariables = $company !== ""
        ? "<STATICVARIABLES>\n<SVCURRENTCOMPANY>" . xmlEscape($company) . "</SVCURRENTCOMPANY>\n</STATICVARIABLES>\n"
        : "";

    $messages = "";

    foreach ($ledgerXmls as $ledgerXml) {
        $messages .= "<TALLYMESSAGE xmlns:UDF=\"TallyUDF\">\n" . $ledgerXml . "\n</TALLYMESSAGE>\n";
    }

    return "<ENVELOPE>\n"
        . "<HEADER>\n<TALLYREQUEST>Import Data</TALLYREQUEST>\n</HEADER>\n"
        . "<BODY>\n<IMPORTDATA>\n"
        . "<REQUESTDESC>\n<REPORTNAME>All Masters</REPORTNAME>\n" . $staticVariables . "</REQUESTDESC>\n"
        . "<REQUESTDATA>\n" . $messages . "</REQUESTDATA>\n"
        . "</IMPORTDATA>\n</BODY>\n"
        . "</ENVELOPE>";
}


/*
|--------------------------------------------------------------------------
| Send XML to Tally and read the import result
|--------------------------------------------------------------------------
|
| Tally answers with <CREATED>, <ALTERED>, <ERRORS> counts and a
| <LINEERROR> message for each rejected master.
|
|--------------------------------------------------------------------------
*/

function sendToTally($url, $xml)
{
    $ch = curl_init($url);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $xml,
        CURLOPT_HTTPHEADER => [
            "Content-Type: text/xml; charset=utf-8",
            "Expect:"
        ],
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 120,
    ]);

    $response = curl_exec($ch);
    $errorNo = curl_errno($ch);
    $errorMsg = curl_error($ch);
    curl_close($ch);

    if ($errorNo) {
        return [
            "ok" => false,
            "error" => "Could not reach Tally at $url: $errorMsg",
            "created" => 0,
            "altered" => 0,
            "line_errors" => [],
            "raw" => "",
        ];
    }

    $response = (string)$response;

    $count = function ($tag) use ($response) {
        return preg_match("/<$tag>\s*(-?\d+)\s*<\/$tag>/i", $response, $m)
            ? (int)$m[1]
            : 0;
    };

    preg_match_all("/<LINEERROR>(.*?)<\/LINEERROR>/is", $response, $lineErrors);

    $lineErrors = array_values(array_filter(array_map(
        function ($e) {
            return trim(html_entity_decode(strip_tags($e), ENT_QUOTES | ENT_XML1, "UTF-8"));
        },
        $lineErrors[1]
    )));

    $created = $count("CREATED");
    $altered = $count("ALTERED");
    $errors = $count("ERRORS");
    $exceptions = $count("EXCEPTIONS");

    $ok = ($created + $altered) > 0
        && $errors === 0
        && $exceptions === 0
        && count($lineErrors) === 0;

    $error = null;

    if (!$ok) {
        if (count($lineErrors) > 0) {
            $error = implode("; ", $lineErrors);
        } elseif (trim($response) === "") {
            $error = "Empty response from Tally";
        } elseif ($exceptions > 0) {
            $error = "Tally reported an exception. Check the field values and the Tally company.";
        } else {
            $error = "Tally did not alter the ledger. Check that it exists with this name in the open company.";
        }
    }

    return [
        "ok" => $ok,
        "created" => $created,
        "altered" => $altered,
        "errors" => $errors,
        "exceptions" => $exceptions,
        "error" => $error,
        "line_errors" => $lineErrors,
        "raw" => mb_substr($response, 0, 2000),
    ];
}


/*
|--------------------------------------------------------------------------
| Requested MSIDs from the JSON body
|--------------------------------------------------------------------------
*/

function requestedMsids(array $input)
{
    $msids = [];

    if (isset($input["MSIDs"]) && is_array($input["MSIDs"])) {
        foreach ($input["MSIDs"] as $id) {
            $id = trim((string)$id);
            if ($id !== "") {
                $msids[] = $id;
            }
        }
    }

    return $msids;
}
