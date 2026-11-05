<?php

/*
|--------------------------------------------------------------------------
| KSEB INVOICE DOCUMENTS + TRACKING
|--------------------------------------------------------------------------
|
| Used by the KSEB Invoices page (KSEBPayment.jsx).
|
| Every request is a POST with an "action":
|
|   summary      -> current step + document count for every invoice
|   get          -> documents and tracking steps of one invoice
|   upload       -> upload a document (multipart/form-data, field "file")
|   delete_doc   -> delete one document
|   save_step    -> add a tracking step (once saved it cannot be changed)
|   download     -> send the file of one document
|
| Documents are saved in:  uploads/kseb_invoices/   (next to this file)
| Tables (created automatically in the salescollection database):
|
|   kseb_invoice_documents
|   kseb_invoice_tracking
|
*/

ini_set('display_errors', 0);
error_reporting(E_ALL);
ob_start();

@set_time_limit(120);

const KSEB_TRACK_JSON_FLAGS =
    JSON_UNESCAPED_UNICODE |
    JSON_UNESCAPED_SLASHES |
    JSON_INVALID_UTF8_SUBSTITUTE;

register_shutdown_function(function () {
    $e = error_get_last();

    if (
        $e &&
        in_array(
            $e['type'],
            [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR],
            true
        )
    ) {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        if (!headers_sent()) {
            http_response_code(500);
            header("Content-Type: application/json; charset=UTF-8");
        }

        echo json_encode(
            [
                "success" => false,
                "message" => $e['message'] . " (" . basename($e['file']) . " line " . $e['line'] . ")"
            ],
            KSEB_TRACK_JSON_FLAGS
        );
    }
});


/*
|--------------------------------------------------------------------------
| SHARED DB CONNECTION (OPTIONAL) + API KEY
|--------------------------------------------------------------------------
*/

if (file_exists(__DIR__ . '/db_connect.php')) {
    require_once __DIR__ . '/db_connect.php';
}

require_once __DIR__ . '/api_auth.php';

if (ob_get_length()) {
    ob_clean();
}

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

mysqli_report(MYSQLI_REPORT_OFF);


/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

// Biggest file that can be uploaded (15 MB).
// php.ini upload_max_filesize / post_max_size must also allow this.
const KSEB_MAX_FILE_SIZE = 15 * 1024 * 1024;

// Folder where documents are saved.
define('KSEB_UPLOAD_DIR', __DIR__ . '/uploads/kseb_invoices');

// Document types shown in the upload drop-down.
const KSEB_DOC_TYPES = [
    "PO"             => "Purchase Order (PO)",
    "INVOICE"        => "Invoice",
    "DD"             => "Demand Draft (DD)",
    "BANK_GUARANTEE" => "Bank Guarantee",
    "DELIVERY_NOTE"  => "Delivery Note / DC",
    "OTHER"          => "Other"
];

// KSEB tracking steps, in order.
// To add, remove or rename a step, change this list only.
const KSEB_TRACKING_STEPS = [
    "BILL_GENERATED"      => "Bill Generated",
    "MATERIAL_DELIVERED"  => "Material Delivered",
    "BILL_SUBMITTED"      => "Bill Submitted to KSEB",
    "BILL_VERIFIED"       => "Bill Verified / Passed",
    "SENT_TO_ACCOUNTS"    => "Forwarded to Accounts",
    "PAYMENT_SANCTIONED"  => "Payment Sanctioned",
    "PAYMENT_COMPLETED"   => "Payment Completed"
];

// The invoice IS the bill, so this step is always done and its date
// is the invoice date. It cannot be edited or undone.
const KSEB_AUTO_STEP = "BILL_GENERATED";

// File types that can be uploaded.
const KSEB_ALLOWED_EXTENSIONS = [
    "pdf"  => ["application/pdf"],
    "jpg"  => ["image/jpeg"],
    "jpeg" => ["image/jpeg"],
    "png"  => ["image/png"],
    "webp" => ["image/webp"],
    "gif"  => ["image/gif"]
];


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function kseb_respond(int $status, array $data): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    http_response_code($status);
    header("Content-Type: application/json; charset=UTF-8");

    echo json_encode($data, KSEB_TRACK_JSON_FLAGS);
    exit;
}

