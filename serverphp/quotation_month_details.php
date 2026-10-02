<?php

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");


/*
|--------------------------------------------------------------------------
| PREFLIGHT
|--------------------------------------------------------------------------
*/

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}


/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed: " . $conn->connect_error
    ]);

    exit;
}

$conn->set_charset("utf8mb4");


/*
|--------------------------------------------------------------------------
| INPUT
|--------------------------------------------------------------------------
*/

$input = json_decode(
    file_get_contents("php://input"),
    true
);

if (!is_array($input)) {
    $input = [];
}


$party = trim(
    $input["PartyLedgerName"] ?? ""
);

$month = trim(
    $input["month"] ?? ""
);


if ($party === "" || $month === "") {

    echo json_encode([
        "success" => false,
        "message" => "PartyLedgerName and month are required"
    ]);

    $conn->close();

    exit;
}


/*
|--------------------------------------------------------------------------
| MONTH NUMBERS
|--------------------------------------------------------------------------
*/

$monthNumbers = [
    "Jan" => 1,
    "Feb" => 2,
    "Mar" => 3,
    "Apr" => 4,
    "May" => 5,
    "Jun" => 6,
    "Jul" => 7,
    "Aug" => 8,
    "Sep" => 9,
    "Oct" => 10,
    "Nov" => 11,
    "Dec" => 12
];


if (!isset($monthNumbers[$month])) {

    echo json_encode([
        "success" => false,
        "message" => "Invalid month: " . $month
    ]);

    $conn->close();

    exit;
}


$monthNumber = $monthNumbers[$month];


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanValue($value)
{
    $value = (string)$value;

    $value = preg_replace(
        '/[\x{FEFF}\x{00A0}]/u',
        ' ',
        $value
    );

    return trim($value);
}


function normalizeOrderNumber($value)
{
    return strtoupper(
        cleanValue($value)
    );
}


function isSalesOrder($voucherType)
{
    return strtolower(
        cleanValue($voucherType)
    ) === "sales order";
}


/*
|--------------------------------------------------------------------------
| CHECK WHETHER ROW IS AN INVOICE
|--------------------------------------------------------------------------
|
| Actual data contains:
|
| GST Sales B2B
| GST Sales B2C
| GST Service
|
|--------------------------------------------------------------------------
*/

function isInvoiceVoucher($voucherType)
{
    $type = strtolower(
        cleanValue($voucherType)
    );

    return (
        $type === "gst sales b2b" ||
        $type === "gst sales b2c" ||
        $type === "gst service"
    );
}


/*
|--------------------------------------------------------------------------
| ========================================================================
| PART 1
| GET SALES ORDERS ONLY FOR SELECTED PARTY
| ========================================================================
|
| This controls the quotations shown in Month Details.
|
| Therefore quotations from other parties will NOT be mixed.
|
|--------------------------------------------------------------------------
*/

$sql = "
    SELECT
        PartyLedgerName,
        VoucherTypeName,
        VoucherNumber,
        Reference,
        OrderNo,
        EveInvVchOrderNos,
        Date,
        StockItemDescription,
        StockItemName,
        BilledQty,
        Rate,
        Amount
    FROM salesdata
    WHERE PartyLedgerName = ?
    ORDER BY Date ASC, VoucherNumber ASC
";


$stmt = $conn->prepare($sql);


if (!$stmt) {

    echo json_encode([
        "success" => false,
        "message" => "SQL prepare failed: " . $conn->error
    ]);

    $conn->close();

    exit;
}


$stmt->bind_param(
    "s",
    $party
);


if (!$stmt->execute()) {

    echo json_encode([
        "success" => false,
        "message" => "SQL execute failed: " . $stmt->error
    ]);

    $stmt->close();
    $conn->close();

    exit;
}


$result = $stmt->get_result();


$rows = [];


while ($row = $result->fetch_assoc()) {

    $rows[] = $row;
}


$stmt->close();


/*
|--------------------------------------------------------------------------
| ========================================================================
| PART 2
| BUILD QUOTATIONS FOR SELECTED PARTY
| ========================================================================
*/

$quotations = [];


