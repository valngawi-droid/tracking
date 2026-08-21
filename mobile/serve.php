<?php
/**
 * Router untuk PHP built-in server — dioptimalkan agar cepat di HP:
 *   - MIME type benar (JS/WASM/model .task)
 *   - GZIP on-the-fly untuk aset besar (WASM 12MB, model 8MB) → unduhan
 *     jauh lebih kecil & cepat
 *   - Cache-Control: WASM & model di-cache browser → buka ulang jadi instan
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
    return false; // biarkan built-in server menangani (mis. index.html / 404)
}

$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));

$mimes = [
    'html'  => 'text/html; charset=utf-8',
    'js'    => 'text/javascript',
    'mjs'   => 'text/javascript',
    'css'   => 'text/css',
    'wasm'  => 'application/wasm',
    'task'  => 'application/octet-stream',
    'tflite'=> 'application/octet-stream',
    'json'  => 'application/json',
    'jpg'   => 'image/jpeg',
    'jpeg'  => 'image/jpeg',
    'png'   => 'image/png',
    'svg'   => 'image/svg+xml',
];

if (!isset($mimes[$ext])) {
    return false; // biarkan built-in server melayani tipe lain
}

header('Content-Type: ' . $mimes[$ext]);

// Cache: aset besar bersifat statis → cache lama. HTML selalu revalidasi.
if ($ext === 'html') {
    header('Cache-Control: no-cache');
} elseif (in_array($ext, ['wasm', 'task', 'tflite'], true)) {
    header('Cache-Control: public, max-age=604800, immutable');
} else {
    header('Cache-Control: public, max-age=3600');
}

$data = file_get_contents($file);

// GZIP bila didukung & tipe-nya terkompresi baik.
$compressible = ['js', 'mjs', 'css', 'html', 'json', 'wasm', 'task', 'tflite', 'svg'];
$accept = isset($_SERVER['HTTP_ACCEPT_ENCODING']) ? $_SERVER['HTTP_ACCEPT_ENCODING'] : '';

if (in_array($ext, $compressible, true)
    && function_exists('gzencode')
    && stripos($accept, 'gzip') !== false) {
    header('Content-Encoding: gzip');
    header('Vary: Accept-Encoding');
    echo gzencode($data, 6);
    return true;
}

echo $data;
return true;
