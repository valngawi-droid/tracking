<?php
/**
 * Router opsional untuk PHP built-in server (memastikan MIME type benar
 * untuk file WASM / model / JavaScript). File lain dilayani PHP seperti biasa.
 *
 * Jalankan dari root proyek:
 *     php -S 0.0.0.0:8080 -t mobile mobile/serve.php
 */

$path = isset($_SERVER['REQUEST_URI']) ? parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) : '/';

// Amankan dari path traversal.
if (strpos($path, '..') !== false) {
    http_response_code(400);
    exit;
}

$file = __DIR__ . '/' . ltrim($path, '/');
if (!is_file($file)) {
    return false; // biarkan built-in server menangani (mis. 404)
}

$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));

$mimes = [
    'html' => 'text/html; charset=utf-8',
    'js'   => 'text/javascript',
    'mjs'  => 'text/javascript',
    'css'  => 'text/css',
    'wasm' => 'application/wasm',
    'task' => 'application/octet-stream',
    'tflite' => 'application/octet-stream',
    'json' => 'application/json',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png'  => 'image/png',
    'svg'  => 'image/svg+xml',
];

if (isset($mimes[$ext])) {
    header('Content-Type: ' . $mimes[$ext]);
    readfile($file);
    return true; // sudah ditangani
}

return false; // biarkan built-in server melayani tipe lain
