<?php
/**
 * Everest Agencies - KSEB Receipts Excel Import
 * Imports the first worksheet of EverestKSEBRcpts.xlsx into salescollection.kseb_receipts.
 * Requires db_connect.php with db_pdo(), plus PHP ZipArchive and XMLReader extensions.
 *
 * IMPORTANT: A fresh import truncates kseb_receipts before importing. Back up the table first.
 */

require_once __DIR__ . '/db_connect.php';
date_default_timezone_set('Asia/Kolkata');
@set_time_limit(0);
@ini_set('memory_limit', '1024M');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

while (ob_get_level()) { @ob_end_flush(); }
@ini_set('zlib.output_compression', '0');
@ini_set('output_buffering', '0');
@ini_set('implicit_flush', '1');
ob_implicit_flush(true);
header('Content-Type: text/html; charset=UTF-8');
header('X-Accel-Buffering: no');
header('Cache-Control: no-cache');
echo str_repeat(' ', 4096) . "\n";
flush();

$chunkSize = 10000;
$startRow = max(2, (int)($_GET['start'] ?? 2));
$successCount = max(0, (int)($_GET['ok'] ?? 0));
$errorCount = max(0, (int)($_GET['err'] ?? 0));
$emptyRowCount = max(0, (int)($_GET['empty'] ?? 0));
$startTime = isset($_GET['t']) ? (float)$_GET['t'] : microtime(true);
$isFirstChunk = !isset($_GET['start']);
$table = 'kseb_receipts';

class XlsxStreamReader {
    private string $file;
    private string $sheetPath = 'xl/worksheets/sheet1.xml';
    private array $strings = [];

    public function __construct(string $file) {
        $real = realpath($file);
        if ($real === false) throw new Exception('Excel file not found.');
        $this->file = $real;
        $zip = new ZipArchive();
        if ($zip->open($this->file) !== true) throw new Exception('Cannot open Excel file.');
        $this->sheetPath = $this->findFirstSheet($zip);
        if ($zip->locateName($this->sheetPath) === false) {
            $zip->close();
            throw new Exception('Excel worksheet not found: ' . $this->sheetPath);
        }
        $hasStrings = $zip->locateName('xl/sharedStrings.xml') !== false;
        $zip->close();
        if ($hasStrings) $this->loadSharedStrings();
    }

    private function findFirstSheet(ZipArchive $zip): string {
        $workbook = $zip->getFromName('xl/workbook.xml');
        $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
        if ($workbook === false || $rels === false ||
            !preg_match('/<sheet\b[^>]*\br:id="([^"]+)"/i', $workbook, $sheetMatch)) {
            return 'xl/worksheets/sheet1.xml';
        }
        if (preg_match_all('/<Relationship\b[^>]*\/?\s*>/i', $rels, $matches)) {
            foreach ($matches[0] as $tag) {
                if (preg_match('/\bId="([^"]+)"/i', $tag, $idMatch) &&
                    $idMatch[1] === $sheetMatch[1] &&
                    preg_match('/\bTarget="([^"]+)"/i', $tag, $targetMatch)) {
                    $target = str_replace('\\', '/', $targetMatch[1]);
                    if (str_starts_with($target, '/')) return ltrim($target, '/');
                    if (str_starts_with($target, 'xl/')) return $target;
                    return 'xl/' . ltrim($target, '/');
                }
            }
        }
        return 'xl/worksheets/sheet1.xml';
    }

    private function openXml(string $entry): XMLReader {
        $reader = new XMLReader();
        $uri = 'zip://' . $this->file . '#' . $entry;
        if (!$reader->open($uri, null, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) {
            throw new Exception('Cannot read Excel XML: ' . $entry);
        }
        return $reader;
    }

    private static function nodeText($node): string {
        $text = '';
        if (!$node) return $text;
        foreach ($node->getElementsByTagName('t') as $t) {
            if ($t->parentNode && $t->parentNode->localName === 'rPh') continue;
            $text .= $t->textContent;
        }
        return $text;
    }

    private function loadSharedStrings(): void {
        $reader = $this->openXml('xl/sharedStrings.xml');
        while ($reader->read()) {
            if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'si') {
                $this->strings[] = self::nodeText($reader->expand());
            }
        }
        $reader->close();
    }

    private static function columnIndex(string $ref): int {
        $letters = strtoupper(preg_replace('/[^A-Za-z]/', '', $ref));
        $index = 0;
        for ($i = 0, $n = strlen($letters); $i < $n; $i++) {
            $index = $index * 26 + ord($letters[$i]) - 64;
        }
        return $index - 1;
    }

