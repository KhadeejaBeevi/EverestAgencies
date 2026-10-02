<?php

ini_set('max_execution_time', 600);
ini_set('memory_limit', '1024M');

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");



$conn = new mysqli(
    "localhost",
    "root",
    "",
    "salescollection"
);




if ($conn->connect_error) {

    die(json_encode([
        "status" => "error",
        "message" => $conn->connect_error
    ]));

}



$tallyUrl = "http://117.221.70.147:14151";



$xmlRequest = '
<ENVELOPE>

<HEADER>
<TALLYREQUEST>Export Data</TALLYREQUEST>
</HEADER>

<BODY>

<EXPORTDATA>

<REQUESTDESC>

<REPORTNAME>CFBKRR Rep</REPORTNAME>

<STATICVARIABLES>

<SVEXPORTFORMAT>$SysName:XML</SVEXPORTFORMAT>

</STATICVARIABLES>

</REQUESTDESC>

</EXPORTDATA>

</BODY>

</ENVELOPE>';


/*-----------------------------
 SEND REQUEST TO TALLY
-----------------------------*/


$ch = curl_init($tallyUrl);


curl_setopt_array($ch, [

    CURLOPT_RETURNTRANSFER => true,

    CURLOPT_POST => true,

    CURLOPT_POSTFIELDS => $xmlRequest,

    CURLOPT_HTTPHEADER => [
        "Content-Type: text/xml",
        "Expect:"
    ],

    CURLOPT_CONNECTTIMEOUT => 30,

    CURLOPT_TIMEOUT => 600,

    CURLOPT_TCP_KEEPALIVE => 1

]);



$response = curl_exec($ch);
// Remove illegal XML numeric entities
$response = preg_replace('/&#(?:0?[0-8]|1[0-9]|2[0-9]|3[0-1]);/', '', $response);
$response = preg_replace('/&#x(?:0?[0-8A-F]|1[0-9A-F]);/i', '', $response);

// Remove raw control characters
$response = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $response);

// Replace NBSP (0xA0) with normal space
$response = str_replace(chr(160), ' ', $response);

// Remove any invalid UTF-8 sequences
$response = iconv('UTF-8', 'UTF-8//IGNORE', $response);

if (strpos($response, '&#4;') !== false) {
    die("Still contains &#4;");
}





$httpCode = curl_getinfo(
    $ch,
    CURLINFO_HTTP_CODE
);


$errorNo = curl_errno($ch);

$errorMsg = curl_error($ch);



curl_close($ch);



if ($errorNo) {

    die(json_encode([

        "status" => "error",

        "http_code" => $httpCode,

        "curl_errno" => $errorNo,

        "curl_error" => $errorMsg

    ]));

}



if (empty($response)) {

    die(json_encode([

        "status" => "error",

        "message" => "Empty response from Tally"

    ]));

}



/* Save XML */

file_put_contents(
    "response.xml",
    $response
);



/*-----------------------------
 LOAD XML
-----------------------------*/


libxml_use_internal_errors(true);

$xml = simplexml_load_string(
    $response,
    "SimpleXMLElement",
    LIBXML_PARSEHUGE | LIBXML_NOCDATA
);

if (!$xml) {

    foreach (libxml_get_errors() as $e) {

        echo "Line : " . $e->line . "<br>";
        echo "Column : " . $e->column . "<br>";
        echo "Message : " . $e->message . "<br><br>";

        $lines = file("response.xml");

        $start = max(0, $e->line - 3);
        $end = min(count($lines), $e->line + 2);

        for ($i = $start; $i < $end; $i++) {
            echo ($i + 1) . " : " . htmlspecialchars($lines[$i]) . "<br>";
        }

        exit;
    }
}





if (!$xml) {

    die(json_encode([

        "status" => "error",

        "message" => "Invalid XML",

        "preview" => substr($response, 0, 1000)

    ]));

}




$entries = $xml->xpath("//ITEMNAME/..");



if (!$entries || count($entries) == 0) {

    die(json_encode([

        "status" => "error",

        "message" => "No items found in Tally XML"

    ]));

}



$inserted = 0;

$conn->query("TRUNCATE TABLE products_table");

$lines = file("response.xml");

$current = null;
$inserted = 0;

