<?php
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-API-Key");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);

// Handle preflight (CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/*
|--------------------------------------------------------------------------
| CRM edited (red) fields
|
| GET  -> { "Party name": ["Mobile", "Email", ...], ... }
| POST -> { partyName, editedFields } saves the fields for one party
|--------------------------------------------------------------------------
*/

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    $conn = db_connect("salescollection");
    $conn->set_charset("utf8mb4");

    // Older files use "edited_field", newer ones "edited_fields"
    $table = null;
    foreach (["edited_field", "edited_fields"] as $name) {
        if ($conn->query("SHOW TABLES LIKE '$name'")->num_rows > 0) {
            $table = $name;
            break;
        }
    }

    if ($table === null) {
        $table = "edited_field";
        $conn->query("
            CREATE TABLE `edited_field` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `party_name` VARCHAR(255) NOT NULL,
                `field_name` VARCHAR(100) NOT NULL,
                KEY `party_name` (`party_name`)
            )
        ");
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents("php://input"), true);
        $party = trim((string)($input["partyName"] ?? ""));
        $fields = $input["editedFields"] ?? [];

        if ($party === "" || !is_array($fields)) {
            echo json_encode(["success" => false, "error" => "partyName and editedFields are required"]);
            exit;
        }

        $conn->begin_transaction();

        $del = $conn->prepare("DELETE FROM `$table` WHERE party_name = ?");
        $del->bind_param("s", $party);
        $del->execute();
        $del->close();

        $ins = $conn->prepare("INSERT INTO `$table` (party_name, field_name) VALUES (?, ?)");
        foreach (array_unique($fields) as $field) {
            $field = (string)$field;
            $ins->bind_param("ss", $party, $field);
            $ins->execute();
        }
        $ins->close();

        $conn->commit();

        echo json_encode(["success" => true]);
        $conn->close();
        exit;
    }

    $result = $conn->query("SELECT party_name, field_name FROM `$table`");

    $highlights = [];
    while ($row = $result->fetch_assoc()) {
        $highlights[$row["party_name"]][] = $row["field_name"];
    }

    // Empty result must still be a JSON object, not []
    echo json_encode((object)$highlights);
    $conn->close();

} catch (Throwable $e) {
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}
?>
