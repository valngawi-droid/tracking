#!/usr/bin/env bash
# =============================================================================
# Hand Tracking (MediaPipe) — Setup & jalankan di TERMUX (Android, tanpa PC)
#
# Cara pakai (di Termux):
#   1. Install Termux (disarankan dari F-Droid).
#   2. Clone repo ini (perhatikan nama branch-nya!):
#        pkg install git
#        git clone -b arena/01a022b0-tracking https://github.com/valngawi-droid/tracking.git
#        cd tracking
#   3. Jalankan:
#        bash termux-setup.sh
#   4. Buka Chrome di HP, akses:  http://localhost:8080
#
# Aplikasi berjalan 100% di browser HP (MediaPipe JavaScript/WASM),
# server lokalnya memakai PHP dari Termux. Tidak butuh laptop/PC.
# =============================================================================

set -e

echo ""
echo "=============================================="
echo "  Hand Tracking (MediaPipe) — Setup Termux"
echo "=============================================="
echo ""

if ! command -v pkg >/dev/null 2>&1; then
  echo "!! Jalankan script ini di dalam Termux (Android)."
  echo "   Di PC/Linux, silakan lihat README untuk cara lain."
  exit 1
fi

echo "[1/3] Update daftar paket Termux..."
pkg update -y
pkg upgrade -y || true

echo "[2/3] Install PHP (server lokal)..."
pkg install -y php

echo "[3/3] Selesai menyiapkan."
echo ""
echo "----------------------------------------------"
echo "  Server berjalan di:  http://localhost:8080"
echo "  Buka Chrome, ketik alamat itu, izinkan kamera."
echo "  Tekan CTRL+C untuk berhenti."
echo "----------------------------------------------"
echo ""

php -S 0.0.0.0:8080 -t mobile mobile/serve.php
