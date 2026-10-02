<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// =====================================================
// DB CONNECTION
// =====================================================

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {

    echo json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]);

    exit;

}

// =====================================================
// GET EXECUTIVES
// =====================================================

$executives =
    $_GET['executives'] ?? '';

// =====================================================
// EMPTY CHECK
// =====================================================

if (empty($executives)) {

    echo json_encode([
        "status" => "error",
        "message" => "No executives provided"
    ]);

    exit;

}

// =====================================================
// ARRAY
// =====================================================

$executiveArray =
    array_filter(
        explode(",", $executives)
    );

// =====================================================
// CLEAN
// =====================================================

$executiveArray = array_map(
    'trim',
    $executiveArray
);

$executiveArray = array_map(
    'strtoupper',
    $executiveArray
);

// =====================================================
// PLACEHOLDERS
// =====================================================

$placeholders = implode(
    ',',
    array_fill(
        0,
        count($executiveArray),
        '?'
    )
);

// =====================================================
// QUERY
// =====================================================

$sql = "

SELECT kd.*

FROM kseb_directory kd

WHERE UPPER(kd.SALES_EXECUTIVE)

IN ($placeholders)

AND NOT EXISTS (

    SELECT 1

    FROM kseb_calls kc

    WHERE kc.kseb_id = kd.id

    AND MONTH(kc.call_date) = MONTH(CURDATE())

    AND YEAR(kc.call_date) = YEAR(CURDATE())

)

ORDER BY kd.AREA ASC

LIMIT 20

";

// =====================================================
// PREPARE
// =====================================================

$stmt = $conn->prepare($sql);

if (!$stmt) {

    echo json_encode([
        "status" => "error",
        "message" => $conn->error
    ]);

    exit;

}

// =====================================================
// BIND
// =====================================================

$types = str_repeat(
    "s",
    count($executiveArray)
);

$stmt->bind_param(
    $types,
    ...$executiveArray
);

// =====================================================
// EXECUTE
// =====================================================

$stmt->execute();

$result = $stmt->get_result();

// =====================================================
// DATA
// =====================================================

$data = [];

while (
    $row = $result->fetch_assoc()
) {

    $data[] = $row;

}

// =====================================================
// RESPONSE
// =====================================================

echo json_encode([

    "status" => "success",

    "count" => count($data),

    "data" => $data

]);

?>