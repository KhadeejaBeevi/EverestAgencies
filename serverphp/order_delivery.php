<?php

/* =========================================================
   CUSTOMER PO  +  ORDER TO DELIVERY

   Customer PO page
     GET  action=po_list                 -> POs with their Tally invoices
     POST action=po_save                 -> add / edit a PO (FormData, attachments[])
     POST action=po_delete               -> delete a PO not yet passed

   Order To Delivery page
     GET  action=ready&days=60           -> invoiced POs / quotations not yet passed
     POST action=pass                    -> pass invoices to delivery + assign salesman
     GET  action=orders[&user=NAME]      -> delivery orders (only NAME's when given)
     GET  action=order_detail&id=ID      -> one order: items, invoices, deliveries
     POST action=deliver                 -> record a partial / full delivery
     POST action=delete_delivery         -> undo a delivery entry
     POST action=reassign                -> change salesman / due date
     POST action=remove_order            -> send an order back to Ready to Pass

   GET download=1&stored_name=..&filename=..  -> download an attachment

   Invoices come from Tally (salesdata). An invoice is linked to a
   quotation through EveInvVchOrderNos, and to a PO through the PO's
   quotation numbers, PO number or invoice numbers typed on the PO.
   Each invoice can be passed to delivery only once.
========================================================= */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}


/* =========================================================
   ATTACHMENT DIRECTORY
========================================================= */

function getUploadDirectory()
{
    return __DIR__ . DIRECTORY_SEPARATOR . "order_uploads";
}

function ensureUploadDirectory()
{
    $directory = getUploadDirectory();

    if (!is_dir($directory)) {
        if (!mkdir($directory, 0755, true)) {
            throw new Exception("Unable to create attachment directory.");
        }
    }

    /* Hosted (Apache): never run scripts from the upload folder. */
    $htaccess = $directory . DIRECTORY_SEPARATOR . ".htaccess";
    if (!is_file($htaccess)) {
        @file_put_contents($htaccess, "Options -Indexes -ExecCGI\nRemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar\nRemoveType .php .phtml .php3 .php4 .php5 .php7 .php8 .phar\n<FilesMatch \"\\.(php|phtml|php[0-9]|phar|cgi|pl|py|sh)$\">\n    Require all denied\n</FilesMatch>\n");
    }

    return $directory;
}


/* =========================================================
   FORCE ATTACHMENT DOWNLOAD
   Plain browser link, so it runs before the API key check.
========================================================= */

if (
    $_SERVER["REQUEST_METHOD"] === "GET" &&
    isset($_GET["download"]) &&
    (string)$_GET["download"] === "1"
) {
    try {
        $storedName = basename((string)($_GET["stored_name"] ?? ""));
        $originalName = basename((string)($_GET["filename"] ?? $storedName));

        if ($storedName === "" || !preg_match('/^[A-Za-z0-9_.-]+$/', $storedName)) {
            http_response_code(400);
            echo "Attachment filename is required.";
            exit;
        }

        $filePath = getUploadDirectory() . DIRECTORY_SEPARATOR . $storedName;

        if (!is_file($filePath)) {
            http_response_code(404);
            echo "Attachment not found.";
            exit;
        }

        $originalName = preg_replace('/[\x00-\x1F\x7F]/', '', $originalName);
        if ($originalName === "") {
            $originalName = $storedName;
        }

        $mimeType = "application/octet-stream";
        if (function_exists("finfo_open")) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $detected = finfo_file($finfo, $filePath);
                if ($detected) {
                    $mimeType = $detected;
                }
                finfo_close($finfo);
            }
        }

        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        header("Content-Type: " . $mimeType);
        header("Content-Length: " . filesize($filePath));
        header("Content-Transfer-Encoding: binary");
        header("Content-Disposition: attachment; filename=\"" . addcslashes($originalName, "\\\"") . "\"; filename*=UTF-8''" . rawurlencode($originalName));
        header("Cache-Control: private, no-store, no-cache, must-revalidate");
        header("Pragma: no-cache");
        header("Expires: 0");

        readfile($filePath);
        exit;
    } catch (Throwable $e) {
        http_response_code(500);
        echo "Unable to download attachment.";
        exit;
    }
}


/* =========================================================
   API KEY CHECK
========================================================= */

require_once __DIR__ . "/api_auth.php";


/* =========================================================
   DATABASE
   Connected after api_auth.php, which uses its own $pdo.
========================================================= */

$host = "localhost";
$dbname = "salescollection";
$username = "root";
$password = "";

try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed.",
        "error" => $e->getMessage()
    ]);
    exit;
}


/* =========================================================
   RESPONSE
========================================================= */

