<?php

require_once __DIR__ . '/api_auth.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

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

function normalizePartyKey($value): string
{
    $value = trim((string)($value ?? ""));
    $value = preg_replace('/\s+/', ' ', $value);
    return strtolower($value);
}

try {
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        $input = [];
    }

    $action = strtolower(trim((string)($input["action"] ?? "list")));

    /*
     * READ:
     * Everyone who can access the quotation page can read the flags.
     */
    if ($action === "list") {

        $sql = "
            SELECT
                id,
                party_ledger_name,
                is_long_term_client,
                updated_by,
                updated_at
            FROM long_term_clients
            WHERE is_long_term_client = 1
            ORDER BY party_ledger_name ASC
        ";

        $result = $conn->query($sql);

        if (!$result) {
            throw new Exception("Long-term client list query failed: " . $conn->error);
        }

        $data = [];

        while ($row = $result->fetch_assoc()) {
            $data[] = [
                "id" => (int)$row["id"],
                "party_ledger_name" => $row["party_ledger_name"],
                "is_long_term_client" => (int)$row["is_long_term_client"],
                "updated_by" => $row["updated_by"],
                "updated_at" => $row["updated_at"]
            ];
        }

        $result->free();

        echo json_encode([
            "success" => true,
            "count" => count($data),
            "data" => $data
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        exit;
    }

    /*
     * WRITE:
     * The React page passes its already-verified Admin role.
     *
     * IMPORTANT:
     * Your current app determines Admin from Firebase's "roles" collection
     * on the client. This check enforces the same application rule at the
     * endpoint level, but a fully tamper-proof server-side permission check
     * would require verifying the Firebase ID token on this PHP server.
     */
    if ($action === "update") {

        $isAdmin = filter_var(
            $input["is_admin"] ?? false,
            FILTER_VALIDATE_BOOLEAN
        );

        if (!$isAdmin) {
            http_response_code(403);

            echo json_encode([
                "success" => false,
                "message" => "Only Admin can edit Long-Term Client."
            ]);

            exit;
        }

        $partyLedgerName = trim(
            (string)($input["party_ledger_name"] ?? "")
        );

        $partyKey = normalizePartyKey($partyLedgerName);

        if ($partyKey === "") {
            http_response_code(400);

            echo json_encode([
                "success" => false,
                "message" => "Party/Ledger Name is required."
            ]);

            exit;
        }

        $isLongTermClient = !empty($input["is_long_term_client"]) ? 1 : 0;

        /*
         * The frontend can optionally send the logged-in user's display name.
         * It is stored only for audit purposes.
         */
        $updatedBy = trim(
            (string)($input["updated_by"] ?? "Admin")
        );

        $sql = "
            INSERT INTO long_term_clients
                (
                    party_ledger_name,
                    party_key,
                    is_long_term_client,
                    updated_by
                )
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                party_ledger_name = VALUES(party_ledger_name),
                is_long_term_client = VALUES(is_long_term_client),
                updated_by = VALUES(updated_by),
                updated_at = CURRENT_TIMESTAMP
        ";

        $stmt = $conn->prepare($sql);

        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }

        $stmt->bind_param(
            "ssis",
            $partyLedgerName,
            $partyKey,
            $isLongTermClient,
            $updatedBy
        );

        if (!$stmt->execute()) {
            throw new Exception("Save failed: " . $stmt->error);
        }

        $stmt->close();

        echo json_encode([
            "success" => true,
            "party_ledger_name" => $partyLedgerName,
            "is_long_term_client" => $isLongTermClient
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

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
