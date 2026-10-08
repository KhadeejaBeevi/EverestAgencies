<?php
/*
 * Server-side check of the logged-in Firebase user.
 *
 * The React page sends "Authorization: Bearer <Firebase ID token>".
 * This file verifies that token with Google's public keys (no Composer
 * package needed) and then reads the user's name and role from Firestore
 * using the user's own token, so the browser can no longer claim to be
 * Admin or send someone else's name.
 *
 * Needs PHP's openssl and curl extensions and outbound HTTPS to
 * googleapis.com.
 */

const FIREBASE_PROJECT_ID = "login-auth-2f165";
const FIREBASE_CERTS_URL =
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

function firebase_base64url_decode(string $value): string
{
    $value = strtr($value, "-_", "+/");
    $pad = strlen($value) % 4;
    if ($pad) {
        $value .= str_repeat("=", 4 - $pad);
    }
    return (string)base64_decode($value);
}

function firebase_http_get(string $url, array $headers = []): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADER => true
    ]);
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new Exception("Request to Google failed: " . $error);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    return [
        "status" => $status,
        "headers" => substr($response, 0, $headerSize),
        "body" => substr($response, $headerSize)
    ];
}

// Google's signing certificates, cached on disk for as long as Google allows.
function firebase_public_certs(): array
{
    $cacheFile = sys_get_temp_dir() . "/everest_firebase_certs.json";

    if (is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (is_array($cached) && ($cached["expires"] ?? 0) > time() && is_array($cached["certs"] ?? null)) {
            return $cached["certs"];
        }
    }

    $response = firebase_http_get(FIREBASE_CERTS_URL);
    $certs = json_decode($response["body"], true);
    if ($response["status"] !== 200 || !is_array($certs)) {
        throw new Exception("Could not load Firebase public keys.");
    }

    $maxAge = 3600;
    if (preg_match('/max-age=(\d+)/i', $response["headers"], $match)) {
        $maxAge = (int)$match[1];
    }

    @file_put_contents($cacheFile, json_encode([
        "expires" => time() + $maxAge,
        "certs" => $certs
    ]));

    return $certs;
}

// Returns the token's claims, or throws if the token is not valid.
function firebase_verify_id_token(string $token): array
{
    $parts = explode(".", $token);
    if (count($parts) !== 3) {
        throw new Exception("Malformed login token.");
    }

    [$headerB64, $payloadB64, $signatureB64] = $parts;
    $header = json_decode(firebase_base64url_decode($headerB64), true);
    $claims = json_decode(firebase_base64url_decode($payloadB64), true);

    if (!is_array($header) || !is_array($claims) || ($header["alg"] ?? "") !== "RS256") {
        throw new Exception("Invalid login token.");
    }

    $certs = firebase_public_certs();
    $kid = $header["kid"] ?? "";
    if (!isset($certs[$kid])) {
        throw new Exception("Login token signed with an unknown key.");
    }

    $verified = openssl_verify(
        $headerB64 . "." . $payloadB64,
        firebase_base64url_decode($signatureB64),
        $certs[$kid],
        OPENSSL_ALGO_SHA256
    );
    if ($verified !== 1) {
        throw new Exception("Login token signature is invalid.");
    }

    $now = time();
    if (
        ($claims["aud"] ?? "") !== FIREBASE_PROJECT_ID ||
        ($claims["iss"] ?? "") !== "https://securetoken.google.com/" . FIREBASE_PROJECT_ID ||
        (int)($claims["exp"] ?? 0) <= $now ||
        (int)($claims["iat"] ?? 0) > $now + 300 ||
        trim((string)($claims["sub"] ?? "")) === ""
    ) {
        throw new Exception("Login token expired or not for this app. Please log in again.");
    }

    return $claims;
}

// Reads one Firestore document with the user's own token (Firestore rules apply).
function firebase_read_document(string $path, string $token): ?array
{
    $url = "https://firestore.googleapis.com/v1/projects/" . FIREBASE_PROJECT_ID .
        "/databases/(default)/documents/" . $path;
    $response = firebase_http_get($url, ["Authorization: Bearer " . $token]);

    if ($response["status"] !== 200) {
        return null;
    }

    $document = json_decode($response["body"], true);
    $fields = $document["fields"] ?? [];
    $values = [];
    foreach ($fields as $key => $field) {
        $values[$key] = $field["stringValue"] ?? ($field["booleanValue"] ?? ($field["integerValue"] ?? null));
    }
    return $values;
}

function firebase_bearer_token(): string
{
    $header = $_SERVER["HTTP_AUTHORIZATION"] ?? ($_SERVER["REDIRECT_HTTP_AUTHORIZATION"] ?? "");
    if ($header === "" && function_exists("getallheaders")) {
        foreach (getallheaders() as $name => $value) {
            if (strtolower($name) === "authorization") {
                $header = $value;
            }
        }
    }
    return preg_match('/^Bearer\s+(.+)$/i', trim($header), $match) ? trim($match[1]) : "";
}

/*
 * The verified user: uid, email, name (Users firstName + lastName),
 * role and is_admin (roles/{uid}.role === "admin", same rule as the app).
 * Sends 401 and exits when there is no valid token.
 */
function firebase_require_user(): array
{
    $token = firebase_bearer_token();

    try {
        if ($token === "") {
            throw new Exception("Not logged in. Please log in again.");
        }

        $claims = firebase_verify_id_token($token);
        $uid = (string)$claims["sub"];

        $roleDoc = firebase_read_document("roles/" . rawurlencode($uid), $token);
        $userDoc = firebase_read_document("Users/" . rawurlencode($uid), $token);

        $isAdmin = strtolower(trim((string)($roleDoc["role"] ?? ""))) === "admin";
        $name = trim(
            (string)($userDoc["firstName"] ?? "") . " " . (string)($userDoc["lastName"] ?? "")
        );

        return [
            "uid" => $uid,
            "email" => (string)($claims["email"] ?? ""),
            "name" => $name !== "" ? $name : (string)($claims["email"] ?? "Unknown"),
            "role" => $isAdmin ? "admin" : strtolower(trim((string)($userDoc["role"] ?? ""))),
            "is_admin" => $isAdmin
        ];
    } catch (Throwable $e) {
        http_response_code(401);
        echo json_encode([
            "success" => false,
            "message" => $e->getMessage()
        ]);
        exit;
    }
}
