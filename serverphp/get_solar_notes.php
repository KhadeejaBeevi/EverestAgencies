<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

$lead_id = $_GET['lead_id'];

$sql = "
SELECT *
FROM solar_lead_notes
WHERE lead_id='$lead_id'
ORDER BY id DESC
";

$result = $conn->query($sql);

$notes = [];

while($row = $result->fetch_assoc()) {

    $notes[] = $row;

}

echo json_encode($notes);

?>