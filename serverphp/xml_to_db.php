<?php
require_once __DIR__ . '/api_auth.php';

$tallyUrl = "http://117.221.70.147:14151";


$xmlRequest = '
<ENVELOPE>
<HEADER>
<TALLYREQUEST>Export Data</TALLYREQUEST>
</HEADER>
<BODY>
<EXPORTDATA>
<REQUESTDESC>
<REPORTNAME>XML CompanyInfo</REPORTNAME>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
</STATICVARIABLES>
</REQUESTDESC>
</EXPORTDATA>
</BODY>
</ENVELOPE>';


$ch = curl_init($tallyUrl);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $xmlRequest);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: text/xml']);

$response = curl_exec($ch);


if (curl_errno($ch)) {
    die("❌ CURL Error: " . curl_error($ch));
}

curl_close($ch);


if (empty($response)) {
    die("❌ No response from Tally. Check URL / Port / Firewall");
}


file_put_contents("response.xml", $response);



$xml = simplexml_load_string($response);

if (!$xml) {
    die("❌ Failed to parse XML response");
}


if (isset($xml->LINEERROR)) {
    echo "❌ Tally Error: " . (string)$xml->LINEERROR;
    exit;
}


if (!isset($xml->COMPANYINFO)) {
    echo "❌ No COMPANYINFO data found in XML<br>";
    echo "<pre>" . htmlspecialchars($response) . "</pre>";
    exit;
}


$conn = new mysqli("localhost", "root", "", "tally_db");

if ($conn->connect_error) {
    die("❌ DB Connection failed: " . $conn->connect_error);
}


$conn->query("TRUNCATE TABLE company_info");


foreach ($xml->COMPANYINFO as $company) {

    $company_name = $conn->real_escape_string((string)$company->COMPANYNAME);
    $address      = $conn->real_escape_string((string)$company->ADDRESS1);
    $state        = $conn->real_escape_string((string)$company->STATENAME);
    $country      = $conn->real_escape_string((string)$company->COUNTRYNAME);

    $emails = $company->EMAIL;
    $email1 = isset($emails[0]) ? $conn->real_escape_string((string)$emails[0]) : '';
    $email2 = isset($emails[1]) ? $conn->real_escape_string((string)$emails[1]) : '';

    $vchtype   = $conn->real_escape_string((string)$company->VCHTYPE);
    $godown    = $conn->real_escape_string((string)$company->GODOWNNAME);
    $batch     = $conn->real_escape_string((string)$company->BATCHNAME);
    $igst      = $conn->real_escape_string((string)$company->IGSTLEDGER);
    $sgst      = $conn->real_escape_string((string)$company->SGSTLEDGER);
    $cgst      = $conn->real_escape_string((string)$company->CGSTLEDGER);
    $sales     = $conn->real_escape_string((string)$company->SALESLEDGER);
    $uom       = $conn->real_escape_string((string)$company->UOM);
    $lanip     = $conn->real_escape_string((string)$company->LANIP);
    $tallyport = $conn->real_escape_string((string)$company->TALLYPORT);
    $serialno  = $conn->real_escape_string((string)$company->SERIALNO);

    $sql = "INSERT INTO company_info (
        company_name, address, state, country,
        email1, email2, vchtype, godown, batch,
        igst, sgst, cgst, salesledger, uom,
        lanip, tallyport, serialno
    ) VALUES (
        '$company_name', '$address', '$state', '$country',
        '$email1', '$email2', '$vchtype', '$godown', '$batch',
        '$igst', '$sgst', '$cgst', '$sales', '$uom',
        '$lanip', '$tallyport', '$serialno'
    )";

    if (!$conn->query($sql)) {
        echo "❌ Insert Error: " . $conn->error . "<br>";
    }
}

echo "✅ Data imported successfully!";

$conn->close();

?>