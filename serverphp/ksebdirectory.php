<?php
require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed: " . $conn->connect_error
    ]);
    exit;
}


/* =========================
   KSEB DIRECTORY
========================= */

// Display KSEB directory according to display_order
$result = $conn->query("
    SELECT *
    FROM kseb_directory
    ORDER BY display_order ASC, id ASC
");

if (!$result) {
    echo json_encode([
        "status" => "error",
        "message" => "KSEB directory query failed: " . $conn->error
    ]);
    $conn->close();
    exit;
}

$data = [];

while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}


/* =========================
   KSEB TALLY LEDGERS
   From salescollection.salesdatalatest33
========================= */

$tallyLedgers = [];

$ledgerQuery = "
    SELECT DISTINCT PartyLedgerName
    FROM salescollection.salesdatalatest33
    WHERE `\$_PrimaryParentLed` = 'KSEB'
      AND PartyLedgerName IS NOT NULL
      AND PartyLedgerName <> ''
      AND PartyLedgerName LIKE 'KSEB%'
    ORDER BY PartyLedgerName
";

$ledgerResult = $conn->query($ledgerQuery);

if (!$ledgerResult) {
    echo json_encode([
        "status" => "error",
        "message" => "Tally ledger query failed: " . $conn->error
    ]);
    $conn->close();
    exit;
}

while ($row = $ledgerResult->fetch_assoc()) {

    $ledgerName = trim($row["PartyLedgerName"]);

    if ($ledgerName !== "") {
        $tallyLedgers[] = $ledgerName;
    }
}


/* =========================
   SALES PERCENTAGE PER LEDGER
   Same percentage the Sales CRM pie chart uses
   (salescollection.sales_summary_table4):
     <= 0         -> Lost Clients (no sale this year)
     > 0 and < 0.10 -> low sale this year
========================= */

$salesPercentMap = [];

$ledgerNames = $tallyLedgers;

foreach ($data as $row) {
    $name = trim($row["tally_name"] ?? "");
    if ($name !== "") {
        $ledgerNames[] = $name;
    }
}

$ledgerNames = array_values(array_unique($ledgerNames));

if (!empty($ledgerNames)) {
    $escapedNames = array_map(function ($name) use ($conn) {
        return "'" . $conn->real_escape_string($name) . "'";
    }, $ledgerNames);

    $percentResult = $conn->query("
        SELECT PartyLedgerName,
               ROUND(AVG(CAST(COALESCE(NULLIF(TRIM(percentage), ''), '0') AS DECIMAL(10,6))), 6) AS percentage
        FROM salescollection.sales_summary_table4
        WHERE PartyLedgerName IN (" . implode(",", $escapedNames) . ")
        GROUP BY PartyLedgerName
    ");

    if ($percentResult) {
        while ($row = $percentResult->fetch_assoc()) {
            // Blank / NULL percentage counts as 0 (Lost Clients),
            // same as grouped_pie.php
            $salesPercentMap[strtolower(trim($row["PartyLedgerName"]))] =
                (float) $row["percentage"];
        }
    }
}


/* =========================
   RESPONSE
========================= */

echo json_encode([
    "status" => "success",
    "data" => $data,
    "tallyLedgers" => $tallyLedgers,
    "salesPercentMap" => $salesPercentMap
]);

$conn->close();

?>