function responseJson($success, $message = "", $data = null, $extra = [])
{
    $response = [
        "success" => $success,
        "message" => $message
    ];

    if ($data !== null) {
        $response["data"] = $data;
    }

    if (!empty($extra)) {
        $response = array_merge($response, $extra);
    }

    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail($message, $code = 400)
{
    http_response_code($code);
    responseJson(false, $message);
}


/* =========================================================
   HELPERS
========================================================= */

function param($name, $default = "")
{
    $value = $_POST[$name] ?? $_GET[$name] ?? $default;
    return is_string($value) ? trim($value) : $value;
}

/* "Q-101, Q-102; Q-103" -> ["Q-101", "Q-102", "Q-103"] (unique, trimmed). */
function splitList($value)
{
    $parts = preg_split('/[,;\r\n]+/', (string)$value);
    $result = [];
    $seen = [];

    foreach ($parts as $part) {
        $part = trim($part);
        if ($part === "") {
            continue;
        }

        $key = strtolower($part);
        if (isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $result[] = $part;
    }

    return $result;
}

function validDate($value)
{
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$value) ? $value : null;
}


/* =========================================================
   ATTACHMENTS
========================================================= */

function parseAttachments($value)
{
    if (empty($value)) {
        return [];
    }

    if (is_array($value)) {
        return $value;
    }

    $decoded = json_decode((string)$value, true);

    return is_array($decoded) ? $decoded : [];
}

/* Saves $_FILES["attachments"] and returns their details. */
function uploadAttachments($prefix)
{
    if (empty($_FILES["attachments"]) || !is_array($_FILES["attachments"]["name"])) {
        return [];
    }

    $directory = ensureUploadDirectory();

    $files = $_FILES["attachments"];
    $uploaded = [];
    $maxSize = 25 * 1024 * 1024;
    $blockedExtensions = ["php", "phtml", "php3", "php4", "php5", "php7", "php8", "phar", "cgi", "pl", "py", "sh", "htaccess"];

    for ($i = 0; $i < count($files["name"]); $i++) {
        $originalName = (string)$files["name"][$i];
        $tmpName = $files["tmp_name"][$i];
        $error = $files["error"][$i];
        $size = (int)$files["size"][$i];

        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }

        if ($error !== UPLOAD_ERR_OK) {
            throw new Exception("Upload failed for file: " . $originalName);
        }

        if ($size <= 0) {
            continue;
        }

        if ($size > $maxSize) {
            throw new Exception("File '" . $originalName . "' is larger than 25 MB.");
        }

        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $extension = preg_replace('/[^a-z0-9]/', '', $extension);

        if (in_array($extension, $blockedExtensions, true)) {
            throw new Exception("File type not allowed: " . $originalName);
        }

        $storedName = preg_replace('/[^A-Za-z0-9_-]/', '_', $prefix) . "_" . bin2hex(random_bytes(8));
        if ($extension !== "") {
            $storedName .= "." . $extension;
        }

        if (!move_uploaded_file($tmpName, $directory . DIRECTORY_SEPARATOR . $storedName)) {
            throw new Exception("Unable to save uploaded file: " . $originalName);
        }

        $uploaded[] = [
            "id" => bin2hex(random_bytes(6)),
            "original_name" => $originalName,
            "stored_name" => $storedName,
            "file_size" => $size,
            "uploaded_at" => date("Y-m-d H:i:s")
        ];
    }

    return $uploaded;
}

function deleteAttachmentFile($attachment)
{
    if (empty($attachment["stored_name"])) {
        return;
    }

    $file = getUploadDirectory() . DIRECTORY_SEPARATOR . basename((string)$attachment["stored_name"]);

    if (is_file($file)) {
        @unlink($file);
    }
}


