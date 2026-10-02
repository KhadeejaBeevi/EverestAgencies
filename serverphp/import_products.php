<?php

set_time_limit(300); // Extend max execution time to 5 minutes

$servername = "localhost";
$username = "root"; 
$password = "";    
$dbname = "tally_db"; 

// DB connect
$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) { 
    die("Connection failed: " . $conn->connect_error); 
}

// Load XML file
$xmlFile = __DIR__ . "/Cleaned_EveItemGdwnOpClPhyStock.txt";
$xml = simplexml_load_file($xmlFile);
if ($xml === false) {
    die("❌ Failed to load XML file.");
}

$products = [];
$currentProduct = null;

// Parse XML
foreach ($xml->children() as $node) {
    $name = $node->getName();

    if ($name === "ITEMNAME") {
        if ($currentProduct) {
            $products[] = $currentProduct;
        }
        $currentProduct = [
            "name" => (string) $node,
            "parent" => "",
            "category" => "",
            "godowns" => []
        ];
    } elseif ($name === "ITEMPARENT") {
        $currentProduct["parent"] = (string) $node;
    } elseif ($name === "ITEMCATEGORY") {
        $currentProduct["category"] = (string) $node;
    } elseif ($name === "CFBKRRREPPARTY") {
        $godown = [];
        foreach ($node->children() as $g) {
            $tag = $g->getName();
            $val = (string) $g;

            if (strpos($tag, "ITEMOPBAL") !== false) {
                $godown["opening"] = $val;
            } elseif (strpos($tag, "ITEMCLBAL") !== false) {
                $godown["closing"] = $val;
            } elseif (strpos($tag, "ITEMPHYSTOCK") !== false) {
                $godown["phys"] = $val;
            }

            if (!isset($godown["code"])) {
                preg_match("/(GD\d)/", $tag, $matches);
                $godown["code"] = $matches[1] ?? "UNKNOWN";
            }
        }
        $currentProduct["godowns"][] = $godown;
    }
}

// Add last product if exists
if ($currentProduct) {
    $products[] = $currentProduct;
}

// Insert data into DB with transaction
$conn->begin_transaction();

try {
    foreach ($products as $product) {
        $stmt = $conn->prepare("INSERT INTO products (name, parent, category) VALUES (?, ?, ?)");
        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }
        $stmt->bind_param("sss", $product["name"], $product["parent"], $product["category"]);
        $stmt->execute();

        if ($stmt->error) {
            throw new Exception("Execute failed: " . $stmt->error);
        }

        $productId = $stmt->insert_id;
        $stmt->close();

        foreach ($product["godowns"] as $g) {
            $stmt2 = $conn->prepare(
                "INSERT INTO godown_balances (product_id, godown_code, opening_balance, closing_balance, phys_stock)
                 VALUES (?, ?, ?, ?, ?)"
            );
            if (!$stmt2) {
                throw new Exception("Prepare failed: " . $conn->error);
            }
            $stmt2->bind_param(
                "issss",
                $productId,
                $g["code"],
                $g["opening"],
                $g["closing"],
                $g["phys"]
            );
            $stmt2->execute();

            if ($stmt2->error) {
                throw new Exception("Execute failed: " . $stmt2->error);
            }

            $stmt2->close();
        }
    }

    $conn->commit();
    echo "✅ Import done! Inserted " . count($products) . " products.";
} catch (Exception $e) {
    $conn->rollback();
    die("❌ Import failed: " . $e->getMessage());
}

$conn->close();
?>

