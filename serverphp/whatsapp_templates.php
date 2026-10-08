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
 * WhatsApp quotation templates, shared by the whole team.
 *
 * action "list":   everyone can read.
 * action "save":   Admin only; creates or updates one template.
 * action "delete": Admin only.
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
    CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        updated_by VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
");

function require_admin(): array
{
    $user = firebase_require_user();

    if (!$user["is_admin"]) {
        http_response_code(403);
        echo json_encode([
            "success" => false,
            "message" => "Only Admin can change WhatsApp templates."
        ]);
        exit;
    }

    return $user;
}

try {
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        $input = [];
    }

    $action = strtolower(trim((string)($input["action"] ?? "list")));

    if ($action === "list") {

        $result = $conn->query("
            SELECT id, name, message, sort_order, updated_by, updated_at
            FROM whatsapp_templates
            ORDER BY sort_order ASC, created_at ASC
        ");

        if (!$result) {
            throw new Exception("Template list query failed: " . $conn->error);
        }

        $data = [];
        while ($row = $result->fetch_assoc()) {
            $row["sort_order"] = (int)$row["sort_order"];
            $data[] = $row;
        }
        $result->free();

        echo json_encode([
            "success" => true,
            "data" => $data
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        exit;
    }

    if ($action === "save") {

        $user = require_admin();

        $id = mb_substr(trim((string)($input["id"] ?? "")), 0, 100);
        $name = mb_substr(trim((string)($input["name"] ?? "")), 0, 255);
        $message = (string)($input["message"] ?? "");
        $sortOrder = (int)($input["sort_order"] ?? 0);

        if ($id === "" || $name === "" || trim($message) === "") {
            http_response_code(400);
            echo json_encode([
                "success" => false,
                "message" => "Template id, name and message are required."
            ]);
            exit;
        }

        $stmt = $conn->prepare("
            INSERT INTO whatsapp_templates (id, name, message, sort_order, updated_by)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                message = VALUES(message),
                sort_order = VALUES(sort_order),
                updated_by = VALUES(updated_by)
        ");

        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }

        $stmt->bind_param("sssis", $id, $name, $message, $sortOrder, $user["name"]);

        if (!$stmt->execute()) {
            throw new Exception("Save failed: " . $stmt->error);
        }

        $stmt->close();

        echo json_encode(["success" => true, "id" => $id]);
        exit;
    }

    if ($action === "delete") {

        require_admin();

        $id = trim((string)($input["id"] ?? ""));

        $count = (int)$conn->query("SELECT COUNT(*) AS c FROM whatsapp_templates")->fetch_assoc()["c"];
        if ($count <= 1) {
            http_response_code(400);
            echo json_encode([
                "success" => false,
                "message" => "At least one WhatsApp template must remain."
            ]);
            exit;
        }

        $stmt = $conn->prepare("DELETE FROM whatsapp_templates WHERE id = ?");

        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }

        $stmt->bind_param("s", $id);

        if (!$stmt->execute()) {
            throw new Exception("Delete failed: " . $stmt->error);
        }

        $stmt->close();

        echo json_encode(["success" => true]);
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
