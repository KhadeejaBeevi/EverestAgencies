<?php
require_once __DIR__ . '/api_auth.php';
require_once __DIR__ . '/db_connect.php';

date_default_timezone_set("Asia/Kolkata");

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

/* The JSON is large (every bill, receipt and voucher): send it gzip
   compressed when the browser accepts it, unless the server already
   compresses the output. */
if (extension_loaded("zlib") && !ini_get("zlib.output_compression")) {
    ob_start("ob_gzhandler");
}

/* Database login comes from db_connect.php on the server. */
try {
    $pdo = db_pdo("salescollection", [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
} catch (Throwable $e) {
    error_log("KSEB OUTSTANDING DB ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "count" => 0,
        "bills" => [],
        "message" => "Database connection failed."
    ]);
    exit;
}

/*
|--------------------------------------------------------------------------
| KSEB OUTSTANDING (TALLY BILL-WISE)
|--------------------------------------------------------------------------
|
| Four sources:
|
|   salesdatalatest33  opening balance of every KSEB ledger (area)
|                      as on 1st April (Ledger.$OpeningBalance).
|   Tally XML          bill-wise break down of that opening balance:
|                      every bill still pending on 1st April
|                      ("LOB Report", fetched live from Tally).
|   salesdata          this year's vouchers (EveSalesCollection
|                      export): sales, credit / debit notes.
|   kseb_receipts      this year's receipts (and the credit notes /
|                      payments of the same export), see below.
|
| Opening bills (XML) are the starting point of every bill reference;
| this year's receipts and credit notes against them reduce them, like
| Tally. Rows of salesdata dated before 1st April are left out when the
| XML is loaded, as they are already inside the opening bills.
|
| ---- Tally XML -------------------------------------------------------
|
| Requested from Tally's HTTP server (same as xml_to_db.php /
| postdatedcheques.php). Settings (env, or the defaults):
|   TALLY_URL                 Tally HTTP server
|   TALLY_COMPANY             company name (empty = company open in Tally)
|   TALLY_OUTSTANDING_REPORT  report to export (default "LOB Report")
| A good reply is saved to kseb_outstanding.xml (KSEB_OUTSTANDING_XML
| env to change). That saved copy is reused
| (KSEB_OUTSTANDING_CACHE_MINUTES env, default a day: the bills are
| as on 1st April) so the page does not wait on Tally every time;
| refresh=1 always asks Tally. When Tally is off or
| returns nothing, the last saved file is used, with a warning. Without any XML the page still loads,
| from salesdata only (opening bills then show as "older receipts").
|
| The XML is one flat list of tags:
|
|   <LOBNAME>  party ledger          <- party
|   <LOBAMT>   party total (= opening balance)
|   <LOBDATE>  bill date (d-m-Y)     <- one block per pending bill
|   <LOBNAME>  bill reference
|   <LOBCRPRD> credit period ("45 Days", or a due date "19-Feb-26",
|              or empty)
|   <LOBAMT>   pending amount of the bill on 1st April
|
| A LOBNAME right after a LOBDATE (or followed by a LOBCRPRD) is a
| bill, any other LOBNAME starts a new party. Amounts are in Tally's
| sign (Dr - / Cr +).
|
| The break up itself is returned per ledger in opening_breakup
| { ledger name: { total, bills: [...] } }, so the page can show
| what the opening balance is made of (see 5. below).
|
| ---- salesdata -------------------------------------------------------
|
| Besides sales it can hold Receipt, Credit Note, Debit Note and Payment
| vouchers. Every row carries one bill-wise allocation of its voucher
| (Excel columns $Name, $BillType, $BillCreditPeriod, $LedgerName):
|
|   ADCBillName      bill reference (normally the sales bill number)
|   ADCBillType      New Ref / Agst Ref / On Account / Advance
|   ADCBillCrPeriod  credit days
|   ADCLedgerName    ledger the allocation belongs to. A receipt from
|                    one KSEB office can settle another office's bill,
|                    and security deposit lines go to their own ledger,
|                    so this (not PartyLedgerName) decides the ledger.
|   Amount           allocation amount in Tally's sign (Dr - / Cr +).
|                    Used negated: + = party owes us,
|                    - = received / credited.
|
| Sales and credit notes repeat the same allocation on every row of the
| voucher, so one allocation per voucher is kept. Receipts and payments
| have no voucher number in the export, so each row is one allocation.
|
| ---- kseb_receipts ---------------------------------------------------
|
| Receipt / Credit Note / Payment vouchers of KSEB ledgers, rows of one
| voucher share its MasterId. When this table has rows it is THE source
| of receipts and payments: those voucher types in salesdata are then
| left out, so nothing is counted twice. Its credit notes are only used
| when salesdata does not have the same voucher number.
|
| Rows of a voucher, in id order:
|
|   1. ledger lines (they add up to zero): the party line(s), the bank
|      line (IsBankLedger = 1), TDS / deduction lines, round off. A
|      bill-wise line carries the date / type / credit period of its
|      FIRST bill allocation.
|   2. the bill allocations of the bill-wise lines.
|
| Newer exports write the bill number of an allocation in BillName
| ($Name; ledger lines leave it empty) and can write the allocations
| BEFORE the ledger lines. With bill numbers, rows with one are the
| allocations, whatever their order. Without (older exports, BillName
| = voucher type), the ledger lines are the first run of rows adding up
| to zero, or else the run at the end that does.
| LedgerName is the ledger of the line, when the import fills it with
| the real ledger (older imports repeat PartyLedgerName there). So:
|
|   KSEB lines    = bill-wise lines of a ledger starting with "KSEB"
|                   (LedgerName). Every other line (bank, TDS, security
|                   deposit ...) is shown under its LedgerName in the
|                   voucher details.
|                   Without ledger names: bill-wise lines on the party's
|                   side of the voucher (Cr on a receipt / credit note,
|                   Dr on a payment); bill-wise lines on the other side
|                   (Dr New Ref, e.g. 540 days) are taken as security
|                   deposit / retention, and the other lines are named
|                   Bank / TDS / Round Off from what they are.
|   allocations   = part 2 rows of the same KSEB ledger, when they add up
|                   to its lines; otherwise the lines themselves.
|   bill          = Agst Ref / New Ref with a bill number goes to that
|                   bill (Agst Ref of a bill not in this data -> older
|                   receipts; New Ref before its sale = advance). Without one it
|                   is matched to a bill of the same ledger with
|                   the same bill date (BillDate): the one it settles
|                   exactly, else the oldest open bill(s) of that date.
|                   A credit note is matched by its Reference (the
|                   original bill number) first.
|                   Not found -> listed with the On Account amounts as
|                   "bill not identified" (still counts in the net).
|   New Ref without a bill number -> a bill of its own (Tally shows it
|                   as a pending reference, e.g. "Excess" on a payment),
|                   named from the voucher.
|   On Account receipts -> On Account.
|
| Security deposits: the deposit / retention lines of those vouchers
| ("Security Deposit with KSEB ..." ledgers, New Ref with the LPO as
| reference), deposits we paid (Payment vouchers of a deposit ledger)
| and their refunds, returned as security_deposits, one row
| per KSEB ledger + deposit ledger + reference: deposited, refunded and
| balance (still held). Earlier years count too (no 1st April limit).
|
| ---- Balance ---------------------------------------------------------
|
| Like Tally, per KSEB ledger and bill reference:
|
|   balance = opening + sum of all allocations
|             (sale - receipts - credit notes ...)
|
|   balance > 0  -> pending (part received when something came in)
|   balance = 0  -> cleared
|   balance < 0  -> excess / advance received
|
| "On Account" allocations are not against any bill: they are shown per
| ledger as unadjusted amounts.
|
| Receipts against a bill that is neither an opening bill nor a bill
| of this year are listed separately (older_receipts).
|
| KSEB ledger = ledger name starting with "KSEB" (same rule as
| kseb_payment.php). Distribution comes from tally_db.kseb_directory
| (tally_name -> PARENT_AREA), when the ledger is mapped there.
|
| Voucher details (Tally "explode"): every voucher used on the page is
| returned once in vouchers { Sales ID: ... } with all its ledger lines
| and bill allocations; bill lines and receipts carry its sales_id.
| `Sales ID` is the SALES ORDER id ($EveSalesOrderMstID): several
| invoices of one order share it, so a voucher is Sales ID + voucher
| number (voucherId), the same on every row of that voucher
| (kseb_receipts vouchers use their MasterId).
| Sales rows hold only the party allocation, so the sales ledger line
| is worked out as party amount - CGST - SGST - IGST - round off.
| The salesdata export has only bill-wise ledgers, so on receipts the
| bank, TDS and round off lines are missing: their total (what the
| voucher is short of balancing) is shown as one "not in export" line.
| kseb_receipts has every line, but no ledger names: they are named
| Bank / Security Deposit / TDS / Round Off from what the line is.
|
| Executive of a KSEB ledger = its Tally group (ParentLedgerName, e.g.
| "Libin K A", "Sreelal", "Thomson"). EveExecutive on KSEB sales is
| mostly just "KSEB", so it is only used when the ledger has no group.
| A ledger only in the XML takes the name after "C/o" in its name.
|
| Opening balance per ledger (as on 1st April) comes from
| salesdatalatest33 `Ledger.$OpeningBalance`, returned as
| opening_balances { ledger name: amount }, Dr positive / Cr negative.
|
| Params (GET or JSON POST):
|   from_date  YYYY-MM-DD bill date from (default: 1st April of this FY)
|              opening bills are always listed
|   to_date    YYYY-MM-DD bill date to   (default: today)
|   as_of      YYYY-MM-DD only entries up to this date count; also the
|              date used for ageing (default: today)
|   source     "file" to skip Tally and use the last saved XML
|   refresh    1 to fetch from Tally even when the saved XML is recent
|
|--------------------------------------------------------------------------
*/

function validDate($value): bool
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return false;
    }

    [$y, $m, $d] = array_map('intval', explode('-', $value));

    return checkdate($m, $d, $y);
}

function cleanValue($value): string
{
    return trim((string)($value ?? ""));
}

function ledgerKey($value): string
{
    return strtolower(preg_replace('/\s+/', ' ', cleanValue($value)));
}

/* "45" / "45 Days" / "45Days" -> 45 */
function creditDays(...$values): int
{
    foreach ($values as $value) {

        if ($value !== null && preg_match('/\d+/', (string)$value, $m)) {
            return intval($m[0]);
        }
    }

    return 0;
}

/*
  Credit days of a bill, from the first value that is filled in:
  "45" / "45 Days" -> 45, a due date ("18-Jul-26", "2026-07-18")
  -> days from the bill date.
*/
function billCreditDays(string $billDate, ...$values): int
{
    foreach ($values as $value) {
        $text = cleanValue($value);

        if ($text === "") {
            continue;
        }

        $due = tallyDate($text);

        if ($due !== "" && $billDate !== "") {
            return max(0, (int)(new DateTime($billDate))->diff(new DateTime($due))->format("%r%a"));
        }

        if (preg_match('/\d+/', $text, $m)) {
            return intval($m[0]);
        }
    }

    return 0;
}

/* EveExecutive "KSEB" / "Sundry Debtors" group are not a person. */
function executiveName($value): string
{
    $name = cleanValue($value);

    if (strcasecmp($name, "KSEB") === 0 || strcasecmp($name, "Sundry Debtors") === 0) {
        return "";
    }

    return $name;
}

function ageBucket(int $overdueDays): string
{
    if ($overdueDays <= 0) return "not_due";
    if ($overdueDays <= 30) return "1_30";
    if ($overdueDays <= 60) return "31_60";
    if ($overdueDays <= 90) return "61_90";

    return "90_plus";
}

/* Short receipt note: first line of the narration, max 80 chars. */
function shortNarration($value): string
{
    $text = trim(preg_replace('/\s+/', ' ', cleanValue($value)));

    return mb_strlen($text) > 80 ? mb_substr($text, 0, 80) . "…" : $text;
}

/*
  Tally balance -> number, Dr positive / Cr negative.
  "24,82,802.60 Dr" / "1,000 Cr" / "-2482802.60".
  A plain number follows Tally's own sign: negative = Dr.
*/
function tallyBalance($value): ?float
{
    $text = cleanValue($value);

    if ($text === "") {
        return null;
    }

    $number = (float)preg_replace('/[^0-9.\-]/', '', $text);

    if (stripos($text, "Dr") !== false) return abs($number);
    if (stripos($text, "Cr") !== false) return -abs($number);

    return -$number;
}

