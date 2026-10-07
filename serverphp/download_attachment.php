<?php
/*
 * download_attachment.php
 *
 * Serves an enquiry attachment using its ORIGINAL file name.
 *
 *   ?path=<URL path of the file, taken from file_url>
 *   &name=<original file name>
 *   &download=1   (optional: force download)
 *   &debug=1      (optional: show where it looked; remove when working)
 *
 * Put this file in the same folder as enquiry_report.php.
 */

/* ---------------------------------------------------------
   OPTIONAL: the folder where enquiry_report.php saves uploads.
   Leave as is if unsure; the script also searches on its own.
--------------------------------------------------------- */
$UPLOAD_DIR = __DIR__ . '/uploads/enquiry';

/* Files are only served from inside these folders. */
$ALLOWED_BASES = array_filter([
    realpath(__DIR__),
    realpath(dirname(__DIR__)),
    realpath($UPLOAD_DIR),
    !empty($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : false,
]);

/* Never serve code or config files. */
$BLOCKED_EXTENSIONS = [
    'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar',
    'inc', 'ini', 'env', 'htaccess', 'htpasswd', 'sql', 'log', 'sh', 'json', 'lock',
];

/* ---------------------------------------------------------
   INPUT
--------------------------------------------------------- */
$rawPath = isset($_GET['path']) ? (string) $_GET['path'] : '';

/* Support the old ?file= parameter too. */
if ($rawPath === '' && isset($_GET['file'])) {
    $rawPath = (string) $_GET['file'];
}

$rawPath = str_replace(["\0", '\\'], ['', '/'], $rawPath);

/* If a full URL was sent, keep only its path. */
if (preg_match('#^https?://#i', $rawPath)) {
    $rawPath = (string) parse_url($rawPath, PHP_URL_PATH);
}

$rawPath  = rawurldecode($rawPath);
$segments = array_values(array_filter(explode('/', $rawPath), function ($s) {
    return $s !== '' && $s !== '.' && $s !== '..';
}));

if (!$segments) {
    http_response_code(400);
    exit('Missing file path.');
}

/* ---------------------------------------------------------
   FIND THE FILE
   Tries the path from the web root, then from this PHP
   folder and its parent, dropping leading parts one by one
   (so "/serverphp/uploads/x/a.pdf" also matches
   "<this folder>/uploads/x/a.pdf"), then the upload folder.
--------------------------------------------------------- */
$candidates = [];
$relative   = implode('/', $segments);

if (!empty($_SERVER['DOCUMENT_ROOT'])) {
    $candidates[] = rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/' . $relative;
}

foreach ([__DIR__, dirname(__DIR__)] as $root) {
    for ($i = 0; $i < count($segments); $i++) {
        $candidates[] = $root . '/' . implode('/', array_slice($segments, $i));
    }
}

$candidates[] = rtrim($UPLOAD_DIR, '/') . '/' . end($segments);

$candidates = array_values(array_unique($candidates));

function is_inside_allowed($path, $bases)
{
    foreach ($bases as $base) {
        if ($path === $base || strpos($path, $base . DIRECTORY_SEPARATOR) === 0) {
            return true;
        }
    }
    return false;
}

$fullPath = false;

foreach ($candidates as $candidate) {
    $real = realpath($candidate);

    if ($real === false || !is_file($real)) {
        continue;
    }

    if (!is_inside_allowed($real, $ALLOWED_BASES)) {
        continue;
    }

    $ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));

    if (in_array($ext, $BLOCKED_EXTENSIONS, true) || basename($real)[0] === '.') {
        continue;
    }

    $fullPath = $real;
    break;
}

/* ---------------------------------------------------------
   DEBUG (remove ?debug=1 usage once downloads work)
--------------------------------------------------------- */
if (!empty($_GET['debug'])) {
    header('Content-Type: application/json');
    echo json_encode([
        'received_path' => $rawPath,
        'found'         => $fullPath,
        'tried'         => $candidates,
        'allowed_bases' => array_values($ALLOWED_BASES),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($fullPath === false) {
    http_response_code(404);
    exit('File not found.');
}

/* ---------------------------------------------------------
   SEND WITH ORIGINAL NAME
--------------------------------------------------------- */
$originalName = isset($_GET['name']) ? (string) $_GET['name'] : basename($fullPath);
$originalName = basename(str_replace(["\r", "\n", "\0", '"', '\\'], '', $originalName));

if ($originalName === '') {
    $originalName = basename($fullPath);
}

$asciiName = preg_replace('/[^\x20-\x7E]/', '_', $originalName);

$mime = 'application/octet-stream';

if (function_exists('finfo_open')) {
    $finfo    = finfo_open(FILEINFO_MIME_TYPE);
    $detected = finfo_file($finfo, $fullPath);
    finfo_close($finfo);

    if ($detected) {
        $mime = $detected;
    }
}

$disposition = !empty($_GET['download']) ? 'attachment' : 'inline';

while (ob_get_level()) {
    ob_end_clean();
}

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($fullPath));
header(
    'Content-Disposition: ' . $disposition .
    '; filename="' . $asciiName . '"' .
    "; filename*=UTF-8''" . rawurlencode($originalName)
);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=3600');

readfile($fullPath);
exit;
