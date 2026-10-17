<?php
/*
 * WhatsApp Cloud API (Meta) helpers, shared by whatsapp_api.php,
 * whatsapp_webhook.php and whatsapp_send_log.php.
 *
 * Settings come from whatsapp_config.php (copy whatsapp_config.example.php).
 * Including this file does not need the settings; they are read only when a
 * Graph API call is made.
 */

const WA_CONFIG_KEYS = [
    "WA_ACCESS_TOKEN",
    "WA_PHONE_NUMBER_ID",
    "WA_BUSINESS_ACCOUNT_ID",
    "WA_APP_SECRET",
    "WA_WEBHOOK_VERIFY_TOKEN",
    "WA_GRAPH_VERSION"
];

function wa_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $file = __DIR__ . "/whatsapp_config.php";
    $fromFile = is_file($file) ? (require $file) : [];
    if (!is_array($fromFile)) {
        $fromFile = [];
    }

    $config = [];
    foreach (WA_CONFIG_KEYS as $key) {
        $value = trim((string)($fromFile[$key] ?? ""));
        if ($value === "") {
            $value = trim((string)getenv($key));
        }
        $config[$key] = $value;
    }
    if ($config["WA_GRAPH_VERSION"] === "") {
        $config["WA_GRAPH_VERSION"] = "v23.0";
    }

    return $config;
}

// Names of the settings needed for sending that are still empty.
function wa_missing_config(): array
{
    $config = wa_config();
    return array_values(array_filter(
        ["WA_ACCESS_TOKEN", "WA_BUSINESS_ACCOUNT_ID"],
        fn($key) => $config[$key] === ""
    ));
}

// WA_BUSINESS_ACCOUNT_ID may list several accounts, separated by commas.
function wa_business_account_ids(): array
{
    return array_values(array_filter(array_map(
        "trim",
        explode(",", wa_config()["WA_BUSINESS_ACCOUNT_ID"])
    )));
}

/*
 * Every business phone number of the configured account(s), read from Meta,
 * so a number added in WhatsApp Manager appears without a code change.
 * Each item: id (phone number id), display_phone_number, verified_name,
 * quality_rating, waba_id, is_default. Cached on disk for 10 minutes,
 * because every send checks the chosen number against this list.
 */
function wa_phone_numbers(bool $refresh = false): array
{
    static $numbers = null;
    if ($numbers !== null && !$refresh) {
        return $numbers;
    }

    $config = wa_config();
    $default = $config["WA_PHONE_NUMBER_ID"];
    $cacheFile = sys_get_temp_dir() . "/everest_wa_numbers_" .
        md5($config["WA_BUSINESS_ACCOUNT_ID"] . "|" . $default) . ".json";

    if (!$refresh && is_file($cacheFile) && filemtime($cacheFile) > time() - 600) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (is_array($cached) && $cached) {
            return $numbers = $cached;
        }
    }

    $numbers = [];
    foreach (wa_business_account_ids() as $wabaId) {
        $result = wa_graph("GET", $wabaId . "/phone_numbers", [
            "fields" => "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,status",
            "limit" => 100
        ]);
        foreach ($result["data"] ?? [] as $number) {
            $number["waba_id"] = $wabaId;
            $number["is_default"] = (string)$number["id"] === $default;
            $numbers[] = $number;
        }
    }

    if ($numbers && !array_filter($numbers, fn($number) => $number["is_default"])) {
        $numbers[0]["is_default"] = true;
    }
    @file_put_contents($cacheFile, json_encode($numbers));
    return $numbers;
}

// The number to send from: the requested one if it belongs to our account(s),
// otherwise the default. Throws when the account has no numbers.
function wa_resolve_phone_number(string $phoneNumberId = ""): array
{
    $numbers = wa_phone_numbers();
    foreach ($numbers as $number) {
        if ($phoneNumberId !== "" && (string)$number["id"] === $phoneNumberId) {
            return $number;
        }
    }
    if ($phoneNumberId !== "") {
        throw new Exception("That WhatsApp number is not part of this business account.");
    }
    foreach ($numbers as $number) {
        if ($number["is_default"]) {
            return $number;
        }
    }
    throw new Exception("No WhatsApp business number found. Add one in WhatsApp Manager.");
}

function wa_db(): mysqli
{
    $conn = new mysqli("localhost", "root", "", "salescollection");
    if ($conn->connect_error) {
        throw new Exception("Database connection failed: " . $conn->connect_error);
    }
    $conn->set_charset("utf8mb4");
    wa_ensure_tables($conn);
    return $conn;
}