/* Tally sign -> display line. Tally: Dr negative / Cr positive. */
function drCrLine(string $ledger, float $amount, bool $derived = false): array
{
    return [
        "ledger" => $ledger,
        "amount" => round(abs($amount), 2),
        "dr_cr" => $amount < 0 ? "Dr" : "Cr",
        "derived" => $derived
    ];
}

/*
  Sales / credit / debit note rows hold the ITEM amount (sales ledger
  side, e.g. 1,200.00 Cr), not the party total (1,416.00 Dr). When the
  row amount is on the item side, the party amount is worked out as
  items + GST + round off, on the other side.

  $tallyAmount  amount of the party allocation row, Tally sign
  $items        sum of the voucher's item rows, Tally sign
  Returns the party amount in Tally sign, or null when the row
  already holds the party amount.
*/
function salesPartyAmount(string $voucherType, float $tallyAmount, float $items, array $tax): ?float
{
    if (preg_match('/sales|credit|debit/i', $voucherType) !== 1 || abs($items) < 0.005) {
        return null;
    }

    // Party side: sale / debit note Dr (-), credit note Cr (+).
    $isCredit = stripos($voucherType, "credit") !== false;
    $itemSide = $isCredit ? $tallyAmount < 0 : $tallyAmount > 0;

    if (!$itemSide) {
        return null;
    }

    $side = $items >= 0 ? 1 : -1;
    $gst = abs((float)($tax["CGST"] ?? 0)) + abs((float)($tax["SGST"] ?? 0)) + abs((float)($tax["IGST"] ?? 0));

    return -($items + $side * ($gst + (float)($tax["Round Off"] ?? 0)));
}

/*
  One voucher of salesdata. `Sales ID` is the sales order id
  ($EveSalesOrderMstID), shared by every invoice made from that order,
  so the voucher number is added: "<Sales ID>#<voucher no>". Receipts
  have no voucher number and keep the plain Sales ID.
*/
function voucherId($salesId, $voucherNo): string
{
    $salesId = cleanValue($salesId);
    $voucherNo = cleanValue($voucherNo);

    if ($salesId === "") {
        return "";
    }

    return $voucherNo !== "" ? $salesId . "#" . $voucherNo : $salesId;
}

/*
  How many times a whole voucher is repeated in the export (imported
  twice -> 2). $sigs = itemSignature of each of its item rows.

  An invoice can really have the same line several times ("GI
  BOLT&NUT 10 x 118" five times, or every line twice), so identical
  rows alone prove nothing. A voucher is only taken as repeated when
  every line occurs a multiple of the same number of times (gcd of the
  counts) AND the GST of all its rows ($itemGst, from each row's GST
  rate) is that many times the voucher's own GST total ($voucherGst).
  Without GST to check against, nothing is dropped.
*/
function repeatFactor(array $sigs, float $itemGst = 0, float $voucherGst = 0): int
{
    $gcd = 0;

    foreach (array_count_values($sigs) as $count) {
        $a = $gcd;
        $b = $count;

        while ($b) {
            [$a, $b] = [$b, $a % $b];
        }

        $gcd = $a;
    }

    if ($gcd <= 1 || abs($itemGst) < 0.5 || abs($voucherGst) < 0.5) {
        return 1;
    }

    $ratio = abs($itemGst) / abs($voucherGst);

    for ($k = $gcd; $k > 1; $k--) {
        if ($gcd % $k === 0 && abs($ratio - $k) < 0.05 * $k) {
            return $k;
        }
    }

    return 1;
}

/* GST of one item row, from its GST rate (EveItemGstRate). */
function itemRowGst(array $row): float
{
    return abs((float)($row["Amount"] ?? 0)) * (float)($row["EveItemGstRate"] ?? 0) / 100;
}

/* Voucher GST total (CGST + SGST + IGST, the same on every row). */
function voucherGst(array $rows): float
{
    foreach ($rows as $row) {
        $total = abs((float)($row["EveEveCGSTTaxAmt"] ?? 0))
            + abs((float)($row["EveEveSGSTTaxAmt"] ?? 0))
            + abs((float)($row["EveEveiGSTTaxAmt"] ?? 0));

        if ($total >= 0.005) {
            return $total;
        }
    }

    return 0;
}

/* Signature of an item row, see repeatFactor. */
function itemSignature(array $row): string
{
    return strtolower(cleanValue($row["StockItemName"] ?? "")) . "|"
        . cleanValue($row["BilledQty"] ?? "") . "|"
        . cleanValue($row["Amount"]);
}

/*
  One voucher (all salesdata rows of one voucherId) -> Tally style
  details: ledger lines + bill allocations.
*/
function voucherDetails(string $salesId, array $rows): array
{
    $first = $rows[0];
    $voucherType = cleanValue($first["VoucherTypeName"]);
    $voucherNo = cleanValue($first["VoucherNumber"]);

    $ledgers = [];
    $allocations = [];
    $seen = [];
    $salesLedger = "";
    $narration = "";

    $taxColumns = [
        "CGST" => "EveEveCGSTTaxAmt",
        "SGST" => "EveEveSGSTTaxAmt",
        "IGST" => "EveEveiGSTTaxAmt",
        "Round Off" => "EveEveRoundOffAmt"
    ];
    $tax = array_fill_keys(array_keys($taxColumns), null);

    // Ledgers with bill-wise rows: their plain ledger line (no bill,
    // no bill type) is the same money and is left out.
    $billWise = [];

    // Item total per ledger (sales rows hold item amounts).
    $items = [];

    // Inventory lines of the voucher (stock item, qty, rate ...). When
    // the whole voucher is repeated (imported twice) each line is kept
    // once; a line the invoice really has twice is kept twice.
    $itemLines = [];
    $itemRows = array_values(array_filter($rows, function ($row) {
        return cleanValue($row["StockItemName"] ?? "") !== ""
            && $row["Amount"] !== null && trim((string)$row["Amount"]) !== "";
    }));
    $lineSigs = array_map("itemSignature", $itemRows);
    $lineFactor = repeatFactor(
        $lineSigs,
        array_sum(array_map("itemRowGst", $itemRows)),
        voucherGst($rows)
    );
    $lineLeft = array_map(function ($count) use ($lineFactor) {
        return intdiv($count, $lineFactor);
    }, array_count_values($lineSigs));

    foreach ($itemRows as $row) {
        $itemName = cleanValue($row["StockItemName"]);

        $sig = itemSignature($row);

        if ($lineLeft[$sig] > 0) {
            $lineLeft[$sig]--;

            $qty = $row["BilledQty"] !== null && trim((string)$row["BilledQty"]) !== ""
                ? (float)$row["BilledQty"]
                : null;
            $rate = $row["Rate"] !== null && trim((string)$row["Rate"]) !== ""
                ? (float)$row["Rate"]
                : null;
            $amount = abs((float)$row["Amount"]);

            $itemLines[] = [
                "item" => $itemName,
                "hsn" => cleanValue($row["SafHSNSACCode"] ?? ""),
                "qty" => $qty !== null ? abs($qty) : null,
                "unit" => cleanValue($row["JasBaseUnit"] ?? ""),
                // No rate in the export: amount / qty.
                "rate" => $rate !== null && abs($rate) >= 0.005
                    ? round(abs($rate), 2)
                    : ($qty ? round($amount / abs($qty), 2) : null),
                "discount" => (float)($row["Discount"] ?? 0) ? round((float)$row["Discount"], 2) : null,
                "gst_rate" => (float)($row["EveItemGstRate"] ?? 0) ? round((float)$row["EveItemGstRate"], 2) : null,
                "amount" => round($amount, 2)
            ];
        }
    }

    foreach ($rows as $row) {
        if (cleanValue($row["ADCBillName"]) !== "" || cleanValue($row["ADCBillType"]) !== "") {
            $billWise[ledgerKey($row["ledger"])] = true;
        }

        if ($row["Amount"] !== null && trim((string)$row["Amount"]) !== "") {
            $items[ledgerKey($row["ledger"])] = ($items[ledgerKey($row["ledger"])] ?? 0) + (float)$row["Amount"];
        }
    }

    // A repeated voucher counts once (see repeatFactor).
    foreach ($items as $ledgerKey => $total) {
        $items[$ledgerKey] = $total / $lineFactor;
    }

    foreach ($rows as $row) {

        // Voucher level values are repeated on every row: take the first.
        foreach ($taxColumns as $name => $column) {
            if ($tax[$name] === null && $row[$column] !== null && trim((string)$row[$column]) !== "") {
                $tax[$name] = (float)$row[$column];
            }
        }

        // Only a sales ledger name ("GST State Sales"); the field can
        // hold other text (e.g. "Godown to Shop").
        if ($salesLedger === "" && stripos(cleanValue($row["JasSalesLedName"]), "sale") !== false) {
            $salesLedger = cleanValue($row["JasSalesLedName"]);
        }

        if ($narration === "") {
            $narration = shortNarration($row["Narration"]);
        }

        if ($row["Amount"] === null || trim((string)$row["Amount"]) === "") {
            continue;
        }

        $ledger = cleanValue($row["ledger"]);
        $billRef = cleanValue($row["ADCBillName"]);
        $billType = cleanValue($row["ADCBillType"]);

        if ($billRef === "" && $billType === "" && isset($billWise[ledgerKey($ledger)])) {
            continue;
        }

        // All rows here are one voucher (one voucherId): an allocation
        // repeated on several rows (item rows, or the voucher imported
        // twice) is kept once.
        if ($voucherNo !== "" || $billRef !== "") {
            $key = ledgerKey($ledger) . "|" . strtolower($billRef) . "|" . strtolower($billType);

            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
        }

        $amount = (float)$row["Amount"];
        $ledgerKey = ledgerKey($ledger);

        // Item amount on the row -> party amount (taxes are read from
        // the first row, which is this one or an earlier one).
        $party = salesPartyAmount($voucherType, $amount, $items[$ledgerKey] ?? 0, $tax);

        if ($party !== null) {
            $amount = $party;
        }

        if (!isset($ledgers[$ledgerKey])) {
            $ledgers[$ledgerKey] = ["ledger" => $ledger, "amount" => 0];
        }

        $ledgers[$ledgerKey]["amount"] += $amount;

        if ($billRef !== "") {
            $allocations[] = [
                "ledger" => $ledger,
                "bill_ref" => $billRef,
                "bill_type" => $billType,
                "credit_days" => billCreditDays(cleanValue($row["Date"]), $row["ADCBillCrPeriod"])
            ] + drCrLine($ledger, $amount);
        }
    }

    $lines = [];
    $total = 0;

    foreach ($ledgers as $l) {
        if (abs($l["amount"]) >= 0.005) {
            $lines[] = drCrLine($l["ledger"], $l["amount"]);
            $total += $l["amount"];
        }
    }

    /* Sales / credit / debit notes: GST and round off sit on the other
       side of the party, the sales ledger takes the rest. */
    $isSalesLike = preg_match('/sales|credit|debit/i', $voucherType) === 1;
    $taxLines = [];

    if ($isSalesLike) {
        $side = $total < 0 ? 1 : -1;

        foreach ($tax as $name => $value) {
            if ($value === null || abs($value) < 0.005) {
                continue;
            }

            // Already in the export as a real ledger line.
            if (isset($ledgers[ledgerKey($name)])) {
                continue;
            }

            $signed = $name === "Round Off" ? $side * $value : $side * abs($value);
            $taxLines[] = drCrLine($name, $signed, true);
            $total += $signed;
        }
    }

    $rest = -$total;

    if (abs($rest) >= 0.01) {
        if ($isSalesLike) {
            if ($salesLedger === "") {
                $salesLedger = abs((float)$tax["IGST"]) >= 0.005
                    ? "GST Interstate Sales"
                    : (abs((float)$tax["CGST"]) >= 0.005 ? "GST State Sales" : "Sales");
            }
            $lines[] = drCrLine($salesLedger, $rest, true);
        } else {
            $taxLines[] = drCrLine("Bank / TDS / Round Off (not in export)", $rest, true);
        }
    }

    return [
        "sales_id" => $salesId,
        "voucher_type" => $voucherType,
        "voucher_no" => $voucherNo,
        "date" => cleanValue($first["Date"]),
        "party" => cleanValue($first["PartyLedgerName"]),
        "narration" => $narration,
        "ledgers" => array_merge($lines, $taxLines),
        "allocations" => $allocations,
        "items" => $itemLines
    ];
}

/* Security deposit / retention ledger ("Security Deposit with KSEB ED
   Mananthavady"). */
function isDepositLedger(string $name): bool
{
    return preg_match('/deposit|retention/i', $name) === 1;
}

