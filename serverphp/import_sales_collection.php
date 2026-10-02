<?php

set_time_limit(0);
ini_set('memory_limit', '1024M');
ini_set('display_errors', '1');
error_reporting(E_ALL);

/* =========================================================
   FORCE LIVE OUTPUT
========================================================= */

while (ob_get_level()) {
    ob_end_flush();
}

ob_implicit_flush(true);

header("Content-Type: text/html; charset=UTF-8");


/* =========================================================
   AUTOLOAD
========================================================= */

require_once __DIR__ . '/../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;


/* =========================================================
   CHUNK FILTER
========================================================= */

class ChunkReadFilter implements IReadFilter
{
    private $startRow = 0;
    private $endRow = 0;

    public function setRows($startRow, $chunkSize)
    {
        $this->startRow = $startRow;
        $this->endRow = $startRow + $chunkSize - 1;
    }

    public function readCell(
        $columnAddress,
        $row,
        $worksheetName = ''
    ) {
        return (
            $row >= $this->startRow &&
            $row <= $this->endRow
        );
    }
}


/* =========================================================
   DATABASE CONNECTION
========================================================= */

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {

    die(
        "<h3 style='color:red;'>Database connection failed:</h3>" .
        htmlspecialchars($conn->connect_error)
    );
}

$conn->set_charset("utf8mb4");


/* =========================================================
   EXCEL FILE
========================================================= */

$possibleFiles = [
    __DIR__ . "/EverestCRMSALES COLLECTION.xlsx",
    __DIR__ . "/EverestCRMSALES COLLECTION (1).xlsx"
];

$file = null;
foreach ($possibleFiles as $candidate) {
    if (file_exists($candidate)) {
        $file = $candidate;
        break;
    }
}

if ($file === null) {
    $xlsxFiles = glob(__DIR__ . "/*.xlsx");
    if (!empty($xlsxFiles)) {
        $file = $xlsxFiles[0];
    }
}

if ($file === null) {
    die(
        "<h3 style='color:red;'>Excel file not found.</h3>" .
        "<p>Place the 48-column Excel file in the same folder as this PHP file.</p>"
    );
}

$fileSize = filesize($file);

echo "<h3>Excel Import Started</h3>";

echo "File: " .
    htmlspecialchars(basename($file)) .
    "<br>";

echo "File Size: " .
    round($fileSize / 1024 / 1024, 2) .
    " MB<br><br>";

flush();


/* =========================================================
   CHECK TABLE
========================================================= */

$tableCheck = $conn->query(
    "SHOW TABLES LIKE 'salesdata'"
);

if (!$tableCheck || $tableCheck->num_rows === 0) {

    $conn->close();

    die(
        "<h3 style='color:red;'>
            Table 'salesdata' does not exist.
        </h3>"
    );
}


/* =========================================================
   CHECK REQUIRED NEW COLUMNS
========================================================= */

$requiredColumns = [
    "walkin_cust_no",
    "assigned_to",
    "brought_by",
    "enquiry_no",
    "temp_item_desc",
    "ledger_grand_parent",
    "EveItemGstRate",
    "EveItemTaxAmt"
];

foreach ($requiredColumns as $column) {

    $columnCheck = $conn->query(
        "SHOW COLUMNS FROM `salesdata` LIKE '" .
        $conn->real_escape_string($column) .
        "'"
    );

    if (!$columnCheck || $columnCheck->num_rows === 0) {

        $conn->close();

        die(
            "<h3 style='color:red;'>
                Missing column in salesdata:
                " . htmlspecialchars($column) . "
            </h3>

            <p>Please run:</p>

            <pre>
ALTER TABLE salesdata
ADD COLUMN walkin_cust_no VARCHAR(255) NULL,
ADD COLUMN assigned_to VARCHAR(255) NULL,
ADD COLUMN brought_by VARCHAR(255) NULL,
ADD COLUMN enquiry_no VARCHAR(255) NULL,
ADD COLUMN temp_item_desc VARCHAR(255) NULL,
ADD COLUMN ledger_grand_parent VARCHAR(255) NULL,
ADD COLUMN EveItemGstRate DECIMAL(18,4) NULL,
ADD COLUMN EveItemTaxAmt DECIMAL(18,4) NULL;
            </pre>"
        );
    }
}


