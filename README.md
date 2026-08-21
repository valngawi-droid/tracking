# 🖐️ Hand Tracking — MediaPipe (Python + PHP)

Aplikasi web untuk **mendeteksi & melacak tangan** secara real-time menggunakan
[MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker).

Stack yang dipakai:

| Lapisan  | Teknologi | Peran |
|----------|-----------|-------|
| Backend  | **Python** (Flask + MediaPipe) | Deteksi 21 titik landmark tangan, handedness (kiri/kanan), dan pengenalan gestur |
| Frontend | **PHP** (+ HTML/JS/CSS) | Menyajikan halaman kamera & menjadi *bridge* (`/api/*` → Python) |

```
Browser ──▶ PHP (index.php, api.php) ──▶ Python (Flask + MediaPipe Hands)
                 ▲                                  │
                 └────────── JSON hasil ────────────┘
```

---

## ✨ Fitur

- Deteksi **hingga 2 tangan** sekaligus (21 landmark per tangan).
- **Handedness**: menebak tangan kiri/kanan + skor keyakinan.
- **Pengenalan gestur sederhana** (jumlah jari terangkat): 👍 Jempol, ☝️ Satu,
  ✌️ Dua/Victory, 🤟 Tiga, ✊ Kepalan, 🖐️ Tangan terbuka, 👌 OK/Jepit.
- Overlay **kerangka tangan** langsung di atas video/gambar.
- Sumber input: **webcam**, **unggah gambar**, atau **gambar demo** bawaan.
- Tampilan data mentah (JSON) di panel samping.

## 📁 Struktur Proyek

```
tracking/
├── backend/                 # Bagian Python
│   ├── app.py               # API Flask (endpoint /api/health, /api/track)
│   ├── hand_tracker.py      # Deteksi tangan dengan MediaPipe
│   ├── gesture.py           # Logika jari terangkat & pengenalan gestur
│   ├── track_image.py       # CLI: deteksi tangan dari file gambar → JSON
│   └── requirements.txt
├── frontend/                # Bagian PHP
│   ├── index.php            # Halaman utama (webcam + overlay)
│   ├── api.php              # Bridge PHP → Python (proxy /api/*)
│   ├── router.php           # Router untuk `php -S`
│   └── assets/
│       ├── app.js           # Logika frontend (kamera, overlay, fetch)
│       ├── style.css
│       └── sample.jpg       # Gambar demo
└── README.md
```

---

## 🚀 Cara Menjalankan

### 1. Backend Python

Butuh **Python 3.9+**. Jalankan di folder `backend/` (atau dari root):

```bash
# dari root proyek
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

python backend/app.py                # default http://0.0.0.0:8000
```

> **Catatan untuk Linux**: MediaPipe/OpenCV membutuhkan `libGL`. Jika muncul
> error `libGL.so.1: cannot open shared object file`, pasang:
> ```bash
> sudo apt-get install -y libgl1 libglib2.0-0
> ```
> Gunakan `opencv-python-headless` (sudah ada di `requirements.txt`) agar tidak
> memerlukan tampilan GUI.

Cek backend: buka <http://127.0.0.1:8000/api/health> → balasan JSON `{"status":"ok", ...}`.

### 2. Frontend PHP

Butuh **PHP 7.4+** (ekstensi `curl` disarankan, kalau tidak ada otomatis pakai
`file_get_contents`). Dari root proyek:

```bash
php -S 0.0.0.0:8080 -t frontend frontend/router.php
```

Buka <http://localhost:8080>, izinkan akses kamera, lalu mainkan.

> **Alternatif (XAMPP / LAMP)**: salin isi folder `frontend/` ke `htdocs` (atau
> `www`), pastikan `PYTHON_API_URL` menunjuk ke backend Python (misal
> `http://127.0.0.1:8000`). Anda bisa mengaturnya lewat environment variable
> atau langsung di bagian atas `frontend/api.php`.

### 3. Mode cepat tanpa PHP (opsional)

Backend Flask juga bisa menyajikan halaman frontend-nya sendiri, berguna untuk
pengujian cepat:

```bash
python backend/app.py          # lalu buka http://localhost:8000
```

Di mode ini `/api/*` langsung ditangani Flask (tanpa melewati PHP).

---

## 🔌 API

### `GET /api/health`

```json
{ "status": "ok", "python": "3.11.2", "mediapipe": "0.10.21", "model": "MediaPipe Hands" }
```

### `POST /api/track`

Body JSON berisi gambar dalam bentuk base64 (boleh dengan prefix
`data:image/jpeg;base64,`):

```json
{ "image": "<base64 jpeg>" }
```

Respon:

```json
{
  "hands": [
    {
      "handedness": "Kiri",
      "handedness_raw": "Left",
      "score": 0.98,
      "landmarks": [ { "x": 0.47, "y": 0.86, "z": 0.0 }, "… 21 titik" ],
      "fingers": { "jempol": true, "telunjuk": true, "tengah": true, "manis": true, "kelingking": true },
      "gesture": { "name": "Lima / Terbuka", "emoji": "🖐️", "count": 5, "fingers_up": ["jempol", "telunjuk", "tengah", "manis", "kelingking"] }
    }
  ],
  "elapsed_ms": 27.7,
  "width": 640,
  "height": 480
}
```

### CLI (tanpa server)

```bash
python backend/track_image.py gambar.jpg --pretty
```

---

## 🗂️ Catatan Gestur

Deteksi jari "terangkat" memakai **perbandingan jarak** antar-landmark (bukan
koordinat mentah) sehingga relatif tahan terhadap rotasi tangan. Nilai ambangnya
ada di `backend/gesture.py` dan bisa disetel sesuai kebutuhan.

---

## 🛠️ Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `libGL.so.1: cannot open shared object file` | `sudo apt-get install -y libgl1 libglib2.0-0` |
| `module 'mediapipe' has no attribute 'solutions'` | Gunakan `mediapipe<1.0` (mis. `mediapipe==0.10.21`), karena v1.x memakai Tasks API |
| Kamera tidak muncul di browser | Pastikan halaman diakses via `http://localhost`/HTTPS, dan izinkan kamera di browser |
| `Backend Python tidak dapat dihubungi` | Pastikan `python backend/app.py` berjalan di port 8000, atau set `PYTHON_API_URL` |
| `allow_url_fopen = Off` | Aktifkan ekstensi `curl` di `php.ini`, atau set `allow_url_fopen = On` |

---

## 📄 Lisensi

Contoh untuk keperluan edukasi. Gambar `frontend/assets/sample.jpg` berasal dari
pencarian gambar publik (Dreamstime) dan hanya dipakai sebagai demo.
