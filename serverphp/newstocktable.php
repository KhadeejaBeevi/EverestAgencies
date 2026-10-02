<?php


set_time_limit(0);
ini_set('memory_limit', '512M'); 

echo "Starting Tally XML import process...\n";


$host = 'localhost';
$dbname = 'salescollection';
$username = 'root';
$password = '';


$DUPLICATE_HANDLING = 'REPLACE'; 


$tallyUrl = "http://117.221.70.147:14151";


echo "Testing Tally server with simple request...\n";
$testRequest = 
'<ENVELOPE>
<HEADER>
<TALLYREQUEST>Export Data</TALLYREQUEST>
</HEADER>
<BODY>
<EXPORTDATA>
<REQUESTDESC>
<REPORTNAME>List of Companies</REPORTNAME>
</REQUESTDESC>
</EXPORTDATA>
</BODY>
</ENVELOPE>';

$testCh = curl_init();
curl_setopt($testCh, CURLOPT_URL, $tallyUrl);
curl_setopt($testCh, CURLOPT_POST, true);
curl_setopt($testCh, CURLOPT_POSTFIELDS, $testRequest);
curl_setopt($testCh, CURLOPT_RETURNTRANSFER, true);
curl_setopt($testCh, CURLOPT_HTTPHEADER, [
    'Content-Type: text/xml',
    'Content-Length: ' . strlen($testRequest)
]);
curl_setopt($testCh, CURLOPT_TIMEOUT, 30);
curl_setopt($testCh, CURLOPT_CONNECTTIMEOUT, 10);

$testResult = curl_exec($testCh);
$httpCode = curl_getinfo($testCh, CURLINFO_HTTP_CODE);
$curlError = curl_error($testCh);
curl_close($testCh);

if ($curlError) {
    echo "❌ Tally server connection failed: $curlError\n";
    echo "Please check:\n";
    echo "1. Tally server is running on $tallyUrl\n";
    echo "2. Network connectivity to the server\n";
    echo "3. Firewall settings\n";
    echo "4. Try accessing $tallyUrl directly in browser\n";
    exit(1);
} elseif (str_contains($testResult, 'TallyPrime') || str_contains($testResult, 'Tally') || $httpCode == 200) {
    echo "✅ Tally server is responding (HTTP Code: $httpCode)\n";
    echo "Server response preview: " . substr(strip_tags($testResult), 0, 100) . "...\n";
} else {
    echo "⚠️  Tally server responded but may not be properly configured (HTTP Code: $httpCode)\n";
    echo "Response: " . substr($testResult, 0, 200) . "\n";
}


$xmlRequest = '
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>CFBKRR Rep</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>$BooksFrom:Company:##SVCurrentCompany</SVFROMDATE>
          <SVTODATE>$LastVoucherDate:Company:##SVCurrentCompany</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
';

try {
    echo "Sending XML request to Tally...\n";
    
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $tallyUrl);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $xmlRequest);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
   curl_setopt($testCh, CURLOPT_HTTPHEADER, [
    "Content-Type: application/xml",
    "Expect:"
]);

