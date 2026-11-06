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
|                   (optional "invoices": [{invoice_no, amount}] so paid
|                   invoices can be found in the receipts table)
|   get          -> documents, tracking steps and receipts of one invoice
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
| PAYMENT FROM RECEIPTS
|
|   The receipt vouchers in kseb_receipts are read to see which invoices
|   were paid and how much of it was credited to the bank account (the
|   rest is Security Deposit / TDS kept back by KSEB). When receipts that
|   reached the bank settle the invoice amount, the invoice is shown as
|   "Payment Completed" automatically - nobody has to mark it.
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

// Payment collection is the goal. Once this step is saved (or the
// receipts table shows the invoice is fully paid) the invoice is
// closed: it counts as fully done and no more steps can be added.
const KSEB_FINAL_STEP = "PAYMENT_COMPLETED";

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
| RECEIPTS (PAYMENT CHECK)
|--------------------------------------------------------------------------
|
| kseb_receipts holds every line of the Tally receipt vouchers. One
| voucher (same MasterId) has:
|
|   invoice lines   BillName = invoice no, Amount = amount settled
|   bank line       IsBankLedger = 1, LedgerName = bank account,
|                   Amount = -(money credited to the bank)
|   deduction lines Security Deposit, TDS ... (negative, no BillName)
|
|   invoices settled = credited to bank + deductions
|
| An invoice is Payment Completed when receipt vouchers that were
| credited to a bank account settle its full amount. Each invoice
| gets its share of the bank credit (by its amount in the voucher).
|
*/

const KSEB_RECEIPTS_TABLE = "kseb_receipts";

// Settled amount may be this much (in rupees) below the invoice
// amount and still count as fully paid (Tally round-off).
const KSEB_RECEIPT_TOLERANCE = 1.00;


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

// Amount sent by the page ("1,23,456.00", 123456, "") -> float or null.
function kseb_amount($value): ?float
{
    if ($value === null || $value === "") {
        return null;
    }

    $number = (float)str_replace([",", " "], "", (string)$value);

    return is_finite($number) && $number > 0 ? round($number, 2) : null;
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
| RECEIPT HELPERS
|--------------------------------------------------------------------------
*/

// Is the receipts table there? (Checked once per request.) Without it
// the page keeps working, just without the automatic payment check.
function kseb_receipts_available(mysqli $conn): bool
{
    static $available = null;

    if ($available === null) {
        $result = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string(KSEB_RECEIPTS_TABLE) . "'");
        $available = $result && $result->num_rows > 0;

        if ($result) {
            $result->free();
        }
    }

    return $available;
}

