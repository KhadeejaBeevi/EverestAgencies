<?php

require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/firebase_auth.php';
require_once __DIR__ . '/whatsapp_cloud.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

/*
 * Sending through the official WhatsApp Cloud API (Meta).
 *
 * JSON body { action, ... }, or multipart form data with a "data" field
 * holding that JSON plus a "pdf" file (send_template with the quotation PDF).
 *
 * action "status":        is the API set up; the business numbers to send
 *                         from (all numbers of the account, e.g. 5).
 * action "templates":     approved message templates (Utility, Marketing,
 *                         Authentication) of the business account.
 * Sending actions take "phone_number_id": the business number to send from
 * (default number when empty).
 *
 * action "send_template": sends an approved template (optionally with the
 *                         quotation PDF as its document header) and records
 *                         it in whatsapp_send_log with send_type "api".
 * action "send_text":     free-text reply (only within 24 h of the customer's
 *                         last message).
 * action "conversation":  messages to and from one number (replies included).
 *
 * Delivered / seen / replied times are filled in by whatsapp_webhook.php.
 */

function respond(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function str_in(array $input, string $key, int $max = 255): string
{
    return mb_substr(trim((string)($input[$key] ?? "")), 0, $max);
}

$conn = null;

try {
    if (isset($_POST["data"])) {
        $input = json_decode((string)$_POST["data"], true);
    } else {
        $input = json_decode(file_get_contents("php://input"), true);
    }
    if (!is_array($input)) {
        $input = [];
    }

    $action = strtolower(str_in($input, "action", 30) ?: "status");
    $user = firebase_require_user();

    if ($action === "status") {
        $missing = wa_missing_config();
        if ($missing) {
            respond(200, ["success" => true, "configured" => false, "missing" => $missing]);
        }

        $config = wa_config();
        respond(200, [
            "success" => true,
            "configured" => true,
            "webhook_ready" => $config["WA_APP_SECRET"] !== "" && $config["WA_WEBHOOK_VERIFY_TOKEN"] !== "",
            "phone_numbers" => wa_phone_numbers(!empty($input["refresh"]))
        ]);
    }

    if ($action === "templates") {
        // Templates belong to the business account, so every number of the
        // account can send all of them. With several accounts, only the
        // chosen number's account.
        $wabaIds = wa_business_account_ids();
        if (str_in($input, "phone_number_id", 50) !== "") {
            $wabaIds = [wa_resolve_phone_number(str_in($input, "phone_number_id", 50))["waba_id"]];
        }

        $templates = [];
        foreach ($wabaIds as $wabaId) {
            $result = wa_graph("GET", $wabaId . "/message_templates", [
                "fields" => "name,language,status,category,parameter_format,components",
                "limit" => 200
            ]);
            foreach ($result["data"] ?? [] as $template) {
                if (($template["status"] ?? "") === "APPROVED") {
                    $template["waba_id"] = $wabaId;
                    $templates[] = $template;
                }
            }
        }

        respond(200, ["success" => true, "data" => $templates]);
    }

    if ($action === "send_template" || $action === "send_text") {
        $mobile = wa_normalize_mobile(str_in($input, "mobile", 30));
        if (strlen($mobile) < 8) {
            respond(400, ["success" => false, "message" => "A valid mobile number is required."]);
        }

        $sender = wa_resolve_phone_number(str_in($input, "phone_number_id", 50));
        $phoneNumberId = (string)$sender["id"];
        $businessNumber = (string)($sender["display_phone_number"] ?? "");

        $templateName = str_in($input, "template_name", 255);
        $templateCategory = strtoupper(str_in($input, "template_category", 30));
        $language = str_in($input, "language", 20);
        $message = (string)($input["message"] ?? "");
        $pdfAttached = 0;

        if ($action === "send_template") {
            if ($templateName === "") {
                respond(400, ["success" => false, "message" => "Template name is required."]);
            }

            $params = $input["body_params"] ?? [];
            if (!is_array($params)) {
                $params = [];
            }

            $document = null;
            if (isset($_FILES["pdf"]) && $_FILES["pdf"]["error"] === UPLOAD_ERR_OK) {
                $fileName = preg_replace('/[^A-Za-z0-9_. -]+/', '_', (string)($_FILES["pdf"]["name"] ?: "Quotation.pdf"));
                $document = [
                    "id" => wa_upload_media($phoneNumberId, $_FILES["pdf"]["tmp_name"], "application/pdf", $fileName),
                    "filename" => $fileName
                ];
                $pdfAttached = 1;
            } elseif (str_in($input, "document_link", 1000) !== "") {
                $document = [
                    "link" => str_in($input, "document_link", 1000),
                    "filename" => str_in($input, "document_filename") ?: "Quotation.pdf"
                ];
                $pdfAttached = 1;
            }

            $wamid = wa_send_template($phoneNumberId, $mobile, $templateName, $language, $params, $document);
        } else {
            if (trim($message) === "") {
                respond(400, ["success" => false, "message" => "Message is required."]);
            }
            $wamid = wa_send_text($phoneNumberId, $mobile, $message);
        }

        // The message has gone out: a logging problem must not look like a
        // failed send (the user would send it again), so it is only reported.
        $logId = null;
        $logWarning = "";
        try {
            $conn = wa_db();
            $quotationNo = str_in($input, "quotation_no", 100);
            $messageType = $action === "send_template" ? "template" : "text";

            $stmt = $conn->prepare("
                INSERT INTO whatsapp_messages
                    (wamid, direction, mobile, contact_name, message_type, template_name,
                     body, status, sent_at, quotation_no, sent_by, phone_number_id, business_number)
                VALUES (?, 'out', ?, ?, ?, ?, ?, 'sent', NOW(), ?, ?, ?, ?)
            ");
            $customerName = str_in($input, "customer_name");
            $stmt->bind_param(
                "ssssssssss",
                $wamid, $mobile, $customerName, $messageType, $templateName,
                $message, $quotationNo, $user["name"], $phoneNumberId, $businessNumber
            );
            $stmt->execute();
            $stmt->close();

            if ($action === "send_template") {
                $stmt = $conn->prepare("
                    INSERT INTO whatsapp_send_log
                        (
                            quotation_no, order_no, party_name, customer_name, mobile,
                            quotation_amount, send_type, template_id, template_name, message,
                            pdf_attached, sent_by, sent_by_uid, sent_by_email, wamid, api_status,
                            phone_number_id, business_number, template_category
                        )
                    VALUES (?, ?, ?, ?, ?, ?, 'api', ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?)
                ");
                if (!$stmt) {
                    throw new Exception($conn->error);
                }

                $orderNo = str_in($input, "order_no", 100);
                $partyName = str_in($input, "party_name");
                $amount = is_numeric($input["quotation_amount"] ?? null) ? (float)$input["quotation_amount"] : null;
                $templateId = $templateName . ":" . $language;

                $stmt->bind_param(
                    "sssssdsssisssssss",
                    $quotationNo, $orderNo, $partyName, $customerName, $mobile,
                    $amount, $templateId, $templateName, $message,
                    $pdfAttached, $user["name"], $user["uid"], $user["email"], $wamid,
                    $phoneNumberId, $businessNumber, $templateCategory
                );
                $stmt->execute();
                $logId = $stmt->insert_id;
                $stmt->close();
            }
        } catch (Throwable $e) {
            $logWarning = "Message sent, but the log could not be saved: " . $e->getMessage();
            error_log("whatsapp_api: " . $logWarning);
        }

        respond(200, [
            "success" => true,
            "wamid" => $wamid,
            "id" => $logId,
            "mobile" => $mobile,
            "business_number" => $businessNumber,
            "sent_by" => $user["name"],
            "warning" => $logWarning
        ]);
    }

    if ($action === "conversation") {
        $mobile = wa_normalize_mobile(str_in($input, "mobile", 30));
        if ($mobile === "") {
            respond(400, ["success" => false, "message" => "Mobile is required."]);
        }

        $conn = wa_db();
        $stmt = $conn->prepare("
            SELECT id, wamid, direction, mobile, contact_name, message_type, template_name,
                   body, status, error, sent_at, delivered_at, read_at, quotation_no,
                   sent_by, phone_number_id, business_number, created_at
            FROM whatsapp_messages
            WHERE mobile = ?
            ORDER BY created_at ASC, id ASC
            LIMIT 500
        ");
        $stmt->bind_param("s", $mobile);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        // Free text is allowed only within 24 h of the customer's last message
        // to that same business number: phone_number_id => true/false.
        $canReply = [];
        foreach ($rows as $row) {
            if ($row["direction"] === "in" && $row["phone_number_id"]) {
                $canReply[$row["phone_number_id"]] = strtotime($row["created_at"]) > time() - 24 * 3600;
            }
        }

        respond(200, ["success" => true, "data" => $rows, "can_reply" => (object)$canReply]);
    }

    respond(400, ["success" => false, "message" => "Invalid action."]);

} catch (Throwable $e) {
    respond(500, ["success" => false, "message" => $e->getMessage()]);
} finally {
    if ($conn) {
        $conn->close();
    }
}
