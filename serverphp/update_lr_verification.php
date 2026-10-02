<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: *");
header("Content-Type: application/json");

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {

    echo json_encode([
        "status" => "error",
        "message" => "DB failed"
    ]);

    exit();
}

$data = json_decode(
    file_get_contents("php://input"),
    true
);

$id = $data['id'];

$verificationStatus =
$data['verificationStatus'];

$verifiedBy =
$data['verifiedBy'];


// CHECK ALREADY VERIFIED
$checkSql = "
SELECT verification_status
FROM lorry_receipts
WHERE id='$id'
";

$checkResult =
mysqli_query($conn, $checkSql);

$row =
mysqli_fetch_assoc($checkResult);

if (
    $row['verification_status']
    === "Verified"
) {

    echo json_encode([
        "status" => "locked",
        "message" =>
        "Already verified"
    ]);

    exit();
}


// UPDATE ONLY IF NOT VERIFIED
$sql = "
UPDATE lorry_receipts
SET
verification_status='$verificationStatus',
verified_by='$verifiedBy'
WHERE id='$id'
";

if (mysqli_query($conn, $sql)) {

    echo json_encode([
        "status" => "success"
    ]);

} else {

    echo json_encode([
        "status" => "error"
    ]);
}
?>