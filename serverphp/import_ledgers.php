<?php

// =====================================================
// RUNTIME SETTINGS
// 13,000+ ledgers is too much for PHP's default
// 128M / 30 second limits, so raise them and show
// any error instead of a blank page.
// =====================================================

ini_set('display_errors', 1);
error_reporting(E_ALL);
ini_set('memory_limit', '1024M');
set_time_limit(0);

register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        echo "<br><b style='color:red'>Import stopped:</b> "
           . htmlspecialchars($error['message'])
           . " (" . htmlspecialchars(basename($error['file'])) . ":" . $error['line'] . ")";
    }
});

// Report MySQL errors through ->error instead of exceptions
mysqli_report(MYSQLI_REPORT_OFF);

$autoload = __DIR__ . '/../vendor/autoload.php';

if (!file_exists($autoload)) {
    die("vendor/autoload.php not found. Run <b>composer install</b> in the project folder.");
}

require_once $autoload;

use PhpOffice\PhpSpreadsheet\IOFactory;

// =====================================================
// DATABASE CONNECTION
// =====================================================

if (file_exists(__DIR__ . '/db_connect.php')) {
    require_once __DIR__ . '/db_connect.php';
    $conn = db_connect("salescollection");
} else {
    $conn = new mysqli("localhost", "root", "", "salescollection");
}

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$conn->set_charset("utf8mb4");

// =====================================================
// EXCEL FILE
// =====================================================

// Updated Excel file name
$file = __DIR__ . "/EverestCRMLedgers.xlsx";

if (!file_exists($file)) {
    die("Excel file not found:<br>" . htmlspecialchars($file));
}

// =====================================================
// LOAD EXCEL
// Values only (no styles) to keep memory low.
// =====================================================

try {
    $reader = IOFactory::createReaderForFile($file);
    $reader->setReadDataOnly(true);
    $spreadsheet = $reader->load($file);
} catch (Throwable $e) {
    die("Unable to load Excel file: " . htmlspecialchars($e->getMessage()));
}

$sheet = $spreadsheet->getActiveSheet();
$data = $sheet->toArray(null, true, true, false);

$spreadsheet->disconnectWorksheets();
unset($spreadsheet, $sheet, $reader);

if (count($data) < 2) {
    die("No data found in Excel.");
}

// =====================================================
// GET MYSQL TABLE COLUMNS
// =====================================================

$tableColumns = [];

$result = $conn->query("SHOW COLUMNS FROM `salesdatalatest33`");

if (!$result) {
    die("Unable to read MySQL table columns: " . $conn->error);
}

while ($row = $result->fetch_assoc()) {
    $tableColumns[] = $row['Field'];
}

// =====================================================
// READ + NORMALIZE EXCEL HEADERS
// =====================================================

$excelHeaders = [];

foreach ($data[0] as $index => $header) {

    $header = trim((string)$header);

    // Remove Tally backticks
    $header = str_replace('`', '', $header);

    // -------------------------------------------------
    // Ledger.$Name -> PartyLedgerName
    // -------------------------------------------------

    if ($header === 'Ledger.$Name') {
        $header = 'PartyLedgerName';
    }

    // -------------------------------------------------
    // SPECIAL COLUMNS
    // Tally exports these with Ledger. prefix,
    // while MySQL stores them without Ledger.
    // -------------------------------------------------

    $specialColumns = [
        'Ledger.$_EveLedFldExe'          => '$_EveLedFldExe',
        'Ledger.$_EveLedTeleCall'        => '$_EveLedTeleCall',
        'Ledger.$_EveLedCRMSalesCoord'  => '$_EveLedCRMSalesCoord',
        'Ledger.$_EveBillCrPeriod'       => '$_EveBillCrPeriod'
    ];

    if (isset($specialColumns[$header])) {
        $header = $specialColumns[$header];
    }

    /*
     * NEW EXCEL COLUMN:
     * Ledger.$_PrimaryParentLed
     *
     * This is now supported automatically.
     * After removing backticks it becomes:
     * Ledger.$_PrimaryParentLed
     *
     * If the MySQL table column is also named:
     * $_PrimaryParentLed
     * add the mapping below.
     */

    if ($header === 'Ledger.$_PrimaryParentLed') {
        $header = '$_PrimaryParentLed';
    }

    $excelHeaders[$index] = $header;
}

// =====================================================
// MATCH EXCEL COLUMNS WITH MYSQL
// =====================================================

