<?php
/*
 * WhatsApp Cloud API webhook. Meta calls this URL; it is NOT called by the app.
 *
 * Callback URL to enter in the App dashboard (WhatsApp > Configuration):
 *     https://<your domain>/serverphp/whatsapp_webhook.php
 * Verify token: the WA_WEBHOOK_VERIFY_TOKEN value in whatsapp_config.php.
 * Webhook field to subscribe: "messages".
 *
 * GET:  Meta's one-time verification (echoes hub.challenge).
 * Works for every business number of the account (all share this webhook).
 *
 * POST: - message statuses: sent / delivered / read / failed, with the time
 *         of each, saved on the message and on its whatsapp_send_log entry;
 *       - messages customers send to the business number, saved in
 *         whatsapp_messages and marked as the reply on the latest message
 *         sent to that number.
 *
 * No api_auth.php here: Meta cannot send our API key. Instead every POST
 * must carry Meta's X-Hub-Signature-256, signed with the app secret.
 *
 * Statuses also carry Meta's billing info (pricing.billable / category /
 * type), saved as billable, pricing_category and pricing_type.
 *
 * Note: "read" arrives only if the customer has read receipts (blue ticks)
 * turned on in WhatsApp.
 */

require_once __DIR__ . '/whatsapp_cloud.php';

error_reporting(E_ALL);
ini_set('display_errors', 0);

$config = wa_config();

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $mode = $_GET["hub_mode"] ?? "";
    $token = $_GET["hub_verify_token"] ?? "";
    $challenge = $_GET["hub_challenge"] ?? "";

    if (
        $mode === "subscribe" &&
        $config["WA_WEBHOOK_VERIFY_TOKEN"] !== "" &&
        hash_equals($config["WA_WEBHOOK_VERIFY_TOKEN"], (string)$token)
    ) {
        header("Content-Type: text/plain");
        echo $challenge;
        exit;
    }

    http_response_code(403);
    echo "Verification failed";
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    exit;
}

$raw = file_get_contents("php://input");

if ($config["WA_APP_SECRET"] === "") {
    error_log("whatsapp_webhook: WA_APP_SECRET is not set; ignoring webhook.");
    http_response_code(500);
    exit;
}

$signature = $_SERVER["HTTP_X_HUB_SIGNATURE_256"] ?? "";
$expected = "sha256=" . hash_hmac("sha256", $raw, $config["WA_APP_SECRET"]);
if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    exit;
}

// Short text for an incoming message of any type.
function wa_incoming_text(array $message): string
{
    $type = $message["type"] ?? "";
    switch ($type) {
        case "text":
            return (string)($message["text"]["body"] ?? "");
        case "button":
            return (string)($message["button"]["text"] ?? "");
        case "interactive":
            $interactive = $message["interactive"] ?? [];
            return (string)(
                $interactive["button_reply"]["title"] ??
                $interactive["list_reply"]["title"] ?? "[interactive]"
            );
        case "reaction":
            return "Reacted " . ($message["reaction"]["emoji"] ?? "");
        case "image":
        case "video":
        case "document":
        case "audio":
        case "sticker":
            $caption = trim((string)($message[$type]["caption"] ?? ($message[$type]["filename"] ?? "")));
            return "[" . $type . "]" . ($caption !== "" ? " " . $caption : "");
        case "location":
            return "[location] " . ($message["location"]["name"] ?? "") . " " .
                ($message["location"]["latitude"] ?? "") . "," . ($message["location"]["longitude"] ?? "");
        default:
            return "[" . ($type ?: "message") . "]";
    }
}

