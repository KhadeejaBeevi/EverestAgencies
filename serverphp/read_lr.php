<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: *");

header("Content-Type: application/json");
error_reporting(0);
ini_set('display_errors', 0);

function cleanText($text)
{
    $text = preg_replace('/\s+/', ' ', $text);

    $text = str_replace(
        ["_", "|", "\\", ";", ":"],
        " ",
        $text
    );

    return trim($text);
}
// ================= CHECK IMAGE =================

if (!isset($_FILES['lrImage'])) {

    echo json_encode([
        "status" => "error",
        "message" => "No image uploaded"
    ]);

    exit();
}

// ================= CREATE FOLDER =================

$targetDir = "uploads/temp/";

if (!file_exists($targetDir)) {

    mkdir($targetDir, 0777, true);
}

// ================= UPLOAD IMAGE =================

$fileName =
    time() . "_" .
    basename($_FILES["lrImage"]["name"]);

$targetFile =
    $targetDir . $fileName;

if (
    !move_uploaded_file(
        $_FILES["lrImage"]["tmp_name"],
        $targetFile
    )
) {

    echo json_encode([
        "status" => "error",
        "message" => "Image upload failed"
    ]);

    exit();
}

// ================= TESSERACT PATH =================

$tesseract =
'"C:\\Program Files\\Tesseract-OCR\\tesseract.exe"';

// ================= IMAGE INFO =================

$imageInfo = getimagesize($targetFile);

if ($imageInfo === false) {

    echo json_encode([
        "status" => "error",
        "message" => "Invalid image"
    ]);

    exit();
}

$mime = $imageInfo['mime'];

$source = null;

// ================= LOAD IMAGE =================

if ($mime == 'image/jpeg') {

    $source =
        imagecreatefromjpeg($targetFile);

} elseif ($mime == 'image/png') {

    $source =
        imagecreatefrompng($targetFile);

}

// ================= ROTATE IMAGE =================

if ($source) {

    $rotated =
        imagerotate(
            $source,
            -90,
            0
        );

    // SAVE BASED ON TYPE

    if ($mime == 'image/jpeg') {

        imagejpeg(
            $rotated,
            $targetFile,
            100
        );

    } elseif ($mime == 'image/png') {

        imagepng(
            $rotated,
            $targetFile
        );
    }

    imagedestroy($source);

    imagedestroy($rotated);
}

// ================= OCR COMMAND =================

$command =
$tesseract . " " .
escapeshellarg($targetFile) .
" stdout --psm 6 2>&1";

// ================= OCR =================

$output = shell_exec($command);

// ================= OCR FAILED =================

if (!$output) {

    echo json_encode([
        "status" => "error",
        "message" => "OCR output empty"
    ]);

    exit();
}

// ================= CLEAN TEXT =================

$text = strtoupper($output);

$text = preg_replace('/\s+/', ' ', $text);

// DEBUG FILE

file_put_contents(
    "uploads/temp/ocr_output.txt",
    $text
);

// ================= DEFAULT VALUES =================

$lr_date = "";
$destination = "";
$party_name = "";
$lr_number = "";
$transporter_name = "";

// ================= TRANSPORTER =================

if (strpos($text, "VRL") !== false) {

    $transporter_name = "VRL";
}

// ================= DATE =================

if (
    preg_match(
        '/\d{2}[-\/]\d{2}[-\/]\d{4}/',
        $text,
        $match
    )
) {

    $lr_date = $match[0];
}

// ================= LR NUMBER =================

if (
    preg_match(
        '/\b\d{10}\b/',
        $text,
        $match
    )
) {

    $lr_number = $match[0];
}

// ================= DESTINATION =================

if (strpos($text, "TO :") !== false) {

    $toPart =
        explode("TO :", $text)[1];

    $destination =
        trim(
            explode("GSTIN", $toPart)[0]
        );
}

// ================= PARTY =================

if (strpos($text, "CONSIGNEE") !== false) {

    $consigneePart =
        explode("CONSIGNEE", $text)[1];

    $party_name =
        trim(
            explode("GSTIN", $consigneePart)[0]
        );
}

// ================= RESPONSE =================

echo json_encode([

    "status" => "success",

    "lr_date" => $lr_date,

    "party_name" => $party_name,

    "destination" => $destination,

    "lr_number" => $lr_number,

    "transporter_name" => $transporter_name,

    "raw_text" => $text
]);

?>