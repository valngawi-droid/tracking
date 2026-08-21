<?php
/**
 * Router untuk PHP built-in server.
 *
 * Jalankan dari root proyek:
 *     php -S 0.0.0.0:8080 -t frontend frontend/router.php
 *
 * Semua request ke /api/* diteruskan ke backend Python lewat api.php,
 * sedangkan file lain (index.php, assets/*) dilayani seperti biasa.
 */

$path = isset($_SERVER['REQUEST_URI']) ? parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) : '/';

// strpos agar kompatibel dengan PHP 7.x (str_starts_with butuh PHP 8+).
if ($path === '/api' || strpos($path, '/api/') === 0) {
    require __DIR__ . '/api.php';
    return true; // sudah ditangani
}

return false; // biarkan built-in server melayani file statis