try {
    $conn = wa_db();

    foreach ($payload["entry"] ?? [] as $entry) {
        foreach ($entry["changes"] ?? [] as $change) {
            if (($change["field"] ?? "") !== "messages") {
                continue;
            }
            $value = $change["value"] ?? [];
            // The business number this webhook is about (one of our numbers).
            $phoneNumberId = (string)($value["metadata"]["phone_number_id"] ?? "");
            $businessNumber = (string)($value["metadata"]["display_phone_number"] ?? "");

            // ---------- Delivery / read status of messages we sent ----------
            foreach ($value["statuses"] ?? [] as $status) {
                $wamid = (string)($status["id"] ?? "");
                $state = strtolower((string)($status["status"] ?? ""));
                $time = (int)($status["timestamp"] ?? time());
                if ($wamid === "" || $state === "") {
                    continue;
                }

                $error = "";
                if (!empty($status["errors"][0])) {
                    $error = wa_error_text($status["errors"][0]);
                }

                // Billing: kept from the latest status that carries it.
                $pricing = $status["pricing"] ?? null;
                $pricingSet = "";
                $pricingTypes = "";
                $pricingParams = [];
                if (is_array($pricing)) {
                    $pricingSet = ", billable = ?, pricing_category = ?, pricing_type = ?";
                    $pricingTypes = "iss";
                    $pricingParams = [
                        !empty($pricing["billable"]) ? 1 : 0,
                        mb_substr((string)($pricing["category"] ?? ""), 0, 40),
                        mb_substr((string)($pricing["type"] ?? ($pricing["pricing_model"] ?? "")), 0, 40)
                    ];
                }

                // Statuses can arrive out of order; never go back from "read"
                // to "delivered". FIELD() gives the rank of each state.
                $rank = "FIELD(%s, 'sent', 'delivered', 'read')";

                $column = [
                    "sent" => null,
                    "delivered" => "delivered_at",
                    "read" => "read_at",
                    "failed" => "failed_at"
                ][$state] ?? null;

                // whatsapp_messages
                $timeSet = "";
                if ($state === "sent") {
                    $timeSet = ", sent_at = COALESCE(sent_at, FROM_UNIXTIME(?))";
                } elseif ($state === "delivered" || $state === "read") {
                    $timeSet = ", $column = COALESCE($column, FROM_UNIXTIME(?))";
                }
                // A read message was also delivered.
                if ($state === "read") {
                    $timeSet .= ", delivered_at = COALESCE(delivered_at, FROM_UNIXTIME(?))";
                }

                $sql = "UPDATE whatsapp_messages SET
                        status = IF(status = 'failed' OR " . sprintf($rank, "?") . " >= " . sprintf($rank, "status") . ", ?, status),
                        error = IF(? = '', error, ?)
                        $timeSet
                        $pricingSet
                    WHERE wamid = ?";
                $stmt = $conn->prepare($sql);
                $types = "ssss";
                $params = [$state, $state, $error, $error];
                if ($timeSet !== "") {
                    $types .= "i";
                    $params[] = $time;
                }
                if ($state === "read") {
                    $types .= "i";
                    $params[] = $time;
                }
                $types .= $pricingTypes . "s";
                $params = array_merge($params, $pricingParams, [$wamid]);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $stmt->close();

                // whatsapp_send_log (what the Quotation Wise page shows)
                $timeSet = $column ? ", $column = COALESCE($column, FROM_UNIXTIME(?))" : "";
                if ($state === "read") {
                    $timeSet .= ", delivered_at = COALESCE(delivered_at, FROM_UNIXTIME(?))";
                }
                $sql = "UPDATE whatsapp_send_log SET
                        api_status = IF(api_status IS NULL OR api_status = 'failed' OR " .
                            sprintf($rank, "?") . " >= " . sprintf($rank, "api_status") . ", ?, api_status),
                        api_error = IF(? = '', api_error, ?)
                        $timeSet
                        $pricingSet
                    WHERE wamid = ?";
                $stmt = $conn->prepare($sql);
                $types = "ssss";
                $params = [$state, $state, $error, $error];
                if ($column) {
                    $types .= "i";
                    $params[] = $time;
                }
                if ($state === "read") {
                    $types .= "i";
                    $params[] = $time;
                }
                $types .= $pricingTypes . "s";
                $params = array_merge($params, $pricingParams, [$wamid]);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $stmt->close();
            }

            // ---------- Messages customers sent to us ----------
            $names = [];
            foreach ($value["contacts"] ?? [] as $contact) {
                $names[(string)($contact["wa_id"] ?? "")] = (string)($contact["profile"]["name"] ?? "");
            }

            foreach ($value["messages"] ?? [] as $message) {
                $wamid = (string)($message["id"] ?? "");
                $mobile = wa_normalize_mobile((string)($message["from"] ?? ""));
                if ($wamid === "" || $mobile === "") {
                    continue;
                }

                $time = (int)($message["timestamp"] ?? time());
                $type = (string)($message["type"] ?? "");
                $body = wa_incoming_text($message);
                $contactName = $names[(string)($message["from"] ?? "")] ?? "";
                $replyTo = (string)($message["context"]["id"] ?? "");
                $rawJson = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

                // INSERT IGNORE: Meta may deliver the same webhook more than once.
                $stmt = $conn->prepare("
                    INSERT IGNORE INTO whatsapp_messages
                        (wamid, direction, mobile, contact_name, message_type, body,
                         status, reply_to_wamid, raw_json, phone_number_id, business_number, created_at)
                    VALUES (?, 'in', ?, ?, ?, ?, 'received', ?, ?, ?, ?, FROM_UNIXTIME(?))
                ");
                $stmt->bind_param(
                    "sssssssssi",
                    $wamid, $mobile, $contactName, $type, $body, $replyTo, $rawJson,
                    $phoneNumberId, $businessNumber, $time
                );
                $stmt->execute();
                $isNew = $stmt->affected_rows > 0;
                $stmt->close();

                if (!$isNew) {
                    continue;
                }

                // Mark the reply on the message it answers (when the customer
                // used "Reply"), otherwise on the latest API message sent to
                // this customer from the same business number in the last 30 days.
                $logId = null;
                if ($replyTo !== "") {
                    $stmt = $conn->prepare("SELECT id FROM whatsapp_send_log WHERE wamid = ? LIMIT 1");
                    $stmt->bind_param("s", $replyTo);
                    $stmt->execute();
                    $logId = $stmt->get_result()->fetch_assoc()["id"] ?? null;
                    $stmt->close();
                }
                if (!$logId) {
                    $stmt = $conn->prepare("
                        SELECT id FROM whatsapp_send_log
                        WHERE mobile = ? AND wamid IS NOT NULL
                          AND (phone_number_id = ? OR ? = '')
                          AND created_at <= FROM_UNIXTIME(?)
                          AND created_at >= FROM_UNIXTIME(?) - INTERVAL 30 DAY
                        ORDER BY created_at DESC, id DESC
                        LIMIT 1
                    ");
                    $stmt->bind_param("sssii", $mobile, $phoneNumberId, $phoneNumberId, $time, $time);
                    $stmt->execute();
                    $logId = $stmt->get_result()->fetch_assoc()["id"] ?? null;
                    $stmt->close();
                }

                if ($logId) {
                    // A reply means the message was seen, even with blue ticks off.
                    $stmt = $conn->prepare("
                        UPDATE whatsapp_send_log SET
                            replied_at = COALESCE(replied_at, FROM_UNIXTIME(?)),
                            reply_text = IF(reply_text IS NULL OR reply_text = '', ?, CONCAT(reply_text, '\n', ?)),
                            reply_count = reply_count + 1,
                            delivered_at = COALESCE(delivered_at, FROM_UNIXTIME(?)),
                            api_status = IF(api_status = 'failed', api_status, 'replied')
                        WHERE id = ?
                    ");
                    $stmt->bind_param("issii", $time, $body, $body, $time, $logId);
                    $stmt->execute();
                    $stmt->close();
                }
            }
        }
    }

    $conn->close();
} catch (Throwable $e) {
    // Log and still answer 200, so Meta does not keep retrying a payload
    // that will fail again; the error is in the PHP error log.
    error_log("whatsapp_webhook: " . $e->getMessage());
}

http_response_code(200);
echo "OK";
