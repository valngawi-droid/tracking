"""API backend hand tracking (Flask + MediaPipe Hands).

Endpoint:
    GET  /api/health   -> status backend
    POST /api/track    -> body JSON {"image": "<base64 jpeg>"} -> hasil deteksi

Selain API, aplikasi ini juga bisa menyajikan folder `frontend/` (halaman
kamera) supaya mudah diuji tanpa PHP. Pada deployment normal, halaman
disajikan oleh PHP (lihat `frontend/`), sedangkan backend ini cukup
menyediakan API.

Jalankan:
    python app.py          # default di http://0.0.0.0:8000
"""

import os
import platform

from flask import Flask, Response, jsonify, request, send_from_directory

import mediapipe as mp

from hand_tracker import decode_image, detect

app = Flask(__name__)

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "python": platform.python_version(),
            "mediapipe": getattr(mp, "__version__", "unknown"),
            "model": "MediaPipe Hands",
        }
    )


@app.post("/api/track")
def track():
    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image") or data.get("frame")
    if not image_b64:
        return jsonify({"error": "field 'image' (base64) wajib diisi"}), 400

    frame = decode_image(image_b64)
    if frame is None:
        return jsonify({"error": "gagal decode gambar"}), 400

    result = detect(frame)
    return jsonify(result)


@app.after_request
def add_cors_headers(response):
    # Berguna bila frontend diakses dari origin berbeda (mis. dibuka langsung).
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Expose-Headers"] = "X-Bridge"
    response.headers["X-Bridge"] = "Flask"
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def api_options(_path):
    return ("", 204)


# --------------------------------------------------------------------------- #
# Penyajian frontend (opsional, untuk mode tanpa PHP)
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    index_file = os.path.join(FRONTEND_DIR, "index.php")
    with open(index_file, encoding="utf-8") as f:
        return Response(f.read(), mimetype="text/html")


@app.get("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, "assets"), filename)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"* Backend hand tracking aktif di http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
