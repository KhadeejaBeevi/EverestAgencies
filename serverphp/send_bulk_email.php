<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

header("Content-Type: application/json");

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require __DIR__ . '/vendor/autoload.php';

$data = json_decode(file_get_contents("php://input"), true);

$emails = $data['emails'] ?? [];
$subject = $data['subject'] ?? '';
$message = $data['message'] ?? '';

$mail = new PHPMailer(true);

try {

    $mail->isSMTP();
    $mail->Host       = 'smtp.gmail.com';
    $mail->SMTPAuth   = true;

 $mail->Username   = 'everestagencies2026@gmail.com';
    $mail->Password   = 'huib afax vgma rwbb'; 

    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = 587;

    $mail->setFrom('everestagencies2026@gmail.com', 'Everest Agencies');

    // RECIPIENTS
    foreach ($emails as $email) {
        $mail->addBCC($email);
    }

$mail->addAttachment(
    __DIR__ . '/attachments/Brochure - KSEB.pdf'
);

$mail->addAttachment(
    __DIR__ . '/attachments/brochure1.pdf'
);

    $mail->isHTML(true);

    $mail->Subject = $subject;

    $mail->Body = $message;

    $mail->send();

    echo json_encode([
        "status" => "success"
    ]);

} catch (Exception $e) {

    echo json_encode([
        "status" => "error",
        "message" => $mail->ErrorInfo
    ]);
}
?>