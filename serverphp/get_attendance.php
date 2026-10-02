<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "error" => "Database connection failed"
    ]);
    exit;
}

$date = $_GET['date'] ?? date('Y-m-d');
$role = $_GET['role'] ?? 'user';
$user_id = $_GET['user_id'] ?? '';
$distribution = $_GET['distribution'] ?? '';

$data = [];

try {

    /*
    =====================================
    ADMIN → SHOW ALL ATTENDANCE
    =====================================
    */

    if ($role === "admin") {

        $sql = "
            SELECT *
            FROM attendance
            WHERE DATE(check_time) = ?
            ORDER BY check_time DESC
        ";

        $stmt = $conn->prepare($sql);

        if (!$stmt) {
            throw new Exception($conn->error);
        }

        $stmt->bind_param("s", $date);
    }

    /*
    =====================================
    SALES COORDINATOR
    =====================================
    */

    elseif ($role === "SalesCoordinator") {

        /*
        Distribution filtering cannot be done here
        because MySQL attendance table does not contain
        distribution.

        React will filter after fetching OR
        distribution must be saved in attendance table.
        */

        $sql = "
            SELECT *
            FROM attendance
            WHERE DATE(check_time) = ?
            ORDER BY check_time DESC
        ";

        $stmt = $conn->prepare($sql);

        if (!$stmt) {
            throw new Exception($conn->error);
        }

        $stmt->bind_param("s", $date);
    }

    /*
    =====================================
    NORMAL USER
    =====================================
    */

    else {

        $sql = "
            SELECT *
            FROM attendance
            WHERE DATE(check_time) = ?
            AND user_id = ?
            ORDER BY check_time DESC
        ";

        $stmt = $conn->prepare($sql);

        if (!$stmt) {
            throw new Exception($conn->error);
        }

        $stmt->bind_param("ss", $date, $user_id);
    }

    if (!$stmt->execute()) {
        throw new Exception($stmt->error);
    }

    $result = $stmt->get_result();

    while ($row = $result->fetch_assoc()) {
        $data[] = $row;
    }

    echo json_encode([
        "success" => true,
        "data" => $data
    ]);

} catch (Exception $e) {

    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}

$conn->close();

?>