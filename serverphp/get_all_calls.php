<?php
require_once __DIR__ . '/api_auth.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// =====================
// HEADERS (CORS + JSON)
// =====================
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");


// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// =====================
// ERROR HANDLING (IMPORTANT)
// =====================
error_reporting(0);
ini_set('display_errors', 0);

try {

    // =====================
    // DB CONNECTION
    // =====================
    $conn = new mysqli("localhost", "root", "", "tally_db");
    $conn->set_charset("utf8mb4");

    // =====================
    // SQL QUERY
    // =====================
    $sql = "SELECT
    c.id,
    c.kseb_id,

    IF(c.call_date='0000-00-00',NULL,c.call_date) AS call_date,

    c.telecaller_name,
    c.status,
    c.followup_status,

    c.quotation_status,
    c.quotation_no,
    c.quotation_amount,
    c.item_details,

    IF(c.quotation_date='0000-00-00',NULL,c.quotation_date) AS quotation_date,

    c.po_no,

    IF(c.po_date='0000-00-00',NULL,c.po_date) AS po_date,

    c.lost_reason,

    c.contact_person,
    c.contact_designation,

    c.remarks,

    IF(c.followup_date='0000-00-00',NULL,c.followup_date) AS followup_date,

    c.executive_name,
    c.phone,

    k.PLACE,
    k.AREA,
    k.PARENT_AREA,
    k.NAME,
    k.RECEIPTION_CUG,
    k.MAIL_ID

FROM kseb_calls c

LEFT JOIN kseb_directory k
ON c.kseb_id = k.id

ORDER BY c.call_date DESC";

    $result = $conn->query($sql);

    $data = [];

    while ($row = $result->fetch_assoc()) {

        foreach ($row as $key => $value) {
            if ($value === "" || $value === null) {
                $row[$key] = "-";
            }
        }

        $data[] = $row;
    }

    // =====================
    // SUCCESS RESPONSE
    // =====================
    echo json_encode([
        "status" => "success",
        "data" => $data
    ]);

} catch (Throwable $e) {

    // =====================
    // SAFE ERROR RESPONSE
    // =====================
    echo json_encode([
        "status" => "error",
        "message" => "Server error",
        "debug" => $e->getMessage()
    ]);
}