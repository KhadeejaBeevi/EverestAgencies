<?php
require_once __DIR__ . '/api_auth.php';
// =========================================
// CORS HEADERS
// =========================================

header("Access-Control-Allow-Origin: *");

header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

header("Access-Control-Allow-Headers: Content-Type");

// =========================================
// HANDLE PREFLIGHT
// =========================================

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {

    http_response_code(200);
    exit();
}

// =========================================
// JSON
// =========================================

header("Content-Type: application/json");

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {

    die(json_encode([
        "status" => "error",
        "message" => "Database connection failed"
    ]));
}

// =========================================
// GET METHOD
// =========================================

$method = $_SERVER['REQUEST_METHOD'];

// =========================================
// ADD PLAN
// =========================================

if ($method === "POST") {

    $data = json_decode(
        file_get_contents("php://input"),
        true
    );

    $executive = $data['executive'] ?? '';
    $travel_date = $data['travel_date'] ?? '';
    $customer = $data['customer'] ?? '';
    $location = $data['location'] ?? '';
    $purpose = $data['purpose'] ?? '';

    if (
        empty($executive) ||
        empty($travel_date) ||
        empty($customer)
    ) {

        echo json_encode([
            "status" => "error",
            "message" => "Missing required fields"
        ]);

        exit;
    }

    // =========================================
    // GET NEXT ORDER
    // =========================================

    $orderQuery = $conn->prepare(
        "SELECT MAX(plan_order) AS max_order
         FROM travel_plans
         WHERE executive = ?
         AND travel_date = ?"
    );

    $orderQuery->bind_param(
        "ss",
        $executive,
        $travel_date
    );

    $orderQuery->execute();

    $orderResult = $orderQuery->get_result();

    $row = $orderResult->fetch_assoc();

    $nextOrder = ($row['max_order'] ?? 0) + 1;

    // =========================================
    // INSERT
    // =========================================

    $stmt = $conn->prepare(
        "INSERT INTO travel_plans (
            executive,
            travel_date,
            customer,
            location_name,
            purpose,
            completed,
            plan_order,
            created_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, NOW())"
    );

    $stmt->bind_param(
        "sssssi",
        $executive,
        $travel_date,
        $customer,
        $location,
        $purpose,
        $nextOrder
    );

    if ($stmt->execute()) {

        echo json_encode([
            "status" => "success",
            "message" => "Travel plan added"
        ]);

    } else {

        echo json_encode([
            "status" => "error",
            "message" => "Insert failed"
        ]);
    }

    $stmt->close();
}

// =========================================
// FETCH PLANS
// =========================================

elseif ($method === "GET") {

    $executive = $_GET['executive'] ?? '';
    $travel_date = $_GET['travel_date'] ?? '';

    if (
        empty($executive) ||
        empty($travel_date)
    ) {

        echo json_encode([
            "status" => "error",
            "message" => "Executive and date required"
        ]);

        exit;
    }

    $stmt = $conn->prepare(
        "SELECT *
         FROM travel_plans
         WHERE executive = ?
         AND travel_date = ?
         ORDER BY plan_order ASC"
    );

    $stmt->bind_param(
        "ss",
        $executive,
        $travel_date
    );

    $stmt->execute();

    $result = $stmt->get_result();

    $plans = [];

    while ($row = $result->fetch_assoc()) {

        $plans[] = $row;
    }

    echo json_encode([
        "status" => "success",
        "data" => $plans
    ]);

    $stmt->close();
}

// =========================================
// UPDATE STATUS
// =========================================

elseif ($method === "PUT") {

    $data = json_decode(
        file_get_contents("php://input"),
        true
    );

    $id = $data['id'] ?? '';
    $completed = $data['completed'] ?? 0;

    $stmt = $conn->prepare(
        "UPDATE travel_plans
         SET completed = ?
         WHERE id = ?"
    );

    $stmt->bind_param(
        "ii",
        $completed,
        $id
    );

    if ($stmt->execute()) {

        echo json_encode([
            "status" => "success",
            "message" => "Status updated"
        ]);

    } else {

        echo json_encode([
            "status" => "error",
            "message" => "Update failed"
        ]);
    }

    $stmt->close();
}

// =========================================
// DELETE PLAN
// =========================================

elseif ($method === "DELETE") {

    parse_str(
        $_SERVER['QUERY_STRING'],
        $params
    );

    $id = $params['id'] ?? '';

    $stmt = $conn->prepare(
        "DELETE FROM travel_plans
         WHERE id = ?"
    );

    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {

        echo json_encode([
            "status" => "success",
            "message" => "Deleted successfully"
        ]);

    } else {

        echo json_encode([
            "status" => "error",
            "message" => "Delete failed"
        ]);
    }

    $stmt->close();
}

// =========================================
// INVALID METHOD
// =========================================

else {

    echo json_encode([
        "status" => "error",
        "message" => "Invalid request"
    ]);
}

// =========================================
// CLOSE
// =========================================

$conn->close();

?>