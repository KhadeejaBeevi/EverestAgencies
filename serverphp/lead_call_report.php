<?php

require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/db_connect.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);

/*
|--------------------------------------------------------------------------
| New Lead GEN - Call & Conversion Report
|--------------------------------------------------------------------------
|
| Calls       = notes saved from the New Lead GEN notes popup
|               (one note = one call), only for parties that exist in
|               newpartyledgerdetails.
| Sorry calls = rows in sorry_call for lead parties (no caller is
|               stored for these, so they are shown as a total only).
| Enquiry     = a call saved with "Enquiry: Yes".
| Quoted      = the lead has a Sales Order in salesdata dated on/after
|               the day the lead was created.
| Billed      = the lead has a GST sales invoice in salesdata dated
|               on/after the day the lead was created.
|
| A converted lead is credited to every caller who called it in the
| selected period.
|--------------------------------------------------------------------------
*/

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode([
        "success" => false,
        "message" => "Only POST requests are allowed"
    ]);
    exit();
}

$conn = db_connect('salescollection');

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed: " . $conn->connect_error
    ]);
    exit();
}

$conn->set_charset("utf8mb4");

/*
|--------------------------------------------------------------------------
| Filters
|--------------------------------------------------------------------------
*/

$input = json_decode(file_get_contents("php://input"), true);

if (!is_array($input)) {
    $input = [];
}

$from_date = trim($input["from_date"] ?? "");
$to_date   = trim($input["to_date"] ?? "");
$caller    = trim($input["caller"] ?? "all");

if ($from_date === "") {
    $from_date = date("Y-m-01");
}

if ($to_date === "") {
    $to_date = date("Y-m-d");
}

$fromObj = DateTime::createFromFormat("Y-m-d", $from_date);
$toObj   = DateTime::createFromFormat("Y-m-d", $to_date);

if (
    !$fromObj ||
    !$toObj ||
    $fromObj->format("Y-m-d") !== $from_date ||
    $toObj->format("Y-m-d") !== $to_date
) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid date format. Use YYYY-MM-DD."
    ]);
    $conn->close();
    exit();
}

if ($from_date > $to_date) {
    echo json_encode([
        "success" => false,
        "message" => "From date cannot be greater than To date."
    ]);
    $conn->close();
    exit();
}

$filterCaller = $caller !== "" && strtolower($caller) !== "all";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function partyKey($v)
{
    return strtolower(trim(preg_replace('/\s+/', ' ', (string)$v)));
}

function toDay($v)
{
    $v = trim((string)$v);

    if ($v === "") {
        return "";
    }

    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $v, $m)) {
        return $m[1];
    }

    if (preg_match('/^(\d{4})(\d{2})(\d{2})$/', $v, $m)) {
        return $m[1] . "-" . $m[2] . "-" . $m[3];
    }

    if (preg_match('/^(\d{2})[-\/.](\d{2})[-\/.](\d{4})/', $v, $m)) {
        return $m[3] . "-" . $m[2] . "-" . $m[1];
    }

    $t = strtotime($v);

    return $t === false ? "" : date("Y-m-d", $t);
}

function fail($conn, $message)
{
    echo json_encode([
        "success" => false,
        "message" => $message . ($conn->error ? ": " . $conn->error : ""),
        "error" => $conn->error
    ]);
    $conn->close();
    exit();
}

/*
|--------------------------------------------------------------------------
| Find which database holds a table
|--------------------------------------------------------------------------
|
| Tables are split between "salescollection" and "tally_db" on the live
| server, so each table is looked up in both and queried on the
| connection of the database that has it.
|--------------------------------------------------------------------------
*/

$dbConns = ["salescollection" => $conn];

function tableConn($table)
{
    global $dbConns;

    foreach (["salescollection", "tally_db"] as $key) {
        if (!isset($dbConns[$key])) {
            $c = db_connect($key);

            if ($c->connect_error) {
                $dbConns[$key] = false;
                continue;
            }

            $c->set_charset("utf8mb4");
            $dbConns[$key] = $c;
        }

        $c = $dbConns[$key];

        if (!$c) {
            continue;
        }

        $res = $c->query("SHOW TABLES LIKE '" . $c->real_escape_string($table) . "'");

        if ($res && $res->num_rows > 0) {
            return $c;
        }
    }

    return null;
}

