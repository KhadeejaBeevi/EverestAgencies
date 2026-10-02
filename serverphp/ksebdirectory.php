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
   RESPONSE
========================= */

echo json_encode([
    "status" => "success",
    "data" => $data,
    "tallyLedgers" => $tallyLedgers
]);

$conn->close();

?>