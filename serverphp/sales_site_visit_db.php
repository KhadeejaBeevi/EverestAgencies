<?php
// Shared helpers for the Sales Site Visit endpoints.

function sales_site_visit_conn()
{
    $conn = new mysqli("localhost", "root", "", "tally_db");

    if ($conn->connect_error) {
        echo json_encode([
            "status" => "error",
            "message" => "Database connection failed"
        ]);
        exit;
    }

    $conn->set_charset("utf8mb4");

    $conn->query("
        CREATE TABLE IF NOT EXISTS sales_site_visits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_type ENUM('Old', 'New') NOT NULL DEFAULT 'New',
            matched_party VARCHAR(255) DEFAULT NULL,
            customer_name VARCHAR(255) NOT NULL,
            customer_category VARCHAR(100) DEFAULT NULL,
            phone VARCHAR(30) NOT NULL,
            decision_maker VARCHAR(255) DEFAULT NULL,
            site_name VARCHAR(255) DEFAULT NULL,
            address TEXT,
            requirement TEXT,
            location TEXT,
            latitude DECIMAL(10, 7) DEFAULT NULL,
            longitude DECIMAL(10, 7) DEFAULT NULL,
            location_accuracy INT DEFAULT NULL,
            image VARCHAR(255) NOT NULL,
            followup_date DATE DEFAULT NULL,
            sales_executive VARCHAR(255) NOT NULL,
            sales_executive_uid VARCHAR(128) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_executive (sales_executive),
            INDEX idx_phone (phone),
            INDEX idx_created (created_at)
        )
    ");

    return $conn;
}

// Last 10 digits of a phone number, or "" if it is too short.
function sales_site_visit_phone_key($phone)
{
    $digits = preg_replace('/\D/', '', (string) $phone);
    return strlen($digits) >= 10 ? substr($digits, -10) : "";
}

// Looks the customer up in the Tally party master (salescollection.newpartyledgerdetails).
// Returns the matched party ledger name, or null when the customer is new.
function sales_site_visit_find_party($customerName, $phone)
{
    $conn = new mysqli("localhost", "root", "", "salescollection");

    if ($conn->connect_error) {
        return null;
    }

    $conn->set_charset("utf8mb4");

    $name = trim((string) $customerName);
    $phoneKey = sales_site_visit_phone_key($phone);

    $phoneColumns = "REPLACE(REPLACE(REPLACE(REPLACE(CONCAT_WS(',',
            mobile, ledger_phone, owner_phone,
            payment_contact_phone, purchase_contact_phone
        ), ' ', ''), '-', ''), '+', ''), '/', ',')";

    $stmt = $conn->prepare("
        SELECT party_ledger_name
        FROM newpartyledgerdetails
        WHERE LOWER(TRIM(party_ledger_name)) = LOWER(?)
           OR (? <> '' AND $phoneColumns LIKE ?)
        LIMIT 1
    ");

    if (!$stmt) {
        $conn->close();
        return null;
    }

    $phoneLike = "%" . $phoneKey . "%";
    $stmt->bind_param("sss", $name, $phoneKey, $phoneLike);
    $stmt->execute();

    $row = $stmt->get_result()->fetch_assoc();

    $stmt->close();
    $conn->close();

    return $row ? $row["party_ledger_name"] : null;
}
