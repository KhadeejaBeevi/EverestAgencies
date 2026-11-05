<?php
/**
 * update_user_email.php
 *
 * Changes a user's LOGIN email in Firebase Authentication. Manage Users
 * calls this when an admin edits a user's email, so the user can log in
 * with the new email (saving only the Firestore "Users" record leaves the
 * old email as the login ID).
 *
 * Request:  POST  JSON { "uid": "<Firebase uid>", "email": "<new email>",
 *                        "check": true|false, "idToken": "<admin token>" }
 *           (Authorization: Bearer <token> header also accepted)
 * Response: { "success": true, "loginEmail": "<login email now>", "changed": true|false }
 *
 * With "check": true nothing is changed; it only returns the current login
 * email, so the page can ask the admin before replacing it (some users
 * log in with dummy emails that differ from the email in their profile).
 *
 * Only a logged-in user whose PagePermissions/{uid} has "Manage Users": true
 * may call this, the same rule that guards the Manage Users page.
 *
 * SETUP: same as generate_reset_link.php:
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
// Uses FIREBASE_CREDENTIALS if set, else the first file that exists:
// the live server's path, then the local XAMPP path.
$SERVICE_ACCOUNT_PATH = getenv('FIREBASE_CREDENTIALS') ?: '';
if ($SERVICE_ACCOUNT_PATH === '') {
    foreach ([
        '/home2/everejop/secure/firebase-service-account.json', // live server
        'C:/secure/firebase-service-account.json',              // local XAMPP
    ] as $candidate) {
        if (is_readable($candidate)) {
            $SERVICE_ACCOUNT_PATH = $candidate;
            break;
        }
    }
}

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
// Sent as "Authorization: Bearer <token>" and also as "idToken" in the JSON
// body, because Apache (e.g. XAMPP) often drops the Authorization header.
$input      = json_decode(file_get_contents('php://input'), true) ?: [];
$authHeader = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? (function_exists('getallheaders') ? (getallheaders()['Authorization'] ?? '') : '');

$idToken = preg_match('/^Bearer\s+(.+)$/i', (string)$authHeader, $m)
    ? trim($m[1])
    : trim((string)($input['idToken'] ?? ''));

if ($idToken === '') {
    respond(401, ['success' => false, 'message' => 'Not logged in']);
}

// ---------- input ----------
$targetUid = trim((string)($input['uid'] ?? ''));
$newEmail  = strtolower(trim((string)($input['email'] ?? '')));
$checkOnly = !empty($input['check']);

if ($targetUid === '' || !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $targetUid)) {
    respond(400, ['success' => false, 'message' => 'Missing or invalid user id']);
}
if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
    respond(400, ['success' => false, 'message' => 'Enter a valid email address']);
}

if (!is_readable($SERVICE_ACCOUNT_PATH)) {
    respond(500, [
        'success' => false,
        'message' => 'Server setup: Firebase service account key file not found. '
            . 'Upload it and set $SERVICE_ACCOUNT_PATH (or the FIREBASE_CREDENTIALS env var) in '
            . basename(__FILE__),
    ]);
}

$isAdmin = false;

try {
    $auth = (new Factory())
        ->withServiceAccount($SERVICE_ACCOUNT_PATH)
        ->createAuth();

    // 1. Who is calling?
    $verified  = $auth->verifyIdToken($idToken);
    $callerUid = $verified->claims()->get('sub');

    // 2. May they manage users?
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
        respond(403, ['success' => false, 'message' => 'Only admins with Manage Users access can change login emails']);
    }
    $isAdmin = true;

    // 3. Read (and unless check-only, change) the login email
    $user         = $auth->getUser($targetUid);
    $currentEmail = strtolower((string)$user->email);

    if ($checkOnly || $currentEmail === $newEmail) {
        respond(200, ['success' => true, 'loginEmail' => $currentEmail, 'changed' => false]);
    }

    $auth->changeUserEmail($targetUid, $newEmail);

    respond(200, ['success' => true, 'loginEmail' => $newEmail, 'changed' => true]);
} catch (\Kreait\Firebase\Exception\Auth\FailedToVerifyToken $e) {
    respond(401, ['success' => false, 'message' => 'Session expired. Please log in again']);
} catch (\Kreait\Firebase\Exception\Auth\UserNotFound $e) {
    respond(404, ['success' => false, 'message' => 'User not found in Firebase Authentication']);
} catch (\Kreait\Firebase\Exception\Auth\EmailExists $e) {
    respond(409, ['success' => false, 'message' => 'Another login already uses this email']);
} catch (\Throwable $e) {
    error_log('update_user_email: ' . $e->getMessage());
    // Only verified admins see the technical reason.
    $detail = $isAdmin ? ': ' . $e->getMessage() : '';
    respond(500, ['success' => false, 'message' => 'Could not change the login email' . $detail]);
}
