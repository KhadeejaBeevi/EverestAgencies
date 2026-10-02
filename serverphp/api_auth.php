<?php

// Stop PHP warnings/notices from being returned as JSON
error_reporting(E_ALL);
ini_set('display_errors', 0);

// CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, X-API-Key");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

// Handle browser preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}




$host = "localhost";
$dbname = "tally_db";
$username = "root";
$password = "";

try {

    $pdo = new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );

} catch (PDOException $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]);

    exit;
}




$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';




if (empty($apiKey)) {

    http_response_code(401);

    echo json_encode([
        "success" => false,
        "message" => "API key is required"
    ]);

    exit;
}




$stmt = $pdo->prepare("
    SELECT id, name, is_active, expires_at
    FROM api_keys
    WHERE api_key = :api_key
    LIMIT 1
");

$stmt->execute([
    ':api_key' => $apiKey
]);

$keyData = $stmt->fetch();




if (!$keyData) {

    http_response_code(401);

    echo json_encode([
        "success" => false,
        "message" => "Invalid API key"
    ]);

    exit;
}



if ((int)$keyData['is_active'] !== 1) {

    http_response_code(403);

    echo json_encode([
        "success" => false,
        "message" => "API key is disabled"
    ]);

    exit;
}




if (
    !empty($keyData['expires_at']) &&
    strtotime($keyData['expires_at']) < time()
) {

    http_response_code(403);

    echo json_encode([
        "success" => false,
        "message" => "API key has expired"
    ]);

    exit;
}




?>