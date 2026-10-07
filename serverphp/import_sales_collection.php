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

@ini_set('zlib.output_compression', '0');
@ini_set('output_buffering', '0');
@ini_set('implicit_flush', '1');

ob_implicit_flush(true);

header("Content-Type: text/html; charset=UTF-8");
header("X-Accel-Buffering: no");
header("Cache-Control: no-cache");

/* Browsers wait for ~1 KB before showing anything */
echo str_repeat(" ", 4096) . "\n";
flush();


/* =========================================================
   CHUNK-WISE IMPORT

   Each page load imports ONE chunk of rows and then
   automatically opens the next chunk (?start=...).
   The first page (no ?start) clears the table.
========================================================= */

$chunkSize = 10000;

$startRow      = max(2, (int)($_GET['start'] ?? 2));
$successCount  = max(0, (int)($_GET['ok'] ?? 0));
$errorCount    = max(0, (int)($_GET['err'] ?? 0));
$emptyRowCount = max(0, (int)($_GET['empty'] ?? 0));
$startTime     = (float)($_GET['t'] ?? microtime(true));

$isFirstChunk = !isset($_GET['start']);


/* =========================================================
   FAST XLSX STREAM READER

   Reads the sheet XML directly with XMLReader instead of
   PhpSpreadsheet. Only the rows of the current chunk are
   parsed, so a 1 lakh+ row file is not re-loaded fully
   for every chunk.
========================================================= */

class XlsxStreamReader
{
    private $file;
    private $sheetPath = 'xl/worksheets/sheet1.xml';
    private $strings = [];

    public function __construct($file)
    {
        $this->file = realpath($file);

        $zip = new ZipArchive();

        if ($zip->open($this->file) !== true) {
            throw new Exception("Cannot open Excel file.");
        }

        $this->sheetPath = $this->findFirstSheet($zip);

        if ($zip->locateName($this->sheetPath) === false) {
            $zip->close();
            throw new Exception("Sheet not found in Excel file: " . $this->sheetPath);
        }

        $hasSharedStrings = $zip->locateName('xl/sharedStrings.xml') !== false;

        $zip->close();

        if ($hasSharedStrings) {
            $this->loadSharedStrings();
        }
    }

    /* First sheet of the workbook (EveSalesCollection) */

    private function findFirstSheet($zip)
    {
        $workbook = $zip->getFromName('xl/workbook.xml');
        $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');

        if (
            $workbook === false ||
            $rels === false ||
            !preg_match('/<sheet\b[^>]*\br:id="([^"]+)"/', $workbook, $sheet)
        ) {
            return 'xl/worksheets/sheet1.xml';
        }

        if (
            preg_match_all('/<Relationship\b[^>]*>/', $rels, $relTags)
        ) {
            foreach ($relTags[0] as $tag) {

                if (
                    preg_match('/\bId="([^"]+)"/', $tag, $id) &&
                    $id[1] === $sheet[1] &&
                    preg_match('/\bTarget="([^"]+)"/', $tag, $target)
                ) {
                    $path = $target[1];

                    return ($path[0] === '/')
                        ? ltrim($path, '/')
                        : 'xl/' . $path;
                }
            }
        }

        return 'xl/worksheets/sheet1.xml';
    }