/*
  Office part of a ledger name, to find the KSEB ledger a deposit ledger
  belongs to: "Security Deposit with KSEB ED Mananthavady" and
  "KSEB- ED- Mananthavady C/o Sreelal" are both "ksebedmananthavady".
*/
function officeKey(string $name): string
{
    $text = strtolower($name);
    $text = preg_replace('/\bc\s*\/\s*o\b.*$/', '', $text);
    $text = preg_replace('/security\s*deposit|deposit|retention|\bwith\b|\bsd\b/', '', $text);

    return preg_replace('/[^a-z0-9]/', '', $text);
}

/*
  One voucher of kseb_receipts (all rows of one MasterId, id order)
  -> its KSEB allocations and ledger lines. See "kseb_receipts" above.

  allocations: [ledger, bill_date, bill_type, credit_days,
                amount (Tally sign)]
  ledgers:     display lines (drCrLine), KSEB ledgers first
*/
function receiptVoucher(string $masterId, array $rows): array
{
    $first = $rows[0];
    // As written in Tally, like salesdata (ledgerKey matches either way).
    $party = cleanValue($first["PartyLedgerName"]);
    $isCreditNote = stripos(cleanValue($first["VoucherTypeName"]), "credit") !== false;

    // Ledger of a row: LedgerName, or the party when it is empty.
    $ledgerOf = function (array $row) use ($party): string {
        $name = cleanValue($row["LedgerName"] ?? "");

        return $name !== "" ? $name : $party;
    };

    $voucherType = cleanValue($first["VoucherTypeName"]);

    // Bill reference of a row: BillName ($Name of the export), when it
    // holds a bill number and not just the voucher type.
    $billNameOf = function (array $row) use ($voucherType): string {
        $name = cleanValue($row["BillName"] ?? "");

        return $name === "" || strcasecmp($name, $voucherType) === 0 ? "" : $name;
    };

    // LedgerName holds the real ledger (not just the party) on some row:
    // then KSEB ledgers / bank / deductions are known by name.
    $hasLedgerNames = false;
    $hasBillNames = false;
    $amountRows = [];

    foreach ($rows as $row) {
        if (ledgerKey($ledgerOf($row)) !== ledgerKey($party)) {
            $hasLedgerNames = true;
        }

        if ($row["Amount"] === null || trim((string)$row["Amount"]) === "") {
            continue;
        }

        if ($billNameOf($row) !== "") {
            $hasBillNames = true;
        }

        $amountRows[] = $row;
    }

    $lines = [];
    $allocRows = [];

    if ($hasBillNames) {
        /* Bill allocations carry the bill number ($Name), ledger lines
           do not - whatever order the export writes them in. */
        foreach ($amountRows as $row) {
            if ($billNameOf($row) !== "") {
                $allocRows[] = $row;
            } else {
                $lines[] = $row;
            }
        }
    } else {
        /* Ledger lines first, adding up to zero, then the allocations.
           Some exports write the allocations first: then the ledger
           lines are the longest run at the end that adds up to zero. */
        $running = 0;
        $split = null;

        foreach ($amountRows as $i => $row) {
            $running += (float)$row["Amount"];

            if ($i > 0 && abs($running) < 0.005) {
                $split = $i + 1;
                break;
            }
        }

        if ($split !== null) {
            $lines = array_slice($amountRows, 0, $split);
            $allocRows = array_slice($amountRows, $split);
        } else {
            $lines = $amountRows;
            $count = count($amountRows);

            for ($start = 1; $start < $count - 1; $start++) {
                $tail = array_slice($amountRows, $start);

                if (abs(array_sum(array_map(function ($row) {
                    return (float)$row["Amount"];
                }, $tail))) < 0.005) {
                    $lines = $tail;
                    $allocRows = array_slice($amountRows, 0, $start);
                    break;
                }
            }
        }
    }

    if (!$lines) {
        return ["master_id" => $masterId, "party" => $party, "allocations" => [], "ledgers" => [], "deposits" => []];
    }

    // Party side = side of the first line (Cr receipt, Dr payment).
    $partySide = (float)$lines[0]["Amount"] >= 0;

    /* A KSEB ledger line. With ledger names: any bill-wise line of a
       ledger starting with "KSEB" (a receipt from one office can settle
       another office's bill). Without: bill-wise lines on the party's
       side of the voucher. */
    $isKseb = function (array $row) use ($hasLedgerNames, $partySide, $ledgerOf): bool {
        if (intval($row["IsBankLedger"]) || cleanValue($row["BillType"]) === "") {
            return false;
        }

        // A deposit ledger ("Security Deposit with KSEB ...") is not a
        // KSEB office, also when it is the voucher's party.
        if (isDepositLedger($ledgerOf($row))) {
            return false;
        }

        if ($hasLedgerNames) {
            return strpos(ledgerKey($ledgerOf($row)), "kseb") === 0;
        }

        return ((float)$row["Amount"] >= 0) === $partySide;
    };

    $isOnAccount = function (array $row): bool {
        return strcasecmp(cleanValue($row["BillType"]), "On Account") === 0;
    };

    // Per KSEB ledger: its bill lines, On Account lines and total.
    $kseb = [];
    $others = [];
    // Security deposit lines per deposit ledger.
    $depositLines = [];

    foreach ($lines as $row) {
        $amount = (float)$row["Amount"];

        if ($isKseb($row)) {
            $ledger = $ledgerOf($row);
            $key = ledgerKey($ledger);

            if (!isset($kseb[$key])) {
                $kseb[$key] = ["ledger" => $ledger, "total" => 0, "bills" => [], "on_account" => []];
            }

            $kseb[$key]["total"] += $amount;

            if ($isOnAccount($row)) {
                $kseb[$key]["on_account"][] = $row;
            } else {
                $kseb[$key]["bills"][] = $row;
            }
            continue;
        }

        // Real ledger name when the export has it (bank, TDS, security
        // deposit ...), else named from what the line is.
        // bank: the line Tally shows as particulars of a receipt.
        $isBank = ["bank" => (bool)intval($row["IsBankLedger"])];

        /* Security deposit / retention line, by its ledger name: a
           deposit taken from a KSEB receipt, a deposit we paid (Payment
           with the deposit ledger as party) or its refund. */
        $captured = false;

        if (!intval($row["IsBankLedger"]) && isDepositLedger($ledgerOf($row))) {
            $depositLines[$ledgerOf($row)][] = $row;
            $captured = true;
            $others[] = drCrLine($ledgerOf($row), $amount) + $isBank;
            continue;
        }

        if ($hasLedgerNames && ledgerKey($ledgerOf($row)) !== ledgerKey($party)) {
            $others[] = drCrLine($ledgerOf($row), $amount) + $isBank;
            continue;
        }

        if (intval($row["IsBankLedger"])) {
            $name = "Bank";
        } elseif (strcasecmp(cleanValue($row["BillType"]), "New Ref") === 0) {
            $name = "Security Deposit / Retention";

            // Without ledger names: the other side's New Ref line.
            if (!$hasLedgerNames && !$captured) {
                $depositLines[$name][] = $row;
            }
        } elseif (cleanValue($row["BillType"]) !== "") {
            $name = "Other bill-wise ledger (" . cleanValue($row["BillType"]) . ")";
        } elseif (abs($amount) < 1) {
            $name = "Round Off";
        } elseif ($isCreditNote) {
            $name = "Sales Return / GST";
        } else {
            $name = "TDS / Other Deduction";
        }

        $others[] = drCrLine($name, $amount, true) + $isBank;
    }

    $sum = function (array $list): float {
        return array_sum(array_map(function ($row) {
            return (float)$row["Amount"];
        }, $list));
    };

    $allocations = [];
    $ledgerLines = [];

    foreach ($kseb as $key => $k) {

        // Allocation rows of this ledger, only when they are complete.
        $allocBills = array_values(array_filter($allocRows, function ($row) use ($isKseb, $isOnAccount, $ledgerOf, $key) {
            return $isKseb($row) && !$isOnAccount($row) && ledgerKey($ledgerOf($row)) === $key;
        }));

        $source = $allocBills && abs($sum($allocBills) - $sum($k["bills"])) < 0.01
            ? $allocBills
            : $k["bills"];

        foreach (array_merge($source, $k["on_account"]) as $row) {
            $allocations[] = [
                "ledger" => $k["ledger"],
                // Bill number, when the export has it ($Name).
                "bill_ref" => $billNameOf($row),
                "bill_date" => cleanValue($row["BillDate"]),
                "bill_type" => cleanValue($row["BillType"]),
                "credit_days" => creditDays($row["BillCreditPeriod"]),
                "amount" => round((float)$row["Amount"], 2)
            ];
        }

        $ledgerLines[] = drCrLine($k["ledger"], $k["total"]);
    }

    /* Security deposits of this voucher, page sign (+ = deposit held by
       KSEB, - = refunded). Their bill allocations (LPO reference) when
       they add up to the line, else the line itself. */
    $deposits = [];

    foreach ($depositLines as $name => $depRows) {
        $key = ledgerKey($name);
        $allocDeposits = array_values(array_filter($allocRows, function ($row) use ($ledgerOf, $key) {
            return cleanValue($row["BillType"]) !== "" && ledgerKey($ledgerOf($row)) === $key;
        }));

        $source = $allocDeposits && abs($sum($allocDeposits) - $sum($depRows)) < 0.01
            ? $allocDeposits
            : $depRows;

        foreach ($source as $row) {
            $deposits[] = [
                "ledger" => (string)$name,
                "bill_ref" => $billNameOf($row),
                "bill_date" => cleanValue($row["BillDate"]),
                "bill_type" => cleanValue($row["BillType"]),
                "credit_days" => creditDays($row["BillCreditPeriod"]),
                "amount" => round(-(float)$row["Amount"], 2)
            ];
        }
    }

    return [
        "master_id" => $masterId,
        "voucher_type" => cleanValue($first["VoucherTypeName"]),
        "voucher_no" => cleanValue($first["VoucherNumber"]),
        "reference" => cleanValue($first["Reference"]),
        "date" => cleanValue($first["Date"]),
        "party" => $party,
        "allocations" => $allocations,
        "ledgers" => array_merge($ledgerLines, $others),
        "deposits" => $deposits
    ];
}

/*
  Bills an allocation of kseb_receipts goes to (no bill reference in
  that export). $candidates = bills of the ledger with the allocation's
  bill date, oldest reference first. Returns [[ref key|null, amount]],
  amount in page sign; null = bill not identified.
*/
function receiptTargets(array $refs, array $candidates, float $amount): array
{
    if (!$candidates) {
        return [[null, $amount]];
    }

    // A debit against a bill, or only one bill of that date: all on it.
    if ($amount >= 0 || count($candidates) === 1) {
        return [[$candidates[0], $amount]];
    }

    // The bill it settles exactly.
    foreach ($candidates as $key) {
        if (abs($refs[$key]["balance"] + $amount) < 1) {
            return [[$key, $amount]];
        }
    }

    // Else over the open bills of that date, oldest first; anything
    // left (excess) goes on the last one.
    $targets = [];
    $left = $amount;

    foreach ($candidates as $key) {
        $open = round($refs[$key]["balance"], 2);

        if ($open < 0.5) {
            continue;
        }

        $take = max($left, -$open);
        $targets[] = [$key, round($take, 2)];
        $left -= $take;

        if ($left > -0.005) {
            break;
        }
    }

    if ($left < -0.005) {
        if ($targets) {
            $targets[count($targets) - 1][1] = round($targets[count($targets) - 1][1] + $left, 2);
        } else {
            $targets[] = [$candidates[0], $amount];
        }
    }

    return $targets;
}

/* =========================================================
   TALLY XML (opening bills)
========================================================= */

/* "19-2-2026" / "19-Feb-26" / "19-Feb-2026" / "20260219" -> 2026-02-19 */
function tallyDate($value): string
{
    $text = cleanValue($value);

    foreach (["!j-n-Y", "!j-M-y", "!j-M-Y", "!Ymd", "!Y-m-d"] as $format) {
        $date = DateTime::createFromFormat($format, $text);

        if ($date !== false && $date->format(ltrim($format, "!")) === $text) {
            return $date->format("Y-m-d");
        }
    }

    // Leading zeros ("09-06-2022") do not round-trip with j / n.
    if (preg_match('/^(\d{1,2})-(\d{1,2})-(\d{4})$/', $text, $m) && checkdate((int)$m[2], (int)$m[1], (int)$m[3])) {
        return sprintf("%04d-%02d-%02d", $m[3], $m[2], $m[1]);
    }

    return "";
}

/* Tally amount "-4,82,030.00" -> -482030.0 */
function tallyAmount($value): ?float
{
    $text = preg_replace('/[^0-9.\-]/', '', cleanValue($value));

    return $text === "" || $text === "-" ? null : (float)$text;
}

