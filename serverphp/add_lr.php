<?php
require_once __DIR__ . '/api_auth.php';
header("Content-Type: application/json");

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: *");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {

    echo json_encode([
        "status" => "error",
        "message" => "DB connection failed"
    ]);

    exit();
}

$lr_todaydate     = $_POST['date'] ?? '';
$transporter_name = $_POST['transporterName'] ?? '';
$lr_type          = $_POST['lrType'] ?? '';
$lr_date          = $_POST['lrdate'] ?? '';
$party_name       = $_POST['partyName'] ?? '';
$destination      = $_POST['destination'] ?? '';
$driver_name      = $_POST['driverName'] ?? '';
$delivery_terms   = $_POST['deliveryTerms'] ?? '';
$payment_status   = $_POST['paymentStatus'] ?? '';

$lr_image_path = "";
$bill_image_path = "";

// ================= LR IMAGE =================

if (isset($_FILES['lrImage'])) {

    $targetDir = "uploads/lr/";

    if (!file_exists($targetDir)) {
        mkdir($targetDir, 0777, true);
    }

    $fileName = time() . "_" . basename($_FILES["lrImage"]["name"]);

    $targetFile = $targetDir . $fileName;

    if (move_uploaded_file($_FILES["lrImage"]["tmp_name"], $targetFile)) {

        $lr_image_path = $targetFile;
    }
}

// ================= BILL IMAGE =================

if (isset($_FILES['billImage'])) {

    $targetDir = "uploads/bill/";

    if (!file_exists($targetDir)) {
        mkdir($targetDir, 0777, true);
    }

    $fileName = time() . "_" . basename($_FILES["billImage"]["name"]);

    $targetFile = $targetDir . $fileName;

    if (move_uploaded_file($_FILES["billImage"]["tmp_name"], $targetFile)) {

        $bill_image_path = $targetFile;
    }
}

// ================= INSERT =================

$sql = "INSERT INTO lorry_receipts
(
    lr_todaydate,
    transporter_name,
    lr_type,
    lr_date,
    party_name,
    destination,
    driver_name,
    delivery_terms,
    payment_status,
    bill_image,
    lr_image
)

VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

$stmt = $conn->prepare($sql);

$stmt->bind_param(
    "sssssssssss",
    $lr_todaydate,
    $transporter_name,
    $lr_type,
    $lr_date,
    $party_name,
    $destination,
    $driver_name,
    $delivery_terms,
    $payment_status,
    $bill_image_path,
    $lr_image_path
);

if ($stmt->execute()) {

    echo json_encode([
        "status" => "success"
    ]);

} else {

    echo json_encode([
        "status" => "error",
        "message" => $stmt->error
    ]);
}

$stmt->close();
$conn->close();

?>