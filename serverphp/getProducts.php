<?php
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin:*");
header("Content-Type:application/json");


$conn=db_connect("salescollection");


$result=$conn->query("
SELECT *
FROM products_table
ORDER BY name
");


$data=[];


while($row=$result->fetch_assoc()){

$data[]=$row;

}


echo json_encode($data);

$conn->close();

?>