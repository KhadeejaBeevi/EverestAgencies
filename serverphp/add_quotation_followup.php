<?php

require_once __DIR__ . '/api_auth.php';

error_reporting(E_ALL);
ini_set('display_errors', 1);

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}


/* =========================================================
   DATABASE CONNECTION
========================================================= */

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed",
        "error" => $conn->connect_error
    ]);

    exit;
}


/* =========================================================
   GET INPUT
========================================================= */

$input = json_decode(
    file_get_contents("php://input"),
    true
);

if (!$input) {

    echo json_encode([
        "success" => false,
        "message" => "Invalid JSON data"
    ]);

    exit;
}


/* =========================================================
   FOLLOW-UP DATA
========================================================= */

$party = trim($input['party'] ?? "");
$month = trim($input['month'] ?? "");

$quotation_no = trim(
    $input['quotationNo'] ?? ""
);

$order_no = trim(
    $input['orderNo'] ?? ""
);

$invoice_no = trim(
    $input['invoiceNo'] ?? ""
);

$quotation_status = trim(
    $input['quotation_status'] ?? ""
);

$call_date = !empty($input['call_date'])
    ? $input['call_date']
    : null;

$followup_date = !empty($input['followup_date'])
    ? $input['followup_date']
    : null;

$telecaller = trim(
    $input['telecaller'] ?? ""
);

$status = trim(
    $input['status'] ?? ""
);

$remarks = trim(
    $input['remarks'] ?? ""
);


/* =========================================================
   VALIDATION
========================================================= */

if ($party === "") {

    echo json_encode([
        "success" => false,
        "message" => "Party name is required"
    ]);

    exit;
}


if ($quotation_no === "") {

    echo json_encode([
        "success" => false,
        "message" => "Quotation number is required"
    ]);

    exit;
}


/* =========================================================
   START TRANSACTION
========================================================= */

$conn->begin_transaction();

try {


    /* =====================================================
       SAVE FOLLOW-UP
    ===================================================== */

    $sql = "
        INSERT INTO quotation_followups
        (
            party,
            month,
            quotation_no,
            order_no,
            invoice_no,
            quotation_status,
            call_date,
            followup_date,
            telecaller,
            status,
            remarks
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ";


    $stmt = $conn->prepare($sql);


    $stmt->bind_param(
        "sssssssssss",
        $party,
        $month,
        $quotation_no,
        $order_no,
        $invoice_no,
        $quotation_status,
        $call_date,
        $followup_date,
        $telecaller,
        $status,
        $remarks
    );


    $stmt->execute();

    $followup_id = $stmt->insert_id;

    $stmt->close();


    /* =====================================================
       NEGOTIATION → CREATE ALTERATION REQUEST
    ===================================================== */

    $alteration_request_created = false;
    $alteration_request_id = null;


    if (strtolower($status) === "negotiation") {


        /*
         * Check if a Pending Alteration request already exists
         * for this quotation.
         *
         * This prevents duplicate alerts when the telecaller
         * saves Negotiation more than once.
         */

        $checkSql = "
            SELECT id
            FROM quotation_alteration_requests
            WHERE quotation_no = ?
            AND request_status = 'Pending'
            LIMIT 1
        ";


        $checkStmt = $conn->prepare(
            $checkSql
        );


        $checkStmt->bind_param(
            "s",
            $quotation_no
        );


        $checkStmt->execute();


        $checkResult =
            $checkStmt->get_result();


        if (
            $checkResult->num_rows === 0
        ) {


            /* =============================================
               CREATE NEW ALTERATION REQUEST
            ============================================= */

            $alterSql = "
                INSERT INTO quotation_alteration_requests
                (
                    quotation_no,
                    party,
                    order_no,
                    invoice_no,
                    requested_by,
                    remarks,
                    request_status
                )
                VALUES (?, ?, ?, ?, ?, ?, 'Pending')
            ";


            $alterStmt =
                $conn->prepare($alterSql);


            $alterStmt->bind_param(
                "ssssss",
                $quotation_no,
                $party,
                $order_no,
                $invoice_no,
                $telecaller,
                $remarks
            );


            $alterStmt->execute();


            $alteration_request_id =
                $alterStmt->insert_id;


            $alteration_request_created = true;


            $alterStmt->close();

        }


        $checkStmt->close();

    }


    /* =====================================================
       COMMIT
    ===================================================== */

    $conn->commit();


    echo json_encode([

        "success" => true,

        "message" =>
            $alteration_request_created
                ? "Follow-up saved and quotation alteration request created"
                : "Follow-up inserted successfully",

        "id" =>
            $followup_id,

        "negotiation" =>
            strtolower($status) === "negotiation",

        "alteration_request_created" =>
            $alteration_request_created,

        "alteration_request_id" =>
            $alteration_request_id

    ]);


} catch (Exception $e) {


    $conn->rollback();


    error_log(
        "Quotation Follow-up Error: " .
        $e->getMessage()
    );


    echo json_encode([

        "success" => false,

        "message" =>
            "Failed to save follow-up",

        "error" =>
            $e->getMessage()

    ]);

}


/* =========================================================
   CLOSE DATABASE
========================================================= */

$conn->close();

?>