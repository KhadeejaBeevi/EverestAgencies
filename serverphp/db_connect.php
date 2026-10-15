<?php
// Shared database connection for every endpoint.
//
// The code always uses the local database names ("tally_db" and
// "salescollection"). The real host, user, password and database names come
// from db_credentials.php, which is NOT in git:
//   - On the PC (XAMPP) no db_credentials.php is needed: the defaults below are used.
//   - On cPanel, copy db_credentials.example.php to db_credentials.php and fill in the
//     cPanel MySQL user/password and the prefixed database names.

if (!function_exists('db_connect')) {

    function db_settings()
    {
        static $settings = null;

        if ($settings === null) {
            $settings = [
                'host' => 'localhost',
                'user' => 'root',
                'pass' => '',
                'databases' => [
                    'tally_db' => 'tally_db',
                    'salescollection' => 'salescollection',
                ],
            ];

            $configFile = __DIR__ . '/db_credentials.php';
            if (is_file($configFile)) {
                $config = require $configFile;
                if (is_array($config)) {
                    $settings = array_replace_recursive($settings, $config);
                }
            }
        }

        return $settings;
    }

    // Settings for one database. A database entry may be a plain name, or an
    // array with its own name/user/pass when cPanel uses a different MySQL
    // user for that database.
    function db_database_settings($key)
    {
        $settings = db_settings();
        $key = strtolower($key);

        if (!isset($settings['databases'][$key])) {
            throw new InvalidArgumentException("Unknown database: $key");
        }

        $db = $settings['databases'][$key];
        if (!is_array($db)) {
            $db = ['name' => $db];
        }

        return [
            'host' => $db['host'] ?? $settings['host'],
            'user' => $db['user'] ?? $settings['user'],
            'pass' => $db['pass'] ?? $settings['pass'],
            'name' => $db['name'] ?? $key,
        ];
    }

    // Real database name, for SQL that joins across both databases,
    // e.g. "FROM " . db_name('salescollection') . ".salesdatalatest33".
    function db_name($key)
    {
        return db_database_settings($key)['name'];
    }

    // mysqli connection to "tally_db" or "salescollection".
    // Callers check $conn->connect_error as before.
    function db_connect($key)
    {
        $db = db_database_settings($key);

        return new mysqli($db['host'], $db['user'], $db['pass'], $db['name']);
    }

    // PDO connection to "tally_db" or "salescollection".
    function db_pdo($key, array $options = [], $charset = 'utf8mb4')
    {
        $db = db_database_settings($key);

        return new PDO(
            "mysql:host={$db['host']};dbname={$db['name']};charset=$charset",
            $db['user'],
            $db['pass'],
            $options
        );
    }
}
