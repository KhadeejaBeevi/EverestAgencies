<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}
$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);  // Your database connection
$API_BASE = "/serverphp";
$sql = "
SELECT
    p.id,
    p.area_name,
    p.area_executive,
    p.account_status,
    p.quotation_number,
    p.quotation_date,

    p.quotation_image,

    p.po_number,
    p.po_date,
    p.po_image,

    p.invoice_number,
    p.invoice_date,
    p.invoice_amount,
    p.invoice_image,

 
    p.created_at

FROM po_details p



ORDER BY p.id DESC
";

$result = mysqli_query($conn, $sql);

$data = [];

while ($row = mysqli_fetch_assoc($result)) {

    if (!empty($row["quotation_image"])) {
        $row["quotation_image_url"] =
            $API_BASE . "/uploads/po/" . $row["quotation_image"];
    } else {
        $row["quotation_image_url"] = "";
    }

    if (!empty($row["po_image"])) {
        $row["po_image_url"] =
            $API_BASE . "/uploads/po/" . $row["po_image"];
    } else {
        $row["po_image_url"] = "";
    }

    if (!empty($row["invoice_image"])) {
        $row["invoice_image_url"] =
            $API_BASE . "/uploads/po/" . $row["invoice_image"];
    } else {
        $row["invoice_image_url"] = "";
    }

    $data[] = $row;
}

echo json_encode($data);