# 🖐️ Hand Tracking — MediaPipe (bisa jalan di HP / Termux)

Aplikasi **deteksi & pelacakan tangan** (21 titik landmark, kerangka berwarna,
jumlah jari, gestur) dengan [MediaPipe](https://developers.google.com/mediapipe).

Proyek ini menyediakan **dua versi** agar bisa dipakai **tanpa laptop/PC**:

| Versi | Cocok untuk | Cara jalan |
|-------|-------------|------------|
| 📱 **`mobile/`** — MediaPipe JavaScript (WASM) | **HP Android via Termux** (atau browser apa pun) | Server lokal PHP di Termux → buka `http://localhost:8080` di Chrome |
| 💻 **`frontend/` + `backend/`** — Python (Flask+MediaPipe) + PHP | Komputer/PC dengan webcam | `python backend/app.py` + `php -S ...` |

> **Kenapa versi HP pakai JavaScript?** Paket Python `mediapipe` hanya tersedia
> untuk komputer (Windows/Linux glibc), **tidak bisa diinstal di Termux/Android**.
> Solusi standarnya: jalankan **MediaPipe versi JavaScript/WASM** — model & hasilnya
> **identik** (21 landmark + kerangka yang sama), tapi berjalan langsung di browser HP.
> File model (`hand_landmarker.task`) & runtime WASM-nya sudah disertakan di repo,
> jadi tidak perlu unduh apa pun lagi.

---

## 📱 Cara pakai di HP (Termux, tanpa PC)

Yang dibutuhkan hanya **Termux** (disarankan dari [F-Droid](https://f-droid.org/packages/com.termux/))
dan **Chrome**.

```bash
# 1) Install Termux, buka, lalu jalankan:
pkg update
pkg install git

# 2) Clone repo ini (perhatikan nama branch-nya!)
git clone -b arena/01a022b0-tracking https://github.com/valngawi-droid/tracking.git
cd tracking

# 3) Setup & jalankan (otomatis install PHP + start server)
bash termux-setup.sh
```

Lalu **buka Chrome** di HP, ketik:

```
http://localhost:8080
```

Izinkan akses kamera → tunjukkan tangan ke kamera → kerangka tangan berwarna
langsung muncul. Selesai. 🎉

Perintah berguna:

| Perintah | Fungsi |
|----------|--------|
| `bash termux-setup.sh` | Install PHP + jalankan server (sekali saja) |
| `bash termux-run.sh`   | Jalankan ulang server (untuk pemakaian berikutnya) |
| `CTRL+C`               | Hentikan server |

### Fitur versi HP

- Kamera **depan/belakang** (tombol 🔄) + mode cermin otomatis (default mati).
- Kerangka tangan **berwarna per jari** + titik kuning di ujung jempol & telunjuk.
- Deteksi **2 tangan**, handedness (Kiri/Kanan), jumlah jari & gestur
  (👍 Jempol, ✌️ Victory, ✊ Kepalan, 🖐️ Terbuka, 👌 OK, dll.).
- **🟣 Portal Filter** (seperti referensi *Retrolens*): 2 tangan = 4 titik
  (jempol & telunjuk tiap tangan) membentuk portal berisi filter —
  Mono, Dual-Tone, Pixelate, Invert, Sepia, Blur, Thermal, Sketch, Glitch,
  Neon, Galaxy.
- **Ganti filter** lewat gestur: dekatkan ujung telunjuk kedua tangan, atau
  cubit jempol + kelingking (1 tangan). Ada juga tombol 🎨 sebagai cadangan.
- **🧪 Uji Gambar** — tes deteksi tanpa kamera (pakai gambar demo).
- **📸 Simpan Foto** — unduh hasil tangkapan + overlay.

### Catatan performa (jujur soal "fps")

- Kameranya berjalan di **refresh rate layar** (60–120 Hz), dan overlay
  di-**interpolasi** antar-deteksi sehingga gerakan tangan terlihat **mulus**.
- Deteksi MediaPipe-nya sendiri ±30 frame/detik — terbatas kamera HP & model.
  Di HP mana pun, angka "120 fps" untuk deteksi model **tidak realistis**;
  yang realistis dan kami capai adalah **tampilan yang mulus** di layar
  (render di refresh rate penuh, deteksi mengikuti laju kamera).

> **Tips:** saat pertama kali, tekan **🧪 Uji Gambar** dulu untuk memastikan model
> termuat dengan benar sebelum mengizinkan kamera.

---

## 💻 Cara pakai di PC (Python + PHP)

### 1. Backend Python (Flask + MediaPipe)

Butuh **Python 3.9+**:

```bash
# dari root proyek
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

python backend/app.py                # default http://0.0.0.0:8000
```

> **Linux**: kalau muncul `libGL.so.1: cannot open shared object file`:
> `sudo apt-get install -y libgl1 libglib2.0-0`

Cek: <http://127.0.0.1:8000/api/health> → `{"status":"ok", ...}`.

### 2. Frontend PHP

Butuh **PHP 7.4+**:

```bash
php -S 0.0.0.0:8080 -t frontend frontend/router.php
```

Buka <http://localhost:8080>, izinkan kamera. PHP akan meneruskan request
`/api/*` ke backend Python (jembatan `frontend/api.php`).

### 3. Tanpa PHP (uji cepat)

```bash
python backend/app.py          # backend juga bisa menyajikan halaman frontend
# buka http://localhost:8000
```

---

## 📁 Struktur Proyek

```
tracking/
├── mobile/                   # 📱 Versi HP (MediaPipe JS, self-contained)
│   ├── index.html            # Halaman utama (kamera + overlay)
│   ├── app.js                # Logika kamera, deteksi, gambar kerangka
│   ├── style.css
│   ├── serve.php             # Router MIME untuk php -S (opsional)
│   ├── serve.py              # Server statis alternatif (tanpa PHP)
│   ├── sample.jpg            # Gambar demo (uji tanpa kamera)
│   ├── hand_landmarker.task  # Model MediaPipe (bundled)
│   └── mediapipe/
│       ├── vision.js         # Runtime MediaPipe Tasks (ESM)
│       └── wasm/             # vision_wasm_*.js / *.wasm (bundled)
│
├── backend/                  # 💻 Python: Flask + MediaPipe Hands
│   ├── app.py                # API: /api/health, /api/track
│   ├── hand_tracker.py       # Deteksi landmark + handedness
│   ├── gesture.py            # Logika jari & gestur
│   ├── track_image.py        # CLI deteksi gambar → JSON
│   └── requirements.txt
│
├── frontend/                 # 💻 PHP: halaman kamera + bridge ke Python
│   ├── index.php
│   ├── api.php               # Proxy /api/* → Python
│   ├── router.php
│   └── assets/ (app.js, style.css, sample.jpg)
│
├── termux-setup.sh           # Setup + jalankan di Termux
├── termux-run.sh             # Jalankan ulang server di Termux
└── README.md
```

---

## 🔌 API versi PC (Python)

- `GET /api/health` → status backend.
- `POST /api/track` → body `{"image": "<base64 jpeg>"}` → hasil deteksi:

```json
{
  "hands": [{
    "handedness": "Kiri",
    "score": 0.98,
    "landmarks": [ { "x": 0.47, "y": 0.86, "z": 0.0 }, "…21 titik" ],
    "fingers": { "jempol": true, "telunjuk": true, "tengah": true, "manis": true, "kelingking": true },
    "gesture": { "name": "Lima / Terbuka", "emoji": "🖐️", "count": 5 }
  }],
  "elapsed_ms": 27.7,
  "width": 640, "height": 480
}
```

CLI tanpa server:

```bash
python backend/track_image.py gambar.jpg --pretty
```

---

## 🛠️ Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Kamera tidak muncul di Chrome HP | Akses **http://localhost:8080** (bukan 0.0.0.0); izinkan kamera |
| Model tidak termuat (spinner terus) | Cek file `hand_landmarker.task` & `mediapipe/` ada; coba refresh |
| `libGL.so.1 ...` (PC/Linux) | `sudo apt-get install -y libgl1 libglib2.0-0` |
| `module 'mediapipe' has no attribute 'solutions'` | Pakai `mediapipe==0.10.21` (v1.x pakai Tasks API) |
| Termux: `php: command not found` | `pkg install php` dulu |
| Termux: server konflik port | Ubah port di `termux-run.sh` (mis. `8081`) |

---

## 📄 Lisensi & kredit

Proyek edukasi. Model `hand_landmarker.task` adalah aset resmi **MediaPipe** (Google),
runtime JavaScript dari paket npm `@mediapipe/tasks-vision`. Gambar `sample.jpg`
berasal dari pencarian gambar publik dan hanya dipakai sebagai demo.