/* =========================================================
   TABLES (created once if missing)
========================================================= */

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS customer_po (
            id INT AUTO_INCREMENT PRIMARY KEY,
            po_number VARCHAR(100) NOT NULL,
            po_date DATE NULL,
            party_name VARCHAR(255) NOT NULL,
            quotation_nos VARCHAR(500) NULL,
            invoice_nos VARCHAR(500) NULL,
            po_amount DECIMAL(14,2) NULL,
            remarks TEXT NULL,
            attachments TEXT NULL,
            created_by VARCHAR(150) NULL,
            created_at DATETIME NULL,
            updated_by VARCHAR(150) NULL,
            updated_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS delivery_orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            source_type VARCHAR(20) NOT NULL,
            po_id INT NULL,
            po_number VARCHAR(100) NULL,
            quotation_nos VARCHAR(500) NULL,
            party_name VARCHAR(255) NULL,
            invoice_nos VARCHAR(1000) NULL,
            invoice_amount DECIMAL(14,2) NULL,
            assigned_to VARCHAR(150) NULL,
            assigned_by VARCHAR(150) NULL,
            assigned_at DATETIME NULL,
            due_date DATE NULL,
            pass_note TEXT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Pending',
            completed_at DATETIME NULL,
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            INDEX idx_assigned (assigned_to),
            INDEX idx_po (po_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS delivery_order_invoices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            invoice_no VARCHAR(100) NOT NULL,
            invoice_date DATE NULL,
            amount DECIMAL(14,2) NULL,
            UNIQUE KEY uniq_invoice (invoice_no),
            INDEX idx_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS delivery_order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            item_name VARCHAR(255) NOT NULL,
            unit VARCHAR(50) NULL,
            ordered_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
            delivered_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
            INDEX idx_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS delivery_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            delivery_date DATE NULL,
            delivery_type VARCHAR(20) NOT NULL DEFAULT 'Partial',
            items TEXT NULL,
            note TEXT NULL,
            attachments TEXT NULL,
            delivered_by VARCHAR(150) NULL,
            created_at DATETIME NULL,
            INDEX idx_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
} catch (Throwable $e) {
    http_response_code(500);
    responseJson(false, "Failed to prepare delivery tables.", null, [
        "error" => $e->getMessage()
    ]);
}


/* =========================================================
   TALLY INVOICES

   Rows of salesdata that are sales invoices (not sales orders,
   credit notes, receipts or purchases). One row per item line.
========================================================= */

/*
 * The Order To Delivery page started on 1 Nov 2026. Every invoice
 * dated before this was already delivered, so it is never shown
 * in Ready to Pass and counts as delivered on the Customer PO page.
 */
define("DELIVERY_START_DATE", "2026-11-01");

function isOldDeliveredInvoice($invoice)
{
    return $invoice["date"] !== "" && $invoice["date"] < DELIVERY_START_DATE;
}

define("INVOICE_CONDITION", "
    LOWER(TRIM(COALESCE(VoucherTypeName, ''))) <> 'sales order'
    AND LOWER(COALESCE(VoucherTypeName, '')) NOT LIKE '%credit%'
    AND LOWER(COALESCE(VoucherTypeName, '')) NOT LIKE '%debit%'
    AND LOWER(COALESCE(VoucherTypeName, '')) NOT LIKE '%receipt%'
    AND LOWER(COALESCE(VoucherTypeName, '')) NOT LIKE '%purchase%'
    AND LOWER(COALESCE(VoucherTypeName, '')) NOT LIKE '%payment%'
    AND LOWER(COALESCE(VoucherTypeName, '')) NOT LIKE '%journal%'
    AND TRIM(COALESCE(VoucherNumber, '')) <> ''
");

/*
 * Returns invoices keyed by lowercase invoice number:
 * [no, date, party, amount, order_refs[], items[[name, unit, qty]]]
 * $days limits to invoices from the last N days; $invoiceNos loads
 * exactly those invoices (any date).
 */
function loadInvoices($pdo, $days = null, $invoiceNos = null)
{
    $where = INVOICE_CONDITION;
    $params = [];

    if ($invoiceNos !== null) {
        if (empty($invoiceNos)) {
            return [];
        }
        $where .= " AND TRIM(VoucherNumber) IN (" . implode(",", array_fill(0, count($invoiceNos), "?")) . ")";
        $params = array_values($invoiceNos);
    } elseif ($days !== null) {
        $where .= " AND Date >= ?";
        $params[] = date("Y-m-d", strtotime("-" . (int)$days . " days"));
    }

    $stmt = $pdo->prepare("
        SELECT VoucherNumber, Date, PartyLedgerName, EveInvMailingName, Amount, EveItemTaxAmt,
               EveInvVchOrderNos, StockItemName, BilledQty, JasBaseUnit
        FROM salesdata
        WHERE $where
        ORDER BY Date DESC, VoucherNumber DESC
    ");
    $stmt->execute($params);

    $invoices = [];

    while ($row = $stmt->fetch()) {
        $no = trim((string)$row["VoucherNumber"]);
        $key = strtolower($no);

        if (!isset($invoices[$key])) {
            $party = trim((string)($row["PartyLedgerName"] ?? ""));
            $mailing = trim((string)($row["EveInvMailingName"] ?? ""));
            $invoices[$key] = [
                "no" => $no,
                "date" => substr(trim((string)($row["Date"] ?? "")), 0, 10),
                "party" => $mailing !== "" && stripos($party, "cash") !== false ? $mailing : $party,
                "amount" => 0.0,
                "order_refs" => [],
                "items" => []
            ];
        }

        $invoice = &$invoices[$key];

        /* Tally stores sales amounts as negative numbers. */
        $invoice["amount"] += abs((float)($row["Amount"] ?? 0)) + abs((float)($row["EveItemTaxAmt"] ?? 0));

        foreach (splitList($row["EveInvVchOrderNos"] ?? "") as $ref) {
            /* Skip placeholders like "QTN": a real quotation number has a digit. */
            if (!preg_match('/\d/', $ref)) {
                continue;
            }
            if (!in_array($ref, $invoice["order_refs"], true)) {
                $invoice["order_refs"][] = $ref;
            }
        }

        $itemName = trim((string)($row["StockItemName"] ?? ""));
        $qty = abs((float)($row["BilledQty"] ?? 0));

        if ($itemName !== "" && $qty > 0) {
            $unit = trim((string)($row["JasBaseUnit"] ?? ""));
            $itemKey = strtolower($itemName . "|" . $unit);
            if (isset($invoice["items"][$itemKey])) {
                $invoice["items"][$itemKey]["qty"] += $qty;
            } else {
                $invoice["items"][$itemKey] = ["name" => $itemName, "unit" => $unit, "qty" => $qty];
            }
        }

        unset($invoice);
    }

    foreach ($invoices as &$invoice) {
        $invoice["amount"] = round($invoice["amount"], 2);
        $invoice["items"] = array_values($invoice["items"]);
    }
    unset($invoice);

    return $invoices;
}

/* Invoice numbers (lowercase) already passed to delivery -> order id. */
function loadPassedInvoices($pdo)
{
    $passed = [];

    foreach ($pdo->query("SELECT invoice_no, order_id FROM delivery_order_invoices")->fetchAll() as $row) {
        $passed[strtolower(trim($row["invoice_no"]))] = (int)$row["order_id"];
    }

    return $passed;
}

function loadPos($pdo)
{
    return $pdo->query("
        SELECT *
        FROM customer_po
        ORDER BY COALESCE(po_date, DATE(created_at)) DESC, id DESC
    ")->fetchAll();
}

/*
 * Lookup maps used to find the PO of an invoice:
 * by invoice no typed on the PO, by quotation no, by PO number.
 */
function buildPoMaps($pos)
{
    $maps = ["invoice" => [], "ref" => []];

    foreach ($pos as $po) {
        $id = (int)$po["id"];

        foreach (splitList($po["invoice_nos"] ?? "") as $no) {
            $maps["invoice"][strtolower($no)] = $id;
        }

        foreach (splitList($po["quotation_nos"] ?? "") as $no) {
            $maps["ref"][strtolower($no)] = $id;
        }

        $poNumber = strtolower(trim((string)$po["po_number"]));
        if ($poNumber !== "" && !isset($maps["ref"][$poNumber])) {
            $maps["ref"][$poNumber] = $id;
        }
    }

    return $maps;
}

function findPoForInvoice($invoice, $maps)
{
    $key = strtolower($invoice["no"]);

    if (isset($maps["invoice"][$key])) {
        return $maps["invoice"][$key];
    }

    foreach ($invoice["order_refs"] as $ref) {
        $refKey = strtolower($ref);
        if (isset($maps["ref"][$refKey])) {
            return $maps["ref"][$refKey];
        }
    }

    return null;
}

/*
 * Delivery status from the item quantities, or (no items, e.g. a
 * service invoice) from the delivery entries.
 */
function refreshOrderStatus($pdo, $orderId)
{
    $stmt = $pdo->prepare("SELECT ordered_qty, delivered_qty FROM delivery_order_items WHERE order_id = ?");
    $stmt->execute([$orderId]);
    $items = $stmt->fetchAll();

    $stmt = $pdo->prepare("SELECT delivery_type FROM delivery_entries WHERE order_id = ?");
    $stmt->execute([$orderId]);
    $entries = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (!empty($items)) {
        $allDone = true;
        $anyDone = false;

        foreach ($items as $item) {
            if ((float)$item["delivered_qty"] > 0) {
                $anyDone = true;
            }
            if ((float)$item["delivered_qty"] + 0.0005 < (float)$item["ordered_qty"]) {
                $allDone = false;
            }
        }

        $status = $allDone ? "Delivered" : ($anyDone ? "Partially Delivered" : "Pending");
    } else {
        $status = in_array("Full", $entries, true) ? "Delivered" : (!empty($entries) ? "Partially Delivered" : "Pending");
    }

    $pdo->prepare("
        UPDATE delivery_orders
        SET status = ?,
            completed_at = IF(? = 'Delivered', COALESCE(completed_at, NOW()), NULL),
            updated_at = NOW()
        WHERE id = ?
    ")->execute([$status, $status, $orderId]);

    return $status;
}

function orderSummarySql($where = "1=1")
{
    return "
        SELECT o.*,
            (SELECT COUNT(*) FROM delivery_order_items i WHERE i.order_id = o.id) AS item_count,
            (SELECT COALESCE(SUM(i.ordered_qty), 0) FROM delivery_order_items i WHERE i.order_id = o.id) AS ordered_total,
            (SELECT COALESCE(SUM(LEAST(i.delivered_qty, i.ordered_qty)), 0) FROM delivery_order_items i WHERE i.order_id = o.id) AS delivered_total,
            (SELECT COUNT(*) FROM delivery_entries e WHERE e.order_id = o.id) AS delivery_count,
            (SELECT MAX(e.delivery_date) FROM delivery_entries e WHERE e.order_id = o.id) AS last_delivery_date
        FROM delivery_orders o
        WHERE $where
    ";
}


/* =========================================================
   METHOD
========================================================= */

$method = $_SERVER["REQUEST_METHOD"];
$action = (string)param("action");

try {

    /* =====================================================
       CUSTOMER PO: LIST
    ===================================================== */

    if ($method === "GET" && $action === "po_list") {
        $pos = loadPos($pdo);
        $maps = buildPoMaps($pos);
        $passed = loadPassedInvoices($pdo);

        /* Invoices of the last ~13 months, plus any typed on a PO. */
        $invoices = loadInvoices($pdo, 400);
        $typed = [];

        foreach ($pos as $po) {
            foreach (splitList($po["invoice_nos"] ?? "") as $no) {
                if (!isset($invoices[strtolower($no)])) {
                    $typed[] = $no;
                }
            }
        }

        if (!empty($typed)) {
            $invoices += loadInvoices($pdo, null, array_values(array_unique($typed)));
        }

        $invoicesByPo = [];
        foreach ($invoices as $invoice) {
            $poId = findPoForInvoice($invoice, $maps);
            if ($poId === null) {
                continue;
            }

            $invoicesByPo[$poId][] = [
                "no" => $invoice["no"],
                "date" => $invoice["date"],
                "amount" => $invoice["amount"],
                "passed_order_id" => $passed[strtolower($invoice["no"])] ?? null,
                "old_delivered" => isOldDeliveredInvoice($invoice)
            ];
        }

        $orders = [];
        foreach ($pdo->query("SELECT id, po_id, status, assigned_to FROM delivery_orders WHERE po_id IS NOT NULL ORDER BY id")->fetchAll() as $order) {
            $orders[(int)$order["po_id"]][] = $order;
        }

        foreach ($pos as &$po) {
            $id = (int)$po["id"];
            $po["attachments"] = parseAttachments($po["attachments"]);
            $po["invoices"] = $invoicesByPo[$id] ?? [];
            $po["delivery_orders"] = $orders[$id] ?? [];

            $pending = array_filter($po["invoices"], function ($inv) {
                return $inv["passed_order_id"] === null && !$inv["old_delivered"];
            });

            if (!empty($po["invoices"]) && empty($pending) && empty($po["delivery_orders"])) {
                $po["status"] = "Delivered";
            } elseif (!empty($po["delivery_orders"]) && empty($pending)) {
                $po["status"] = "Passed to Delivery";
            } elseif (!empty($pending)) {
                $po["status"] = "Invoiced";
            } else {
                $po["status"] = "Waiting for Invoice";
            }
        }
        unset($po);

        responseJson(true, "PO list loaded.", $pos);
    }


    /* =====================================================
       CUSTOMER PO: SAVE
    ===================================================== */

    if ($method === "POST" && $action === "po_save") {
        $id = (int)param("id", 0);
        $poNumber = (string)param("po_number");
        $partyName = (string)param("party_name");
        $user = (string)param("user");

        if ($poNumber === "") {
            fail("PO number is required.");
        }

        if ($partyName === "") {
            fail("Party name is required.");
        }

        $values = [
            ":po_number" => $poNumber,
            ":po_date" => validDate(param("po_date")),
            ":party_name" => $partyName,
            ":quotation_nos" => implode(", ", splitList(param("quotation_nos"))),
            ":invoice_nos" => implode(", ", splitList(param("invoice_nos"))),
            ":po_amount" => param("po_amount") === "" ? null : (float)param("po_amount"),
            ":remarks" => (string)param("remarks"),
            ":user" => $user
        ];

        $duplicate = $pdo->prepare("
            SELECT id
            FROM customer_po
            WHERE LOWER(TRIM(po_number)) = LOWER(?)
              AND LOWER(TRIM(party_name)) = LOWER(?)
              AND id <> ?
            LIMIT 1
        ");
        $duplicate->execute([$poNumber, $partyName, $id]);

        if ($duplicate->fetch()) {
            fail("This PO number is already entered for this party.");
        }

        /* ===============================================
           UPDATE
        =============================================== */

        if ($id > 0) {
            $stmt = $pdo->prepare("SELECT attachments FROM customer_po WHERE id = ?");
            $stmt->execute([$id]);
            $existing = $stmt->fetch();

            if (!$existing) {
                fail("PO not found.", 404);
            }

            $old = parseAttachments($existing["attachments"]);
            $keepIds = json_decode((string)param("keep_attachments", "[]"), true);
            $keepIds = is_array($keepIds) ? $keepIds : [];
            $kept = [];

            foreach ($old as $file) {
                if (in_array($file["id"] ?? "", $keepIds, true)) {
                    $kept[] = $file;
                } else {
                    deleteAttachmentFile($file);
                }
            }

            $values[":attachments"] = json_encode(
                array_merge($kept, uploadAttachments("PO_" . $poNumber)),
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
            $values[":id"] = $id;

            $pdo->prepare("
                UPDATE customer_po
                SET
                    po_number = :po_number,
                    po_date = :po_date,
                    party_name = :party_name,
                    quotation_nos = :quotation_nos,
                    invoice_nos = :invoice_nos,
                    po_amount = :po_amount,
                    remarks = :remarks,
                    attachments = :attachments,
                    updated_by = :user,
                    updated_at = NOW()
                WHERE id = :id
            ")->execute($values);

            responseJson(true, "PO updated.", ["id" => $id]);
        }

        /* ===============================================
           ADD NEW
        =============================================== */

        $values[":attachments"] = json_encode(uploadAttachments("PO_" . $poNumber), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $values[":updated_by"] = $user;

        $pdo->prepare("
            INSERT INTO customer_po
            (
                po_number, po_date, party_name, quotation_nos, invoice_nos, po_amount,
                remarks, attachments, created_by, created_at, updated_by, updated_at
            )
            VALUES
            (
                :po_number, :po_date, :party_name, :quotation_nos, :invoice_nos, :po_amount,
                :remarks, :attachments, :user, NOW(), :updated_by, NOW()
            )
        ")->execute($values);

        responseJson(true, "PO added.", ["id" => (int)$pdo->lastInsertId()]);
    }


    /* =====================================================
       CUSTOMER PO: DELETE
    ===================================================== */

    if ($method === "POST" && $action === "po_delete") {
        $id = (int)param("id", 0);

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM delivery_orders WHERE po_id = ?");
        $stmt->execute([$id]);
        if ((int)$stmt->fetchColumn() > 0) {
            fail("This PO is already passed to delivery and cannot be deleted.");
        }

        $stmt = $pdo->prepare("SELECT attachments FROM customer_po WHERE id = ?");
        $stmt->execute([$id]);
        $po = $stmt->fetch();

        if (!$po) {
            fail("PO not found.", 404);
        }

        foreach (parseAttachments($po["attachments"]) as $file) {
            deleteAttachmentFile($file);
        }

        $pdo->prepare("DELETE FROM customer_po WHERE id = ?")->execute([$id]);

        responseJson(true, "PO deleted.");
    }


    /* =====================================================
       READY TO PASS
       Invoices not yet passed, grouped by PO, else by
       quotation (order ref), else the invoice on its own.
    ===================================================== */

    if ($method === "GET" && $action === "ready") {
        $days = max(1, min(730, (int)param("days", 60)));

        $pos = loadPos($pdo);
        $posById = [];
        foreach ($pos as $po) {
            $posById[(int)$po["id"]] = $po;
        }

        $maps = buildPoMaps($pos);
        $passed = loadPassedInvoices($pdo);
        $groups = [];

        foreach (loadInvoices($pdo, $days) as $key => $invoice) {
            if (isset($passed[$key]) || isOldDeliveredInvoice($invoice)) {
                continue;
            }

            $poId = findPoForInvoice($invoice, $maps);

            if ($poId !== null) {
                $groupKey = "po:" . $poId;
                $sourceType = "po";
            } elseif (!empty($invoice["order_refs"])) {
                $groupKey = "q:" . strtolower($invoice["party"]) . "|" . strtolower($invoice["order_refs"][0]);
                $sourceType = "quotation";
            } else {
                $groupKey = "inv:" . $key;
                $sourceType = "invoice";
            }

            if (!isset($groups[$groupKey])) {
                $po = $poId !== null ? $posById[$poId] : null;
                $groups[$groupKey] = [
                    "key" => $groupKey,
                    "source_type" => $sourceType,
                    "po_id" => $poId,
                    "po_number" => $po ? $po["po_number"] : "",
                    "po_date" => $po ? $po["po_date"] : "",
                    "party_name" => $po ? $po["party_name"] : $invoice["party"],
                    "quotation_nos" => $po ? splitList($po["quotation_nos"]) : [],
                    "invoices" => [],
                    "amount" => 0.0,
                    "item_count" => 0,
                    "latest_date" => ""
                ];
            }

            $group = &$groups[$groupKey];

            foreach ($invoice["order_refs"] as $ref) {
                if (!in_array($ref, $group["quotation_nos"], true)) {
                    $group["quotation_nos"][] = $ref;
                }
            }

            $group["invoices"][] = [
                "no" => $invoice["no"],
                "date" => $invoice["date"],
                "amount" => $invoice["amount"],
                "items" => $invoice["items"]
            ];
            $group["amount"] = round($group["amount"] + $invoice["amount"], 2);
            $group["item_count"] += count($invoice["items"]);

            if ($invoice["date"] > $group["latest_date"]) {
                $group["latest_date"] = $invoice["date"];
            }

            unset($group);
        }

        $list = array_values($groups);
        usort($list, function ($a, $b) {
            return strcmp($b["latest_date"], $a["latest_date"]);
        });

        responseJson(true, "Ready list loaded.", $list);
    }


    /* =====================================================
       PASS TO DELIVERY
    ===================================================== */

    if ($method === "POST" && $action === "pass") {
        $invoiceNos = json_decode((string)param("invoice_nos", "[]"), true);
        $invoiceNos = is_array($invoiceNos)
            ? array_values(array_unique(array_filter(array_map("trim", $invoiceNos))))
            : [];
        $assignedTo = (string)param("assigned_to");
        $user = (string)param("user");
        $poId = (int)param("po_id", 0);

        if (empty($invoiceNos)) {
            fail("Select at least one invoice.");
        }

        if ($assignedTo === "") {
            fail("Select the salesman responsible for this delivery.");
        }

        $invoices = loadInvoices($pdo, null, $invoiceNos);
        if (count($invoices) !== count($invoiceNos)) {
            fail("Some invoices were not found in Tally data.");
        }

        $passed = loadPassedInvoices($pdo);
        foreach ($invoices as $key => $invoice) {
            if (isOldDeliveredInvoice($invoice)) {
                fail("Invoice " . $invoice["no"] . " is dated before " . date("d M Y", strtotime(DELIVERY_START_DATE)) . " and is already treated as delivered.");
            }
            if (isset($passed[$key])) {
                fail("Invoice " . $invoice["no"] . " is already passed to delivery.");
            }
        }

        $po = null;
        if ($poId > 0) {
            $stmt = $pdo->prepare("SELECT * FROM customer_po WHERE id = ?");
            $stmt->execute([$poId]);
            $po = $stmt->fetch() ?: null;
        }

        $quotationNos = $po ? splitList($po["quotation_nos"]) : [];
        $items = [];
        $amount = 0.0;
        $party = $po ? $po["party_name"] : "";

        foreach ($invoices as $invoice) {
            if ($party === "") {
                $party = $invoice["party"];
            }

            $amount += $invoice["amount"];

            foreach ($invoice["order_refs"] as $ref) {
                if (!in_array($ref, $quotationNos, true)) {
                    $quotationNos[] = $ref;
                }
            }

            foreach ($invoice["items"] as $item) {
                $itemKey = strtolower($item["name"] . "|" . $item["unit"]);
                if (isset($items[$itemKey])) {
                    $items[$itemKey]["qty"] += $item["qty"];
                } else {
                    $items[$itemKey] = $item;
                }
            }
        }

        $sourceType = $po ? "po" : (!empty($quotationNos) ? "quotation" : "invoice");

        $pdo->beginTransaction();

        try {
            $pdo->prepare("
                INSERT INTO delivery_orders
                (
                    source_type, po_id, po_number, quotation_nos, party_name, invoice_nos, invoice_amount,
                    assigned_to, assigned_by, assigned_at, due_date, pass_note, status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'Pending', NOW(), NOW())
            ")->execute([
                $sourceType,
                $po ? (int)$po["id"] : null,
                $po ? $po["po_number"] : null,
                implode(", ", $quotationNos),
                $party,
                implode(", ", array_map(function ($inv) {
                    return $inv["no"];
                }, $invoices)),
                round($amount, 2),
                $assignedTo,
                $user,
                validDate(param("due_date")),
                (string)param("note")
            ]);

            $orderId = (int)$pdo->lastInsertId();

            $insertInvoice = $pdo->prepare("
                INSERT INTO delivery_order_invoices (order_id, invoice_no, invoice_date, amount)
                VALUES (?, ?, ?, ?)
            ");
            foreach ($invoices as $invoice) {
                $insertInvoice->execute([$orderId, $invoice["no"], validDate($invoice["date"]), $invoice["amount"]]);
            }

            $insertItem = $pdo->prepare("
                INSERT INTO delivery_order_items (order_id, item_name, unit, ordered_qty, delivered_qty)
                VALUES (?, ?, ?, ?, 0)
            ");
            foreach ($items as $item) {
                $insertItem->execute([$orderId, $item["name"], $item["unit"], round($item["qty"], 3)]);
            }

            $pdo->commit();

        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            if ($e instanceof PDOException && $e->getCode() === "23000") {
                fail("One of these invoices was just passed to delivery by someone else. Refresh and try again.", 409);
            }

            throw $e;
        }

        responseJson(true, "Passed to delivery and assigned to " . $assignedTo . ".", ["id" => $orderId]);
    }


    /* =====================================================
       DELIVERY ORDERS LIST
    ===================================================== */

    if ($method === "GET" && $action === "orders") {
        $user = (string)param("user");

        if ($user !== "") {
            $stmt = $pdo->prepare(orderSummarySql("LOWER(TRIM(COALESCE(o.assigned_to, ''))) = LOWER(?)") . " ORDER BY o.id DESC");
            $stmt->execute([$user]);
        } else {
            $stmt = $pdo->query(orderSummarySql() . " ORDER BY o.id DESC");
        }

        responseJson(true, "Orders loaded.", $stmt->fetchAll());
    }


    /* =====================================================
       ONE ORDER
    ===================================================== */

    if ($method === "GET" && $action === "order_detail") {
        $id = (int)param("id", 0);

        $stmt = $pdo->prepare(orderSummarySql("o.id = ?"));
        $stmt->execute([$id]);
        $order = $stmt->fetch();

        if (!$order) {
            fail("Order not found.", 404);
        }

        $stmt = $pdo->prepare("SELECT * FROM delivery_order_items WHERE order_id = ? ORDER BY id");
        $stmt->execute([$id]);
        $order["items"] = $stmt->fetchAll();

        $stmt = $pdo->prepare("
            SELECT invoice_no, invoice_date, amount
            FROM delivery_order_invoices
            WHERE order_id = ?
            ORDER BY invoice_date, id
        ");
        $stmt->execute([$id]);
        $order["invoices"] = $stmt->fetchAll();

        $stmt = $pdo->prepare("SELECT * FROM delivery_entries WHERE order_id = ? ORDER BY delivery_date DESC, id DESC");
        $stmt->execute([$id]);
        $entries = $stmt->fetchAll();

        foreach ($entries as &$entry) {
            $entry["items"] = json_decode((string)$entry["items"], true) ?: [];
            $entry["attachments"] = parseAttachments($entry["attachments"]);
        }
        unset($entry);

        $order["entries"] = $entries;

        responseJson(true, "Order loaded.", $order);
    }


    /* =====================================================
       RECORD A DELIVERY
       items = [{item_id, qty}] for orders with items;
       delivery_type = Partial / Full for orders without.
    ===================================================== */

    if ($method === "POST" && $action === "deliver") {
        $orderId = (int)param("order_id", 0);
        $user = (string)param("user");
        $deliveryDate = validDate(param("delivery_date")) ?: date("Y-m-d");

        $stmt = $pdo->prepare("SELECT id, status FROM delivery_orders WHERE id = ?");
        $stmt->execute([$orderId]);
        $order = $stmt->fetch();

        if (!$order) {
            fail("Order not found.", 404);
        }

        if ($order["status"] === "Delivered") {
            fail("This order is already fully delivered.");
        }

        $stmt = $pdo->prepare("SELECT * FROM delivery_order_items WHERE order_id = ?");
        $stmt->execute([$orderId]);
        $items = [];
        foreach ($stmt->fetchAll() as $item) {
            $items[(int)$item["id"]] = $item;
        }

        $requested = json_decode((string)param("items", "[]"), true);
        $requested = is_array($requested) ? $requested : [];

        $entryItems = [];
        $deliveryType = param("delivery_type") === "Full" ? "Full" : "Partial";

        if (!empty($items)) {
            foreach ($requested as $line) {
                $itemId = (int)($line["item_id"] ?? 0);
                $qty = round((float)($line["qty"] ?? 0), 3);

                if ($qty <= 0) {
                    continue;
                }

                if (!isset($items[$itemId])) {
                    fail("Unknown item in this delivery.");
                }

                $item = $items[$itemId];
                $balance = round((float)$item["ordered_qty"] - (float)$item["delivered_qty"], 3);

                if ($qty > $balance + 0.0005) {
                    fail("Delivered quantity for " . $item["item_name"] . " is more than the balance (" . $balance . ").");
                }

                $entryItems[] = [
                    "item_id" => $itemId,
                    "item_name" => $item["item_name"],
                    "unit" => $item["unit"],
                    "qty" => $qty
                ];
            }

            if (empty($entryItems)) {
                fail("Enter the quantity delivered for at least one item.");
            }
        }

        $pdo->beginTransaction();

        try {
            $update = $pdo->prepare("
                UPDATE delivery_order_items
                SET delivered_qty = delivered_qty + ?
                WHERE id = ? AND order_id = ?
            ");
            foreach ($entryItems as $line) {
                $update->execute([$line["qty"], $line["item_id"], $orderId]);
            }

            $pdo->prepare("
                INSERT INTO delivery_entries
                    (order_id, delivery_date, delivery_type, items, note, attachments, delivered_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ")->execute([
                $orderId,
                $deliveryDate,
                $deliveryType,
                json_encode($entryItems, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                (string)param("note"),
                json_encode(uploadAttachments("DO_" . $orderId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $user
            ]);

            $status = refreshOrderStatus($pdo, $orderId);

            $pdo->commit();

        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        responseJson(
            true,
            $status === "Delivered" ? "Order fully delivered." : "Delivery saved. Order is " . strtolower($status) . ".",
            ["status" => $status]
        );
    }


    /* =====================================================
       UNDO A DELIVERY ENTRY
    ===================================================== */

    if ($method === "POST" && $action === "delete_delivery") {
        $entryId = (int)param("entry_id", 0);

        $stmt = $pdo->prepare("SELECT * FROM delivery_entries WHERE id = ?");
        $stmt->execute([$entryId]);
        $entry = $stmt->fetch();

        if (!$entry) {
            fail("Delivery entry not found.", 404);
        }

        $orderId = (int)$entry["order_id"];

        $pdo->beginTransaction();

        try {
            $update = $pdo->prepare("
                UPDATE delivery_order_items
                SET delivered_qty = GREATEST(delivered_qty - ?, 0)
                WHERE id = ? AND order_id = ?
            ");
            foreach ((json_decode((string)$entry["items"], true) ?: []) as $line) {
                $update->execute([(float)($line["qty"] ?? 0), (int)($line["item_id"] ?? 0), $orderId]);
            }

            $pdo->prepare("DELETE FROM delivery_entries WHERE id = ?")->execute([$entryId]);

            refreshOrderStatus($pdo, $orderId);

            $pdo->commit();

        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        foreach (parseAttachments($entry["attachments"]) as $file) {
            deleteAttachmentFile($file);
        }

        responseJson(true, "Delivery entry removed.");
    }


    /* =====================================================
       REASSIGN
    ===================================================== */

    if ($method === "POST" && $action === "reassign") {
        $orderId = (int)param("order_id", 0);
        $assignedTo = (string)param("assigned_to");

        if ($assignedTo === "") {
            fail("Select the salesman.");
        }

        $pdo->prepare("
            UPDATE delivery_orders
            SET assigned_to = ?, assigned_by = ?, assigned_at = NOW(), due_date = ?, updated_at = NOW()
            WHERE id = ?
        ")->execute([$assignedTo, (string)param("user"), validDate(param("due_date")), $orderId]);

        responseJson(true, "Order assigned to " . $assignedTo . ".");
    }


    /* =====================================================
       REMOVE ORDER (back to Ready to Pass)
    ===================================================== */

    if ($method === "POST" && $action === "remove_order") {
        $orderId = (int)param("order_id", 0);

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM delivery_entries WHERE order_id = ?");
        $stmt->execute([$orderId]);

        if ((int)$stmt->fetchColumn() > 0) {
            fail("Remove the delivery entries first.");
        }

        $pdo->beginTransaction();

        try {
            $pdo->prepare("DELETE FROM delivery_order_items WHERE order_id = ?")->execute([$orderId]);
            $pdo->prepare("DELETE FROM delivery_order_invoices WHERE order_id = ?")->execute([$orderId]);
            $pdo->prepare("DELETE FROM delivery_orders WHERE id = ?")->execute([$orderId]);

            $pdo->commit();

        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        responseJson(true, "Order removed and sent back to Ready to Pass.");
    }

    fail("Unknown action.");

} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log("ORDER DELIVERY ERROR: " . $e->getMessage());

    http_response_code(500);
    responseJson(false, "Server error.", null, [
        "error" => $e->getMessage()
    ]);
}
