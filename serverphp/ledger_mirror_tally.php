<?php

/*
|--------------------------------------------------------------------------
| Tally sync columns for ledger_mirror
|--------------------------------------------------------------------------
|
| tally_pending    1 = changed in CRM and not yet updated in Tally
| tally_synced_at  when the changes were last marked as updated in Tally
| tally_synced_by  who marked them
|
| The columns are added automatically the first time this runs, so no
| manual ALTER TABLE is needed.
|
|--------------------------------------------------------------------------
*/

function ensureLedgerMirrorTallyColumns(mysqli $conn)
{
    $columns = [
        "tally_pending" =>
            "TINYINT(1) NOT NULL DEFAULT 1",

        "tally_synced_at" =>
            "DATETIME NULL DEFAULT NULL",

        "tally_synced_by" =>
            "VARCHAR(255) NULL DEFAULT NULL"
    ];

    $existing = [];

    $result = $conn->query(
        "SHOW COLUMNS FROM `ledger_mirror`"
    );

    while ($row = $result->fetch_assoc()) {
        $existing[$row["Field"]] = true;
    }

    foreach ($columns as $name => $definition) {

        if (!isset($existing[$name])) {

            $conn->query(
                "ALTER TABLE `ledger_mirror` ADD COLUMN `$name` $definition"
            );
        }
    }
}

?>