/*
 * whatsapp_messages: every message sent through the API and every message
 * customers send to the business number (from the webhook).
 * whatsapp_send_log (created by whatsapp_send_log.php) gets extra columns
 * so API sends show when the message was delivered, when the customer saw
 * it (blue ticks) and whether / when / what the customer replied.
 */
function wa_ensure_tables(mysqli $conn): void
{
    $conn->query("
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            wamid VARCHAR(191) DEFAULT NULL,
            direction VARCHAR(3) NOT NULL DEFAULT 'out',
            mobile VARCHAR(30) NOT NULL,
            contact_name VARCHAR(255) DEFAULT NULL,
            message_type VARCHAR(30) DEFAULT NULL,
            template_name VARCHAR(255) DEFAULT NULL,
            body TEXT,
            status VARCHAR(20) DEFAULT NULL,
            error TEXT,
            sent_at DATETIME DEFAULT NULL,
            delivered_at DATETIME DEFAULT NULL,
            read_at DATETIME DEFAULT NULL,
            reply_to_wamid VARCHAR(191) DEFAULT NULL,
            phone_number_id VARCHAR(50) DEFAULT NULL,
            business_number VARCHAR(30) DEFAULT NULL,
            billable TINYINT(1) DEFAULT NULL,
            pricing_category VARCHAR(40) DEFAULT NULL,
            pricing_type VARCHAR(40) DEFAULT NULL,
            quotation_no VARCHAR(100) DEFAULT NULL,
            sent_by VARCHAR(255) DEFAULT NULL,
            raw_json MEDIUMTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_wamid (wamid),
            INDEX idx_mobile (mobile),
            INDEX idx_created (created_at)
        )
    ");

    $table = $conn->query("SHOW TABLES LIKE 'whatsapp_send_log'");
    if (!$table || $table->num_rows === 0) {
        return;
    }

    $existing = [];
    $columns = $conn->query("SHOW COLUMNS FROM whatsapp_send_log");
    while ($columns && ($column = $columns->fetch_assoc())) {
        $existing[$column["Field"]] = true;
    }

    $wanted = [
        "wamid" => "VARCHAR(191) DEFAULT NULL",
        "api_status" => "VARCHAR(20) DEFAULT NULL",
        "api_error" => "TEXT",
        "delivered_at" => "DATETIME DEFAULT NULL",
        "read_at" => "DATETIME DEFAULT NULL",
        "failed_at" => "DATETIME DEFAULT NULL",
        "replied_at" => "DATETIME DEFAULT NULL",
        "reply_text" => "TEXT",
        "reply_count" => "INT NOT NULL DEFAULT 0",
        "phone_number_id" => "VARCHAR(50) DEFAULT NULL",
        "business_number" => "VARCHAR(30) DEFAULT NULL",
        "template_category" => "VARCHAR(30) DEFAULT NULL",
        // From Meta's status webhook: was it charged, and as what.
        "billable" => "TINYINT(1) DEFAULT NULL",
        "pricing_category" => "VARCHAR(40) DEFAULT NULL",
        "pricing_type" => "VARCHAR(40) DEFAULT NULL"
    ];
    foreach ($wanted as $name => $definition) {
        if (!isset($existing[$name])) {
            $conn->query("ALTER TABLE whatsapp_send_log ADD COLUMN $name $definition");
        }
    }
    if (!isset($existing["wamid"])) {
        $conn->query("ALTER TABLE whatsapp_send_log ADD INDEX idx_wamid (wamid)");
    }
}

/*
 * One Graph API call. $body is sent as JSON, or as multipart form data
 * when $multipart is true (media upload). Returns the decoded response;
 * throws with Meta's own error message when the call fails.
 */
