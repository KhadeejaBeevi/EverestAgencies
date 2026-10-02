<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
header("Access-Control-Allow-Headers: Content-Type");

// DB connection
$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

// Get JSON input
$data = json_decode(file_get_contents("php://input"), true);

$result = $conn->query("SELECT shop_name FROM localshoplist");
$shops = [];

while ($row = $result->fetch_assoc()) {
    $shops[] = $row["shop_name"];
}

echo json_encode($shops);
$conn->close();
?>
