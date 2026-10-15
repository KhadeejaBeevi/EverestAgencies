<?php
// cPanel database settings.
//
// On the cPanel server: copy this file to db_credentials.php (same folder) and fill
// in the values from cPanel -> MySQL Databases. db_credentials.php is not in git,
// so the password never goes to GitHub. Not needed on the local XAMPP PC.
//
// Both databases are queried together by some pages (e.g. ksebdirectory.php,
// kseb_payment.php), so in cPanel add the MySQL user to BOTH databases with
// ALL PRIVILEGES.

return [
    'host' => 'localhost',
    'user' => 'cpanelusername_everest',
    'pass' => 'CHANGE_ME',
    'databases' => [
        'tally_db' => 'cpanelusername_tally_db',
        'salescollection' => 'cpanelusername_salescollection',

        // If one database uses a different MySQL user, use this form instead:
        // 'salescollection' => [
        //     'name' => 'cpanelusername_salescollection',
        //     'user' => 'cpanelusername_sales',
        //     'pass' => 'CHANGE_ME',
        // ],
    ],
];