/* =========================================================
   DETERMINE EXCEL ROW COUNT
========================================================= */

$zip = new ZipArchive();

if ($zip->open($file) !== true) {

    $conn->close();

    die(
        "<h3 style='color:red;'>
            Cannot open Excel file.
        </h3>"
    );
}

$xml = $zip->getFromName(
    'xl/worksheets/sheet1.xml'
);

$zip->close();

if ($xml === false) {

    $conn->close();

    die(
        "<h3 style='color:red;'>
            Cannot read sheet1.xml from Excel file.
        </h3>"
    );
}

$totalRows = 0;


/* =========================================================
   DETECT ROW COUNT FROM DIMENSION
========================================================= */

if (
    preg_match(
        '/<dimension[^>]*ref="[^"]*:[A-Z]+([0-9]+)"/i',
        $xml,
        $matches
    )
) {

    $totalRows = intval($matches[1]);
}


/* =========================================================
   FALLBACK ROW COUNT
========================================================= */

if ($totalRows <= 0) {

    if (
        preg_match_all(
            '/<row[^>]*r="([0-9]+)"/i',
            $xml,
            $rowMatches
        )
    ) {

        $rowNumbers = array_map(
            'intval',
            $rowMatches[1]
        );

        if (!empty($rowNumbers)) {
            $totalRows = max($rowNumbers);
        }
    }
}

unset($xml);


if ($totalRows <= 0) {

    $conn->close();

    die(
        "<h3 style='color:red;'>
            Could not detect Excel row count.
        </h3>"
    );
}

$expectedDataRows = max(
    0,
    $totalRows - 1
);

echo "<strong>Total Excel Rows:</strong> " .
    number_format($totalRows) .
    "<br>";

echo "<strong>Expected Data Rows:</strong> " .
    number_format($expectedDataRows) .
    "<br><br>";

flush();


/* =========================================================
   CLEAR OLD DATA
========================================================= */

echo "<strong>Clearing old salesdata...</strong><br>";

if (!$conn->query("TRUNCATE TABLE `salesdata`")) {

    $error = $conn->error;

    $conn->close();

    die(
        "<h3 style='color:red;'>
            Could not truncate salesdata:
        </h3>" .
        htmlspecialchars($error)
    );
}

echo "Old data cleared.<br><br>";

flush();


/* =========================================================
   PREPARED INSERT
========================================================= */

/*
    TOTAL DATABASE COLUMNS = 40

    1  VoucherTypeName
    2  Date
    3  VoucherNumber
    4  Reference
    5  OrderNo
    6  PartyLedgerName
    7  ParentLedgerName
    8  StockItemName
    9  StockItemAlias
    10 StockItemParent
    11 StockItemGrandParent
    12 StockItemDescription
    13 StockItemCategory
    14 GodownName
    15 BatchName
    16 BilledQty
    17 BatchRate
    18 BatchDiscount
    19 Amount
    20 Rate
    21 Discount
    22 Narration
    23 EnteredBy
    24 AlteredBy
    25 JasSalesLedName
    26 MyDateMonth
    27 EvePartyCrPeriod
    28 EveLandedCost
    29 Sales ID
    30 EveInvVchOrderNos
    31 EveInvMailingName
    32 EveInvMailingAdd
    33 walkin_cust_no
    34 assigned_to
    35 brought_by
    36 enquiry_no
    37 temp_description
    38 ledger_grand_parent
*/

$sql = "

