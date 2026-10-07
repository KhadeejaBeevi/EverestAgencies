<?php
require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/sales_site_visit_db.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

$customer_name = trim($_POST['customer_name'] ?? '');
$customer_category = trim($_POST['customer_category'] ?? '');
$phone = trim($_POST['phone'] ?? '');
$decision_maker = trim($_POST['decision_maker'] ?? '');
$site_name = trim($_POST['site_name'] ?? '');
$address = trim($_POST['address'] ?? '');
$requirement = trim($_POST['requirement'] ?? '');
$location = trim($_POST['location'] ?? '');
$latitude = $_POST['latitude'] ?? '';
$longitude = $_POST['longitude'] ?? '';
$location_accuracy = $_POST['location_accuracy'] ?? '';
$image = $_POST['image'] ?? '';
$followup_date = trim($_POST['followup_date'] ?? '');
$sales_executive = trim($_POST['sales_executive'] ?? '');
$sales_executive_uid = trim($_POST['sales_executive_uid'] ?? '');

if (
    $customer_name === '' ||
    $phone === '' ||
    $sales_executive === '' ||
    $image === '' ||
    !is_numeric($latitude) ||
    !is_numeric($longitude)
) {
    echo json_encode([
        "status" => "error",
        "message" => "Customer name, phone, site photo and location are required"
    ]);
    exit;
}

// ================= SAVE IMAGE =================

if (!preg_match('/^data:image\/(png|jpe?g);base64,/', $image, $match)) {
    echo json_encode(["status" => "error", "message" => "Invalid image"]);
    exit;
}

$imageBinary = base64_decode(substr($image, strpos($image, ",") + 1));

if ($imageBinary === false) {
    echo json_encode(["status" => "error", "message" => "Invalid image"]);
    exit;
}

$uploadDir = "uploads/sales_site_visits/";

if (!is_dir(__DIR__ . "/" . $uploadDir)) {
    mkdir(__DIR__ . "/" . $uploadDir, 0755, true);
}

$extension = $match[1] === "png" ? "png" : "jpg";
$imagePath = $uploadDir . uniqid("site_", true) . "." . $extension;

if (file_put_contents(__DIR__ . "/" . $imagePath, $imageBinary) === false) {
    echo json_encode(["status" => "error", "message" => "Could not save image"]);
    exit;
}

// ================= OLD / NEW CUSTOMER =================
// Decided here against the party master, not by the executive.

$matched_party = sales_site_visit_find_party($customer_name, $phone);
$customer_type = $matched_party ? "Old" : "New";

// ================= INSERT =================

$conn = sales_site_visit_conn();

$latitude = (float) $latitude;
$longitude = (float) $longitude;
$location_accuracy = is_numeric($location_accuracy) ? (int) round($location_accuracy) : null;
$followup_date = $followup_date !== '' ? $followup_date : null;

$stmt = $conn->prepare("
    INSERT INTO sales_site_visits
    (customer_type, matched_party, customer_name, customer_category, phone,
     decision_maker, site_name, address, requirement, location,
     latitude, longitude, location_accuracy, image, followup_date,
     sales_executive, sales_executive_uid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
");

$stmt->bind_param(
    "ssssssssssddissss",
    $customer_type,
    $matched_party,
    $customer_name,
    $customer_category,
    $phone,
    $decision_maker,
    $site_name,
    $address,
    $requirement,
    $location,
    $latitude,
    $longitude,
    $location_accuracy,
    $imagePath,
    $followup_date,
    $sales_executive,
    $sales_executive_uid
);

if (!$stmt->execute()) {
    echo json_encode(["status" => "error", "message" => "Could not save visit"]);
    exit;
}

$stmt->close();

// ================= NOTIFY ADMIN =================

$title = "Sales Site Visit Added";
$message = $sales_executive . " visited " . $customer_name . " (" . $customer_type . " customer)";
$target_role = "admin";

$notify = $conn->prepare("
    INSERT INTO notifications (title, message, target_role)
    VALUES (?, ?, ?)
");

if ($notify) {
    $notify->bind_param("sss", $title, $message, $target_role);
    $notify->execute();
    $notify->close();
}

echo json_encode([
    "status" => "success",
    "customer_type" => $customer_type,
    "matched_party" => $matched_party
]);

$conn->close();
