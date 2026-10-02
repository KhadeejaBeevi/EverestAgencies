<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// DB connection
$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

// Updated query with JOIN to get group_name from newpartyledgerdetails
$sql = "SELECT 
            n.id, 
            n.username, 
            n.note, 
            n.partyLedger, 
            DATE_FORMAT(n.date, '%d-%m-%Y') as date,
            DATE_FORMAT(n.followUpDate, '%d-%m-%Y') as followUpDate,
            n.followUpStatus,
            npd.group_name
        FROM notes n
        LEFT JOIN newpartyledgerdetails npd ON n.partyLedger = npd.party_ledger_name
        ORDER BY STR_TO_DATE(n.date, '%d-%m-%Y') DESC";

$result = $conn->query($sql);

$notes = [];
while ($row = $result->fetch_assoc()) {
    $notes[] = $row;
}

echo json_encode($notes);
$conn->close();
?>