function wa_graph(string $method, string $path, ?array $body = null, bool $multipart = false): array
{
    $missing = wa_missing_config();
    if ($missing) {
        throw new Exception(
            "WhatsApp API is not set up yet. Fill in " . implode(", ", $missing) .
            " in serverphp/whatsapp_config.php."
        );
    }

    $config = wa_config();
    $url = "https://graph.facebook.com/" . $config["WA_GRAPH_VERSION"] . "/" . ltrim($path, "/");
    $headers = ["Authorization: Bearer " . $config["WA_ACCESS_TOKEN"]];

    $ch = curl_init();
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CUSTOMREQUEST => $method
    ];

    if ($method === "GET" && $body) {
        $url .= (str_contains($url, "?") ? "&" : "?") . http_build_query($body);
    } elseif ($body !== null) {
        if ($multipart) {
            $options[CURLOPT_POSTFIELDS] = $body;
        } else {
            $headers[] = "Content-Type: application/json";
            $options[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
    }

    $options[CURLOPT_URL] = $url;
    $options[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($ch, $options);

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new Exception("Could not reach WhatsApp (graph.facebook.com): " . $error);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($response, true);
    if (!is_array($data)) {
        throw new Exception("WhatsApp returned an unreadable response (HTTP $status).");
    }

    if ($status >= 400 || isset($data["error"])) {
        throw new Exception(wa_error_text($data["error"] ?? [], $status));
    }

    return $data;
}

function wa_error_text(array $error, int $status = 0): string
{
    $message = trim((string)($error["error_user_msg"] ?? ($error["message"] ?? "")));
    $details = trim((string)($error["error_data"]["details"] ?? ""));
    $code = $error["code"] ?? $status;

    $text = "WhatsApp error " . $code . ": " . ($message !== "" ? $message : "request failed");
    if ($details !== "" && !str_contains($text, $details)) {
        $text .= " (" . $details . ")";
    }
    return $text;
}

// Indian 10-digit numbers get the 91 country code, as in the app.
function wa_normalize_mobile(string $mobile): string
{
    $digits = preg_replace('/\D/', '', $mobile);
    if (strlen($digits) === 10) {
        return "91" . $digits;
    }
    if (strlen($digits) === 11 && $digits[0] === "0") {
        return "91" . substr($digits, 1);
    }
    return $digits;
}

// Uploads a file to WhatsApp and returns its media id (valid for 30 days).
function wa_upload_media(string $phoneNumberId, string $path, string $mimeType, string $fileName): string
{
    $result = wa_graph("POST", $phoneNumberId . "/media", [
        "messaging_product" => "whatsapp",
        "type" => $mimeType,
        "file" => new CURLFile($path, $mimeType, $fileName)
    ], true);

    if (empty($result["id"])) {
        throw new Exception("WhatsApp did not return a media id for the upload.");
    }
    return (string)$result["id"];
}

// Sends one message from the business number $phoneNumberId (the "to" and
// "messaging_product" fields are added here). Returns the message id (wamid).
function wa_send_message(string $phoneNumberId, string $to, array $message): string
{
    $result = wa_graph("POST", $phoneNumberId . "/messages", array_merge([
        "messaging_product" => "whatsapp",
        "recipient_type" => "individual",
        "to" => $to
    ], $message));

    $wamid = (string)($result["messages"][0]["id"] ?? "");
    if ($wamid === "") {
        throw new Exception("WhatsApp accepted the request but returned no message id.");
    }
    return $wamid;
}

/*
 * Approved message template.
 * $bodyParams: list of strings for {{1}}, {{2}}... or, for templates with
 *              named variables, an associative array name => value.
 * $document:   optional ["id" => media id] or ["link" => url], plus "filename",
 *              for templates whose header is a DOCUMENT.
 */
function wa_send_template(
    string $phoneNumberId,
    string $to,
    string $templateName,
    string $language,
    array $bodyParams = [],
    ?array $document = null
): string {
    $components = [];

    if ($document) {
        $components[] = [
            "type" => "header",
            "parameters" => [[
                "type" => "document",
                "document" => array_filter([
                    "id" => $document["id"] ?? null,
                    "link" => $document["link"] ?? null,
                    "filename" => $document["filename"] ?? null
                ])
            ]]
        ];
    }

    if ($bodyParams) {
        $isNamed = array_keys($bodyParams) !== range(0, count($bodyParams) - 1);
        $parameters = [];
        foreach ($bodyParams as $name => $value) {
            // WhatsApp rejects empty values, new lines and long runs of spaces.
            $text = preg_replace('/\s+/', ' ', trim((string)$value));
            $parameter = ["type" => "text", "text" => $text !== "" ? $text : "-"];
            if ($isNamed) {
                $parameter["parameter_name"] = (string)$name;
            }
            $parameters[] = $parameter;
        }
        $components[] = ["type" => "body", "parameters" => $parameters];
    }

    $template = [
        "name" => $templateName,
        "language" => ["code" => $language !== "" ? $language : "en"]
    ];
    if ($components) {
        $template["components"] = $components;
    }

    return wa_send_message($phoneNumberId, $to, ["type" => "template", "template" => $template]);
}

// Free text. WhatsApp only delivers this within 24 hours of the customer's
// last message to the business number; otherwise use a template.
function wa_send_text(string $phoneNumberId, string $to, string $text): string
{
    return wa_send_message($phoneNumberId, $to, [
        "type" => "text",
        "text" => ["preview_url" => true, "body" => $text]
    ]);
}
