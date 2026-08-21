'use strict';

/* =========================================================================
 * Hand Tracking — logika frontend (webcam / gambar → backend → overlay)
 * Komunikasi dilakukan ke endpoint relatif `/api/*` sehingga bekerja baik
 * saat halaman disajikan oleh PHP (lewat api.php) maupun langsung oleh
 * backend Python (Flask).
 * ========================================================================= */

const video     = document.getElementById('video');
const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d');
const hint      = document.getElementById('overlay-hint');
const handsEl   = document.getElementById('hands');
const emptyEl   = document.getElementById('empty');
const rawEl     = document.getElementById('raw');
const statusEl  = document.getElementById('status');
const fpsEl     = document.getElementById('fps');
const latencyEl = document.getElementById('latency');

const btnStart   = document.getElementById('btn-start');
const btnStop    = document.getElementById('btn-stop');
const btnDemo    = document.getElementById('btn-demo');
const fileEl     = document.getElementById('file');
const mirrorEl   = document.getElementById('mirror');
const skeletonEl = document.getElementById('draw-skeleton');

const W = canvas.width;   // 640
const H = canvas.height;  // 480

// Kerangka tangan (sama dengan MediaPipe HAND_CONNECTIONS), dikelompokkan
// per jari agar tiap jari bisa diberi warna berbeda — garis "garis-garis"
// di tangan jadi jelas terlihat seperti contoh hand-tracking pada umumnya.
const HAND_PARTS = [
  { color: '#22c55e', bones: [[0, 1], [1, 2], [2, 3], [3, 4]] },            // jempol  (hijau)
  { color: '#00e5ff', bones: [[0, 5], [5, 6], [6, 7], [7, 8]] },            // telunjuk (cyan)
  { color: '#fbbf24', bones: [[5, 9], [9, 10], [10, 11], [11, 12]] },       // tengah  (kuning)
  { color: '#fb923c', bones: [[9, 13], [13, 14], [14, 15], [15, 16]] },     // manis   (oranye)
  { color: '#c084fc', bones: [[13, 17], [17, 18], [18, 19], [19, 20]] },    // kelingking (ungu)
  { color: '#ffffff', bones: [[0, 17]] },                                    // telapak (putih)
];

const FINGER_TIPS = { jempol: 4, telunjuk: 8, tengah: 12, manis: 16, kelingking: 20 };

const TRACK_INTERVAL = 90; // ms antar frame yang dikirim (~11 fps)

let stream = null;
let running = false;
let inFlight = false;
let lastTrack = 0;
let rafId = null;
let trackResult = null;   // hasil terakhir dari backend

let fpsFrames = 0;
let fpsLast = performance.now();

/* ------------------------------- utilitas ------------------------------- */

function setStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok === false ? 'err' : 'ok';
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const json = await res.json();
    const bridge = res.headers.get('X-Bridge') || 'Flask';
    setStatus(
      `Backend ${json.status || '?'} · Python ${json.python} · MediaPipe ${json.mediapipe} · via ${bridge}`,
      true
    );
  } catch (e) {
    setStatus('Backend tidak dapat dihubungi — pastikan Python (app.py) berjalan', false);
  }
}

function fitDraw(img) {
  // Gambar diletakkan ke canvas 640x480 secara proporsional (letterbox).
  const ratio = Math.min(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * ratio;
  const h = img.naturalHeight * ratio;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

/* ------------------------------ kamera ------------------------------ */

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    hint.style.display = 'none';
    btnStart.disabled = true;
    btnStop.disabled = false;
    setStatus('Kamera aktif — streaming frame ke backend', true);
    loop();
  } catch (e) {
    setStatus('Kamera tidak tersedia: ' + e.message, false);
    hint.innerHTML = 'Kamera tidak tersedia. Gunakan <b>Unggah Gambar</b> atau <b>Demo</b>.';
    hint.style.display = 'block';
  }
}

function stopCamera() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  video.srcObject = null;
  btnStart.disabled = false;
  btnStop.disabled = true;
}

/* ---------------------------- loop & render ---------------------------- */

function loop() {
  if (!running) return;

  if (video.readyState >= 2) {
    ctx.save();
    if (mirrorEl.checked) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();
  }
  drawOverlay();

  const now = performance.now();
  fpsFrames++;
  if (now - fpsLast >= 1000) {
    fpsEl.textContent = 'FPS: ' + fpsFrames;
    fpsFrames = 0;
    fpsLast = now;
  }
  if (now - lastTrack >= TRACK_INTERVAL && !inFlight) {
    lastTrack = now;
    trackFrame();
  }
  rafId = requestAnimationFrame(loop);
}