    private function openXml($entry)
    {
        $xr = new XMLReader();

        if (!$xr->open('zip://' . $this->file . '#' . $entry, null, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) {
            throw new Exception("Cannot read " . $entry . " from Excel file.");
        }

        return $xr;
    }

    /* Text of <t> elements, ignoring phonetic runs (<rPh>) */

    private static function nodeText($node)
    {
        $text = '';

        foreach ($node->getElementsByTagName('t') as $t) {

            if ($t->parentNode && $t->parentNode->localName === 'rPh') {
                continue;
            }

            $text .= $t->textContent;
        }

        return $text;
    }

    private function loadSharedStrings()
    {
        $xr = $this->openXml('xl/sharedStrings.xml');

        while ($xr->read()) {

            if (
                $xr->nodeType === XMLReader::ELEMENT &&
                $xr->localName === 'si'
            ) {
                $node = $xr->expand();

                $this->strings[] = $node ? self::nodeText($node) : '';
            }
        }

        $xr->close();
    }

    /* "BH" -> 59 */

    private static function columnIndex($cellRef)
    {
        $letters = strtoupper(preg_replace('/[^A-Za-z]/', '', $cellRef));

        $index = 0;

        for ($i = 0, $len = strlen($letters); $i < $len; $i++) {
            $index = $index * 26 + (ord($letters[$i]) - 64);
        }

        return $index - 1;
    }

    private function cellValue($cell)
    {
        $type = $cell->getAttribute('t');

        if ($type === 'inlineStr') {
            return self::nodeText($cell);
        }

        $v = null;

        foreach ($cell->childNodes as $child) {
            if ($child->localName === 'v') {
                $v = $child->textContent;
                break;
            }
        }

        if ($v === null) {
            return null;
        }

        if ($type === 's') {
            return $this->strings[(int)$v] ?? '';
        }

        if ($type === 'str' || $type === 'e' || $type === 'b') {
            return $v;
        }

        /* Number: same text PHP would give for the number */

        return is_numeric($v) ? (string)($v + 0) : $v;
    }

    private function parseRow($rowNode)
    {
        $row = [];
        $next = 0;

        foreach ($rowNode->childNodes as $cell) {

            if ($cell->localName !== 'c') {
                continue;
            }

            $ref = $cell->getAttribute('r');

            $col = ($ref !== '') ? self::columnIndex($ref) : $next;

            $row[$col] = $this->cellValue($cell);

            $next = $col + 1;
        }

        return $row;
    }

    /*
       Returns [excelRowNumber => [colIndex => value]] for every
       row from $fromRow to $toRow. Rows missing in the file are
       returned as empty arrays.
    */

    public function readRows($fromRow, $toRow)
    {
        $rows = [];

        $xr = $this->openXml($this->sheetPath);

        while ($xr->read()) {
            if (
                $xr->nodeType === XMLReader::ELEMENT &&
                $xr->localName === 'row'
            ) {
                break;
            }
        }

        $rowNumber = 0;

        while (
            $xr->nodeType === XMLReader::ELEMENT &&
            $xr->localName === 'row'
        ) {

            $r = $xr->getAttribute('r');

            $rowNumber = ($r !== null && $r !== '') ? (int)$r : $rowNumber + 1;

            if ($rowNumber > $toRow) {
                break;
            }

            if ($rowNumber >= $fromRow) {

                $node = $xr->expand();

                $rows[$rowNumber] = $node ? $this->parseRow($node) : [];
            }

            if (!$xr->next('row')) {
                break;
            }
        }

        $xr->close();

        $lastRow = empty($rows) ? $fromRow - 1 : max(array_keys($rows));

        for ($r = $fromRow; $r <= $lastRow; $r++) {
            if (!isset($rows[$r])) {
                $rows[$r] = [];
            }
        }

        ksort($rows);

        return $rows;
    }

    /* Row count from <dimension>, or by counting <row> tags */

    public function totalRows()
    {
        $xr = $this->openXml($this->sheetPath);

        $last = 0;

        while ($xr->read()) {

            if ($xr->nodeType !== XMLReader::ELEMENT) {
                continue;
            }

            if ($xr->localName === 'dimension') {

                $ref = (string)$xr->getAttribute('ref');

                if (preg_match('/:[A-Z]+([0-9]+)$/i', $ref, $m)) {
                    $xr->close();
                    return (int)$m[1];
                }
            }

            if ($xr->localName === 'row') {
                break;
            }
        }

        while (
            $xr->nodeType === XMLReader::ELEMENT &&
            $xr->localName === 'row'
        ) {
            $r = $xr->getAttribute('r');

            $last = ($r !== null && $r !== '') ? (int)$r : $last + 1;

            if (!$xr->next('row')) {
                break;
            }
        }

        $xr->close();

        return $last;
    }
}


/* =========================================================
   COLUMN MAPPING  (database column => Excel header)

   The Excel export currently has 60 columns (A..BH).
   Columns are located by their header text in row 1, so
   inserting / reordering columns in the Excel export will
   not break the import.

   type: s = text, d = decimal, date = date (stored as text)

   Excel columns NOT imported:
     $MasterId, $VoucherId, $AlteredOn, $BasicDueDateOfPymt,
     $BasicOrderRef, $VchOrderIndexExecutive, $PartyGSTIN,
     $EvePymtDueDate, $EveEVE_COMMON_FIELDEXE_ENTRY,
     $EveEVE_COMMON_TELECALLER_ENTRY, $EveEVE_COMMON_SALESCO_ENTRY
========================================================= */

$columnMap = [
    ["db" => "VoucherTypeName",      "excel" => '$VoucherTypeName',                        "type" => "s"],
    ["db" => "Date",                 "excel" => '$Date',                                   "type" => "date"],
    ["db" => "VoucherNumber",        "excel" => '$VoucherNumber',                          "type" => "s"],
    ["db" => "Reference",            "excel" => '$Reference',                              "type" => "s"],
    ["db" => "OrderNo",              "excel" => '$OrderNo',                                "type" => "s"],
    ["db" => "PartyLedgerName",      "excel" => '$PartyLedgerName',                        "type" => "s"],
    ["db" => "ParentLedgerName",     "excel" => '$Parent:Ledger:$PartyLedgerName',         "type" => "s"],
    ["db" => "StockItemName",        "excel" => '$StockItemName',                          "type" => "s"],
    ["db" => "StockItemAlias",       "excel" => '$OnlyAlias:StockItem:$StockItemName',     "type" => "s"],
    ["db" => "StockItemParent",      "excel" => '$Parent:StockItem:$StockItemName',        "type" => "s"],
    ["db" => "StockItemGrandParent", "excel" => '$GrandParent:StockItem:$StockItemName',   "type" => "s"],
    ["db" => "StockItemDescription", "excel" => '$Description:StockItem:$StockItemName',   "type" => "s"],
    ["db" => "StockItemCategory",    "excel" => '$Category:StockItem:$StockitemName',      "type" => "s"],
    ["db" => "GodownName",           "excel" => '$GodownName',                             "type" => "s"],
    ["db" => "BatchName",            "excel" => '$BatchName',                              "type" => "s"],
    ["db" => "BilledQty",            "excel" => '$BilledQty',                              "type" => "d"],
    ["db" => "BatchRate",            "excel" => '$BatchRate',                              "type" => "d"],
    ["db" => "BatchDiscount",        "excel" => '$BatchDiscount',                          "type" => "d"],
    ["db" => "Amount",               "excel" => '$Amount',                                 "type" => "d"],
    ["db" => "Rate",                 "excel" => '$Rate',                                   "type" => "d"],
    ["db" => "Discount",             "excel" => '$Discount',                               "type" => "d"],
    ["db" => "Narration",            "excel" => '$Narration',                              "type" => "s"],
    ["db" => "EnteredBy",            "excel" => '$EnteredBy',                              "type" => "s"],
    ["db" => "AlteredBy",            "excel" => '$AlteredBy',                              "type" => "s"],
    ["db" => "JasSalesLedName",      "excel" => '$JasSalesLedName',                        "type" => "s"],
    ["db" => "MyDateMonth",          "excel" => '$MyDateMonth',                            "type" => "s"],
    ["db" => "EvePartyCrPeriod",     "excel" => '$EvePartyCrPeriod',                       "type" => "s"],
    ["db" => "EveLandedCost",        "excel" => '$EveLandedCost',                          "type" => "d"],
    ["db" => "Sales ID",             "excel" => '$EveSalesOrderMstID',                     "type" => "s"],
    ["db" => "EveInvVchOrderNos",    "excel" => '$EveInvVchOrderNos',                      "type" => "s"],
    ["db" => "EveInvMailingName",    "excel" => '$EveInvMailingName',                      "type" => "s"],
    ["db" => "EveInvMailingAdd",     "excel" => '$EveInvMailingAdd',                       "type" => "s"],
    ["db" => "walkin_cust_no",       "excel" => '$EveEIOrderRef',                          "type" => "s"],
    ["db" => "assigned_to",          "excel" => '$EveEIAssigTo',                           "type" => "s"],
    ["db" => "brought_by",           "excel" => '$EveEIBoughtBy',                          "type" => "s"],
    ["db" => "enquiry_no",           "excel" => '$EveEIQuoteRef',                          "type" => "s"],
    ["db" => "temp_item_desc",       "excel" => '$EveTempItemDesc',                        "type" => "s"],
    ["db" => "ledger_grand_parent",  "excel" => '$EveLedGrandParent',                      "type" => "s"],
    ["db" => "EveItemGstRate",       "excel" => '$EveItemGstRate',                         "type" => "d"],
    ["db" => "EveItemTaxAmt",        "excel" => '$EveItemTaxAmt',                          "type" => "d"],
    ["db" => "EveSolarCust_Shop",    "excel" => '$EveSolarCust_Shop',                      "type" => "s"],
    ["db" => "JasSecBillQty",        "excel" => '$JasSecBillQty',                          "type" => "s"],
    ["db" => "JasPriBillQty",        "excel" => '$JasPriBillQty',                          "type" => "s"],
    ["db" => "JasBaseUnit",          "excel" => '$JasBaseUnit',                            "type" => "s"],
    ["db" => "SafHSNSACCode",        "excel" => '$SafHSNSACCode',                          "type" => "s"],

    /* New columns in the 60-column export */
    ["db" => "EveBasicDueDateOfPymt", "excel" => '$EveBasicDueDateOfPymt',                "type" => "s", "optional" => true],
    ["db" => "EveBasicOrderRef",      "excel" => '$EveBasicOrderRef',                     "type" => "s", "optional" => true],
    ["db" => "EveExecutive",          "excel" => '$EveExecutive',                         "type" => "s", "optional" => true],
    ["db" => "EvePartyGSTIN",         "excel" => '$EvePartyGSTIN',                        "type" => "s", "optional" => true]
];


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
    __DIR__ . "/EverestCRMSALES_COLLECTION.xlsx",
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
        "<p>Place the Excel file in the same folder as this PHP file.</p>"
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
   CHECK REQUIRED DATABASE COLUMNS
========================================================= */

$alterDefinitions = [
    "walkin_cust_no"        => "VARCHAR(255) NULL",
    "assigned_to"           => "VARCHAR(255) NULL",
    "brought_by"            => "VARCHAR(255) NULL",
    "enquiry_no"            => "VARCHAR(255) NULL",
    "temp_item_desc"        => "VARCHAR(255) NULL",
    "ledger_grand_parent"   => "VARCHAR(255) NULL",
    "EveItemGstRate"        => "DECIMAL(18,4) NULL",
    "EveItemTaxAmt"         => "DECIMAL(18,4) NULL",
    "EveSolarCust_Shop"     => "VARCHAR(255) NULL",
    "JasSecBillQty"         => "VARCHAR(100) NULL",
    "JasPriBillQty"         => "VARCHAR(100) NULL",
    "JasBaseUnit"           => "VARCHAR(50) NULL",
    "SafHSNSACCode"         => "VARCHAR(50) NULL",
    "EveBasicDueDateOfPymt" => "VARCHAR(100) NULL",
    "EveBasicOrderRef"      => "VARCHAR(255) NULL",
    "EveExecutive"          => "VARCHAR(255) NULL",
    "EvePartyGSTIN"         => "VARCHAR(20) NULL"
];

$existingColumns = [];

$columnsResult = $conn->query("SHOW COLUMNS FROM `salesdata`");

if ($columnsResult) {
    while ($col = $columnsResult->fetch_assoc()) {
        $existingColumns[$col['Field']] = true;
    }
}

$missingColumns = [];
$skippedColumns = [];

foreach ($columnMap as $key => $map) {

    if (isset($existingColumns[$map["db"]])) {
        continue;
    }

    if (!empty($map["optional"])) {

        /* Optional column not in the table yet: skip it */

        $skippedColumns[] = $map["db"];
        unset($columnMap[$key]);
        continue;
    }

    $missingColumns[] = $map["db"];
}

$columnMap = array_values($columnMap);

if (!empty($skippedColumns)) {

    echo "<div style='color:#cc6600;'>Note: these Excel columns are skipped " .
        "because salesdata does not have them yet: " .
        htmlspecialchars(implode(", ", $skippedColumns)) .
        "<br>To import them, run:<pre>ALTER TABLE salesdata\n";

    $alterLines = [];

    foreach ($skippedColumns as $column) {
        $alterLines[] = "ADD COLUMN `" . $column . "` " . $alterDefinitions[$column];
    }

    echo htmlspecialchars(implode(",\n", $alterLines)) . ";</pre></div>";

    flush();
}

if (!empty($missingColumns)) {

    $conn->close();

    $alterLines = [];

    foreach ($missingColumns as $column) {
        $alterLines[] =
            "ADD COLUMN `" . $column . "` " .
            ($alterDefinitions[$column] ?? "VARCHAR(255) NULL");
    }

    die(
        "<h3 style='color:red;'>Missing column(s) in salesdata: " .
        htmlspecialchars(implode(", ", $missingColumns)) .
        "</h3>" .
        "<p>Please run:</p>" .
        "<pre>ALTER TABLE salesdata\n" .
        htmlspecialchars(implode(",\n", $alterLines)) .
        ";</pre>"
    );
}


/* =========================================================
   EXCEL READER
========================================================= */

try {

    $xlsx = new XlsxStreamReader($file);

} catch (Exception $e) {

    $conn->close();

    die(
        "<h3 style='color:red;'>Cannot read Excel file:</h3>" .
        htmlspecialchars($e->getMessage())
    );
}


/* =========================================================
   TEXT CLEANUP

   Tally exports contain control characters such as
   "_x0004_ Not Applicable" / "_x0004_ Primary".
========================================================= */

function cleanText($value)
{
    if ($value === null) {
        return '';
    }

    if ($value instanceof DateTimeInterface) {
        return $value->format("Y-m-d");
    }

    $value = (string)$value;

    $value = preg_replace('/_x[0-9A-Fa-f]{4}_/', '', $value);

    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);

