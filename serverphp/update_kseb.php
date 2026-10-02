<?php
require_once __DIR__ . '/api_auth.php';
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

if (!$data || !isset($data['id'])) {
    echo json_encode([
        "status" => "error",
        "message" => "Invalid data"
    ]);
    exit;
}

$id = (int)$data['id'];


// =====================================================
// GET EXISTING KSEB RECORD
// =====================================================

$stmt = $conn->prepare("
    SELECT NAME, tally_name
    FROM kseb_directory
    WHERE id = ?
");

$stmt->bind_param("i", $id);
$stmt->execute();

$result = $stmt->get_result();
$oldRow = $result->fetch_assoc();

if (!$oldRow) {
    echo json_encode([
        "status" => "error",
        "message" => "KSEB record not found"
    ]);
    exit;
}

$oldTallyName = trim($oldRow['tally_name'] ?? '');

$newTallyName = trim($data['tally_name'] ?? '');


// =====================================================
// TALLY NAME VALIDATION
// =====================================================

// If a Tally Name is already assigned,
// it CANNOT be changed.
if ($oldTallyName !== '') {

    if (
        $newTallyName !== '' &&
        $newTallyName !== $oldTallyName
    ) {
        echo json_encode([
            "status" => "error",
            "message" => "Tally Name is already assigned and cannot be changed."
        ]);
        exit;
    }

    // Keep the original value
    $newTallyName = $oldTallyName;
}


// =====================================================
// IF THIS IS A NEW TALLY ASSIGNMENT,
// CHECK WHETHER IT IS ALREADY USED
// =====================================================

if ($oldTallyName === '' && $newTallyName !== '') {

    $duplicateStmt = $conn->prepare("
        SELECT id, PLACE
        FROM kseb_directory
        WHERE tally_name = ?
          AND id <> ?
        LIMIT 1
    ");

    $duplicateStmt->bind_param(
        "si",
        $newTallyName,
        $id
    );

    $duplicateStmt->execute();

    $duplicateResult = $duplicateStmt->get_result();

    if ($duplicateResult->num_rows > 0) {

        $duplicateRow = $duplicateResult->fetch_assoc();

        echo json_encode([
            "status" => "error",
            "message" => "This Tally Name is already assigned to another KSEB card: " .
                         $duplicateRow['PLACE']
        ]);

        exit;
    }
}


// =====================================================
// CHECK DECISION MAKER NAME CHANGE
// =====================================================

$decisionMakerDate = null;

if (
    trim($oldRow['NAME'] ?? '') !==
    trim($data['NAME'] ?? '')
) {
    $decisionMakerDate = date("Y-m-d H:i:s");
}


// =====================================================
// UPDATE
// =====================================================

$sql = "
UPDATE kseb_directory SET

    NAME=?,
    DECISION_MAKER_DESIGNATION=?,
    DEPUTY_CHIEF_ENGINEER_OFF_PER=?,
    EXECUTIVE_ENGINEER=?,
    ASSISTANT_EXECUTIVE_ENGINEER=?,
    ASSISTANT_ENGINEER=?,
    SUB_REGIONAL_STORE=?,
    SRS_ASSISTANT_EXECUTIVE_ENGINEER=?,
    MAIL_ID=?,
    tally_name=?,

    decision_maker_updated_at =
        CASE
            WHEN ? IS NOT NULL
            THEN ?
            ELSE decision_maker_updated_at
        END

WHERE id=?
";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    echo json_encode([
        "status" => "error",
        "message" => $conn->error
    ]);
    exit;
}

$stmt->bind_param(
    "ssssssssssssi",
    $data['NAME'],
    $data['DECISION_MAKER_DESIGNATION'],
    $data['DEPUTY_CHIEF_ENGINEER_OFF_PER'],
    $data['EXECUTIVE_ENGINEER'],
    $data['ASSISTANT_EXECUTIVE_ENGINEER'],
    $data['ASSISTANT_ENGINEER'],
    $data['SUB_REGIONAL_STORE'],
    $data['SRS_ASSISTANT_EXECUTIVE_ENGINEER'],
    $data['MAIL_ID'],
    $newTallyName,
    $decisionMakerDate,
    $decisionMakerDate,
    $id
);


if ($stmt->execute()) {

    echo json_encode([
        "status" => "success",
        "tally_name" => $newTallyName
    ]);

} else {

    echo json_encode([
        "status" => "error",
        "message" => $stmt->error
    ]);
}

$conn->close();
?>