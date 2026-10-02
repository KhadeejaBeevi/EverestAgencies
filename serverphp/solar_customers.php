<?php

require_once __DIR__ . '/api_auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    exit;
}

mysqli_report(MYSQLI_REPORT_OFF);

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "count" => 0,
        "data" => [],
        "message" => "Database connection failed: " . $conn->connect_error
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

$conn->set_charset("utf8mb4");


/* =========================================================
   HELPERS
========================================================= */

function cleanValue($value)
{
    return trim((string)($value ?? ""));
}


function cleanDate($value)
{
    if (!$value) {
        return "";
    }

    $value = cleanValue($value);

    // YYYY-MM-DD / YYYY/MM/DD
    if (
        preg_match(
            '/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/',
            $value,
            $m
        )
    ) {
        return sprintf(
            "%04d-%02d-%02d",
            $m[1],
            $m[2],
            $m[3]
        );
    }

    $timestamp = strtotime($value);

    if ($timestamp !== false) {
        return date("Y-m-d", $timestamp);
    }

    return $value;
}


/* =========================================================
   SOLAR CUSTOMER QUERY

   Included:
   - SOLAR SHOP
   - SOLAR CUSTOMER

   Excluded:
   - SALES ORDER

   We are NOT restricting the query to one specific
   invoice voucher type.
========================================================= */

$sql = "

    SELECT

        sd.`Sl No` AS id,

        sd.VoucherTypeName,
        sd.Date,
        sd.VoucherNumber,
        sd.Reference,
        sd.OrderNo,

        sd.PartyLedgerName,
        sd.ParentLedgerName,

        sd.StockItemName,
        sd.StockItemAlias,
        sd.StockItemParent,
        sd.StockItemGrandParent,
        sd.StockItemDescription,
        sd.StockItemCategory,

        sd.GodownName,
        sd.BatchName,

        sd.BilledQty,
        sd.BatchRate,
        sd.BatchDiscount,

        sd.Amount,
        sd.Rate,
        sd.Discount,

        sd.Narration,
        sd.EnteredBy,
        sd.AlteredBy,

        sd.JasSalesLedName,
        sd.MyDateMonth,

        sd.EvePartyCrPeriod,
        sd.EveLandedCost,

        sd.`Sales ID` AS sales_id,

        sd.EveInvVchOrderNos,
        sd.EveInvMailingName,
        sd.EveInvMailingAdd,

        sd.walkin_cust_no,
        sd.assigned_to,
        sd.brought_by,
        sd.enquiry_no,

        sd.temp_item_desc,
        sd.ledger_grand_parent,

        sd.EveItemGstRate,
        sd.EveItemTaxAmt,

        sd.EveSolarCust_Shop

    FROM salesdata sd

    WHERE

        /* Solar type must exist */
        TRIM(
            COALESCE(
                sd.EveSolarCust_Shop,
                ''
            )
        ) <> ''

        /* Only Solar Customer / Solar Shop */
        AND UPPER(
            TRIM(
                COALESCE(
                    sd.EveSolarCust_Shop,
                    ''
                )
            )
        ) IN (
            'SOLAR SHOP',
            'SOLAR CUSTOMER'
        )

        /* Remove Sales Orders */
        AND UPPER(
            TRIM(
                COALESCE(
                    sd.VoucherTypeName,
                    ''
                )
            )
        ) <> 'SALES ORDER'

        /* Invoice number must exist */
        AND TRIM(
            COALESCE(
                sd.VoucherNumber,
                ''
            )
        ) <> ''

    ORDER BY

        sd.Date DESC,
        sd.`Sl No` DESC
";


$result = $conn->query($sql);

if (!$result) {

    echo json_encode([
        "success" => false,
        "count" => 0,
        "data" => [],
        "message" => "Solar query failed: " . $conn->error
    ], JSON_UNESCAPED_UNICODE);

    $conn->close();

    exit;
}


/* =========================================================
   GROUP ITEM ROWS INTO INVOICES
========================================================= */

$invoices = [];


while ($row = $result->fetch_assoc()) {

    $invoiceNo = cleanValue(
        $row["VoucherNumber"]
    );

    if ($invoiceNo === "") {
        continue;
    }


    /* -----------------------------------------------------
       CREATE INVOICE
    ----------------------------------------------------- */

    if (!isset($invoices[$invoiceNo])) {

        $solarType = strtoupper(
            cleanValue(
                $row["EveSolarCust_Shop"]
            )
        );


        $partyName = cleanValue(
            $row["PartyLedgerName"]
        );


        if ($partyName === "") {

            $partyName = cleanValue(
                $row["EveInvMailingName"]
            );
        }


        $invoices[$invoiceNo] = [

            "id" => $row["id"],

            "invoice_no" => $invoiceNo,

            "invoice_date" => cleanDate(
                $row["Date"]
            ),

            "voucher_type" => cleanValue(
                $row["VoucherTypeName"]
            ),

            "solar_type" => $solarType,

            "party_name" => $partyName,

            "mailing_name" => cleanValue(
                $row["EveInvMailingName"]
            ),

            "mailing_address" => cleanValue(
                $row["EveInvMailingAdd"]
            ),

            "mobile" => cleanValue(
                $row["walkin_cust_no"]
            ),

            "order_no" => cleanValue(
                $row["OrderNo"]
            ),

            "reference" => cleanValue(
                $row["Reference"]
            ),

            "assigned_to" => cleanValue(
                $row["assigned_to"]
            ),

            "brought_by" => cleanValue(
                $row["brought_by"]
            ),

            "enquiry_no" => cleanValue(
                $row["enquiry_no"]
            ),

            "invoice_amount" => 0,

            "items" => []
        ];
    }


    /* -----------------------------------------------------
       ADD ITEM AMOUNT
    ----------------------------------------------------- */

    $amount = (float)(
        $row["Amount"] ?? 0
    );


    $invoices[$invoiceNo]["invoice_amount"]
        += $amount;


    /* -----------------------------------------------------
       ADD ITEM
    ----------------------------------------------------- */

    $invoices[$invoiceNo]["items"][] = [

        "id" => $row["id"],

        "item_name" => cleanValue(
            $row["StockItemName"]
        ),

        "item_alias" => cleanValue(
            $row["StockItemAlias"]
        ),

        "quantity" => (float)(
            $row["BilledQty"] ?? 0
        ),

        "batch_rate" => (float)(
            $row["BatchRate"] ?? 0
        ),

        "batch_discount" => (float)(
            $row["BatchDiscount"] ?? 0
        ),

        "rate" => (float)(
            $row["Rate"] ?? 0
        ),

        "discount" => (float)(
            $row["Discount"] ?? 0
        ),

        "amount" => $amount,

        "description" => cleanValue(
            $row["StockItemDescription"]
        ),

        "godown" => cleanValue(
            $row["GodownName"]
        ),

        "temp_description" => cleanValue(
            $row["temp_item_desc"]
        ),

        "gst_rate" => (float)(
            $row["EveItemGstRate"] ?? 0
        ),

        "tax_amount" => (float)(
            $row["EveItemTaxAmt"] ?? 0
        )
    ];
}


/* =========================================================
   CONVERT ASSOCIATIVE ARRAY TO NORMAL ARRAY
========================================================= */

$data = array_values($invoices);


/* =========================================================
   RESPONSE
========================================================= */

echo json_encode(
    [
        "success" => true,
        "count" => count($data),
        "data" => $data
    ],
    JSON_UNESCAPED_UNICODE
);


$conn->close();

?>