    private function cellValue($cell) {
        $type = $cell->getAttribute('t');
        if ($type === 'inlineStr') return self::nodeText($cell);
        $value = null;
        foreach ($cell->childNodes as $child) {
            if ($child->localName === 'v') { $value = $child->textContent; break; }
        }
        if ($value === null) return null;
        if ($type === 's') return $this->strings[(int)$value] ?? '';
        if ($type === 'b') return $value === '1' ? '1' : '0';
        return $value;
    }

    private function parseRow($node): array {
        $row = [];
        $next = 0;
        foreach ($node->childNodes as $cell) {
            if ($cell->localName !== 'c') continue;
            $ref = $cell->getAttribute('r');
            $column = $ref !== '' ? self::columnIndex($ref) : $next;
            $row[$column] = $this->cellValue($cell);
            $next = $column + 1;
        }
        return $row;
    }

    public function readRows(int $from, int $to): array {
        $rows = [];
        $reader = $this->openXml($this->sheetPath);
        while ($reader->read()) {
            if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'row') break;
        }
        while ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'row') {
            $rowNumber = (int)$reader->getAttribute('r');
            if ($rowNumber <= 0) $rowNumber = empty($rows) ? 1 : max(array_keys($rows)) + 1;
            if ($rowNumber > $to) break;
            if ($rowNumber >= $from) {
                $node = $reader->expand();
                $rows[$rowNumber] = $node ? $this->parseRow($node) : [];
            }
            if (!$reader->next('row')) break;
        }
        $reader->close();
        ksort($rows);
        return $rows;
    }

    public function totalRows(): int {
        $reader = $this->openXml($this->sheetPath);
        $last = 0;
        while ($reader->read()) {
            if ($reader->nodeType !== XMLReader::ELEMENT) continue;
            if ($reader->localName === 'dimension') {
                $ref = (string)$reader->getAttribute('ref');
                if (preg_match('/:\s*[A-Z]+([0-9]+)$/i', $ref, $m) ||
                    preg_match('/:[A-Z]+([0-9]+)$/i', $ref, $m)) {
                    $reader->close();
                    return (int)$m[1];
                }
            }
            if ($reader->localName === 'row') break;
        }
        while ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'row') {
            $r = $reader->getAttribute('r');
            $last = ($r !== null && $r !== '') ? (int)$r : $last + 1;
            if (!$reader->next('row')) break;
        }
        $reader->close();
        return $last;
    }
}

function cleanText($value): string {
    if ($value === null) return '';
    $value = (string)$value;
    $value = preg_replace('/_x[0-9A-Fa-f]{4}_/', '', $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
    return trim($value);
}

function normalizeHeader($value): string {
    return strtolower(preg_replace('/[^a-z0-9]/i', '', cleanText($value)));
}

function convertExcelDate($value): ?string {
    if ($value === null || trim((string)$value) === '') return null;
    if (is_numeric($value) && $value > 1000 && $value < 100000) {
        $date = new DateTime('1899-12-30');
        $date->modify('+' . (int)floor((float)$value) . ' days');
        return $date->format('Y-m-d');
    }
    $value = trim((string)$value);
    foreach (['Y-m-d', 'd-m-Y', 'd/m/Y', 'd.m.Y', 'Y/m/d', 'd-M-Y', 'd-M-y', 'd M Y', 'm/d/Y'] as $format) {
        $date = DateTime::createFromFormat($format, $value);
        if ($date) {
            $errors = DateTime::getLastErrors();
            if ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0)) {
                return $date->format('Y-m-d');
            }
        }
    }
    $timestamp = strtotime($value);
    return $timestamp === false ? null : date('Y-m-d', $timestamp);
}

function numericOrNull($value): ?float {
    if ($value === null || trim((string)$value) === '') return null;
    $value = str_replace([',', '₹', ' '], '', (string)$value);
    return is_numeric($value) ? (float)$value : null;
}