INSERT INTO `salesdata`
(
    `VoucherTypeName`,
    `Date`,
    `VoucherNumber`,
    `Reference`,
    `OrderNo`,
    `PartyLedgerName`,
    `ParentLedgerName`,
    `StockItemName`,
    `StockItemAlias`,
    `StockItemParent`,
    `StockItemGrandParent`,
    `StockItemDescription`,
    `StockItemCategory`,
    `GodownName`,
    `BatchName`,
    `BilledQty`,
    `BatchRate`,
    `BatchDiscount`,
    `Amount`,
    `Rate`,
    `Discount`,
    `Narration`,
    `EnteredBy`,
    `AlteredBy`,
    `JasSalesLedName`,
    `MyDateMonth`,
    `EvePartyCrPeriod`,
    `EveLandedCost`,
    `Sales ID`,
    `EveInvVchOrderNos`,
    `EveInvMailingName`,
    `EveInvMailingAdd`,
    `walkin_cust_no`,
    `assigned_to`,
    `brought_by`,
    `enquiry_no`,
    `temp_item_desc`,
    `ledger_grand_parent`,
    `EveItemGstRate`,
    `EveItemTaxAmt`,
    `EveSolarCust_Shop`

)

VALUES
(
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?
)

";


/* =========================================================
   PREPARE STATEMENT
========================================================= */

$stmt = $conn->prepare($sql);

if (!$stmt) {

    $error = $conn->error;

    $conn->close();

    die(
        "<h3 style='color:red;'>
            Prepare statement failed:
        </h3>" .
        htmlspecialchars($error)
    );
}


/* =========================================================
   EXCEL READER
========================================================= */

$reader = IOFactory::createReader("Xlsx");

$reader->setReadDataOnly(true);

$filter = new ChunkReadFilter();

$reader->setReadFilter($filter);


/* =========================================================
   SETTINGS
========================================================= */

$chunkSize = 10000;

$successCount = 0;
$errorCount = 0;
$emptyRowCount = 0;

$startTime = microtime(true);


/* =========================================================
   DATE CONVERSION
========================================================= */

function convertExcelDate($value)
{
    if ($value === null) {
        return null;
    }

    if ($value instanceof DateTimeInterface) {
        return $value->format("Y-m-d");
    }

    $value = trim((string)$value);

    if ($value === '') {
        return null;
    }


    /* Excel serial date */

    if (
        is_numeric($value) &&
        floatval($value) > 1000 &&
        floatval($value) < 100000
    ) {

        try {

            $date = ExcelDate::excelToDateTimeObject(
                floatval($value)
            );

            return $date->format("Y-m-d");

        } catch (Exception $e) {
            // Continue with normal date parsing
        }
    }


    /* Normal date formats */

    $formats = [
        "Y-m-d",
        "d-m-Y",
        "d/m/Y",
        "d.m.Y",
        "Y/m/d",
        "Y.m.d",
        "d-M-Y",
        "d-M-y",
        "d M Y",
        "d M y",
        "m/d/Y",
        "m-d-Y"
    ];

    foreach ($formats as $format) {

        $date = DateTime::createFromFormat(
            $format,
            $value
        );

        if ($date !== false) {

            $errors = DateTime::getLastErrors();

            if (
                $errors === false ||
                (
                    $errors['warning_count'] == 0 &&
                    $errors['error_count'] == 0
                )
            ) {

                return $date->format("Y-m-d");
            }
        }
    }


    /* Final fallback */

    $timestamp = strtotime($value);

    if ($timestamp !== false) {
        return date("Y-m-d", $timestamp);
    }

    return null;
}


/* =========================================================
   NUMERIC CONVERSION
========================================================= */

function numericOrNull($value)
{
    if ($value === null) {
        return null;
    }

    if ($value === '') {
        return null;
    }

    if (is_string($value)) {

        $value = trim($value);

        if ($value === '') {
            return null;
        }

        $value = str_replace(',', '', $value);
    }

    if (!is_numeric($value)) {
        return null;
    }

    return (float)$value;
}


/* =========================================================
   START IMPORT
========================================================= */

echo "<strong>Starting import...</strong><br><br>";

flush();


