<?php

require_once __DIR__ . '/api_auth.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, x-api-key");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}


/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

$host = "localhost";
$username = "root";
$password = "";
$database = "salescollection";

$conn = new mysqli(
    $host,
    $username,
    $password,
    $database
);

if ($conn->connect_error) {

    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed: " . $conn->connect_error
    ]);

    exit;
}

$conn->set_charset("utf8mb4");


/*
|--------------------------------------------------------------------------
| FINANCIAL YEAR
|--------------------------------------------------------------------------
|
| financial_year=2026
|
| Means:
|
| 01-Apr-2026
|       to
| 31-Mar-2027
|
|--------------------------------------------------------------------------
*/

$financialYear = isset($_GET["financial_year"])
    ? intval($_GET["financial_year"])
    : intval(date("Y"));

if ($financialYear < 2000 || $financialYear > 2100) {
    $financialYear = intval(date("Y"));
}

$startDate = $financialYear . "-04-01";

$endDate = ($financialYear + 1) . "-03-31";


/*
|--------------------------------------------------------------------------
| MONTHS
|--------------------------------------------------------------------------
*/

$months = [
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
    "Jan",
    "Feb",
    "Mar"
];


/*
|--------------------------------------------------------------------------
| STEP 1
|--------------------------------------------------------------------------
| Find TOP 10 selling items based on QUANTITY.
|
| Sales Orders are EXCLUDED.
|--------------------------------------------------------------------------
*/

$topSql = "

    SELECT

        StockItemName AS item,

        SUM(
            COALESCE(Amount, 0)
        ) AS total_value,

        SUM(
            COALESCE(BilledQty, 0)
        ) AS total_qty

    FROM salesdata

    WHERE

        Date >= ?
        AND Date <= ?

        AND StockItemName IS NOT NULL
        AND TRIM(StockItemName) <> ''

        AND (
            VoucherTypeName IS NULL
            OR TRIM(VoucherTypeName) <> 'Sales Order'
        )

    GROUP BY

        StockItemName

    ORDER BY

        total_qty DESC

    LIMIT 10

";


$topStmt = $conn->prepare($topSql);

if (!$topStmt) {

    echo json_encode([
        "status" => "error",
        "message" =>
            "Top items query preparation failed: " .
            $conn->error
    ]);

    $conn->close();

    exit;
}


$topStmt->bind_param(
    "ss",
    $startDate,
    $endDate
);


if (!$topStmt->execute()) {

    echo json_encode([
        "status" => "error",
        "message" =>
            "Top items query execution failed: " .
            $topStmt->error
    ]);

    $topStmt->close();
    $conn->close();

    exit;
}


$topResult = $topStmt->get_result();

$topItems = [];


while ($row = $topResult->fetch_assoc()) {

    $topItems[] = [

        "item" =>
            $row["item"],

        "total_value" =>
            round(
                floatval(
                    $row["total_value"]
                ),
                2
            ),

        "total_qty" =>
            round(
                floatval(
                    $row["total_qty"]
                ),
                2
            )

    ];

}


$topStmt->close();


/*
|--------------------------------------------------------------------------
| NO DATA
|--------------------------------------------------------------------------
*/

if (count($topItems) === 0) {

    echo json_encode([

        "status" =>
            "success",

        "financial_year" =>
            $financialYear,

        "start_date" =>
            $startDate,

        "end_date" =>
            $endDate,

        "data" => []

    ]);

    $conn->close();

    exit;
}


/*
|--------------------------------------------------------------------------
| STEP 2
|--------------------------------------------------------------------------
| Create monthly data for each top item.
|
| Sales Orders are EXCLUDED here also.
|
|--------------------------------------------------------------------------
*/

$monthlySql = "

    SELECT

        StockItemName AS item,

        MONTH(Date) AS month_number,

        SUM(
            COALESCE(BilledQty, 0)
        ) AS qty,

        SUM(
            COALESCE(Amount, 0)
        ) AS value,

        CASE

            WHEN SUM(
                COALESCE(BilledQty, 0)
            ) = 0

            THEN 0

            ELSE

                SUM(
                    COALESCE(Amount, 0)
                )
                /
                SUM(
                    COALESCE(BilledQty, 0)
                )

        END AS rate

    FROM salesdata

    WHERE

        Date >= ?
        AND Date <= ?

        AND StockItemName IS NOT NULL
        AND TRIM(StockItemName) <> ''

        AND (
            VoucherTypeName IS NULL
            OR TRIM(VoucherTypeName) <> 'Sales Order'
        )

    GROUP BY

        StockItemName,
        MONTH(Date)