    return trim($value);
}


/* =========================================================
   READ HEADER ROW AND LOCATE COLUMNS
========================================================= */

/* Compare headers ignoring "$", spaces and upper/lower case */

function normalizeHeader($value)
{
    return strtolower(
        str_replace(['$', ' '], '', cleanText($value))
    );
}

$headerRows = $xlsx->readRows(1, 1);

$headerRow = $headerRows[1] ?? [];

$headerRow = empty($headerRow)
    ? []
    : array_replace(array_fill(0, max(array_keys($headerRow)) + 1, null), $headerRow);

unset($headerRows);

$headerIndex = [];

foreach ($headerRow as $index => $header) {

    $header = normalizeHeader($header);

    if ($header !== '' && !isset($headerIndex[$header])) {
        $headerIndex[$header] = $index;
    }
}

$excelColumnCount = count($headerRow);

$missingHeaders = [];

foreach ($columnMap as $key => $map) {

    $header = normalizeHeader($map["excel"]);

    if (!isset($headerIndex[$header])) {
        $missingHeaders[] = $map["excel"];
        continue;
    }

    $columnMap[$key]["index"] = $headerIndex[$header];
}

if (!empty($missingHeaders)) {

    $conn->close();

    die(
        "<h3 style='color:red;'>Excel header(s) not found in row 1:</h3>" .
        "<pre>" . htmlspecialchars(implode("\n", $missingHeaders)) . "</pre>"
    );
}

