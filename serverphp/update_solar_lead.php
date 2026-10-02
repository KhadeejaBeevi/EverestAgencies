<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

$data = json_decode(file_get_contents("php://input"), true);

$id = $data['id'];

$company_name = $data['company_name'];
$address = $data['address'];
$decision_maker = $data['decision_maker'];
$contact_no = $data['contact_no'];
$group_name = $data['group_name'];
$sales_coordinator = $data['sales_coordinator'];
$field_executive = $data['field_executive'];
$lead_type = $data['lead_type'];

$sql = "UPDATE solar_new_leads SET
company_name='$company_name',
address='$address',
decision_maker='$decision_maker',
contact_no='$contact_no',
group_name='$group_name',
sales_coordinator='$sales_coordinator',
field_executive='$field_executive',
lead_type='$lead_type'
WHERE id='$id'";

if ($conn->query($sql) === TRUE) {

    echo json_encode([
        "success" => true
    ]);

} else {

    echo json_encode([
        "success" => false
    ]);

}

$conn->close();

?>