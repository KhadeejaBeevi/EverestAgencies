<?php
 require 'vendor/autoload.php';
 require_once __DIR__ . '/api_auth.php';
        use PhpOffice\PhpSpreadsheet\IOFactory;
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

$host = "localhost";
$user = "root";      // change if needed
$pass = "";          // change if needed
$db   = "salescollection"; // your DB

$conn = new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    die(json_encode(["error" => "Database connection failed: " . $conn->connect_error]));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['partyFile'])) {
    $fileTmp  = $_FILES['partyFile']['tmp_name'];
    $fileName = $_FILES['partyFile']['name'];
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

    $partyNames = [];

    // Handle TXT file
    if ($ext === "txt") {
        $lines = file($fileTmp, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $partyNames[] = trim($line);
        }
    }

    // Handle XLSX (using PhpSpreadsheet)
    elseif ($ext === "xlsx") {
       

        $spreadsheet = IOFactory::load($fileTmp);
        $sheet = $spreadsheet->getActiveSheet();
        foreach ($sheet->getRowIterator() as $row) {
            $cell = $sheet->getCell('A' . $row->getRowIndex())->getValue(); // assume first column
            if ($cell) $partyNames[] = trim($cell);
        }
    } else {
        echo json_encode(["error" => "Unsupported file type"]);
        exit;
    }

    $insertedCount = 0;
    $matchedCount = 0;

    foreach ($partyNames as $name) {
        if ($name === "") continue;

        // Insert into localshoplist
        $stmt = $conn->prepare("INSERT IGNORE INTO localshoplist (shop_name) VALUES (?)");
        $stmt->bind_param("s", $name);
        if ($stmt->execute()) {
            $insertedCount++;
        }
        $stmt->close();

        // Check match in PartyLedgerDetails
        $check = $conn->prepare("SELECT id FROM PartyLedgerDetails WHERE PartyLedgerName = ?");
        $check->bind_param("s", $name);
        $check->execute();
        $result = $check->get_result();
        if ($result->num_rows > 0) {
            // Move to do_not_call_list
            $ins = $conn->prepare("INSERT IGNORE INTO do_not_call_list (party_name) VALUES (?)");
            $ins->bind_param("s", $name);
            $ins->execute();
            $ins->close();

            // Delete from PartyLedgerDetails
            $del = $conn->prepare("DELETE FROM PartyLedgerDetails WHERE PartyLedgerName = ?");
            $del->bind_param("s", $name);
            $del->execute();
            $del->close();

            $matchedCount++;
        }
        $check->close();
    }

    echo json_encode([
        "inserted_count" => $insertedCount,
        "matched_count" => $matchedCount,
        "total_names"   => count($partyNames)
    ]);
} else {
    echo json_encode(["error" => "No file uploaded"]);
}
