<?php

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 1);

/*
|--------------------------------------------------------------------------
| OPTIONS
|--------------------------------------------------------------------------
*/

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/*
|--------------------------------------------------------------------------
| POST only
|--------------------------------------------------------------------------
*/

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode([
        "success" => false,
        "message" => "Only POST requests are allowed"
    ]);
    exit();
}

/*
|--------------------------------------------------------------------------
| Database
|--------------------------------------------------------------------------
*/

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed: " . $conn->connect_error
    ]);
    exit();
}

$conn->set_charset("utf8mb4");

/*
|--------------------------------------------------------------------------
| Read JSON
|--------------------------------------------------------------------------
*/

$input = json_decode(
    file_get_contents("php://input"),
    true
);

if (!$input || !is_array($input)) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid JSON input"
    ]);
    $conn->close();
    exit();
}

/*
|--------------------------------------------------------------------------
| Filters
|--------------------------------------------------------------------------
*/

$from_date = trim($input["from_date"] ?? "");
$to_date   = trim($input["to_date"] ?? "");
$added_by  = trim($input["added_by"] ?? "all");

/*
|--------------------------------------------------------------------------
| Default dates
|--------------------------------------------------------------------------
*/

if ($from_date === "") {
    $from_date = date("Y-m-d");
}

if ($to_date === "") {
    $to_date = date("Y-m-d");
}

/*
|--------------------------------------------------------------------------
| Validate dates
|--------------------------------------------------------------------------
*/

$fromDateObj = DateTime::createFromFormat("Y-m-d", $from_date);
$toDateObj   = DateTime::createFromFormat("Y-m-d", $to_date);

if (
    !$fromDateObj ||
    !$toDateObj ||
    $fromDateObj->format("Y-m-d") !== $from_date ||
    $toDateObj->format("Y-m-d") !== $to_date
) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid date format. Use YYYY-MM-DD."
    ]);
    $conn->close();
    exit();
}

if ($from_date > $to_date) {
    echo json_encode([
        "success" => false,
        "message" => "From date cannot be greater than To date."
    ]);
    $conn->close();
    exit();
}

/*
|--------------------------------------------------------------------------
| Common WHERE
|--------------------------------------------------------------------------
|
| We use:
|
| created_at >= from date
| created_at < day after to date
|
| This includes the complete To Date.
|--------------------------------------------------------------------------
*/

$where = "
    created_at >= ?
    AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
";

$params = [
    $from_date,
    $to_date
];

$types = "ss";

/*
|--------------------------------------------------------------------------
| Staff filter
|--------------------------------------------------------------------------
*/

if ($added_by !== "" && strtolower($added_by) !== "all") {
    $where .= " AND added_by = ?";
    $params[] = $added_by;
    $types .= "s";
}

/*
|--------------------------------------------------------------------------
| Helper function for prepared statements
|--------------------------------------------------------------------------
*/

function bindDynamicParams($stmt, $types, &$params)
{
    if ($types === "") {
        return;
    }

    $bindNames = [];
    $bindNames[] = $types;

    foreach ($params as $key => &$value) {
        $bindNames[] = &$value;
    }

    call_user_func_array(
        [$stmt, 'bind_param'],
        $bindNames
    );
}

/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

$summarySql = "
    SELECT COUNT(*) AS total
    FROM newpartyledgerdetails
    WHERE $where
";

$summaryStmt = $conn->prepare($summarySql);

if (!$summaryStmt) {
    echo json_encode([
        "success" => false,
        "message" => "Summary prepare failed",
        "error" => $conn->error
    ]);
    $conn->close();
    exit();
}

bindDynamicParams(
    $summaryStmt,
    $types,
    $params
);

$summaryStmt->execute();

$summaryResult = $summaryStmt->get_result();

$summaryRow = $summaryResult->fetch_assoc();

$totalLeads = (int)($summaryRow["total"] ?? 0);

$summaryStmt->close();

/*
|--------------------------------------------------------------------------
| TODAY COUNT
|--------------------------------------------------------------------------
*/

$today = date("Y-m-d");

$todayWhere = "
    created_at >= ?
    AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
";

$todayParams = [
    $today,
    $today
];

$todayTypes = "ss";

if ($added_by !== "" && strtolower($added_by) !== "all") {
    $todayWhere .= " AND added_by = ?";
    $todayParams[] = $added_by;
    $todayTypes .= "s";
}

$todaySql = "
    SELECT COUNT(*) AS total
    FROM newpartyledgerdetails
    WHERE $todayWhere
";

$todayStmt = $conn->prepare($todaySql);

if (!$todayStmt) {
    echo json_encode([
        "success" => false,
        "message" => "Today query prepare failed",
        "error" => $conn->error
    ]);
    $conn->close();
    exit();
}

bindDynamicParams(
    $todayStmt,
    $todayTypes,
    $todayParams
);

$todayStmt->execute();

$todayResult = $todayStmt->get_result();
$todayRow = $todayResult->fetch_assoc();

$todayCount = (int)($todayRow["total"] ?? 0);

$todayStmt->close();

/*
|--------------------------------------------------------------------------
| THIS WEEK
|--------------------------------------------------------------------------
*/

$weekStart = date(
    "Y-m-d",
    strtotime("monday this week")
);

$weekEnd = date(
    "Y-m-d",
    strtotime("tomorrow")
);

$weekWhere = "
    created_at >= ?
    AND created_at < ?
";

$weekParams = [
    $weekStart,
    $weekEnd
];

$weekTypes = "ss";

