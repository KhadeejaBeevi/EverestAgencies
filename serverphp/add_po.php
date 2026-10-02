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
);

if ($conn->connect_error) {
    die(json_encode([
        "success" => false,
        "message" => $conn->connect_error
    ]));
}

$uploadDir = "uploads/po/";

if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

function uploadImage($fieldName, $uploadDir)
{
    if (
        isset($_FILES[$fieldName]) &&
        $_FILES[$fieldName]["error"] == 0
    ) {

        $extension = pathinfo(
            $_FILES[$fieldName]["name"],
            PATHINFO_EXTENSION
        );

        $fileName =
            time() . "_" .
            rand(1000, 9999) .
            "." .
            $extension;

        move_uploaded_file(
            $_FILES[$fieldName]["tmp_name"],
            $uploadDir . $fileName
        );

        return $fileName;
    }

    return "";
}

/* -------------------------
   POST VALUES
--------------------------*/

$area_name        = $_POST["area_name"] ?? "";
$area_executive   = $_POST["area_executive"] ?? "";
$account_status   = $_POST["account_status"] ?? "";

$quotation_number = $_POST["quotation_number"] ?? "";
$quotation_date   = $_POST["quotation_date"] ?? "";

$po_number        = $_POST["po_number"] ?? "";
$po_date          = $_POST["po_date"] ?? "";

$invoice_number   = $_POST["invoice_number"] ?? "";
$invoice_date     = $_POST["invoice_date"] ?? "";
$invoice_amount   = $_POST["invoice_amount"] ?? "";

/* -------------------------
   UPLOAD IMAGES
--------------------------*/

$quotation_image = uploadImage(
    "quotation_image",
    $uploadDir
);

$po_image = uploadImage(
    "po_image",
    $uploadDir
);

$invoice_image = uploadImage(
    "invoice_image",
    $uploadDir
);

/* -------------------------
   INSERT
--------------------------*/

$sql = "INSERT INTO po_details
(
    area_name,
    area_executive,
    account_status,

    quotation_number,
    quotation_date,
    quotation_image,

    po_number,
    po_date,
    po_image,

    invoice_number,
    invoice_date,
    invoice_amount,
    invoice_image
)

VALUES
(
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?
)";

$stmt = $conn->prepare($sql);

$stmt->bind_param(
    "sssssssssssss",

    $area_name,
    $area_executive,
    $account_status,

    $quotation_number,
    $quotation_date,
    $quotation_image,

    $po_number,
    $po_date,
    $po_image,

    $invoice_number,
    $invoice_date,
    $invoice_amount,
    $invoice_image
);

if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Purchase Order Added Successfully"
    ]);

} else {

    echo json_encode([
        "success" => false,
        "message" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();

?>