/*
| Receipt vouchers, built from their lines. With $invoiceKey only the
| vouchers that settle that invoice are read.
|
|   [MasterId => [
|       "voucher_id", "date", "party",
|       "bank_accounts" => [ledger => amount credited],
|       "bank_amount"   => total credited to bank,
|       "bills"         => [invoice_key => ["bill_name", "amount"]],
|       "bills_total"   => total of all invoices settled,
|       "deductions"    => [ledger => amount]   (Security Deposit, TDS ...)
|   ]]
*/
function kseb_receipt_vouchers(mysqli $conn, ?string $invoiceKey = null): array
{
    if (!kseb_receipts_available($conn)) {
        return [];
    }

    $table = "`" . KSEB_RECEIPTS_TABLE . "`";
    $where = "LOWER(TRIM(COALESCE(VoucherTypeName, ''))) = 'receipt'";

    if ($invoiceKey !== null) {
        $where .= " AND MasterId IN (
            SELECT MasterId FROM (
                SELECT DISTINCT MasterId FROM " . $table . "
                WHERE LOWER(TRIM(COALESCE(BillName, ''))) = '" . $conn->real_escape_string($invoiceKey) . "'
            ) AS invoice_vouchers
        )";
    }

    $result = $conn->query(
        "SELECT MasterId, VoucherId, Date, PartyLedgerName, LedgerName,
                Amount, BillName, BillType, BillDate, IsBankLedger
         FROM " . $table . "
         WHERE " . $where . "
         ORDER BY Date ASC, id ASC"
    );

    if (!$result) {
        return [];
    }

    $vouchers = [];

    while ($row = $result->fetch_assoc()) {
        $id = (string)$row["MasterId"];

        if (!isset($vouchers[$id])) {
            $vouchers[$id] = [
                "voucher_id" => (string)($row["VoucherId"] ?? ""),
                "date" => kseb_invoice_date($row["Date"] ?? ""),
                "party" => trim((string)($row["PartyLedgerName"] ?? "")),
                "bank_accounts" => [],
                "bank_amount" => 0.0,
                "bills" => [],
                "bills_total" => 0.0,
                "deductions" => [],
                "unnamed_bills" => []
            ];
        }

        if ($row["Amount"] === null) {
            continue;
        }

        $amount = (float)$row["Amount"];
        $ledger = trim((string)($row["LedgerName"] ?? ""));
        $billName = trim((string)($row["BillName"] ?? ""));
        $voucher = &$vouchers[$id];

        if ((int)$row["IsBankLedger"] === 1) {
            // Bank line: negative amount = money credited to the bank.
            $voucher["bank_accounts"][$ledger] = ($voucher["bank_accounts"][$ledger] ?? 0) - $amount;
            $voucher["bank_amount"] -= $amount;
        } elseif ($billName !== "" && $amount > 0) {
            // Invoice settled by this receipt.
            $key = kseb_invoice_key($billName);

            if (!isset($voucher["bills"][$key])) {
                $voucher["bills"][$key] = ["bill_name" => $billName, "amount" => 0.0];
            }

            $voucher["bills"][$key]["amount"] += $amount;
            $voucher["bills_total"] += $amount;
        } elseif ($billName === "" && $amount < 0) {
            // Security Deposit, TDS ... kept back from the payment.
            $voucher["deductions"][$ledger] = ($voucher["deductions"][$ledger] ?? 0) - $amount;
        } elseif (
            $billName === "" &&
            $amount > 0 &&
            strcasecmp(trim((string)($row["BillType"] ?? "")), "Agst Ref") === 0
        ) {
            // "Agst Ref" line without the invoice number (see below).
            $voucher["unnamed_bills"][] = [
                "ledger" => $ledger,
                "bill_date" => kseb_invoice_date($row["BillDate"] ?? ""),
                "amount" => $amount
            ];
        }

        unset($voucher);
    }

    $result->free();

    kseb_resolve_unnamed_bills($conn, $vouchers);

    return $vouchers;
}

/*
| Some receipts were imported without their bill line (the one with the
| invoice number in BillName). Only the party line is there:
|   BillType = Agst Ref, BillName = NULL, BillDate = invoice date.
| For those vouchers the invoice is found in salesdata by
| party ledger + invoice date, when exactly one KSEB invoice matches.
| (Vouchers that do have bill lines repeat the party line without a
| BillName too, so only vouchers with no bill line at all are used.)
*/
function kseb_resolve_unnamed_bills(mysqli $conn, array &$vouchers): void
{
    $parties = [];

    foreach ($vouchers as $voucher) {
        if (!$voucher["bills"]) {
            foreach ($voucher["unnamed_bills"] as $line) {
                if ($line["ledger"] !== "" && $line["bill_date"] !== "") {
                    $parties[kseb_invoice_key($line["ledger"])] = true;
                }
            }
        }
    }

    if (!$parties) {
        return;
    }

    $list = implode(", ", array_map(
        fn($party) => "'" . $conn->real_escape_string($party) . "'",
        array_keys($parties)
    ));

    $result = $conn->query(
        "SELECT DISTINCT TRIM(VoucherNumber) AS invoice_no, Date,
                LOWER(TRIM(PartyLedgerName)) AS party_key
         FROM salesdata
         WHERE LOWER(TRIM(COALESCE(VoucherTypeName, ''))) IN ('gst sales b2b', 'gst sales b2c')
           AND TRIM(COALESCE(VoucherNumber, '')) <> ''
           AND LOWER(TRIM(PartyLedgerName)) IN (" . $list . ")"
    );

    if (!$result) {
        return;
    }

    // [party|date => [invoice_key => invoice_no]]
    $invoices = [];

    while ($row = $result->fetch_assoc()) {
        $slot = $row["party_key"] . "|" . kseb_invoice_date($row["Date"] ?? "");
        $invoices[$slot][kseb_invoice_key($row["invoice_no"])] = (string)$row["invoice_no"];
    }

    $result->free();

    foreach ($vouchers as &$voucher) {
        if ($voucher["bills"]) {
            continue;
        }

        foreach ($voucher["unnamed_bills"] as $line) {
            $slot = kseb_invoice_key($line["ledger"]) . "|" . $line["bill_date"];
            $matches = $invoices[$slot] ?? [];

            if (count($matches) !== 1) {
                continue;
            }

            $key = (string)array_key_first($matches);

            if (!isset($voucher["bills"][$key])) {
                $voucher["bills"][$key] = ["bill_name" => $matches[$key], "amount" => 0.0];
            }

            $voucher["bills"][$key]["amount"] += $line["amount"];
            $voucher["bills_total"] += $line["amount"];
        }
    }

    unset($voucher);
}

