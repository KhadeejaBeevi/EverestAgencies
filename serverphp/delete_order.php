<?php
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");

$conn = db_connect("tally_db");

$id = $_GET['id'];

$conn->query("DELETE FROM sales_orders WHERE id=$id");

echo "deleted";
?>