/* =========================================================
   PROCESS EXCEL IN CHUNKS
========================================================= */

for (
    $startRow = 2;
    $startRow <= $totalRows;
    $startRow += $chunkSize
) {

    $endRow = min(
        $startRow + $chunkSize - 1,
        $totalRows
    );


    echo
        "<div style='margin-top:15px; color:#333;'>
            <strong>
                Processing rows " .
        number_format($startRow) .
        " - " .
        number_format($endRow) .
        "...
            </strong>
        </div>";

    flush();


    /* =====================================================
       SET CHUNK
    ===================================================== */

    $filter->setRows(
        $startRow,
        $chunkSize
    );


    /* =====================================================
       LOAD CHUNK
    ===================================================== */

    try {

        $spreadsheet = $reader->load($file);

    } catch (Exception $e) {

        echo
            "<strong style='color:red;'>
                Excel loading error:
            </strong> " .
            htmlspecialchars($e->getMessage()) .
            "<br>";

        $errorCount++;

        continue;
    }


    $sheet = $spreadsheet->getActiveSheet();


    /* =====================================================
       GET ROWS
    ===================================================== */

    $rows = $sheet->toArray(
        null,
        true,
        false,
        false
    );


    /* =====================================================
       START TRANSACTION
    ===================================================== */

    $conn->begin_transaction();

    $chunkInserted = 0;
    $chunkErrors = 0;


    /* =====================================================
       PROCESS ROWS
    ===================================================== */

    foreach ($rows as $rowIndex => $row) {

        /*
        =====================================================
        EXCEL COLUMN MAPPING

        Excel has 48 columns:

        0  VoucherTypeName
        1  Date
        2  VoucherNumber
        3  Reference
        4  OrderNo
        5  PartyLedgerName
        6  ParentLedgerName
        7  StockItemName
        8  StockItemAlias
        9  StockItemParent
        10 StockItemGrandParent
        11 StockItemDescription
        12 StockItemCategory
        13 GodownName
        14 BatchName
        15 BilledQty
        16 BatchRate
        17 BatchDiscount
        18 Amount
        19 Rate
        20 Discount
        21 Narration

        22 MasterId                  IGNORE
        23 VoucherId                 IGNORE

        24 EnteredBy
        25 AlteredBy

        26 AlteredOn                 IGNORE
        27 BasicDueDateOfPymt        IGNORE

        28 JasSalesLedName
        29 MyDateMonth

        30 EvePymtDueDate            IGNORE

        31 EvePartyCrPeriod
        32 EveLandedCost

        33 Common Entry              IGNORE
        34 Common Entry              IGNORE
        35 Common Entry              IGNORE

        36 EveSalesOrderMstID        -> Sales ID
        37 EveInvVchOrderNos
        38 EveInvMailingName
        39 EveInvMailingAdd

        40 EveEIOrderRef             -> walkin_cust_no
        41 EveEIAssigTo              -> assigned_to
        42 EveEIBroughtBy            -> brought_by
        43 EveEIQuoteRef             -> enquiry_no
        44 temp_description
        45 EveLedGrandParent         -> ledger_grand_parent
        46 EveItemGstRate
        47 EveItemTaxAmt
        =====================================================
        */


        /* Make sure row has 48 columns */

        $row = array_pad(
            $row,
            48,
            null
        );


        /* =================================================
           SKIP COMPLETELY EMPTY ROWS
        ================================================= */

        $hasData = false;

        for ($i = 0; $i < 48; $i++) {

            if (
                $row[$i] !== null &&
                trim((string)$row[$i]) !== ''
            ) {

                $hasData = true;
                break;
            }
        }

        if (!$hasData) {

            $emptyRowCount++;

            continue;
        }


        /* =================================================
           CURRENT EXCEL ROW
        ================================================= */

        $currentExcelRow =
            $startRow + $rowIndex;


        /* =================================================
           EXCEL -> DATABASE VALUES
        ================================================= */

        $VoucherTypeName =
            trim((string)$row[0]);

        $Date =
            convertExcelDate($row[1]);

        $VoucherNumber =
            trim((string)$row[2]);

        $Reference =
            trim((string)$row[3]);

        $OrderNo =
            trim((string)$row[4]);

        $PartyLedgerName =
            trim((string)$row[5]);

        $ParentLedgerName =
            trim((string)$row[6]);

        $StockItemName =
            trim((string)$row[7]);

        $StockItemAlias =
            trim((string)$row[8]);

        $StockItemParent =
            trim((string)$row[9]);

        $StockItemGrandParent =
            trim((string)$row[10]);

        $StockItemDescription =
            trim((string)$row[11]);

        $StockItemCategory =
            trim((string)$row[12]);

        $GodownName =
            trim((string)$row[13]);

        $BatchName =
            trim((string)$row[14]);


        /* =================================================
           NUMERIC FIELDS
        ================================================= */

        $BilledQty =
            numericOrNull($row[15]);

        $BatchRate =
            numericOrNull($row[16]);

        $BatchDiscount =
            numericOrNull($row[17]);

        $Amount =
            numericOrNull($row[18]);

        $Rate =
            numericOrNull($row[19]);

        $Discount =
            numericOrNull($row[20]);


        /* =================================================
           OTHER TEXT FIELDS
        ================================================= */

        $Narration =
            trim((string)$row[21]);

        $EnteredBy =
            trim((string)$row[24]);

        $AlteredBy =
            trim((string)$row[25]);

        $JasSalesLedName =
            trim((string)$row[28]);

        $MyDateMonth =
            trim((string)$row[29]);

        $EvePartyCrPeriod =
            trim((string)$row[31]);

        $EveLandedCost =
            numericOrNull($row[32]);


        /* =================================================
           SALES ID
        ================================================= */

        $SalesID =
            trim((string)$row[36]);


        /* =================================================
           INVOICE / VOUCHER ORDER
        ================================================= */

        $EveInvVchOrderNos =
            trim((string)$row[37]);


        /* =================================================
           INVOICE MAILING DETAILS
        ================================================= */

        $EveInvMailingName =
            trim((string)$row[38]);

        $EveInvMailingAdd =
            trim((string)$row[39]);


        /* =================================================
           NEW COLUMNS
        ================================================= */

        $walkin_cust_no =
            trim((string)$row[40]);

        $assigned_to =
            trim((string)$row[41]);

        $brought_by =
            trim((string)$row[42]);

        $enquiry_no =
            trim((string)$row[43]);

        $temp_item_desc =
            trim((string)$row[44]);

        $ledger_grand_parent =
            trim((string)$row[45]);

        $EveItemGstRate =
            numericOrNull($row[46]);

        $EveItemTaxAmt =
            numericOrNull($row[47]);

         $EveSolarCust_Shop
            = trim((string)$row[48]);


        /* =================================================
           BIND PARAMETERS

           Total parameters = 40

           31 strings
           9 decimals
        ================================================= */

        $bindResult = $stmt->bind_param(

            "sssssssssssssssddddddssssssdssssssssssdds",

            $VoucherTypeName,
            $Date,
            $VoucherNumber,
            $Reference,
            $OrderNo,
            $PartyLedgerName,
            $ParentLedgerName,
            $StockItemName,
            $StockItemAlias,
            $StockItemParent,
            $StockItemGrandParent,
            $StockItemDescription,
            $StockItemCategory,
            $GodownName,
            $BatchName,

            $BilledQty,
            $BatchRate,
            $BatchDiscount,
            $Amount,
            $Rate,
            $Discount,

            $Narration,
            $EnteredBy,
            $AlteredBy,
            $JasSalesLedName,
            $MyDateMonth,
            $EvePartyCrPeriod,

            $EveLandedCost,

            $SalesID,
            $EveInvVchOrderNos,
            $EveInvMailingName,
            $EveInvMailingAdd,
            $walkin_cust_no,
            $assigned_to,
            $brought_by,
            $enquiry_no,
            $temp_item_desc,
            $ledger_grand_parent,
            $EveItemGstRate,
            $EveItemTaxAmt,
            $EveSolarCust_Shop

        );


        if (!$bindResult) {

            echo
                "<div style='color:red; padding:3px 0;'>
                    ❌ Bind error at Excel row " .
                number_format($currentExcelRow) .
                ": " .
                htmlspecialchars($stmt->error) .
                "</div>";

            $errorCount++;
            $chunkErrors++;

            continue;
        }


        /* =================================================
           EXECUTE INSERT
        ================================================= */

        if (!$stmt->execute()) {

            echo
                "<div style='color:red; padding:3px 0;'>
                    ❌ Insert error at Excel row " .
                number_format($currentExcelRow) .
                ": " .
                htmlspecialchars($stmt->error) .
                "</div>";

            $errorCount++;
            $chunkErrors++;

        } else {

            $successCount++;
            $chunkInserted++;
        }
    }


    /* =====================================================
       COMMIT CHUNK
    ===================================================== */

    if (!$conn->commit()) {

        echo
            "<strong style='color:red;'>
                Transaction commit failed:
            </strong> " .
            htmlspecialchars($conn->error) .
            "<br>";

        $errorCount++;

    } else {

        echo
            "<div style='color:#0066cc; margin:8px 0;'>
                ✔ Chunk committed successfully.
                Inserted in this chunk: " .
            number_format($chunkInserted) .
            "
            </div>";

        flush();
    }


    /* =====================================================
       CLEAN MEMORY
    ===================================================== */

    $spreadsheet->disconnectWorksheets();

    unset($sheet);
    unset($rows);
    unset($spreadsheet);

    gc_collect_cycles();


    /* =====================================================
       PROGRESS
    ===================================================== */

    $percent =
        ($endRow / $totalRows) * 100;

    $elapsed =
        microtime(true) - $startTime;


    echo
        "<hr>

        <strong>Chunk completed</strong><br>

        Inserted in this chunk: " .
        number_format($chunkInserted) .
        "<br>

        Total inserted: " .
        number_format($successCount) .
        "<br>

        Empty rows skipped: " .
        number_format($emptyRowCount) .
        "<br>

        Errors: " .
        number_format($errorCount) .
        "<br>

        Progress: " .
        number_format($percent, 2) .
        "%<br>

        Elapsed: " .
        gmdate(
            "H:i:s",
            (int)$elapsed
        ) .
        "<br><br>";

    flush();
}


