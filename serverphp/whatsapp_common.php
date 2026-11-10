<?php

/*
 * Shared helpers for Everest Connect (whatsapp_inbox.php, whatsapp_ai.php):
 * the WhatsApp service call, the wa_* tables, and quotation reply status.
 */

function wa_service(string $method, string $path, string $account, ?array $body = null): array
{
    $base = rtrim(getenv("WA_SERVICE_URL") ?: "http://127.0.0.1:3005", "/");
    $path .= (strpos($path, "?") === false ? "?" : "&") . "account=" . rawurlencode($account);
    $key = getenv("WA_SERVICE_KEY") ?: "";

    $ch = curl_init($base . $path);
    $headers = ["Content-Type: application/json"];
    if ($key !== "") {
        $headers[] = "X-Service-Key: " . $key;
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 60,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }

    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return [
            "code" => 503,
            "data" => [
                "success" => false,
                "status" => "service_offline",
                "message" => "WhatsApp service is not running on the server. " . $error
            ]
        ];
    }

    $data = json_decode($raw, true);
    return ["code" => $code ?: 500, "data" => is_array($data) ? $data : ["success" => false, "message" => "Bad reply from WhatsApp service."]];
}

function ensure_tables(mysqli $conn): void
{
    // Same definitions the Node service creates, so reads work before it first runs.
    $conn->query("
        CREATE TABLE IF NOT EXISTS wa_accounts (
            account_uid VARCHAR(128) PRIMARY KEY,
            user_name VARCHAR(255) DEFAULT NULL,
            user_email VARCHAR(255) DEFAULT NULL,
            wa_mobile VARCHAR(30) DEFAULT NULL,
            wa_name VARCHAR(255) DEFAULT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'new',
            linked_at DATETIME DEFAULT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) DEFAULT CHARSET = utf8mb4
    ");
    $conn->query("
        CREATE TABLE IF NOT EXISTS wa_chats (
            account_uid VARCHAR(128) NOT NULL,
            jid VARCHAR(100) NOT NULL,
            mobile VARCHAR(30) DEFAULT NULL,
            name VARCHAR(255) DEFAULT NULL,
            last_message TEXT,
            last_from_me TINYINT(1) NOT NULL DEFAULT 0,
            last_time DATETIME DEFAULT NULL,
            unread INT NOT NULL DEFAULT 0,
            PRIMARY KEY (account_uid, jid),
            INDEX idx_mobile (mobile),
            INDEX idx_last_time (last_time)
        ) DEFAULT CHARSET = utf8mb4
    ");
    $conn->query("
        CREATE TABLE IF NOT EXISTS wa_messages (
            account_uid VARCHAR(128) NOT NULL,
            jid VARCHAR(100) NOT NULL,
            id VARCHAR(128) NOT NULL,
            mobile VARCHAR(30) DEFAULT NULL,
            from_me TINYINT(1) NOT NULL DEFAULT 0,
            body TEXT,
            msg_type VARCHAR(30) DEFAULT 'text',
            file_name VARCHAR(255) DEFAULT NULL,
            ts DATETIME NOT NULL,
            sent_by VARCHAR(255) DEFAULT NULL,
            PRIMARY KEY (account_uid, jid, id),
            INDEX idx_mobile_ts (mobile, ts),
            INDEX idx_ts (ts)
        ) DEFAULT CHARSET = utf8mb4
    ");
}

function fetch_all(mysqli_stmt $stmt): array
{
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    $stmt->close();
    return $rows;
}

// Last 10 digits, so "+91 98765 43210", "919876543210" and "9876543210" match.
function mobile_key($value): string
{
    $digits = preg_replace('/\D/', '', (string)$value);
    return strlen($digits) > 10 ? substr($digits, -10) : $digits;
}

/*
 * Reply status of each quotation sent on WhatsApp (whatsapp_send_log):
 *   replied      the customer sent a message after the quotation
 *   followed_up  no customer message, but we messaged them again later
 *   no_reply     nothing from the customer since the quotation
 * Only messages seen while WhatsApp was linked count, so quotations sent
 * before linking show "no_reply" until the history sync has them.
 */
function quotation_statuses(mysqli $conn, array $input): array
{
    $where = ["l.quotation_no IS NOT NULL", "l.quotation_no <> ''"];
    $types = "";
    $params = [];

    $from = substr(trim((string)($input["from_date"] ?? "")), 0, 10);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
        $where[] = "l.created_at >= ?";
        $types .= "s";
        $params[] = $from . " 00:00:00";
    }
    $to = substr(trim((string)($input["to_date"] ?? "")), 0, 10);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
        $where[] = "l.created_at <= ?";
        $types .= "s";
        $params[] = $to . " 23:59:59";
    }
    $quotations = $input["quotation_nos"] ?? null;
    if (is_array($quotations) && $quotations) {
        $quotations = array_slice(array_values(array_filter(array_map("strval", $quotations))), 0, 2000);
        if ($quotations) {
            $where[] = "l.quotation_no IN (" . implode(",", array_fill(0, count($quotations), "?")) . ")";
            $types .= str_repeat("s", count($quotations));
            array_push($params, ...$quotations);
        }
    }

    // The latest send of each quotation to each number.
    $sql = "
        SELECT l.*
        FROM whatsapp_send_log l
        JOIN (
            SELECT MAX(id) AS id
            FROM whatsapp_send_log
            GROUP BY quotation_no, RIGHT(REGEXP_REPLACE(mobile, '[^0-9]', ''), 10)
        ) latest ON latest.id = l.id
        WHERE " . implode(" AND ", $where) . "
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 5000
    ";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $conn->error);
    }
    if ($params) {
        $stmt->bind_param($types, ...$params);
    }
    $sends = fetch_all($stmt);
    if (!$sends) {
        return [];
    }

    // All WhatsApp messages with those numbers since the oldest send.
    $oldest = min(array_column($sends, "created_at"));
    $mobiles = array_values(array_unique(array_filter(array_map(fn($r) => mobile_key($r["mobile"]), $sends))));

    $byMobile = [];
    foreach (array_chunk($mobiles, 500) as $chunk) {
        $sql = "
            SELECT RIGHT(mobile, 10) AS mk, from_me, ts, body, msg_type, file_name
            FROM wa_messages
            WHERE ts >= ? AND RIGHT(mobile, 10) IN (" . implode(",", array_fill(0, count($chunk), "?")) . ")
            ORDER BY ts
        ";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("s" . str_repeat("s", count($chunk)), $oldest, ...$chunk);
        foreach (fetch_all($stmt) as $m) {
            $byMobile[$m["mk"]][] = $m;
        }
    }

    $rows = [];
    foreach ($sends as $send) {
        $key = mobile_key($send["mobile"]);
        $sentAt = strtotime($send["created_at"]);
        $replyAt = null;
        $replyText = null;
        $followUpAt = null;
        $count = 0;

        foreach ($byMobile[$key] ?? [] as $m) {
            $ts = strtotime($m["ts"]);
            if ($ts < $sentAt - 60) {
                continue;
            }
            $count++;
            if ((int)$m["from_me"] === 0) {
                if ($replyAt === null) {
                    $replyAt = $m["ts"];
                    $replyText = $m["body"] !== "" ? $m["body"] : ($m["file_name"] ?: $m["msg_type"]);
                }
            } elseif ($ts > $sentAt + 600) {
                // Our own message at least 10 minutes after the quotation.
                $followUpAt = $m["ts"];
            }
        }

        $status = $replyAt ? "replied" : ($followUpAt ? "followed_up" : "no_reply");

        $rows[] = [
            "id" => (int)$send["id"],
            "quotation_no" => $send["quotation_no"],
            "order_no" => $send["order_no"],
            "party_name" => $send["party_name"],
            "customer_name" => $send["customer_name"],
            "mobile" => $send["mobile"],
            "quotation_amount" => $send["quotation_amount"] !== null ? (float)$send["quotation_amount"] : null,
            "pdf_attached" => (int)$send["pdf_attached"],
            "sent_by" => $send["sent_by"],
            "sent_on" => $send["created_at"],
            "status" => $status,
            "first_reply_at" => $replyAt,
            "first_reply" => $replyText,
            "last_follow_up" => $followUpAt,
            "messages" => $count,
            "days_waiting" => $replyAt ? null : (int)floor((time() - $sentAt) / 86400),
        ];
    }

    return $rows;
}
