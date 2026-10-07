<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli("localhost","root","","salescollection");

$data = json_decode(file_get_contents("php://input"), true);

// Batch mode: { "quotationNos": [...] } returns every history in ONE request,
// so the Quotation Wise page doesn't fire one request per quotation
// (which made the host answer "429 Too Many Requests").
if (isset($data["quotationNos"]) && is_array($data["quotationNos"])) {
    $quotationNos = array_values(array_unique(array_filter(
        array_map(fn($q) => trim((string)$q), $data["quotationNos"]),
        fn($q) => $q !== ""
    )));

    $results = [];
    foreach ($quotationNos as $q) {
        $results[$q] = [];
    }

    foreach (array_chunk($quotationNos, 500) as $chunk) {
        $placeholders = implode(",", array_fill(0, count($chunk), "?"));
        $stmt = $conn->prepare("
            SELECT
                quotation_no,
                call_date,
                followup_date,
                telecaller,
                status,
                remarks,
                created_at
            FROM quotation_followups
            WHERE quotation_no IN ($placeholders)
            ORDER BY id DESC
        ");
        $stmt->bind_param(str_repeat("s", count($chunk)), ...$chunk);
        $stmt->execute();
        $result = $stmt->get_result();

        while ($row = $result->fetch_assoc()) {
            $q = $row["quotation_no"];
            unset($row["quotation_no"]);
            $results[$q][] = $row;
        }
        $stmt->close();
    }

    echo json_encode([
        "success" => true,
        "results" => (object)$results
    ]);
    $conn->close();
    exit;
}

$quotationNo = trim($data["quotationNo"] ?? "");

if ($quotationNo == "") {
    echo json_encode([
        "success" => false,
        "message" => "Quotation number is empty"
    ]);
    exit;
}

$stmt = $conn->prepare("
    SELECT
        call_date,
        followup_date,
        telecaller,
        status,
        remarks,
        created_at
    FROM quotation_followups
    WHERE quotation_no = ?
    ORDER BY id DESC
");

$stmt->bind_param("s", $quotationNo);
$stmt->execute();

$result = $stmt->get_result();

$rows = [];

while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode([
    "quotationNo" => $quotationNo,
    "count" => count($rows),
    "data" => $rows
]);

$stmt->close();
$conn->close();