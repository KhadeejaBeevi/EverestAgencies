<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// DB connection
$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

// Updated query to include followUpStatus and format dates as DD-MM-YYYY
$sql = "SELECT 
            id, 
            username, 
            note, 
            partyLedger, 
            DATE_FORMAT(date, '%d-%m-%Y') as date,
            DATE_FORMAT(followUpDate, '%d-%m-%Y') as followUpDate,
            followUpStatus,
            enquired
        FROM notes
        WHERE enquired = 'Yes'
        ORDER BY STR_TO_DATE(date, '%d-%m-%Y') DESC";


$result = $conn->query($sql);

$notes = [];
while ($row = $result->fetch_assoc()) {
    $notes[] = $row;
}

echo json_encode($notes);
$conn->close();
