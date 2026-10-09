<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

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
   ENSURE REMARKS COLUMN EXISTS
   Adds the column once if the table does not have it yet.
========================================================= */

try {
    $colCheck = $pdo->query("SHOW COLUMNS FROM enquiry_report LIKE 'remarks'");
    if (!$colCheck->fetch()) {
        $pdo->exec("ALTER TABLE enquiry_report ADD COLUMN remarks TEXT NULL AFTER sales_order_no");
    }
} catch (Throwable $e) {
    error_log("REMARKS COLUMN CHECK ERROR: " . $e->getMessage());
}


/* =========================================================
   COLUMNS RETURNED FOR EVERY ENQUIRY
   One list used by every SELECT so no field is ever missed.
========================================================= */

define("ENQUIRY_COLUMNS", "
    id,
    enquiry_no,
    enquiry_date,
    customer_name,
    address,
    phone_number,
    enquiry_source,
    description,
    attachments,
    added_by,
    assigned_to,
    brought_by,
    sales_order_no,
    remarks,
    created_at,
    updated_at
");


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


/* =========================================================
   FINANCIAL YEAR
========================================================= */

function getFinancialYear()
{
    $month = (int)date("n");
    $year = (int)date("Y");

    if ($month >= 4) {
        $startYear = $year;
        $endYear = $year + 1;
    } else {
        $startYear = $year - 1;
        $endYear = $year;
    }

    return sprintf("%02d-%02d", $startYear % 100, $endYear % 100);
}


/* =========================================================
   NEXT ENQUIRY NUMBER
========================================================= */

function getNextEnquiryNumber($pdo)
{
    $financialYear = getFinancialYear();
    $pattern = "ENQ/%/" . $financialYear;

    $stmt = $pdo->prepare("
        SELECT enquiry_no
        FROM enquiry_report
        WHERE enquiry_no LIKE :pattern
    ");
    $stmt->execute([":pattern" => $pattern]);
    $rows = $stmt->fetchAll();

    $maxNumber = 0;

    foreach ($rows as $row) {
        if (empty($row["enquiry_no"])) {
            continue;
        }

        $parts = explode("/", $row["enquiry_no"]);

        if (count($parts) >= 3 && is_numeric($parts[1])) {
            $number = (int)$parts[1];
            if ($number > $maxNumber) {
                $maxNumber = $number;
            }
        }
    }

    return "ENQ/" . ($maxNumber + 1) . "/" . $financialYear;
}


/* =========================================================
   BASE URL
========================================================= */

function getBaseUrl()
{
    $https = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off");
    $protocol = $https ? "https" : "http";
    $host = $_SERVER["HTTP_HOST"] ?? "localhost";

    return $protocol . "://" . $host . "/everest/serverphp";
}


/* =========================================================
   ATTACHMENT DIRECTORY
========================================================= */

function getUploadDirectory()
{
    return __DIR__ . DIRECTORY_SEPARATOR . "enquiry_uploads";
}

function ensureUploadDirectory()
{
    $directory = getUploadDirectory();

    if (!is_dir($directory)) {
        if (!mkdir($directory, 0755, true)) {
            throw new Exception("Unable to create attachment directory.");
        }
    }

    return $directory;
}


/* =========================================================
   SAFE FILE NAME
========================================================= */

function safeFileName($name)
{
    $name = basename($name);
    return preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
}


/* =========================================================
   UPLOAD FILES
========================================================= */

function uploadAttachments($enquiryNo)
{
    if (empty($_FILES["attachments"])) {
        return [];
    }

    ensureUploadDirectory();

    $files = $_FILES["attachments"];
    $uploaded = [];
    $maxSize = 25 * 1024 * 1024;
    $count = is_array($files["name"]) ? count($files["name"]) : 0;

    for ($i = 0; $i < $count; $i++) {
        $originalName = $files["name"][$i];
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

        $fileType = "";

        if (function_exists("finfo_open")) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $fileType = finfo_file($finfo, $tmpName);
                finfo_close($finfo);
            }
        }

        if (!$fileType) {
            $fileType = $files["type"][$i] ?? "application/octet-stream";
        }

        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $safeEnquiry = preg_replace('/[^A-Za-z0-9_-]/', '_', $enquiryNo);
        $uniqueName = $safeEnquiry . "_" . bin2hex(random_bytes(8));

        if ($extension) {
            $uniqueName .= "." . $extension;
        }

        $destination = getUploadDirectory() . DIRECTORY_SEPARATOR . $uniqueName;

        if (!move_uploaded_file($tmpName, $destination)) {
            throw new Exception("Unable to save uploaded file: " . $originalName);
        }

        $fileUrl = getBaseUrl() . "/enquiry_uploads/" . rawurlencode($uniqueName);

        $uploaded[] = [
            "id" => bin2hex(random_bytes(6)),
            "original_name" => $originalName,
            "stored_name" => $uniqueName,
            "file_url" => $fileUrl,
            "file_type" => $fileType,
            "file_size" => $size,
            "uploaded_at" => date("Y-m-d H:i:s")
        ];
    }

    return $uploaded;
}


