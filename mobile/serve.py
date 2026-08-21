#!/usr/bin/env python3
"""Server statis sederhana untuk aplikasi mobile/ (alternatif tanpa PHP).

Jalankan:
    python3 mobile/serve.py            # default http://0.0.0.0:8080

Berguna untuk mencoba di komputer atau bila PHP tidak tersedia.
Di HP/Android, cara yang disarankan tetap lewat Termux + PHP (lihat README).
"""

import os
import socketserver
from http.server import SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", "8080"))
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)


class Handler(SimpleHTTPRequestHandler):
    # Pastikan MIME type benar untuk modul JS, WASM, dan model .task.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
        ".tflite": "application/octet-stream",
    }

    def log_message(self, fmt, *args):
        print("[serve]", self.address_string(), fmt % args)


with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"* Aplikasi mobile aktif di http://localhost:{PORT}")
    print("  Buka URL tersebut di browser (Chrome) lalu izinkan kamera.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n* Berhenti.")
