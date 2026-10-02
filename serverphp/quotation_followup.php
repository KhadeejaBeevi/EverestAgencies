<?php

require_once __DIR__ . '/api_auth.php';

ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json; charset=UTF-8");

ob_start();

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {
    ob_clean();

    echo json_encode([
        "error" => "Connection failed: " . $conn->connect_error
    ]);

    exit;
}


/*
|--------------------------------------------------------------------------
| MONTH NAMES
|--------------------------------------------------------------------------
*/

$monthNames = [
    1  => "Jan",
    2  => "Feb",
    3  => "Mar",
    4  => "Apr",
    5  => "May",
    6  => "Jun",
    7  => "Jul",
    8  => "Aug",
    9  => "Sep",
    10 => "Oct",
    11 => "Nov",
    12 => "Dec"
];


/*
|--------------------------------------------------------------------------
| CREATE CUSTOMER STRUCTURE
|--------------------------------------------------------------------------
*/

$customerSql = "
    SELECT DISTINCT
        PartyLedgerName,
        LedgerPrimaryGroup,
        _LedGroup,
        _GSTRegistrationType,
        _PartyGSTIN,
        mobile,
        purchase_contact,
        email
    FROM sales_summary_table4
    WHERE PartyLedgerName IS NOT NULL
      AND PartyLedgerName <> ''
";

$customerResult = $conn->query($customerSql);

if (!$customerResult) {

    ob_clean();

    echo json_encode([
        "error" => $conn->error
    ]);

    $conn->close();

    exit;
}

$customers = [];


while ($row = $customerResult->fetch_assoc()) {

    $party = trim(
        $row["PartyLedgerName"] ?? ""
    );

    if ($party === "") {
        continue;
    }

    $customers[$party] = [

        "PartyLedgerName" =>
            $party,

        "LedgerPrimaryGroup" =>
            $row["LedgerPrimaryGroup"] ?? "",

        "_LedGroup" =>
            $row["_LedGroup"] ?? "",

        "_GSTRegistrationType" =>
            $row["_GSTRegistrationType"] ?? "",

        "_PartyGSTIN" =>
            $row["_PartyGSTIN"] ?? "",

        "mobile" =>
            $row["mobile"] ?? "",

        "purchase_contact" =>
            $row["purchase_contact"] ?? "",

        "email" =>
            $row["email"] ?? "",


        "Apr" => 0,
        "May" => 0,
        "Jun" => 0,
        "Jul" => 0,
        "Aug" => 0,
        "Sep" => 0,
        "Oct" => 0,
        "Nov" => 0,
        "Dec" => 0,
        "Jan" => 0,
        "Feb" => 0,
        "Mar" => 0,


        "Apr_status" => "",
        "May_status" => "",
        "Jun_status" => "",
        "Jul_status" => "",
        "Aug_status" => "",
        "Sep_status" => "",
        "Oct_status" => "",
        "Nov_status" => "",
        "Dec_status" => "",
        "Jan_status" => "",
        "Feb_status" => "",
        "Mar_status" => "",


        "Apr_quotation_only_count" => 0,
        "May_quotation_only_count" => 0,
        "Jun_quotation_only_count" => 0,
        "Jul_quotation_only_count" => 0,
        "Aug_quotation_only_count" => 0,
        "Sep_quotation_only_count" => 0,
        "Oct_quotation_only_count" => 0,
        "Nov_quotation_only_count" => 0,
        "Dec_quotation_only_count" => 0,
        "Jan_quotation_only_count" => 0,
        "Feb_quotation_only_count" => 0,
        "Mar_quotation_only_count" => 0,


        "total_amount" => 0
    ];
}


/*
|--------------------------------------------------------------------------
| GET SALES DATA
|
| We need:
|
| VoucherTypeName
| Date
| VoucherNumber
| OrderNo
| PartyLedgerName
| Amount
| EveInvVchOrderNos
|--------------------------------------------------------------------------
*/

$sql = "
    SELECT
        PartyLedgerName,
        VoucherTypeName,
        VoucherNumber,
        Reference,
        OrderNo,
        Date,
        Amount,
        EveInvVchOrderNos
    FROM salesdata
    WHERE PartyLedgerName IS NOT NULL
      AND PartyLedgerName <> ''
    ORDER BY Date ASC
