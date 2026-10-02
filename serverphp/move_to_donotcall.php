<?php
require_once __DIR__ . '/api_auth.php';
ini_set('display_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

// DB connection
$host = "localhost";
$user = "root";
$pass = "";
$dbname = "salescollection";

$conn = new mysqli($host, $user, $pass, $dbname);
if ($conn->connect_error) {
    echo json_encode(["error" => $conn->connect_error]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

$partyLedger = trim($data["partyLedger"] ?? "");
$username    = trim($data["username"] ?? "");
$note        = trim($data["note"] ?? "");
$removedDate = date("Y-m-d"); // today

// ✅ Validation
if ($partyLedger === "") {
    echo json_encode(["error" => "partyLedger cannot be empty"]);
    exit;
}

// 1. Just insert a record into do_not_call_list (acts like a log)
$stmt = $conn->prepare("
    INSERT INTO do_not_call_list (partyLedger, username, note, removedDate) 
    VALUES (?, ?, ?, ?)
");
$stmt->bind_param("ssss", $partyLedger, $username, $note, $removedDate);

if ($stmt->execute()) {
    echo json_encode(["success" => true]);
} else {
    echo json_encode(["error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