/* =========================================================
   DELETE PHYSICAL FILE
========================================================= */

function deleteAttachmentFile($attachment)
{
    if (empty($attachment["stored_name"])) {
        return;
    }

    $file = getUploadDirectory() . DIRECTORY_SEPARATOR . basename($attachment["stored_name"]);

    if (is_file($file)) {
        @unlink($file);
    }
}


/* =========================================================
   PARSE ATTACHMENTS
========================================================= */

function parseAttachments($value)
{
    if (empty($value)) {
        return [];
    }

    if (is_array($value)) {
        return $value;
    }

    $decoded = json_decode($value, true);

    if (is_array($decoded)) {
        return $decoded;
    }

    return [];
}


/* =========================================================
   ENTERED BY FROM SALESDATA
   Matches enquiry quotation number with salesdata quotation number
========================================================= */

function getQuotationDetailsByEnquiryNo($pdo, $enquiryNo)
{
    $enquiryNo = trim((string)$enquiryNo);
    $result = [
        "quotation_no" => "",
        "quotation_nos" => [],
        "entered_by" => ""
    ];

    if ($enquiryNo === "") return $result;

    try {
        $sql = "
            SELECT VoucherNumber, OrderNo, EveInvVchOrderNos, EnteredBy
            FROM salesdata
            WHERE TRIM(COALESCE(enquiry_no, '')) = :enquiry_no
            ORDER BY `Sl No` ASC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([":enquiry_no" => $enquiryNo]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!$rows) {
            $sql = "
                SELECT VoucherNumber, OrderNo, EveInvVchOrderNos, EnteredBy
                FROM salesdata
                WHERE LOWER(TRIM(COALESCE(enquiry_no, ''))) = LOWER(:enquiry_no)
                ORDER BY `Sl No` ASC
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([":enquiry_no" => $enquiryNo]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        foreach ($rows as $row) {
            foreach (["VoucherNumber", "OrderNo", "EveInvVchOrderNos"] as $field) {
                $q = trim((string)($row[$field] ?? ""));
                if ($q !== "" && !in_array($q, $result["quotation_nos"], true)) {
                    $result["quotation_nos"][] = $q;
                }
            }
            if ($result["entered_by"] === "") {
                $enteredBy = trim((string)($row["EnteredBy"] ?? ""));
                if ($enteredBy !== "") $result["entered_by"] = $enteredBy;
            }
        }

        if (!empty($result["quotation_nos"])) {
            $result["quotation_no"] = $result["quotation_nos"][0];
        }
        return $result;
    } catch (Throwable $e) {
        error_log("SALESDATA ENQUIRY LOOKUP ERROR: " . $e->getMessage());
        return $result;
    }
}


/* =========================================================
   TALLY QUOTATION -> ENQUIRY / ENTERED BY LOOKUP
   Used when quotation number is entered manually in the UI.
========================================================= */

function getEnquiryDetailsByQuotationNo($pdo, $quotationNo)
{
    $quotationNo = trim((string)$quotationNo);
    $result = [
        "enquiry_no" => "",
        "quotation_no" => "",
        "quotation_nos" => [],
        "entered_by" => ""
    ];

    if ($quotationNo === "") return $result;

    try {
        /* Use different placeholders because native PDO prepares do not safely
           support reusing the same named placeholder multiple times. */
        $sql = "
            SELECT enquiry_no, VoucherNumber, OrderNo, EveInvVchOrderNos, EnteredBy
            FROM salesdata
            WHERE TRIM(COALESCE(VoucherNumber, '')) = :voucher_no
               OR TRIM(COALESCE(OrderNo, '')) = :order_no
               OR TRIM(COALESCE(EveInvVchOrderNos, '')) = :eve_order_no
            ORDER BY `Sl No` ASC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ":voucher_no" => $quotationNo,
            ":order_no" => $quotationNo,
            ":eve_order_no" => $quotationNo
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!$rows) {
            $sql = "
                SELECT enquiry_no, VoucherNumber, OrderNo, EveInvVchOrderNos, EnteredBy
                FROM salesdata
                WHERE LOWER(TRIM(COALESCE(VoucherNumber, ''))) = LOWER(:voucher_no)
                   OR LOWER(TRIM(COALESCE(OrderNo, ''))) = LOWER(:order_no)
                   OR LOWER(TRIM(COALESCE(EveInvVchOrderNos, ''))) = LOWER(:eve_order_no)
                ORDER BY `Sl No` ASC
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                ":voucher_no" => $quotationNo,
                ":order_no" => $quotationNo,
                ":eve_order_no" => $quotationNo
            ]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        foreach ($rows as $row) {
            if ($result["enquiry_no"] === "") {
                $enq = trim((string)($row["enquiry_no"] ?? ""));
                if ($enq !== "") $result["enquiry_no"] = $enq;
            }

            if ($result["entered_by"] === "") {
                $enteredBy = trim((string)($row["EnteredBy"] ?? ""));
                if ($enteredBy !== "") $result["entered_by"] = $enteredBy;
            }

            foreach (["VoucherNumber", "OrderNo", "EveInvVchOrderNos"] as $field) {
                $q = trim((string)($row[$field] ?? ""));
                if ($q !== "" && !in_array($q, $result["quotation_nos"], true)) {
                    $result["quotation_nos"][] = $q;
                }
                if ($result["quotation_no"] === "" && $q !== "") {
                    $result["quotation_no"] = $q;
                }
            }

            if ($result["enquiry_no"] !== "" && $result["entered_by"] !== "" && $result["quotation_no"] !== "") break;
        }

        if ($result["quotation_no"] === "" && $quotationNo !== "") {
            $result["quotation_no"] = $quotationNo;
        }
        return $result;
    } catch (Throwable $e) {
        error_log("SALESDATA QUOTATION LOOKUP ERROR: " . $e->getMessage());
        return $result;
    }
}


function attachQuotationEnteredBy($pdo, &$data)
{
    if (!is_array($data)) return;

    foreach ($data as &$row) {
        $savedQuotationNo = trim((string)($row["sales_order_no"] ?? ""));
        $savedEnquiryNo = trim((string)($row["enquiry_no"] ?? ""));

        $details = [
            "enquiry_no" => "",
            "quotation_no" => "",
            "quotation_nos" => [],
            "entered_by" => ""
        ];

        /* Direction 1: Enquiry page has quotation number. */
        if ($savedQuotationNo !== "") {
            $details = getEnquiryDetailsByQuotationNo($pdo, $savedQuotationNo);
        }

        /* Direction 2: quotation page has saved enquiry number. */
        if ($savedEnquiryNo !== "") {
            $byEnquiry = getQuotationDetailsByEnquiryNo($pdo, $savedEnquiryNo);

            if (($details["entered_by"] ?? "") === "") {
                $details["entered_by"] = $byEnquiry["entered_by"] ?? "";
            }
            if (($details["enquiry_no"] ?? "") === "") {
                $details["enquiry_no"] = $savedEnquiryNo;
            }
            foreach (($byEnquiry["quotation_nos"] ?? []) as $q) {
                if ($q !== "" && !in_array($q, $details["quotation_nos"], true)) {
                    $details["quotation_nos"][] = $q;
                }
            }
            if (($details["quotation_no"] ?? "") === "" && !empty($byEnquiry["quotation_no"])) {
                $details["quotation_no"] = $byEnquiry["quotation_no"];
            }
        }

        $row["linked_quotation_no"] = $details["quotation_no"] ?? "";
        $row["linked_quotation_nos"] = $details["quotation_nos"] ?? [];
        $row["entered_by"] = $details["entered_by"] ?? "";

        /* Always send remarks as a string so the page never gets null. */
        $row["remarks"] = (string)($row["remarks"] ?? "");

        /* If salesdata has a quotation for this enquiry and the enquiry record
           itself has no quotation number, expose it to the existing UI. */
        if ($savedQuotationNo === "" && !empty($details["quotation_no"])) {
            $row["sales_order_no"] = $details["quotation_no"];
        }
    }
    unset($row);
}


/* =========================================================
   NEGOTIATION → QUOTATION REWORK REQUEST

   Choosing the "Negotiation" remark creates a Pending row in
   quotation_alteration_requests (the same table used by the
   Quotation Follow-up page). GlobalAlterationAlert shows that
   row to the quotation team (Sion and Rahida). When they mark
   it "Rework Completed" the row becomes "Revised" and the
   enquiry remark changes to "Negotiation Rework Completed".
========================================================= */

define("NEGOTIATION_REMARK", "Negotiation");

function ensureNegotiationColumns($pdo)
{
    $columns = [
        "enquiry_id" => "ADD COLUMN enquiry_id INT NULL",
        "revised_by" => "ADD COLUMN revised_by VARCHAR(150) NULL",
        "revised_at" => "ADD COLUMN revised_at DATETIME NULL"
    ];

    foreach ($columns as $name => $definition) {
        try {
            $check = $pdo->query("SHOW COLUMNS FROM quotation_alteration_requests LIKE " . $pdo->quote($name));
            if (!$check->fetch()) {
                $pdo->exec("ALTER TABLE quotation_alteration_requests " . $definition);
            }
        } catch (Throwable $e) {
            error_log("NEGOTIATION COLUMN CHECK ERROR ($name): " . $e->getMessage());
        }
    }
}

/*
 * Creates a Pending rework request for the enquiry.
 * If a Pending request already exists for this enquiry or this
 * quotation (e.g. raised from the follow-up page), it is reused
 * and linked to the enquiry instead of creating a duplicate alert.
 * Returns true when a new request was created.
 */
function createNegotiationRequest($pdo, $enquiryId, $quotationNo, $party, $requestedBy, $details)
{
    ensureNegotiationColumns($pdo);

    $stmt = $pdo->prepare("
        SELECT id
        FROM quotation_alteration_requests
        WHERE request_status = 'Pending'
          AND (enquiry_id = :enquiry_id OR (:quotation_no <> '' AND quotation_no = :quotation_no2))
        LIMIT 1
    ");
    $stmt->execute([
        ":enquiry_id" => $enquiryId,
        ":quotation_no" => $quotationNo,
        ":quotation_no2" => $quotationNo
    ]);
    $existing = $stmt->fetch();

    if ($existing) {
        $pdo->prepare("
            UPDATE quotation_alteration_requests
            SET enquiry_id = :enquiry_id, updated_at = NOW()
            WHERE id = :id AND enquiry_id IS NULL
        ")->execute([":enquiry_id" => $enquiryId, ":id" => $existing["id"]]);

        return false;
    }

    $pdo->prepare("
        INSERT INTO quotation_alteration_requests
            (quotation_no, party, order_no, invoice_no, requested_by, remarks, request_status, enquiry_id)
        VALUES
            (:quotation_no, :party, '', '', :requested_by, :remarks, 'Pending', :enquiry_id)
    ")->execute([
        ":quotation_no" => $quotationNo,
        ":party" => $party,
        ":requested_by" => $requestedBy,
        ":remarks" => $details,
        ":enquiry_id" => $enquiryId
    ]);

    return true;
}

/*
 * Adds negotiation_status ("Pending" / "Revised" / ""),
 * negotiation_revised_by and negotiation_revised_at to each row,
 * using the latest request linked by enquiry id, or else by
 * quotation number.
 */
function attachNegotiationStatus($pdo, &$data)
{
    if (!is_array($data) || empty($data)) return;

    $byEnquiry = [];
    $byQuotation = [];

    try {
        ensureNegotiationColumns($pdo);

        $rows = $pdo->query("
            SELECT id, enquiry_id, quotation_no, request_status, revised_by, revised_at
            FROM quotation_alteration_requests
            ORDER BY created_at ASC, id ASC
        ")->fetchAll();

        /* Later rows overwrite earlier ones, so the latest request wins. */
        foreach ($rows as $request) {
            if (!empty($request["enquiry_id"])) {
                $byEnquiry[(string)$request["enquiry_id"]] = $request;
            }
            $quotationNo = trim((string)($request["quotation_no"] ?? ""));
            if ($quotationNo !== "") {
                $byQuotation[$quotationNo] = $request;
            }
        }
    } catch (Throwable $e) {
        error_log("NEGOTIATION STATUS LOAD ERROR: " . $e->getMessage());
    }

    foreach ($data as &$row) {
        $quotationNo = trim((string)($row["sales_order_no"] ?? ""));
        $request = $byEnquiry[(string)$row["id"]] ?? ($quotationNo !== "" ? ($byQuotation[$quotationNo] ?? null) : null);

        $row["negotiation_status"] = $request ? (string)$request["request_status"] : "";
        $row["negotiation_revised_by"] = $request ? (string)($request["revised_by"] ?? "") : "";
        $row["negotiation_revised_at"] = $request ? (string)($request["revised_at"] ?? "") : "";
    }
    unset($row);
}


/* =========================================================
   LOAD ONE ENQUIRY (used after insert / update)
========================================================= */

function loadEnquiryById($pdo, $id)
{
    $stmt = $pdo->prepare("
        SELECT " . ENQUIRY_COLUMNS . "
        FROM enquiry_report
        WHERE id = :id
        LIMIT 1
    ");
    $stmt->execute([":id" => $id]);
    $record = $stmt->fetch();

    if (!$record) {
        return null;
    }

    $recordData = [$record];
    attachQuotationEnteredBy($pdo, $recordData);
    attachNegotiationStatus($pdo, $recordData);
    $record = $recordData[0];

    $record["attachments"] = parseAttachments($record["attachments"]);

    return $record;
}


/* =========================================================
   METHOD
========================================================= */

$method = $_SERVER["REQUEST_METHOD"];



/* =========================================================
   SHARED QUOTATION TIMER QUEUE

   GET  ?timer=1                        -> current queue
   POST timer_action=add|complete|timeout&enquiry_id=ID

   Only ONE enquiry timer runs at a time (40 minutes).
   New enquiries wait in the queue. When the running enquiry
   gets a quotation number or times out, the next waiting
   enquiry starts automatically.

   Times are stored as server milliseconds, so every user
   sees the same timer.
========================================================= */

define("ENQUIRY_TIMER_DURATION_MS", 40 * 60 * 1000);

function ensureTimerTable($pdo)
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS enquiry_timer_queue (
            enquiry_id INT NOT NULL PRIMARY KEY,
            status VARCHAR(20) NOT NULL DEFAULT 'waiting',
            queued_at BIGINT NOT NULL,
            started_at BIGINT NULL,
            finished_at BIGINT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

function timerNowMs()
{
    return (int)round(microtime(true) * 1000);
}

function enquiryHasQuotation($pdo, $row)
{
    if (trim((string)($row["sales_order_no"] ?? "")) !== "") {
        return true;
    }

    $enquiryNo = trim((string)($row["enquiry_no"] ?? ""));

    if ($enquiryNo === "") {
        return false;
    }

    $details = getQuotationDetailsByEnquiryNo($pdo, $enquiryNo);

    return !empty($details["quotation_no"]);
}

/*
 * Brings the queue up to date:
 *  - completes waiting/active entries that now have a quotation
 *  - times out the active entry after 40 minutes
 *  - starts the next waiting entry when nothing is running
 */
function syncTimerQueue($pdo)
{
    $now = timerNowMs();

    $rows = $pdo->query("
        SELECT q.enquiry_id, q.status, q.started_at,
               e.enquiry_no, e.sales_order_no
        FROM enquiry_timer_queue q
        LEFT JOIN enquiry_report e ON e.id = q.enquiry_id
        WHERE q.status IN ('waiting', 'active')
        ORDER BY q.queued_at ASC, q.enquiry_id ASC
    ")->fetchAll();

    $finish = $pdo->prepare("
        UPDATE enquiry_timer_queue
        SET status = :status, finished_at = :now
        WHERE enquiry_id = :id
    ");

    $hasActive = false;
    $waiting = [];

    foreach ($rows as $row) {
        $id = (int)$row["enquiry_id"];

        /* Enquiry deleted, or quotation already made. */
        if ($row["enquiry_no"] === null || enquiryHasQuotation($pdo, $row)) {
            $finish->execute([":status" => "completed", ":now" => $now, ":id" => $id]);
            continue;
        }

        if ($row["status"] === "active") {
            $startedAt = (int)$row["started_at"];

            if ($startedAt <= 0 || $now - $startedAt >= ENQUIRY_TIMER_DURATION_MS) {
                $finish->execute([":status" => "timeout", ":now" => $now, ":id" => $id]);
                continue;
            }

            if ($hasActive) {
                /* Never allow two running timers. */
                $pdo->prepare("
                    UPDATE enquiry_timer_queue
                    SET status = 'waiting', started_at = NULL
                    WHERE enquiry_id = :id
                ")->execute([":id" => $id]);
                $waiting[] = $id;
                continue;
            }

            $hasActive = true;
            continue;
        }

        $waiting[] = $id;
    }

    if (!$hasActive && !empty($waiting)) {
        $pdo->prepare("
            UPDATE enquiry_timer_queue
            SET status = 'active', started_at = :now
            WHERE enquiry_id = :id
        ")->execute([":now" => $now, ":id" => $waiting[0]]);
    }
}

function getTimerQueue($pdo)
{
    $rows = $pdo->query("
        SELECT enquiry_id, status, queued_at, started_at, finished_at
        FROM enquiry_timer_queue
        ORDER BY queued_at ASC, enquiry_id ASC
    ")->fetchAll();

    return array_map(function ($row) {
        return [
            "id" => (int)$row["enquiry_id"],
            "status" => $row["status"],
            "queuedAt" => (int)$row["queued_at"],
            "startedAt" => $row["started_at"] !== null ? (int)$row["started_at"] : null,
            "finishedAt" => $row["finished_at"] !== null ? (int)$row["finished_at"] : null
        ];
    }, $rows);
}

/*
 * Puts every recent enquiry that has no quotation and no timer
 * into the queue, in the order they were created. This makes the
 * timer start even if the page's "add" call never reached the
 * server (for example enquiries saved before this update).
 * Only enquiries from the last 24 hours are picked up, so old
 * open enquiries do not flood the queue.
 */
function backfillTimerQueue($pdo)
{
    $pdo->exec("
        INSERT IGNORE INTO enquiry_timer_queue
            (enquiry_id, status, queued_at)
        SELECT
            e.id,
            'waiting',
            CAST(UNIX_TIMESTAMP(e.created_at) AS UNSIGNED) * 1000
        FROM enquiry_report e
        LEFT JOIN enquiry_timer_queue q ON q.enquiry_id = e.id
        WHERE q.enquiry_id IS NULL
          AND TRIM(COALESCE(e.sales_order_no, '')) = ''
          AND e.created_at IS NOT NULL
          AND e.created_at >= NOW() - INTERVAL 1 DAY
    ");
}

/* Runs $callback inside a named MySQL lock so two users
   cannot start two timers at the same moment. */
function withTimerLock($pdo, $callback)
{
    ensureTimerTable($pdo);

    $pdo->query("SELECT GET_LOCK('enquiry_timer_queue', 10)");

    try {
        $callback();
        backfillTimerQueue($pdo);
        syncTimerQueue($pdo);
        return getTimerQueue($pdo);
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('enquiry_timer_queue')");
    }
}

if (
    $method === "GET" &&
    isset($_GET["timer"])
) {
    try {
        $queue = withTimerLock($pdo, function () {});

        responseJson(true, "Timer queue loaded.", $queue, [
            "server_time" => timerNowMs()
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        responseJson(false, "Failed to load timer queue.", null, [
            "error" => $e->getMessage()
        ]);
    }
}

if (
    $method === "POST" &&
    isset($_POST["timer_action"])
) {
    try {
        $action = trim((string)$_POST["timer_action"]);
        $enquiryId = (int)($_POST["enquiry_id"] ?? 0);

        if ($enquiryId <= 0) {
            http_response_code(400);
            responseJson(false, "Valid enquiry_id is required.");
        }

        if (!in_array($action, ["add", "complete", "timeout"], true)) {
            http_response_code(400);
            responseJson(false, "Invalid timer action.");
        }

        $queue = withTimerLock($pdo, function () use ($pdo, $action, $enquiryId) {
            $now = timerNowMs();

            if ($action === "add") {
                /* Adding twice keeps the original queue position. */
                $pdo->prepare("
                    INSERT IGNORE INTO enquiry_timer_queue
                        (enquiry_id, status, queued_at)
                    VALUES (:id, 'waiting', :now)
                ")->execute([":id" => $enquiryId, ":now" => $now]);
            }

            if ($action === "complete") {
                $pdo->prepare("
                    UPDATE enquiry_timer_queue
                    SET status = 'completed', finished_at = :now
                    WHERE enquiry_id = :id
                      AND status IN ('waiting', 'active')
                ")->execute([":id" => $enquiryId, ":now" => $now]);
            }

            /* "timeout" needs no direct write: syncTimerQueue()
               times out the active entry only once 40 minutes
               have really passed on the server clock. */
        });

        responseJson(true, "Timer updated.", $queue, [
            "server_time" => timerNowMs()
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        responseJson(false, "Timer update failed.", null, [
            "error" => $e->getMessage()
        ]);
    }
}


/* =========================================================
   FORCE ATTACHMENT DOWNLOAD
========================================================= */

if (
    $method === "GET" &&
    isset($_GET["download"]) &&
    (string)$_GET["download"] === "1"
) {
    try {
        $storedName = basename((string)($_GET["stored_name"] ?? ""));
        $originalName = basename((string)($_GET["filename"] ?? $storedName));

        if ($storedName === "") {
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
   GET
========================================================= */

if ($method === "GET") {

    try {
        $stmt = $pdo->prepare("
            SELECT " . ENQUIRY_COLUMNS . "
            FROM enquiry_report
            ORDER BY id DESC
        ");
        $stmt->execute();
        $data = $stmt->fetchAll();

        attachQuotationEnteredBy($pdo, $data);
        attachNegotiationStatus($pdo, $data);

        foreach ($data as &$row) {
            $row["attachments"] = parseAttachments($row["attachments"]);
        }
        unset($row);

        $nextEnquiryNo = getNextEnquiryNumber($pdo);

        responseJson(true, "Enquiries loaded successfully.", $data, [
            "next_enquiry_no" => $nextEnquiryNo
        ]);

    } catch (Throwable $e) {
        http_response_code(500);
        responseJson(false, "Failed to load enquiries.", null, [
            "error" => $e->getMessage()
        ]);
    }
}


/* =========================================================
   POST
   ADD OR UPDATE
========================================================= */

if ($method === "POST") {

    try {
        $id = isset($_POST["id"]) ? (int)$_POST["id"] : 0;
        $isEdit = $id > 0;

        /* ===============================================
           FORM VALUES
        =============================================== */

        $enquiryDate = trim($_POST["enquiry_date"] ?? "");
        $customerName = trim($_POST["customer_name"] ?? "");
        $address = trim($_POST["address"] ?? "");
        $phoneNumber = trim($_POST["phone_number"] ?? "");
        $enquirySource = trim($_POST["enquiry_source"] ?? "");
        $description = trim($_POST["description"] ?? "");
        $addedBy = trim($_POST["added_by"] ?? "");

        /* ===============================================
           NEW FIELDS
        =============================================== */

        $assignedTo = trim($_POST["assigned_to"] ?? "");
        $broughtBy = trim($_POST["brought_by"] ?? "");
        $salesOrderNo = trim($_POST["sales_order_no"] ?? "");
        $remarks = trim($_POST["remarks"] ?? "");
        $negotiationDetails = trim($_POST["negotiation_details"] ?? "");
        $requestedBy = trim($_POST["requested_by"] ?? "");
        if ($requestedBy === "") {
            $requestedBy = $addedBy;
        }

        /* ===============================================
           TALLY QUOTATION LOOKUP
           If a quotation is entered manually, use Tally's
           enquiry_no as the enquiry number and return the
           corresponding EnteredBy through the normal response.
        =============================================== */

        $quotationDetails = getEnquiryDetailsByQuotationNo($pdo, $salesOrderNo);
        $tallyEnquiryNo = trim((string)($quotationDetails["enquiry_no"] ?? ""));

        /* ===============================================
           VALIDATION
        =============================================== */

        if ($enquiryDate === "") {
            http_response_code(400);
            responseJson(false, "Enquiry date is required.");
        }

        if ($customerName === "") {
            http_response_code(400);
            responseJson(false, "Customer name is required.");
        }

        if ($addedBy === "") {
            http_response_code(400);
            responseJson(false, "Added by user is required.");
        }

        $allowedSources = [
            "WhatsApp",
            "Phone",
            "Email",
            "SMS",
            "Walk In"
        ];

        if ($enquirySource === "" || !in_array($enquirySource, $allowedSources, true)) {
            http_response_code(400);
            responseJson(false, "Valid enquiry source is required.");
        }

        if ($remarks === NEGOTIATION_REMARK && $salesOrderNo === "") {
            http_response_code(400);
            responseJson(false, "Enter the quotation number before choosing Negotiation.");
        }

        /* ===============================================
           UPDATE
        =============================================== */

        if ($isEdit) {

            $stmt = $pdo->prepare("
                SELECT id, enquiry_no, attachments, remarks
                FROM enquiry_report
                WHERE id = :id
                LIMIT 1
            ");
            $stmt->execute([":id" => $id]);
            $existing = $stmt->fetch();

            if (!$existing) {
                http_response_code(404);
                responseJson(false, "Enquiry not found.");
            }

            $enquiryNo = $existing["enquiry_no"];

            /*
             * If the user entered a quotation number and Tally already
             * has an enquiry number against that quotation, keep the
             * Tally enquiry number in enquiry_report.
             */
            if ($tallyEnquiryNo !== "") {
                $enquiryNo = $tallyEnquiryNo;
            }

            $oldAttachments = parseAttachments($existing["attachments"]);
            $keepAttachments = [];

            if (isset($_POST["keep_attachments"])) {
                $keepAttachments = json_decode($_POST["keep_attachments"], true);
                if (!is_array($keepAttachments)) {
                    $keepAttachments = [];
                }
            } else {
                $keepAttachments = $oldAttachments;
            }

            foreach ($oldAttachments as $oldFile) {
                $oldId = $oldFile["id"] ?? "";
                $stillExists = false;

                foreach ($keepAttachments as $keepFile) {
                    if (isset($keepFile["id"]) && $keepFile["id"] === $oldId) {
                        $stillExists = true;
                        break;
                    }
                }

                if (!$stillExists) {
                    deleteAttachmentFile($oldFile);
                }
            }

            $newAttachments = uploadAttachments($enquiryNo);
            $allAttachments = array_merge($keepAttachments, $newAttachments);

            /* =============================================
               UPDATE ENQUIRY
            ============================================= */

            $stmt = $pdo->prepare("
                UPDATE enquiry_report
                SET
                    enquiry_no = :enquiry_no,
                    enquiry_date = :enquiry_date,
                    customer_name = :customer_name,
                    address = :address,
                    phone_number = :phone_number,
                    enquiry_source = :enquiry_source,
                    description = :description,
                    attachments = :attachments,
                    added_by = :added_by,
                    assigned_to = :assigned_to,
                    brought_by = :brought_by,
                    sales_order_no = :sales_order_no,
                    remarks = :remarks,
                    updated_at = NOW()
                WHERE id = :id
            ");

            $stmt->execute([
                ":enquiry_no" => $enquiryNo,
                ":enquiry_date" => $enquiryDate,
                ":customer_name" => $customerName,
                ":address" => $address,
                ":phone_number" => $phoneNumber,
                ":enquiry_source" => $enquirySource,
                ":description" => $description,
                ":attachments" => json_encode($allAttachments, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ":added_by" => $addedBy,
                ":assigned_to" => $assignedTo,
                ":brought_by" => $broughtBy,
                ":sales_order_no" => $salesOrderNo,
                ":remarks" => $remarks,
                ":id" => $id
            ]);

            /* Notify the quotation team only when the remark
               changes to Negotiation, not on every later edit. */
            $negotiationRequested = false;
            $negotiationError = "";
            $previousRemarks = trim((string)($existing["remarks"] ?? ""));

            if ($remarks === NEGOTIATION_REMARK && $previousRemarks !== NEGOTIATION_REMARK) {
                try {
                    $negotiationRequested = createNegotiationRequest(
                        $pdo, $id, $salesOrderNo, $customerName, $requestedBy, $negotiationDetails
                    );
                } catch (Throwable $e) {
                    /* The enquiry is already saved; report the failed alert separately. */
                    error_log("NEGOTIATION REQUEST ERROR: " . $e->getMessage());
                    $negotiationError = "Enquiry saved, but the quotation team could not be notified.";
                }
            }

            $updated = loadEnquiryById($pdo, $id);

            responseJson(true, "Enquiry updated successfully.", $updated, [
                "next_enquiry_no" => getNextEnquiryNumber($pdo),
                "negotiation_requested" => $negotiationRequested,
                "negotiation_error" => $negotiationError
            ]);
        }

        /* ===============================================
           ADD NEW
        =============================================== */

        $pdo->beginTransaction();

        try {
            $enquiryNo = getNextEnquiryNumber($pdo);

            /*
             * When a quotation is entered manually, Tally is the source
             * of truth for the enquiry number linked to that quotation.
             */
            if ($tallyEnquiryNo !== "") {
                $enquiryNo = $tallyEnquiryNo;
            }

            $newAttachments = uploadAttachments($enquiryNo);

            /* =============================================
               INSERT ENQUIRY
            ============================================= */

            $stmt = $pdo->prepare("
                INSERT INTO enquiry_report
                (
                    enquiry_no,
                    enquiry_date,
                    customer_name,
                    address,
                    phone_number,
                    enquiry_source,
                    description,
                    attachments,
                    added_by,
                    assigned_to,
                    brought_by,
                    sales_order_no,
                    remarks,
                    created_at,
                    updated_at
                )
                VALUES
                (
                    :enquiry_no,
                    :enquiry_date,
                    :customer_name,
                    :address,
                    :phone_number,
                    :enquiry_source,
                    :description,
                    :attachments,
                    :added_by,
                    :assigned_to,
                    :brought_by,
                    :sales_order_no,
                    :remarks,
                    NOW(),
                    NOW()
                )
            ");

            $stmt->execute([
                ":enquiry_no" => $enquiryNo,
                ":enquiry_date" => $enquiryDate,
                ":customer_name" => $customerName,
                ":address" => $address,
                ":phone_number" => $phoneNumber,
                ":enquiry_source" => $enquirySource,
                ":description" => $description,
                ":attachments" => json_encode($newAttachments, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ":added_by" => $addedBy,
                ":assigned_to" => $assignedTo,
                ":brought_by" => $broughtBy,
                ":sales_order_no" => $salesOrderNo,
                ":remarks" => $remarks
            ]);

            $newId = $pdo->lastInsertId();

            $pdo->commit();

        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $negotiationRequested = false;
        $negotiationError = "";

        if ($remarks === NEGOTIATION_REMARK) {
            try {
                $negotiationRequested = createNegotiationRequest(
                    $pdo, (int)$newId, $salesOrderNo, $customerName, $requestedBy, $negotiationDetails
                );
            } catch (Throwable $e) {
                /* The enquiry is already saved; report the failed alert separately. */
                error_log("NEGOTIATION REQUEST ERROR: " . $e->getMessage());
                $negotiationError = "Enquiry saved, but the quotation team could not be notified.";
            }
        }

        $newRecord = loadEnquiryById($pdo, $newId);

        responseJson(true, "Enquiry added successfully.", $newRecord, [
            "enquiry_no" => $enquiryNo,
            "next_enquiry_no" => getNextEnquiryNumber($pdo),
            "negotiation_requested" => $negotiationRequested,
            "negotiation_error" => $negotiationError
        ]);

    } catch (Throwable $e) {
        http_response_code(500);
        responseJson(false, "Failed to save enquiry.", null, [
            "error" => $e->getMessage()
        ]);
    }
}


/* =========================================================
   METHOD NOT ALLOWED
========================================================= */

http_response_code(405);
responseJson(false, "Method not allowed.");