$insertColumns = [];
$excelIndexes = [];
$missingColumns = [];

foreach ($excelHeaders as $index => $header) {

    if ($header === '') {
        continue;
    }

    if (in_array($header, $tableColumns, true)) {

        $insertColumns[] = "`" . $header . "`";
        $excelIndexes[] = $index;

    } else {

        $missingColumns[] = $header;
    }
}

// =====================================================
// CHECK
// =====================================================

if (count($insertColumns) === 0) {
    die("No matching columns found between Excel and MySQL.");
}

$columnList = implode(",", $insertColumns);

// =====================================================
// DISPLAY IMPORT INFORMATION
// =====================================================

echo "<h3>Import Information</h3>";

echo "Excel Columns Found: <b>"
   . count($excelHeaders)
   . "</b><br>";

echo "Matched SQL Columns: <b>"
   . count($insertColumns)
   . "</b><br>";

echo "Missing Columns: <b>"
   . count($missingColumns)
   . "</b><br>";

// =====================================================
// SHOW MISSING COLUMNS
// =====================================================

if (count($missingColumns) > 0) {

    echo "<br><b style='color:red'>Columns not found in MySQL:</b><br>";

    foreach ($missingColumns as $column) {
        echo htmlspecialchars($column) . "<br>";
    }
}

echo "<hr>";

// =====================================================
// PREPARE INSERT
// =====================================================

$placeholders = implode(
    ",",
    array_fill(0, count($excelIndexes), "?")
);

$sql = "INSERT INTO `salesdatalatest33`
        ($columnList)
        VALUES
        ($placeholders)";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("Prepare failed: " . htmlspecialchars($conn->error));
}

// =====================================================
// IMPORT DATA
// =====================================================

$success = 0;
$failed = 0;
$skipped = 0;

$totalRows = count($data) - 1;

// =====================================================
// REPLACE OLD DATA IN ONE TRANSACTION
// Old ledgers stay in place if the import stops
// halfway, and one commit is much faster than
// 13,000 separate ones.
// =====================================================

$conn->begin_transaction();

if (!$conn->query("DELETE FROM `salesdatalatest33`")) {
    $conn->rollback();
    die("Failed to clear table: " . htmlspecialchars($conn->error));
}

for ($i = 1; $i < count($data); $i++) {

    $row = $data[$i];

    // -------------------------------------------------
    // Skip completely empty rows
    // -------------------------------------------------

    $hasData = false;

    foreach ($excelIndexes as $index) {

        if (
            isset($row[$index]) &&
            trim((string)$row[$index]) !== ''
        ) {
            $hasData = true;
            break;
        }
    }

    if (!$hasData) {
        $skipped++;
        continue;
    }

    // -------------------------------------------------
    // Create values
    // -------------------------------------------------

    $values = [];

    foreach ($excelIndexes as $index) {

        if (isset($row[$index])) {

            $value = trim((string)$row[$index]);

            $values[] = ($value === '') ? null : $value;

        } else {

            $values[] = null;
        }
    }

    // -------------------------------------------------
    // Bind all values as strings
    // -------------------------------------------------

    $types = str_repeat('s', count($values));

    $stmt->bind_param(
        $types,
        ...$values
    );

    // -------------------------------------------------
    // INSERT
    // -------------------------------------------------

    if ($stmt->execute()) {

        $success++;

    } else {

        $failed++;

        echo "<b style='color:red'>";
        echo "Row " . ($i + 1);
        echo "</b> : ";

        echo htmlspecialchars($stmt->error);

        echo "<br>";
    }
}

if (!$conn->commit()) {
    die("Failed to save import: " . htmlspecialchars($conn->error));
}

// =====================================================
// RESULT
// =====================================================

echo "<hr>";

echo "<h2>Import Completed</h2>";

echo "Total Excel Rows: <b>"
   . $totalRows
   . "</b><br>";

echo "Successfully Imported: <b style='color:green'>"
   . $success
   . "</b><br>";

echo "Skipped Empty Rows: <b>"
   . $skipped
   . "</b><br>";

echo "Failed: <b style='color:red'>"
   . $failed
   . "</b><br>";

echo "Matched Columns: <b>"
   . count($insertColumns)
   . "</b><br>";

echo "Missing Columns: <b>"
   . count($missingColumns)
   . "</b><br>";

$stmt->close();
$conn->close();

?>