function requireTable($table)
{
    global $conn;

    $c = tableConn($table);

    if (!$c) {
        echo json_encode([
            "success" => false,
            "message" => "Table '$table' not found in salescollection or tally_db"
        ]);
        $conn->close();
        exit();
    }

    return $c;
}

/*
|--------------------------------------------------------------------------
| 1. All New Lead GEN parties (hidden ones too - they were still called)
|--------------------------------------------------------------------------
*/

$leadConn = requireTable("newpartyledgerdetails");

$leadResult = $leadConn->query("
    SELECT id, party_ledger_name, group_name, added_by, created_at, is_hidden
    FROM newpartyledgerdetails
");

if (!$leadResult) {
    fail($leadConn, "Lead query failed");
}

$leads = [];
$newLeadsInPeriod = 0;

while ($row = $leadResult->fetch_assoc()) {
    $key = partyKey($row["party_ledger_name"]);

    if ($key === "" || isset($leads[$key])) {
        continue;
    }

    $createdDay = toDay($row["created_at"]);

    $leads[$key] = [
        "id" => (int)$row["id"],
        "party_name" => trim((string)$row["party_ledger_name"]),
        "group_name" => (string)($row["group_name"] ?? ""),
        "added_by" => (string)($row["added_by"] ?? ""),
        "created_at" => $createdDay,
        "do_not_call" => (int)($row["is_hidden"] ?? 0) === 1,
    ];

    if ($createdDay !== "" && $createdDay >= $from_date && $createdDay <= $to_date) {
        $newLeadsInPeriod++;
    }
}

/*
|--------------------------------------------------------------------------
| 2. Calls (notes) in the period
|--------------------------------------------------------------------------
*/

// Read the whole table and filter the dates in PHP, so it works whether
// `date` is a DATE column or text like "dd-mm-yyyy".
$noteConn = requireTable("notes");

$noteResult = $noteConn->query("SELECT * FROM notes");

if (!$noteResult) {
    fail($noteConn, "Notes query failed");
}

$calls = [];
$allCallers = [];

while ($row = $noteResult->fetch_assoc()) {
    $key = partyKey($row["partyLedger"] ?? "");

    if (!isset($leads[$key])) {
        continue; // Not a New Lead GEN party (e.g. Sales CRM note)
    }

    $day = toDay($row["date"] ?? "");

    if ($day === "" || $day < $from_date || $day > $to_date) {
        continue;
    }

    $name = trim((string)($row["username"] ?? ""));

    if ($name === "") {
        $name = "Unknown";
    }

    $allCallers[$name] = true;

    if ($filterCaller && strcasecmp($name, $caller) !== 0) {
        continue;
    }

    $status = trim((string)($row["followUpStatus"] ?? ""));

    $calls[] = [
        "caller" => $name,
        "party_key" => $key,
        "day" => $day,
        "status" => $status === "" ? "Open" : $status,
        "enquired" => strcasecmp(trim((string)($row["enquired"] ?? "")), "Yes") === 0,
    ];
}

$noteResult->free();

/*
|--------------------------------------------------------------------------
| 3. Sorry calls in the period (no caller stored)
|--------------------------------------------------------------------------
*/

$sorryCalls = 0;

$sorryConn = tableConn("sorry_call");

$sorryStmt = !$sorryConn ? false : $sorryConn->prepare("
    SELECT PartyLedgerName
    FROM sorry_call
    WHERE created_at >= ?
    AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
");

if ($sorryStmt) {
    $sorryStmt->bind_param("ss", $from_date, $to_date);
    $sorryStmt->execute();
    $sorryResult = $sorryStmt->get_result();

    while ($row = $sorryResult->fetch_assoc()) {
        if (isset($leads[partyKey($row["PartyLedgerName"])])) {
            $sorryCalls++;
        }
    }

    $sorryStmt->close();
}

/*
|--------------------------------------------------------------------------
| 4. Conversions from salesdata (quotations and invoices of lead parties)
|--------------------------------------------------------------------------
*/

$salesConn = requireTable("salesdata");

$salesResult = $salesConn->query("
    SELECT
        PartyLedgerName,
        VoucherNumber,
        Date,
        Amount,
        LOWER(TRIM(COALESCE(VoucherTypeName, ''))) AS vtype
    FROM salesdata
    WHERE LOWER(TRIM(COALESCE(VoucherTypeName, ''))) IN (
        'sales order',
        'gst sales b2b',
        'gst sales b2c',
        'gst service'
    )
");

if (!$salesResult) {
    fail($salesConn, "Sales query failed");
}

$conversion = [];

while ($row = $salesResult->fetch_assoc()) {
    $key = partyKey($row["PartyLedgerName"]);

    if (!isset($leads[$key])) {
        continue;
    }

    $day = toDay($row["Date"]);

    // Only business that came after the lead was generated counts.
    if ($day === "" || ($leads[$key]["created_at"] !== "" && $day < $leads[$key]["created_at"])) {
        continue;
    }

    if (!isset($conversion[$key])) {
        $conversion[$key] = [
            "quotations" => [],
            "first_quotation" => "",
            "invoices" => [],
            "first_invoice" => "",
            "billed_value" => 0.0,
        ];
    }

    $c = &$conversion[$key];
    $voucher = trim((string)$row["VoucherNumber"]);

    if ($row["vtype"] === "sales order") {
        if ($voucher !== "") {
            $c["quotations"][$voucher] = true;
        }

        if ($c["first_quotation"] === "" || $day < $c["first_quotation"]) {
            $c["first_quotation"] = $day;
        }
    } else {
        if ($voucher !== "") {
            $c["invoices"][$voucher] = true;
        }

        if ($c["first_invoice"] === "" || $day < $c["first_invoice"]) {
            $c["first_invoice"] = $day;
        }

        $c["billed_value"] += (float)($row["Amount"] ?? 0);
    }

    unset($c);
}

/*
|--------------------------------------------------------------------------
| 5. Aggregate
|--------------------------------------------------------------------------
*/

$callerStats = [];
$daily = [];
$statusCount = [];
$leadCalls = [];

foreach ($calls as $call) {
    $name = $call["caller"];
    $key = $call["party_key"];

    if (!isset($callerStats[$name])) {
        $callerStats[$name] = [
            "caller" => $name,
            "calls" => 0,
            "leads" => [],
            "enquiry_leads" => [],
            "status" => [],
            "first_call" => "",
            "last_call" => "",
        ];
    }

    $s = &$callerStats[$name];
    $s["calls"]++;
    $s["leads"][$key] = true;
    $s["status"][$call["status"]] = ($s["status"][$call["status"]] ?? 0) + 1;

    if ($call["enquired"]) {
        $s["enquiry_leads"][$key] = true;
    }

    if ($call["day"] !== "") {
        if ($s["first_call"] === "" || $call["day"] < $s["first_call"]) {
            $s["first_call"] = $call["day"];
        }

        if ($call["day"] > $s["last_call"]) {
            $s["last_call"] = $call["day"];
        }
    }

    unset($s);

    $statusCount[$call["status"]] = ($statusCount[$call["status"]] ?? 0) + 1;

    if ($call["day"] !== "") {
        if (!isset($daily[$call["day"]])) {
            $daily[$call["day"]] = ["date" => $call["day"], "calls" => 0, "enquiries" => 0];
        }

        $daily[$call["day"]]["calls"]++;

        if ($call["enquired"]) {
            $daily[$call["day"]]["enquiries"]++;
        }
    }

    if (!isset($leadCalls[$key])) {
        $leadCalls[$key] = [
            "callers" => [],
            "calls" => 0,
            "enquired" => false,
            "last_call" => "",
            "last_status" => "",
        ];
    }

    $leadCalls[$key]["callers"][$name] = true;
    $leadCalls[$key]["calls"]++;
    $leadCalls[$key]["enquired"] = $leadCalls[$key]["enquired"] || $call["enquired"];

    if ($call["day"] >= $leadCalls[$key]["last_call"]) {
        $leadCalls[$key]["last_call"] = $call["day"];
        $leadCalls[$key]["last_status"] = $call["status"];
    }
}

function rate($part, $whole)
{
    return $whole > 0 ? round($part * 100 / $whole, 1) : 0;
}

$callers = [];

foreach ($callerStats as $s) {
    $quoted = 0;
    $billed = 0;
    $billedValue = 0.0;

    foreach (array_keys($s["leads"]) as $key) {
        if (!isset($conversion[$key])) {
            continue;
        }

        if ($conversion[$key]["first_quotation"] !== "") {
            $quoted++;
        }

        if ($conversion[$key]["first_invoice"] !== "") {
            $billed++;
            $billedValue += $conversion[$key]["billed_value"];
        }
    }

    $leadsCalled = count($s["leads"]);
    $enquiries = count($s["enquiry_leads"]);
    $converted = 0;

    foreach (array_keys($s["leads"]) as $key) {
        if (isset($conversion[$key])) {
            $converted++;
        }
    }

    $callers[] = [
        "caller" => $s["caller"],
        "calls" => $s["calls"],
        "leads_called" => $leadsCalled,
        "status" => $s["status"],
        "enquiries" => $enquiries,
        "quoted" => $quoted,
        "billed" => $billed,
        "converted" => $converted,
        "billed_value" => round($billedValue, 2),
        "enquiry_rate" => rate($enquiries, $leadsCalled),
        "conversion_rate" => rate($converted, $leadsCalled),
        "first_call" => $s["first_call"],
        "last_call" => $s["last_call"],
    ];
}

usort($callers, function ($a, $b) {
    return $b["calls"] <=> $a["calls"] ?: strcasecmp($a["caller"], $b["caller"]);
});

/*
|--------------------------------------------------------------------------
| 6. Lead-level detail (every lead called in the period)
|--------------------------------------------------------------------------
*/

$leadRows = [];
$totalEnquiries = 0;
$totalQuoted = 0;
$totalBilled = 0;
$totalConverted = 0;
$totalBilledValue = 0.0;

foreach ($leadCalls as $key => $lc) {
    $lead = $leads[$key];
    $conv = $conversion[$key] ?? null;

    $quoted = $conv && $conv["first_quotation"] !== "";
    $billed = $conv && $conv["first_invoice"] !== "";

    if ($lc["enquired"]) $totalEnquiries++;
    if ($quoted) $totalQuoted++;
    if ($billed) $totalBilled++;
    if ($conv) $totalConverted++;
    if ($billed) $totalBilledValue += $conv["billed_value"];

    $stage = $billed ? "Billed" : ($quoted ? "Quoted" : ($lc["enquired"] ? "Enquiry" : "Called"));

    $leadRows[] = [
        "id" => $lead["id"],
        "party_name" => $lead["party_name"],
        "group_name" => $lead["group_name"],
        "added_by" => $lead["added_by"],
        "created_at" => $lead["created_at"],
        "do_not_call" => $lead["do_not_call"],
        "callers" => array_keys($lc["callers"]),
        "calls" => $lc["calls"],
        "last_call" => $lc["last_call"],
        "last_status" => $lc["last_status"],
        "enquired" => $lc["enquired"],
        "stage" => $stage,
        "quotations" => $conv ? count($conv["quotations"]) : 0,
        "first_quotation" => $conv["first_quotation"] ?? "",
        "invoices" => $conv ? count($conv["invoices"]) : 0,
        "first_invoice" => $conv["first_invoice"] ?? "",
        "billed_value" => $conv ? round($conv["billed_value"], 2) : 0,
    ];
}

$stageOrder = ["Billed" => 0, "Quoted" => 1, "Enquiry" => 2, "Called" => 3];

usort($leadRows, function ($a, $b) use ($stageOrder) {
    return $stageOrder[$a["stage"]] <=> $stageOrder[$b["stage"]]
        ?: strcmp($b["last_call"], $a["last_call"]);
});

ksort($daily);

$callerNames = array_keys($allCallers);
natcasesort($callerNames);

$leadsCalledTotal = count($leadCalls);

echo json_encode([
    "success" => true,
    "filters" => [
        "from_date" => $from_date,
        "to_date" => $to_date,
        "caller" => $caller,
    ],
    "summary" => [
        "total_calls" => count($calls),
        "leads_called" => $leadsCalledTotal,
        "new_leads" => $newLeadsInPeriod,
        "sorry_calls" => $filterCaller ? null : $sorryCalls,
        "enquiries" => $totalEnquiries,
        "quoted" => $totalQuoted,
        "billed" => $totalBilled,
        "converted" => $totalConverted,
        "billed_value" => round($totalBilledValue, 2),
        "enquiry_rate" => rate($totalEnquiries, $leadsCalledTotal),
        "conversion_rate" => rate($totalConverted, $leadsCalledTotal),
        "avg_calls_per_lead" => $leadsCalledTotal > 0 ? round(count($calls) / $leadsCalledTotal, 1) : 0,
    ],
    "status_breakdown" => $statusCount,
    "callers" => $callers,
    "all_callers" => array_values($callerNames),
    "daily" => array_values($daily),
    "leads" => $leadRows,
]);

$conn->close();
?>
