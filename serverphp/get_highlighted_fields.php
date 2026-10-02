<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// DB connection
$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    echo json_encode(["success" => false, "error" => "Connection failed"]);
    exit;
}

// Get all edited fields grouped by party
$sql = "SELECT party_name, field_name FROM edited_fields";
$result = $conn->query($sql);

$highlighted = [];

if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        $party = $row['party_name'];
        $field = $row['field_name'];
        if (!isset($highlighted[$party])) {
            $highlighted[$party] = [];
        }
        $highlighted[$party][] = $field;
    }
}

echo json_encode(["success" => true, "highlightedFields" => $highlighted]);

$conn->close();
?>
