
<?php

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    echo json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]);
    exit;
}

$tallyUrl = "http://117.221.70.147:14151";

$tallyRunning = false;
$inserted = 0;
$source = "database";

/*
|--------------------------------------------------------------------------
| STEP 1: CHECK WHETHER TALLY IS RUNNING
|--------------------------------------------------------------------------
*/

$ch = curl_init($tallyUrl);

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => "<ENVELOPE></ENVELOPE>",
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/xml",
        "Expect:"
    ],
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 5,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_0
]);

$responseCheck = curl_exec($ch);

$curlError = curl_errno($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

if (
    !$curlError &&
    $httpCode == 200 &&
    !empty($responseCheck)
) {
    $tallyRunning = true;
}


/*
|--------------------------------------------------------------------------
| STEP 2: IF TALLY IS RUNNING, FETCH LIVE DATA
|--------------------------------------------------------------------------
*/

if ($tallyRunning) {

    $xmlRequest = '
    <ENVELOPE>
        <HEADER>
            <TALLYREQUEST>Export Data</TALLYREQUEST>
        </HEADER>

        <BODY>
            <EXPORTDATA>

                <REQUESTDESC>

                    <REPORTNAME>XMLPostDatedReport</REPORTNAME>

                    <STATICVARIABLES>

                        <SVEXPORTFORMAT>$SysName:XML</SVEXPORTFORMAT>

                        <SVFROMDATE>$BooksFrom:Company:##SVCurrentCompany</SVFROMDATE>

                        <SVTODATE>$LastVoucherDate:Company:##SVCurrentCompany</SVTODATE>

                    </STATICVARIABLES>

                </REQUESTDESC>

            </EXPORTDATA>
        </BODY>

    </ENVELOPE>';

    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $tallyUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $xmlRequest,
        CURLOPT_HTTPHEADER => [
            "Content-Type: application/xml",
            "Expect:"
        ],
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_0,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false
    ]);

    $response = curl_exec($ch);

    $curlError = curl_errno($ch);
    $curlErrorMessage = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);


    /*
    |--------------------------------------------------------------------------
    | STEP 3: VALID TALLY RESPONSE?
    |--------------------------------------------------------------------------
    */

    if (
        !$curlError &&
        $httpCode == 200 &&
        !empty($response)
    ) {

        file_put_contents(__DIR__ . "/tally_debug.xml", $response);

        $xml = simplexml_load_string($response);

        if ($xml !== false) {

            /*
            |--------------------------------------------------------------------------
            | FIND POSTDATED DATA
            |--------------------------------------------------------------------------
            */

            if (isset($xml->POSTDATEDLIST)) {

                $entries = $xml->POSTDATEDLIST;

            } elseif (isset($xml->BODY->DATA->COLLECTION->POSTDATEDLIST)) {

                $entries = $xml->BODY->DATA->COLLECTION->POSTDATEDLIST;

            } else {

                $entries = [];
            }


            /*
            |--------------------------------------------------------------------------
            | STEP 4: ONLY REPLACE DATABASE IF TALLY RETURNED DATA
            |--------------------------------------------------------------------------
            */

            if (!empty($entries)) {

                /*
                | Delete old data only after valid Tally data is received
                */

                $conn->query("TRUNCATE TABLE vouchers");


                $insertStmt = $conn->prepare("
                    INSERT INTO vouchers
                    (
                        date,
                        particulars,
                        vch_type,
                        vch_no,
                        debit_amount,
                        credit_amount,
                        postdated,
                        prevpdc,
                        bank_date
                    )
                    VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");


                if ($insertStmt) {

                    foreach ($entries as $voucher) {

                        /*
                        |--------------------------------------------------------------------------
                        | DATE
                        |--------------------------------------------------------------------------
                        */

                        $rawDate = trim((string)$voucher->DATE);

                        if (!empty($rawDate) && strtotime($rawDate)) {
                            $date = date("Y-m-d", strtotime($rawDate));
                        } else {
                            $date = null;
                        }


                        /*
                        |--------------------------------------------------------------------------
                        | BASIC DATA
                        |--------------------------------------------------------------------------
                        */

                        $particulars = (string)$voucher->PARTICULARS;

                        $vch_type = (string)$voucher->VCH_TYPE;

                        $vch_no = (string)$voucher->VCH_NO;


                        /*
                        |--------------------------------------------------------------------------
                        | AMOUNTS
                        |--------------------------------------------------------------------------
                        */

                        $debit = (float)str_replace(
                            ",",
                            "",
                            (string)$voucher->DEBIT_AMOUNT
                        );

                        $credit = (float)str_replace(
                            ",",
                            "",
                            (string)$voucher->CREDIT_AMOUNT
                        );


                        /*
                        |--------------------------------------------------------------------------
                        | PDC DATA
                        |--------------------------------------------------------------------------
                        */

                        $postdated = (string)$voucher->POSTDATED;

                        $prevpdc = (string)$voucher->PREVPDC;


                        /*
                        |--------------------------------------------------------------------------
                        | BANK DATE
                        |--------------------------------------------------------------------------
                        */

                        $bank_date_raw = trim((string)$voucher->BANKDATE);

                        if (
                            !empty($bank_date_raw) &&
                            strtotime($bank_date_raw)
                        ) {

                            $bank_date = date(
                                "Y-m-d",
                                strtotime($bank_date_raw)
                            );

                        } else {

                            $bank_date = null;
                        }


                        /*
                        |--------------------------------------------------------------------------
                        | SKIP EMPTY VOUCHERS
                        |--------------------------------------------------------------------------
                        */

                        if ($debit == 0 && $credit == 0) {
                            continue;
                        }


                        /*
                        |--------------------------------------------------------------------------
                        | INSERT
                        |--------------------------------------------------------------------------
                        */

                        $insertStmt->bind_param(
                            "ssssddsss",
                            $date,
                            $particulars,
                            $vch_type,
                            $vch_no,
                            $debit,
                            $credit,
                            $postdated,
                            $prevpdc,
                            $bank_date
                        );


                        if ($insertStmt->execute()) {
                            $inserted++;
                        }
                    }

                    $insertStmt->close();


                    /*
                    |--------------------------------------------------------------------------
                    | TALLY SUCCESS
                    |--------------------------------------------------------------------------
                    */

                    $source = "tally";
                }
            }
        }
    }
}


