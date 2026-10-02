<?php

require_once __DIR__ . '/api_auth.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

mysqli_report(MYSQLI_REPORT_OFF);


/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
|
| Local testing:
|
| salescollection
|     -> salesdata
|
| tally_db
|     -> kseb_directory
|
*/

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);

if ($conn->connect_error) {

    http_response_code(500);

    echo json_encode(
        [
            "success" => false,
            "count" => 0,
            "data" => [],
            "message" => "Database connection failed: " . $conn->connect_error
        ],
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    exit;
}

$conn->set_charset("utf8mb4");


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanValue($value): string
{
    return trim((string)($value ?? ""));
}




function normalizeDirectoryAreaType($value): string
{
    $value = strtoupper(trim((string)($value ?? "")));
    $value = preg_replace('/\s+/', ' ', $value);
    $value = str_replace('-', ' ', $value);

    if (strpos($value, 'CIRCLE') !== false) return 'CIRCLE';
    if ($value === 'DIVISION' || strpos($value, 'DIVISION') !== false) return 'DIVISION';
    if ($value === 'SUB DIVISION' || $value === 'SUBDIVISION' || strpos($value, 'SUB DIVISION') !== false) return 'SUBDIVISION';
    if (strpos($value, 'SECTION') !== false) return 'SECTION';

    return '';
}

function numberValue($value): float
{
    if ($value === null || $value === "") {
        return 0.0;
    }

    $value = str_replace(
        [",", "₹", " "],
        "",
        (string)$value
    );

    return is_numeric($value)
        ? (float)$value
        : 0.0;
}


/*
|--------------------------------------------------------------------------
| DISTRIBUTION
|--------------------------------------------------------------------------
|
| THIS IS YOUR ORIGINAL DISTRIBUTION FUNCTION.
|
| Priority:
|
| 1. Transmission / Substation / Transco
| 2. South
| 3. North
| 4. Central
|
| Transmission returns exactly:
| "Transmission"
|
*/

function getDistribution(
    $tallyName,
    $directoryName,
    $parentArea,
    $place,
    $area
): string {
    // kseb_directory.PARENT_AREA is the authoritative
    // KSEB distribution classification.
    $parentArea = cleanValue($parentArea);

    return $parentArea !== ""
        ? $parentArea
        : "Unmapped";
}


try {


    /*
    |--------------------------------------------------------------------------
    | SALES QUERY
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | kseb_ledger_mapping IS NOT USED ANYMORE.
    |
    | PartyLedgerName from salesdata is compared directly with
    | kseb_directory.tally_name.
    |
    | Example:
    |
    | salesdata.PartyLedgerName
    |
    |             =
    |
    | kseb_directory.tally_name
    |
    |
    | Only ONE directory record is selected for each tally_name.
    |
    | MIN(id) is used when duplicate tally_name values exist.
    |
    |--------------------------------------------------------------------------
    */

    $sql = "

        SELECT

            /* SOURCE ROW */

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

            /* GST */

            sd.EveItemGstRate,
            sd.EveItemTaxAmt,

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


            /*
            |--------------------------------------------------------------------------
            | DIRECT KSEB DIRECTORY
            |--------------------------------------------------------------------------
            |
            | PartyLedgerName = tally_name
            |
            */

            kd.id AS direct_directory_id,

            kd.tally_name AS direct_tally_name,

            kd.NAME AS direct_directory_name,

            kd.PARENT_AREA AS direct_parent_area,

            kd.PLACE AS direct_place,

            kd.AREA AS direct_area


        FROM salesdata sd


        /*
        |--------------------------------------------------------------------------
        | DIRECT KSEB DIRECTORY MATCH
        |--------------------------------------------------------------------------
        |
        | Match:
        |
        | salesdata.PartyLedgerName
        |
        | with
        |
        | kseb_directory.tally_name
        |
        | Case-insensitive and trimmed.
        |
        */

        LEFT JOIN tally_db.kseb_directory kd

            ON kd.id = (

                SELECT MIN(kd_match.id)

                FROM tally_db.kseb_directory kd_match

                WHERE
                    TRIM(COALESCE(kd_match.tally_name, '')) <> ''

                    AND FIND_IN_SET(
                        LOWER(TRIM(COALESCE(sd.PartyLedgerName, ''))),
                        REPLACE(
                            REPLACE(
                                REPLACE(
                                    LOWER(TRIM(COALESCE(kd_match.tally_name, ''))),
                                    ' , ',
                                    ','
                                ),
                                ' ,',
                                ','
                            ),
                            ', ',
                            ','
                        )
                    ) > 0
            )


        /*
        |--------------------------------------------------------------------------
        | FILTER
        |--------------------------------------------------------------------------
        */

        WHERE

            LOWER(
                TRIM(
                    COALESCE(
                        sd.PartyLedgerName,
                        ''
                    )
                )
            ) LIKE 'kseb%'


            AND LOWER(
                TRIM(
                    COALESCE(
                        sd.VoucherTypeName,
                        ''
                    )
                )
            ) IN (

                'gst sales b2b',
                'gst sales b2c'

            )


            AND TRIM(
                COALESCE(
                    sd.VoucherNumber,
                    ''
                )
            ) <> ''


        /*
        |--------------------------------------------------------------------------
        | ORDER
        |--------------------------------------------------------------------------
        */

        ORDER BY

            sd.Date DESC,
            sd.`Sl No` DESC

    ";


    /*
    |--------------------------------------------------------------------------
    | EXECUTE SALES QUERY
    |--------------------------------------------------------------------------
    */

    $result = $conn->query($sql);


    if (!$result) {

        throw new Exception(
            "KSEB invoice query failed: " .
            $conn->error
        );
    }


    /*
    |--------------------------------------------------------------------------
    | INVOICES
    |--------------------------------------------------------------------------
    */

    $invoices = [];


    /*
    |--------------------------------------------------------------------------
    | PROCESS SALES ROWS
    |--------------------------------------------------------------------------
    |
    | Every salesdata row is processed.
    |
    | No duplicate-item filtering.
    |
    */

    while ($row = $result->fetch_assoc()) {


        /*
        |--------------------------------------------------------------------------
        | SOURCE ROW ID
        |--------------------------------------------------------------------------
        */

        $sourceRowId =
            cleanValue(
                $row["id"]
            );


        /*
        |--------------------------------------------------------------------------
        | INVOICE NUMBER
        |--------------------------------------------------------------------------
        */

        $invoiceNo =
            cleanValue(
                $row["VoucherNumber"]
            );


        if ($invoiceNo === "") {
            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | BASIC VALUES
        |--------------------------------------------------------------------------
        */

        $salesId =
            cleanValue(
                $row["sales_id"]
            );


        $party =
            cleanValue(
                $row["PartyLedgerName"]
            );


        $itemName =
            cleanValue(
                $row["StockItemName"]
            );


        $quantity =
            numberValue(
                $row["BilledQty"]
            );


        $rate =
            numberValue(
                $row["Rate"]
            );


        $amount =
            numberValue(
                $row["Amount"]
            );


        $gstRate =
            numberValue(
                $row["EveItemGstRate"]
            );


        $gstAmount =
            numberValue(
                $row["EveItemTaxAmt"]
            );


        $godown =
            cleanValue(
                $row["GodownName"]
            );


        $batch =
            cleanValue(
                $row["BatchName"]
            );


        /*
        |--------------------------------------------------------------------------
        | GST CALCULATION
        |--------------------------------------------------------------------------
        |
        | 1. Use EveItemTaxAmt.
        | 2. If zero, calculate using GST rate.
        |
        */

        if (
            $gstAmount == 0
            &&
            $gstRate != 0
            &&
            $amount != 0
        ) {

            $gstAmount =
                $amount
                *
                $gstRate
                /
                100;
        }


        /*
        |--------------------------------------------------------------------------
        | FINAL ITEM AMOUNT
        |--------------------------------------------------------------------------
        */

        $amountWithGst =
            $amount
            +
            $gstAmount;


        /*
        |--------------------------------------------------------------------------
        | RATE INCLUDING GST
        |--------------------------------------------------------------------------
        */

        $rateWithGst =
            $rate;


        if ($quantity != 0) {

            $rateWithGst =
                $amountWithGst
                /
                $quantity;

        } elseif ($gstRate != 0) {

            $rateWithGst =
                $rate
                *
                (
                    1
                    +
                    ($gstRate / 100)
                );
        }


        /*
        |--------------------------------------------------------------------------
        | DIRECT KSEB DIRECTORY
        |--------------------------------------------------------------------------
        |
        | This is now the ONLY mapping source.
        |
        */

        $directDirectoryId =
            cleanValue(
                $row["direct_directory_id"]
            );


        $directTallyName =
            cleanValue(
                $row["direct_tally_name"]
            );


        $directDirectoryName =
            cleanValue(
                $row["direct_directory_name"]
            );


        $directParentArea =
            cleanValue(
                $row["direct_parent_area"]
            );


        $directPlace =
            cleanValue(
                $row["direct_place"]
            );


        $directArea =
            cleanValue(
                $row["direct_area"]
            );


        /*
        |--------------------------------------------------------------------------
        | SELECT DIRECTORY
        |--------------------------------------------------------------------------
        |
        | Since there is no ledger mapping anymore:
        |
        | MATCHED
        |     -> use kseb_directory
        |
        | NOT MATCHED
        |     -> Unmapped
        |
        */

        if ($directDirectoryId !== "") {

            $finalDirectoryId =
                $directDirectoryId;

            $finalTallyName =
                $directTallyName;

            $finalDirectoryName =
                $directDirectoryName;

            $finalParentArea =
                $directParentArea;

            $finalPlace =
                $directPlace;

            $finalArea =
                $directArea;

            $finalMappingMethod =
                "DIRECT_TALLY_NAME";

        } else {

            $finalDirectoryId =
                "";

            $finalTallyName =
                "";

            $finalDirectoryName =
                "";

            $finalParentArea =
                "";

            $finalPlace =
                "";

            $finalArea =
                "";

            $finalMappingMethod =
                "UNMAPPED";
        }


        /*
        |--------------------------------------------------------------------------
        | DISTRIBUTION
        |--------------------------------------------------------------------------
        */

        $distribution =
            getDistribution(
                $finalTallyName,
                $finalDirectoryName,
                $finalParentArea,
                $finalPlace,
                $finalArea
            );


        /*
        |--------------------------------------------------------------------------
        | INVOICE KEY
        |--------------------------------------------------------------------------
        */

        $invoiceKey =
            strtolower(
                $invoiceNo
            );


        /*
        |--------------------------------------------------------------------------
        | CREATE INVOICE
        |--------------------------------------------------------------------------
        */

        if (
            !isset(
                $invoices[$invoiceKey]
            )
        ) {

            $invoices[$invoiceKey] = [

                /*
                |--------------------------------------------------------------------------
                | BASIC
                |--------------------------------------------------------------------------
                */

                "invoice_no" =>
                    $invoiceNo,

                "invoice_date" =>
                    cleanValue(
                        $row["Date"]
                    ),

                "voucher_type" =>
                    cleanValue(
                        $row["VoucherTypeName"]
                    ),

                "reference" =>
                    cleanValue(
                        $row["Reference"]
                    ),

                "order_no" =>
                    cleanValue(
                        $row["OrderNo"]
                    ),

                "party_name" =>
                    $party,

                /*
                | Actual Tally Party Ledger Name from salesdata.
                | This is used by the frontend table display.
                */
                "party_ledger_name" =>
                    $party,

                "parent_ledger_name" =>
                    cleanValue(
                        $row["ParentLedgerName"]
                    ),

                "grandparent" =>
                    cleanValue(
                        $row["ledger_grand_parent"]
                    ),


                /*
                |--------------------------------------------------------------------------
                | MAPPING
                |--------------------------------------------------------------------------
                */

                "tally_name" =>
                    $finalTallyName,

                /*
                | No kseb_ledger_mapping is used now.
                |
                | Kept as empty string so the existing frontend
                | response structure does not break.
                */

                "mapped_kseb_code" =>
                    "",

                "directory_id" =>
                    $finalDirectoryId,

                "kseb_directory_name" =>
                    $finalDirectoryName,

                "distribution_type" =>
                    $finalParentArea,

                "distribution_name" =>
                    $finalPlace,

                "directory_area" =>
                    $finalArea,

                "hierarchy_level" =>
                    normalizeDirectoryAreaType($finalArea),

                "hierarchy_name" =>
                    $finalPlace,

                "area_type" =>
                    normalizeDirectoryAreaType($finalArea),

                "area_name" =>
                    $finalPlace,

                "place" =>
                    $finalPlace,

                "area" =>
                    $finalArea,

                "distribution" =>
                    $distribution,

                "mapping_method" =>
                    $finalMappingMethod,

                /*
                | No confidence value because
                | kseb_ledger_mapping is no longer used.
                */

                "mapping_confidence" =>
                    0,

                "mapping_status" =>
                    $finalDirectoryId !== ""
                    ? "MAPPED"
                    : "UNMAPPED",


                /*
                |--------------------------------------------------------------------------
                | CUSTOMER
                |--------------------------------------------------------------------------
                */

                "mailing_name" =>
                    cleanValue(
                        $row["EveInvMailingName"]
                    ),

                "mailing_address" =>
                    cleanValue(
                        $row["EveInvMailingAdd"]
                    ),

                "mobile" =>
                    cleanValue(
                        $row["walkin_cust_no"]
                    ),


                /*
                |--------------------------------------------------------------------------
                | OTHER
                |--------------------------------------------------------------------------
                */

                "credit_period" =>
                    cleanValue(
                        $row["EvePartyCrPeriod"]
                    ),

                "assigned_to" =>
                    cleanValue(
                        $row["assigned_to"]
                    ),

                "brought_by" =>
                    cleanValue(
                        $row["brought_by"]
                    ),

                "enquiry_no" =>
                    cleanValue(
                        $row["enquiry_no"]
                    ),

                "narration" =>
                    cleanValue(
                        $row["Narration"]
                    ),

                "entered_by" =>
                    cleanValue(
                        $row["EnteredBy"]
                    ),

                "altered_by" =>
                    cleanValue(
                        $row["AlteredBy"]
                    ),

                "sales_ledger" =>
                    cleanValue(
                        $row["JasSalesLedName"]
                    ),


                /*
                |--------------------------------------------------------------------------
                | GODOWNS
                |--------------------------------------------------------------------------
                */

                "godown_names" =>
                    [],


                /*
                |--------------------------------------------------------------------------
                | TOTALS
                |--------------------------------------------------------------------------
                */

                "invoice_amount" =>
                    0.0,

                "gst_amount" =>
                    0.0,

                "base_amount" =>
                    0.0,


                /*
                |--------------------------------------------------------------------------
                | ITEM COUNT
                |--------------------------------------------------------------------------
                */

                "item_count" =>
                    0,


                /*
                |--------------------------------------------------------------------------
                | SOURCE ROW COUNT
                |--------------------------------------------------------------------------
                */

                "source_row_count" =>
                    0,


                /*
                |--------------------------------------------------------------------------
                | ITEMS
                |--------------------------------------------------------------------------
                */

                "items" =>
                    []

            ];
        }


        /*
        |--------------------------------------------------------------------------
        | REFERENCE
        |--------------------------------------------------------------------------
        */

        $invoice =&
            $invoices[$invoiceKey];


        /*
        |--------------------------------------------------------------------------
        | UPDATE MAPPING IF CURRENT ROW HAS A DIRECTORY MATCH
        |--------------------------------------------------------------------------
        */

        if (
            $finalDirectoryId !== ""
        ) {

            $invoice["tally_name"] =
                $finalTallyName;

            $invoice["directory_id"] =
                $finalDirectoryId;

            $invoice["kseb_directory_name"] =
                $finalDirectoryName;

            $invoice["distribution_type"] =
                $finalParentArea;

            $invoice["distribution_name"] =
                $finalPlace;

            $invoice["directory_area"] =
                $finalArea;

            $invoice["hierarchy_level"] =
                normalizeDirectoryAreaType($finalArea);

            $invoice["hierarchy_name"] =
                $finalPlace;

            $invoice["area_type"] =
                normalizeDirectoryAreaType($finalArea);

            $invoice["area_name"] =
                $finalPlace;

            $invoice["place"] =
                $finalPlace;

            $invoice["area"] =
                $finalArea;

            $invoice["distribution"] =
                $distribution;

            $invoice["mapping_method"] =
                "DIRECT_TALLY_NAME";

            $invoice["mapping_status"] =
                "MAPPED";
        }


        /*
        |--------------------------------------------------------------------------
        | BASE TOTAL
        |--------------------------------------------------------------------------
        */

        $invoice["base_amount"] +=
            $amount;


        /*
        |--------------------------------------------------------------------------
        | GST TOTAL
        |--------------------------------------------------------------------------
        */

        $invoice["gst_amount"] +=
            $gstAmount;


        /*
        |--------------------------------------------------------------------------
        | FINAL INVOICE TOTAL
        |--------------------------------------------------------------------------
        */

        $invoice["invoice_amount"] +=
            $amountWithGst;


        /*
        |--------------------------------------------------------------------------
        | SOURCE ROW COUNT
        |--------------------------------------------------------------------------
        */

        $invoice["source_row_count"]++;


        /*
        |--------------------------------------------------------------------------
        | GODOWN
        |--------------------------------------------------------------------------
        */

        if ($godown !== "") {

            $invoice["godown_names"][] =
                $godown;
        }


        /*
        |--------------------------------------------------------------------------
        | ITEM
        |--------------------------------------------------------------------------
        */

        $itemDescription =
            cleanValue(
                $row["StockItemDescription"]
            );


        $tempDescription =
            cleanValue(
                $row["temp_item_desc"]
            );


        $discount =
            numberValue(
                $row["Discount"]
            );


        /*
        |--------------------------------------------------------------------------
        | ADD ITEM
        |--------------------------------------------------------------------------
        |
        | NO DUPLICATE CHECK.
        |
        */

        if (

            $itemName !== ""

            ||

            $itemDescription !== ""

            ||

            $tempDescription !== ""

            ||

            $quantity != 0

            ||

            $rate != 0

            ||

            $amount != 0

        ) {

            $invoice["items"][] = [

                /*
                |--------------------------------------------------------------------------
                | ORIGINAL SALESDATA ROW
                |--------------------------------------------------------------------------
                */

                "source_row_id" =>
                    $sourceRowId,


                /*
                |--------------------------------------------------------------------------
                | ITEM
                |--------------------------------------------------------------------------
                */

                "item_name" =>
                    $itemName,

                "item_alias" =>
                    cleanValue(
                        $row["StockItemAlias"]
                    ),

                "item_parent" =>
                    cleanValue(
                        $row["StockItemParent"]
                    ),

                "item_grand_parent" =>
                    cleanValue(
                        $row["StockItemGrandParent"]
                    ),

                "description" =>
                    $itemDescription,

                "temp_description" =>
                    $tempDescription,

                "category" =>
                    cleanValue(
                        $row["StockItemCategory"]
                    ),


                /*
                |--------------------------------------------------------------------------
                | GODOWN / BATCH
                |--------------------------------------------------------------------------
                */

                "godown" =>
                    $godown,

                "batch" =>
                    $batch,


                /*
                |--------------------------------------------------------------------------
                | QUANTITY
                |--------------------------------------------------------------------------
                */

                "quantity" =>
                    $quantity,


                /*
                |--------------------------------------------------------------------------
                | BATCH
                |--------------------------------------------------------------------------
                */

                "batch_rate" =>
                    numberValue(
                        $row["BatchRate"]
                    ),

                "batch_discount" =>
                    numberValue(
                        $row["BatchDiscount"]
                    ),


                /*
                |--------------------------------------------------------------------------
                | RATE
                |--------------------------------------------------------------------------
                */

                "rate" =>
                    round(
                        $rate,
                        2
                    ),

                "rate_with_gst" =>
                    round(
                        $rateWithGst,
                        2
                    ),


                /*
                |--------------------------------------------------------------------------
                | DISCOUNT
                |--------------------------------------------------------------------------
                */

                "discount" =>
                    $discount,


                /*
                |--------------------------------------------------------------------------
                | GST
                |--------------------------------------------------------------------------
                */

                "gst_rate" =>
                    round(
                        $gstRate,
                        4
                    ),

                "gst_amount" =>
                    round(
                        $gstAmount,
                        2
                    ),


                /*
                |--------------------------------------------------------------------------
                | BASE AMOUNT
                |--------------------------------------------------------------------------
                */

                "amount" =>
                    round(
                        $amount,
                        2
                    ),


                /*
                |--------------------------------------------------------------------------
                | FINAL AMOUNT
                |--------------------------------------------------------------------------
                */

                "amount_with_gst" =>
                    round(
                        $amountWithGst,
                        2
                    ),


                /*
                |--------------------------------------------------------------------------
                | SALES ID
                |--------------------------------------------------------------------------
                */

                "sales_id" =>
                    $salesId
            ];


            $invoice["item_count"]++;
        }


        unset($invoice);
    }


    $result->free();


    /*
    |--------------------------------------------------------------------------
    | FINALIZE INVOICES
    |--------------------------------------------------------------------------
    */

    foreach (
        $invoices as &$invoice
    ) {


        /*
        |--------------------------------------------------------------------------
        | GODOWN UNIQUE LIST
        |--------------------------------------------------------------------------
        */

        $invoice["godown_names"] =
            array_values(
                array_unique(
                    array_filter(
                        array_map(
                            "trim",
                            $invoice["godown_names"]
                        )
                    )
                )
            );


        /*
        |--------------------------------------------------------------------------
        | GODOWN STRING
        |--------------------------------------------------------------------------
        */

        $invoice["godown"] =
            implode(
                ", ",
                $invoice["godown_names"]
            );


        /*
        |--------------------------------------------------------------------------
        | ROUND TOTALS
        |--------------------------------------------------------------------------
        */

        $invoice["base_amount"] =
            round(
                (float)$invoice["base_amount"],
                2
            );


        $invoice["gst_amount"] =
            round(
                (float)$invoice["gst_amount"],
                2
            );


        $invoice["invoice_amount"] =
            round(
                (float)$invoice["invoice_amount"],
                2
            );


        /*
        |--------------------------------------------------------------------------
        | DISTRIBUTION SAFETY
        |--------------------------------------------------------------------------
        */

        if (
            cleanValue(
                $invoice["distribution"]
            ) === ""
        ) {

            $invoice["distribution"] =
                "Unmapped";
        }


        /*
        |--------------------------------------------------------------------------
        | ITEM COUNT SAFETY
        |--------------------------------------------------------------------------
        */

        $invoice["item_count"] =
            count(
                $invoice["items"]
            );


        /*
        |--------------------------------------------------------------------------
        | SOURCE ROW COUNT SAFETY
        |--------------------------------------------------------------------------
        */

        $invoice["source_row_count"] =
            (int)$invoice["source_row_count"];
    }


    unset($invoice);


    /*
    |--------------------------------------------------------------------------
    | ARRAY
    |--------------------------------------------------------------------------
    */

    $data =
        array_values(
            $invoices
        );


    /*
    |--------------------------------------------------------------------------
    | SORT
    |--------------------------------------------------------------------------
    */

    usort(
        $data,
        function ($a, $b) {

            $dateA =
                strtotime(
                    $a["invoice_date"] ?? ""
                ) ?: 0;


            $dateB =
                strtotime(
                    $b["invoice_date"] ?? ""
                ) ?: 0;


            if ($dateA === $dateB) {

                return strnatcasecmp(
                    (string)(
                        $b["invoice_no"] ?? ""
                    ),
                    (string)(
                        $a["invoice_no"] ?? ""
                    )
                );
            }


            return $dateB <=> $dateA;
        }
    );


    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    echo json_encode(

        [
            "success" =>
                true,

            "count" =>
                count($data),

            "data" =>
                $data
        ],

        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES

    );


} catch (Throwable $e) {

    http_response_code(500);

    echo json_encode(

        [
            "success" =>
                false,

            "count" =>
                0,

            "data" =>
                [],

            "message" =>
                $e->getMessage()
        ],

        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES

    );

} finally {

    if ($conn) {
        $conn->close();
    }
}

?>