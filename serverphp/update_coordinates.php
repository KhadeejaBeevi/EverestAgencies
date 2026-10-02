<?php
require_once __DIR__ . '/api_auth.php';
error_reporting(E_ALL);
ini_set('display_errors', 1);

set_time_limit(0);

$conn = new mysqli(
    "localhost",
    "root",
    "",
    "tally_db"
);

if ($conn->connect_error) {
    die("DB Connection Failed");
}

echo "DB Connected\n\n";

$processed = [];

$corrections = [

    "PERLASSERY" => "PERALASSERY KANNUR",
    "EAICHUR" => "EACHUR KANNUR",
    "CHAKKARAKALLU" => "CHAKKARAKKAL KANNUR"

];


$sql = "
SELECT id, PLACE
FROM kseb_directory
WHERE latitude IS NULL
OR longitude IS NULL
LIMIT 10
";

$result = $conn->query($sql);

while ($row = $result->fetch_assoc()) {

    $id = $row['id'];

    $originalPlace = trim($row['PLACE']);

    if (!$originalPlace) {
        continue;
    }

    $searchPlace = $originalPlace;

    // corrections
    if (isset($corrections[$originalPlace])) {

        $searchPlace = $corrections[$originalPlace];
    }

    // skip duplicates
    if (in_array($searchPlace, $processed)) {

        continue;
    }

    $processed[] = $searchPlace;

    echo "=====================\n";
    echo "Original : $originalPlace\n";
    echo "Searching: $searchPlace\n";

    $query = urlencode($searchPlace . ", Kerala, India");

    $url = "https://nominatim.openstreetmap.org/search?format=json&q=$query&limit=1";

    $opts = [
        "http" => [
            "method" => "GET",
            "header" => "User-Agent: EverestApp/1.0\r\n"
        ]
    ];

    $context = stream_context_create($opts);

    $response = @file_get_contents(
        $url,
        false,
        $context
    );

    // API blocked
    if (!$response) {

        echo "API Failed / Rate Limited\n";

        sleep(50);

        continue;
    }

    $data = json_decode($response, true);

    if (empty($data)) {

        echo "No Result Found\n";

        sleep(10);

        continue;
    }

    $lat = $data[0]['lat'];
    $lon = $data[0]['lon'];

    echo "LAT: $lat\n";
    echo "LON: $lon\n";

    $stmt = $conn->prepare("
        UPDATE kseb_directory
        SET latitude = ?, longitude = ?
        WHERE PLACE = ?
    ");

    $stmt->bind_param(
        "sss",
        $lat,
        $lon,
        $originalPlace
    );

    if ($stmt->execute()) {

        echo "UPDATED SUCCESSFULLY\n";

    } else {

        echo "UPDATE FAILED\n";
    }

    $stmt->close();

    // IMPORTANT
    sleep(3);
}

echo "\nDONE";
?>