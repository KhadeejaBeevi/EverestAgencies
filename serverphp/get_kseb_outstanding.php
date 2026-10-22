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
| Source: salesdata (EveSalesCollection export from Tally). Besides sales
| it holds Receipt, Credit Note, Debit Note and Payment vouchers.
|
| Every row carries one bill-wise allocation of its voucher
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
| Like Tally, per KSEB ledger and bill reference:
|
|   balance = sum of all allocations (sale - receipts - credit notes ...)
|
|   balance > 0  -> pending (part received when something came in)
|   balance = 0  -> cleared
|   balance < 0  -> excess / advance received
|
| "On Account" allocations are not against any bill: they are shown per
| ledger as unadjusted amounts.
|
| Receipts against a bill that is not in this data (for example last
| year's EV/25-26 bills) are listed separately.
|
| KSEB ledger = ledger name starting with "KSEB" (same rule as
| kseb_payment.php). Distribution comes from tally_db.kseb_directory
| (tally_name -> PARENT_AREA), when the ledger is mapped there.
|
| Voucher details (Tally "explode"): every voucher used on the page is
| returned once in vouchers { Sales ID: ... } with all its ledger lines
| and bill allocations; bill lines and receipts carry its sales_id.
| `Sales ID` is Tally's voucher id, the same on every row of a voucher.
| Sales rows hold only the party allocation, so the sales ledger line
| is worked out as party amount - CGST - SGST - IGST - round off.
| The export has only bill-wise ledgers, so on receipts the bank, TDS
| and round off lines are missing: their total (what the voucher is
| short of balancing) is shown as one "not in export" line.
|
| Executive of a KSEB ledger = its Tally group (ParentLedgerName, e.g.
| "Libin K A", "Sreelal", "Thomson"). EveExecutive on KSEB sales is
| mostly just "KSEB", so it is only used when the ledger has no group.
|
| Opening balance per ledger (as on 1st April) comes from
| salesdatalatest33 `Ledger.$OpeningBalance`, returned as
| opening_balances { ledger name: amount }, Dr positive / Cr negative.
|
| Params (GET or JSON POST):
|   from_date  YYYY-MM-DD bill date from (default: 1st April of this FY)
|   to_date    YYYY-MM-DD bill date to   (default: today)
|   as_of      YYYY-MM-DD only entries up to this date count; also the
|              date used for ageing (default: today)
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
  One voucher (all salesdata rows of one Sales ID) -> Tally style
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

    foreach ($rows as $row) {
        if (cleanValue($row["ADCBillName"]) !== "" || cleanValue($row["ADCBillType"]) !== "") {
            $billWise[ledgerKey($row["ledger"])] = true;
        }
    }

    foreach ($rows as $row) {

        // Voucher level values are repeated on every row: take the first.
        foreach ($taxColumns as $name => $column) {
            if ($tax[$name] === null && $row[$column] !== null && trim((string)$row[$column]) !== "") {
                $tax[$name] = (float)$row[$column];
            }
        }

        if ($salesLedger === "") {
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

        // All rows here are one voucher (one Sales ID): an allocation
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

        if (!isset($ledgers[$ledgerKey])) {
            $ledgers[$ledgerKey] = ["ledger" => $ledger, "amount" => 0];
        }

        $ledgers[$ledgerKey]["amount"] += $amount;

        if ($billRef !== "") {
            $allocations[] = [
                "ledger" => $ledger,
                "bill_ref" => $billRef,
                "bill_type" => $billType,
                "credit_days" => creditDays($row["ADCBillCrPeriod"])
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
        "allocations" => $allocations
    ];
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
       2. ALL KSEB BILL-WISE ALLOCATIONS UP TO AS-ON DATE

       Ledger = ADCLedgerName (falls back to PartyLedgerName
       when the export has no ledger on the row).
       Sales orders are not accounting vouchers - left out.
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
            s.Amount
        FROM salesdata s
        WHERE
            LOWER(TRIM(COALESCE(NULLIF(TRIM(s.ADCLedgerName), ''), s.PartyLedgerName, ''))) LIKE 'kseb%'
            AND LOWER(TRIM(COALESCE(s.VoucherTypeName, ''))) <> 'sales order'
            AND s.`Date` <= :as_of
        ORDER BY
            s.`Date` ASC,
            s.`Sl No` ASC
    ";

    $stmt = $pdo->prepare($sql);

    $stmt->execute([
        ":as_of" => $asOf
    ]);

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

    // How many KSEB receipt rows exist - 0 means the Excel imported
    // into salesdata had no Receipt vouchers.
    $receiptRows = 0;

    while ($row = $stmt->fetch()) {

        $voucherType = cleanValue($row["VoucherTypeName"]);

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

        // Tally sign (Dr -) -> page sign (+ = party owes us).
        $amount = ($row["Amount"] === null || trim((string)$row["Amount"]) === "")
            ? null
            : -(float)$row["Amount"];

        $entry = [
            "voucher_type" => $voucherType,
            "voucher_no" => $voucherNo,
            "date" => cleanValue($row["Date"]),
            "sales_id" => cleanValue($row["sales_id"]),
            "party" => cleanValue($row["ledger"]),
            "executive" => executiveName($row["EveExecutive"]),
            "reference" => cleanValue($row["Reference"]),
            "narration" => shortNarration($row["Narration"]),
            "bill_ref" => $billRef,
            "bill_type" => $billType,
            "credit_days" => creditDays(
                $row["ADCBillCrPeriod"],
                $row["EvePartyCrPeriod"],
                $row["EveBasicDueDateOfPymt"]
            ),
            "amount" => $amount
        ];

        /* Sales ID is Tally's voucher id: one allocation per voucher,
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

        if (!isset($numbered[$key])) {
            $numbered[$key] = $entry;
        } elseif ($numbered[$key]["amount"] === null && $amount !== null) {
            $numbered[$key]["amount"] = $amount;
        }
    }

    $stmt->closeCursor();

    foreach ($numbered as $entry) {

        if ($entry["amount"] === null || abs($entry["amount"]) < 0.005) {
            continue;
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
            $refs[$refKey] = [
                "party_key" => $partyKey,
                "bill_ref" => $a["bill_ref"],
                "bill_date" => "",
                "voucher_type" => "",
                "voucher_no" => "",
                "credit_days" => 0,
                "reference" => "",
                "executive" => "",
                "has_new_ref" => false,
                "bill_from_sales" => false,
                "bill_amount" => 0,
                "received" => 0,
                "credit_note" => 0,
                "other" => 0,
                "balance" => 0,
                "last_receipt_date" => "",
                "lines" => []
            ];
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

        $amount = $a["amount"];
        $type = strtolower($a["voucher_type"]);

        if ($amount > 0) {
            $ref["bill_amount"] += $amount;
        } elseif (strpos($type, "receipt") !== false) {
            $ref["received"] += -$amount;
            $ref["last_receipt_date"] = $a["date"];
        } elseif (strpos($type, "credit") !== false) {
            $ref["credit_note"] += -$amount;
        } else {
            $ref["other"] += -$amount;
        }

        $ref["balance"] += $amount;
        $ref["lines"][] = $line;

        unset($ref);
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
        "received_amount" => 0,
        "credit_note_amount" => 0,
        "pending_amount" => 0,
        "pending_count" => 0,
        "cleared_count" => 0,
        "overdue_amount" => 0,
        "overdue_count" => 0,
        "excess_amount" => 0,
        "on_account_amount" => 0,
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

        /* Bill not in this data (e.g. last year's bill): only list
           what was received / adjusted against it. */
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
        if ($ref["bill_date"] < $fromDate || $ref["bill_date"] > $toDate) {
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
            "bill_amount" => round($ref["bill_amount"], 2),
            "received" => round($ref["received"], 2),
            "credit_note" => round($ref["credit_note"], 2),
            "other" => round($ref["other"], 2),
            "balance" => $balance,
            "last_receipt_date" => $ref["last_receipt_date"],
            "lines" => $ref["lines"]
        ];

        $summary["billed_amount"] += $ref["bill_amount"];
        $summary["billed_count"]++;
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

       adjusted_to: bill  = against a bill in this data
                    older = against a bill not in this data
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

        if ($isOnAccount) {
            $adjustedTo = "on_account";
        } elseif (isset($refs[$refKey]) && !$refs[$refKey]["has_new_ref"]) {
            $adjustedTo = "older";
        } elseif (strcasecmp($a["bill_type"], "New Ref") === 0
            || strcasecmp($a["bill_type"], "Advance") === 0) {
            $adjustedTo = "advance";
        } else {
            $adjustedTo = "bill";
        }

        $bill = $billStatus[$refKey] ?? null;
        $distribution = $directory[$partyKey] ?? "";

        $receipts[] = [
            "date" => $a["date"],
            "sales_id" => $a["sales_id"],
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

        foreach ($lines as $line) {
            $total += $line["amount"];
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
            "lines" => $lines
        ];

        $summary["on_account_amount"] += $total;
    }

    /* Opening balances keyed by the same ledger name the bills use. */

    $openingBalances = [];

    foreach ($openingByKey as $partyKey => $amount) {
        $name = $ledgerInfo[$partyKey]["party"] ?? $openingNames[$partyKey];
        $openingBalances[$name] = $amount;
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
                d.Amount,
                d.Narration,
                d.JasSalesLedName,
                d.EveEveCGSTTaxAmt,
                d.EveEveSGSTTaxAmt,
                d.EveEveiGSTTaxAmt,
                d.EveEveRoundOffAmt
            FROM salesdata d
            JOIN (
                SELECT DISTINCT `Sales ID` AS sid
                FROM salesdata
                WHERE
                    (LOWER(TRIM(COALESCE(ADCLedgerName, ''))) LIKE 'kseb%'
                     OR LOWER(TRIM(COALESCE(PartyLedgerName, ''))) LIKE 'kseb%')
                    AND `Date` <= :as_of
                    AND TRIM(COALESCE(`Sales ID`, '')) <> ''
            ) k ON k.sid = d.`Sales ID`
            ORDER BY d.`Sl No` ASC
        ");

        $detailStmt->execute([
            ":as_of" => $asOf
        ]);

        $rowsById = [];

        while ($row = $detailStmt->fetch()) {
            $salesId = cleanValue($row["sales_id"]);

            if (isset($usedIds[$salesId])) {
                $rowsById[$salesId][] = $row;
            }
        }

        $detailStmt->closeCursor();

        foreach ($rowsById as $salesId => $rows) {
            $vouchers[(string)$salesId] = voucherDetails((string)$salesId, $rows);
        }

    } catch (Throwable $e) {
        error_log("KSEB OUTSTANDING VOUCHER DETAILS ERROR: " . $e->getMessage());
        $warnings[] = "Voucher details could not be read.";
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
            "count" => count($bills),
            "receipt_rows" => $receiptRows,
            "summary" => $summary,
            "buckets" => $buckets,
            "bills" => $bills,
            "on_account" => $onAccountRows,
            "older_receipts" => $olderReceipts,
            "receipts" => $receipts,
            "opening_balances" => (object)$openingBalances,
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
