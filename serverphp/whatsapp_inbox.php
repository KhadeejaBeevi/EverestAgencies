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
 * Everest Connect (WhatsApp inbox) API.
 *
 * Every user links their own WhatsApp. All accounts share the same tables
 * (wa_accounts / wa_chats / wa_messages); account_uid is the user's
 * Firebase uid. The Node service in /whatsapp-service fills them and only
 * listens on this machine; connecting (QR), sending and unlinking are passed
 * on to it for the logged-in user's own account.
 *
 * Every action needs a Firebase login (Authorization: Bearer <id token>).
 *
 * Actions:
 *   status      my QR code / connected number
 *   connect     start linking my WhatsApp (shows a QR)
 *   logout      unlink my WhatsApp
 *   accounts    linked WhatsApp accounts (admin: all, others: own)
 *   chats       chat list, newest first (account_uid: admin may pick any or "all")
 *   messages    one chat's messages (jid, account_uid)
 *   mark_read   clear one of my chats' unread count (jid)
 *   send        send a text (mobile, text) from my WhatsApp
 *   quotations  quotations sent on WhatsApp with their reply status
 *               (a reply to any user's WhatsApp counts)
 *
 * Settings (environment variables, optional):
 *   WA_SERVICE_URL  default http://127.0.0.1:3005
 *   WA_SERVICE_KEY  must match the Node service's WA_SERVICE_KEY
 */

$conn = new mysqli("localhost", "root", "", "salescollection");

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Database connection failed: " . $conn->connect_error]);
    exit;
}

$conn->set_charset("utf8mb4");

require_once __DIR__ . '/whatsapp_common.php';

try {
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        $input = [];
    }
    $action = strtolower(trim((string)($input["action"] ?? "chats")));

    ensure_tables($conn);

    $user = firebase_require_user();
    $uid = $user["uid"];

    // Which account's chats to read: your own; an admin may pick any or "all".
    $readAccount = function () use ($input, $user, $uid): ?string {
        $wanted = trim((string)($input["account_uid"] ?? ""));
        if ($wanted === "" || !$user["is_admin"]) {
            return $uid;
        }
        return $wanted === "all" ? null : substr($wanted, 0, 128);
    };

    if ($action === "status") {
        $reply = wa_service("GET", "/status", $uid);
        $data = $reply["data"];
        $data["is_admin"] = $user["is_admin"];
        $data["user_name"] = $user["name"];
        // Service offline is shown on the page, not as an error.
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === "connect") {
        $reply = wa_service("POST", "/connect", $uid, [
            "user_name" => $user["name"],
            "user_email" => $user["email"],
        ]);
        http_response_code($reply["code"]);
        echo json_encode($reply["data"], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === "logout") {
        // Your own WhatsApp; an admin may also unlink another user's.
        $target = $uid;
        $wanted = trim((string)($input["account_uid"] ?? ""));
        if ($wanted !== "" && $wanted !== $uid) {
            if (!$user["is_admin"]) {
                http_response_code(403);
                echo json_encode(["success" => false, "message" => "You can only unlink your own WhatsApp."]);
                exit;
            }
            $target = substr($wanted, 0, 128);
        }
        $reply = wa_service("POST", "/logout", $target, []);
        http_response_code($reply["code"]);
        echo json_encode($reply["data"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === "send") {
        $mobile = substr(trim((string)($input["mobile"] ?? "")), 0, 30);
        $text = (string)($input["text"] ?? "");
        if ($mobile === "" || trim($text) === "") {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Mobile and message are required."]);
            exit;
        }
        $reply = wa_service("POST", "/send", $uid, [
            "mobile" => $mobile,
            "text" => mb_substr($text, 0, 4000),
            "sent_by" => $user["name"],
        ]);
        http_response_code($reply["code"]);
        echo json_encode($reply["data"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === "accounts") {
        if ($user["is_admin"]) {
            $stmt = $conn->prepare("
                SELECT account_uid, user_name, user_email, wa_mobile, wa_name, status, linked_at
                FROM wa_accounts
                ORDER BY user_name
            ");
        } else {
            $stmt = $conn->prepare("
                SELECT account_uid, user_name, user_email, wa_mobile, wa_name, status, linked_at
                FROM wa_accounts
                WHERE account_uid = ?
            ");
            $stmt->bind_param("s", $uid);
        }
        echo json_encode(["success" => true, "data" => fetch_all($stmt)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === "chats") {
        $limit = (int)($input["limit"] ?? 500);
        if ($limit < 1 || $limit > 5000) {
            $limit = 500;
        }
        $account = $readAccount();
        $sql = "
            SELECT c.account_uid, a.user_name AS account_user, c.jid, c.mobile, c.name,
                   c.last_message, c.last_from_me, c.last_time, c.unread
            FROM wa_chats c
            LEFT JOIN wa_accounts a ON a.account_uid = c.account_uid
            WHERE c.last_time IS NOT NULL " . ($account !== null ? "AND c.account_uid = ?" : "") . "
            ORDER BY c.last_time DESC
            LIMIT ?
        ";
        $stmt = $conn->prepare($sql);
        if ($account !== null) {
            $stmt->bind_param("si", $account, $limit);
        } else {
            $stmt->bind_param("i", $limit);
        }
        $rows = fetch_all($stmt);
        foreach ($rows as &$row) {
            $row["last_from_me"] = (int)$row["last_from_me"];
            $row["unread"] = (int)$row["unread"];
        }
        echo json_encode(["success" => true, "data" => $rows], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === "messages") {
        $jid = substr(trim((string)($input["jid"] ?? "")), 0, 100);
        $account = $readAccount() ?? $uid;
        $stmt = $conn->prepare("
            SELECT id, from_me, body, msg_type, file_name, ts, sent_by
            FROM (
                SELECT id, from_me, body, msg_type, file_name, ts, sent_by
                FROM wa_messages
                WHERE account_uid = ? AND jid = ?
                ORDER BY ts DESC
                LIMIT 1000
            ) recent
            ORDER BY ts
        ");
        $stmt->bind_param("ss", $account, $jid);
        $rows = fetch_all($stmt);
        foreach ($rows as &$row) {
            $row["from_me"] = (int)$row["from_me"];
        }
        echo json_encode(["success" => true, "data" => $rows], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === "mark_read") {
        $jid = substr(trim((string)($input["jid"] ?? "")), 0, 100);
        $stmt = $conn->prepare("UPDATE wa_chats SET unread = 0 WHERE account_uid = ? AND jid = ?");
        $stmt->bind_param("ss", $uid, $jid);
        $stmt->execute();
        $stmt->close();
        echo json_encode(["success" => true]);
        exit;
    }

    if ($action === "quotations") {
        $rows = quotation_statuses($conn, $input);
        echo json_encode(["success" => true, "count" => count($rows), "data" => $rows], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Invalid action."]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()], JSON_UNESCAPED_UNICODE);
} finally {
    $conn->close();
}
?>
