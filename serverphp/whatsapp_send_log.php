<?php

require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/firebase_auth.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

/*
 * WhatsApp send log for the Quotation Wise page.
 *
 * action "log":  records one WhatsApp chat opened from the page
 *                (which number, which quotation, which template/message,
 *                 who sent it and when).
 * action "list": returns the log, newest first, with optional filters.
 *
 * NOTE: WhatsApp does not report back whether the user pressed Send in the
 * app. A record means the chat was opened with the message pre-filled.
 */

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed: " . $conn->connect_error
    ]);
    exit;
}

$conn->set_charset("utf8mb4");

$conn->query("
    CREATE TABLE IF NOT EXISTS whatsapp_send_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quotation_no VARCHAR(100) DEFAULT NULL,
        order_no VARCHAR(100) DEFAULT NULL,
        party_name VARCHAR(255) DEFAULT NULL,
        customer_name VARCHAR(255) DEFAULT NULL,
        mobile VARCHAR(30) NOT NULL,
        quotation_amount DECIMAL(15, 2) DEFAULT NULL,
        send_type VARCHAR(20) NOT NULL DEFAULT 'bulk',
        template_id VARCHAR(100) DEFAULT NULL,
        template_name VARCHAR(255) DEFAULT NULL,
        message TEXT,
        pdf_attached TINYINT(1) NOT NULL DEFAULT 0,
        sent_by VARCHAR(255) NOT NULL,
        sent_by_uid VARCHAR(128) DEFAULT NULL,
        sent_by_email VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_quotation (quotation_no),
        INDEX idx_mobile (mobile),
        INDEX idx_sent_by (sent_by),
        INDEX idx_created (created_at)
    )
");

function str_input($input, $key, $max = 255): string
{
    $value = trim((string)($input[$key] ?? ""));
    return mb_substr($value, 0, $max);
}

try {
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        $input = [];
    }

    $action = strtolower(trim((string)($input["action"] ?? "list")));

    if ($action === "log") {

        // Who sent it comes from the verified login, never from the request.
        $user = firebase_require_user();

        $mobile = str_input($input, "mobile", 30);
        $sentBy = $user["name"];

        if ($mobile === "") {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Mobile is required."]);
            exit;
        }

        $quotationNo = str_input($input, "quotation_no", 100);
        $orderNo = str_input($input, "order_no", 100);
        $partyName = str_input($input, "party_name");
        $customerName = str_input($input, "customer_name");
        $amount = is_numeric($input["quotation_amount"] ?? null)
            ? (float)$input["quotation_amount"]
            : null;
        $sendType = str_input($input, "send_type", 20) ?: "bulk";
        $templateId = str_input($input, "template_id", 100);
        $templateName = str_input($input, "template_name");
        $message = (string)($input["message"] ?? "");
        $pdfAttached = !empty($input["pdf_attached"]) ? 1 : 0;
        $sentByUid = $user["uid"];
        $sentByEmail = $user["email"];

        $stmt = $conn->prepare("
            INSERT INTO whatsapp_send_log
                (
                    quotation_no, order_no, party_name, customer_name, mobile,
                    quotation_amount, send_type, template_id, template_name, message,
                    pdf_attached, sent_by, sent_by_uid, sent_by_email
                )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }

        $stmt->bind_param(
            "sssssdssssisss",
            $quotationNo,
            $orderNo,
            $partyName,
            $customerName,
            $mobile,
            $amount,
            $sendType,
            $templateId,
            $templateName,
            $message,
            $pdfAttached,
            $sentBy,
            $sentByUid,
            $sentByEmail
        );

        if (!$stmt->execute()) {
            throw new Exception("Save failed: " . $stmt->error);
        }

        $id = $stmt->insert_id;
        $stmt->close();

        echo json_encode([
            "success" => true,
            "id" => $id,
            "sent_by" => $sentBy
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === "list") {

        $where = [];
        $types = "";
        $params = [];

        $fromDate = str_input($input, "from_date", 10);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromDate)) {
            $where[] = "created_at >= ?";
            $types .= "s";
            $params[] = $fromDate . " 00:00:00";
        }

        $toDate = str_input($input, "to_date", 10);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $toDate)) {
            $where[] = "created_at <= ?";
            $types .= "s";
            $params[] = $toDate . " 23:59:59";
        }

        $sentBy = str_input($input, "sent_by");
        if ($sentBy !== "") {
            $where[] = "sent_by = ?";
            $types .= "s";
            $params[] = $sentBy;
        }

        $quotationNo = str_input($input, "quotation_no", 100);
        if ($quotationNo !== "") {
            $where[] = "quotation_no = ?";
            $types .= "s";
            $params[] = $quotationNo;
        }

        $limit = (int)($input["limit"] ?? 2000);
        if ($limit < 1 || $limit > 10000) {
            $limit = 2000;
        }

        $sql = "
            SELECT
                id, quotation_no, order_no, party_name, customer_name, mobile,
                quotation_amount, send_type, template_id, template_name, message,
                pdf_attached, sent_by, sent_by_uid, sent_by_email, created_at
            FROM whatsapp_send_log
            " . ($where ? "WHERE " . implode(" AND ", $where) : "") . "
            ORDER BY created_at DESC, id DESC
            LIMIT " . $limit;

        $stmt = $conn->prepare($sql);

        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }

        if ($params) {
            $stmt->bind_param($types, ...$params);
        }

        if (!$stmt->execute()) {
            throw new Exception("WhatsApp log query failed: " . $stmt->error);
        }

        $result = $stmt->get_result();
        $data = [];

        while ($row = $result->fetch_assoc()) {
            $row["id"] = (int)$row["id"];
            $row["pdf_attached"] = (int)$row["pdf_attached"];
            $row["quotation_amount"] = $row["quotation_amount"] !== null
                ? (float)$row["quotation_amount"]
                : null;
            $data[] = $row;
        }

        $stmt->close();

        echo json_encode([
            "success" => true,
            "count" => count($data),
            "data" => $data
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        exit;
    }

    http_response_code(400);

    echo json_encode([
        "success" => false,
        "message" => "Invalid action."
    ]);

} catch (Throwable $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} finally {
    $conn->close();
}
?>
