<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$servername = "localhost"; 
$username = "root";
$password = "";
$dbname = "salescollection";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

// ✅ Helper: format Indian number only when needed
function formatIndianNumber($num) {
    if ($num === null || $num === '') return $num;
    $num = number_format((float)$num, 2, '.', ''); // always keep 2 decimals
    $parts = explode('.', $num);
    $int = $parts[0];
    $dec = $parts[1] ?? '00';

    $last3 = substr($int, -3);
    $rest = substr($int, 0, -3);
    if ($rest != '') {
        $last3 = ',' . $last3;
    }
    $rest = preg_replace("/\B(?=(\d{2})+(?!\d))/", ",", $rest);

    return $rest . $last3 . '.' . $dec;
}

// ✅ Safe rounding function that handles null values
function safeRound($value, $precision = 2) {
    if ($value === null || $value === '') {
        return 0.00;
    }
    return round((float)$value, $precision);
}

$sql = "SELECT 
            StockItemName,
            Parent,
            Category,
            _EveProdBrand,
            _EveSIMstID,
            EveCostPrice, 
            EveSellPrice,
            OpeningBalance, 
            OpeningRate, 
            OpeningValue,
            Apr_BilledQty, 
            Apr_Amount,
            Apr_Rate,
            May_BilledQty, 
            May_Amount,
            May_Rate,
            Jun_BilledQty, 
            Jun_Amount,
            Jun_Rate,
            Jul_BilledQty, 
            Jul_Amount,
            Jul_Rate,
            Aug_BilledQty, 
            Aug_Amount,
            Aug_Rate,
            Sep_BilledQty, 
            Sep_Amount,
            Sep_Rate,
            Oct_BilledQty, 
            Oct_Amount,
            Oct_Rate,
            Nov_BilledQty, 
            Nov_Amount,
            Nov_Rate,
            TotalQty,
            TotalValue
        FROM newsales_summary_monthlyoct";

$result = $conn->query($sql);

$data = [];
if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        
        // Calculate monthly rates if not provided or needs recalculation
        $months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
        
        foreach ($months as $m) {
            $qty = safeRound($row["{$m}_BilledQty"] ?? 0);
            $amt = safeRound($row["{$m}_Amount"] ?? 0);
            $rate = safeRound($row["{$m}_Rate"] ?? 0);
            
            // If rate is 0 but we have quantity and amount, calculate rate
            if ($rate == 0 && $qty > 0) {
                $rate = safeRound($amt / $qty);
            }
            
            // Ensure proper formatting
            $row["{$m}_BilledQty"] = $qty;
            $row["{$m}_Amount"] = $amt;
            $row["{$m}_Rate"] = $rate;
        }
        
        // Handle TotalQty and TotalValue - use existing or calculate
        $existingTotalQty = safeRound($row["TotalQty"] ?? 0);
        $existingTotalValue = $row["TotalValue"] ?? 0;
        
        if ($existingTotalQty == 0) {
            // Calculate total quantity
            $calculatedTotalQty = 0;
            foreach ($months as $m) {
                $calculatedTotalQty += safeRound($row["{$m}_BilledQty"] ?? 0);
            }
            $row["TotalQty"] = $calculatedTotalQty;
        } else {
            $row["TotalQty"] = $existingTotalQty;
        }
        
        if ($existingTotalValue == 0 || $existingTotalValue == null) {
            // Calculate total value
            $calculatedTotalValue = 0;
            foreach ($months as $m) {
                $calculatedTotalValue += safeRound($row["{$m}_Amount"] ?? 0);
            }
            $row["TotalValue"] = formatIndianNumber($calculatedTotalValue);
        } else {
            $row["TotalValue"] = formatIndianNumber($existingTotalValue);
        }
        
        // ✅ Ensure numeric fields always come with proper formatting (using safeRound)
        $row["EveCostPrice"] = safeRound($row["EveCostPrice"] ?? 0);
        $row["EveSellPrice"] = safeRound($row["EveSellPrice"] ?? 0);
        $row["OpeningBalance"] = safeRound($row["OpeningBalance"] ?? 0);
        $row["OpeningRate"] = safeRound($row["OpeningRate"] ?? 0);
        $row["OpeningValue"] = safeRound($row["OpeningValue"] ?? 0);
        
        // Ensure _EveSIMstID is properly handled
        $row["_EveSIMstID"] = $row["_EveSIMstID"] ?? null;

        $data[] = $row;
    }
}

echo json_encode($data, JSON_PRETTY_PRINT);
$conn->close();
?>