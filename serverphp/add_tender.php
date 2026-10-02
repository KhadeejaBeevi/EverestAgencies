<?php
require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]);
    exit();
}

/*
|--------------------------------------------------------------------------
| FORM DATA
|--------------------------------------------------------------------------
*/

$tender_invited_kseb_office =
    trim($_POST["tender_invited_kseb_office"] ?? "");

$opening_date =
    $_POST["opening_date"] ?? "";

$opening_time =
    $_POST["opening_time"] ?? "";

$quotation_notice_no =
    trim($_POST["quotation_notice_no"] ?? "");

$quotation_date =
    $_POST["quotation_date"] ?? "";

$tender_item_data =
    $_POST["tender_item_data"] ?? "";

$quotation_submission_last_date =
    $_POST["quotation_submission_last_date"] ?? "";

$executive_name =
    $_POST["executive_name"] ?? "";

$tender_receipt_email =
    $_POST["tender_receipt_email"] ?? "";

$tender_dispatched_date =
    $_POST["tender_dispatched_date"] ?? "";

$tender_everest_executive_email =
    $_POST["tender_everest_executive_email"] ?? "";

/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
*/

if (
    empty($tender_invited_kseb_office) ||
    empty($quotation_notice_no)
) {
    echo json_encode([
        "success" => false,
        "message" => "Required fields missing"
    ]);
    exit();
}

/*
|--------------------------------------------------------------------------
| DUPLICATE CHECK
|--------------------------------------------------------------------------
|
| Duplicate ONLY when:
|
| 1. KSEB Office is same
| AND
| 2. Quotation Notice Number is same
|
| Same quotation notice number from a DIFFERENT KSEB office
| is allowed.
|--------------------------------------------------------------------------
*/

$duplicateStmt = $conn->prepare("
    SELECT id
    FROM tender_details
    WHERE LOWER(TRIM(tender_invited_kseb_office)) =
          LOWER(TRIM(?))
      AND LOWER(TRIM(quotation_notice_no)) =
          LOWER(TRIM(?))
    LIMIT 1
");

$duplicateStmt->bind_param(
    "ss",
    $tender_invited_kseb_office,
    $quotation_notice_no
);

$duplicateStmt->execute();

$duplicateResult = $duplicateStmt->get_result();

if ($duplicateResult->num_rows > 0) {

    $duplicateRow = $duplicateResult->fetch_assoc();

    echo json_encode([
        "success" => false,
        "duplicate" => true,
        "message" =>
            "Duplicate tender already exists for this KSEB office and quotation notice number.",
        "existing_id" => $duplicateRow["id"]
    ]);

    $duplicateStmt->close();
    $conn->close();
    exit();
}

$duplicateStmt->close();

/*
|--------------------------------------------------------------------------
| PHOTO UPLOAD
|--------------------------------------------------------------------------
*/

$photoName = "";

$uploadDir = __DIR__ . "/uploads/tenders/";

if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

if (
    isset($_FILES["tender_photo"]) &&
    $_FILES["tender_photo"]["error"] === 0
) {

    $originalName = basename($_FILES["tender_photo"]["name"]);

    $extension = pathinfo(
        $originalName,
        PATHINFO_EXTENSION
    );

    $photoName =
        time() .
        "_" .
        uniqid() .
        "." .
        $extension;

    move_uploaded_file(
        $_FILES["tender_photo"]["tmp_name"],
        $uploadDir . $photoName
    );
}

/*
|--------------------------------------------------------------------------
| INSERT
|--------------------------------------------------------------------------
*/

$stmt = $conn->prepare("
    INSERT INTO tender_details (
        tender_invited_kseb_office,
        opening_date,
        opening_time,
        quotation_notice_no,
        quotation_date,
        tender_item_data,
        quotation_submission_last_date,
        tender_photo,
        executive_name,
        tender_receipt_email,
        tender_dispatched_date,
        tender_everest_executive_email
    )
    VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
");

$stmt->bind_param(
    "ssssssssssss",
    $tender_invited_kseb_office,
    $opening_date,
    $opening_time,
    $quotation_notice_no,
    $quotation_date,
    $tender_item_data,
    $quotation_submission_last_date,
    $photoName,
    $executive_name,
    $tender_receipt_email,
    $tender_dispatched_date,
    $tender_everest_executive_email
);

if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Tender added successfully",
        "insert_id" => $conn->insert_id
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