<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// DB
$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);


if ($conn->connect_error) {

    die(json_encode([
        "success" => false,
        "error" => $conn->connect_error
    ]));
}

// JSON DATA
$data = json_decode(
    file_get_contents("php://input"),
    true
);

// CHECK
if (!$data) {

    echo json_encode([
        "success" => false,
        "message" => "No data received"
    ]);

    exit;
}

// VALUES
$userId = $data['userId'] ?? '';

$user_name = $data['user_name'] ?? '';

$type = $data['type'] ?? '';

$latitude = $data['latitude'] ?? null;

$longitude = $data['longitude'] ?? null;

$location_text = $data['location_text'] ?? '';

$time = $data['time'] ?? '';

// SQL
$sql = "INSERT INTO attendance
(
    user_id,
    user_name,
    type,
    latitude,
    longitude,
    location_text,
    check_time
)

VALUES (?, ?, ?, ?, ?, ?, ?)";

$stmt = $conn->prepare($sql);

$stmt->bind_param(
    "sssddss",

    $userId,

    $user_name,

    $type,

    $latitude,

    $longitude,

    $location_text,

    $time
);

// EXECUTE
if ($stmt->execute()) {

    echo json_encode([
        "success" => true
    ]);

} else {

    echo json_encode([
        "success" => false,
        "error" => $stmt->error
    ]);
}
$title = $type == "CHECK_IN"
    ? "Check In"
    : "Check Out";

$message = $user_name . " " .
    ($type == "CHECK_IN"
        ? "checked in"
        : "checked out");

$conn->query("
    INSERT INTO notifications
    (title, message, target_role)
    VALUES
    ('$title', '$message', 'SalesCoordinator')
");
?>