// One invoice's part of one receipt voucher.
function kseb_receipt_entry(array $voucher, string $invoiceKey): array
{
    $settled = $voucher["bills"][$invoiceKey]["amount"] ?? 0.0;
    $share = $voucher["bills_total"] > 0 ? $settled / $voucher["bills_total"] : 0;
    $bankShare = $voucher["bank_amount"] * $share;

    $deductions = [];

    foreach ($voucher["deductions"] as $ledger => $amount) {
        $deductions[] = [
            "ledger" => $ledger,
            "amount" => round($amount * $share, 2)
        ];
    }

    $bankAccounts = [];

    foreach ($voucher["bank_accounts"] as $ledger => $amount) {
        if (abs($amount) >= 0.005) {
            $bankAccounts[] = $ledger;
        }
    }

    return [
        "date" => $voucher["date"],
        "voucher_id" => $voucher["voucher_id"],
        "party" => $voucher["party"],
        "bank_accounts" => $bankAccounts,
        "credited_to_bank" => $voucher["bank_amount"] > 0.005,
        // This invoice
        "settled_amount" => round($settled, 2),
        "bank_amount" => round($bankShare, 2),
        "deductions" => $deductions,
        // Whole voucher (one bank credit can pay several invoices)
        "voucher_bank_amount" => round($voucher["bank_amount"], 2),
        "voucher_bills_total" => round($voucher["bills_total"], 2),
        "voucher_invoice_count" => count($voucher["bills"])
    ];
}

// Totals of a list of entries of one invoice. Only vouchers that were
// credited to a bank count as received.
function kseb_receipt_totals_of(array $entries): array
{
    $received = 0.0;
    $bank = 0.0;
    $lastDate = "";
    $accounts = [];

    foreach ($entries as $entry) {
        if (!$entry["credited_to_bank"]) {
            continue;
        }

        $received += $entry["settled_amount"];
        $bank += $entry["bank_amount"];
        $lastDate = max($lastDate, $entry["date"]);

        foreach ($entry["bank_accounts"] as $account) {
            $accounts[$account] = true;
        }
    }

    return [
        "received" => round($received, 2),
        "bank_amount" => round($bank, 2),
        "deductions" => round($received - $bank, 2),
        "count" => count($entries),
        "last_date" => $lastDate,
        "bank_accounts" => array_keys($accounts)
    ];
}

// Totals per invoice key, for every invoice in the receipts table.
function kseb_receipt_totals(mysqli $conn): array
{
    $entries = [];

    foreach (kseb_receipt_vouchers($conn) as $voucher) {
        foreach (array_keys($voucher["bills"]) as $key) {
            $entries[$key][] = kseb_receipt_entry($voucher, (string)$key);
        }
    }

    $totals = [];

    foreach ($entries as $key => $list) {
        $totals[(string)$key] = kseb_receipt_totals_of($list);
    }

    return $totals;
}

