<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

// Read JSON input (party names from frontend)
$input = json_decode(file_get_contents("php://input"), true);
$filterParties = $input['parties'] ?? [];
$range = $input['range'] ?? "";
$group = $input['group'] ?? "";

// Base WHERE clauses
$whereClauses = [];

// Filter only selected parties if provided
if (!empty($filterParties)) {
    $escapedParties = array_map(function($p) use ($conn) {
        return "'" . $conn->real_escape_string($p) . "'";
    }, $filterParties);
    $whereClauses[] = "PartyLedgerName IN (" . implode(",", $escapedParties) . ")";
}
if (!empty($group)) {

    if ($group === "Unknown Group") {
        $whereClauses[] = "(_LedGroup IS NULL OR TRIM(_LedGroup) = '')";
    } else {
        $whereClauses[] = "_LedGroup='" . $conn->real_escape_string($group) . "'";
    }

}
switch ($range) {

    case "Lost Clients":
    case "Below 0.0":
        $whereClauses[] = "CAST(percentage AS DECIMAL(10,6)) <= 0";
        break;

    case "0.00 - 0.10":
        $whereClauses[] = "CAST(percentage AS DECIMAL(10,6)) > 0
                           AND CAST(percentage AS DECIMAL(10,6)) < 0.10";
        break;

    case "0.10 - 1.00":
        $whereClauses[] = "CAST(percentage AS DECIMAL(10,6)) >= 0.10
                           AND CAST(percentage AS DECIMAL(10,6)) < 1.00";
        break;

    case "Above 1.0":
        $whereClauses[] = "CAST(percentage AS DECIMAL(10,6)) >= 1.00";
        break;
}
// Exclude blocked shops
{/*$whereClauses[] = "NOT EXISTS (
    SELECT 1 
    FROM localshoplist l 
    WHERE PartyLedgerName LIKE CONCAT('%', l.shop_name, '%')
)";

// Exclude parties in Do Not Call / Call Later / Sorry Call lists
$whereClauses[] = "PartyLedgerName NOT IN (SELECT PartyLedgerName FROM do_not_call_list)";
$whereClauses[] = "PartyLedgerName NOT IN (SELECT PartyLedgerName FROM call_later)";
$whereClauses[] = "PartyLedgerName NOT IN (SELECT PartyLedgerName FROM sorry_call)";
$whereClauses[] = "LedgerPrimaryGroup = 'Sundry Debtors'";

// Combine all WHERE conditions
$whereClause = "";
if (!empty($whereClauses)) {
    $whereClause = "WHERE " . implode(" AND ", $whereClauses);
}
*/}
// ✅ Added `email` in SELECT and GROUP BY


$whereClause = "";

if (!empty($whereClauses)) {
    $whereClause = "WHERE " . implode(" AND ", $whereClauses);
}
$sql = "
SELECT 
  PartyLedgerName,
  LedgerPrimaryGroup,
  _LedGroup,
  _GSTRegistrationType,
  _PartyGSTIN,
  fullyUpdated,
  rating,
  mobile,
  purchase_contact,
  email,

  ROUND(SUM(Apr), 2) AS Apr,
  ROUND(SUM(May), 2) AS May,
  ROUND(SUM(Jun), 2) AS Jun,
  ROUND(SUM(Jul), 2) AS Jul,
  ROUND(SUM(Aug), 2) AS Aug,
  ROUND(SUM(Sep), 2) AS Sep,
  ROUND(SUM(Oct), 2) AS Oct,
  ROUND(SUM(Nov), 2) AS Nov,
  ROUND(SUM(`Dec`), 2) AS `Dec`,
  ROUND(SUM(`Jan`), 2) AS `Jan`,
  ROUND(SUM(`Feb`), 2) AS `Feb`,
  ROUND(SUM(`Mar`), 2) AS `Mar`,

  ROUND(SUM(total_amount), 2) AS total_amount,
  ROUND(AVG(percentage), 6) AS percentage

FROM sales_summary_table4
$whereClause

GROUP BY
  PartyLedgerName,
  LedgerPrimaryGroup,
  _LedGroup,
  _GSTRegistrationType,
  _PartyGSTIN,
  fullyUpdated,
  rating,
  mobile,
  purchase_contact,
  email


ORDER BY percentage DESC;
";

$result = $conn->query($sql);

$data = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $data[] = $row;
    }
}

echo json_encode($data);
$conn->close();
?>
