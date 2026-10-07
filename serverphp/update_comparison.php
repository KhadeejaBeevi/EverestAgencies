<?php

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");


/* =========================================================
   OPTIONS REQUEST
   ========================================================= */

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}


/* =========================================================
   DATABASE CONNECTION
   ========================================================= */

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed: " . $conn->connect_error
    ]);

    exit();
}


/* =========================================================
   GET FORM DATA
   ========================================================= */

$id = $_POST["id"] ?? "";

$order_received_status =
    $_POST["order_received_status"] ?? "";

$comparisonText =
    $_POST["comparisonText"] ?? "";


/*
   Remove unnecessary spaces from beginning/end,
   but preserve line breaks inside the comparison.
*/
$comparisonText = trim($comparisonText);


/* =========================================================
   CHECK ID
   ========================================================= */

if (!$id) {

    echo json_encode([
        "success" => false,
        "message" => "Tender ID missing"
    ]);

    $conn->close();

    exit();
}


/* =========================================================
   GET EXISTING COMPARISON IMAGE
   ========================================================= */

$stmt = $conn->prepare("
    SELECT comparison, comparison_text
    FROM tender_details
    WHERE id = ?
");

$stmt->bind_param("i", $id);

$stmt->execute();

$result = $stmt->get_result();

$row = $result->fetch_assoc();

$stmt->close();


/*
   Keep the existing image if no new image is uploaded.
*/
$comparisonPath = $row["comparison"] ?? "";


/* =========================================================
   UPLOAD NEW COMPARISON IMAGE
   ========================================================= */

if (
    isset($_FILES["comparisonFile"]) &&
    $_FILES["comparisonFile"]["error"] === UPLOAD_ERR_OK
) {

    $uploadDir = __DIR__ . "/uploads/comparison/";

    /*
       Create directory if it does not exist.
    */
    if (!is_dir($uploadDir)) {

        mkdir(
            $uploadDir,
            0777,
            true
        );
    }


    /*
       Get original filename
    */
    $originalName =
        basename($_FILES["comparisonFile"]["name"]);


    /*
       Create safe filename
    */
    $extension =
        strtolower(
            pathinfo(
                $originalName,
                PATHINFO_EXTENSION
            )
        );


    /*
       Allow only image files
    */
    $allowedExtensions = [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp"
    ];


    if (!in_array($extension, $allowedExtensions)) {

        echo json_encode([
            "success" => false,
            "message" => "Only JPG, JPEG, PNG, GIF and WEBP images are allowed"
        ]);

        $conn->close();

        exit();
    }


    /*
       Unique filename
    */
    $fileName =
        time() .
        "_" .
        uniqid() .
        "." .
        $extension;


    $targetFile =
        $uploadDir . $fileName;


    /*
       Move uploaded file
    */
    if (
        move_uploaded_file(
            $_FILES["comparisonFile"]["tmp_name"],
            $targetFile
        )
    ) {

        /*
           Store relative URL in database.
        */
        $comparisonPath =
            "/uploads/comparison/" . $fileName;

    } else {

        echo json_encode([
            "success" => false,
            "message" => "Failed to upload comparison image"
        ]);

        $conn->close();

        exit();
    }
}


/* =========================================================
   UPDATE DATABASE
   ========================================================= */

$stmt = $conn->prepare("
    UPDATE tender_details
    SET
        comparison = ?,
        comparison_text = ?,
        order_received_status = ?
    WHERE id = ?
");


if (!$stmt) {

    echo json_encode([
        "success" => false,
        "message" => "Prepare failed: " . $conn->error
    ]);

    $conn->close();

    exit();
}


/*
   s = string
   s = string
   s = string
   i = integer
*/
$stmt->bind_param(
    "sssi",
    $comparisonPath,
    $comparisonText,
    $order_received_status,
    $id
);


/* =========================================================
   EXECUTE UPDATE
   ========================================================= */

if ($stmt->execute()) {

    echo json_encode([
        "success" => true,
        "message" => "Tender updated successfully",
        "id" => $id,
        "comparison" => $comparisonPath,
        "comparison_text" => $comparisonText,
        "order_received_status" => $order_received_status
    ]);

} else {

    echo json_encode([
        "success" => false,
        "message" => "Update failed: " . $stmt->error
    ]);
}


/* =========================================================
   CLOSE
   ========================================================= */

$stmt->close();

$conn->close();

?>