";

$result = $conn->query($sql);

if (!$result) {

    ob_clean();

    echo json_encode([
        "error" => $conn->error
    ]);

    $conn->close();

    exit;
}

$rows = [];


while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}


/*
|--------------------------------------------------------------------------
| NORMALIZE VALUE
|--------------------------------------------------------------------------
*/

function normalizeValue($value)
{
    $value = trim((string)$value);

    $value = preg_replace(
        '/\s+/',
        ' ',
        $value
    );

    return strtoupper($value);
}


/*
|--------------------------------------------------------------------------
| CREATE UNIQUE PARTY + ORDER KEY
|--------------------------------------------------------------------------
*/

function makeOrderKey($party, $orderNo)
{
    return normalizeValue($party)
        . "||"
        . normalizeValue($orderNo);
}


/*
|--------------------------------------------------------------------------
| CHECK WHETHER EveInvVchOrderNos CONTAINS
| THE EXACT ORDER NUMBER
|
| Example:
|
| EveInvVchOrderNos:
| EV, EV/SO/4380/2026-27
|
| OrderNo:
| EV/SO/4380/2026-27
|
| MATCH
|--------------------------------------------------------------------------
*/

function containsExactOrderNo(
    $eveInvVchOrderNos,
    $orderNo
) {

    $orderNo = normalizeValue($orderNo);

    if ($orderNo === "") {
        return false;
    }

    $values = preg_split(
        '/\s*,\s*/',
        (string)$eveInvVchOrderNos
    );

    foreach ($values as $value) {

        $value = normalizeValue($value);

        if ($value === "") {
            continue;
        }

        /*
        | Never treat "EV" as a Sales Order.
        */
        if ($value === "EV") {
            continue;
        }

        if ($value === $orderNo) {
            return true;
        }
    }

    return false;
}


/*
|--------------------------------------------------------------------------
| STEP 1
| BUILD SALES ORDERS
|--------------------------------------------------------------------------
|
| One quotation is grouped by:
|
| PartyLedgerName
| +
| VoucherNumber
|
|--------------------------------------------------------------------------
*/

$quotations = [];


foreach ($rows as $row) {

    $party = trim(
        $row["PartyLedgerName"] ?? ""
    );

    $voucherType = strtolower(
        trim(
            $row["VoucherTypeName"] ?? ""
        )
    );

    $voucherNumber = trim(
        $row["VoucherNumber"] ?? ""
    );

    $orderNo = trim(
        $row["OrderNo"] ?? ""
    );

    $date = trim(
        $row["Date"] ?? ""
    );

    $amount = (float)(
        $row["Amount"] ?? 0
    );


    /*
    | Only Sales Order rows
    */
    if (
        strpos(
            $voucherType,
            "sales order"
        ) === false
    ) {
        continue;
    }


    if (
        $party === "" ||
        $voucherNumber === ""
    ) {
        continue;
    }


    if (!isset($quotations[$party])) {
        $quotations[$party] = [];
    }


    /*
    | Create quotation
    */
    if (
        !isset(
            $quotations[$party][$voucherNumber]
        )
    ) {

        $quotations[$party][$voucherNumber] = [

            "voucher_number" =>
                $voucherNumber,

            "order_no" =>
                $orderNo,

            "date" =>
                $date,

            "quotation_amount" =>
                0,

            "bill_amount" =>
                0,

            "has_bill" =>
                false
        ];
    }


    /*
    | Add every Sales Order line
    */
    $quotations[$party][$voucherNumber]["quotation_amount"]
        += $amount;


    /*
    | If OrderNo was blank earlier,
    | take it from another line.
    */
    if (
        $quotations[$party][$voucherNumber]["order_no"] === ""
        &&
        $orderNo !== ""
    ) {

        $quotations[$party][$voucherNumber]["order_no"] =
            $orderNo;
    }


    /*
    | If Date was blank earlier,
    | take it from another line.
    */
    if (
        $quotations[$party][$voucherNumber]["date"] === ""
        &&
        $date !== ""
    ) {

        $quotations[$party][$voucherNumber]["date"] =
            $date;
    }
}