// Every receipt of one invoice, oldest first.
function kseb_invoice_receipts(mysqli $conn, string $invoiceKey): array
{
    $entries = [];

    // All vouchers are read: a receipt imported without its invoice
    // number is only linked to the invoice after kseb_resolve_unnamed_bills.
    foreach (kseb_receipt_vouchers($conn) as $voucher) {
        if (isset($voucher["bills"][$invoiceKey])) {
            $entries[] = kseb_receipt_entry($voucher, $invoiceKey);
        }
    }

    return $entries;
}

function kseb_money(float $amount): string
{
    return "Rs. " . number_format($amount, 2);
}

// Invoice total from salesdata (same formula as kseb_payment.php:
// amount + GST, GST worked out from the rate when the tax amount is 0).
// Only used when the page did not send the invoice amount.
function kseb_invoice_amount_from_sales(mysqli $conn, string $invoiceKey): ?float
{
    $result = $conn->query(
        "SELECT SUM(
                    COALESCE(Amount, 0) +
                    CASE
                        WHEN COALESCE(EveItemTaxAmt, 0) = 0
                        THEN COALESCE(Amount, 0) * COALESCE(EveItemGstRate, 0) / 100
                        ELSE EveItemTaxAmt
                    END
                ) AS total
         FROM salesdata
         WHERE LOWER(TRIM(COALESCE(VoucherNumber, ''))) = '" . $conn->real_escape_string($invoiceKey) . "'
           AND LOWER(TRIM(COALESCE(VoucherTypeName, ''))) IN ('gst sales b2b', 'gst sales b2c')"
    );

    if (!$result) {
        return null;
    }

    $row = $result->fetch_assoc();
    $result->free();

    $total = abs((float)($row["total"] ?? 0));

    return $total > 0 ? round($total, 2) : null;
}

// Invoice totals of every KSEB invoice in salesdata (same formula).
//   [invoice_key => float]
function kseb_sales_invoice_amounts(mysqli $conn): array
{
    $result = $conn->query(
        "SELECT LOWER(TRIM(VoucherNumber)) AS invoice_key,
                ABS(SUM(
                    COALESCE(Amount, 0) +
                    CASE
                        WHEN COALESCE(EveItemTaxAmt, 0) = 0
                        THEN COALESCE(Amount, 0) * COALESCE(EveItemGstRate, 0) / 100
                        ELSE EveItemTaxAmt
                    END
                )) AS total
         FROM salesdata
         WHERE LOWER(TRIM(COALESCE(PartyLedgerName, ''))) LIKE 'kseb%'
           AND LOWER(TRIM(COALESCE(VoucherTypeName, ''))) IN ('gst sales b2b', 'gst sales b2c')
           AND TRIM(COALESCE(VoucherNumber, '')) <> ''
         GROUP BY LOWER(TRIM(VoucherNumber))"
    );

    if (!$result) {
        return [];
    }

    $amounts = [];

    while ($row = $result->fetch_assoc()) {
        $total = round((float)$row["total"], 2);

        if ($total > 0) {
            $amounts[(string)$row["invoice_key"]] = $total;
        }
    }

    $result->free();

    return $amounts;
}