foreach ($rows as $row) {

    /*
    |--------------------------------------------------------------------------
    | ONLY SALES ORDER
    |--------------------------------------------------------------------------
    */

    if (
        !isSalesOrder(
            $row["VoucherTypeName"] ?? ""
        )
    ) {
        continue;
    }


    /*
    |--------------------------------------------------------------------------
    | DATE
    |--------------------------------------------------------------------------
    */

    $dateValue = cleanValue(
        $row["Date"] ?? ""
    );


    if (
        $dateValue === "" ||
        strtotime($dateValue) === false
    ) {
        continue;
    }


    /*
    |--------------------------------------------------------------------------
    | MONTH
    |--------------------------------------------------------------------------
    */

    if (
        (int)date(
            "n",
            strtotime($dateValue)
        ) !== $monthNumber
    ) {
        continue;
    }


    /*
    |--------------------------------------------------------------------------
    | QUOTATION NUMBER
    |--------------------------------------------------------------------------
    |
    | In your data:
    |
    | VoucherNumber:
    | EV/SO/4380/2026-27
    |
    | OrderNo:
    | EV/SO/4380/2026-27
    |
    |--------------------------------------------------------------------------
    */

    $quotationNumber =
        normalizeOrderNumber(
            $row["VoucherNumber"] ?? ""
        );


    if ($quotationNumber === "") {
        continue;
    }


    /*
    |--------------------------------------------------------------------------
    | CREATE QUOTATION
    |--------------------------------------------------------------------------
    */

    if (
        !isset(
            $quotations[$quotationNumber]
        )
    ) {

        $quotations[$quotationNumber] = [

            "voucher_no" =>
                $quotationNumber,

            "order_no" =>
                normalizeOrderNumber(
                    $row["OrderNo"] ?? ""
                ),

            "date" =>
                $row["Date"] ?? "",

            "quotation_amount" =>
                0,

            "billed_amount" =>
                null,

            "invoice_no" =>
                "",

            "billed_party" =>
                "",

            "description" =>
                "",

            "items" =>
                [],

            "status" =>
                "Quotation Only"
        ];
    }


    /*
    |--------------------------------------------------------------------------
    | QUOTATION AMOUNT
    |--------------------------------------------------------------------------
    */

    $quotations[$quotationNumber]["quotation_amount"] +=
        (float)(
            $row["Amount"] ?? 0
        );


    /*
    |--------------------------------------------------------------------------
    | ITEMS
    |--------------------------------------------------------------------------
    */

    $quotations[$quotationNumber]["items"][] = [

        "item_name" =>
            $row["StockItemName"] ?? "",

        "rate" =>
            (float)(
                $row["Rate"] ?? 0
            ),

        "quantity" =>
            (float)(
                $row["BilledQty"] ?? 0
            ),

        "value" =>
            (float)(
                $row["Amount"] ?? 0
            )
    ];


    /*
    |--------------------------------------------------------------------------
    | DESCRIPTION
    |--------------------------------------------------------------------------
    */

    if (
        $quotations[$quotationNumber]["description"] === ""
    ) {

        if (
            !empty(
                $row["StockItemDescription"]
            )
        ) {

            $quotations[$quotationNumber]["description"] =
                $row["StockItemDescription"];

        } elseif (
            !empty(
                $row["StockItemName"]
            )
        ) {

            $quotations[$quotationNumber]["description"] =
                $row["StockItemName"];
        }
    }
}


/*
|--------------------------------------------------------------------------
| ========================================================================
| PART 3
| GET ALL INVOICES FROM ALL PARTIES
| ========================================================================
|
| IMPORTANT:
|
| NO PartyLedgerName filter here.
|
| This is ONLY for checking whether the quotation was billed.
|
|--------------------------------------------------------------------------
*/

$invoiceSql = "
    SELECT
        PartyLedgerName,
        VoucherTypeName,
        VoucherNumber,
        EveInvVchOrderNos,
        Date,
        Amount
    FROM salesdata
    WHERE
        LOWER(TRIM(VoucherTypeName)) IN (
            'gst sales b2b',
            'gst sales b2c',
            'gst service'
        )
    ORDER BY Date ASC, VoucherNumber ASC
";


$invoiceStmt = $conn->prepare(
    $invoiceSql
);


if (!$invoiceStmt) {

    echo json_encode([
        "success" => false,
        "message" =>
            "Invoice SQL prepare failed: " .
            $conn->error
    ]);

    $conn->close();

    exit;
}


