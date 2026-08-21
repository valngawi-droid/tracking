#!/usr/bin/env python3
"""Server statis untuk aplikasi mobile/ (alternatif tanpa PHP) — dengan
gzip + cache agar cepat seperti serve.php.

Jalankan:
    python3 mobile/serve.py            # default http://0.0.0.0:8080

Di HP/Android, cara yang disarankan tetap lewat Termux + PHP (lihat README).
"""

import gzip
import io
import os
import socketserver
from http.server import SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", "8080"))
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

_COMPRESSIBLE = {"js", "mjs", "css", "html", "json", "wasm", "task", "tflite", "svg"}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
        ".tflite": "application/octet-stream",
    }

    def end_headers(self):
        p = self.path.split("?", 1)[0]
        ext = os.path.splitext(p)[1].lstrip(".").lower()
        if p.endswith("/") or ext == "" or ext == "html":
            self.send_header("Cache-Control", "no-cache")
        elif ext in ("wasm", "task", "tflite"):
            self.send_header("Cache-Control", "public, max-age=604800, immutable")
        else:
            self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[serve]", self.address_string(), fmt % args)

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()

        ext = os.path.splitext(path)[1].lstrip(".").lower()
        accept = self.headers.get("Accept-Encoding", "")
        if ext in _COMPRESSIBLE and "gzip" in accept.lower():
            raw = open(path, "rb").read()
            body = gzip.compress(raw, 6)
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return io.BytesIO(body)

        return super().send_head()


class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


with ThreadingServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"* Aplikasi mobile aktif di http://localhost:{PORT}")
    print("  Buka URL tersebut di browser (Chrome) lalu izinkan kamera.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n* Berhenti.")