echo "<strong>Excel Columns:</strong> " .
    number_format($excelColumnCount) .
    "<br>";

echo "<strong>Columns Imported:</strong> " .
    number_format(count($columnMap)) .
    "<br>";

flush();


/* =========================================================
   DETERMINE EXCEL ROW COUNT
========================================================= */

$totalRows = $xlsx->totalRows();

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

if ($isFirstChunk) {

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

}


/* =========================================================
   PREPARED INSERT (built from $columnMap)
========================================================= */

$dbColumns = [];
$bindTypes = "";

foreach ($columnMap as $map) {

    $dbColumns[] = "`" . $map["db"] . "`";

    $bindTypes .= ($map["type"] === "d") ? "d" : "s";
}

$sql =
    "INSERT INTO `salesdata` (" .
    implode(", ", $dbColumns) .
    ") VALUES (" .
    implode(", ", array_fill(0, count($dbColumns), "?")) .
    ")";


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
   SETTINGS
========================================================= */

/* $chunkSize and counters are set at the top (CHUNK-WISE IMPORT) */


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

            $date = new DateTime("1899-12-30");

            $date->modify("+" . (int)floor(floatval($value)) . " days");

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

if ($isFirstChunk) {
    echo "<strong>Starting import...</strong><br><br>";
}

