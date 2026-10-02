<?php
require_once __DIR__ . '/api_auth.php';
// Turn off all error reporting for production
error_reporting(0);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight request
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// Database configuration - UPDATE THESE WITH YOUR ACTUAL CREDENTIALS
$host = 'localhost';
$dbname = 'salescollection'; // Replace with your database name
$username = 'root';    // Replace with your database username
$password = '';     // REPLACE WITH YOUR DATABASE PASSWORD

// Function to send JSON error response
function sendError($message) {
    http_response_code(500);
    echo json_encode(["error" => $message]);
    exit;
}

try {
    // Create PDO connection
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

    // Get party ledger name from query parameter
    $partyLedgerName = isset($_GET['party_ledger_name']) ? $_GET['party_ledger_name'] : null;
    $PartyLedgerName = isset($_GET['PartyLedgerName']) ? $_GET['PartyLedgerName'] : null;

    // Determine which parameter to use
    $searchName = $partyLedgerName ?: $PartyLedgerName;

    if (!$searchName) {
        sendError("Party ledger name parameter is required");
    }

    // First, try to find in the newpartyledgerdetails table (party_ledger_name)
    $sql1 = "SELECT 
                id,
                party_ledger_name,
                group_name,
                gst_registration_type,
                gstin,
                mobile,
                address,
                email,
                ledger_phone,
                owner_name,
                owner_phone,
                payment_contact_person,
                payment_contact_phone,
                purchase_contact_person,
                purchase_contact_phone,
                field_executive,
                requirement_type,
                decision_maker,
                referred_by,
                note_updated,
                rating,
                designation,
                designator_name,
                scarchitect,
                is_hidden
            FROM newpartyledgerdetails 
            WHERE party_ledger_name = ? AND is_hidden = 0
            LIMIT 1";

    $stmt1 = $pdo->prepare($sql1);
    $stmt1->execute([$searchName]);
    $result1 = $stmt1->fetchAll(PDO::FETCH_ASSOC);

    if (count($result1) > 0) {
        echo json_encode($result1);
        exit;
    }

   
    $sql2 = "SELECT 
                PartyLedgerName,
                `Ledger.$Parent` as parent,
                `Ledger.$Address` as address,
                `Ledger.$RelationType` as relation_type,
                `Ledger.$LedgerContact` as ledger_contact,
                `Ledger.$LedgerMobile` as ledger_mobile,
                `Ledger.$LedgerPhone` as ledger_phone,
                `Ledger.$EMail` as email,
                `Ledger.$_Address1` as address1,
                `Ledger.$_Address2` as address2,
                `Ledger.$_Address3` as address3,
                `Ledger.$_Address4` as address4,
                `Ledger.$_Address5` as address5,
                `Ledger.$_PrimaryGroup` as primary_group,
                `Ledger.$_LedgerPhone` as ledger_phone_alt,
                `Ledger.$_LedgerFax` as ledger_fax,
                `Ledger.$_LedgerMobile` as ledger_mobile_alt,
                `Ledger.$_LedgerEMail` as ledger_email,
                `Ledger.$_Led_Main_ContactNo_Form` as main_contact_no,
                `Ledger.$_Led_OwnerName_Form` as owner_name,
                `Ledger.$_Led_OwnerPhone_Form` as owner_phone,
                `Ledger.$_Led_Payment_Contact_P_Form` as payment_contact_person,
                `Ledger.$_Led_Payment_Contact_PHone_Form` as payment_contact_phone,
                `Ledger.$_Led_Purchase_Contact_P_Form` as purchase_contact_person,
                `Ledger.$_Led_Purchase_Contact_PHone_Form` as purchase_contact_phone,
                `Ledger.$_LedGroup` as ledger_group,
                `Ledger.$_GSTRegistrationType` as gst_registration_type,
                `Ledger.$_PartyGSTIN` as party_gstin,
                fullyUpdated,
                designation,
                designator_name
            FROM salesdatalatest33 
            WHERE PartyLedgerName = ?
            LIMIT 1";

    $stmt2 = $pdo->prepare($sql2);
    $stmt2->execute([$searchName]);
    $result2 = $stmt2->fetchAll(PDO::FETCH_ASSOC);

    if (count($result2) > 0) {
        echo json_encode($result2);
        exit;
    }

    // If exact match fails, try partial match
    $sql3 = "SELECT 
                PartyLedgerName,
                `Ledger.$Parent` as parent,
                `Ledger.$Address` as address,
                `Ledger.$RelationType` as relation_type,
                `Ledger.$LedgerContact` as ledger_contact,
                `Ledger.$LedgerMobile` as ledger_mobile,
                `Ledger.$LedgerPhone` as ledger_phone,
                `Ledger.$EMail` as email,
                `Ledger.$_Address1` as address1,
                `Ledger.$_Address2` as address2,
                `Ledger.$_Address3` as address3,
                `Ledger.$_Address4` as address4,
                `Ledger.$_Address5` as address5,
                `Ledger.$_PrimaryGroup` as primary_group,
                `Ledger.$_LedgerPhone` as ledger_phone_alt,
                `Ledger.$_LedgerFax` as ledger_fax,
                `Ledger.$_LedgerMobile` as ledger_mobile_alt,
                `Ledger.$_LedgerEMail` as ledger_email,
                `Ledger.$_Led_Main_ContactNo_Form` as main_contact_no,
                `Ledger.$_Led_OwnerName_Form` as owner_name,
                `Ledger.$_Led_OwnerPhone_Form` as owner_phone,
                `Ledger.$_Led_Payment_Contact_P_Form` as payment_contact_person,
                `Ledger.$_Led_Payment_Contact_PHone_Form` as payment_contact_phone,
                `Ledger.$_Led_Purchase_Contact_P_Form` as purchase_contact_person,
                `Ledger.$_Led_Purchase_Contact_PHone_Form` as purchase_contact_phone,
                `Ledger.$_LedGroup` as ledger_group,
                `Ledger.$_GSTRegistrationType` as gst_registration_type,
                `Ledger.$_PartyGSTIN` as party_gstin,
                fullyUpdated,
                designation,
                designator_name
            FROM salesdatalatest33 
            WHERE PartyLedgerName LIKE ?
            LIMIT 1";

    $stmt3 = $pdo->prepare($sql3);
    $stmt3->execute(['%' . $searchName . '%']);
    $result3 = $stmt3->fetchAll(PDO::FETCH_ASSOC);

    if (count($result3) > 0) {
        echo json_encode($result3);
        exit;
    }

    // If no results found in either table
    echo json_encode([]);

} catch (PDOException $e) {
    sendError("Database connection error: " . $e->getMessage());
} catch (Exception $e) {
    sendError("Server error: " . $e->getMessage());
}
?>