<?php
/*
|--------------------------------------------------------------------------
| SALESDATA ROW TYPES (shared by every page that reads salesdata)
|--------------------------------------------------------------------------
|
| salesdata holds one row per Tally ledger entry of a voucher, plus one
| row per stock item line. ADCLedgerName is the ledger of the row:
|
|   Item row     BilledQty / Rate filled. These are the only rows that
|                are items (item name, qty, rate, GST, HSN ...).
|   Party row    ADCLedgerName = PartyLedgerName. Amount is the voucher
|                total (negative for sales). May appear twice (bill
|                allocation + ledger entry), so it is taken once.
|   Sales row    No quantity, StockItemName filled (e.g. GST State Sales).
|                Amount is the taxable value of the whole voucher.
|   Other rows   CGST, SGST, IGST, Round Off, Handling Charges, Penalty
|                Charges, Freight ... Any ledger Tally adds shows up here
|                by its own name, so no salesdata column is needed for it.
|
| The old voucher tax columns (EveEveCGSTTaxAmt, EveEveSGSTTaxAmt,
| EveEveiGSTTaxAmt, EveEveRoundOffAmt, EveEveHandChrgsAmt) are not used.
|
*/

/*
| SQL condition: the row is an item line (has a quantity or a rate).
| $alias is the table alias, e.g. "s" -> s.BilledQty.
*/
function salesItemRowSql($alias = "")
{
    $p = $alias !== "" ? $alias . "." : "";

    return "(COALESCE({$p}BilledQty, 0) <> 0 OR COALESCE({$p}Rate, 0) <> 0)";
}

/* SQL condition: the row is a ledger entry (not an item line). */
function salesLedgerRowSql($alias = "")
{
    return "NOT " . salesItemRowSql($alias);
}

/* PHP version of salesItemRowSql() for an already fetched row. */
function salesIsItemRow(array $row)
{
    return (float)($row["BilledQty"] ?? 0) != 0
        || (float)($row["Rate"] ?? 0) != 0;
}

/*
| Item rate. Tally's Rate when exported, otherwise worked back from
| Amount = Qty x Rate x (1 - Discount%).
*/
function salesItemRate(array $row)
{
    $rate = (float)($row["Rate"] ?? 0);

    if ($rate != 0) {
        return $rate;
    }

    $quantity = (float)($row["BilledQty"] ?? 0);
    $amount = (float)($row["Amount"] ?? 0);
    $discount = (float)($row["Discount"] ?? 0);

    if ($quantity == 0 || $amount == 0 || $discount >= 100) {
        return 0.0;
    }

    return round($amount / ($quantity * (1 - $discount / 100)), 2);
}

function salesLedgerKey($value)
{
    return strtolower(
        preg_replace('/\s+/', ' ', trim((string)$value))
    );
}

/*
| Does salesdata have the ADCLedgerName column? Pages select
| "NULL AS ADCLedgerName" when it is missing so they keep working
| (every non-item row is then treated as unknown and ignored).
*/
function salesHasLedgerColumn(mysqli $conn)
{
    static $cache = [];

    $key = spl_object_hash($conn);

    if (!isset($cache[$key])) {
        $result = $conn->query("SHOW COLUMNS FROM `salesdata` LIKE 'ADCLedgerName'");
        $cache[$key] = $result && $result->num_rows > 0;

        if ($result) {
            $result->free();
        }
    }

    return $cache[$key];
}

/* Select expression for ADCLedgerName ($alias as in salesItemRowSql). */
function salesLedgerSelect(mysqli $conn, $alias = "")
{
    $p = $alias !== "" ? $alias . "." : "";

    return salesHasLedgerColumn($conn)
        ? "{$p}ADCLedgerName"
        : "NULL AS ADCLedgerName";
}

/*
|--------------------------------------------------------------------------
| VOUCHER TOTALS
|--------------------------------------------------------------------------
|
| $totals = salesNewVoucherTotals();
| foreach (rows of one voucher) salesAddVoucherRow($totals, $row);
| $summary = salesVoucherSummary($totals);
|
| Rows need: Amount, BilledQty, Rate, StockItemName, PartyLedgerName,
| ADCLedgerName (EveItemTaxAmt / EveItemGstRate for the item GST fallback).
|
*/
function salesNewVoucherTotals()
{
    return [
        "item_amount" => 0.0,
        "item_gst" => 0.0,
        "item_count" => 0,
        "item_ledgers" => [],
        "party_amount" => null,
        "ledgers" => []
    ];
}

function salesAddVoucherRow(array &$totals, array $row)
{
    $amount = (float)($row["Amount"] ?? 0);
    $ledgerName = trim((string)($row["ADCLedgerName"] ?? ""));
    $ledgerKey = salesLedgerKey($ledgerName);

    if (salesIsItemRow($row)) {
        $gstAmount = (float)($row["EveItemTaxAmt"] ?? 0);
        $gstRate = (float)($row["EveItemGstRate"] ?? 0);

        if ($gstAmount == 0 && $gstRate != 0) {
            $gstAmount = $amount * $gstRate / 100;
        }

        $totals["item_amount"] += $amount;
        $totals["item_gst"] += $gstAmount;
        $totals["item_count"]++;

        if ($ledgerKey !== "") {
            $totals["item_ledgers"][$ledgerKey] = true;
        }

        return;
    }

    if ($ledgerKey === "") {
        return;
    }

    if ($ledgerKey === salesLedgerKey($row["PartyLedgerName"] ?? "")) {
        // Same total on both party rows: keep it once.
        if (
            $totals["party_amount"] === null
            || abs($amount) > abs($totals["party_amount"])
        ) {
            $totals["party_amount"] = $amount;
        }

        return;
    }

    if (!isset($totals["ledgers"][$ledgerKey])) {
        $totals["ledgers"][$ledgerKey] = [
            "name" => $ledgerName,
            "amount" => 0.0,
            "is_sales" => false
        ];
    }

    $totals["ledgers"][$ledgerKey]["amount"] += $amount;

    // The sales ledger row carries a stock item name.
    if (trim((string)($row["StockItemName"] ?? "")) !== "") {
        $totals["ledgers"][$ledgerKey]["is_sales"] = true;
    }
}

