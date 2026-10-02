<?php
require_once __DIR__ . '/api_auth.php';
require 'vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;

$conn = new mysqli("localhost", "root", "", "tally_DB");

// 🔥 Clear table before import
$conn->query("TRUNCATE TABLE kseb_directory");

$filePath = __DIR__ . "/kseb.xlsx";
$spreadsheet = IOFactory::load($filePath);
$sheet = $spreadsheet->getActiveSheet();
$data = $sheet->toArray();

$stmt = $conn->prepare("
    INSERT INTO kseb_directory (
        PARENT_AREA, PLACE, AREA,
        RECEIPTION_CUG, RECEIPTION_LAND,
        DATE, NAME, CHIEF_ENGINEER,
        `DEPUTY_CHIEF_ENGINEER_OFF_PER`,
        EXECUTIVE_ENGINEER,
        ASSISTANT_EXECUTIVE_ENGINEER,
        ASSISTANT_ENGINEER,
        SUB_REGIONAL_STORE,
        SRS_ASSISTANT_EXECUTIVE_ENGINEER,
        ASSIST_ACCOUNTS_OFFICER_AAO,
        MAIL_ID,
        SALES_EXECUTIVE
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)
");


$current_parent = "";

foreach ($data as $index => $row) {
    if ($index < 1) continue;

    $row = array_map(fn($v) => trim((string)$v), $row);

    if (count(array_filter($row)) === 0) continue;

    $parent_area = $row[0] ?? '';
    $place  = $row[1] ?? '';
    $area   = $row[2] ?? '';

    if ($parent_area !== "") {
        $current_parent = $parent_area;
    }

    if ($place === '' || $current_parent === '') continue;
    
$stmt->bind_param(
    "sssssssssssssssss",
    $current_parent,
    $place,
    $area,
    $row[3],  // RECEIPTION_CUG
    $row[4],  // RECEIPTION_LAND
    $row[5],  // DATE
    $row[6],  // NAME
    $row[7],  // CHIEF_ENGINEER
    $row[8],  // DEPUTY
    $row[9],  // EXECUTIVE
    $row[10], // ASSISTANT_EXECUTIVE
    $row[11], // ASSISTANT_ENGINEER
    $row[12], // SUB_REGIONAL_STORE
    $row[13], // SRS
    $row[14], // AAO
    $row[15], // MAIL_ID
    $row[16]  // SALES_EXECUTIVE
);


    $stmt->execute();
}

echo json_encode(["status" => "imported"]);
?>