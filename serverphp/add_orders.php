<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

$order_date = $_POST['date'];
$party_name = $_POST['party'];
$salesman = $_POST['salesman'];
$status = $_POST['status'];
$narration = $_POST['narration'];

$uploadDir = __DIR__ . "/uploads/";
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

$po_image_url = null;

if (isset($_FILES['poImage'])) {
    $fileName = time() . "_" . $_FILES['poImage']['name'];
    $target = $uploadDir . $fileName;

    move_uploaded_file($_FILES['poImage']['tmp_name'], $target);

    $po_image_url = "http://localhost/everest/serverphp/uploads/" . $fileName;
}

$stmt = $conn->prepare("INSERT INTO sales_orders 
(order_date, party_name, salesman, status, narration, po_image_url) 
VALUES (?, ?, ?, ?, ?, ?)");

$stmt->bind_param("ssssss", $order_date, $party_name, $salesman, $status, $narration, $po_image_url);

$stmt->execute();

echo json_encode(["status" => "success"]);
?>