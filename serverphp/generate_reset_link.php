<?php
/**
 * generate_reset_link.php
 *
 * Creates a one-time Firebase password reset link for a user, so an admin
 * can send it to that user's mobile (WhatsApp / SMS) from Manage Users.
 * Nothing is emailed, so it works for accounts with dummy email addresses.
 *
 * Request:  POST  JSON { "uid": "<Firebase uid of the user>" }
 *           Header Authorization: Bearer <Firebase ID token of the admin>
 * Response: { "success": true, "link": "https://...", "email": "..." }
 *
 * Only a logged-in user whose PagePermissions/{uid} has "Manage Users": true
 * may call this, the same rule that guards the Manage Users page.
 *
 * SETUP (once):
 *   1. composer require kreait/firebase-php        (in this serverphp folder)
 *   2. Firebase console > Project settings > Service accounts >
 *      "Generate new private key". Save the JSON OUTSIDE the web root and
 *      set SERVICE_ACCOUNT_PATH below (or the FIREBASE_CREDENTIALS env var).
 */

require __DIR__ . '/vendor/autoload.php';

use Kreait\Firebase\Factory;

const FIREBASE_PROJECT_ID = 'login-auth-2f165';
const REQUIRED_PAGE       = 'Manage Users';

// Path to the service account JSON. Keep it out of the public web folder.
$SERVICE_ACCOUNT_PATH = getenv('FIREBASE_CREDENTIALS') ?: 'C:/secure/firebase-service-account.json';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Use POST']);
}

// ---------- caller's ID token ----------
$authHeader = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? (function_exists('getallheaders') ? (getallheaders()['Authorization'] ?? '') : '');

if (!preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
    respond(401, ['success' => false, 'message' => 'Not logged in']);
}
$idToken = trim($m[1]);

// ---------- input ----------
$input     = json_decode(file_get_contents('php://input'), true) ?: [];
$targetUid = trim((string)($input['uid'] ?? ''));

if ($targetUid === '' || !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $targetUid)) {
    respond(400, ['success' => false, 'message' => 'Missing or invalid user id']);
}

try {
    $auth = (new Factory())
        ->withServiceAccount($SERVICE_ACCOUNT_PATH)
        ->createAuth();

    // 1. Who is calling?
    $verified  = $auth->verifyIdToken($idToken);
    $callerUid = $verified->claims()->get('sub');

    // 2. May they manage users? Read PagePermissions/{callerUid} through the
    //    Firestore REST API using the caller's own token (no gRPC needed).
    $url = sprintf(
        'https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/PagePermissions/%s',
        FIREBASE_PROJECT_ID,
        rawurlencode($callerUid)
    );
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $idToken],
        CURLOPT_TIMEOUT        => 15,
    ]);
    $permBody   = curl_exec($ch);
    $permStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $perm    = $permStatus === 200 ? json_decode($permBody, true) : null;
    $allowed = ($perm['fields'][REQUIRED_PAGE]['booleanValue'] ?? false) === true;

    if (!$allowed) {
        respond(403, ['success' => false, 'message' => 'Only admins with Manage Users access can create reset links']);
    }

    // 3. Create the link for the target user
    $user = $auth->getUser($targetUid);
    if (empty($user->email)) {
        respond(400, ['success' => false, 'message' => 'This user has no login email']);
    }

    $link = $auth->getPasswordResetLink($user->email);

    respond(200, [
        'success' => true,
        'link'    => $link,
        'email'   => $user->email,
    ]);
} catch (\Kreait\Firebase\Exception\Auth\FailedToVerifyToken $e) {
    respond(401, ['success' => false, 'message' => 'Session expired. Please log in again']);
} catch (\Kreait\Firebase\Exception\Auth\UserNotFound $e) {
    respond(404, ['success' => false, 'message' => 'User not found in Firebase Authentication']);
} catch (\Throwable $e) {
    error_log('generate_reset_link: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Could not create the reset link']);
}
