<?php
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = db_connect("tally_db");

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
    FROM " . db_name("salescollection") . ".salesdatalatest33
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
   SECURITY DEPOSIT LEDGERS
   Ledgers starting with "Security Deposit" that mention KSEB
========================= */

$securityDepositLedgers = [];

$sdLedgerQuery = "
    SELECT DISTINCT PartyLedgerName
    FROM " . db_name("salescollection") . ".salesdatalatest33
    WHERE PartyLedgerName LIKE 'Security Deposit%'
      AND PartyLedgerName LIKE '%KSEB%'
    ORDER BY PartyLedgerName
";

$sdLedgerResult = $conn->query($sdLedgerQuery);

if (!$sdLedgerResult) {
    echo json_encode([
        "status" => "error",
        "message" => "Security deposit ledger query failed: " . $conn->error
    ]);
    $conn->close();
    exit;
}

while ($row = $sdLedgerResult->fetch_assoc()) {

    $ledgerName = trim($row["PartyLedgerName"]);

    if ($ledgerName !== "") {
        $securityDepositLedgers[] = $ledgerName;
    }
}


/* =========================
   RESPONSE
========================= */

echo json_encode([
    "status" => "success",
    "data" => $data,
    "tallyLedgers" => $tallyLedgers,
    "securityDepositLedgers" => $securityDepositLedgers
]);

$conn->close();

?>