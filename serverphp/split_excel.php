<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json");

// AUTOLOAD
require __DIR__ . '/vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$inputFile = __DIR__ . "/kseb.xlsx";

// CHECK FILE EXISTS
if (!file_exists($inputFile)) {

    echo json_encode([
        "success" => false,
        "message" => "kseb.xlsx file not found"
    ]);

    exit;
}

// LOAD EXCEL
$spreadsheet = IOFactory::load($inputFile);

$sheet = $spreadsheet->getActiveSheet();

$data = $sheet->toArray();

// HEADER
$header = array_map('trim', $data[0]);

$salesIndex = array_search('Sales Executive', $header);
$distributionIndex = array_search('Distribution', $header);
$circleIndex = array_search('Circle', $header);
$divisionIndex = array_search('Division', $header);
$subdivisionIndex = array_search('Subdivision', $header);

// REMOVE HEADER
array_shift($data);

// OUTPUT FOLDER
$outputDir = __DIR__ . "/outputs";

if (!file_exists($outputDir)) {

    mkdir($outputDir, 0777, true);

}

// GROUP DATA
$groupedData = [];

foreach ($data as $row) {

    $executive = trim($row[$salesIndex]);

    if ($executive == "") {
        continue;
    }

    $groupedData[$executive][] = [
        $row[$distributionIndex] ?? '',
        $row[$circleIndex] ?? '',
        $row[$divisionIndex] ?? '',
        $row[$subdivisionIndex] ?? ''
    ];
}

// CREATE FILES
$files = [];

foreach ($groupedData as $executive => $rows) {

    $newSpreadsheet = new Spreadsheet();

    $newSheet = $newSpreadsheet->getActiveSheet();

    // HEADER
    $newSheet->fromArray(
        ['Distribution', 'Circle', 'Division', 'Subdivision'],
        NULL,
        'A1'
    );

    // DATA
    $newSheet->fromArray($rows, NULL, 'A2');

    // SAFE NAME
    $safeName = preg_replace('/[^A-Za-z0-9]/', '_', $executive);

    $filePath = $outputDir . "/" . $safeName . ".xlsx";

    // SAVE
    $writer = new Xlsx($newSpreadsheet);

    $writer->save($filePath);

    $files[] = [
        "executive" => $executive,
        "file" => "outputs/" . $safeName . ".xlsx"
    ];
}

// RESPONSE
echo json_encode([
    "success" => true,
    "total_files" => count($files),
    "files" => $files
]);

exit;