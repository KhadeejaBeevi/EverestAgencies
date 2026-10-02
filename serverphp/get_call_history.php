<?php
require_once __DIR__ . '/api_auth.php';
include "db.php";

$kseb_id = $_GET['kseb_id'];

$sql = "SELECT * FROM call_history 
        WHERE kseb_id='$kseb_id'
        ORDER BY id DESC";

$result = mysqli_query($conn, $sql);

$data = [];

while($row = mysqli_fetch_assoc($result)){
    $data[] = $row;
}

echo json_encode([
    "status" => "success",
    "data" => $data
]);
?>