if (!$invoiceStmt->execute()) {

    echo json_encode([
        "success" => false,
        "message" =>
            "Invoice SQL execute failed: " .
            $invoiceStmt->error
    ]);

    $invoiceStmt->close();
    $conn->close();

    exit;
}


$invoiceResult =
    $invoiceStmt->get_result();


$invoiceRows = [];


while (
    $invoiceRow =
        $invoiceResult->fetch_assoc()
) {

    $invoiceRows[] =
        $invoiceRow;
}


$invoiceStmt->close();


/*
|--------------------------------------------------------------------------
| ========================================================================
| PART 4
| BUILD INVOICE LOOKUP
| ========================================================================
|
| We build:
|
| quotation/order number
|          ↓
| invoice voucher
|          ↓
| invoice party
|          ↓
| invoice amount
|
|--------------------------------------------------------------------------
*/

$invoiceLookup = [];


foreach ($invoiceRows as $row) {

    /*
    |--------------------------------------------------------------------------
    | CHECK INVOICE TYPE
    |--------------------------------------------------------------------------
    */

    if (
        !isInvoiceVoucher(
            $row["VoucherTypeName"] ?? ""
        )
    ) {
        continue;
    }


    /*
    |--------------------------------------------------------------------------
    | GET EVE INV ORDER NUMBERS
    |--------------------------------------------------------------------------
    |
    | Example:
    |
    | EV, EV/SO/4380/2026-27
    |
    |--------------------------------------------------------------------------
    */

    $eveOrderNos =
        cleanValue(
            $row["EveInvVchOrderNos"] ?? ""
        );


    if ($eveOrderNos === "") {
        continue;
    }


    /*
    |--------------------------------------------------------------------------
    | SPLIT COMMA-SEPARATED VALUES
    |--------------------------------------------------------------------------
    */

    $orderNumbers =
        preg_split(
            '/\s*,\s*/',
            $eveOrderNos,
            -1,
            PREG_SPLIT_NO_EMPTY
        );


    /*
    |--------------------------------------------------------------------------
    | INVOICE NUMBER
    |--------------------------------------------------------------------------
    */

    $invoiceNumber =
        cleanValue(
            $row["VoucherNumber"] ?? ""
        );


    if ($invoiceNumber === "") {
        continue;
    }


    /*
    |--------------------------------------------------------------------------
    | INVOICE PARTY
    |--------------------------------------------------------------------------
    */

    $invoiceParty =
        cleanValue(
            $row["PartyLedgerName"] ?? ""
        );


    /*
    |--------------------------------------------------------------------------
    | CHECK EVERY ORDER NUMBER
    |--------------------------------------------------------------------------
    */

    foreach (
        $orderNumbers
        as $orderNumber
    ) {

        $orderNumber =
            normalizeOrderNumber(
                $orderNumber
            );


        if ($orderNumber === "") {
            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | CREATE LOOKUP GROUP
        |--------------------------------------------------------------------------
        */

        if (
            !isset(
                $invoiceLookup[$orderNumber]
            )
        ) {

            $invoiceLookup[$orderNumber] = [];
        }


        /*
        |--------------------------------------------------------------------------
        | GROUP BY INVOICE NUMBER
        |--------------------------------------------------------------------------
        */

        if (
            !isset(
                $invoiceLookup[$orderNumber][$invoiceNumber]
            )
        ) {

            $invoiceLookup[$orderNumber][$invoiceNumber] = [

                "amount" =>
                    0,

                "party" =>
                    $invoiceParty,

                "date" =>
                    $row["Date"] ?? ""
            ];
        }


        /*
        |--------------------------------------------------------------------------
        | ADD INVOICE LINE AMOUNT
        |--------------------------------------------------------------------------
        */

        $invoiceLookup[
            $orderNumber
        ][$invoiceNumber]["amount"] +=
            (float)(
                $row["Amount"] ?? 0
            );
    }
}


/*
|--------------------------------------------------------------------------
| ========================================================================
| PART 5
| MATCH EACH QUOTATION
| ========================================================================
|
| Selected party quotations are matched against ALL invoice parties.
|
|--------------------------------------------------------------------------
*/

foreach (
    $quotations
    as $quotationNumber => &$quotation
) {

    /*
    |--------------------------------------------------------------------------
    | USE ORDER NUMBER FOR MATCHING
    |--------------------------------------------------------------------------
    |
    | This is the actual relationship in your database.
    |
    |--------------------------------------------------------------------------
    */

    $orderNumber =
        normalizeOrderNumber(
            $quotation["order_no"] ?? ""
        );


    /*
    |--------------------------------------------------------------------------
    | FALLBACK TO VOUCHER NUMBER
    |--------------------------------------------------------------------------
    */

    if ($orderNumber === "") {

        $orderNumber =
            normalizeOrderNumber(
                $quotation["voucher_no"] ?? ""
            );
    }


    if ($orderNumber === "") {
        continue;
    }


    /*
    |--------------------------------------------------------------------------
    | FIND MATCHING INVOICES
    |--------------------------------------------------------------------------
    */

    if (
        !isset(
            $invoiceLookup[$orderNumber]
        )
    ) {
        continue;
    }


    $matchedInvoices =
        $invoiceLookup[$orderNumber];


    /*
    |--------------------------------------------------------------------------
    | CALCULATE BILLING
    |--------------------------------------------------------------------------
    */

    $totalBilled = 0;

    $invoiceNumbers = [];

    $billedParties = [];


    foreach (
        $matchedInvoices
        as $invoiceNumber => $invoiceData
    ) {

        /*
        |--------------------------------------------------------------------------
        | AMOUNT
        |--------------------------------------------------------------------------
        */

        $totalBilled +=
            (float)(
                $invoiceData["amount"]
            );


        /*
        |--------------------------------------------------------------------------
        | INVOICE NUMBER
        |--------------------------------------------------------------------------
        */

        $invoiceNumbers[] =
            $invoiceNumber;


        /*
        |--------------------------------------------------------------------------
        | PARTY
        |--------------------------------------------------------------------------
        */

        if (
            $invoiceData["party"] !== ""
        ) {

            $billedParties[] =
                $invoiceData["party"];
        }
    }


    /*
    |--------------------------------------------------------------------------
    | REMOVE DUPLICATES
    |--------------------------------------------------------------------------
    */

    $invoiceNumbers =
        array_values(
            array_unique(
                $invoiceNumbers
            )
        );


    $billedParties =
        array_values(
            array_unique(
                $billedParties
            )
        );


    /*
    |--------------------------------------------------------------------------
    | MARK BILLED
    |--------------------------------------------------------------------------
    */

    $quotation["billed_amount"] =
        $totalBilled;


    $quotation["invoice_no"] =
        implode(
            ", ",
            $invoiceNumbers
        );


    $quotation["billed_party"] =
        implode(
            ", ",
            $billedParties
        );


    $quotation["status"] =
        "Billed";
}


unset($quotation);


/*
|--------------------------------------------------------------------------
| ========================================================================
| PART 6
| RESPONSE
| ========================================================================
*/

$data = [];


foreach (
    $quotations
    as $quotation
) {

    $data[] = [

        "quotation_no" =>
            $quotation["voucher_no"],

        "order_no" =>
            $quotation["order_no"],

        "invoice_no" =>
            $quotation["invoice_no"],

        "billed_party" =>
            $quotation["billed_party"],

        "date" =>
            $quotation["date"],

        "description" =>
            $quotation["description"],

        "quotation_amount" =>
            round(
                (float)(
                    $quotation["quotation_amount"]
                ),
                2
            ),

        "billed_amount" =>
            $quotation["billed_amount"] === null
                ? ""
                : round(
                    (float)(
                        $quotation["billed_amount"]
                    ),
                    2
                ),

        "items" =>
            $quotation["items"],

        "status" =>
            $quotation["status"]
    ];
}


/*
|--------------------------------------------------------------------------
| SORT BY DATE
|--------------------------------------------------------------------------
*/

usort(
    $data,
    function ($a, $b) {

        return strcmp(
            $a["date"],
            $b["date"]
        );
    }
);


/*
|--------------------------------------------------------------------------
| CLOSE DATABASE
|--------------------------------------------------------------------------
*/

$conn->close();


/*
|--------------------------------------------------------------------------
| JSON RESPONSE
|--------------------------------------------------------------------------
*/

echo json_encode(
    $data,
    JSON_UNESCAPED_UNICODE
);

?>