flush();


/* =========================================================
   PROCESS EXCEL IN CHUNKS
========================================================= */

if ($startRow <= $totalRows) {

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

    /* =====================================================
       READ CHUNK
    ===================================================== */

    try {

        $rows = $xlsx->readRows($startRow, $endRow);

    } catch (Exception $e) {

        echo
            "<strong style='color:red;'>
                Excel loading error:
            </strong> " .
            htmlspecialchars($e->getMessage()) .
            "<br>";

        $stmt->close();
        $conn->close();

        exit;
    }


    /* =====================================================
       START TRANSACTION
    ===================================================== */

    $conn->begin_transaction();

    $chunkInserted = 0;
    $chunkErrors = 0;


    /* =====================================================
       PROCESS ROWS
    ===================================================== */

    foreach ($rows as $excelRowNumber => $row) {


        /* =================================================
           SKIP COMPLETELY EMPTY ROWS
        ================================================= */

        $hasData = false;

        foreach ($row as $cell) {

            if (
                $cell !== null &&
                trim((string)$cell) !== ''
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
            $excelRowNumber;


        /* =================================================
           EXCEL -> DATABASE VALUES
        ================================================= */

        $values = [];

        foreach ($columnMap as $map) {

            $cell = $row[$map["index"]] ?? null;

            if ($map["type"] === "d") {

                $values[] = numericOrNull($cell);

            } elseif ($map["type"] === "date") {

                $values[] = convertExcelDate($cell);

            } else {

                $values[] = cleanText($cell);
            }
        }


        /* =================================================
           BIND PARAMETERS
        ================================================= */

        $bindResult = $stmt->bind_param(
            $bindTypes,
            ...$values
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

    unset($rows);

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
   NEXT CHUNK
========================================================= */

$nextStart = $startRow + $chunkSize;

if ($nextStart <= $totalRows) {

    $nextUrl =
        strtok($_SERVER['REQUEST_URI'] ?? basename(__FILE__), '?') .
        '?' .
        http_build_query([
            'start' => $nextStart,
            'ok'    => $successCount,
            'err'   => $errorCount,
            'empty' => $emptyRowCount,
            't'     => $startTime
        ]);

    echo
        "<p><strong>Loading next chunk (rows " .
        number_format($nextStart) .
        " - " .
        number_format(min($nextStart + $chunkSize - 1, $totalRows)) .
        ")...</strong></p>" .
        "<p>If it does not continue automatically, " .
        "<a href='" . htmlspecialchars($nextUrl, ENT_QUOTES) . "'>click here</a>.</p>" .
        "<script>setTimeout(function () { window.location.href = " .
        json_encode($nextUrl) .
        "; }, 500);</script>";

    exit;
}


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