function drawOverlay() {
  if (!trackResult || !trackResult.hands) return;
  for (const hand of trackResult.hands) drawHand(hand);
}

function drawHand(hand) {
  const lm = hand.landmarks;
  if (!lm || lm.length < 21) return;
  const fingers = hand.fingers || {};

  if (skeletonEl.checked) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const part of HAND_PARTS) {
      ctx.strokeStyle = part.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (const [a, b] of part.bones) {
        ctx.moveTo(lm[a].x * W, lm[a].y * H);
        ctx.lineTo(lm[b].x * W, lm[b].y * H);
      }
      ctx.stroke();
    }
  }

  // Titik landmark: sendi putih, ujung jari lebih besar & berwarna
  // (hijau = terangkat, merah = terlipat) — seperti penanda di contoh referensi.
  lm.forEach((p, i) => {
    const name = Object.keys(FINGER_TIPS).find(k => FINGER_TIPS[k] === i);
    const isTip = Boolean(name);
    const up = name ? fingers[name] : true;
    const r = isTip ? 7 : 4;
    ctx.beginPath();
    ctx.fillStyle = isTip ? (up ? '#22c55e' : '#ef4444') : '#ffffff';
    ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.stroke();
  });

  // Label gestur di dekat pergelangan tangan.
  const g = hand.gesture || {};
  const wx = lm[0].x * W;
  const wy = lm[0].y * H;
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const label = `${hand.handedness} · ${g.name || ''} ${g.emoji || ''}`;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(wx - tw / 2 - 8, wy - 34, tw + 16, 24);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, wx, wy - 16);
}

/* ---------------------------- komunikasi ---------------------------- */

async function trackFrame() {
  if (inFlight) return;
  inFlight = true;
  const t0 = performance.now();
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    const json = await res.json();
    const total = performance.now() - t0;
    if (json && Array.isArray(json.hands)) {
      trackResult = json;
      latencyEl.textContent =
        'Latensi: ' + (json.elapsed_ms || 0) + ' ms (AI) · ' + total.toFixed(0) + ' ms (total)';
      renderHands(json.hands);
      drawOverlay(); // penting: tampilkan kerangka juga pada gambar statis (Demo/Unggah)
    }
  } catch (e) {
    setStatus('Gagal terhubung ke backend: ' + e.message, false);
  } finally {
    inFlight = false;
  }
}

function renderHands(hands) {
  if (!hands.length) {
    emptyEl.style.display = 'block';
    handsEl.innerHTML = '';
    rawEl.textContent = '(tidak ada tangan)';
    return;
  }
  emptyEl.style.display = 'none';
  handsEl.innerHTML = hands.map(h => {
    const g = h.gesture || {};
    const fingers = h.fingers || {};
    const list = Object.entries(fingers)
      .map(([k, v]) => `<span class="finger ${v ? 'up' : 'down'}">${v ? '▲' : '▼'} ${k}</span>`)
      .join('');
    return `<div class="hand-card">
      <div class="hand-head">
        <strong>${g.emoji || ''} ${g.name || '?'}</strong>
        <span class="badge">${h.handedness}</span>
      </div>
      <div class="fingers">${list}</div>
      <div class="score">keyakinan ${((h.score || 0) * 100).toFixed(0)}%</div>
    </div>`;
  }).join('');

  rawEl.textContent = JSON.stringify(
    hands.map(h => ({ handedness: h.handedness, gesture: h.gesture, fingers: h.fingers })),
    null, 2
  );
}

/* ------------------------- gambar statis ------------------------- */

function showStaticImage(img) {
  stopCamera();
  trackResult = null;
  fitDraw(img);
  if (mirrorEl.checked) {
    // Balik canvas agar konsisten dengan mode cermin.
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tctx = tmp.getContext('2d');
    tctx.translate(W, 0); tctx.scale(-1, 1);
    tctx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(tmp, 0, 0);
  }
  hint.style.display = 'none';
  trackFrame();
}

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); showStaticImage(img); };
  img.src = url;
}

/* ------------------------------ event ------------------------------ */

btnStart.addEventListener('click', startCamera);
btnStop.addEventListener('click', () => { stopCamera(); setStatus('Kamera dihentikan', true); });
btnDemo.addEventListener('click', () => {
  const img = new Image();
  img.onload = () => showStaticImage(img);
  img.src = 'assets/sample.jpg';
});
fileEl.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

mirrorEl.addEventListener('change', () => { if (!running) trackFrame(); });
skeletonEl.addEventListener('change', drawOverlay);

/* ------------------------------ init ------------------------------ */

checkHealth();
