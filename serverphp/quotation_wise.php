<?php



require_once __DIR__ . '/api_auth.php';



header("Content-Type: application/json; charset=UTF-8");

header("Access-Control-Allow-Origin: *");

header("Access-Control-Allow-Methods: POST, GET, OPTIONS");

header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");



if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {

    http_response_code(200);

    exit;

}



$conn = new mysqli("localhost", "root", "", "salescollection");



if ($conn->connect_error) {

    echo json_encode([

        "success" => false,

        "count" => 0,

        "data" => [],

        "message" => "Database connection failed: " . $conn->connect_error

    ]);

    exit;

}



$conn->set_charset("utf8mb4");



try {



    /* =========================================================

       1. GET ALL SALES ORDER ROWS

       IMPORTANT:

       Credit-days lookup is NOT joined here.

       Therefore a missing ledger can NEVER remove a quotation.

    ========================================================= */



    $sql = "

        SELECT

            s.`Sl No` AS id,

            s.VoucherTypeName,

            s.VoucherNumber,

            s.OrderNo,

            s.Date,

            s.PartyLedgerName,

            s.EveInvMailingName,

            s.EveInvMailingAdd,

            s.walkin_cust_no,

            s.assigned_to,

            s.brought_by,

            s.enquiry_no,

            s.temp_item_desc,

            s.StockItemName,

            s.StockItemDescription,

            s.BilledQty,

            s.Rate,

            s.Amount,

            s.EveItemGstRate,

            s.EveItemTaxAmt,

            s.GodownName,

            s.Discount,

            s.SafHSNSACCode,

            s.JasBaseUnit,

            s.JasPriBillQty,

            s.JasSecBillQty,

            s.EvePartyCrPeriod,

            s.EnteredBy,
            s.Reference,
            s.EvePartyGSTIN,
            s.EveExecutive,
            s.EveBasicOrderRef,
            s.EveBasicDueDateOfPymt

        FROM salesdata s

        WHERE

            LOWER(TRIM(COALESCE(s.VoucherTypeName, ''))) = 'sales order'

            AND (

                TRIM(COALESCE(s.OrderNo, '')) <> ''

                OR TRIM(COALESCE(s.VoucherNumber, '')) <> ''

            )

        ORDER BY

            s.Date DESC,

            s.`Sl No` DESC

    ";



    $result = $conn->query($sql);



    if (!$result) {

        throw new Exception("Sales Order query failed: " . $conn->error);

    }



    /* =========================================================

       2. LOAD ALL LEDGER CREDIT DAYS SEPARATELY

    ========================================================= */



    $creditDaysMap = [];



    $creditSql = "

        SELECT

            PartyLedgerName,

            `\$_EveBillCrPeriod` AS credit_days

        FROM salesdatalatest33

        WHERE

            TRIM(COALESCE(PartyLedgerName, '')) <> ''

    ";



    $creditResult = $conn->query($creditSql);



    if (!$creditResult) {

        throw new Exception("Credit days query failed: " . $conn->error);

    }



    while ($creditRow = $creditResult->fetch_assoc()) {



        $ledgerKey = strtolower(

            preg_replace(

                '/\s+/',

                ' ',

                trim((string)($creditRow["PartyLedgerName"] ?? ""))

            )

        );



        $creditValue = trim(

            (string)($creditRow["credit_days"] ?? "")

        );



        if ($ledgerKey !== "" && $creditValue !== "") {

            $creditDaysMap[$ledgerKey] = $creditValue;

        }

    }



    $creditResult->free();



    /* =========================================================

       3. GROUP SALES ORDER ROWS INTO QUOTATIONS

    ========================================================= */



    $orders = [];

    $orderMatchMap = [];

    $orderNumberMap = [];



    while ($row = $result->fetch_assoc()) {



        $id = (int)($row["id"] ?? 0);



        $voucherNumber = trim(

            (string)($row["VoucherNumber"] ?? "")

        );



        $orderNo = trim(

            (string)($row["OrderNo"] ?? "")

        );



        $date = trim(

            (string)($row["Date"] ?? "")

        );



        // Keep every quotation separate. Order No. is NOT the unique key.

        $orderKey = $voucherNumber !== ""

            ? $voucherNumber

            : $orderNo;



        if ($orderKey === "") {

            continue;

        }



        $ledgerName = trim(

            (string)($row["PartyLedgerName"] ?? "")

        );



        $mailingName = trim(

            (string)($row["EveInvMailingName"] ?? "")

        );



        $mailingAddress = trim(

            (string)($row["EveInvMailingAdd"] ?? "")

        );



        $originalPartyName = $ledgerName;

        $partyName = $ledgerName;



        /* Credit days are optional. They do not control inclusion. */

        $ledgerKey = strtolower(

            preg_replace(

                '/\s+/',

                ' ',

                trim($ledgerName)

            )

        );



        $creditDays = $creditDaysMap[$ledgerKey] ?? "";



        $walkinCustNo = trim(

            (string)($row["walkin_cust_no"] ?? "")

        );



        $assignedTo = trim(

            (string)($row["assigned_to"] ?? "")

        );



        $broughtBy = trim(

            (string)($row["brought_by"] ?? "")

        );



        $enquiryNo = trim(

            (string)($row["enquiry_no"] ?? "")

        );



        $stockItemName = trim(

            (string)($row["StockItemName"] ?? "")

        );



        $description = trim(

            (string)($row["StockItemDescription"] ?? "")

        );



        $tempItemDesc = trim(

            (string)($row["temp_item_desc"] ?? "")

        );



        $quantity = (float)($row["BilledQty"] ?? 0);

        $rate = (float)($row["Rate"] ?? 0);

        $amount = (float)($row["Amount"] ?? 0);

        $gstRate = (float)($row["EveItemGstRate"] ?? 0);

        $gstAmount = (float)($row["EveItemTaxAmt"] ?? 0);
        $discount = (float)($row["Discount"] ?? 0);
        $godown = trim((string)($row["GodownName"] ?? ""));
        $hsn = trim((string)($row["SafHSNSACCode"] ?? ""));
        $unit = trim((string)($row["JasBaseUnit"] ?? ""));
        // Tally's billed quantity as printed, e.g. "225.00 mtr".
        $quantityText = trim((string)($row["JasPriBillQty"] ?? ""));
        // Quantity in the alternate unit, printed in brackets.
        $secondaryQuantityText = trim((string)($row["JasSecBillQty"] ?? ""));
        $paymentTerms = trim((string)($row["EvePartyCrPeriod"] ?? ""));
        $enteredBy = trim((string)($row["EnteredBy"] ?? ""));
        // Voucher header fields printed on the quotation PDF.
        $headerFields = [
            "reference" => trim((string)($row["Reference"] ?? "")),
            "party_gstin" => trim((string)($row["EvePartyGSTIN"] ?? "")),
            "executive" => trim((string)($row["EveExecutive"] ?? "")),
            "order_ref" => trim((string)($row["EveBasicOrderRef"] ?? "")),
            "payment_due_date" => trim((string)($row["EveBasicDueDateOfPymt"] ?? ""))
        ];

        $amountWithGst = $amount + $gstAmount;



        // Fallback GST calculation when tax amount is not present.

        if ($gstAmount == 0 && $gstRate != 0 && $amount != 0) {

            $gstAmount = $amount * $gstRate / 100;

            $amountWithGst = $amount + $gstAmount;

        }



        $rateWithGst = $rate;

        if ($quantity != 0) {

            $rateWithGst = $amountWithGst / $quantity;

        } elseif ($gstRate != 0) {

            $rateWithGst = $rate * (1 + ($gstRate / 100));

        }



        if (!isset($orders[$orderKey])) {



            $orders[$orderKey] = [

                "id" => $id,

                "quotation_no" => $voucherNumber !== ""

                    ? $voucherNumber

                    : $orderNo,

                "order_no" => $orderNo !== ""

                    ? $orderNo

                    : $voucherNumber,

                "date" => $date,



                "party_name" => $partyName,

                "credit_days" => $creditDays,
                "payment_terms" => $paymentTerms,
                "entered_by" => $enteredBy,

                "mailing_name" => $mailingName,

                "original_party_name" => $originalPartyName,

                "mailing_address" => $mailingAddress,



                "walkin_cust_no" => $walkinCustNo,

                "assigned_to" => $assignedTo,

                "brought_by" => $broughtBy,

                "enquiry_no" => $enquiryNo,



                "ledger_group" => "",

                "mobile" => "",

                "purchase_contact" => "",



                "quotation_amount" => 0,

                "quotation_amount_with_gst" => 0,

                "billed_amount" => 0,

                "billed_gst_amount" => 0,

                "billed_amount_with_gst" => 0,



                "invoice_no" => "",

                "invoice_date" => "",

                "billed_party" => "",

                "billed_party_address" => "",



                "_billed_parties" => [],

                "_invoice_numbers" => [],

                "_invoice_dates" => [],



                "status" => "Quotation Only",

                "description" => $description,

                "items" => []

            ] + $headerFields;

        }



        /* Fill missing values from later item rows. */



        if ($orders[$orderKey]["date"] === "" && $date !== "") {

            $orders[$orderKey]["date"] = $date;

        }



        if (

            $orders[$orderKey]["original_party_name"] === ""

            && $originalPartyName !== ""

        ) {

            $orders[$orderKey]["original_party_name"] = $originalPartyName;

        }



        if (

            $orders[$orderKey]["mailing_name"] === ""

            && $mailingName !== ""

        ) {

            $orders[$orderKey]["mailing_name"] = $mailingName;

        }



        if (

            $orders[$orderKey]["mailing_address"] === ""

            && $mailingAddress !== ""

        ) {

            $orders[$orderKey]["mailing_address"] = $mailingAddress;

        }



        if (

            $orders[$orderKey]["credit_days"] === ""

            && $creditDays !== ""

        ) {

            $orders[$orderKey]["credit_days"] = $creditDays;

        }



        if (
            $orders[$orderKey]["payment_terms"] === ""
            && $paymentTerms !== ""
        ) {
            $orders[$orderKey]["payment_terms"] = $paymentTerms;
        }

        if (
            $orders[$orderKey]["entered_by"] === ""
            && $enteredBy !== ""
        ) {
            $orders[$orderKey]["entered_by"] = $enteredBy;
        }
        foreach ($headerFields as $field => $value) {
            if ($orders[$orderKey][$field] === "" && $value !== "") {
                $orders[$orderKey][$field] = $value;
            }
        }

        if (

            $orders[$orderKey]["walkin_cust_no"] === ""

            && $walkinCustNo !== ""

        ) {

            $orders[$orderKey]["walkin_cust_no"] = $walkinCustNo;

        }



        if (

            $orders[$orderKey]["assigned_to"] === ""

            && $assignedTo !== ""

        ) {

            $orders[$orderKey]["assigned_to"] = $assignedTo;

        }



        if (

            $orders[$orderKey]["brought_by"] === ""

            && $broughtBy !== ""

        ) {

            $orders[$orderKey]["brought_by"] = $broughtBy;

        }



        if (

            $orders[$orderKey]["enquiry_no"] === ""

            && $enquiryNo !== ""

        ) {

            $orders[$orderKey]["enquiry_no"] = $enquiryNo;

        }



        if (

            $orders[$orderKey]["description"] === ""

            && $description !== ""

        ) {

            $orders[$orderKey]["description"] = $description;

        }



        $orders[$orderKey]["quotation_amount"] += $amount;

        $orders[$orderKey]["quotation_amount_with_gst"] += $amountWithGst;



        if (

            $stockItemName !== ""

            || $description !== ""

            || $tempItemDesc !== ""

            || $quantity != 0

            || $rate != 0

            || $amount != 0

        ) {

            $orders[$orderKey]["items"][] = [

                "item_name" => $stockItemName !== ""

                    ? $stockItemName

                    : $description,

                "temp_item_desc" => $tempItemDesc,

                "description" => $description,

                "quantity" => $quantity,

                "rate" => $rate,

                "rate_with_gst" => $rateWithGst,

                "gst_rate" => $gstRate,

                "gst_amount" => $gstAmount,

                "value" => $amount,

                "value_with_gst" => $amountWithGst,

                "hsn" => $hsn,

                "unit" => $unit,

                "quantity_text" => $quantityText,

                "secondary_quantity_text" => $secondaryQuantityText,

                "godown" => $godown,

                "discount" => $discount

            ];

        }



        /* Match map for invoice references. */

        $quotationNo = $voucherNumber !== ""

            ? $voucherNumber

            : $orderNo;



        $normalizedQuotation = strtolower(trim($quotationNo));



        if ($normalizedQuotation !== "") {

            $orderMatchMap[$normalizedQuotation] = $orderKey;

        }



        /* Keep ALL quotations for each Order No. */

        $normalizedOrderNo = strtolower(trim($orderNo));



        if ($normalizedOrderNo !== "") {

            if (!isset($orderNumberMap[$normalizedOrderNo])) {

                $orderNumberMap[$normalizedOrderNo] = [];

            }



            if (!in_array($orderKey, $orderNumberMap[$normalizedOrderNo], true)) {

                $orderNumberMap[$normalizedOrderNo][] = $orderKey;

            }



            // Preserve one Order No. lookup for invoice references.

            if (!isset($orderMatchMap[$normalizedOrderNo])) {

                $orderMatchMap[$normalizedOrderNo] = $orderKey;

            }

        }

    }



    $result->free();



    /* =========================================================

       4. GET INVOICES

    ========================================================= */



    $invoiceSql = "

        SELECT

            VoucherNumber,

            Date,

            PartyLedgerName,

            EveInvMailingName,

            EveInvMailingAdd,

            Amount,

            EveItemGstRate,

            EveItemTaxAmt,

            EveInvVchOrderNos

        FROM salesdata

        WHERE

            LOWER(TRIM(COALESCE(VoucherTypeName, ''))) <> 'sales order'

            AND EveInvVchOrderNos IS NOT NULL

            AND TRIM(EveInvVchOrderNos) <> ''

    ";



    $invoiceResult = $conn->query($invoiceSql);



    if (!$invoiceResult) {

        throw new Exception(

            "Invoice query failed: " . $conn->error

        );

    }



    /* =========================================================

       5. MATCH INVOICES TO QUOTATIONS

    ========================================================= */



    while ($invoiceRow = $invoiceResult->fetch_assoc()) {



        $reference = trim(

            (string)($invoiceRow["EveInvVchOrderNos"] ?? "")

        );



        if ($reference === "") {

            continue;

        }



        $references = preg_split(
            '/\s*[,;\r\n]+\s*/',
            $reference
        );



        $references[] = $reference;



        $references = array_values(

            array_unique(

                array_filter(

                    array_map("trim", $references)

                )

            )

        );



        foreach ($references as $ref) {



            if ($ref === "") {

                continue;

            }



            $normalizedRef = strtolower(trim($ref));



            if (!isset($orderMatchMap[$normalizedRef])) {

                continue;

            }



            $matchedOrderKey =

                $orderMatchMap[$normalizedRef];



            if (!isset($orders[$matchedOrderKey])) {

                continue;

            }



            $order =& $orders[$matchedOrderKey];



            $invoiceAmount = (float)(

                $invoiceRow["Amount"] ?? 0

            );



            $invoiceGstRate = (float)(

                $invoiceRow["EveItemGstRate"] ?? 0

            );



            $invoiceGstAmount = (float)(

                $invoiceRow["EveItemTaxAmt"] ?? 0

            );



            // Use Tally's exported tax amount when available.

            // If tax amount is missing, calculate it from the GST rate.

            if (

                $invoiceGstAmount == 0

                && $invoiceGstRate != 0

                && $invoiceAmount != 0

            ) {

                $invoiceGstAmount =

                    $invoiceAmount * $invoiceGstRate / 100;

            }



            $order["billed_amount"] += $invoiceAmount;

            $order["billed_gst_amount"] += $invoiceGstAmount;

            $order["billed_amount_with_gst"] +=

                $invoiceAmount + $invoiceGstAmount;



            $invoiceNo = trim(

                (string)($invoiceRow["VoucherNumber"] ?? "")

            );



            if ($invoiceNo !== "") {



                if (

                    !in_array(

                        $invoiceNo,

                        $order["_invoice_numbers"],

                        true

                    )

                ) {

                    $order["_invoice_numbers"][] =

                        $invoiceNo;

                }



                $order["invoice_no"] = implode(

                    ", ",

                    $order["_invoice_numbers"]

                );

            }



            $invoiceDate = trim((string)($invoiceRow["Date"] ?? ""));

            if ($invoiceDate !== "") {
                if (!in_array($invoiceDate, $order["_invoice_dates"], true)) {
                    $order["_invoice_dates"][] = $invoiceDate;
                }
                $order["invoice_date"] = implode(", ", $order["_invoice_dates"]);
            }

            $invoiceMailingName = trim(

                (string)(

                    $invoiceRow["EveInvMailingName"] ?? ""

                )

            );



            $invoiceLedgerName = trim(

                (string)(

                    $invoiceRow["PartyLedgerName"] ?? ""

                )

            );



            $invoiceParty =

                $invoiceMailingName !== ""

                    ? $invoiceMailingName

                    : $invoiceLedgerName;



            if (

                $order["mailing_name"] === ""

                && $invoiceMailingName !== ""

            ) {

                $order["mailing_name"] =

                    $invoiceMailingName;

            }



            $invoicePartyAddress = trim(

                (string)(

                    $invoiceRow["EveInvMailingAdd"] ?? ""

                )

            );



            if (

                $invoicePartyAddress !== ""

                && $order["billed_party_address"] === ""

            ) {

                $order["billed_party_address"] =

                    $invoicePartyAddress;

            }



            if ($invoiceParty !== "") {



                $partyKey = strtolower(

                    preg_replace(

                        '/\s+/',

                        ' ',

                        trim($invoiceParty)

                    )

                );



                if (

                    !isset(

                        $order["_billed_parties"][$partyKey]

                    )

                ) {

                    $order["_billed_parties"][$partyKey] =

                        $invoiceParty;

                }

            }



            $order["status"] = "Billed";



            unset($order);

        }

    }



    $invoiceResult->free();



    /* =========================================================

       6. MARK DUPLICATE ORDER NUMBERS

    ========================================================= */



    foreach ($orders as &$order) {

        $key = strtolower(trim((string)($order["order_no"] ?? "")));

        $order["duplicate_order"] = $key !== ""

            && isset($orderNumberMap[$key])

            && count($orderNumberMap[$key]) > 1;

        $order["duplicate_order_count"] = ($key !== "" && isset($orderNumberMap[$key]))

            ? count($orderNumberMap[$key])

            : 1;

    }

    unset($order);



    /* =========================================================

       7. FINALIZE

    ========================================================= */



    foreach ($orders as &$order) {



        $order["quotation_amount"] = round(

            (float)$order["quotation_amount"],

            2

        );



        /*

         * Tally-style total:

         * Taxable Amount + GST is rounded to the nearest rupee.

         * Example:

         * 7,94,247.36 + 1,42,964.53 = 9,37,211.89

         * Tally displays the final total as 9,37,212.00.

         */

        $order["quotation_gst_amount"] = round(

            (float)$order["quotation_amount_with_gst"]

                - (float)$order["quotation_amount"],

            2

        );



        $order["quotation_amount_with_gst"] = round(

            (float)$order["quotation_amount_with_gst"],

            0

        );



        $order["quotation_amount_with_gst"] = round(

            (float)$order["quotation_amount_with_gst"],

            2

        );



        $order["billed_amount"] = round(

            (float)$order["billed_amount"],

            2

        );



        $order["billed_gst_amount"] = round(

            (float)$order["billed_gst_amount"],

            2

        );



        $order["billed_amount_with_gst"] = round(

            (float)$order["billed_amount_with_gst"],

            0

        );



        $order["billed_amount_with_gst"] = round(

            (float)$order["billed_amount_with_gst"],

            2

        );



        if (!empty($order["_billed_parties"])) {

            $order["billed_party"] = implode(

                ", ",

                array_values($order["_billed_parties"])

            );

        } else {

            $order["billed_party"] = "";

        }



        if (

            $order["billed_amount"] > 0

            || trim((string)$order["invoice_no"]) !== ""

        ) {

            $order["status"] = "Billed";

        } else {

            $order["status"] = "Quotation Only";

        }



        if ($order["status"] !== "Billed") {

            $order["billed_party"] = "";

            $order["billed_party_address"] = "";

            $order["invoice_no"] = "";
            $order["invoice_date"] = "";

            $order["billed_amount"] = 0;

            $order["billed_gst_amount"] = 0;

            $order["billed_amount_with_gst"] = 0;

        }



        unset(

            $order["_billed_parties"],

            $order["_invoice_numbers"]

        );

    }



    unset($order);



    /* =========================================================

       7. SORT BY DATE / QUOTATION

    ========================================================= */



    $orders = array_values($orders);



    usort(

        $orders,

        function ($a, $b) {



            $dateA = strtotime(

                (string)($a["date"] ?? "")

            );



            $dateB = strtotime(

                (string)($b["date"] ?? "")

            );



            if ($dateA !== $dateB) {

                return $dateB <=> $dateA;

            }



            return strnatcasecmp(

                (string)($b["order_no"] ?? ""),

                (string)($a["order_no"] ?? "")

            );

        }

    );



    /* =========================================================

       8. RESPONSE

    ========================================================= */



    echo json_encode(

        [

            "success" => true,

            "count" => count($orders),

            "data" => $orders

        ],

        JSON_UNESCAPED_UNICODE |

        JSON_UNESCAPED_SLASHES

    );



} catch (Throwable $e) {



    http_response_code(500);



    echo json_encode(

        [

            "success" => false,

            "count" => 0,

            "data" => [],

            "message" => $e->getMessage()

        ],

        JSON_UNESCAPED_UNICODE |

        JSON_UNESCAPED_SLASHES

    );



} finally {



    if (

        isset($conn)

        && $conn instanceof mysqli

    ) {

        $conn->close();

    }

}



?>