/*
|--------------------------------------------------------------------------
| STEP 2
| BUILD INVOICE LOOKUP
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| We DO NOT use Reference.
|
| We use:
|
| EveInvVchOrderNos
|
| Example:
|
| EV, EV/SO/4380/2026-27
|
| becomes:
|
| EV
| EV/SO/4380/2026-27
|
|--------------------------------------------------------------------------
*/

$invoiceLookup = [];


foreach ($rows as $row) {

    $party = trim(
        $row["PartyLedgerName"] ?? ""
    );

    $voucherType = strtolower(
        trim(
            $row["VoucherTypeName"] ?? ""
        )
    );

    $eveInvVchOrderNos = trim(
        $row["EveInvVchOrderNos"] ?? ""
    );

    $amount = (float)(
        $row["Amount"] ?? 0
    );


    /*
    | Skip Sales Order rows.
    */
    if (
        strpos(
            $voucherType,
            "sales order"
        ) !== false
    ) {
        continue;
    }


    if ($party === "") {
        continue;
    }


    if ($eveInvVchOrderNos === "") {
        continue;
    }


    /*
    | Split comma-separated Order Numbers.
    */
    $orderNumbers = preg_split(
        '/\s*,\s*/',
        $eveInvVchOrderNos
    );


    foreach ($orderNumbers as $orderNumber) {

        $orderNumber = trim($orderNumber);

        if ($orderNumber === "") {
            continue;
        }


        /*
        | Ignore generic "EV".
        */
        if (
            strtoupper($orderNumber) === "EV"
        ) {
            continue;
        }


        $key = makeOrderKey(
            $party,
            $orderNumber
        );


        if (
            !isset(
                $invoiceLookup[$key]
            )
        ) {

            $invoiceLookup[$key] = [

                "bill_amount" => 0,

                "has_bill" => false
            ];
        }


        /*
        | Add invoice line amount.
        */
        $invoiceLookup[$key]["bill_amount"]
            += $amount;


        $invoiceLookup[$key]["has_bill"] =
            true;
    }
}


/*
|--------------------------------------------------------------------------
| STEP 3
| APPLY INVOICE INFORMATION TO SALES ORDERS
|--------------------------------------------------------------------------
*/

foreach (
    $quotations as $party => &$partyQuotations
) {

    foreach (
        $partyQuotations as &$quotation
    ) {

        $orderNo = trim(
            $quotation["order_no"] ?? ""
        );


        if ($orderNo === "") {
            continue;
        }


        $key = makeOrderKey(
            $party,
            $orderNo
        );


        if (
            isset(
                $invoiceLookup[$key]
            )
        ) {

            $quotation["bill_amount"] =
                round(
                    (float)$invoiceLookup[$key]["bill_amount"],
                    2
                );

            $quotation["has_bill"] =
                true;
        }
    }

    unset($quotation);
}

unset($partyQuotations);


/*
|--------------------------------------------------------------------------
| STEP 4
| ADD SALES ORDERS TO MONTH SUMMARY
|--------------------------------------------------------------------------
*/