curl_setopt($testCh, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_0);
    
    // Extended timeout settings for very slow/large data transfers
    curl_setopt($ch, CURLOPT_TIMEOUT, 1800);          // 30 minutes total timeout
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 60);     // 60 seconds to establish connection
    curl_setopt($ch, CURLOPT_LOW_SPEED_LIMIT, 0);     // Disable low speed limit (allows very slow transfers)
    curl_setopt($ch, CURLOPT_LOW_SPEED_TIME, 0);      // Disable low speed timeout
    
    // Additional reliability settings for slow connections
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Tally XML Importer/1.0');
 // Force HTTP/1.1
    curl_setopt($ch, CURLOPT_TCP_KEEPALIVE, 1);                    // Keep TCP connection alive
    curl_setopt($ch, CURLOPT_TCP_KEEPIDLE, 300);                   // Start keepalive after 5 minutes
    curl_setopt($ch, CURLOPT_TCP_KEEPINTVL, 60);                   // Interval between keepalive probes
    
    // Progress callback to show we're receiving data
    curl_setopt($ch, CURLOPT_NOPROGRESS, false);
    curl_setopt($ch, CURLOPT_PROGRESSFUNCTION, function($resource, $download_size, $downloaded, $upload_size, $uploaded) {
        static $lastUpdate = 0;
        static $startTime = null;
        
        if ($startTime === null) {
            $startTime = time();
        }
        
        $now = time();
        if ($now - $lastUpdate >= 10) { // Update every 10 seconds for slow transfers
            $elapsed = $now - $startTime;
            
            if ($download_size > 0) {
                $percent = round(($downloaded / $download_size) * 100, 1);
                $speed = $elapsed > 0 ? formatBytes($downloaded / $elapsed) . '/s' : '0 B/s';
                echo "Progress: " . formatBytes($downloaded) . " / " . formatBytes($download_size) . " ($percent%) - Speed: $speed - Time: {$elapsed}s\n";
            } elseif ($downloaded > 0) {
                $speed = $elapsed > 0 ? formatBytes($downloaded / $elapsed) . '/s' : '0 B/s';
                echo "Downloaded: " . formatBytes($downloaded) . " - Speed: $speed - Time: {$elapsed}s\n";
            } else {
                echo "Waiting for data... Time elapsed: {$elapsed}s\n";
            }
            $lastUpdate = $now;
        }
    });

    // Execute request
    echo "Requesting data from Tally (this may take several minutes for large datasets)...\n";
    $startTime = microtime(true);
    $response = curl_exec($ch);
    $endTime = microtime(true);
    $duration = round($endTime - $startTime, 2);
    
    if (curl_error($ch)) {
        $curlError = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        throw new Exception("cURL Error: $curlError (HTTP Code: $httpCode)");
    }
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $responseSize = strlen($response);
    curl_close($ch);
    
    echo "✅ Data received successfully!\n";
    echo "HTTP Code: $httpCode\n";
    echo "Response Size: " . formatBytes($responseSize) . "\n";
    echo "Download Time: {$duration} seconds\n\n";
    
    // Clean encoding and invalid XML chars
    echo "Cleaning XML data...\n";
    $response = mb_convert_encoding($response, 'UTF-8', 'UTF-8, ISO-8859-1, Windows-1252');
    // Remove numeric entities like &#4;
    $response = preg_replace('/&#\d+;/', '', $response);
    // Remove illegal ASCII control chars
    $response = preg_replace('/[^\x09\x0A\x0D\x20-\x7E]/', '', $response);
    
    // Debug: save cleaned XML
    $debugFile = __DIR__ . "/debug_stock.xml";
    file_put_contents($debugFile, $response);
    echo "Debug XML saved to: $debugFile\n";
    
    // Check if response looks like valid XML
    if (empty($response) || !str_contains($response, '<')) {
        throw new Exception('Received empty or invalid XML response from Tally');
    }
    
    // Parse XML
    echo "Parsing XML data...\n";
    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($response);
    
    if ($xml === false) {
        $errors = libxml_get_errors();
        $errorMsg = "Failed to parse XML response. Errors:\n";
        foreach ($errors as $error) {
            $errorMsg .= "Line {$error->line}: {$error->message}";
        }
        throw new Exception($errorMsg);
    }
    
    echo "✅ XML parsed successfully!\n";
    
    // Connect to database
    echo "Connecting to database...\n";
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "✅ Database connected successfully!\n";
    
    // Handle duplicates based on configuration
    if ($DUPLICATE_HANDLING === 'TRUNCATE') {
        echo "🗑️  Clearing existing data from products_table...\n";
        $pdo->exec("TRUNCATE TABLE products_table");
        echo "✅ Table cleared successfully!\n";
    }
    
    // Prepare the appropriate statement based on duplicate handling
    if ($DUPLICATE_HANDLING === 'REPLACE') {
        echo "🔄 Using REPLACE mode - will replace existing records\n";
        $stmt = $pdo->prepare("
            REPLACE INTO products_table (
                name, parent, category,
                GD1ITEMOPBAL, GD1ITEMCLBAL,
                GD2ITEMOPBAL, GD2ITEMCLBAL,
                GD3ITEMOPBAL, GD3ITEMCLBAL,
                GD4ITEMOPBAL, GD4ITEMCLBAL,
                GD5ITEMOPBAL, GD5ITEMCLBAL,
                GD6ITEMOPBAL, GD6ITEMCLBAL,
                GD7ITEMOPBAL, GD7ITEMCLBAL
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
    } elseif ($DUPLICATE_HANDLING === 'SKIP') {
        echo "⏭️  Using INSERT IGNORE mode - will skip existing records\n";
        $stmt = $pdo->prepare("
            INSERT IGNORE INTO products_table (
                name, parent, category,
                GD1ITEMOPBAL, GD1ITEMCLBAL,
                GD2ITEMOPBAL, GD2ITEMCLBAL,
                GD3ITEMOPBAL, GD3ITEMCLBAL,
                GD4ITEMOPBAL, GD4ITEMCLBAL,
                GD5ITEMOPBAL, GD5ITEMCLBAL,
                GD6ITEMOPBAL, GD6ITEMCLBAL,
                GD7ITEMOPBAL, GD7ITEMCLBAL
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
    } elseif ($DUPLICATE_HANDLING === 'UPDATE') {
        echo "🔄 Using ON DUPLICATE KEY UPDATE mode - will update existing records\n";
        $stmt = $pdo->prepare("
            INSERT INTO products_table (
                name, parent, category,
                GD1ITEMOPBAL, GD1ITEMCLBAL,
                GD2ITEMOPBAL, GD2ITEMCLBAL,
                GD3ITEMOPBAL, GD3ITEMCLBAL,
                GD4ITEMOPBAL, GD4ITEMCLBAL,
                GD5ITEMOPBAL, GD5ITEMCLBAL,
                GD6ITEMOPBAL, GD6ITEMCLBAL,
                GD7ITEMOPBAL, GD7ITEMCLBAL
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                parent = VALUES(parent),
                category = VALUES(category),
                GD1ITEMOPBAL = VALUES(GD1ITEMOPBAL),
                GD1ITEMCLBAL = VALUES(GD1ITEMCLBAL),
                GD2ITEMOPBAL = VALUES(GD2ITEMOPBAL),
                GD2ITEMCLBAL = VALUES(GD2ITEMCLBAL),
                GD3ITEMOPBAL = VALUES(GD3ITEMOPBAL),
                GD3ITEMCLBAL = VALUES(GD3ITEMCLBAL),
                GD4ITEMOPBAL = VALUES(GD4ITEMOPBAL),
                GD4ITEMCLBAL = VALUES(GD4ITEMCLBAL),
                GD5ITEMOPBAL = VALUES(GD5ITEMOPBAL),
                GD5ITEMCLBAL = VALUES(GD5ITEMCLBAL),
                GD6ITEMOPBAL = VALUES(GD6ITEMOPBAL),
                GD6ITEMCLBAL = VALUES(GD6ITEMCLBAL),
                GD7ITEMOPBAL = VALUES(GD7ITEMOPBAL),
                GD7ITEMCLBAL = VALUES(GD7ITEMCLBAL)
        ");
    } else {
        // Default to regular INSERT
        echo "➕ Using regular INSERT mode - may create duplicates\n";
        $stmt = $pdo->prepare("
            INSERT INTO products_table (
                name, parent, category,
                GD1ITEMOPBAL, GD1ITEMCLBAL,
                GD2ITEMOPBAL, GD2ITEMCLBAL,
                GD3ITEMOPBAL, GD3ITEMCLBAL,
                GD4ITEMOPBAL, GD4ITEMCLBAL,
                GD5ITEMOPBAL, GD5ITEMCLBAL,
                GD6ITEMOPBAL, GD6ITEMCLBAL,
                GD7ITEMOPBAL, GD7ITEMCLBAL
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
    }
    
    // Process XML data
    echo "Processing XML data...\n";
    $items = [];
    $currentItem = null;
    
    // Parse the XML structure
    foreach ($xml->children() as $element) {
        $tagName = $element->getName();
        
        if ($tagName === 'ITEMNAME') {
            // If we have a previous item, save it
            if ($currentItem !== null) {
                $items[] = $currentItem;
            }
            
            // Start a new item
            $currentItem = [
                'name' => (string)$element,
                'parent' => '',
                'category' => '',
                'GD1ITEMOPBAL' => 0,
                'GD1ITEMCLBAL' => 0,
                'GD2ITEMOPBAL' => 0,
                'GD2ITEMCLBAL' => 0,
                'GD3ITEMOPBAL' => 0,
                'GD3ITEMCLBAL' => 0,
                'GD4ITEMOPBAL' => 0,
                'GD4ITEMCLBAL' => 0,
                'GD5ITEMOPBAL' => 0,
                'GD5ITEMCLBAL' => 0,
                'GD6ITEMOPBAL' => 0,
                'GD6ITEMCLBAL' => 0,
                'GD7ITEMOPBAL' => 0,
                'GD7ITEMCLBAL' => 0
            ];
        } elseif ($tagName === 'ITEMPARENT' && $currentItem !== null) {
            $currentItem['parent'] = (string)$element;
        } elseif ($tagName === 'ITEMCATEGORY' && $currentItem !== null) {
            $currentItem['category'] = (string)$element;
        } elseif ($tagName === 'CFBKRRREPPARTY' && $currentItem !== null) {
            // Process the party data
            foreach ($element->children() as $partyElement) {
                $partyTagName = $partyElement->getName();
                $value = (string)$partyElement;
                
                // Only process the GD fields we need for the database
                if (array_key_exists($partyTagName, $currentItem) && !empty($value)) {
                    $currentItem[$partyTagName] = floatval($value);
                }
            }
        }
    }
    
    // Don't forget the last item
    if ($currentItem !== null) {
        $items[] = $currentItem;
    }
    
    // Insert items into database
    echo "Inserting " . count($items) . " items into database...\n";
    $insertedCount = 0;
    $errorCount = 0;
    $batchSize = 100; // Process in batches for better performance
    $currentBatch = 0;
    
    // Begin transaction for better performance
    $pdo->beginTransaction();
    
    foreach ($items as $index => $item) {
        try {
            $stmt->execute([
                $item['name'],
                $item['parent'],
                $item['category'],
                $item['GD1ITEMOPBAL'],
                $item['GD1ITEMCLBAL'],
                $item['GD2ITEMOPBAL'],
                $item['GD2ITEMCLBAL'],
                $item['GD3ITEMOPBAL'],
                $item['GD3ITEMCLBAL'],
                $item['GD4ITEMOPBAL'],
                $item['GD4ITEMCLBAL'],
                $item['GD5ITEMOPBAL'],
                $item['GD5ITEMCLBAL'],
                $item['GD6ITEMOPBAL'],
                $item['GD6ITEMCLBAL'],
                $item['GD7ITEMOPBAL'],
                $item['GD7ITEMCLBAL']
            ]);
            $insertedCount++;
            
            // Show progress every 10 items
            if (($insertedCount % 10) === 0) {
                echo "Processed $insertedCount/" . count($items) . " items...\n";
            }
            
            // Commit batch every $batchSize items
            if (($insertedCount % $batchSize) === 0) {
                $pdo->commit();
                $pdo->beginTransaction();
                echo "✅ Batch " . (++$currentBatch) . " committed ($batchSize items)\n";
            }
            
        } catch (PDOException $e) {
            $errorCount++;
            echo "❌ Error inserting item " . ($index + 1) . " (" . substr($item['name'], 0, 50) . "...): " . $e->getMessage() . "\n";
            
            // Continue with other items even if one fails
            if ($errorCount > 10) {
                echo "⚠️  Too many errors, stopping insertion process.\n";
                $pdo->rollback();
                break;
            }
        }
    }
    
    // Commit any remaining items
    if ($pdo->inTransaction()) {
        $pdo->commit();
        echo "✅ Final batch committed\n";
    }
    
    echo "\n" . str_repeat("=", 50) . "\n";
    echo "📊 IMPORT SUMMARY\n";
    echo str_repeat("=", 50) . "\n";
    echo "Total items processed: " . count($items) . "\n";
    echo "Successfully inserted: $insertedCount\n";
    echo "Errors encountered: $errorCount\n";
    echo "Success rate: " . round(($insertedCount / count($items)) * 100, 1) . "%\n";
    echo "Total execution time: " . round(microtime(true) - $startTime, 2) . " seconds\n";
    echo str_repeat("=", 50) . "\n";
    
} catch (Exception $e) {
    echo "❌ Fatal Error: " . $e->getMessage() . "\n";
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollback();
        echo "🔄 Database transaction rolled back\n";
    }
    if (isset($ch)) {
        curl_close($ch);
    }
    exit(1);
}

// Helper function to format bytes
function formatBytes($size, $precision = 2) {
    $units = array('B', 'KB', 'MB', 'GB', 'TB');
    
    for ($i = 0; $size > 1024 && $i < count($units) - 1; $i++) {
        $size /= 1024;
    }
    
    return round($size, $precision) . ' ' . $units[$i];
}
?>