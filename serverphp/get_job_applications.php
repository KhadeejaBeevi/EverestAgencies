<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die(json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]));
}

$sql = "SELECT * FROM job_applications ORDER BY id DESC";
$result = $conn->query($sql);

$data = [];

while ($row = $result->fetch_assoc()) {

    $data[] = [
        "id" => $row["id"],
        "fullName" => $row["full_name"],
        "address" => $row["address"],
        "residenceCity" => $row["residence_city"],
        "mobileNumber" => $row["mobile_number"],
        "appliedFor" => $row["applied_for"],
        "resume" => $row["resume"],
        "photo" => $row["photo"],
        "emailAddress" => $row["email_address"],
        "age" => $row["age"],
        "totalWorkExperience" => $row["total_work_experience"],
        "currentlyWorking" => $row["currently_working"],
        "lastDrawnSalary" => $row["last_drawn_salary"],
        "expectedSalary" => $row["expected_salary"],
        "ctcSalary" => $row["ctc_salary"],
        "drivingLicense" => $row["driving_license"],
        "licenseTypes" => $row["license_types"],
        "ownBike" => $row["own_bike"],
        "maritalStatus" => $row["marital_status"],
        "selectionStatus" => $row["selection_status"],
        "joiningDate" => $row["joining_date"],
        "fixedSalary" => $row["fixed_salary"],
        "remarks" => $row["remarks"]
    ];
}

echo json_encode([
    "status" => "success",
    "data" => $data
]);

$conn->close();

?>