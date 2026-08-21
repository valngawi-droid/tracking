<?php
/**
 * Jembatan (bridge) PHP → Python.
 *
 * Meneruskan semua request /api/* ke backend Python (Flask + MediaPipe),
 * lalu mengembalikan hasilnya apa adanya (JSON). Dengan begini browser hanya
 * perlu berbicara ke server PHP (same-origin), dan PHP-lah yang memanggil
 * backend Python secara internal — inilah peran PHP dalam stack ini.
 *
 * URL backend dapat diubah lewat environment variable PYTHON_API_URL,
 * default: http://127.0.0.1:8000
 */

$python_api = getenv('PYTHON_API_URL') ?: 'http://127.0.0.1:8000';

$path   = isset($_SERVER['REQUEST_URI']) ? parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) : '/';
$target = rtrim($python_api, '/') . $path;
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$body   = file_get_contents('php://input');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Expose-Headers: X-Bridge');
header('X-Bridge: PHP'); // penanda bahwa request melewati PHP

// Tangani preflight CORS.
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$response = http_request($target, $method, $body);

if ($response === null) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode([
        'error'  => 'Backend Python tidak dapat dihubungi',
        'target' => $target,
    ]);
    exit;
}

http_response_code($response['status']);
header('Content-Type: application/json');
echo $response['body'];


/**
 * Kirim request HTTP dan kembalikan ['status' => int, 'body' => string].
 * Memakai ekstensi cURL bila tersedia, jika tidak pakai stream context.
 */
function http_request($url, $method, $body)
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT        => 30,
        ]);
        $result = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($result === false) {
            return null;
        }
        return ['status' => $status, 'body' => $result];
    }

    // Fallback: HTTP stream wrapper (butuh allow_url_fopen = On).
    $options = [
        'http' => [
            'method'        => $method,
            'header'        => "Content-Type: application/json\r\nAccept: application/json\r\n",
            'content'       => $body,
            'ignore_errors' => true,
            'timeout'       => 30,
        ],
    ];
    $context  = stream_context_create($options);
    $result   = @file_get_contents($url, false, $context);
    if ($result === false) {
        return null;
    }

    $status = 502;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int) $m[1];
                break;
            }
        }
    }
    return ['status' => $status, 'body' => $result];
}
