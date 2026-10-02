<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost","root","","tally_db");

if($conn->connect_error){
    die(json_encode([
        "status"=>"error",
        "message"=>$conn->connect_error
    ]));
}

$uploadDir = "uploads/jobapplications/";

if(!file_exists($uploadDir)){
    mkdir($uploadDir,0777,true);
}

$resumePath = "";
$photoPath = "";

/* Resume Upload */

if(isset($_FILES["resume"])){

    $resumeName = time()."_".basename($_FILES["resume"]["name"]);
    $resumePath = $uploadDir.$resumeName;

    move_uploaded_file(
        $_FILES["resume"]["tmp_name"],
        $resumePath
    );
}

/* Photo Upload */

if(isset($_FILES["photo"])){

    $photoName = time()."_".basename($_FILES["photo"]["name"]);
    $photoPath = $uploadDir.$photoName;

    move_uploaded_file(
        $_FILES["photo"]["tmp_name"],
        $photoPath
    );
}

$stmt = $conn->prepare("
INSERT INTO job_applications
(
full_name,
address,
residence_city,
mobile_number,
applied_for,
email_address,
age,
total_work_experience,
currently_working,
last_drawn_salary,
expected_salary,
ctc_salary,
driving_license,
license_types,
own_bike,
marital_status,
resume,
photo
)
VALUES
(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
");

$stmt->bind_param(
"ssssssissdddssssss",

$_POST["fullName"],
$_POST["address"],
$_POST["residenceCity"],
$_POST["mobileNumber"],
$_POST["appliedFor"],
$_POST["emailAddress"],
$_POST["age"],
$_POST["totalWorkExperience"],
$_POST["currentlyWorking"],
$_POST["lastDrawnSalary"],
$_POST["expectedSalary"],
$_POST["ctcSalary"],
$_POST["drivingLicense"],
$_POST["licenseTypes"],
$_POST["ownBike"],
$_POST["maritalStatus"],
$resumePath,
$photoPath
);

if($stmt->execute()){

    echo json_encode([
        "status"=>"success",
        "message"=>"Application Submitted"
    ]);

}else{

    echo json_encode([
        "status"=>"error",
        "message"=>$stmt->error
    ]);

}

$stmt->close();
$conn->close();

?>