foreach (
    $quotations as $party => $partyQuotations
) {


    /*
    | If party does not exist in
    | sales_summary_table4, create it.
    */
    if (
        !isset(
            $customers[$party]
        )
    ) {

        $customers[$party] = [

            "PartyLedgerName" =>
                $party,

            "LedgerPrimaryGroup" =>
                "",

            "_LedGroup" =>
                "",

            "_GSTRegistrationType" =>
                "",

            "_PartyGSTIN" =>
                "",

            "mobile" =>
                "",

            "purchase_contact" =>
                "",

            "email" =>
                "",


            "Apr" => 0,
            "May" => 0,
            "Jun" => 0,
            "Jul" => 0,
            "Aug" => 0,
            "Sep" => 0,
            "Oct" => 0,
            "Nov" => 0,
            "Dec" => 0,
            "Jan" => 0,
            "Feb" => 0,
            "Mar" => 0,


            "Apr_status" => "",
            "May_status" => "",
            "Jun_status" => "",
            "Jul_status" => "",
            "Aug_status" => "",
            "Sep_status" => "",
            "Oct_status" => "",
            "Nov_status" => "",
            "Dec_status" => "",
            "Jan_status" => "",
            "Feb_status" => "",
            "Mar_status" => "",


            "Apr_quotation_only_count" => 0,
            "May_quotation_only_count" => 0,
            "Jun_quotation_only_count" => 0,
            "Jul_quotation_only_count" => 0,
            "Aug_quotation_only_count" => 0,
            "Sep_quotation_only_count" => 0,
            "Oct_quotation_only_count" => 0,
            "Nov_quotation_only_count" => 0,
            "Dec_quotation_only_count" => 0,
            "Jan_quotation_only_count" => 0,
            "Feb_quotation_only_count" => 0,
            "Mar_quotation_only_count" => 0,


            "total_amount" => 0
        ];
    }


    /*
    | Process each Sales Order
    */
    foreach (
        $partyQuotations as $quotation
    ) {

        $date = trim(
            $quotation["date"] ?? ""
        );


        if ($date === "") {
            continue;
        }


        /*
        | salesdata.Date is a MySQL DATE field.
        |
        | It should normally be:
        |
        | YYYY-MM-DD
        */
        $timestamp =
            strtotime($date);


        if (
            $timestamp === false
        ) {
            continue;
        }


        $monthNumber =
            (int)date(
                "n",
                $timestamp
            );


        if (
            !isset(
                $monthNames[$monthNumber]
            )
        ) {
            continue;
        }


        $month =
            $monthNames[$monthNumber];


        /*
        |--------------------------------------------------------------------------
        | MAIN MONTH AMOUNT
        |--------------------------------------------------------------------------
        |
        | The main table shows the Sales Order amount.
        |
        | Billing amount does NOT replace it.
        |
        |--------------------------------------------------------------------------
        */

        $quotationAmount =
            (float)$quotation["quotation_amount"];


        $customers[$party][$month]
            += $quotationAmount;


        $customers[$party]["total_amount"]
            += $quotationAmount;


        /*
        |--------------------------------------------------------------------------
        | STATUS
        |--------------------------------------------------------------------------
        */

        $currentStatus =
            $customers[$party][$month . "_status"]
            ?? "";


        if (
            $quotation["has_bill"]
        ) {

            /*
            | This Sales Order has a linked invoice.
            */
            if (
                $currentStatus === "quotation"
            ) {

                $customers[$party][$month . "_status"] =
                    "mixed";

            } elseif (
                $currentStatus === ""
            ) {

                $customers[$party][$month . "_status"] =
                    "billed";
            }

        } else {

            /*
            | No invoice found.
            */
            $customers[$party][$month . "_quotation_only_count"]++;


            if (
                $currentStatus === "billed"
            ) {

                $customers[$party][$month . "_status"] =
                    "mixed";

            } elseif (
                $currentStatus === ""
            ) {

                $customers[$party][$month . "_status"] =
                    "quotation";
            }
        }
    }
}


/*
|--------------------------------------------------------------------------
| ROUND VALUES
|--------------------------------------------------------------------------
*/

foreach (
    $customers as &$customer
) {

    foreach (
        $monthNames as $month
    ) {

        $customer[$month] =
            round(
                (float)$customer[$month],
                2
            );
    }


    $customer["total_amount"] =
        round(
            (float)$customer["total_amount"],
            2
        );
}

unset($customer);


/*
|--------------------------------------------------------------------------
| ONLY CUSTOMERS HAVING SALES ORDERS
|--------------------------------------------------------------------------
*/

$data = [];


foreach (
    $customers as $customer
) {

    $hasAmount = false;


    foreach (
        $monthNames as $month
    ) {

        if (
            (float)$customer[$month] > 0
        ) {

            $hasAmount = true;

            break;
        }
    }


    if ($hasAmount) {
        $data[] = $customer;
    }
}


/*
|--------------------------------------------------------------------------
| SORT PARTY NAME
|--------------------------------------------------------------------------
*/

usort(
    $data,
    function ($a, $b) {

        return strcmp(
            $a["PartyLedgerName"],
            $b["PartyLedgerName"]
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
| RETURN JSON
|--------------------------------------------------------------------------
*/

ob_clean();

echo json_encode(
    $data,
    JSON_UNESCAPED_UNICODE |
    JSON_INVALID_UTF8_SUBSTITUTE
);

exit;

?>