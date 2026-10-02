<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin:*");
header("Content-Type:application/json");


$conn=new mysqli(
"localhost",
"root",
"",
"salescollection"
);


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