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
 * WhatsApp templates and catalog PDFs for Solar New Leads (SolarNewLeads.jsx).
 *
 * JSON body:
 *   action "list":            everyone; templates + catalogs.
 *   action "save_template":   Admin only; creates or updates one template.
 *   action "delete_template": Admin only.
 *   action "delete_catalog":  Admin only.
 * multipart/form-data:
 *   action "upload_catalog":  Admin only; fields "name" and "pdf".
 */

// Public address customers use to open the catalog from WhatsApp.
// Set this to your internet-facing domain, e.g. "https://crm.everestagencies.in".
// When empty, the address of the current request is used.
$PUBLIC_BASE_URL = "";

$MAX_SIZE = 20 * 1024 * 1024; // 20 MB

$CATALOG_DIR = __DIR__ . "/uploads/solar_catalogs";

// Errors other than 401/403 are sent with status 200 and "success": false,
// because apiFetch() drops the response body for other error statuses.
function respond($status, $data)
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function require_admin(): array
{
    $user = firebase_require_user();

    if (!$user["is_admin"]) {
        respond(403, [
            "success" => false,
            "message" => "Only Admin can change WhatsApp templates and catalogs."
        ]);
    }

    return $user;
}

function catalog_base_url(string $publicBaseUrl): string
{
    if ($publicBaseUrl !== "") {
        return rtrim($publicBaseUrl, "/");
    }

    $isHttps = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off")
        || (($_SERVER["HTTP_X_FORWARDED_PROTO"] ?? "") === "https");
    $scheme = $isHttps ? "https" : "http";
    $scriptDir = rtrim(str_replace("\\", "/", dirname($_SERVER["SCRIPT_NAME"])), "/");

    return $scheme . "://" . $_SERVER["HTTP_HOST"] . $scriptDir;
}

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {
    respond(200, [
        "success" => false,
        "message" => "Database connection failed: " . $conn->connect_error
    ]);
}

$conn->set_charset("utf8mb4");

