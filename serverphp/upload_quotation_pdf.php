<?php

// Saves a quotation PDF generated in the browser (QuotationWise.jsx)
// and returns a public link that is sent to the customer on WhatsApp.

require_once __DIR__ . '/api_auth.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

// Public address customers use to open the PDF from WhatsApp.
// Set this to your internet-facing domain, e.g. "https://crm.everestagencies.in".
// When empty, the address of the current request is used.
$PUBLIC_BASE_URL = "";

$MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function respond($status, $data)
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    respond(405, ["success" => false, "message" => "POST required"]);
}

if (!isset($_FILES["pdf"])) {
    respond(400, [
        "success" => false,
        "message" => "PDF file is missing (post_max_size=" . ini_get("post_max_size") . ")"
    ]);
}

if ($_FILES["pdf"]["error"] !== UPLOAD_ERR_OK) {
    $uploadErrors = [
        UPLOAD_ERR_INI_SIZE => "PDF is larger than upload_max_filesize (" . ini_get("upload_max_filesize") . ") in php.ini",
        UPLOAD_ERR_FORM_SIZE => "PDF is larger than the form limit",
        UPLOAD_ERR_PARTIAL => "PDF was only partly uploaded",
        UPLOAD_ERR_NO_FILE => "No PDF was uploaded",
        UPLOAD_ERR_NO_TMP_DIR => "PHP has no temporary upload folder (upload_tmp_dir)",
        UPLOAD_ERR_CANT_WRITE => "PHP could not write the upload to disk",
        UPLOAD_ERR_EXTENSION => "A PHP extension stopped the upload"
    ];
    respond(400, [
        "success" => false,
        "message" => $uploadErrors[$_FILES["pdf"]["error"]] ?? "PDF upload error " . $_FILES["pdf"]["error"]
    ]);
}

$file = $_FILES["pdf"];

if ($file["size"] <= 0 || $file["size"] > $MAX_SIZE) {
    respond(400, ["success" => false, "message" => "Invalid PDF size"]);
}

// Only accept real PDF files.
$handle = fopen($file["tmp_name"], "rb");
$signature = $handle ? fread($handle, 5) : "";
if ($handle) {
    fclose($handle);
}

if ($signature !== "%PDF-") {
    respond(400, ["success" => false, "message" => "Uploaded file is not a PDF"]);
}

$quotationNo = trim($_POST["quotation_no"] ?? "");
$safeQuotation = preg_replace('/[^A-Za-z0-9_-]+/', '_', $quotationNo);
$safeQuotation = trim($safeQuotation, "_");
if ($safeQuotation === "") {
    $safeQuotation = "Quotation";
}

// Random token so links cannot be guessed from the quotation number.
$fileName = "Quotation_" . substr($safeQuotation, 0, 60) . "_" . bin2hex(random_bytes(8)) . ".pdf";

$targetDir = __DIR__ . "/quotation_pdfs";
if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true)) {
    respond(500, ["success" => false, "message" => "Cannot create folder " . $targetDir . " (check write permission)"]);
}

if (!move_uploaded_file($file["tmp_name"], $targetDir . "/" . $fileName)) {
    respond(500, ["success" => false, "message" => "Failed to save PDF in " . $targetDir . " (check write permission)"]);
}

if ($PUBLIC_BASE_URL !== "") {
    $baseUrl = rtrim($PUBLIC_BASE_URL, "/");
} else {
    $isHttps = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off")
        || (($_SERVER["HTTP_X_FORWARDED_PROTO"] ?? "") === "https");
    $scheme = $isHttps ? "https" : "http";
    $scriptDir = rtrim(str_replace("\\", "/", dirname($_SERVER["SCRIPT_NAME"])), "/");
    $baseUrl = $scheme . "://" . $_SERVER["HTTP_HOST"] . $scriptDir;
}

respond(200, [
    "success" => true,
    "file_name" => $fileName,
    "url" => $baseUrl . "/quotation_pdfs/" . rawurlencode($fileName)
]);
