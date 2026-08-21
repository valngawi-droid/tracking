#!/usr/bin/env bash
# Jalankan ulang server (setelah PHP terpasang lewat termux-setup.sh).
cd "$(dirname "$0")"
echo "Server: http://localhost:8080  (CTRL+C untuk berhenti)"
php -S 0.0.0.0:8080 -t mobile mobile/serve.php
