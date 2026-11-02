<?php
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

$conn = db_connect("tally_db");

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

/* -------------------------
   ALLOWED FILE TYPES
   Images + common documents.
   Scripts (.php etc.) are never allowed.
   Keep in sync with update_po.php and FILE_ACCEPT in POEntry.jsx
--------------------------*/

$allowedExtensions = [
    // images
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "tif", "tiff",
    // documents
    "pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "txt", "odt", "ods"
];

/* -------------------------
   CHECK FILE TYPES FIRST
   (tell the user instead of silently dropping the file)
--------------------------*/

$fileLabels = [
    "quotation_image" => "Quotation file",
    "po_image"        => "PO file",
    "invoice_image"   => "Invoice file"
];

foreach ($fileLabels as $field => $label) {

    if (
        isset($_FILES[$field]) &&
        $_FILES[$field]["error"] == 0
    ) {

        $ext = strtolower(
            pathinfo($_FILES[$field]["name"], PATHINFO_EXTENSION)
        );

        if (!in_array($ext, $allowedExtensions)) {

            echo json_encode([
                "success" => false,
                "message" => "$label: .$ext files are not allowed. Allowed types: " .
                             implode(", ", $allowedExtensions)
            ]);

            exit;
        }
    }
}

function uploadImage($fieldName, $uploadDir, $allowedExtensions)
{
    if (
        isset($_FILES[$fieldName]) &&
        $_FILES[$fieldName]["error"] == 0
    ) {

        $extension = strtolower(
            pathinfo(
                $_FILES[$fieldName]["name"],
                PATHINFO_EXTENSION
            )
        );

        if (!in_array($extension, $allowedExtensions)) {
            return "";
        }

        $fileName =
            time() . "_" .
            rand(1000, 9999) .
            "." .
            $extension;

        if (
            move_uploaded_file(
                $_FILES[$fieldName]["tmp_name"],
                $uploadDir . $fileName
            )
        ) {
            return $fileName;
        }
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
   UPLOAD FILES
--------------------------*/

$quotation_image = uploadImage(
    "quotation_image",
    $uploadDir,
    $allowedExtensions
);

$po_image = uploadImage(
    "po_image",
    $uploadDir,
    $allowedExtensions
);

$invoice_image = uploadImage(
    "invoice_image",
    $uploadDir,
    $allowedExtensions
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
