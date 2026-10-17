<?php

// Adds the "source" column to solar_new_leads the first time it is needed.
function ensure_solar_source_column(mysqli $conn): void
{
    $result = $conn->query("SHOW COLUMNS FROM solar_new_leads LIKE 'source'");

    if ($result && $result->num_rows === 0) {
        $conn->query("ALTER TABLE solar_new_leads ADD COLUMN source VARCHAR(255) DEFAULT NULL");
    }
}
