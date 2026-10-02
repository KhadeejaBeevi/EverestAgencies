<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$customer_name = $_POST['customer_name'];
$phone = $_POST['phone'];
$decision_maker = $_POST['decision_maker'];
$address = $_POST['address'];
$sales_executive = $_POST['sales_executive'];
$location = $_POST['location'];
$image = $_POST['image'];
$followup_date = $_POST['followup_date'];

$imageName = time() . ".png";

$imagePath = "uploads/" . $imageName;

$imageData = explode(",", $image);
$imageBase64 = base64_decode($imageData[1]);

file_put_contents($imagePath, $imageBase64);

$sql = "INSERT INTO site_visits 
(customer_name, phone,decision_maker,address,sales_executive, location, image,followup_date)
VALUES (?, ?, ?, ?,?,?,?,?)";

$stmt = $conn->prepare($sql);

$stmt->bind_param(
    "ssssssss",
    $customer_name,
    $phone,
    $decision_maker,
    $address,
    $sales_executive,
    $location,
    $imagePath,
    $followup_date
);

if ($stmt->execute()) {
    echo json_encode([
        "status" => "success"
    ]);
} else {
    echo json_encode([
        "status" => "error"
    ]);
}
$title = "Site Visit Added";

$message = $sales_executive . " added a new site visit for " . $customer_name;

$target_role = "SalesCoordinator";

$conn->query("
    INSERT INTO notifications
    (title, message, target_role)
    VALUES
    ('$title', '$message', '$target_role')
");
$conn->close();

?>