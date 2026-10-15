<?php
require_once __DIR__ . '/db_connect.php';

require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/ledger_mirror_tally.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}


/*
|--------------------------------------------------------------------------
| Marks ledgers as updated in Tally (removes them from the pending list).
|
| Request (JSON):
|   { "MSIDs": ["123", "456"], "synced_by": "name" }
|--------------------------------------------------------------------------
*/

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$input = json_decode(
    file_get_contents("php://input"),
    true
);

if (!is_array($input)) {
    $input = [];
}

$MSIDs = array_values(array_unique(array_filter(
    array_map(
        fn($id) => trim((string)$id),
        is_array($input["MSIDs"] ?? null) ? $input["MSIDs"] : []
    ),
    fn($id) => $id !== ""
)));

if (count($MSIDs) === 0) {

    http_response_code(400);

    echo json_encode([
        "success" => false,
        "message" => "MSIDs are required"
    ]);

    exit;
}

$syncedBy = trim((string)($input["synced_by"] ?? ""));

if ($syncedBy === "") {
    $syncedBy = "React User";
}


try {

    $conn = db_connect("salescollection");

    $conn->set_charset("utf8mb4");

    ensureLedgerMirrorTallyColumns($conn);

    $placeholders = implode(", ", array_fill(0, count($MSIDs), "?"));

    $stmt = $conn->prepare("
        UPDATE `ledger_mirror`
        SET
            `tally_pending` = 0,
            `tally_synced_at` = NOW(),
            `tally_synced_by` = ?
        WHERE `MSID` IN ($placeholders)
    ");

    $values = array_merge([$syncedBy], $MSIDs);

    $stmt->bind_param(
        str_repeat("s", count($values)),
        ...$values
    );

    $stmt->execute();

    $updated = $stmt->affected_rows;

    $stmt->close();
    $conn->close();

    echo json_encode([
        "success" => true,
        "message" => "Marked as updated in Tally",
        "updated" => $updated
    ]);

} catch (Throwable $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Failed to mark ledgers as updated in Tally",
        "error" => $e->getMessage()
    ]);
}

?>