/*
| Returns:
|   taxable           sales ledger amount (item total when no ledger rows)
|   ledgers           [["name" => "CGST", "amount" => 12.5], ...] every
|                     ledger other than party and sales, in voucher order
|   cgst, sgst, igst, round_off, handling_charges   from those ledgers
|   gst               cgst + sgst + igst (item GST when no tax ledgers)
|   total             taxable + ledgers (party ledger when no sales row)
|   has_ledgers       true when the voucher has ledger rows
*/
function salesVoucherSummary(array $totals)
{
    $salesAmount = null;
    $ledgers = [];
    $named = [
        "cgst" => 0.0,
        "sgst" => 0.0,
        "igst" => 0.0,
        "round_off" => 0.0,
        "handling_charges" => 0.0
    ];
    $hasTaxLedger = false;

    foreach ($totals["ledgers"] as $key => $ledger) {
        if ($ledger["is_sales"] || isset($totals["item_ledgers"][$key])) {
            $salesAmount = ($salesAmount ?? 0) + $ledger["amount"];
            continue;
        }

        $amount = round($ledger["amount"], 2);
        $ledgers[] = ["name" => $ledger["name"], "amount" => $amount];

        if (preg_match('/\bcgst\b/i', $ledger["name"])) {
            $named["cgst"] += $amount;
            $hasTaxLedger = true;
        } elseif (preg_match('/\bsgst\b|\butgst\b/i', $ledger["name"])) {
            $named["sgst"] += $amount;
            $hasTaxLedger = true;
        } elseif (preg_match('/\bigst\b/i', $ledger["name"])) {
            $named["igst"] += $amount;
            $hasTaxLedger = true;
        } elseif (preg_match('/round\s*off/i', $ledger["name"])) {
            $named["round_off"] += $amount;
        } elseif (preg_match('/handling/i', $ledger["name"])) {
            $named["handling_charges"] += $amount;
        }
    }

    $taxable = $salesAmount !== null ? $salesAmount : $totals["item_amount"];
    $ledgerTotal = array_sum(array_column($ledgers, "amount"));
    $gst = $hasTaxLedger
        ? $named["cgst"] + $named["sgst"] + $named["igst"]
        : $totals["item_gst"];

    // Sales ledger + other ledgers is Tally's voucher total. The party
    // ledger is only used without a sales ledger row: it can be split
    // over several bill allocations.
    if ($salesAmount !== null) {
        $total = $taxable + $ledgerTotal;
    } elseif ($totals["party_amount"] !== null) {
        $total = -$totals["party_amount"];
    } elseif (!empty($ledgers)) {
        $total = $taxable + $ledgerTotal;
    } else {
        $total = $taxable + $gst;
    }

    return [
        "taxable" => round($taxable, 2),
        "ledgers" => $ledgers,
        "cgst" => round($named["cgst"], 2),
        "sgst" => round($named["sgst"], 2),
        "igst" => round($named["igst"], 2),
        "round_off" => round($named["round_off"], 2),
        "handling_charges" => round($named["handling_charges"], 2),
        "gst" => round($gst, 2),
        "total" => round($total, 2),
        "has_ledgers" => !empty($totals["ledgers"]) || $totals["party_amount"] !== null
    ];
}

/*
|--------------------------------------------------------------------------
| ONE ROW PER VOUCHER
|--------------------------------------------------------------------------
|
| For pages that only need voucher level values. Rows are grouped by
| VoucherTypeName + VoucherNumber; each group becomes its first row
| (blank values filled from later rows) with:
|   Amount    = $amountField of salesVoucherSummary() ("taxable" or "total")
|   _summary  = the full salesVoucherSummary()
| Rows without a voucher number are returned unchanged.
|
*/
function salesCollapseVouchers(array $rows, $amountField = "taxable")
{
    $vouchers = [];
    $order = [];

    foreach ($rows as $index => $row) {
        $voucherNumber = trim((string)($row["VoucherNumber"] ?? ""));

        if ($voucherNumber === "") {
            $order[] = ["row" => $row];
            continue;
        }

        $key = strtolower(trim((string)($row["VoucherTypeName"] ?? ""))) . "||" . $voucherNumber;

        if (!isset($vouchers[$key])) {
            $vouchers[$key] = [
                "row" => $row,
                "totals" => salesNewVoucherTotals()
            ];
            $order[] = ["key" => $key];
        } else {
            foreach ($row as $field => $value) {
                if (
                    trim((string)($vouchers[$key]["row"][$field] ?? "")) === ""
                    && trim((string)$value) !== ""
                ) {
                    $vouchers[$key]["row"][$field] = $value;
                }
            }
        }

        salesAddVoucherRow($vouchers[$key]["totals"], $row);
    }

    $result = [];

    foreach ($order as $entry) {
        if (!isset($entry["key"])) {
            $result[] = $entry["row"];
            continue;
        }

        $voucher = $vouchers[$entry["key"]];
        $summary = salesVoucherSummary($voucher["totals"]);
        $row = $voucher["row"];
        $row["Amount"] = $summary[$amountField];
        $row["_summary"] = $summary;
        $result[] = $row;
    }

    return $result;
}
