<?php

require_once __DIR__ . '/db_connect.php';

date_default_timezone_set("Asia/Kolkata");

/* =========================================================
   RUNTIME SETTINGS
   13,000+ ledgers is too much for PHP's default
   128M / 30 second limits. Shared hosting may refuse
   these, so they are silenced.
========================================================= */

@set_time_limit(0);
@ini_set('memory_limit', '1024M');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        echo "<br><b style='color:red'>Import stopped:</b> "
           . htmlspecialchars($error['message'])
           . " (" . htmlspecialchars(basename($error['file'])) . ":" . $error['line'] . ")";
    }
});

$autoload = __DIR__ . '/../vendor/autoload.php';

if (!file_exists($autoload)) {
    die("vendor/autoload.php not found. Run <b>composer install</b> in the project folder.");
}

require_once $autoload;

use PhpOffice\PhpSpreadsheet\IOFactory;


/* =========================================================
   DATABASE CONNECTION
   Login details come from db_connect.php on the server.
========================================================= */

try {

    $pdo = db_pdo("salescollection", [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);

} catch (Throwable $e) {

    error_log("LEDGER IMPORT DB ERROR: " . $e->getMessage());

    die(
        "<h3 style='color:red;'>Database connection failed.</h3>" .
        "<p>Check the details in db_connect.php.</p>"
    );
}


/* =========================================================
   EXCEL FILE
========================================================= */

$file = __DIR__ . "/EverestCRMLedgers.xlsx";

if (!file_exists($file)) {
    die("Excel file not found:<br>" . htmlspecialchars($file));
}


/* =========================================================
   LOAD EXCEL
   Values only (no styles) to keep memory low.
========================================================= */

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


/* =========================================================
   GET MYSQL TABLE COLUMNS
========================================================= */

$tableColumns = [];

try {

    foreach ($pdo->query("SHOW COLUMNS FROM `salesdatalatest33`")->fetchAll() as $col) {
        $tableColumns[] = $col['Field'];
    }

} catch (Throwable $e) {

    die("Unable to read MySQL table columns: " . htmlspecialchars($e->getMessage()));
}


/* =========================================================
   READ + NORMALIZE EXCEL HEADERS
========================================================= */

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
        'Ledger.$_EveLedCRMSalesCoord'   => '$_EveLedCRMSalesCoord',
        'Ledger.$_EveBillCrPeriod'       => '$_EveBillCrPeriod',
        'Ledger.$_PrimaryParentLed'      => '$_PrimaryParentLed'
    ];

    if (isset($specialColumns[$header])) {
        $header = $specialColumns[$header];
    }

    // -------------------------------------------------
    // NEW EXCEL COLUMN: Ledger.$OpeningBalance
    // Use $OpeningBalance if the table already has it,
    // otherwise keep the Excel name and add the column
    // to MySQL the first time it is imported.
    // -------------------------------------------------

    if ($header === 'Ledger.$OpeningBalance') {

        if (in_array('$OpeningBalance', $tableColumns, true)) {

            $header = '$OpeningBalance';

        } elseif (!in_array($header, $tableColumns, true)) {

            try {

                $pdo->exec(
                    "ALTER TABLE `salesdatalatest33`
                     ADD COLUMN `Ledger.\$OpeningBalance` DECIMAL(18,2) NULL"
                );

            } catch (Throwable $e) {

                die(
                    "<h3 style='color:red;'>Unable to add OpeningBalance column:</h3>" .
                    htmlspecialchars($e->getMessage()) .
                    "<p>Please run:</p>" .
                    "<pre>ALTER TABLE `salesdatalatest33`\n" .
                    "ADD COLUMN `Ledger.\$OpeningBalance` DECIMAL(18,2) NULL;</pre>"
                );
            }

            $tableColumns[] = $header;

            echo "<div style='color:#0066cc;'>Added column " .
                htmlspecialchars($header) .
                " to salesdatalatest33.</div>";
        }
    }

    $excelHeaders[$index] = $header;
}


/* =========================================================
   MATCH EXCEL COLUMNS WITH MYSQL
========================================================= */

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

if (count($insertColumns) === 0) {
    die("No matching columns found between Excel and MySQL.");
}


/* =========================================================
   DISPLAY IMPORT INFORMATION
========================================================= */

echo "<h3>Import Information</h3>";

echo "Excel Columns Found: <b>" . count($excelHeaders) . "</b><br>";
echo "Matched SQL Columns: <b>" . count($insertColumns) . "</b><br>";
echo "Missing Columns: <b>" . count($missingColumns) . "</b><br>";

if (count($missingColumns) > 0) {

    echo "<br><b style='color:red'>Columns not found in MySQL:</b><br>";

    foreach ($missingColumns as $column) {
        echo htmlspecialchars($column) . "<br>";
    }
}

echo "<hr>";


/* =========================================================
   PREPARE INSERT
========================================================= */

$sql =
    "INSERT INTO `salesdatalatest33` (" .
    implode(",", $insertColumns) .
    ") VALUES (" .
    implode(",", array_fill(0, count($excelIndexes), "?")) .
    ")";

try {

    $stmt = $pdo->prepare($sql);

} catch (Throwable $e) {

    die("Prepare failed: " . htmlspecialchars($e->getMessage()));
}


/* =========================================================
   REPLACE OLD DATA IN ONE TRANSACTION
   Old ledgers stay in place if the import stops
   halfway, and one commit is much faster than
   13,000 separate ones.
========================================================= */

$success = 0;
$failed = 0;
$skipped = 0;

$totalRows = count($data) - 1;

try {

    $pdo->beginTransaction();

    $pdo->exec("DELETE FROM `salesdatalatest33`");

} catch (Throwable $e) {

    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    die("Failed to clear table: " . htmlspecialchars($e->getMessage()));
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
    // INSERT
    // -------------------------------------------------

    try {

        $stmt->execute($values);

        $success++;

    } catch (Throwable $e) {

        $failed++;

        echo "<b style='color:red'>Row " . ($i + 1) . "</b> : " .
            htmlspecialchars($e->getMessage()) .
            "<br>";
    }
}

try {

    $pdo->commit();

} catch (Throwable $e) {

    die("Failed to save import: " . htmlspecialchars($e->getMessage()));
}


/* =========================================================
   RESULT
========================================================= */

echo "<hr>";

echo "<h2>Import Completed</h2>";

echo "Total Excel Rows: <b>" . $totalRows . "</b><br>";
echo "Successfully Imported: <b style='color:green'>" . $success . "</b><br>";
echo "Skipped Empty Rows: <b>" . $skipped . "</b><br>";
echo "Failed: <b style='color:red'>" . $failed . "</b><br>";
echo "Matched Columns: <b>" . count($insertColumns) . "</b><br>";
echo "Missing Columns: <b>" . count($missingColumns) . "</b><br>";

$stmt = null;
$pdo = null;

?>
