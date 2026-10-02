<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json");

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

$data = json_decode(
    file_get_contents("php://input"),
    true
);

$lead_id = $data['lead_id'];
$note = $data['note'];
$added_by = $data['added_by'];
$note_date = $data['note_date'];
$followup_date = $data['followup_date'] ?? null;
$followup_time = $data['followup_time'] ?? null;
$call_status = $data['call_status'];

$stmt = $conn->prepare(
    "INSERT INTO solar_lead_notes
    (
      lead_id,
      note,
      added_by,
      note_date,
      followup_date,
      followup_time,
      call_status
    )
    VALUES (?, ?, ?, ? , ? , ? , ?)"
);

$stmt->bind_param(
    "issssss",
    $lead_id,
    $note,
    $added_by,
    $note_date,
    $followup_date,
    $followup_time,
    $call_status
);

if ($stmt->execute()) {
// Get current lead type
$getLead = $conn->query(
    "SELECT lead_type
     FROM solar_new_leads
     WHERE id = '$lead_id'"
);

$leadRow = $getLead->fetch_assoc();

$newLeadType = $leadRow['lead_type'];

if ($newLeadType === "New Lead") {
    $newLeadType = "Contacted Lead";
}
elseif ($newLeadType === "Old Lead") {
    $newLeadType = "Contacted Lead (Old)";
}

$update = $conn->prepare(
    "UPDATE solar_new_leads
     SET followup_date = ?,
         followup_time = ?,
         call_status = ?,
         lead_type = ?
     WHERE id = ?"
);

$update->bind_param(
    "ssssi",
    $followup_date,
    $followup_time,
    $call_status,
    $newLeadType,
    $lead_id
);

$update->execute();


    echo json_encode([
        "success" => true,
        "id" => $conn->insert_id
    ]);
} else {

    echo json_encode([
        "success" => false
    ]);
}
