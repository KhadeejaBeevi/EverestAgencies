<?php

require_once __DIR__ . '/../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;

// =====================================================
// DATABASE CONNECTION
// =====================================================

$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$conn->set_charset("utf8mb4");

// =====================================================
// TRUNCATE OLD DATA
// =====================================================

if (!$conn->query("TRUNCATE TABLE `salesdatalatest33`")) {
    die("Failed to truncate table: " . $conn->error);
}

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
// =====================================================

try {
    $spreadsheet = IOFactory::load($file);
} catch (Exception $e) {
    die("Unable to load Excel file: " . htmlspecialchars($e->getMessage()));
}

$sheet = $spreadsheet->getActiveSheet();
$data = $sheet->toArray(null, true, true, false);

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