function kseb_is_fully_paid(?float $invoiceAmount, float $received): bool
{
    return $invoiceAmount !== null
        && $invoiceAmount > 0
        && $received > 0
        && $received + KSEB_RECEIPT_TOLERANCE >= $invoiceAmount;
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
$invoiceAmountInput = kseb_amount($input["invoice_amount"] ?? null);


/*
|--------------------------------------------------------------------------
| ONE INVOICE: DOCUMENTS + STEPS + RECEIPTS
|--------------------------------------------------------------------------
*/

function kseb_invoice_details(
    mysqli $conn,
    string $invoiceKey,
    string $invoiceDate = "",
    ?float $invoiceAmount = null
): array {
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

    /*
    | Receipts against this invoice. When they cover the invoice amount
    | and nobody has saved Payment Completed yet, add it automatically
    | (dated with the last receipt).
    */
    $receipts = kseb_invoice_receipts($conn, $invoiceKey);
    $receiptTotals = kseb_receipt_totals_of($receipts);
    $received = $receiptTotals["received"];

    if ($invoiceAmount === null && $receipts) {
        $invoiceAmount = kseb_invoice_amount_from_sales($conn, $invoiceKey);
    }

    $paidByReceipts = kseb_is_fully_paid($invoiceAmount, $received);

    if ($paidByReceipts && !isset($used[KSEB_FINAL_STEP])) {
        $used[KSEB_FINAL_STEP] = true;

        $parts = [];

        foreach ($receipts as $receipt) {
            if (!$receipt["credited_to_bank"]) {
                continue;
            }

            $text = "Receipt dt " . $receipt["date"] .
                ": " . kseb_money($receipt["bank_amount"]) .
                " credited to " . implode(", ", $receipt["bank_accounts"]);

            foreach ($receipt["deductions"] as $deduction) {
                $text .= ", " . $deduction["ledger"] . " " . kseb_money($deduction["amount"]);
            }

            if ($receipt["voucher_invoice_count"] > 1) {
                $text .= " (bank credit " . kseb_money($receipt["voucher_bank_amount"]) .
                    " for " . $receipt["voucher_invoice_count"] . " invoices)";
            }

            $parts[] = $text;
        }

        $history[] = [
            "id" => 0,
            "key" => KSEB_FINAL_STEP,
            "label" => KSEB_TRACKING_STEPS[KSEB_FINAL_STEP],
            "date" => $receiptTotals["last_date"],
            "remarks" =>
                "Invoice " . kseb_money((float)$invoiceAmount) .
                " = credited to bank " . kseb_money($receiptTotals["bank_amount"]) .
                " + deductions " . kseb_money($receiptTotals["deductions"]) .
                ". " . implode("; ", $parts),
            "added_by" => "Tally (receipts)",
            "added_at" => "",
            "automatic" => true
        ];
    }

    // Payment Completed is always shown on top (last in history).
    $closed = isset($used[KSEB_FINAL_STEP]);

    if ($closed) {
        $final = null;

        foreach ($history as $index => $entry) {
            if ($entry["key"] === KSEB_FINAL_STEP) {
                $final = $entry;
                unset($history[$index]);
            }
        }

        $history = array_values($history);
        $history[] = $final;
    }

    // Steps not used yet: these are the choices in the drop-down.
    // Nothing can be added after Payment Completed.
    $available = [];

    foreach (KSEB_TRACKING_STEPS as $key => $label) {
        if (!$closed && !isset($used[$key])) {
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
        "total_steps" => count(KSEB_TRACKING_STEPS),
        "closed" => $closed,
        "receipts" => $receipts,
        "received_amount" => $received,
        "bank_amount" => $receiptTotals["bank_amount"],
        "deductions_amount" => $receiptTotals["deductions"],
        "bank_accounts" => $receiptTotals["bank_accounts"],
        "invoice_amount" => $invoiceAmount,
        "paid_by_receipts" => $paidByReceipts
    ];
}


try {

    switch ($action) {

        /*
        |------------------------------------------------------------------
        | SUMMARY FOR THE TABLE
        |------------------------------------------------------------------
        |
        | For every invoice that has documents, steps or receipts:
        | latest finished step + number of documents + amount received.
        |
        | The page sends "invoices": [{invoice_no, amount}] so an invoice
        | whose receipts cover its amount is shown as Payment Completed.
        |
        */

        case "summary":

            $summary = [];

            $newEntry = fn() => [
                "done_steps" => 1,
                "current_step" => KSEB_AUTO_STEP,
                "documents" => 0,
                "doc_types" => [],
                "received_amount" => 0,
                "bank_amount" => 0,
                "deductions_amount" => 0,
                "bank_accounts" => [],
                "receipt_count" => 0,
                "last_receipt_date" => "",
                "paid_by_receipts" => false
            ];

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
                    $summary[$key] = $newEntry();
                }

                $summary[$key]["done_steps"]++;

                // Payment Completed stays the current step once saved.
                if ($summary[$key]["current_step"] !== KSEB_FINAL_STEP) {
                    $summary[$key]["current_step"] = $step;
                }
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
                    $summary[$key] = $newEntry();
                }

                $summary[$key]["documents"] += (int)$row["total"];
                $summary[$key]["doc_types"][] = $row["doc_type"];
            }

            $result->free();

            // Receipts: amount received per invoice.
            $invoiceAmounts = [];

            foreach ((array)($input["invoices"] ?? []) as $invoice) {
                if (!is_array($invoice)) {
                    continue;
                }

                $key = kseb_invoice_key($invoice["invoice_no"] ?? "");

                if ($key !== "") {
                    $invoiceAmounts[$key] = kseb_amount($invoice["amount"] ?? null);
                }
            }

            $receiptCheck = kseb_receipts_available($conn);
            $receiptTotals = $receiptCheck ? kseb_receipt_totals($conn) : [];

            // Amounts the page did not send are worked out from salesdata.
            $pageSentList = (bool)$invoiceAmounts;

            if ($receiptTotals) {
                foreach (kseb_sales_invoice_amounts($conn) as $key => $amount) {
                    if (($invoiceAmounts[$key] ?? null) === null && (!$pageSentList || array_key_exists($key, $invoiceAmounts))) {
                        $invoiceAmounts[$key] = $amount;
                    }
                }
            }

            foreach ($receiptTotals as $key => $receipt) {
                // Only receipts of KSEB invoices (the page's list, or salesdata).
                if (!array_key_exists($key, $invoiceAmounts)) {
                    continue;
                }

                if (!isset($summary[$key])) {
                    $summary[$key] = $newEntry();
                }

                $summary[$key]["received_amount"] = $receipt["received"];
                $summary[$key]["bank_amount"] = $receipt["bank_amount"];
                $summary[$key]["deductions_amount"] = $receipt["deductions"];
                $summary[$key]["bank_accounts"] = $receipt["bank_accounts"];
                $summary[$key]["receipt_count"] = $receipt["count"];
                $summary[$key]["last_receipt_date"] = $receipt["last_date"];

                if (kseb_is_fully_paid($invoiceAmounts[$key] ?? null, $receipt["received"])) {
                    $summary[$key]["paid_by_receipts"] = true;
                    $summary[$key]["current_step"] = KSEB_FINAL_STEP;
                }
            }

            foreach ($summary as $key => &$item) {
                $item["invoice_amount"] = $invoiceAmounts[$key] ?? null;
                $item["current_step_label"] = KSEB_TRACKING_STEPS[$item["current_step"]] ?? "";
                $item["total_steps"] = count(KSEB_TRACKING_STEPS);
                $item["closed"] = $item["current_step"] === KSEB_FINAL_STEP;

                // Payment collected = every step counts as done.
                if ($item["closed"]) {
                    $item["done_steps"] = $item["total_steps"];
                }
            }

            unset($item);

            kseb_respond(200, [
                "success" => true,
                "steps" => kseb_steps_list(),
                "doc_types" => kseb_doc_types_list(),
                "receipt_check" => $receiptCheck,
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
                kseb_invoice_details($conn, kseb_invoice_key($invoiceNo), $invoiceDateInput, $invoiceAmountInput)
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
                kseb_invoice_details($conn, $invoiceKey, $invoiceDateInput, $invoiceAmountInput)
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
                kseb_invoice_details($conn, $document["invoice_key"], $invoiceDateInput, $invoiceAmountInput)
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

            // Nothing can be added after Payment Completed.
            $closedRows = kseb_select(
                $conn,
                "SELECT id FROM kseb_invoice_tracking
                 WHERE invoice_key = '" . $conn->real_escape_string($invoiceKey) . "'
                   AND step_key = '" . KSEB_FINAL_STEP . "'"
            );

            if ($closedRows) {
                kseb_fail("Payment is already completed for this invoice. Tracking is closed");
            }

            // Same when the receipts already show the invoice as fully paid.
            $receipts = kseb_invoice_receipts($conn, $invoiceKey);

            if ($receipts) {
                $amount = $invoiceAmountInput ?? kseb_invoice_amount_from_sales($conn, $invoiceKey);

                if (kseb_is_fully_paid($amount, kseb_receipt_totals_of($receipts)["received"])) {
                    kseb_fail("Payment is already received in Tally receipts for this invoice. Tracking is closed");
                }
            }

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
                kseb_invoice_details($conn, $invoiceKey, $invoiceDateInput, $invoiceAmountInput)
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