$stmt = $conn->prepare("
INSERT INTO products_table
(
name,parent,category,
GD1ITEMOPBAL,GD1ITEMCLBAL,
GD2ITEMOPBAL,GD2ITEMCLBAL,
GD3ITEMOPBAL,GD3ITEMCLBAL,
GD4ITEMOPBAL,GD4ITEMCLBAL,
GD5ITEMOPBAL,GD5ITEMCLBAL,
GD6ITEMOPBAL,GD6ITEMCLBAL,
GD7ITEMOPBAL,GD7ITEMCLBAL
)
VALUES
(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
");

foreach($lines as $line){

    if(preg_match('/<ITEMNAME>(.*?)<\/ITEMNAME>/', $line, $m)){

        if($current){

            $stmt->bind_param(
                "sssdddddddddddddd",
                $current['name'],
                $current['parent'],
                $current['category'],
                $current['gd1op'],
                $current['gd1cl'],
                $current['gd2op'],
                $current['gd2cl'],
                $current['gd3op'],
                $current['gd3cl'],
                $current['gd4op'],
                $current['gd4cl'],
                $current['gd5op'],
                $current['gd5cl'],
                $current['gd6op'],
                $current['gd6cl'],
                $current['gd7op'],
                $current['gd7cl']
            );

            if($stmt->execute()) $inserted++;
        }

        $current=[
            'name'=>$m[1],
            'parent'=>'',
            'category'=>'',
            'gd1op'=>0,'gd1cl'=>0,
            'gd2op'=>0,'gd2cl'=>0,
            'gd3op'=>0,'gd3cl'=>0,
            'gd4op'=>0,'gd4cl'=>0,
            'gd5op'=>0,'gd5cl'=>0,
            'gd6op'=>0,'gd6cl'=>0,
            'gd7op'=>0,'gd7cl'=>0
        ];

        continue;
    }

    if(!$current) continue;

    if(preg_match('/<ITEMPARENT>(.*?)<\/ITEMPARENT>/', $line,$m))
        $current['parent']=$m[1];

    if(preg_match('/<ITEMCATEGORY>(.*?)<\/ITEMCATEGORY>/', $line,$m))
        $current['category']=$m[1];

    if(preg_match('/<GD1ITEMOPBAL>(.*?)<\/GD1ITEMOPBAL>/', $line,$m))
        $current['gd1op']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD1ITEMCLBAL>(.*?)<\/GD1ITEMCLBAL>/', $line,$m))
        $current['gd1cl']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD2ITEMOPBAL>(.*?)<\/GD2ITEMOPBAL>/', $line,$m))
        $current['gd2op']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD2ITEMCLBAL>(.*?)<\/GD2ITEMCLBAL>/', $line,$m))
        $current['gd2cl']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD3ITEMOPBAL>(.*?)<\/GD3ITEMOPBAL>/', $line,$m))
        $current['gd3op']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD3ITEMCLBAL>(.*?)<\/GD3ITEMCLBAL>/', $line,$m))
        $current['gd3cl']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD4ITEMOPBAL>(.*?)<\/GD4ITEMOPBAL>/', $line,$m))
        $current['gd4op']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD4ITEMCLBAL>(.*?)<\/GD4ITEMCLBAL>/', $line,$m))
        $current['gd4cl']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD5ITEMOPBAL>(.*?)<\/GD5ITEMOPBAL>/', $line,$m))
        $current['gd5op']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD5ITEMCLBAL>(.*?)<\/GD5ITEMCLBAL>/', $line,$m))
        $current['gd5cl']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD6ITEMOPBAL>(.*?)<\/GD6ITEMOPBAL>/', $line,$m))
        $current['gd6op']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD6ITEMCLBAL>(.*?)<\/GD6ITEMCLBAL>/', $line,$m))
        $current['gd6cl']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD7ITEMOPBAL>(.*?)<\/GD7ITEMOPBAL>/', $line,$m))
        $current['gd7op']=(float)str_replace(",","",$m[1]);

    if(preg_match('/<GD7ITEMCLBAL>(.*?)<\/GD7ITEMCLBAL>/', $line,$m))
        $current['gd7cl']=(float)str_replace(",","",$m[1]);
}

if($current){

 $stmt->bind_param(
    "sssdddddddddddddd",
    $current['name'],
    $current['parent'],
    $current['category'],
    $current['gd1op'],
    $current['gd1cl'],
    $current['gd2op'],
    $current['gd2cl'],
    $current['gd3op'],
    $current['gd3cl'],
    $current['gd4op'],
    $current['gd4cl'],
    $current['gd5op'],
    $current['gd5cl'],
    $current['gd6op'],
    $current['gd6cl'],
    $current['gd7op'],
    $current['gd7cl']
);
    if($stmt->execute()) $inserted++;
}

$stmt->close();





/*-----------------------------
 FETCH INSERTED DATA
-----------------------------*/


$result = $conn->query("

SELECT

id,
name,
parent,
category,

GD1ITEMOPBAL,
GD1ITEMCLBAL,

GD2ITEMOPBAL,
GD2ITEMCLBAL,

GD3ITEMOPBAL,
GD3ITEMCLBAL,

GD4ITEMOPBAL,
GD4ITEMCLBAL,

GD5ITEMOPBAL,
GD5ITEMCLBAL,

GD6ITEMOPBAL,
GD6ITEMCLBAL,

GD7ITEMOPBAL,
GD7ITEMCLBAL

FROM products_table

ORDER BY name

");



$data = [];



if ($result) {


    while ($row = $result->fetch_assoc()) {


        $data[] = [

            "id" => $row["id"],

            "name" => $row["name"],

            "parent" => $row["parent"],

            "category" => $row["category"],


            "GD1ITEMOPBAL" => (float) $row["GD1ITEMOPBAL"],

            "GD1ITEMCLBAL" => (float) $row["GD1ITEMCLBAL"],


            "GD2ITEMOPBAL" => (float) $row["GD2ITEMOPBAL"],

            "GD2ITEMCLBAL" => (float) $row["GD2ITEMCLBAL"],


            "GD3ITEMOPBAL" => (float) $row["GD3ITEMOPBAL"],

            "GD3ITEMCLBAL" => (float) $row["GD3ITEMCLBAL"],


            "GD4ITEMOPBAL" => (float) $row["GD4ITEMOPBAL"],

            "GD4ITEMCLBAL" => (float) $row["GD4ITEMCLBAL"],


            "GD5ITEMOPBAL" => (float) $row["GD5ITEMOPBAL"],

            "GD5ITEMCLBAL" => (float) $row["GD5ITEMCLBAL"],


            "GD6ITEMOPBAL" => (float) $row["GD6ITEMOPBAL"],

            "GD6ITEMCLBAL" => (float) $row["GD6ITEMCLBAL"],


            "GD7ITEMOPBAL" => (float) $row["GD7ITEMOPBAL"],

            "GD7ITEMCLBAL" => (float) $row["GD7ITEMCLBAL"]

        ];


    }

}



/*-----------------------------
 FINAL RESPONSE
-----------------------------*/


echo json_encode([

    "status" => "success",

    "message" => "Stock balance imported successfully",

    "inserted" => $inserted,

    "count" => count($data),

    "data" => $data

]);



$conn->close();


exit;

?>