function kseb_fail(string $message, int $status = 400): void
{
    kseb_respond($status, [
        "success" => false,
        "message" => $message
    ]);
}

function kseb_text($value, int $maxLength = 255): string
{
    $value = trim((string)($value ?? ""));

    if (function_exists("mb_substr")) {
        return mb_substr($value, 0, $maxLength, "UTF-8");
    }

    return substr($value, 0, $maxLength);
}

// Invoice numbers are matched case-insensitively,
// the same way kseb_payment.php groups them.
function kseb_invoice_key($value): string
{
    $value = trim((string)($value ?? ""));

    return function_exists("mb_strtolower")
        ? mb_strtolower($value, "UTF-8")
        : strtolower($value);
}

function kseb_valid_date($value): ?string
{
    $value = trim((string)($value ?? ""));

    if ($value === "") {
        return null;
    }

    $date = DateTime::createFromFormat("Y-m-d", $value);

    return ($date && $date->format("Y-m-d") === $value)
        ? $value
        : null;
}

// Invoice date sent by the page (YYYY-MM-DD or DD-MM-YYYY) -> YYYY-MM-DD.
function kseb_invoice_date($value): string
{
    $value = trim((string)($value ?? ""));

    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $value, $m)) {
        return $m[1] . "-" . $m[2] . "-" . $m[3];
    }

    if (preg_match('/^(\d{2})[-\/](\d{2})[-\/](\d{4})/', $value, $m)) {
        return $m[3] . "-" . $m[2] . "-" . $m[1];
    }

    $time = $value !== "" ? strtotime($value) : false;

    return $time ? date("Y-m-d", $time) : "";
}

function kseb_steps_list(): array
{
    $steps = [];

    foreach (KSEB_TRACKING_STEPS as $key => $label) {
        $steps[] = [
            "key" => $key,
            "label" => $label
        ];
    }

    return $steps;
}

function kseb_doc_types_list(): array
{
    $types = [];

    foreach (KSEB_DOC_TYPES as $key => $label) {
        $types[] = [
            "key" => $key,
            "label" => $label
        ];
    }

    return $types;
}

function kseb_document_row(array $row): array
{
    $type = (string)$row["doc_type"];

    return [
        "id" => (int)$row["id"],
        "invoice_no" => (string)$row["invoice_no"],
        "doc_type" => $type,
        "doc_type_label" => KSEB_DOC_TYPES[$type] ?? $type,
        "original_name" => (string)$row["original_name"],
        "mime_type" => (string)$row["mime_type"],
        "file_size" => (int)$row["file_size"],
        "remarks" => (string)($row["remarks"] ?? ""),
        "uploaded_by" => (string)($row["uploaded_by"] ?? ""),
        "uploaded_at" => (string)$row["uploaded_at"]
    ];
}

// Runs a SELECT and returns all rows. Values are escaped by the
// caller with $conn->real_escape_string(). (get_result() is not used
// because some shared hosts do not have the mysqlnd driver.)
function kseb_select(mysqli $conn, string $sql): array
{
    $result = $conn->query($sql);

    if (!$result) {
        kseb_fail("Query failed: " . $conn->error, 500);
    }

    $rows = [];

    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }

    $result->free();

    return $rows;
}

function kseb_upload_error_text(int $code): string
{
    $errors = [
        UPLOAD_ERR_INI_SIZE => "File is larger than upload_max_filesize (" . ini_get("upload_max_filesize") . ") in php.ini",
        UPLOAD_ERR_FORM_SIZE => "File is larger than the form limit",
        UPLOAD_ERR_PARTIAL => "File was only partly uploaded. Please try again",
        UPLOAD_ERR_NO_FILE => "No file was selected",
        UPLOAD_ERR_NO_TMP_DIR => "PHP has no temporary upload folder (upload_tmp_dir)",
        UPLOAD_ERR_CANT_WRITE => "PHP could not write the upload to disk",
        UPLOAD_ERR_EXTENSION => "A PHP extension stopped the upload"
    ];

    return $errors[$code] ?? "File upload error " . $code;
}