/* "KSEB-ED-Adoor C/o Libin K A" -> "Libin K A". */
function executiveFromName(string $party): string
{
    if (!preg_match('/\bC\s*\/\s*o\.?\s*(.+)$/i', $party, $m)) {
        return "";
    }

    $name = preg_replace('/\s+/', ' ', trim($m[1]));
    $name = trim(preg_replace('/\s+Rep\.?$/i', '', $name));

    return ucwords(strtolower($name));
}


/*
  Ask Tally for the outstanding report. Returns the raw XML, or null
  (with $error set) when Tally is off or answers with an error.
*/
function fetchFromTally(?string &$error): ?string
{
    $tallyUrl = getenv("TALLY_URL") ?: "http://117.221.70.147:14151";
    $company = getenv("TALLY_COMPANY") ?: "";
    $report = getenv("TALLY_OUTSTANDING_REPORT") ?: "LOB Report";

    $esc = function ($value) {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, "UTF-8");
    };

    $companyTag = $company !== ""
        ? "<SVCURRENTCOMPANY>" . $esc($company) . "</SVCURRENTCOMPANY>"
        : "";

    $xmlRequest = '
    <ENVELOPE>
        <HEADER>
            <TALLYREQUEST>Export Data</TALLYREQUEST>
        </HEADER>

        <BODY>
            <EXPORTDATA>

                <REQUESTDESC>

                    <REPORTNAME>' . $esc($report) . '</REPORTNAME>

                    <STATICVARIABLES>

                        <SVEXPORTFORMAT>$SysName:XML</SVEXPORTFORMAT>
                        ' . $companyTag . '
                        <SVFROMDATE>$BooksFrom:Company:##SVCurrentCompany</SVFROMDATE>

                        <SVTODATE>$LastVoucherDate:Company:##SVCurrentCompany</SVTODATE>

                    </STATICVARIABLES>

                </REQUESTDESC>

            </EXPORTDATA>
        </BODY>

    </ENVELOPE>';

    $ch = curl_init($tallyUrl);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $xmlRequest,
        CURLOPT_HTTPHEADER => [
            "Content-Type: application/xml",
            "Expect:"
        ],
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_0,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 60
    ]);

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($response === false || $curlError !== "") {
        $error = "Tally not reachable (" . $curlError . ")";
        return null;
    }

    if ($httpCode !== 200 || trim($response) === "") {
        $error = "Tally returned HTTP " . $httpCode;
        return null;
    }

    return $response;
}

/* Last saved XML, or null when there is none. */
function readSavedXml(string $path): ?string
{
    return is_file($path) && is_readable($path) ? file_get_contents($path) : null;
}

/*
  Tally XML text -> ordered list of [TAG, text].
  Tally writes UTF-16 by default and uses &#4; for blank values.
*/
function decodeOutstandingXml(string $raw): array
{
    if (strncmp($raw, "\xFF\xFE", 2) === 0) {
        $raw = mb_convert_encoding(substr($raw, 2), "UTF-8", "UTF-16LE");
    } elseif (strncmp($raw, "\xFE\xFF", 2) === 0) {
        $raw = mb_convert_encoding(substr($raw, 2), "UTF-8", "UTF-16BE");
    } elseif (strncmp($raw, "\xEF\xBB\xBF", 3) === 0) {
        $raw = substr($raw, 3);
    }

    $raw = preg_replace('/<\?xml[^>]*\?>/i', '', $raw, 1);
    // Control characters are not allowed in XML 1.0, even as &#n;.
    $raw = preg_replace_callback('/&#(x[0-9a-f]+|\d+);/i', function ($m) {
        $code = stripos($m[1], "x") === 0 ? hexdec(substr($m[1], 1)) : intval($m[1]);

        return $code < 32 && !in_array($code, [9, 10, 13], true) ? "" : $m[0];
    }, $raw);
    $raw = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $raw);

    $xml = simplexml_load_string($raw, "SimpleXMLElement", LIBXML_NOCDATA | LIBXML_PARSEHUGE);

    if ($xml === false) {
        throw new RuntimeException("Outstanding XML could not be parsed.");
    }

    // Tally error reply, e.g. a wrong report or company name.
    if (isset($xml->LINEERROR)) {
        throw new RuntimeException("Tally error: " . cleanValue((string)$xml->LINEERROR));
    }

    // The LOB* tags sit in <ENVELOPE>, or deeper in a live Tally response.
    $containers = $xml->getName() !== "" && isset($xml->LOBNAME)
        ? [$xml]
        : $xml->xpath('//*[LOBNAME]');

    $items = [];

    foreach ($containers ?: [] as $container) {
        foreach ($container->children() as $child) {
            $items[] = [strtoupper($child->getName()), cleanValue((string)$child)];
        }
    }

    return $items;
}

/*
  [TAG, text] list -> parties with their pending bills.
*/
function parseOutstanding(array $items): array
{
    $parties = [];
    $party = null;     // index into $parties
    $bill = null;      // open bill (until its LOBAMT)
    $billDate = null;  // LOBDATE waiting for its bill name

    $count = count($items);

    for ($i = 0; $i < $count; $i++) {

        [$tag, $text] = $items[$i];
        $next = $items[$i + 1][0] ?? "";

        if ($tag === "LOBDATE") {
            $billDate = $text;
            continue;
        }

        if ($tag === "LOBNAME") {

            if ($billDate !== null || $next === "LOBCRPRD") {
                if ($party !== null) {
                    $bill = ["ref" => $text, "date" => (string)$billDate, "period" => "", "amount" => null];
                }
            } else {
                $parties[] = ["name" => $text, "total" => null, "bills" => []];
                $party = count($parties) - 1;
                $bill = null;
            }

            $billDate = null;
            continue;
        }

        if ($tag === "LOBCRPRD") {
            if ($bill !== null) {
                $bill["period"] = $text;
            }
            continue;
        }

        if ($tag === "LOBAMT") {
            if ($bill !== null) {
                $bill["amount"] = tallyAmount($text);
                $parties[$party]["bills"][] = $bill;
                $bill = null;
            } elseif ($party !== null && $parties[$party]["total"] === null) {
                $parties[$party]["total"] = tallyAmount($text);
            }
        }
    }

    return $parties;
}

