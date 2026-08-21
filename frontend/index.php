<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hand Tracking — MediaPipe (Python + PHP)</title>
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body>
  <header>
    <h1>🖐️ Hand Tracking <span>MediaPipe</span></h1>
    <p class="sub">Python (deteksi tangan) &nbsp;↔&nbsp; PHP (frontend &amp; jembatan API)</p>
  </header>

  <main>
    <section class="stage">
      <div class="video-wrap">
        <video id="video" autoplay playsinline muted></video>
        <canvas id="canvas" width="640" height="480"></canvas>
        <div id="overlay-hint" class="hint">Nyalakan kamera, unggah gambar, atau tekan <b>Demo</b>.</div>
      </div>

      <div class="toolbar">
        <button id="btn-start">▶ Mulai Kamera</button>
        <button id="btn-stop" disabled>■ Hentikan</button>
        <button id="btn-demo">✨ Demo Gambar</button>
        <label class="btn btn-file">📁 Unggah Gambar
          <input id="file" type="file" accept="image/*" hidden />
        </label>
      </div>

      <div class="switches">
        <label class="switch"><input id="mirror" type="checkbox" checked /> Mode cermin</label>
        <label class="switch"><input id="draw-skeleton" type="checkbox" checked /> Tampilkan kerangka</label>
      </div>

      <div class="status">
        <span id="status">Memeriksa backend…</span>
        <span id="fps">FPS: —</span>
        <span id="latency">Latensi: —</span>
      </div>
    </section>

    <aside class="panel">
      <h2>Hasil Deteksi</h2>
      <div id="hands"></div>
      <p id="empty" class="empty">Belum ada tangan terdeteksi.</p>

      <h2>Data Mentah (JSON)</h2>
      <pre id="raw">—</pre>
    </aside>
  </main>

  <footer>
    Backend <b>Python</b> (Flask + MediaPipe Hands) &nbsp;•&nbsp; Frontend <b>PHP</b> (jembatan <code>/api/*</code> → Python)
  </footer>

  <script src="assets/app.js"></script>
</body>
</html>