function kseb_detect_mime(string $path): string
{
    if (function_exists("finfo_open")) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);

        if ($finfo) {
            $mime = (string)finfo_file($finfo, $path);
            finfo_close($finfo);

            if ($mime !== "") {
                return $mime;
            }
        }
    }

    // Fallback: check the first bytes of the file.
    $handle = fopen($path, "rb");
    $head = $handle ? (string)fread($handle, 12) : "";

    if ($handle) {
        fclose($handle);
    }

    if (strncmp($head, "%PDF-", 5) === 0) return "application/pdf";
    if (strncmp($head, "\xFF\xD8\xFF", 3) === 0) return "image/jpeg";
    if (strncmp($head, "\x89PNG", 4) === 0) return "image/png";
    if (strncmp($head, "GIF8", 4) === 0) return "image/gif";
    if (strncmp($head, "RIFF", 4) === 0 && substr($head, 8, 4) === "WEBP") return "image/webp";

    return "application/octet-stream";
}

function kseb_ensure_upload_dir(): void
{
    if (!is_dir(KSEB_UPLOAD_DIR) && !mkdir(KSEB_UPLOAD_DIR, 0755, true)) {
        kseb_fail("Cannot create folder " . KSEB_UPLOAD_DIR . " (check write permission)", 500);
    }

    // Files are only given out through this PHP file (it checks the
    // API key). Block opening the folder directly from the browser.
    $htaccess = KSEB_UPLOAD_DIR . "/.htaccess";

    if (!file_exists($htaccess)) {
        @file_put_contents(
            $htaccess,
            "Options -Indexes\n" .
            "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n" .
            "<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n"
        );
    }
}


/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

$conn = null;

if (function_exists('db_connect')) {

    // Hosted server: shared connection settings.
    $conn = db_connect("salescollection");

    if (!($conn instanceof mysqli)) {
        kseb_fail("db_connect('salescollection') did not return a database connection. Check db_connect.php.", 500);
    }

} else {

    // Local testing without db_connect.php.
    $conn = new mysqli("localhost", "root", "", "salescollection");
}

if ($conn->connect_error) {
    kseb_fail("Database connection failed: " . $conn->connect_error, 500);
}

$conn->set_charset("utf8mb4");


/*
|--------------------------------------------------------------------------
| TABLES (CREATED THE FIRST TIME)
|--------------------------------------------------------------------------
*/