$conn->query("
    CREATE TABLE IF NOT EXISTS solar_whatsapp_templates (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        updated_by VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
");

$conn->query("
    CREATE TABLE IF NOT EXISTS solar_catalogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        uploaded_by VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
");

try {
    $isMultipart = stripos($_SERVER["CONTENT_TYPE"] ?? "", "multipart/form-data") !== false;

    // A body larger than post_max_size reaches PHP empty: no $_POST, no $_FILES.
    if ($isMultipart && empty($_POST) && empty($_FILES) && (int)($_SERVER["CONTENT_LENGTH"] ?? 0) > 0) {
        respond(200, [
            "success" => false,
            "message" => "The PDF is larger than the server allows (post_max_size=" . ini_get("post_max_size")
                . ", upload_max_filesize=" . ini_get("upload_max_filesize") . "). "
                . "Increase both in php.ini and restart Apache, or upload a smaller PDF."
        ]);
    }

    if ($isMultipart) {
        $input = $_POST;
    } else {
        $input = json_decode(file_get_contents("php://input"), true);
        if (!is_array($input)) {
            $input = [];
        }
    }

    $action = strtolower(trim((string)($input["action"] ?? "list")));

    if ($action === "list") {

        $templates = [];
        $result = $conn->query("
            SELECT id, name, message, sort_order, updated_by, updated_at
            FROM solar_whatsapp_templates
            ORDER BY sort_order ASC, created_at ASC
        ");
        if (!$result) {
            throw new Exception("Template list query failed: " . $conn->error);
        }
        while ($row = $result->fetch_assoc()) {
            $row["sort_order"] = (int)$row["sort_order"];
            $templates[] = $row;
        }
        $result->free();

        $baseUrl = catalog_base_url($PUBLIC_BASE_URL);
        $catalogs = [];
        $result = $conn->query("
            SELECT id, name, file_name, uploaded_by, created_at
            FROM solar_catalogs
            ORDER BY created_at DESC
        ");
        if (!$result) {
            throw new Exception("Catalog list query failed: " . $conn->error);
        }
        while ($row = $result->fetch_assoc()) {
            $row["id"] = (int)$row["id"];
            $row["url"] = $baseUrl . "/uploads/solar_catalogs/" . rawurlencode($row["file_name"]);
            $catalogs[] = $row;
        }
        $result->free();

        respond(200, [
            "success" => true,
            "templates" => $templates,
            "catalogs" => $catalogs
        ]);
    }

    if ($action === "save_template") {

        $user = require_admin();

        $id = mb_substr(trim((string)($input["id"] ?? "")), 0, 100);
        $name = mb_substr(trim((string)($input["name"] ?? "")), 0, 255);
        $message = (string)($input["message"] ?? "");
        $sortOrder = (int)($input["sort_order"] ?? 0);

        if ($id === "" || $name === "" || trim($message) === "") {
            respond(200, [
                "success" => false,
                "message" => "Template id, name and message are required."
            ]);
        }

        $stmt = $conn->prepare("
            INSERT INTO solar_whatsapp_templates (id, name, message, sort_order, updated_by)
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

        respond(200, ["success" => true, "id" => $id]);
    }

    if ($action === "delete_template") {

        require_admin();

        $id = trim((string)($input["id"] ?? ""));

        $stmt = $conn->prepare("DELETE FROM solar_whatsapp_templates WHERE id = ?");
        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }

        $stmt->bind_param("s", $id);

        if (!$stmt->execute()) {
            throw new Exception("Delete failed: " . $stmt->error);
        }

        $stmt->close();

        respond(200, ["success" => true]);
    }

    if ($action === "upload_catalog") {

        $user = require_admin();

        if (!isset($_FILES["pdf"])) {
            respond(200, [
                "success" => false,
                "message" => "PDF file is missing (post_max_size=" . ini_get("post_max_size") . ")"
            ]);
        }

        $file = $_FILES["pdf"];

        if ($file["error"] !== UPLOAD_ERR_OK) {
            respond(200, [
                "success" => false,
                "message" => $file["error"] === UPLOAD_ERR_INI_SIZE
                    ? "PDF is larger than upload_max_filesize (" . ini_get("upload_max_filesize") . ") in php.ini"
                    : "PDF upload error " . $file["error"]
            ]);
        }

        if ($file["size"] <= 0 || $file["size"] > $MAX_SIZE) {
            respond(200, ["success" => false, "message" => "PDF must be smaller than 20 MB."]);
        }

        // Only accept real PDF files.
        $handle = fopen($file["tmp_name"], "rb");
        $signature = $handle ? fread($handle, 5) : "";
        if ($handle) {
            fclose($handle);
        }

        if ($signature !== "%PDF-") {
            respond(200, ["success" => false, "message" => "Uploaded file is not a PDF."]);
        }

        $name = mb_substr(trim((string)($input["name"] ?? "")), 0, 255);
        if ($name === "") {
            $name = pathinfo((string)$file["name"], PATHINFO_FILENAME) ?: "Catalog";
        }

        $safeName = trim(preg_replace('/[^A-Za-z0-9_-]+/', '_', $name), "_");
        if ($safeName === "") {
            $safeName = "Catalog";
        }

        // Random token so links cannot be guessed from the catalog name.
        $fileName = "Solar_" . substr($safeName, 0, 60) . "_" . bin2hex(random_bytes(8)) . ".pdf";

        if (!is_dir($CATALOG_DIR) && !mkdir($CATALOG_DIR, 0755, true)) {
            respond(200, ["success" => false, "message" => "Cannot create folder " . $CATALOG_DIR . " (check write permission)"]);
        }

        if (!move_uploaded_file($file["tmp_name"], $CATALOG_DIR . "/" . $fileName)) {
            respond(200, ["success" => false, "message" => "Failed to save PDF in " . $CATALOG_DIR . " (check write permission)"]);
        }

        $stmt = $conn->prepare("INSERT INTO solar_catalogs (name, file_name, uploaded_by) VALUES (?, ?, ?)");
        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }

        $stmt->bind_param("sss", $name, $fileName, $user["name"]);

        if (!$stmt->execute()) {
            throw new Exception("Save failed: " . $stmt->error);
        }

        $id = $stmt->insert_id;
        $stmt->close();

        respond(200, [
            "success" => true,
            "id" => $id,
            "url" => catalog_base_url($PUBLIC_BASE_URL) . "/uploads/solar_catalogs/" . rawurlencode($fileName)
        ]);
    }

    if ($action === "delete_catalog") {

        require_admin();

        $id = (int)($input["id"] ?? 0);

        $stmt = $conn->prepare("SELECT file_name FROM solar_catalogs WHERE id = ?");
        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            respond(200, ["success" => false, "message" => "Catalog not found."]);
        }

        $path = $CATALOG_DIR . "/" . basename($row["file_name"]);
        if (is_file($path)) {
            unlink($path);
        }

        $stmt = $conn->prepare("DELETE FROM solar_catalogs WHERE id = ?");
        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }
        $stmt->bind_param("i", $id);

        if (!$stmt->execute()) {
            throw new Exception("Delete failed: " . $stmt->error);
        }

        $stmt->close();

        respond(200, ["success" => true]);
    }

    respond(200, [
        "success" => false,
        "message" => "Invalid action."
    ]);

} catch (Throwable $e) {

    respond(200, [
        "success" => false,
        "message" => $e->getMessage()
    ]);

} finally {
    $conn->close();
}
