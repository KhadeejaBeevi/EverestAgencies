<?php
require_once __DIR__ . '/api_auth.php';
function strv($val) {
    return isset($val) ? trim((string)$val) : '';
}

function safeDecimal($val) {
    return is_numeric((string)$val) ? (float)$val : 0.0;
}