$createDocuments = "
    CREATE TABLE IF NOT EXISTS kseb_invoice_documents (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        invoice_no VARCHAR(100) NOT NULL,
        invoice_key VARCHAR(100) NOT NULL,
        doc_type VARCHAR(40) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INT UNSIGNED NOT NULL DEFAULT 0,
        remarks VARCHAR(500) DEFAULT NULL,
        uploaded_by VARCHAR(150) DEFAULT NULL,
        uploaded_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY idx_invoice_key (invoice_key),
        KEY idx_invoice_type (invoice_key, doc_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
";

$createTracking = "
    CREATE TABLE IF NOT EXISTS kseb_invoice_tracking (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        invoice_no VARCHAR(100) NOT NULL,
        invoice_key VARCHAR(100) NOT NULL,
        step_key VARCHAR(50) NOT NULL,
        step_date DATE DEFAULT NULL,
        remarks VARCHAR(500) DEFAULT NULL,
        updated_by VARCHAR(150) DEFAULT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_invoice_step (invoice_key, step_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
";

if (!$conn->query($createDocuments)) {
    kseb_fail("Could not create table kseb_invoice_documents: " . $conn->error, 500);
}

if (!$conn->query($createTracking)) {
    kseb_fail("Could not create table kseb_invoice_tracking: " . $conn->error, 500);
}


/*
|--------------------------------------------------------------------------
| INPUT
|--------------------------------------------------------------------------
|
| JSON body for normal requests, form fields for uploads.
|
*/

$input = $_POST;

if (!isset($input["action"])) {
    $json = json_decode((string)file_get_contents("php://input"), true);

    if (is_array($json)) {
        $input = $json;
    }
}

$action = kseb_text($input["action"] ?? "", 30);
$userName = kseb_text($input["user"] ?? "", 150);
$invoiceDateInput = kseb_text($input["invoice_date"] ?? "", 40);


/*
|--------------------------------------------------------------------------
| ONE INVOICE: DOCUMENTS + STEPS
|--------------------------------------------------------------------------
*/

function kseb_invoice_details(mysqli $conn, string $invoiceKey, string $invoiceDate = ""): array
{
    $safeKey = $conn->real_escape_string($invoiceKey);

    $documents = [];

    foreach (
        kseb_select(
            $conn,
            "SELECT id, invoice_no, doc_type, original_name, mime_type,
                    file_size, remarks, uploaded_by, uploaded_at
             FROM kseb_invoice_documents
             WHERE invoice_key = '" . $safeKey . "'
             ORDER BY uploaded_at DESC, id DESC"
        ) as $row
    ) {
        $documents[] = kseb_document_row($row);
    }

    /*
    | History = every saved step, oldest first.
    | Bill Generated is always the first entry (the invoice itself,
    | dated with the invoice date). The page shows it bottom to top.
    */
    $history = [[
        "id" => 0,
        "key" => KSEB_AUTO_STEP,
        "label" => KSEB_TRACKING_STEPS[KSEB_AUTO_STEP],
        "date" => kseb_invoice_date($invoiceDate),
        "remarks" => "",
        "added_by" => "Tally (invoice)",
        "added_at" => "",
        "automatic" => true
    ]];

    $used = [KSEB_AUTO_STEP => true];

    foreach (
        kseb_select(
            $conn,
            "SELECT id, step_key, step_date, remarks, updated_by, updated_at
             FROM kseb_invoice_tracking
             WHERE invoice_key = '" . $safeKey . "'
             ORDER BY step_date ASC, id ASC"
        ) as $row
    ) {
        $key = (string)$row["step_key"];

        if ($key === KSEB_AUTO_STEP || isset($used[$key])) {
            continue;
        }

        $used[$key] = true;

        $history[] = [
            "id" => (int)$row["id"],
            "key" => $key,
            "label" => KSEB_TRACKING_STEPS[$key] ?? $key,
            "date" => (string)($row["step_date"] ?? ""),
            "remarks" => (string)($row["remarks"] ?? ""),
            "added_by" => (string)($row["updated_by"] ?? ""),
            "added_at" => (string)($row["updated_at"] ?? ""),
            "automatic" => false
        ];
    }

    // Steps not used yet: these are the choices in the drop-down.
    $available = [];

    foreach (KSEB_TRACKING_STEPS as $key => $label) {
        if (!isset($used[$key])) {
            $available[] = [
                "key" => $key,
                "label" => $label
            ];
        }
    }

    return [
        "documents" => $documents,
        "history" => $history,
        "available_steps" => $available,
        "total_steps" => count(KSEB_TRACKING_STEPS)
    ];
}


try {

    switch ($action) {

        /*
        |------------------------------------------------------------------
        | SUMMARY FOR THE TABLE
        |------------------------------------------------------------------
        |
        | For every invoice that has documents or steps:
        | latest finished step + number of documents.
        |
        */

        case "summary":

            $summary = [];

            // Latest saved step of every invoice wins (ordered by date, then id).
            $result = $conn->query(
                "SELECT invoice_key, step_key
                 FROM kseb_invoice_tracking
                 ORDER BY step_date ASC, id ASC"
            );

            if (!$result) {
                kseb_fail("Tracking summary failed: " . $conn->error, 500);
            }

            while ($row = $result->fetch_assoc()) {
                $key = $row["invoice_key"];
                $step = $row["step_key"];

                if (!isset(KSEB_TRACKING_STEPS[$step]) || $step === KSEB_AUTO_STEP) {
                    continue;
                }

                if (!isset($summary[$key])) {
                    $summary[$key] = ["done_steps" => 1, "current_step" => KSEB_AUTO_STEP, "documents" => 0, "doc_types" => []];
                }

                $summary[$key]["done_steps"]++;
                $summary[$key]["current_step"] = $step;
            }

            $result->free();

            $result = $conn->query(
                "SELECT invoice_key, doc_type, COUNT(*) AS total
                 FROM kseb_invoice_documents
                 GROUP BY invoice_key, doc_type"
            );

            if (!$result) {
                kseb_fail("Document summary failed: " . $conn->error, 500);
            }

            while ($row = $result->fetch_assoc()) {
                $key = $row["invoice_key"];

                if (!isset($summary[$key])) {
                    $summary[$key] = ["done_steps" => 1, "current_step" => KSEB_AUTO_STEP, "documents" => 0, "doc_types" => []];
                }

                $summary[$key]["documents"] += (int)$row["total"];
                $summary[$key]["doc_types"][] = $row["doc_type"];
            }

            $result->free();

            foreach ($summary as &$item) {
                $item["current_step_label"] = KSEB_TRACKING_STEPS[$item["current_step"]] ?? "";
                $item["total_steps"] = count(KSEB_TRACKING_STEPS);
            }

            unset($item);

            kseb_respond(200, [
                "success" => true,
                "steps" => kseb_steps_list(),
                "doc_types" => kseb_doc_types_list(),
                "data" => (object)$summary
            ]);

            break;


        /*
        |------------------------------------------------------------------
        | ONE INVOICE
        |------------------------------------------------------------------
        */

        case "get":

            $invoiceNo = kseb_text($input["invoice_no"] ?? "", 100);

            if ($invoiceNo === "") {
                kseb_fail("Invoice number is missing");
            }

            kseb_respond(200, array_merge(
                [
                    "success" => true,
                    "invoice_no" => $invoiceNo,
                    "doc_types" => kseb_doc_types_list()
                ],
                kseb_invoice_details($conn, kseb_invoice_key($invoiceNo), $invoiceDateInput)
            ));

            break;


        /*
        |------------------------------------------------------------------
        | UPLOAD DOCUMENT
        |------------------------------------------------------------------
        */

        case "upload":

            $invoiceNo = kseb_text($input["invoice_no"] ?? "", 100);
            $docType = strtoupper(kseb_text($input["doc_type"] ?? "", 40));
            $remarks = kseb_text($input["remarks"] ?? "", 500);

            if ($invoiceNo === "") {
                kseb_fail("Invoice number is missing");
            }

            if (!isset(KSEB_DOC_TYPES[$docType])) {
                kseb_fail("Choose the document type");
            }

            if (!isset($_FILES["file"])) {
                kseb_fail("No file received (post_max_size=" . ini_get("post_max_size") . ")");
            }

            $file = $_FILES["file"];

            if ($file["error"] !== UPLOAD_ERR_OK) {
                kseb_fail(kseb_upload_error_text((int)$file["error"]));
            }

            if ($file["size"] <= 0) {
                kseb_fail("The file is empty");
            }

            if ($file["size"] > KSEB_MAX_FILE_SIZE) {
                kseb_fail("File is too big. Maximum is " . round(KSEB_MAX_FILE_SIZE / 1024 / 1024) . " MB");
            }

            $originalName = basename(str_replace("\\", "/", (string)$file["name"]));
            $originalName = kseb_text(preg_replace('/[\x00-\x1F\x7F]+/', '', $originalName), 200);
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

            if (!isset(KSEB_ALLOWED_EXTENSIONS[$extension])) {
                kseb_fail("Only PDF and image files (JPG, PNG, WEBP, GIF) can be uploaded");
            }

            $mime = kseb_detect_mime($file["tmp_name"]);

            if (!in_array($mime, KSEB_ALLOWED_EXTENSIONS[$extension], true)) {
                kseb_fail("The file content does not match its type (." . $extension . ")");
            }

            kseb_ensure_upload_dir();

            $safeInvoice = trim(preg_replace('/[^A-Za-z0-9_-]+/', '_', $invoiceNo), "_");
            $storedName = substr($safeInvoice !== "" ? $safeInvoice : "invoice", 0, 60)
                . "_" . $docType
                . "_" . date("Ymd_His")
                . "_" . bin2hex(random_bytes(6))
                . "." . $extension;

            if (!move_uploaded_file($file["tmp_name"], KSEB_UPLOAD_DIR . "/" . $storedName)) {
                kseb_fail("Could not save the file in " . KSEB_UPLOAD_DIR . " (check write permission)", 500);
            }

            $invoiceKey = kseb_invoice_key($invoiceNo);
            $now = date("Y-m-d H:i:s");
            $fileSize = (int)$file["size"];

            $stmt = $conn->prepare(
                "INSERT INTO kseb_invoice_documents
                    (invoice_no, invoice_key, doc_type, original_name, stored_name,
                     mime_type, file_size, remarks, uploaded_by, uploaded_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );

            if (!$stmt) {
                @unlink(KSEB_UPLOAD_DIR . "/" . $storedName);
                kseb_fail("Could not save document details: " . $conn->error, 500);
            }

            $stmt->bind_param(
                "ssssssisss",
                $invoiceNo,
                $invoiceKey,
                $docType,
                $originalName,
                $storedName,
                $mime,
                $fileSize,
                $remarks,
                $userName,
                $now
            );

            if (!$stmt->execute()) {
                $error = $stmt->error;
                $stmt->close();
                @unlink(KSEB_UPLOAD_DIR . "/" . $storedName);
                kseb_fail("Could not save document details: " . $error, 500);
            }

            $stmt->close();

            kseb_respond(200, array_merge(
                [
                    "success" => true,
                    "message" => "Document uploaded"
                ],
                kseb_invoice_details($conn, $invoiceKey, $invoiceDateInput)
            ));

            break;


        /*
        |------------------------------------------------------------------
        | DELETE DOCUMENT
        |------------------------------------------------------------------
        */

        case "delete_doc":

            $id = (int)($input["id"] ?? 0);

            if ($id <= 0) {
                kseb_fail("Document id is missing");
            }

            $document = kseb_select(
                $conn,
                "SELECT invoice_key, stored_name FROM kseb_invoice_documents WHERE id = " . $id
            )[0] ?? null;

            if (!$document) {
                kseb_fail("Document not found", 404);
            }

            $stmt = $conn->prepare("DELETE FROM kseb_invoice_documents WHERE id = ?");
            $stmt->bind_param("i", $id);

            if (!$stmt->execute()) {
                kseb_fail("Could not delete document: " . $stmt->error, 500);
            }

            $stmt->close();

            $path = KSEB_UPLOAD_DIR . "/" . basename($document["stored_name"]);

            if (is_file($path)) {
                @unlink($path);
            }

            kseb_respond(200, array_merge(
                [
                    "success" => true,
                    "message" => "Document deleted"
                ],
                kseb_invoice_details($conn, $document["invoice_key"], $invoiceDateInput)
            ));

            break;


        /*
        |------------------------------------------------------------------
        | SAVE TRACKING STEP
        |------------------------------------------------------------------
        |
        | Adds one step (date + remarks + who added it).
        | A saved step can never be edited or removed.
        |
        */

        case "save_step":

            $invoiceNo = kseb_text($input["invoice_no"] ?? "", 100);
            $stepKey = strtoupper(kseb_text($input["step_key"] ?? "", 50));
            $done = filter_var($input["done"] ?? false, FILTER_VALIDATE_BOOLEAN);
            $remarks = kseb_text($input["remarks"] ?? "", 500);
            $stepDateInput = trim((string)($input["date"] ?? ""));
            $stepDate = kseb_valid_date($stepDateInput);

            if ($invoiceNo === "") {
                kseb_fail("Invoice number is missing");
            }

            if (!isset(KSEB_TRACKING_STEPS[$stepKey])) {
                kseb_fail("Unknown tracking step");
            }

            if ($stepKey === KSEB_AUTO_STEP) {
                kseb_fail("Bill Generated is set automatically from the invoice date");
            }

            if ($stepDateInput !== "" && $stepDate === null) {
                kseb_fail("Date must be in YYYY-MM-DD format");
            }

            if (!$done) {
                kseb_fail("A saved tracking step cannot be removed");
            }

            if ($userName === "") {
                kseb_fail("Your name is missing. Please log in again");
            }

            $invoiceKey = kseb_invoice_key($invoiceNo);

            // Once saved, a step can never be changed.
            $existing = kseb_select(
                $conn,
                "SELECT updated_by, step_date FROM kseb_invoice_tracking
                 WHERE invoice_key = '" . $conn->real_escape_string($invoiceKey) . "'
                   AND step_key = '" . $conn->real_escape_string($stepKey) . "'"
            );

            if ($existing) {
                kseb_fail(
                    KSEB_TRACKING_STEPS[$stepKey] . " was already saved by " .
                    ($existing[0]["updated_by"] ?: "another user") .
                    " and cannot be changed"
                );
            }

            if ($stepDate === null) {
                $stepDate = date("Y-m-d");
            }

            $now = date("Y-m-d H:i:s");

            $stmt = $conn->prepare(
                "INSERT INTO kseb_invoice_tracking
                    (invoice_no, invoice_key, step_key, step_date, remarks, updated_by, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)"
            );

            $stmt->bind_param(
                "sssssss",
                $invoiceNo,
                $invoiceKey,
                $stepKey,
                $stepDate,
                $remarks,
                $userName,
                $now
            );

            if (!$stmt->execute()) {
                // Duplicate key = someone saved the same step a moment ago.
                if ((int)$stmt->errno === 1062) {
                    kseb_fail(KSEB_TRACKING_STEPS[$stepKey] . " was already saved and cannot be changed");
                }

                kseb_fail("Could not save tracking step: " . $stmt->error, 500);
            }

            $stmt->close();

            kseb_respond(200, array_merge(
                [
                    "success" => true,
                    "message" => KSEB_TRACKING_STEPS[$stepKey] . " saved"
                ],
                kseb_invoice_details($conn, $invoiceKey, $invoiceDateInput)
            ));

            break;


        /*
        |------------------------------------------------------------------
        | DOWNLOAD / VIEW DOCUMENT
        |------------------------------------------------------------------
        */

        case "download":

            $id = (int)($input["id"] ?? 0);

            $document = kseb_select(
                $conn,
                "SELECT original_name, stored_name, mime_type FROM kseb_invoice_documents WHERE id = " . $id
            )[0] ?? null;

            if (!$document) {
                kseb_fail("Document not found", 404);
            }

            $path = KSEB_UPLOAD_DIR . "/" . basename($document["stored_name"]);

            if (!is_file($path)) {
                kseb_fail("The file is missing on the server", 404);
            }

            $conn->close();
            $conn = null;

            while (ob_get_level() > 0) {
                ob_end_clean();
            }

            $downloadName = str_replace(['"', "\r", "\n"], "", $document["original_name"]);

            header("Content-Type: " . $document["mime_type"]);
            header("Content-Length: " . filesize($path));
            header("X-Content-Type-Options: nosniff");
            header(
                "Content-Disposition: inline; filename=\"" . $downloadName . "\"; filename*=UTF-8''" .
                rawurlencode($document["original_name"])
            );

            readfile($path);
            exit;


        default:
            kseb_fail("Unknown action");
    }

} catch (Throwable $e) {

    kseb_fail($e->getMessage(), 500);

} finally {

    if ($conn instanceof mysqli) {
        @$conn->close();
    }
}