";


$monthlyStmt =
    $conn->prepare($monthlySql);


if (!$monthlyStmt) {

    echo json_encode([

        "status" => "error",

        "message" =>
            "Monthly query preparation failed: " .
            $conn->error

    ]);

    $conn->close();

    exit;
}


$monthlyStmt->bind_param(
    "ss",
    $startDate,
    $endDate
);


if (!$monthlyStmt->execute()) {

    echo json_encode([

        "status" => "error",

        "message" =>
            "Monthly query execution failed: " .
            $monthlyStmt->error

    ]);

    $monthlyStmt->close();
    $conn->close();

    exit;
}


$monthlyResult =
    $monthlyStmt->get_result();


$monthlyData = [];


while (
    $row =
    $monthlyResult->fetch_assoc()
) {

    $item =
        $row["item"];

    $monthNumber =
        intval(
            $row["month_number"]
        );


    /*
    |--------------------------------------------------------------------------
    | Convert calendar month to financial month
    |--------------------------------------------------------------------------
    |
    | Apr = 4
    | May = 5
    | ...
    | Dec = 12
    | Jan = 1
    | Feb = 2
    | Mar = 3
    |
    |--------------------------------------------------------------------------
    */

    $monthMap = [

        4 => "Apr",
        5 => "May",
        6 => "Jun",
        7 => "Jul",
        8 => "Aug",
        9 => "Sep",
        10 => "Oct",
        11 => "Nov",
        12 => "Dec",
        1 => "Jan",
        2 => "Feb",
        3 => "Mar"

    ];


    if (
        !isset(
            $monthMap[$monthNumber]
        )
    ) {

        continue;

    }


    $month =
        $monthMap[$monthNumber];


    if (
        !isset(
            $monthlyData[$item]
        )
    ) {

        $monthlyData[$item] = [];

    }


    $monthlyData[$item][$month] = [

        "qty" =>
            round(
                floatval(
                    $row["qty"]
                ),
                2
            ),

        "rate" =>
            round(
                floatval(
                    $row["rate"]
                ),
                2
            ),

        "value" =>
            round(
                floatval(
                    $row["value"]
                ),
                2
            )

    ];

}


$monthlyStmt->close();


/*
|--------------------------------------------------------------------------
| STEP 3
|--------------------------------------------------------------------------
| Prepare final response.
|--------------------------------------------------------------------------
*/

$responseData = [];


foreach (
    $topItems
    as $topItem
) {

    $itemName =
        $topItem["item"];


    /*
    |--------------------------------------------------------------------------
    | Create all 12 months.
    |--------------------------------------------------------------------------
    */

    $monthObject = [];


    foreach (
        $months
        as $month
    ) {

        $monthObject[$month] = [

            "qty" => 0,

            "rate" => 0,

            "value" => 0

        ];

    }


    /*
    |--------------------------------------------------------------------------
    | Insert actual monthly data.
    |--------------------------------------------------------------------------
    */

    if (
        isset(
            $monthlyData[$itemName]
        )
    ) {

        foreach (
            $monthlyData[$itemName]
            as $month => $values
        ) {

            $monthObject[$month] =
                $values;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Calculate weighted average rate.
    |--------------------------------------------------------------------------
    */

    $totalQty =
        floatval(
            $topItem["total_qty"]
        );


    $totalValue =
        floatval(
            $topItem["total_value"]
        );


    $averageRate =
        $totalQty > 0
            ? $totalValue / $totalQty
            : 0;


    $responseData[] = [

        "item" =>
            $itemName,

        "total_qty" =>
            round(
                $totalQty,
                2
            ),

        "total_value" =>
            round(
                $totalValue,
                2
            ),

        "average_rate" =>
            round(
                $averageRate,
                2
            ),

        "months" =>
            $monthObject

    ];

}


$conn->close();


/*
|--------------------------------------------------------------------------
| FINAL RESPONSE
|--------------------------------------------------------------------------
*/

echo json_encode([

    "status" =>
        "success",

    "financial_year" =>
        $financialYear,

    "start_date" =>
        $startDate,

    "end_date" =>
        $endDate,

    "data" =>
        $responseData

], JSON_UNESCAPED_UNICODE);

?>