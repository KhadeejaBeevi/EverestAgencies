<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}


/* =========================
   DATABASE CONNECTION
========================= */

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => $conn->connect_error
    ]);
    exit;
}


/* =========================
   UPLOAD DIRECTORY
========================= */

$uploadDir = __DIR__ . "/uploads/po/";

if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}


/* =========================
   IMAGE UPLOAD FUNCTION
========================= */

function uploadImage($field, $oldFile, $uploadDir)
{
    // No new image selected
    if (
        !isset($_FILES[$field]) ||
        $_FILES[$field]["error"] !== UPLOAD_ERR_OK
    ) {
        return $oldFile;
    }

    $extension = strtolower(
        pathinfo(
            $_FILES[$field]["name"],
            PATHINFO_EXTENSION
        )
    );

    $allowedExtensions = [
        "jpg",
        "jpeg",
        "png",
        "webp"
    ];

    if (!in_array($extension, $allowedExtensions)) {
        return $oldFile;
    }

    $newName =
        time() . "_" .
        rand(1000, 9999) . "." .
        $extension;

    $newPath = $uploadDir . $newName;

    if (
        move_uploaded_file(
            $_FILES[$field]["tmp_name"],
            $newPath
        )
    ) {

        // Delete old image only after new image is successfully uploaded
        if (
            !empty($oldFile) &&
            file_exists($uploadDir . $oldFile)
        ) {
            unlink($uploadDir . $oldFile);
        }

        return $newName;
    }

    return $oldFile;
}


/* =========================
   GET ID
========================= */

$id = intval($_POST["id"] ?? 0);

if ($id <= 0) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid Purchase Order ID"
    ]);
    exit;
}


/* =========================
   GET EXISTING RECORD
========================= */

$stmt = $conn->prepare("
    SELECT
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

    FROM po_details
    WHERE id = ?
");

$stmt->bind_param("i", $id);
$stmt->execute();

$result = $stmt->get_result();
$oldData = $result->fetch_assoc();

$stmt->close();


if (!$oldData) {

    echo json_encode([
        "success" => false,
        "message" => "Purchase Order not found"
    ]);

    exit;
}


/* =========================
   TEXT FIELDS
   KEEP OLD DATA IF EMPTY
========================= */

$area_name =
    !empty($_POST["area_name"])
        ? $_POST["area_name"]
        : $oldData["area_name"];

$area_executive =
    !empty($_POST["area_executive"])
        ? $_POST["area_executive"]
        : $oldData["area_executive"];

$account_status =
    !empty($_POST["account_status"])
        ? $_POST["account_status"]
        : $oldData["account_status"];


/* =========================
   QUOTATION
========================= */

$quotation_number =
    !empty($_POST["quotation_number"])
        ? $_POST["quotation_number"]
        : $oldData["quotation_number"];

$quotation_date =
    !empty($_POST["quotation_date"])
        ? $_POST["quotation_date"]
        : $oldData["quotation_date"];


/* =========================
   PO
========================= */

$po_number =
    !empty($_POST["po_number"])
        ? $_POST["po_number"]
        : $oldData["po_number"];

$po_date =
    !empty($_POST["po_date"])
        ? $_POST["po_date"]
        : $oldData["po_date"];


/* =========================
   INVOICE
========================= */

$invoice_number =
    !empty($_POST["invoice_number"])
        ? $_POST["invoice_number"]
        : $oldData["invoice_number"];

$invoice_date =
    !empty($_POST["invoice_date"])
        ? $_POST["invoice_date"]
        : $oldData["invoice_date"];

$invoice_amount =
    !empty($_POST["invoice_amount"])
        ? $_POST["invoice_amount"]
        : $oldData["invoice_amount"];


/* =========================
   IMAGES
========================= */

$quotation_image = uploadImage(
    "quotation_image",
    $oldData["quotation_image"],
    $uploadDir
);

$po_image = uploadImage(
    "po_image",
    $oldData["po_image"],
    $uploadDir
);

$invoice_image = uploadImage(
    "invoice_image",
    $oldData["invoice_image"],
    $uploadDir
);


/* =========================
   UPDATE DATABASE
========================= */

$sql = "
UPDATE po_details SET

    area_name = ?,
    area_executive = ?,
    account_status = ?,

    quotation_number = ?,
    quotation_date = ?,
    quotation_image = ?,

    po_number = ?,
    po_date = ?,
    po_image = ?,

    invoice_number = ?,
    invoice_date = ?,
    invoice_amount = ?,
    invoice_image = ?

WHERE id = ?
";

$stmt = $conn->prepare($sql);

$stmt->bind_param(
    "sssssssssssssi",

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
    $invoice_image,

    $id
);


if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Purchase Order Updated Successfully"
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