if ($added_by !== "" && strtolower($added_by) !== "all") {
    $weekWhere .= " AND added_by = ?";
    $weekParams[] = $added_by;
    $weekTypes .= "s";
}

$weekSql = "
    SELECT COUNT(*) AS total
    FROM newpartyledgerdetails
    WHERE $weekWhere
";

$weekStmt = $conn->prepare($weekSql);

if (!$weekStmt) {
    echo json_encode([
        "success" => false,
        "message" => "Week query prepare failed",
        "error" => $conn->error
    ]);
    $conn->close();
    exit();
}

bindDynamicParams(
    $weekStmt,
    $weekTypes,
    $weekParams
);

$weekStmt->execute();

$weekResult = $weekStmt->get_result();
$weekRow = $weekResult->fetch_assoc();

$weekCount = (int)($weekRow["total"] ?? 0);

$weekStmt->close();

/*
|--------------------------------------------------------------------------
| THIS MONTH
|--------------------------------------------------------------------------
*/

$monthStart = date(
    "Y-m-01"
);

$monthEnd = date(
    "Y-m-d",
    strtotime("tomorrow")
);

$monthWhere = "
    created_at >= ?
    AND created_at < ?
";

$monthParams = [
    $monthStart,
    $monthEnd
];

$monthTypes = "ss";

if ($added_by !== "" && strtolower($added_by) !== "all") {
    $monthWhere .= " AND added_by = ?";
    $monthParams[] = $added_by;
    $monthTypes .= "s";
}

$monthSql = "
    SELECT COUNT(*) AS total
    FROM newpartyledgerdetails
    WHERE $monthWhere
";

$monthStmt = $conn->prepare($monthSql);

if (!$monthStmt) {
    echo json_encode([
        "success" => false,
        "message" => "Month query prepare failed",
        "error" => $conn->error
    ]);
    $conn->close();
    exit();
}

bindDynamicParams(
    $monthStmt,
    $monthTypes,
    $monthParams
);

$monthStmt->execute();

$monthResult = $monthStmt->get_result();
$monthRow = $monthResult->fetch_assoc();

$monthCount = (int)($monthRow["total"] ?? 0);

$monthStmt->close();

/*
|--------------------------------------------------------------------------
| STAFF CONTRIBUTION
|--------------------------------------------------------------------------
*/

$staffSql = "
    SELECT
        COALESCE(NULLIF(TRIM(added_by), ''), 'Unknown') AS added_by,
        COUNT(*) AS lead_count
    FROM newpartyledgerdetails
    WHERE $where
    GROUP BY COALESCE(NULLIF(TRIM(added_by), ''), 'Unknown')
    ORDER BY lead_count DESC, added_by ASC
";

$staffStmt = $conn->prepare($staffSql);

if (!$staffStmt) {
    echo json_encode([
        "success" => false,
        "message" => "Staff query prepare failed",
        "error" => $conn->error
    ]);
    $conn->close();
    exit();
}

bindDynamicParams(
    $staffStmt,
    $types,
    $params
);

$staffStmt->execute();

$staffResult = $staffStmt->get_result();

$staffContribution = [];

while ($row = $staffResult->fetch_assoc()) {
    $staffContribution[] = [
        "added_by" => $row["added_by"],
        "lead_count" => (int)$row["lead_count"]
    ];
}

$staffStmt->close();

/*
|--------------------------------------------------------------------------
| DAILY CONTRIBUTION
|--------------------------------------------------------------------------
*/

$dailySql = "
    SELECT
        DATE(created_at) AS date,
        COUNT(*) AS lead_count
    FROM newpartyledgerdetails
    WHERE $where
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) ASC
";

$dailyStmt = $conn->prepare($dailySql);

if (!$dailyStmt) {
    echo json_encode([
        "success" => false,
        "message" => "Daily query prepare failed",
        "error" => $conn->error
    ]);
    $conn->close();
    exit();
}

bindDynamicParams(
    $dailyStmt,
    $types,
    $params
);

$dailyStmt->execute();

$dailyResult = $dailyStmt->get_result();

$dailyContribution = [];

while ($row = $dailyResult->fetch_assoc()) {
    $dailyContribution[] = [
        "date" => $row["date"],
        "lead_count" => (int)$row["lead_count"]
    ];
}

$dailyStmt->close();

/*
|--------------------------------------------------------------------------
| DETAILED LEADS
|--------------------------------------------------------------------------
*/

$leadSql = "
    SELECT
        *
    FROM newpartyledgerdetails
    WHERE $where
    ORDER BY created_at DESC
";

$leadStmt = $conn->prepare($leadSql);

if (!$leadStmt) {
    echo json_encode([
        "success" => false,
        "message" => "Lead query prepare failed",
        "error" => $conn->error
    ]);
    $conn->close();
    exit();
}

bindDynamicParams(
    $leadStmt,
    $types,
    $params
);

$leadStmt->execute();

$leadResult = $leadStmt->get_result();

$leads = [];

while ($row = $leadResult->fetch_assoc()) {

    $leads[] = $row;
}

$leadStmt->close();

/*
|--------------------------------------------------------------------------
| Response
|--------------------------------------------------------------------------
*/

echo json_encode([
    "success" => true,

    "filters" => [
        "from_date" => $from_date,
        "to_date" => $to_date,
        "added_by" => $added_by
    ],

    "summary" => [
        "total" => $totalLeads,
        "today" => $todayCount,
        "week" => $weekCount,
        "month" => $monthCount
    ],

    "staff_contribution" => $staffContribution,

    "daily_contribution" => $dailyContribution,

    "leads" => $leads
]);

$conn->close();

?>