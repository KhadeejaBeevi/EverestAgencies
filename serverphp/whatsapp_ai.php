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
 * Everest Connect – Ask AI.
 *
 * Answers questions about quotations sent on WhatsApp and the WhatsApp chats
 * ("who never replied this week?", "summarise my chat with Baiju", "draft a
 * follow-up for KEFA SOLAR"), using Claude through the official Anthropic PHP SDK.
 *
 * Setup (once, on the server):
 *   cd serverphp
 *   composer require anthropic-ai/sdk guzzlehttp/guzzle     (needs PHP 8.1+)
 *   Apache httpd.conf:  SetEnv ANTHROPIC_API_KEY sk-ant-...   then restart Apache
 *
 * Request:  { "question": "...", "history": [ {"role": "user"|"assistant", "text": "..."} ] }
 * Response: { "success": true, "answer": "...", "collections": [ {"name", "reason", "mobiles": [...] } ] }
 *
 * Claude sees the quotation reply-status table (all users, same as the
 * "Quotations sent" collection) and can read chat messages through tools:
 * a user's own WhatsApp only; admins can read every user's.
 */

const AI_MODEL = "claude-opus-5-5";
const AI_MAX_TOOL_ROUNDS = 6;
const AI_MAX_QUOTATION_ROWS = 300;

function ai_reply(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ai_api_key(): string
{
    $key = getenv("ANTHROPIC_API_KEY");
    if (!$key && function_exists("apache_getenv")) {
        $key = apache_getenv("ANTHROPIC_API_KEY");
    }
    if (!$key) {
        $key = $_SERVER["ANTHROPIC_API_KEY"] ?? ($_SERVER["REDIRECT_ANTHROPIC_API_KEY"] ?? "");
    }
    return trim((string)$key);
}

// Compact, pipe-separated table of quotations with their reply status.
function ai_quotation_table(array $rows): string
{
    $label = ["no_reply" => "NO REPLY", "followed_up" => "FOLLOWED UP, NO REPLY", "replied" => "CUSTOMER REPLIED"];
    $lines = ["record_id | quotation_no | party | contact | mobile | amount_inr | sent_on | sent_by | status | days_waiting | first_reply | last_follow_up | messages_since"];
    foreach (array_slice($rows, 0, AI_MAX_QUOTATION_ROWS) as $r) {
        $clean = fn($v) => str_replace(["|", "\n", "\r"], ["/", " ", " "], (string)($v ?? ""));
        $lines[] = implode(" | ", [
            $r["id"],
            $clean($r["quotation_no"]),
            $clean($r["party_name"]),
            $clean($r["customer_name"]),
            preg_replace('/\D/', '', (string)$r["mobile"]),
            $r["quotation_amount"] !== null ? round($r["quotation_amount"]) : "",
            substr((string)$r["sent_on"], 0, 16),
            $clean($r["sent_by"]),
            $label[$r["status"]] ?? $r["status"],
            $r["days_waiting"] ?? "",
            mb_substr($clean($r["first_reply"]), 0, 80),
            substr((string)($r["last_follow_up"] ?? ""), 0, 16),
            $r["messages"],
        ]);
    }
    if (count($rows) > AI_MAX_QUOTATION_ROWS) {
        $lines[] = "(" . (count($rows) - AI_MAX_QUOTATION_ROWS) . " older quotations not shown)";
    }
    return implode("\n", $lines);
}

// SQL condition limiting wa_messages to the accounts this user may read.
function ai_account_filter(array $user): array
{
    return $user["is_admin"] ? ["1 = 1", "", []] : ["m.account_uid = ?", "s", [$user["uid"]]];
}

function ai_tool_get_chat(mysqli $conn, array $user, array $input): string
{
    $key = mobile_key($input["mobile"] ?? "");
    if (strlen($key) < 6) {
        return "Error: give the customer's mobile number.";
    }
    $limit = max(1, min(200, (int)($input["limit"] ?? 60)));
    [$where, $types, $params] = ai_account_filter($user);

    $stmt = $conn->prepare("
        SELECT m.ts, m.from_me, m.body, m.msg_type, m.file_name, m.sent_by, a.user_name
        FROM wa_messages m
        LEFT JOIN wa_accounts a ON a.account_uid = m.account_uid
        WHERE $where AND RIGHT(m.mobile, 10) = ?
        ORDER BY m.ts DESC
        LIMIT $limit
    ");
    $stmt->bind_param($types . "s", ...[...$params, $key]);
    $rows = array_reverse(fetch_all($stmt));
    if (!$rows) {
        return "No WhatsApp messages found with ...$key" . ($user["is_admin"] ? "." : " on your WhatsApp.");
    }

    $out = [];
    foreach ($rows as $m) {
        $who = (int)$m["from_me"] === 1
            ? "Us (" . ($m["sent_by"] ?: ($m["user_name"] ?: "staff")) . ")"
            : "Customer";
        $text = $m["body"] !== "" && $m["body"] !== null ? $m["body"] : "";
        if ($m["msg_type"] !== "text") {
            $text = "[" . $m["msg_type"] . ($m["file_name"] ? ": " . $m["file_name"] : "") . "] " . $text;
        }
        $out[] = substr($m["ts"], 0, 16) . " | $who: " . mb_substr(trim($text), 0, 600);
    }
    return implode("\n", $out);
}

function ai_tool_search(mysqli $conn, array $user, array $input): string
{
    $text = trim((string)($input["text"] ?? ""));
    if (mb_strlen($text) < 2) {
        return "Error: give at least 2 characters to search for.";
    }
    [$where, $types, $params] = ai_account_filter($user);
    $like = "%" . $text . "%";

    $stmt = $conn->prepare("
        SELECT m.ts, m.mobile, m.from_me, m.body, c.name
        FROM wa_messages m
        LEFT JOIN wa_chats c ON c.account_uid = m.account_uid AND c.jid = m.jid
        WHERE $where AND m.body LIKE ?
        ORDER BY m.ts DESC
        LIMIT 40
    ");
    $stmt->bind_param($types . "s", ...[...$params, $like]);
    $rows = fetch_all($stmt);
    if (!$rows) {
        return "No messages contain \"$text\".";
    }
    $out = [];
    foreach ($rows as $m) {
        $out[] = substr($m["ts"], 0, 16) . " | " . ($m["name"] ?: "") . " +" . $m["mobile"] . " | "
            . ((int)$m["from_me"] === 1 ? "Us" : "Customer") . ": " . mb_substr((string)$m["body"], 0, 300);
    }
    return implode("\n", $out);
}

$TOOLS = [
    [
        "name" => "get_chat_messages",
        "description" => "Read the WhatsApp conversation with one customer, oldest first. Use it to check what a customer actually said (interested, price objection, asked for changes, not interested) or before drafting a follow-up.",
        "inputSchema" => [
            "type" => "object",
            "properties" => [
                "mobile" => ["type" => "string", "description" => "Customer mobile number, any format (last 10 digits are matched)."],
                "limit" => ["type" => "integer", "description" => "How many recent messages to read (default 60, max 200)."],
            ],
            "required" => ["mobile"],
        ],
    ],
    [
        "name" => "search_messages",
        "description" => "Find WhatsApp messages containing a word or phrase (e.g. 'not interested', 'discount', 'PO'). Returns up to 40 newest matches with customer name and mobile.",
        "inputSchema" => [
            "type" => "object",
            "properties" => [
                "text" => ["type" => "string", "description" => "Word or phrase to search for."],
            ],
            "required" => ["text"],
        ],
    ],
    [
        "name" => "propose_collection",
        "description" => "Offer the user a list of customers to save as a collection in Everest Connect (for example 'No reply - this week'). Use whenever your answer is a list of customers the user may want to follow up. The user sees a Save button; nothing is saved until they press it.",
        "inputSchema" => [
            "type" => "object",
            "properties" => [
                "name" => ["type" => "string", "description" => "Short collection name, max 40 characters."],
                "reason" => ["type" => "string", "description" => "One line on who is in it."],
                "mobiles" => ["type" => "array", "items" => ["type" => "string"], "description" => "Customer mobile numbers."],
            ],
            "required" => ["name", "mobiles"],
        ],
    ],
];

$SYSTEM = <<<TXT
You are the assistant inside Everest Connect, the WhatsApp inbox of Everest Agencies, an electrical goods distributor in Kerala, India. Sales staff send quotations to customers on WhatsApp and follow them up.

You get a table of quotations sent on WhatsApp with their reply status:
- NO REPLY: the customer has sent nothing since the quotation.
- FOLLOWED UP, NO REPLY: we messaged again (10+ minutes later) but the customer still has not replied.
- CUSTOMER REPLIED: the customer sent at least one message after the quotation (first_reply shows it). A reply is not the same as an order; read the chat if it matters.
Status only counts messages seen while the user's WhatsApp was linked to Everest Connect.

How to answer:
- Be short and practical. Staff read this between calls. Use plain English that is easy for Malayalam speakers; no jargon.
- For lists of customers, give name, quotation number, amount in ₹ with Indian digit grouping, and days waiting, newest or most valuable first as fits the question.
- When the answer is a list of customers the user may want to chase, also call propose_collection with their mobiles.
- Read the chat with get_chat_messages before judging what a customer meant or before drafting a message.
- When asked to draft a WhatsApp follow-up, write it ready to send: polite, short, mention the quotation number, no emojis unless asked.
- Use only the data given and what the tools return. If something is not in the data, say so plainly instead of guessing.
TXT;

// ------------------------------------------------------------------ main

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    ai_reply(500, ["success" => false, "message" => "Database connection failed."]);
}
$conn->set_charset("utf8mb4");

require_once __DIR__ . '/whatsapp_common.php';

try {
    $user = firebase_require_user();

    $input = json_decode(file_get_contents("php://input"), true);
    $question = trim((string)($input["question"] ?? ""));
    if ($question === "") {
        ai_reply(400, ["success" => false, "message" => "Type a question."]);
    }
    $question = mb_substr($question, 0, 2000);

    $autoload = __DIR__ . '/vendor/autoload.php';
    if (is_file($autoload)) {
        require_once $autoload;
    }
    if (!class_exists(\Anthropic\Client::class)) {
        ai_reply(200, [
            "success" => false,
            "code" => "ai_not_installed",
            "message" => "Ask AI is not installed on the server yet. Admin: in the serverphp folder run: composer require anthropic-ai/sdk guzzlehttp/guzzle",
        ]);
    }
    $apiKey = ai_api_key();
    if ($apiKey === "") {
        ai_reply(200, [
            "success" => false,
            "code" => "ai_not_configured",
            "message" => "Ask AI needs an Anthropic API key on the server. Admin: add SetEnv ANTHROPIC_API_KEY ... to Apache and restart it.",
        ]);
    }

    ensure_tables($conn);
    $quotations = quotation_statuses($conn, []);

    // Earlier turns of this Ask AI conversation (text only, newest 10).
    $messages = [];
    foreach (array_slice(is_array($input["history"] ?? null) ? $input["history"] : [], -10) as $turn) {
        $role = ($turn["role"] ?? "") === "assistant" ? "assistant" : "user";
        $text = trim((string)($turn["text"] ?? ""));
        if ($text === "") {
            continue;
        }
        // The API needs the first message to be from the user and roles to alternate.
        if (!$messages && $role !== "user") {
            continue;
        }
        if ($messages && end($messages)["role"] === $role) {
            $messages[count($messages) - 1]["content"] .= "\n\n" . mb_substr($text, 0, 4000);
            continue;
        }
        $messages[] = ["role" => $role, "content" => mb_substr($text, 0, 4000)];
    }
    if ($messages && end($messages)["role"] === "user") {
        array_pop($messages); // keep alternation: the new question is the user turn
    }

    $dataBlock = "Today: " . date("l j F Y, H:i") . "\n"
        . "Asked by: " . $user["name"] . ($user["is_admin"] ? " (admin)" : "") . "\n\n"
        . "Quotations sent on WhatsApp (" . count($quotations) . "), newest first:\n"
        . ai_quotation_table($quotations);

    $messages[] = [
        "role" => "user",
        "content" => [
            ["type" => "text", "text" => $dataBlock],
            ["type" => "text", "text" => $question],
        ],
    ];

    $client = new \Anthropic\Client(apiKey: $apiKey);
    $collections = [];

    $call = function (array $messages) use ($client, $TOOLS, $SYSTEM) {
        return $client->beta->messages->create(
            model: AI_MODEL,
            maxTokens: 16000,
            system: [["type" => "text", "text" => $SYSTEM, "cacheControl" => ["type" => "ephemeral"]]],
            messages: $messages,
            tools: $TOOLS,
            outputConfig: ["effort" => "medium"],
            // If the model declines for policy reasons, the API retries on a fallback model.
            fallbacks: "default",
            betas: ["server-side-fallback-2026-07-01"],
        );
    };

    $response = $call($messages);
    $rounds = 0;

    while ($response->stopReason === "tool_use" && $rounds < AI_MAX_TOOL_ROUNDS) {
        $rounds++;
        $results = [];
        foreach ($response->content as $block) {
            if ($block->type !== "tool_use") {
                continue;
            }
            $args = is_array($block->input) ? $block->input : [];
            switch ($block->name) {
                case "get_chat_messages":
                    $out = ai_tool_get_chat($conn, $user, $args);
                    break;
                case "search_messages":
                    $out = ai_tool_search($conn, $user, $args);
                    break;
                case "propose_collection":
                    $mobiles = array_values(array_unique(array_filter(array_map(
                        fn($m) => preg_replace('/\D/', '', (string)$m),
                        is_array($args["mobiles"] ?? null) ? $args["mobiles"] : []
                    ))));
                    $collections[] = [
                        "name" => mb_substr(trim((string)($args["name"] ?? "AI collection")), 0, 40) ?: "AI collection",
                        "reason" => mb_substr(trim((string)($args["reason"] ?? "")), 0, 200),
                        "mobiles" => array_slice($mobiles, 0, 500),
                    ];
                    $out = "Shown to the user with a Save button (" . count($mobiles) . " customers).";
                    break;
                default:
                    $out = "Unknown tool.";
            }
            $results[] = ["type" => "tool_result", "toolUseID" => $block->id, "content" => $out];
        }
        // Pass the assistant turn back unchanged (it may hold thinking blocks).
        $messages[] = ["role" => "assistant", "content" => $response->content];
        $messages[] = ["role" => "user", "content" => $results];
        $response = $call($messages);
    }

    if ($response->stopReason === "refusal") {
        ai_reply(200, [
            "success" => true,
            "answer" => "Sorry, I can't help with that one. Try asking about quotations, replies or a customer's chat.",
            "collections" => [],
        ]);
    }

    $answer = "";
    foreach ($response->content as $block) {
        if ($block->type === "text") {
            $answer .= $block->text;
        }
    }
    if ($response->stopReason === "tool_use") {
        $answer .= ($answer ? "\n\n" : "") . "(Stopped after several lookups. Ask a narrower question for a full answer.)";
    } elseif ($response->stopReason === "max_tokens") {
        $answer .= "\n\n(Answer cut short. Ask for a shorter list.)";
    }

    ai_reply(200, [
        "success" => true,
        "answer" => trim($answer) !== "" ? trim($answer) : "I couldn't find an answer in the data.",
        "collections" => $collections,
    ]);

} catch (\Anthropic\Core\Exceptions\AuthenticationException $e) {
    ai_reply(200, ["success" => false, "code" => "ai_bad_key", "message" => "The Anthropic API key on the server is not valid. Admin: check ANTHROPIC_API_KEY."]);
} catch (\Anthropic\Core\Exceptions\RateLimitException $e) {
    ai_reply(429, ["success" => false, "message" => "Ask AI is busy. Wait a minute and try again."]);
} catch (\Anthropic\Core\Exceptions\APIStatusException $e) {
    error_log("Ask AI API error: " . $e->getMessage());
    ai_reply(502, ["success" => false, "message" => "Ask AI could not answer right now (" . ($e->type ?? "API error") . "). Try again."]);
} catch (\Anthropic\Core\Exceptions\APIConnectionException $e) {
    ai_reply(502, ["success" => false, "message" => "The server could not reach the AI service. Check its internet connection."]);
} catch (Throwable $e) {
    error_log("Ask AI error: " . $e->getMessage());
    ai_reply(500, ["success" => false, "message" => "Ask AI error: " . $e->getMessage()]);
} finally {
    $conn->close();
}
?>