/* =========================================================
   CLOSE
========================================================= */

$stmt->close();

$conn->close();


/* =========================================================
   FINAL RESULT
========================================================= */

$totalTime =
    microtime(true) - $startTime;


echo "<hr>";

echo "<h2 style='color:green;'>
    Import Completed
</h2>";

echo
    "<strong>Total Excel Rows:</strong> " .
    number_format($totalRows) .
    "<br>";

echo
    "<strong>Expected Data Rows:</strong> " .
    number_format($expectedDataRows) .
    "<br>";

echo
    "<strong>Total Imported:</strong> " .
    number_format($successCount) .
    "<br>";

echo
    "<strong>Empty Rows Skipped:</strong> " .
    number_format($emptyRowCount) .
    "<br>";

echo
    "<strong>Total Errors:</strong> " .
    number_format($errorCount) .
    "<br>";

echo
    "<strong>Total Time:</strong> " .
    gmdate(
        "H:i:s",
        (int)$totalTime
    ) .
    "<br><br>";


if (
    $successCount + $emptyRowCount === $expectedDataRows &&
    $errorCount === 0
) {

    echo
        "<strong style='color:green; font-size:18px;'>
            IMPORT COMPLETED SUCCESSFULLY.
        </strong>";

} else {

    echo
        "<strong style='color:#cc6600; font-size:18px;'>
            Import completed. Please check the counts above.
        </strong>";
}

?>