try {

    /* =========================================================
       0. PARAMS
    ========================================================= */

    $input = $_GET;

    if ($_SERVER["REQUEST_METHOD"] === "POST") {
        $json = json_decode(file_get_contents("php://input"), true);

        if (is_array($json)) {
            $input = $json + $input;
        }
    }

    $today = date("Y-m-d");

    $fyStartYear = intval(date("n")) >= 4
        ? intval(date("Y"))
        : intval(date("Y")) - 1;

    $fromDate = validDate($input["from_date"] ?? "")
        ? $input["from_date"]
        : $fyStartYear . "-04-01";

    $toDate = validDate($input["to_date"] ?? "")
        ? $input["to_date"]
        : $today;

    $asOf = validDate($input["as_of"] ?? "")
        ? $input["as_of"]
        : $today;

    if ($fromDate > $toDate) {
        [$fromDate, $toDate] = [$toDate, $fromDate];
    }

    /* The opening bills are as on 1st April of the as-on date's year. */
    $asOfYear = intval(substr($asOf, 0, 4));
    $openingDate = (intval(substr($asOf, 5, 2)) >= 4 ? $asOfYear : $asOfYear - 1) . "-04-01";

    /* =========================================================
       1. KSEB DIRECTORY (optional)

       tally_name can hold several ledger names separated by
       commas. Lowest id wins when a ledger appears twice.
       If the directory cannot be read, bills still load and
       show as "Unmapped".
    ========================================================= */

    $directory = [];
    $warnings = [];

    try {
        /* On hosting the database names / users differ from local
           (e.g. a prefixed "u123_tally_db"), and the salescollection
           user may not be allowed to read another database. So open
           tally_db through db_connect.php like salescollection, and
           only fall back to the cross-database query (works locally). */
        try {
            $tallyPdo = db_pdo("tally_db", [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
            ]);
            $directoryTable = "kseb_directory";
        } catch (Throwable $e) {
            error_log("KSEB OUTSTANDING TALLY_DB CONNECT ERROR: " . $e->getMessage());
            $tallyPdo = $pdo;
            $directoryTable = "tally_db.kseb_directory";
        }

        $dirResult = $tallyPdo->query("
            SELECT id, tally_name, PARENT_AREA
            FROM {$directoryTable}
            WHERE TRIM(COALESCE(tally_name, '')) <> ''
            ORDER BY id ASC
        ");

        while ($dir = $dirResult->fetch()) {

            foreach (explode(",", (string)$dir["tally_name"]) as $name) {

                $key = ledgerKey($name);

                if ($key !== "" && !isset($directory[$key])) {
                    $directory[$key] = cleanValue($dir["PARENT_AREA"]);
                }
            }
        }

        $dirResult->closeCursor();

        if ($tallyPdo !== $pdo) {
            $tallyPdo = null;
        }

    } catch (Throwable $e) {
        error_log("KSEB OUTSTANDING DIRECTORY ERROR: " . $e->getMessage());
        $warnings[] = "KSEB directory (tally_db.kseb_directory) could not be read - distributions show as Unmapped.";
    }

    /* =========================================================
       1b. OPENING BALANCES (optional)

       Ledger.$OpeningBalance is a ledger master field, repeated
       on every row of the ledger: one value per ledger (MAX),
       never a SUM. If it cannot be read, the page shows the
       opening / closing boxes blank.
    ========================================================= */

    $openingByKey = [];
    $openingNames = [];

    try {
        $openResult = $pdo->query("
            SELECT
                TRIM(PartyLedgerName) AS party,
                MAX(`Ledger.\$OpeningBalance`) AS opening_balance
            FROM salesdatalatest33
            WHERE
                LOWER(TRIM(COALESCE(PartyLedgerName, ''))) LIKE 'kseb%'
                AND TRIM(COALESCE(`Ledger.\$OpeningBalance`, '')) <> ''
            GROUP BY TRIM(PartyLedgerName)
        ");

        while ($open = $openResult->fetch()) {

            $amount = tallyBalance($open["opening_balance"]);
            $key = ledgerKey($open["party"]);

            if ($amount !== null && $key !== "") {
                $openingByKey[$key] = round($amount, 2);
                $openingNames[$key] = cleanValue($open["party"]);
            }
        }

        $openResult->closeCursor();

    } catch (Throwable $e) {
        error_log("KSEB OUTSTANDING OPENING BALANCE ERROR: " . $e->getMessage());
        $warnings[] = "Opening balances (salesdatalatest33) could not be read.";
    }

    /* =========================================================
       1c. OPENING BILLS - FETCH XML FROM TALLY (optional)

       Live first. The saved file is only replaced when Tally
       answered with bills, so a Tally error never wipes it.
       $openingBills[ledger key] = pending bills on 1st April,
       amount in page sign (+ = party owes us).
    ========================================================= */

    $xmlPath = getenv("KSEB_OUTSTANDING_XML") ?: __DIR__ . "/kseb_outstanding.xml";

    $xmlParties = [];
    $xmlSource = "";
    $xmlUpdated = "";
    $tallyError = null;

    /* The opening bills are as on 1st April, so they hardly change:
       the saved copy is used for a day (KSEB_OUTSTANDING_CACHE_MINUTES)
       instead of waiting on Tally (up to a minute) at every load.
       "Refresh from Tally" (refresh=1) always asks Tally. */
    $cacheMinutes = intval(getenv("KSEB_OUTSTANDING_CACHE_MINUTES") ?: 1440);
    $refresh = in_array(strtolower(cleanValue($input["refresh"] ?? "")), ["1", "true", "yes"], true);

    // Saved copy still recent: use it without asking Tally.
    $cacheFresh = !$refresh
        && is_file($xmlPath)
        && time() - filemtime($xmlPath) < $cacheMinutes * 60;

    if ($cacheFresh || strtolower(cleanValue($input["source"] ?? "")) === "file") {
        $tallyError = "skipped";
    } else {

        $live = fetchFromTally($tallyError);

        if ($live !== null) {
            try {
                $xmlParties = parseOutstanding(decodeOutstandingXml($live));

                if (!$xmlParties) {
                    $tallyError = "Tally returned no outstanding bills";
                } else {
                    $xmlSource = "tally";
                    $xmlUpdated = date("Y-m-d H:i:s");

                    if (@file_put_contents($xmlPath, $live) === false) {
                        error_log("KSEB OUTSTANDING: could not save " . $xmlPath);
                    }
                }
            } catch (Throwable $e) {
                $tallyError = $e->getMessage();
                $xmlParties = [];
            }
        }
    }

    if (!$xmlParties) {

        if ($tallyError !== "skipped") {
            error_log("KSEB OUTSTANDING TALLY FETCH: " . $tallyError);
        }

        try {
            $saved = readSavedXml($xmlPath);

            if ($saved !== null) {
                $xmlParties = parseOutstanding(decodeOutstandingXml($saved));
                $xmlSource = $tallyError === "skipped" ? "saved_file" : "saved_file_tally_offline";
                $xmlUpdated = date("Y-m-d H:i:s", filemtime($xmlPath));

                if ($tallyError !== "skipped") {
                    $warnings[] = "Tally could not be reached - opening bills are from the last saved data of "
                        . date("d-M-Y H:i", filemtime($xmlPath)) . ".";
                }
            }
        } catch (Throwable $e) {
            error_log("KSEB OUTSTANDING SAVED XML ERROR: " . $e->getMessage());
            $xmlParties = [];
        }

        if (!$xmlParties) {
            $warnings[] = "Opening bills (Tally XML) could not be loaded - previous year bills show as older receipts.";
        }
    }

    $openingBills = [];
    $openingParty = [];
    $openingMismatch = [];

    // Party total of the XML (<LOBAMT> after the party), page sign.
    $openingXmlTotal = [];

    foreach ($xmlParties as $p) {

        $party = preg_replace('/\s+/', ' ', cleanValue($p["name"]));
        $partyKey = ledgerKey($party);

        if (strpos($partyKey, "kseb") !== 0) {
            continue;
        }

        $openingParty[$partyKey] = $party;
        $billTotal = 0;

        if ($p["total"] !== null) {
            $openingXmlTotal[$partyKey] = round(-$p["total"], 2);
        }

        foreach ($p["bills"] as $b) {

            if ($b["amount"] === null || abs($b["amount"]) < 0.005) {
                continue;
            }

            // Tally sign (Dr -) -> page sign (+ = party owes us).
            $amount = round(-$b["amount"], 2);
            $billDate = tallyDate($b["date"]);
            $periodDate = tallyDate($b["period"]);

            /* Credit period: "45 Days" -> 45 days from the bill date,
               a date ("19-Feb-26") is the due date itself. */
            if ($periodDate !== "" && $billDate !== "") {
                $days = (int)(new DateTime($billDate))->diff(new DateTime($periodDate))->format("%r%a");
                $credit = max(0, $days);
            } else {
                $credit = creditDays($b["period"]);
            }

            $openingBills[$partyKey][] = [
                "bill_ref" => cleanValue($b["ref"]),
                "bill_date" => $billDate !== "" ? $billDate : $openingDate,
                "credit_days" => $credit,
                "amount" => $amount
            ];

            $billTotal += $amount;
        }

        // XML total should match the ledger's opening balance.
        if (isset($openingByKey[$partyKey]) && abs($openingByKey[$partyKey] - $billTotal) >= 1) {
            $openingMismatch[] = $party;
        }
    }

    if ($openingMismatch) {
        $warnings[] = "Opening bills (Tally XML) do not add up to the opening balance (salesdatalatest33) for: "
            . implode(", ", array_slice($openingMismatch, 0, 10))
            . (count($openingMismatch) > 10 ? " and " . (count($openingMismatch) - 10) . " more" : "");
    }

    $hasOpeningBills = count($openingParty) > 0;

    /* =========================================================
       1d. RECEIPTS AND SECURITY DEPOSITS (kseb_receipts, optional)

       One read of kseb_receipts for both (it used to be read twice).
       Rows of one voucher share its MasterId; id order keeps the
       ledger lines before their bill allocations.

       Receipts: vouchers of KSEB ledgers from 1st April (earlier
       ones are inside the opening bills). When the table has
       vouchers, salesdata receipts / payments are left out below
       (kseb_receipts is their source).

       Security deposits: deposit / retention lines of those
       vouchers (e.g. "Security Deposit with KSEB ED Mananthavady",
       New Ref 540 days, with the LPO as reference), deposits we
       paid (Payment of a deposit ledger) and their refunds. A
       deposit stays held until it is refunded, so earlier years
       count too: no 1st April limit for them.
    ========================================================= */

    $receiptVouchers = [];
    $depositEntries = [];

    try {
        // A join on the voucher ids is much faster than IN (SELECT ...).
        $receiptStmt = $pdo->prepare("
            SELECT
                r.id,
                r.MasterId,
                r.VoucherTypeName,
                r.`Date`,
                r.VoucherNumber,
                r.Reference,
                r.PartyLedgerName,
                r.LedgerName,
                r.Amount,
                r.BillDate,
                r.BillType,
                r.BillCreditPeriod,
                r.IsBankLedger,
                r.BillName
            FROM kseb_receipts r
            JOIN (
                SELECT DISTINCT MasterId
                FROM kseb_receipts
                WHERE
                    `Date` <= :as_of_ids
                    AND (
                        LOWER(TRIM(COALESCE(PartyLedgerName, ''))) LIKE 'kseb%'
                        OR LOWER(TRIM(COALESCE(LedgerName, ''))) LIKE 'kseb%'
                        OR ((LOWER(COALESCE(LedgerName, '')) LIKE '%deposit%'
                             OR LOWER(COALESCE(LedgerName, '')) LIKE '%retention%')
                            AND LOWER(COALESCE(LedgerName, '')) LIKE '%kseb%')
                        OR ((LOWER(COALESCE(PartyLedgerName, '')) LIKE '%deposit%'
                             OR LOWER(COALESCE(PartyLedgerName, '')) LIKE '%retention%')
                            AND LOWER(COALESCE(PartyLedgerName, '')) LIKE '%kseb%')
                    )
            ) k ON k.MasterId = r.MasterId
            WHERE
                TRIM(COALESCE(r.MasterId, '')) <> ''
                AND r.`Date` <= :as_of
            ORDER BY
                r.`Date` ASC,
                r.MasterId ASC,
                r.id ASC
        ");

        $receiptStmt->execute([
            ":as_of_ids" => $asOf,
            ":as_of" => $asOf
        ]);

        $receiptRowsById = [];

        while ($row = $receiptStmt->fetch()) {
            $receiptRowsById[cleanValue($row["MasterId"])][] = $row;
        }

        $receiptStmt->closeCursor();

        foreach ($receiptRowsById as $masterId => $rows) {
            $voucher = receiptVoucher((string)$masterId, $rows);
            $voucherDate = $voucher["date"] ?? cleanValue($rows[0]["Date"]);

            // Receipts: from 1st April when the opening bills are loaded.
            if ($voucher["allocations"] && (!$hasOpeningBills || $voucherDate >= $openingDate)) {
                $receiptVouchers[] = $voucher;
            }

            foreach ($voucher["deposits"] as $d) {
                $depositEntries[] = $d + [
                    "master_id" => (string)$masterId,
                    "date" => $voucherDate,
                    "voucher_type" => $voucher["voucher_type"] ?? cleanValue($rows[0]["VoucherTypeName"]),
                    "voucher_no" => $voucher["voucher_no"] ?? "",
                    "party" => $voucher["party"],
                    // Every ledger line of the voucher, for its details.
                    "ledgers" => $voucher["ledgers"]
                ];
            }
        }

        unset($receiptRowsById);

    } catch (Throwable $e) {
        error_log("KSEB OUTSTANDING RECEIPTS ERROR: " . $e->getMessage());
        $warnings[] = "Receipts and security deposits (kseb_receipts) could not be read.";
    }

    $useReceiptTable = count($receiptVouchers) > 0;

    /* =========================================================
       2. ALL KSEB BILL-WISE ALLOCATIONS UP TO AS-ON DATE

       Ledger = ADCLedgerName (falls back to PartyLedgerName
       when the export has no ledger on the row).
       Sales orders are not accounting vouchers - left out.
       With opening bills, rows before 1st April are inside
       them already - left out too.
    ========================================================= */

    $sql = "
        SELECT
            s.VoucherTypeName,
            s.VoucherNumber,
            s.`Date`,
            s.`Sales ID` AS sales_id,
            COALESCE(NULLIF(TRIM(s.ADCLedgerName), ''), s.PartyLedgerName) AS ledger,
            s.PartyLedgerName,
            s.ParentLedgerName,
            s.EveExecutive,
            s.Reference,
            s.Narration,
            s.EvePartyCrPeriod,
            s.EveBasicDueDateOfPymt,
            s.ADCBillName,
            s.ADCBillType,
            s.ADCBillCrPeriod,
            s.StockItemName,
            s.BilledQty,
            s.EveItemGstRate,
            s.EveEveCGSTTaxAmt,
            s.EveEveSGSTTaxAmt,
            s.EveEveiGSTTaxAmt,
            s.EveEveRoundOffAmt,
            s.Amount
        FROM salesdata s
        WHERE
            LOWER(TRIM(COALESCE(NULLIF(TRIM(s.ADCLedgerName), ''), s.PartyLedgerName, ''))) LIKE 'kseb%'
            AND LOWER(TRIM(COALESCE(s.VoucherTypeName, ''))) <> 'sales order'
            AND s.`Date` <= :as_of
            " . ($hasOpeningBills ? "AND s.`Date` >= :opening_date" : "") . "
        ORDER BY
            s.`Date` ASC,
            s.`Sl No` ASC
    ";

    $params = [
        ":as_of" => $asOf
    ];

    if ($hasOpeningBills) {
        $params[":opening_date"] = $openingDate;
    }

    $stmt = $pdo->prepare($sql);

    $stmt->execute($params);

    /* =========================================================
       3. ONE ALLOCATION PER VOUCHER (Sales ID)
    ========================================================= */

    $allocations = [];
    $numbered = [];
    $billWise = [];

    // Ledger -> Tally group (executive). ParentLedgerName belongs to
    // PartyLedgerName, so only rows where the allocation ledger is the
    // party ledger itself are used.
    $ledgerGroup = [];

    // How many KSEB receipt rows exist - 0 means neither salesdata nor
    // kseb_receipts has Receipt vouchers.
    $receiptRows = 0;

    // Vouchers in salesdata (Sales ID / voucher number), so the same
    // credit note in kseb_receipts is not counted again.
    $salesVoucherIds = [];
    $salesVoucherNos = [];

    // Per allocation: item total (Tally sign) and voucher taxes, to work
    // out the party amount of sales rows (see salesPartyAmount).
    $itemTotals = [];
    $itemSigs = [];
    $itemGst = [];
    $taxes = [];

    while ($row = $stmt->fetch()) {

        $voucherType = cleanValue($row["VoucherTypeName"]);

        // kseb_receipts holds the receipts / payments.
        if ($useReceiptTable && preg_match('/receipt|payment/i', $voucherType) === 1) {
            continue;
        }

        if (stripos($voucherType, "receipt") !== false) {
            $receiptRows++;
        }
        $ledgerName = ledgerKey($row["ledger"]);
        $group = executiveName($row["ParentLedgerName"]);

        if ($group !== "" && ledgerKey($row["PartyLedgerName"]) === $ledgerName) {
            $ledgerGroup[$ledgerName] = $group;
        }

        $voucherNo = cleanValue($row["VoucherNumber"]);
        $billRef = cleanValue($row["ADCBillName"]);
        $billType = cleanValue($row["ADCBillType"]);

        if (cleanValue($row["sales_id"]) !== "") {
            $salesVoucherIds[cleanValue($row["sales_id"])] = true;
        }

        if ($voucherNo !== "") {
            $salesVoucherNos[strtolower($voucherNo)] = true;
        }

        // Tally sign (Dr -) -> page sign (+ = party owes us).
        $amount = ($row["Amount"] === null || trim((string)$row["Amount"]) === "")
            ? null
            : -(float)$row["Amount"];

        $entry = [
            "voucher_type" => $voucherType,
            "voucher_no" => $voucherNo,
            "date" => cleanValue($row["Date"]),
            "sales_id" => voucherId($row["sales_id"], $voucherNo),
            "party" => cleanValue($row["ledger"]),
            "executive" => executiveName($row["EveExecutive"]),
            "reference" => cleanValue($row["Reference"]),
            "narration" => shortNarration($row["Narration"]),
            "bill_ref" => $billRef,
            "bill_type" => $billType,
            /* Like Tally: the bill's own credit period, else the
               voucher's due date of payment, and only then the party's
               default credit period. */
            "credit_days" => billCreditDays(
                cleanValue($row["Date"]),
                $row["ADCBillCrPeriod"],
                $row["EveBasicDueDateOfPymt"],
                $row["EvePartyCrPeriod"]
            ),
            "amount" => $amount
        ];

        /* sales_id (Sales ID + voucher number) is the voucher: one allocation per voucher,
           ledger, bill and type, however many rows repeat it (item rows,
           or the same voucher imported twice under another voucher
           type / number). Without a Sales ID, numbered vouchers are
           matched by number and every unnumbered row is its own. */
        // Voucher + ledger. Rows with a bill (or a bill type such as
        // On Account) are its bill-wise allocations; a row with neither
        // is the plain ledger line of the same amount, see below.
        $voucherKey = strtolower(
            ($entry["sales_id"] !== "" ? "id|" . $entry["sales_id"] : $voucherType . "|" . $voucherNo)
            . "|" . ledgerKey($entry["party"])
        );

        $entry["voucher_key"] = $voucherKey;

        if ($billRef !== "" || $billType !== "") {
            $billWise[$voucherKey] = true;
        }

        if ($entry["sales_id"] !== "") {
            $key = strtolower(
                "id|" . $entry["sales_id"] . "|" . ledgerKey($entry["party"]) . "|" . $billRef . "|" . $billType
            );
        } elseif ($voucherNo !== "") {
            $key = strtolower(
                $voucherType . "|" . $voucherNo . "|" . ledgerKey($entry["party"]) . "|" . $billRef . "|" . $billType
            );
        } else {
            if ($amount !== null && abs($amount) >= 0.005) {
                $allocations[] = $entry;
            }
            continue;
        }

        if ($row["Amount"] !== null && trim((string)$row["Amount"]) !== "") {
            $itemTotals[$key] = ($itemTotals[$key] ?? 0) + (float)$row["Amount"];
            $itemSigs[$key][] = itemSignature($row);
            $itemGst[$key] = ($itemGst[$key] ?? 0) + itemRowGst($row);
        }

        foreach (["CGST" => "EveEveCGSTTaxAmt", "SGST" => "EveEveSGSTTaxAmt",
                  "IGST" => "EveEveiGSTTaxAmt", "Round Off" => "EveEveRoundOffAmt"] as $name => $column) {
            if (!isset($taxes[$key][$name]) && $row[$column] !== null && trim((string)$row[$column]) !== "") {
                $taxes[$key][$name] = (float)$row[$column];
            }
        }

        $entry["alloc_key"] = $key;

        if (!isset($numbered[$key])) {
            $numbered[$key] = $entry;
        } elseif ($numbered[$key]["amount"] === null && $amount !== null) {
            $numbered[$key]["amount"] = $amount;
        }
    }

    $stmt->closeCursor();

    // A voucher repeated in the export (imported twice) counts once;
    // identical lines inside one invoice all count (see repeatFactor).
    foreach ($itemTotals as $key => $total) {
        $voucherTax = abs((float)($taxes[$key]["CGST"] ?? 0))
            + abs((float)($taxes[$key]["SGST"] ?? 0))
            + abs((float)($taxes[$key]["IGST"] ?? 0));

        $itemTotals[$key] = $total / repeatFactor($itemSigs[$key], $itemGst[$key] ?? 0, $voucherTax);
    }

    foreach ($numbered as $entry) {

        if ($entry["amount"] === null || abs($entry["amount"]) < 0.005) {
            continue;
        }

        // Sales row with the item amount -> party bill amount
        // (1,200.00 Cr item -> 1,416.00 Dr bill). Page sign = - Tally.
        $party = salesPartyAmount(
            $entry["voucher_type"],
            -$entry["amount"],
            $itemTotals[$entry["alloc_key"]] ?? 0,
            $taxes[$entry["alloc_key"]] ?? []
        );

        if ($party !== null) {
            $entry["amount"] = -$party;
        }

        /* The export can carry the ledger line itself (no bill, no bill
           type) next to its bill-wise allocations. It is the same money:
           when the voucher has allocations for this ledger, they count
           and the plain line is left out. */
        if ($entry["bill_ref"] === "" && $entry["bill_type"] === ""
            && isset($billWise[$entry["voucher_key"]])) {
            continue;
        }

        if ($entry["bill_ref"] === "" && stripos($entry["voucher_type"], "sales") !== false) {
            // Sales bill without a bill reference: the bill is the voucher.
            $entry["bill_ref"] = $entry["voucher_no"];
            $entry["bill_type"] = "New Ref";
        }

        $allocations[] = $entry;
    }

    usort($allocations, function ($a, $b) {
        return strcmp($a["date"], $b["date"]);
    });

    /* =========================================================
       4. GROUP INTO BILLS (ledger + bill reference)
    ========================================================= */

    $refs = [];
    $onAccount = [];
    $ledgerInfo = [];

    $newRef = function (string $partyKey, string $billRef): array {
        return [
            "party_key" => $partyKey,
            "bill_ref" => $billRef,
            "bill_date" => "",
            "voucher_type" => "",
            "voucher_no" => "",
            "credit_days" => 0,
            "reference" => "",
            "executive" => "",
            "has_new_ref" => false,
            "bill_from_sales" => false,
            "is_opening" => false,
            "opening_amount" => 0,
            "bill_amount" => 0,
            "received" => 0,
            "credit_note" => 0,
            "other" => 0,
            "balance" => 0,
            "last_receipt_date" => "",
            "lines" => []
        ];
    };

    /* One allocation line (page sign) added to its bill. */
    $addToBill = function (array &$ref, array $line) {
        $amount = $line["amount"];
        $type = strtolower($line["voucher_type"]);

        if ($amount > 0) {
            $ref["bill_amount"] += $amount;
        } elseif (strpos($type, "receipt") !== false) {
            $ref["received"] += -$amount;
            $ref["last_receipt_date"] = $line["date"];
        } elseif (strpos($type, "credit") !== false) {
            $ref["credit_note"] += -$amount;
        } else {
            $ref["other"] += -$amount;
        }

        $ref["balance"] += $amount;
        $ref["lines"][] = $line;
    };

    /* Opening bills first: this year's entries against the same
       reference are added to them below. "On Account" in the XML
       is money not set against any bill. */
    foreach ($openingBills as $partyKey => $list) {

        $ledgerInfo[$partyKey] = [
            "party" => $openingParty[$partyKey],
            "executive" => $ledgerGroup[$partyKey] ?? executiveFromName($openingParty[$partyKey])
        ];

        foreach ($list as $ob) {

            if ($ob["bill_ref"] === "" || strcasecmp($ob["bill_ref"], "On Account") === 0) {
                $onAccount[$partyKey][] = [
                    "date" => $ob["bill_date"],
                    "voucher_type" => "Opening Balance",
                    "voucher_no" => "",
                    "sales_id" => "",
                    "bill_type" => "On Account",
                    "narration" => "",
                    "amount" => $ob["amount"]
                ];
                continue;
            }

            $refKey = $partyKey . "|" . strtolower($ob["bill_ref"]);

            if (!isset($refs[$refKey])) {
                $refs[$refKey] = $newRef($partyKey, $ob["bill_ref"]);
            }

            $ref =& $refs[$refKey];

            $ref["has_new_ref"] = true;
            $ref["bill_from_sales"] = true;
            $ref["is_opening"] = true;
            $ref["bill_date"] = $ob["bill_date"];
            $ref["voucher_type"] = "Opening Balance";
            $ref["voucher_no"] = $ob["bill_ref"];
            $ref["credit_days"] = $ob["credit_days"];
            $ref["opening_amount"] += $ob["amount"];
            $ref["bill_amount"] += $ob["amount"];
            $ref["balance"] += $ob["amount"];

            unset($ref);
        }
    }

    foreach ($allocations as $a) {

        $partyKey = ledgerKey($a["party"]);

        if (!isset($ledgerInfo[$partyKey])) {
            $ledgerInfo[$partyKey] = [
                "party" => $a["party"],
                "executive" => $ledgerGroup[$partyKey] ?? ""
            ];
        }

        // No ledger group: executive comes from sales vouchers.
        if (!isset($ledgerGroup[$partyKey])
            && stripos($a["voucher_type"], "sales") !== false
            && $a["executive"] !== "") {
            $ledgerInfo[$partyKey]["executive"] = $a["executive"];
        }

        $line = [
            "date" => $a["date"],
            "voucher_type" => $a["voucher_type"],
            "voucher_no" => $a["voucher_no"],
            "sales_id" => $a["sales_id"],
            "bill_type" => $a["bill_type"],
            "narration" => $a["narration"],
            "amount" => round($a["amount"], 2)
        ];

        $isOnAccount = $a["bill_ref"] === ""
            || strcasecmp($a["bill_type"], "On Account") === 0
            || $a["bill_type"] === "";

        if ($isOnAccount) {
            $onAccount[$partyKey][] = $line;
            continue;
        }

        $refKey = $partyKey . "|" . strtolower($a["bill_ref"]);

        if (!isset($refs[$refKey])) {
            $refs[$refKey] = $newRef($partyKey, $a["bill_ref"]);
        }

        $ref =& $refs[$refKey];

        $isNewRef = strcasecmp($a["bill_type"], "New Ref") === 0
            || strcasecmp($a["bill_type"], "Advance") === 0;

        $isSalesBill = $a["amount"] > 0
            && (stripos($a["voucher_type"], "sales") !== false
                || stripos($a["voucher_type"], "debit") !== false);

        /* Bill date / credit days come from the sales bill. When an
           advance was received first (Receipt New Ref, then the sale
           Agst Ref), the sale still decides the bill details. */
        if (($isSalesBill && !$ref["bill_from_sales"]) || ($isNewRef && !$ref["has_new_ref"])) {
            $ref["has_new_ref"] = true;
            $ref["bill_from_sales"] = $ref["bill_from_sales"] || $isSalesBill;
            $ref["bill_date"] = $a["date"];
            $ref["voucher_type"] = $a["voucher_type"];
            $ref["voucher_no"] = $a["voucher_no"];
            $ref["credit_days"] = $a["credit_days"];
            $ref["reference"] = $a["reference"];
        }

        if (stripos($a["voucher_type"], "sales") !== false && $a["executive"] !== "") {
            $ref["executive"] = $a["executive"];
        }

        $addToBill($ref, $line);

        unset($ref);
    }

    /* =========================================================
       4b. RECEIPTS OF kseb_receipts -> BILLS

       No bill reference in that export: an Agst Ref goes to the
       bill of the same ledger with its bill date (credit notes:
       by Reference first). Receipts are applied in date order,
       so an earlier receipt has already reduced the bills.
       Resolved allocations are added to $allocations too, for
       the receipts list and the voucher details below.
    ========================================================= */

    $billsByDate = [];

    foreach ($refs as $refKey => $ref) {
        if ($ref["has_new_ref"] && $ref["bill_date"] !== "") {
            $billsByDate[$ref["party_key"] . "|" . $ref["bill_date"]][] = $refKey;
        }
    }

    foreach ($billsByDate as $dateKey => $keys) {
        usort($keys, function ($a, $b) use ($refs) {
            return strnatcasecmp($refs[$a]["bill_ref"], $refs[$b]["bill_ref"]);
        });
        $billsByDate[$dateKey] = $keys;
    }

    $receiptAllocations = [];
    $unmatchedReceipts = 0;

    foreach ($receiptVouchers as $v) {

        $isCreditNote = stripos($v["voucher_type"], "credit") !== false;

        // Same credit note already in salesdata (with its bill names).
        if ($isCreditNote
            && (isset($salesVoucherIds[$v["master_id"]])
                || ($v["voucher_no"] !== "" && isset($salesVoucherNos[strtolower($v["voucher_no"])])))) {
            continue;
        }

        if (stripos($v["voucher_type"], "receipt") !== false) {
            $receiptRows++;
        }

        foreach ($v["allocations"] as $al) {

            // Ledger of this allocation (another KSEB office's bill can
            // be settled from this receipt).
            $partyKey = ledgerKey($al["ledger"]);

            if (!isset($ledgerInfo[$partyKey])) {
                $ledgerInfo[$partyKey] = [
                    "party" => $al["ledger"],
                    "executive" => $ledgerGroup[$partyKey] ?? executiveFromName($al["ledger"])
                ];
            }

            $party = $ledgerInfo[$partyKey]["party"];

            // Tally sign (Cr +) -> page sign (- = received).
            $amount = round(-$al["amount"], 2);

            $byBillName = $partyKey . "|" . strtolower($al["bill_ref"]);

            if ($al["bill_ref"] !== "" && strcasecmp($al["bill_type"], "On Account") !== 0) {
                /* The export has the bill number: that bill, like Tally.
                   - Agst Ref of a bill not in this data (neither opening
                     nor this year's) -> older receipts.
                   - New Ref / Advance (advance received for a bill): the
                     sale of that number settles it; until the sale is
                     made it is an advance (bill with a Cr balance). */
                if (!isset($refs[$byBillName])) {
                    $refs[$byBillName] = $newRef($partyKey, $al["bill_ref"]);
                }

                $isAdvance = strcasecmp($al["bill_type"], "New Ref") === 0
                    || strcasecmp($al["bill_type"], "Advance") === 0;

                if ($isAdvance && !$refs[$byBillName]["has_new_ref"]) {
                    $refs[$byBillName]["has_new_ref"] = true;
                    $refs[$byBillName]["bill_date"] = $v["date"];
                    $refs[$byBillName]["voucher_type"] = $v["voucher_type"];
                    $refs[$byBillName]["voucher_no"] = $v["voucher_no"];
                    $refs[$byBillName]["credit_days"] = $al["credit_days"];
                }

                $targets = [[$byBillName, $amount]];
            } elseif (strcasecmp($al["bill_type"], "Agst Ref") === 0) {
                $candidates = [];
                $byReference = $partyKey . "|" . strtolower($v["reference"]);

                if ($isCreditNote && $v["reference"] !== "" && !empty($refs[$byReference]["has_new_ref"])) {
                    $candidates = [$byReference];
                } elseif ($al["bill_date"] !== "") {
                    $candidates = $billsByDate[$partyKey . "|" . $al["bill_date"]] ?? [];
                }

                $targets = receiptTargets($refs, $candidates, $amount);
            } elseif (strcasecmp($al["bill_type"], "New Ref") === 0
                || strcasecmp($al["bill_type"], "Advance") === 0) {
                /* New Ref without a bill number: in Tally it is a bill of
                   its own (e.g. "Excess" on a payment, an advance on a
                   receipt), pending until something is set against it.
                   The export does not carry its name, so it is named
                   from the voucher. */
                $label = $v["voucher_type"] . " " . date("d-M-y", strtotime($v["date"]))
                    . ($v["voucher_no"] !== "" ? " " . $v["voucher_no"] : "") . " (New Ref)";
                $newKey = $partyKey . "|" . strtolower($label);
                $n = 1;

                while (isset($refs[$newKey])) {
                    $newKey = $partyKey . "|" . strtolower($label) . "#" . (++$n);
                }

                $refs[$newKey] = $newRef($partyKey, $n > 1 ? $label . " " . $n : $label);
                $refs[$newKey]["has_new_ref"] = true;
                $refs[$newKey]["bill_date"] = $al["bill_date"] !== "" ? $al["bill_date"] : $v["date"];
                $refs[$newKey]["voucher_type"] = $v["voucher_type"];
                $refs[$newKey]["voucher_no"] = $v["voucher_no"];
                $refs[$newKey]["credit_days"] = $al["credit_days"];

                // A later Agst Ref of the same bill date can find it.
                $billsByDate[$partyKey . "|" . $refs[$newKey]["bill_date"]][] = $newKey;

                $targets = [[$newKey, $amount]];
            } else {
                // On Account: not against a bill.
                $targets = [[null, $amount]];
            }

            foreach ($targets as [$refKey, $part]) {

                $unmatched = $refKey === null && strcasecmp($al["bill_type"], "Agst Ref") === 0;

                $line = [
                    "date" => $v["date"],
                    "voucher_type" => $v["voucher_type"],
                    "voucher_no" => $v["voucher_no"],
                    "sales_id" => $v["master_id"],
                    "bill_type" => $al["bill_type"],
                    "narration" => $unmatched && $al["bill_date"] !== ""
                        ? "Bill dated " . $al["bill_date"] . " not found"
                        : "",
                    "amount" => $part
                ];

                if ($refKey === null) {
                    $line["bill_date"] = $al["bill_date"];
                    $line["unmatched"] = $unmatched;
                    $onAccount[$partyKey][] = $line;

                    if ($unmatched) {
                        $unmatchedReceipts++;
                    }
                } else {
                    $addToBill($refs[$refKey], $line);
                }

                $billRef = $refKey === null ? "" : $refs[$refKey]["bill_ref"];

                $allocations[] = [
                    "voucher_type" => $v["voucher_type"],
                    "voucher_no" => $v["voucher_no"],
                    "date" => $v["date"],
                    "sales_id" => $v["master_id"],
                    "party" => $party,
                    "executive" => "",
                    "reference" => $v["reference"],
                    "narration" => $line["narration"],
                    "bill_ref" => $billRef,
                    // New Ref stays an advance in the receipts list.
                    "bill_type" => $al["bill_type"],
                    "credit_days" => $al["credit_days"],
                    "amount" => $part,
                    "unmatched" => $unmatched
                ];

                // Voucher details: this ledger's bill allocations.
                $receiptAllocations[$v["master_id"]][] = [
                    "ledger" => $party,
                    "bill_ref" => $billRef !== "" ? $billRef : ($unmatched ? "(bill not identified)" : ""),
                    "bill_type" => $al["bill_type"],
                    "credit_days" => $al["credit_days"]
                ] + drCrLine($party, -$part);
            }
        }
    }

    if ($unmatchedReceipts > 0) {
        $warnings[] = $unmatchedReceipts . " receipt allocation(s) could not be matched to a bill"
            . " (kseb_receipts has the bill date, not the bill number) - they are shown with the On Account amounts.";
    }

    /* =========================================================
       5. BUILD RESPONSE ROWS
    ========================================================= */

    $asOfDate = new DateTime($asOf);

    $bills = [];
    $olderReceipts = [];

    $summary = [
        "billed_amount" => 0,
        "billed_count" => 0,
        "opening_bills_amount" => 0,
        "opening_bills_count" => 0,
        "received_amount" => 0,
        "credit_note_amount" => 0,
        "pending_amount" => 0,
        "pending_count" => 0,
        "cleared_count" => 0,
        "overdue_amount" => 0,
        "overdue_count" => 0,
        "excess_amount" => 0,
        "on_account_amount" => 0,
        "unmatched_receipts_amount" => 0,
        "older_receipts_amount" => 0,
        "older_receipts_count" => 0
    ];

    $buckets = [
        "not_due" => ["amount" => 0, "count" => 0],
        "1_30" => ["amount" => 0, "count" => 0],
        "31_60" => ["amount" => 0, "count" => 0],
        "61_90" => ["amount" => 0, "count" => 0],
        "90_plus" => ["amount" => 0, "count" => 0]
    ];

    foreach ($refs as $ref) {

        $party = $ledgerInfo[$ref["party_key"]]["party"];
        $distribution = $directory[$ref["party_key"]] ?? "";

        if ($distribution === "") {
            $distribution = "Unmapped";
        }

        /* Bill neither in the opening bills nor in this year's data:
           only list what was received / adjusted against it. */
        if (!$ref["has_new_ref"]) {

            foreach ($ref["lines"] as $line) {
                $olderReceipts[] = [
                    "party" => $party,
                    "distribution" => $distribution,
                    "bill_ref" => $ref["bill_ref"]
                ] + $line;

                $summary["older_receipts_amount"] += -$line["amount"];
                $summary["older_receipts_count"]++;
            }

            continue;
        }

        // Bill date filter (outstanding of these bills is still as on as_of).
        // Opening bills are always listed: they are before the period.
        if (!$ref["is_opening"] && ($ref["bill_date"] < $fromDate || $ref["bill_date"] > $toDate)) {
            continue;
        }

        $balance = round($ref["balance"], 2);

        if (abs($balance) < 1) {
            $status = "cleared";
        } elseif ($balance < 0) {
            $status = "excess";
        } elseif ($ref["received"] + $ref["credit_note"] + $ref["other"] > 0.5) {
            $status = "part";
        } else {
            $status = "pending";
        }

        $dueDate = (new DateTime($ref["bill_date"]))
            ->modify("+" . $ref["credit_days"] . " days");

        // Positive = days past due, zero / negative = not yet due.
        $overdueDays = (int)$dueDate->diff($asOfDate)->format("%r%a");

        $isPending = $status === "pending" || $status === "part";

        $bucket = $isPending ? ageBucket($overdueDays) : "";

        $bills[] = [
            "bill_ref" => $ref["bill_ref"],
            "voucher_type" => $ref["voucher_type"],
            "voucher_no" => $ref["voucher_no"],
            "bill_date" => $ref["bill_date"],
            "due_date" => $dueDate->format("Y-m-d"),
            "credit_days" => $ref["credit_days"],
            "overdue_days" => $isPending ? $overdueDays : 0,
            "bucket" => $bucket,
            "status" => $status,
            "party" => $party,
            "executive" => $ledgerInfo[$ref["party_key"]]["executive"] !== ""
                ? $ledgerInfo[$ref["party_key"]]["executive"]
                : $ref["executive"],
            "reference" => $ref["reference"],
            "distribution" => $distribution,
            // Opening bill: pending on 1st April, already inside the
            // ledger's opening balance (not a voucher of this period).
            "is_opening" => $ref["is_opening"],
            "opening_amount" => round($ref["opening_amount"], 2),
            "bill_amount" => round($ref["bill_amount"], 2),
            "received" => round($ref["received"], 2),
            "credit_note" => round($ref["credit_note"], 2),
            "other" => round($ref["other"], 2),
            "balance" => $balance,
            "last_receipt_date" => $ref["last_receipt_date"],
            "lines" => $ref["lines"]
        ];

        if ($ref["is_opening"]) {
            $summary["opening_bills_amount"] += $ref["opening_amount"];
            $summary["opening_bills_count"]++;
            $summary["billed_amount"] += $ref["bill_amount"] - $ref["opening_amount"];
        } else {
            $summary["billed_amount"] += $ref["bill_amount"];
            $summary["billed_count"]++;
        }

        $summary["received_amount"] += $ref["received"];
        $summary["credit_note_amount"] += $ref["credit_note"];

        if ($status === "cleared") {
            $summary["cleared_count"]++;
        } elseif ($status === "excess") {
            $summary["excess_amount"] += -$balance;
        } else {
            $summary["pending_amount"] += $balance;
            $summary["pending_count"]++;

            if ($overdueDays > 0) {
                $summary["overdue_amount"] += $balance;
                $summary["overdue_count"]++;
            }

            $buckets[$bucket]["amount"] += $balance;
            $buckets[$bucket]["count"]++;
        }
    }

    /* =========================================================
       RECEIVED PAYMENTS - every KSEB receipt allocation

       adjusted_to: bill    = against a bill of this year
                    opening = against an opening bill (XML)
                    older   = against a bill not in this data
                    not_identified = kseb_receipts allocation whose
                              bill (by bill date) was not found
                    on_account / advance
    ========================================================= */

    $billStatus = [];

    foreach ($bills as $bill) {
        $billStatus[ledgerKey($bill["party"]) . "|" . strtolower($bill["bill_ref"])] = $bill;
    }

    $receipts = [];

    foreach ($allocations as $a) {

        if (stripos($a["voucher_type"], "receipt") === false) {
            continue;
        }

        $partyKey = ledgerKey($a["party"]);
        $refKey = $partyKey . "|" . strtolower($a["bill_ref"]);

        $isOnAccount = $a["bill_ref"] === ""
            || strcasecmp($a["bill_type"], "On Account") === 0
            || $a["bill_type"] === "";

        if (!empty($a["unmatched"])) {
            $adjustedTo = "not_identified";
        } elseif ($isOnAccount) {
            $adjustedTo = "on_account";
        } elseif (isset($refs[$refKey]) && !$refs[$refKey]["has_new_ref"]) {
            $adjustedTo = "older";
        } elseif (isset($refs[$refKey]) && $refs[$refKey]["is_opening"]) {
            $adjustedTo = "opening";
        } elseif (strcasecmp($a["bill_type"], "New Ref") === 0
            || strcasecmp($a["bill_type"], "Advance") === 0) {
            $adjustedTo = "advance";
        } else {
            $adjustedTo = "bill";
        }

        // kseb_receipts New Ref = advance received.
        if ($adjustedTo === "on_account" && strcasecmp($a["bill_type"], "New Ref") === 0) {
            $adjustedTo = "advance";
        }

        $bill = $billStatus[$refKey] ?? null;
        $distribution = $directory[$partyKey] ?? "";

        $receipts[] = [
            "date" => $a["date"],
            "sales_id" => $a["sales_id"],
            "voucher_type" => $a["voucher_type"],
            "party" => $a["party"],
            "executive" => $ledgerInfo[$partyKey]["executive"] ?? "",
            "distribution" => $distribution !== "" ? $distribution : "Unmapped",
            "bill_ref" => $a["bill_ref"],
            "bill_type" => $a["bill_type"],
            "adjusted_to" => $adjustedTo,
            "bill_date" => $bill["bill_date"] ?? "",
            "bill_amount" => $bill["bill_amount"] ?? null,
            "bill_balance" => $bill["balance"] ?? null,
            "narration" => $a["narration"],
            "amount" => round(-$a["amount"], 2)
        ];
    }

    usort($receipts, function ($a, $b) {
        return strcmp($b["date"], $a["date"]);
    });

    /* On Account per ledger. Positive = received, not set against a bill. */

    $onAccountRows = [];

    foreach ($onAccount as $partyKey => $lines) {

        $total = 0;
        $unmatchedTotal = 0;

        foreach ($lines as $line) {
            $total += $line["amount"];

            if (!empty($line["unmatched"])) {
                $unmatchedTotal += $line["amount"];
            }
        }

        $total = round(-$total, 2);

        if (abs($total) < 1) {
            continue;
        }

        $distribution = $directory[$partyKey] ?? "";

        $onAccountRows[] = [
            "party" => $ledgerInfo[$partyKey]["party"],
            "executive" => $ledgerInfo[$partyKey]["executive"],
            "distribution" => $distribution !== "" ? $distribution : "Unmapped",
            "amount" => $total,
            // Part of amount: receipts whose bill was not identified.
            "unmatched_amount" => round(-$unmatchedTotal, 2),
            "lines" => $lines
        ];

        $summary["on_account_amount"] += $total;
        $summary["unmatched_receipts_amount"] += -$unmatchedTotal;
    }

    /* Security deposits per deposit ledger + reference (LPO): what was
       deposited, what was refunded and what KSEB still holds. The KSEB
       ledger is the voucher party; a refund booked on the deposit
       ledger itself takes the KSEB ledger of that deposit's earlier
       entries. */

    $depositKseb = [];

    foreach ($depositEntries as $d) {
        if (strpos(ledgerKey($d["party"]), "kseb") === 0) {
            $depositKseb[ledgerKey($d["ledger"])] = $d["party"];
        }
    }

    // KSEB ledgers by office name ("Security Deposit with KSEB ED
    // Mananthavady" -> "KSEB- ED- Mananthavady C/o Sreelal").
    $officeLedger = [];

    foreach (array_merge(
        array_column($ledgerInfo, "party"),
        array_values($openingNames),
        array_column($depositEntries, "party")
    ) as $name) {
        if (strpos(ledgerKey($name), "kseb") === 0 && officeKey($name) !== "") {
            $officeLedger[officeKey($name)] = $officeLedger[officeKey($name)] ?? $name;
        }
    }

    $depositGroups = [];

    foreach ($depositEntries as $d) {
        /* KSEB ledger of the deposit: the office in the deposit ledger's
           name, else the voucher's KSEB party, else the KSEB party of
           the same deposit ledger's other entries. */
        $ksebParty = $officeLedger[officeKey($d["ledger"])]
            ?? (strpos(ledgerKey($d["party"]), "kseb") === 0
                ? $d["party"]
                : ($depositKseb[ledgerKey($d["ledger"])] ?? $d["party"]));

        $groupKey = ledgerKey($ksebParty) . "|" . ledgerKey($d["ledger"]) . "|"
            . ($d["bill_ref"] !== "" ? strtolower($d["bill_ref"]) : "#" . $d["master_id"]);

        if (!isset($depositGroups[$groupKey])) {
            $partyKey = ledgerKey($ksebParty);
            $distribution = $directory[$partyKey] ?? "";

            $depositGroups[$groupKey] = [
                "party" => $ledgerInfo[$partyKey]["party"] ?? $ksebParty,
                "executive" => $ledgerInfo[$partyKey]["executive"] ?? executiveFromName($ksebParty),
                "distribution" => $distribution !== "" ? $distribution : "Unmapped",
                "deposit_ledger" => $d["ledger"],
                "bill_ref" => $d["bill_ref"],
                "date" => $d["date"],
                "credit_days" => $d["credit_days"],
                "deposited" => 0,
                "refunded" => 0,
                "balance" => 0,
                "lines" => []
            ];
        }

        $g =& $depositGroups[$groupKey];

        if ($d["amount"] > 0) {
            $g["deposited"] += $d["amount"];

            if ($g["credit_days"] === 0) {
                $g["credit_days"] = $d["credit_days"];
            }
        } else {
            $g["refunded"] += -$d["amount"];
        }

        $g["balance"] += $d["amount"];
        $g["lines"][] = [
            "date" => $d["date"],
            "voucher_type" => $d["voucher_type"],
            "voucher_no" => $d["voucher_no"],
            "sales_id" => $d["master_id"],
            "bill_type" => $d["bill_type"],
            "amount" => $d["amount"],
            "ledgers" => $d["ledgers"]
        ];

        unset($g);
    }

    $securityDeposits = [];

    foreach ($depositGroups as $g) {
        $g["deposited"] = round($g["deposited"], 2);
        $g["refunded"] = round($g["refunded"], 2);
        $g["balance"] = round($g["balance"], 2);
        $g["due_date"] = $g["credit_days"] > 0
            ? (new DateTime($g["date"]))->modify("+" . $g["credit_days"] . " days")->format("Y-m-d")
            : "";
        $securityDeposits[] = $g;
    }

    usort($securityDeposits, function ($a, $b) {
        return strcmp($a["date"], $b["date"]) ?: strnatcasecmp($a["bill_ref"], $b["bill_ref"]);
    });

    /* Opening balances keyed by the same ledger name the bills use. */

    $openingBalances = [];

    foreach ($openingByKey as $partyKey => $amount) {
        $name = $ledgerInfo[$partyKey]["party"] ?? $openingNames[$partyKey];
        $openingBalances[$name] = $amount;
    }

    /* Opening balance break up (Tally XML), keyed like the bills:
       every bill pending on 1st April, in XML order, with what is
       left of it as on the as-on date (null for On Account lines,
       they are not a bill). Amounts in page sign (+ = Dr). */

    $openingBreakup = [];

    foreach ($openingBills as $partyKey => $list) {

        $rows = [];

        foreach ($list as $ob) {

            $isOnAccount = $ob["bill_ref"] === "" || strcasecmp($ob["bill_ref"], "On Account") === 0;
            $refKey = $partyKey . "|" . strtolower($ob["bill_ref"]);

            $rows[] = [
                "bill_ref" => $isOnAccount ? "On Account" : $ob["bill_ref"],
                "bill_date" => $ob["bill_date"],
                "credit_days" => $ob["credit_days"],
                "due_date" => (new DateTime($ob["bill_date"]))
                    ->modify("+" . $ob["credit_days"] . " days")
                    ->format("Y-m-d"),
                "is_on_account" => $isOnAccount,
                "amount" => $ob["amount"],
                "balance" => !$isOnAccount && isset($refs[$refKey])
                    ? round($refs[$refKey]["balance"], 2)
                    : null
            ];
        }

        $name = $ledgerInfo[$partyKey]["party"] ?? $openingParty[$partyKey];

        $openingBreakup[$name] = [
            "total" => round(array_sum(array_column($rows, "amount")), 2),
            // Party total as Tally reports it (= opening balance).
            "xml_total" => $openingXmlTotal[$partyKey] ?? null,
            "bills" => $rows
        ];
    }

    /* =========================================================
       5b. VOUCHER DETAILS (optional)

       All rows of every voucher used above, also the non-KSEB
       ledgers of that voucher (e.g. Security Deposit lines).
    ========================================================= */

    $usedIds = [];

    foreach ($allocations as $a) {
        if ($a["sales_id"] !== "") {
            $usedIds[$a["sales_id"]] = true;
        }
    }

    $vouchers = [];

    try {
        /* Only the vouchers used on the page, by their Sales ID (the
           part before "#voucher no"), in chunks: reading every KSEB
           voucher of every year made the page slow. Receipts of
           kseb_receipts get their own details below. */
        $salesIds = [];

        foreach (array_keys($usedIds) as $usedId) {
            $usedId = (string)$usedId;

            if (!isset($receiptAllocations[$usedId])) {
                $salesIds[explode("#", $usedId, 2)[0]] = true;
            }
        }

        $rowsById = [];

        foreach (array_chunk(array_keys($salesIds), 500) as $chunk) {
            $detailStmt = $pdo->prepare("
                SELECT
                    d.`Sales ID` AS sales_id,
                    d.VoucherTypeName,
                    d.VoucherNumber,
                    d.`Date`,
                    d.PartyLedgerName,
                    COALESCE(NULLIF(TRIM(d.ADCLedgerName), ''), d.PartyLedgerName) AS ledger,
                    d.ADCBillName,
                    d.ADCBillType,
                    d.ADCBillCrPeriod,
                    d.StockItemName,
                    d.BilledQty,
                    d.Rate,
                    d.Discount,
                    d.JasBaseUnit,
                    d.EveItemGstRate,
                    d.SafHSNSACCode,
                    d.Amount,
                    d.Narration,
                    d.JasSalesLedName,
                    d.EveEveCGSTTaxAmt,
                    d.EveEveSGSTTaxAmt,
                    d.EveEveiGSTTaxAmt,
                    d.EveEveRoundOffAmt
                FROM salesdata d
                WHERE d.`Sales ID` IN (" . implode(",", array_fill(0, count($chunk), "?")) . ")
                ORDER BY d.`Sl No` ASC
            ");

            $detailStmt->execute(array_map("strval", $chunk));

            while ($row = $detailStmt->fetch()) {
                $salesId = voucherId($row["sales_id"], $row["VoucherNumber"]);

                if (isset($usedIds[$salesId])) {
                    $rowsById[$salesId][] = $row;
                }
            }

            $detailStmt->closeCursor();
        }

        foreach ($rowsById as $salesId => $rows) {
            $vouchers[(string)$salesId] = voucherDetails((string)$salesId, $rows);
        }

    } catch (Throwable $e) {
        error_log("KSEB OUTSTANDING VOUCHER DETAILS ERROR: " . $e->getMessage());
        $warnings[] = "Voucher details could not be read.";
    }

    // kseb_receipts vouchers: every ledger line is in that export.
    foreach ($receiptVouchers as $v) {

        if (!isset($receiptAllocations[$v["master_id"]])) {
            continue;
        }

        $vouchers[$v["master_id"]] = [
            "sales_id" => $v["master_id"],
            "voucher_type" => $v["voucher_type"],
            "voucher_no" => $v["voucher_no"],
            "date" => $v["date"],
            "party" => $v["party"],
            "narration" => "",
            "ledgers" => $v["ledgers"],
            "allocations" => $receiptAllocations[$v["master_id"]]
        ];
    }

    if ($receiptRows === 0) {
        $warnings[] = "Receipts are not loaded yet - pending amounts do not include payments received.";
    }

    /* =========================================================
       6. FINALIZE
    ========================================================= */

    foreach ($summary as $key => $value) {
        if (is_float($value)) {
            $summary[$key] = round($value, 2);
        }
    }

    $summary["net_outstanding"] = round(
        $summary["pending_amount"] - $summary["on_account_amount"] - $summary["excess_amount"],
        2
    );

    foreach ($buckets as $key => $bucket) {
        $buckets[$key]["amount"] = round((float)$bucket["amount"], 2);
    }

    usort($bills, function ($a, $b) {
        return strcmp($a["bill_date"], $b["bill_date"])
            ?: strnatcasecmp($a["bill_ref"], $b["bill_ref"]);
    });

    usort($olderReceipts, function ($a, $b) {
        return strcmp($a["date"], $b["date"]);
    });

    /* =========================================================
       7. RESPONSE
    ========================================================= */

    echo json_encode(
        [
            "success" => true,
            "from_date" => $fromDate,
            "to_date" => $toDate,
            "as_of" => $asOf,
            "opening_date" => $openingDate,
            "opening_bills_source" => $xmlSource,
            "opening_bills_updated" => $xmlUpdated,
            "count" => count($bills),
            "receipt_rows" => $receiptRows,
            "receipts_source" => $useReceiptTable ? "kseb_receipts" : "salesdata",
            "summary" => $summary,
            "buckets" => $buckets,
            "bills" => $bills,
            "on_account" => $onAccountRows,
            "older_receipts" => $olderReceipts,
            "receipts" => $receipts,
            "opening_balances" => (object)$openingBalances,
            "opening_breakup" => (object)$openingBreakup,
            "security_deposits" => $securityDeposits,
            "vouchers" => (object)$vouchers,
            "directory_count" => count($directory),
            "warnings" => $warnings
        ],
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

} catch (Throwable $e) {

    /* Log the real error; do not show database details to users. */
    error_log("KSEB OUTSTANDING ERROR: " . $e->getMessage());

    http_response_code(500);

    echo json_encode(
        [
            "success" => false,
            "count" => 0,
            "bills" => [],
            "message" => "Failed to load KSEB outstanding."
        ],
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

} finally {

    $pdo = null;
}
