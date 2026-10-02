<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

$data = json_decode(file_get_contents("php://input"), true);

$company_name = $data['company_name'];
$address = $data['address'];
$decision_maker = $data['decision_maker'];
$contact_no = $data['contact_no'];
$group_name = $data['group_name'];
$sales_coordinator = $data['sales_coordinator'];
$field_executive = $data['field_executive'];
$lead_type = $data['lead_type'];
$sql = "INSERT INTO solar_new_leads
(
company_name,
address,
decision_maker,
contact_no,
group_name,
sales_coordinator,
field_executive,
lead_type
)

VALUES
(
'$company_name',
'$address',
'$decision_maker',
'$contact_no',
'$group_name',
'$sales_coordinator',
'$field_executive',
'$lead_type'
)";

if ($conn->query($sql)) {

    echo json_encode([
        "success" => true,
        "id" => $conn->insert_id
    ]);

} else {

    echo json_encode([
        "success" => false
    ]);

}

?>