/*
|--------------------------------------------------------------------------
| STEP 5: GET DATA FROM DATABASE
|
| This runs:
| - when Tally is NOT running
| - OR when Tally live fetch failed
| - OR when Tally returned no usable data
|
| If Tally worked successfully, the database now contains the live data,
| so this query simply returns that newly imported live data.
|--------------------------------------------------------------------------
*/

$data = [];

$result = $conn->query("
    SELECT
        date,
        particulars,
        debit_amount,
        credit_amount,
        postdated,
        prevpdc,
        bank_date
    FROM vouchers
    ORDER BY date ASC
");


if ($result) {

    while ($row = $result->fetch_assoc()) {

        $data[] = [

            "date" => $row["date"],

            "particulars" => $row["particulars"],

            "debit_amount" => (float)$row["debit_amount"],

            "credit_amount" => (float)$row["credit_amount"],

            "postdated" => $row["postdated"],

            "prevpdc" => $row["prevpdc"],

            "bank_date" => $row["bank_date"]

        ];
    }

}


/*
|--------------------------------------------------------------------------
| STEP 6: RESPONSE
|--------------------------------------------------------------------------
*/

echo json_encode([

    "status" => "success",

    "source" => $source,

    "tally_running" => $tallyRunning,

    "inserted" => $inserted,

    "count" => count($data),

    "data" => $data

]);


$conn->close();

?>

