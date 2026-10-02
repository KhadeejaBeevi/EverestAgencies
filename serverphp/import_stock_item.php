<?php

require_once __DIR__ . '/../vendor/autoload.php';
$conn = new mysqli("localhost", "root", "", "salescollection"); // Change DB if needed

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}


use PhpOffice\PhpSpreadsheet\IOFactory;

$spreadsheet = IOFactory::load("EverestCRMStockItem.xlsx");
$rows = $spreadsheet->getActiveSheet()->toArray();

$first = true;

foreach ($rows as $row) {

    // Skip header
    if ($first) {
        $first = false;
        continue;
    }

    $StockItemName  = trim($row[0]);
    $Parent         = trim($row[1]);
    $Category       = trim($row[2]);

    $OpeningBalance = ($row[5] == "") ? 0 : $row[5];
    $OpeningRate    = ($row[6] == "") ? 0 : $row[6];
    $OpeningValue   = ($row[7] == "") ? 0 : $row[7];

    // Use $_EveSellPrice if available, otherwise $_EveSellingPrice
    $EveSellPrice   = ($row[10] != "") ? $row[10] : $row[8];

    $EveCostPrice   = ($row[9] == "") ? 0 : $row[9];

    $Brand          = trim($row[12]);
    $SIMstID        = ($row[13] == "") ? NULL : $row[13];

    // Skip empty rows
    if ($StockItemName == "") {
        continue;
    }

    $stmt = $conn->prepare("
        INSERT INTO crm_stock_item
        (
            StockItemName,
            Parent,
            Category,
            _EveProdBrand,
            _EveSIMstID,
            EveCostPrice,
            EveSellPrice,
            OpeningBalance,
            OpeningRate,
            OpeningValue
        )
        VALUES (?,?,?,?,?,?,?,?,?,?)
    ");

    $stmt->bind_param(
        "ssssiddddd",
        $StockItemName,
        $Parent,
        $Category,
        $Brand,
        $SIMstID,
        $EveCostPrice,
        $EveSellPrice,
        $OpeningBalance,
        $OpeningRate,
        $OpeningValue
    );

    $stmt->execute();
}

echo "Stock Items Imported Successfully.";
?>