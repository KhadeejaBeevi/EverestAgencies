<?php
require_once __DIR__ . '/api_auth.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "salescollection");
if ($conn->connect_error) {
    die(json_encode([]));
}

/*
 We’ll fetch hidden parties from newpartyledgerdetails
 and also include the latest note (if any) from the notes table.
*/

$sql = "
SELECT 
    npld.party_ledger_name,
    npld.id,
    COALESCE(
        (
            SELECT note 
            FROM notes 
            WHERE notes.partyLedger = npld.party_ledger_name 
            ORDER BY id DESC 
            LIMIT 1
        ), 
        '— No Notes —'
    ) AS latest_note
FROM newpartyledgerdetails AS npld
WHERE npld.is_hidden = 1
ORDER BY npld.id DESC
";

$result = $conn->query($sql);

$rows = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
}

echo json_encode($rows);
$conn->close();
?>
