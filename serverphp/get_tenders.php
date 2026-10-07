<?php
require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database Connection Failed: " . $conn->connect_error
    ]);
    exit();
}

$sql = "
SELECT
    id,
    timestamp,
    tender_invited_kseb_office,
    opening_date,
    opening_time,
    quotation_notice_no,
    quotation_date,
    tender_item_data,
    quotation_submission_last_date,
    tender_photo,
    executive_name,
    tender_receipt_email,
    tender_receipt_date,
    tender_everest_executive_email,
    tender_info_given_to_gibin,
    tender_info_given_date,
    rate_given_by_gibin,
    everest_quotation_no,
    everest_quotation_date,
    sku_rate,
    tender_dispatched_date,
    formula,
    order_received_status,
    comparison,
    comparison_text,
    created_at,
    updated_at
FROM tender_details
ORDER BY id DESC
";

$result = $conn->query($sql);

$tenders = [];

if ($result) {

    while ($row = $result->fetch_assoc()) {

        /*
        |--------------------------------------------------------------------------
        | TENDER PHOTO URL
        |--------------------------------------------------------------------------
        */

        if (!empty($row["tender_photo"])) {

            // GOOGLE DRIVE LINK
            if (
                strpos($row["tender_photo"], "drive.google.com") !== false
            ) {

                $row["tender_photo_url"] = $row["tender_photo"];

            } else {

                // LOCAL UPLOADED FILE
                $row["tender_photo_url"] =
                    "http://localhost/everest/serverphp/uploads/tenders/" .
                    $row["tender_photo"];
            }

        } else {

            $row["tender_photo_url"] = "";
        }


        /*
        |--------------------------------------------------------------------------
        | COMPARISON IMAGE URL
        |--------------------------------------------------------------------------
        */

        if (!empty($row["comparison"])) {

            // Google Drive comparison image
            if (
                strpos($row["comparison"], "drive.google.com") !== false
            ) {

                $row["comparison_url"] = $row["comparison"];

            } else {

                // If already starts with http
                if (
                    strpos($row["comparison"], "http://") === 0 ||
                    strpos($row["comparison"], "https://") === 0
                ) {

                    $row["comparison_url"] = $row["comparison"];

                } else {

                    // Local comparison image
                    $comparisonPath = ltrim(
                        $row["comparison"],
                        "/"
                    );

                    $row["comparison_url"] =
                        "http://localhost/everest/serverphp/" .
                        $comparisonPath;
                }
            }

        } else {

            $row["comparison_url"] = "";
        }


        /*
        |--------------------------------------------------------------------------
        | COMPARISON TEXT
        |--------------------------------------------------------------------------
        |
        | This comes directly from:
        | tender_details.comparison_text
        |
        */

        $row["comparison_text"] =
            $row["comparison_text"] ?? "";


        /*
        |--------------------------------------------------------------------------
        | ADD TENDER
        |--------------------------------------------------------------------------
        */

        $tenders[] = $row;
    }

} else {

    echo json_encode([
        "success" => false,
        "message" => "Query Failed: " . $conn->error
    ]);

    $conn->close();
    exit();
}


/*
|--------------------------------------------------------------------------
| RETURN DATA
|--------------------------------------------------------------------------
*/

echo json_encode($tenders);

$conn->close();

?>