function out(string $text): void { echo $text; flush(); }
function h(string $text): string { return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

if (!class_exists('ZipArchive') || !class_exists('XMLReader')) {
    die('<h3>Enable PHP zip and xmlreader extensions.</h3>');
}

$file = __DIR__ . '/EverestKSEBRcpts.xlsx';
if (!is_file($file)) {
    $files = glob(__DIR__ . '/*KSEB*Rcpt*.xlsx');
    if ($files) $file = $files[0];
    else die('<h3 style="color:red">Excel file not found.</h3><p>Place EverestKSEBRcpts.xlsx in the same folder as this PHP file.</p>');
}

try {
    $pdo = db_pdo('salescollection', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
} catch (Throwable $e) {
    error_log('KSEB RECEIPT IMPORT DB ERROR: ' . $e->getMessage());
    die('<h3 style="color:red">Database connection failed. Check db_connect.php.</h3>');
}

try {
    $exists = $pdo->query("SHOW TABLES LIKE 'kseb_receipts'")->fetch();
    if (!$exists) die('<h3 style="color:red">Table kseb_receipts does not exist in salescollection.</h3>');
} catch (Throwable $e) {
    die('<h3 style="color:red">Could not check destination table.</h3>');
}

$required = ['MasterId', 'VoucherId', 'VoucherTypeName', 'Date', 'VoucherNumber', 'Reference', 'PartyLedgerName', 'LedgerName', 'Amount', 'BillDate', 'BillName', 'BillType', 'BillCreditPeriod', 'IsBankLedger'];
$existing = [];
foreach ($pdo->query('SHOW COLUMNS FROM `kseb_receipts`')->fetchAll() as $column) $existing[$column['Field']] = true;
$missing = array_values(array_diff($required, array_keys($existing)));
if ($missing) die('<h3 style="color:red">Missing columns in kseb_receipts: ' . h(implode(', ', $missing)) . '</h3>');

try {
    $xlsx = new XlsxStreamReader($file);
    $headerRows = $xlsx->readRows(1, 1);
    $headerRow = $headerRows[1] ?? [];
    $headerIndex = [];
    foreach ($headerRow as $index => $header) {
        $normalized = normalizeHeader($header);
        if ($normalized !== '') $headerIndex[$normalized] = $index;
    }
} catch (Throwable $e) {
    die('<h3 style="color:red">Excel read error: ' . h($e->getMessage()) . '</h3>');
}

// Destination column => normalized Tally Excel header suffix and conversion type.
$map = [
    'MasterId'        => ['masterid', 's'],
    'VoucherId'       => ['voucherid', 's'],
    'VoucherTypeName' => ['vouchertypename', 's'],
    'Date'            => ['date', 'date'],
    'VoucherNumber'   => ['vouchernumber', 's'],
    'Reference'       => ['reference', 's'],
    'PartyLedgerName' => ['partyledgername', 's'],
    'LedgerName'      => ['ledgername', 's'],
    'Amount'          => ['amount', 'num'],
    'BillDate'        => ['billdate', 'date'],
    'BillName'        => ['name', 's'],
    'BillType'        => ['billtype', 's'],
    'BillCreditPeriod'=> ['billcreditperiod', 'num'],
    'IsBankLedger'    => ['eveisbelongstobankacc', 'num']
];

/*
 * FIX: Resolve the most specific suffix first and never reuse an Excel column.
 * Otherwise PartyLedgerName can be selected for LedgerName because the former
 * also ends with "ledgername". The same protection helps other suffixes such as "name".
 */
$mapForResolution = $map;
uasort($mapForResolution, function ($a, $b) {
    return strlen($b[0]) <=> strlen($a[0]);
});
$resolved = [];
$missingHeaders = [];
$usedIndexes = [];
foreach ($mapForResolution as $dbColumn => $config) {
    $suffix = $config[0];
    $found = null;
    foreach ($headerIndex as $normalizedHeader => $excelIndex) {
        if (isset($usedIndexes[$excelIndex])) continue;
        if ($normalizedHeader === $suffix || str_ends_with($normalizedHeader, $suffix)) {
            $found = $excelIndex;
            break;
        }
    }
    if ($found === null) {
        $missingHeaders[] = $suffix;
    } else {
        $resolved[] = ['db' => $dbColumn, 'index' => $found, 'type' => $config[1]];
        $usedIndexes[$found] = true;
    }
}
if ($missingHeaders) {
    die('<h3 style="color:red">Excel headers not found: ' . h(implode(', ', $missingHeaders)) . '</h3>');
}

// Preserve destination table column order for readability; values still use the resolved indexes.
$mapOrder = array_flip(array_keys($map));
usort($resolved, function ($a, $b) use ($mapOrder) {
    return $mapOrder[$a['db']] <=> $mapOrder[$b['db']];
});

$totalRows = $xlsx->totalRows();
$expected = max(0, $totalRows - 1);
out('<!doctype html><html><head><meta charset="utf-8"><title>KSEB Receipts Import</title></head><body>');
out('<h2>KSEB Receipts Excel Import</h2>');
out('<b>File:</b> ' . h(basename($file)) . '<br>');
out('<b>Destination table:</b> kseb_receipts<br>');
out('<b>Total Excel rows:</b> ' . number_format($totalRows) . '<br>');
out('<b>Expected data rows:</b> ' . number_format($expected) . '<br>');
out('<b>Columns mapped:</b> ' . count($resolved) . '<br><br>');

// Clear the destination table only when starting a fresh import.
if ($isFirstChunk) {
    out('<b>Clearing old kseb_receipts data...</b><br>');
    try {
        $pdo->exec('TRUNCATE TABLE `kseb_receipts`');
        out('Old data cleared.<br><br>');
    } catch (Throwable $e) {
        error_log('KSEB receipt import truncate error: ' . $e->getMessage());
        die('<p style="color:red">Could not clear kseb_receipts. Check table permissions and foreign keys.</p>');
    }
}

$insertColumns = array_map(fn($item) => '`' . $item['db'] . '`', $resolved);
$sql = 'INSERT INTO `kseb_receipts` (' . implode(',', $insertColumns) . ') VALUES (' . implode(',', array_fill(0, count($insertColumns), '?')) . ')';
$stmt = $pdo->prepare($sql);

if ($startRow <= $totalRows) {
    $endRow = min($startRow + $chunkSize - 1, $totalRows);
    out('<b>Processing rows ' . number_format($startRow) . ' - ' . number_format($endRow) . '...</b><br>');
    $rows = $xlsx->readRows($startRow, $endRow);
    $chunkInserted = 0;
    $pdo->beginTransaction();
    try {
        foreach ($rows as $excelRow => $row) {
            $hasData = false;
            foreach ($row as $cell) {
                if ($cell !== null && trim((string)$cell) !== '') { $hasData = true; break; }
            }
            if (!$hasData) { $emptyRowCount++; continue; }
            $values = [];
            foreach ($resolved as $item) {
                $value = $row[$item['index']] ?? null;
                if ($item['type'] === 'date') $values[] = convertExcelDate($value);
                elseif ($item['type'] === 'num') $values[] = numericOrNull($value);
                else $values[] = cleanText($value) === '' ? null : cleanText($value);
            }
            try {
                $stmt->execute($values);
                $successCount++;
                $chunkInserted++;
            } catch (Throwable $e) {
                $errorCount++;
                error_log('KSEB receipt import row ' . $excelRow . ': ' . $e->getMessage());
                out('<div style="color:#b91c1c">Insert error at Excel row ' . (int)$excelRow . ': ' . h($e->getMessage()) . '</div>');
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('KSEB receipt import chunk error: ' . $e->getMessage());
        die('<p style="color:red">Chunk failed and was rolled back: ' . h($e->getMessage()) . '</p>');
    }

    out('<p style="color:#166534">Chunk committed. Inserted this chunk: ' . number_format($chunkInserted) . '</p>');
    $percent = $totalRows ? ($endRow / $totalRows * 100) : 100;
    $elapsed = microtime(true) - $startTime;
    out('<hr><b>Progress:</b> ' . number_format($percent, 2) . '%<br>');
    out('<b>Total imported:</b> ' . number_format($successCount) . '<br>');
    out('<b>Empty rows skipped:</b> ' . number_format($emptyRowCount) . '<br>');
    out('<b>Errors:</b> ' . number_format($errorCount) . '<br>');
    out('<b>Elapsed:</b> ' . gmdate('H:i:s', (int)$elapsed) . '<br>');

    $nextStart = $endRow + 1;
    if ($nextStart <= $totalRows) {
        $baseUrl = strtok($_SERVER['REQUEST_URI'] ?? basename(__FILE__), '?');
        $url = $baseUrl . '?' . http_build_query([
            'start' => $nextStart,
            'ok' => $successCount,
            'err' => $errorCount,
            'empty' => $emptyRowCount,
            't' => $startTime
        ]);
        out('<p>Loading next chunk...</p><p><a href="' . h($url) . '">Continue manually</a></p>');
        out('<script>setTimeout(function(){window.location.href=' . json_encode($url) . ';},500);</script>');
        out('</body></html>');
        exit;
    }
}

$elapsed = microtime(true) - $startTime;
out('<hr><h2 style="color:green">Import Completed</h2>');
out('<b>Total Excel rows:</b> ' . number_format($totalRows) . '<br>');
out('<b>Expected data rows:</b> ' . number_format($expected) . '<br>');
out('<b>Total imported:</b> ' . number_format($successCount) . '<br>');
out('<b>Empty rows skipped:</b> ' . number_format($emptyRowCount) . '<br>');
out('<b>Total errors:</b> ' . number_format($errorCount) . '<br>');
out('<b>Total time:</b> ' . gmdate('H:i:s', (int)$elapsed) . '<br><br>');
out($errorCount === 0
    ? '<strong style="color:green">IMPORT COMPLETED SUCCESSFULLY.</strong>'
    : '<strong style="color:#b45309">Import completed. Please check the error count and PHP error log.</strong>');
out('</body></html>');
?>
