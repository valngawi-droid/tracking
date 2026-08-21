'use strict';

/* =========================================================================
 * Hand Tracking + PORTAL FILTER — MediaPipe Tasks (JavaScript/WASM)
 * Fitur & gestur mengikuti referensi "Retrolens" (python-handtrack):
 *   - Titik kuning di ujung jempol & telunjuk tiap tangan.
 *   - 2 tangan = 4 titik = PORTAL (segiempat) berisi filter.
 *   - Ganti filter: dekatkan ujung telunjuk 2 tangan, atau cubit
 *     jempol + kelingking (1 tangan).
 *   - 11 filter: MONO, DUAL-TONE, PIXELATE, INVERT, SEPIA, BLUR,
 *     THERMAL, SKETCH, GLITCH, NEON, GALAXY.
 *
 * Optimasi agar "mulus":
 *   - Overlay di-interpolasi antar deteksi → gerakan halus di refresh layar
 *     (60–120 Hz) walau deteksi model ~30 fps.
 *   - Filter CSS diproses GPU; filter piksel hanya di area kecil portal.
 *   - Interval deteksi adaptif + input downscale otomatis untuk HP lambat.
 * ========================================================================= */

import { FilesetResolver, HandLandmarker } from './mediapipe/vision.js';

const video     = document.getElementById('video');
const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d');
const videoWrap = document.querySelector('.video-wrap');
const hint      = document.getElementById('overlay-hint');
const hintTitle = document.getElementById('hint-title');
const hintDetail= document.getElementById('hint-detail');
const progressBar = document.getElementById('progress-bar');
const handsEl   = document.getElementById('hands');
const emptyEl   = document.getElementById('empty');
const statusEl  = document.getElementById('status');
const fpsEl     = document.getElementById('fps');
const latencyEl = document.getElementById('latency');
const filterNameEl = document.getElementById('filter-name');

const btnStart  = document.getElementById('btn-start');
const btnSwitch = document.getElementById('btn-switch');
const btnSnap   = document.getElementById('btn-snap');
const btnDemo   = document.getElementById('btn-demo');
const btnFilter = document.getElementById('btn-filter');
const mirrorEl  = document.getElementById('mirror');
const skeletonEl= document.getElementById('skeleton');

let videoW = 640, videoH = 480;
canvas.width = videoW; canvas.height = videoH;

// Canvas sumber video yang "bersih" (tanpa overlay) untuk operasi filter.
const videoCanvas = document.createElement('canvas');
const videoCtx = videoCanvas.getContext('2d', { willReadFrequently: true });
// Canvas kerja untuk filter.
const filterCanvas = document.createElement('canvas');
const filterCtx = filterCanvas.getContext('2d', { willReadFrequently: true });
const tmp1 = document.createElement('canvas'), t1c = tmp1.getContext('2d');
const tmp2 = document.createElement('canvas'), t2c = tmp2.getContext('2d');
const tmpGal = document.createElement('canvas'), tgc = tmpGal.getContext('2d');

// Input kecil untuk deteksi di HP lambat.
const detectCanvas = document.createElement('canvas');
detectCanvas.width = 320; detectCanvas.height = 240;
const detectCtx = detectCanvas.getContext('2d');

// Kerangka tangan per jari (warna berbeda).
const HAND_PARTS = [
  { color: '#22c55e', bones: [[0,1],[1,2],[2,3],[3,4]] },           // jempol
  { color: '#00e5ff', bones: [[0,5],[5,6],[6,7],[7,8]] },           // telunjuk
  { color: '#fbbf24', bones: [[5,9],[9,10],[10,11],[11,12]] },      // tengah
  { color: '#fb923c', bones: [[9,13],[13,14],[14,15],[15,16]] },    // manis
  { color: '#c084fc', bones: [[13,17],[17,18],[18,19],[19,20]] },   // kelingking
  { color: '#ffffff', bones: [[0,17]] },                            // telapak
];

const FINGER_TIPS = { jempol: 4, telunjuk: 8, tengah: 12, manis: 16, kelingking: 20 };
const FINGER_PIPS = { jempol: 3, telunjuk: 6, tengah: 10, manis: 14, kelingking: 18 };
const PINCH_THRESHOLD = 0.05;
const SWITCH_DIST = 0.07;   // jarak (ternormalisasi) untuk gestur ganti filter

/* ------------------------------ filter ------------------------------ */

const JET = buildJetLut();

const PIXEL_FNS = { dualTone, thermal, glitch, neon, galaxy };

const FILTERS = [
  { name: 'MONO',       type: 'css',   value: 'grayscale(1)' },
  { name: 'DUAL-TONE',  type: 'pixel', fn: 'dualTone' },
  { name: 'PIXELATE',   type: 'pixelate' },
  { name: 'INVERT',     type: 'css',   value: 'invert(1)' },
  { name: 'SEPIA',      type: 'css',   value: 'sepia(1)' },
  { name: 'BLUR',       type: 'css',   value: 'blur(14px)' },
  { name: 'THERMAL',    type: 'pixel', fn: 'thermal' },
  { name: 'SKETCH',     type: 'sketch' },
  { name: 'GLITCH',     type: 'pixel', fn: 'glitch' },
  { name: 'NEON',       type: 'pixel', fn: 'neon' },
  { name: 'GALAXY',     type: 'pixel', fn: 'galaxy' },
];

let currentFilter = 0;
const galaxyCanvas = makeGalaxy(640, 480);

function buildJetLut() {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r, g, b;
    if (t < 0.125)      { r = 0; g = 0; b = 0.5 + (t / 0.125) * 0.5; }
    else if (t < 0.375) { r = 0; g = (t - 0.125) / 0.25; b = 1; }
    else if (t < 0.625) { r = (t - 0.375) / 0.25; g = 1; b = 1 - (t - 0.375) / 0.25; }
    else if (t < 0.875) { r = 1; g = 1 - (t - 0.625) / 0.25; b = 0; }
    else                { r = 1 - ((t - 0.875) / 0.125) * 0.5; g = 0; b = 0; }
    lut[i * 3] = Math.round(r * 255);
    lut[i * 3 + 1] = Math.round(g * 255);
    lut[i * 3 + 2] = Math.round(b * 255);
  }
  return lut;
}

function makeGalaxy(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#1e0a28';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.8 + 0.2).toFixed(2) + ')';
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
  for (let i = 0; i < 50; i++) {
    g.fillStyle = 'hsla(' + Math.floor(Math.random() * 360) + ',80%,60%,0.8)';
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, Math.random() * 4 + 1, 0, 6.283);
    g.fill();
  }
  return c;
}

function lum(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }

function dualTone(d, w, h) {
  for (let i = 0; i < d.length; i += 4) {
    const g = lum(d, i);
    if (g > 127) { d[i] = 255; d[i + 1] = 165; d[i + 2] = 0; }
    else         { d[i] = 255; d[i + 1] = 20;  d[i + 2] = 147; }
  }
}

function thermal(d, w, h) {
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(lum(d, i));
    d[i] = JET[g * 3];
    d[i + 1] = JET[g * 3 + 1];
    d[i + 2] = JET[g * 3 + 2];
  }
}

function glitch(d, w, h) {
  const src = new Uint8ClampedArray(d);
  const shift = Math.max(1, w >> 5);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ir = (y * w + Math.min(w - 1, x + shift)) * 4;
      const ib = (y * w + Math.max(0, x - shift)) * 4;
      d[i] = src[ir];
      d[i + 1] = src[i + 1];
      d[i + 2] = src[ib + 2];
    }
  }
}

function neon(d, w, h) {
  const src = new Uint8ClampedArray(d);
  const at = (x, y) => (y * w + x) * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = at(x, y);
      const gx = lum(src, at(x + 1, y)) - lum(src, at(x - 1, y));
      const gy = lum(src, at(x, y + 1)) - lum(src, at(x, y - 1));
      const m = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      if (m > 70) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 0; }
      else        { d[i] = 0;   d[i + 1] = 0;   d[i + 2] = 0; }
      d[i + 3] = 255;
    }
  }
}

function galaxy(d, w, h, x, y) {
  tmpGal.width = w; tmpGal.height = h;
  tgc.drawImage(galaxyCanvas, x, y, w, h, 0, 0, w, h);
  const g = tgc.getImageData(0, 0, w, h).data;
  for (let i = 0; i < d.length; i += 4) {
    if (lum(d, i) < 90) {
      d[i] = g[i]; d[i + 1] = g[i + 1]; d[i + 2] = g[i + 2];
    }
  }
}

/* --------------------------- state aplikasi --------------------------- */

let fileset = null;
let landmarker = null;       // mode VIDEO (kamera)
let imageLandmarker = null;  // mode IMAGE (uji gambar)
let stream = null;
let facingMode = 'user';
let running = false;
let rafId = null;
let lastDetect = 0;
let detectEvery = 33;
let lastResult = null;
let lastLatency = 0;
let detectErrors = 0;
let recovering = false;
let switchArmed = false;

// Interpolasi landmark agar overlay halus di refresh layar.
let prevHands = null;  // deteksi sebelumnya: [ [ {x,y}x21 ] xN ]
let curHands = null;   // deteksi terbaru
let detectAt = 0;

let fpsFrames = 0, fpsLast = performance.now();
let lastNames = '\u0000';

/* ------------------------------ util ------------------------------ */

function setStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok === false ? 'err' : 'ok';
}

function setProgress(pct, title, detail) {
  progressBar.style.width = pct + '%';
  hintTitle.textContent = title;
  if (detail) hintDetail.textContent = detail;
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function normDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function fingerStates(lm) {
  const s = {};
  for (const [name, tip] of Object.entries(FINGER_TIPS)) {
    const pip = FINGER_PIPS[name];
    if (name === 'jempol') {
      s[name] = dist(lm[tip], lm[17]) > dist(lm[pip], lm[17]) * 1.2;
    } else {
      s[name] = dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.1;
    }
  }
  return s;
}

function recognize(lm) {
  const st = fingerStates(lm);
  const up = Object.entries(st).filter(([, v]) => v).map(([k]) => k);
  const count = up.length;
  const pinch = dist(lm[4], lm[8]);

  if (pinch < PINCH_THRESHOLD && count >= 2)
    return { name: 'OK / Jepit', emoji: '👌', count, up };
  if (count === 0) return { name: 'Kepalan', emoji: '✊', count, up };
  if (count === 1) {
    if (st.jempol) return { name: 'Jempol', emoji: '👍', count, up };
    if (st.telunjuk) return { name: 'Satu', emoji: '☝️', count, up };
    if (st.tengah) return { name: 'Satu (tengah)', emoji: '🖕', count, up };
    return { name: 'Satu', emoji: '🤙', count, up };
  }
  if (count === 2 && st.telunjuk && st.tengah) return { name: 'Dua / Victory', emoji: '✌️', count, up };
  if (count === 3) return { name: 'Tiga', emoji: '🤟', count, up };
  if (count === 4) return { name: 'Empat', emoji: '🖐️', count, up };
  return { name: 'Lima / Terbuka', emoji: '🖐️', count, up };
}

function handednessOf(result, i) {
  const raw = result.handedness?.[i]?.categories?.[0]?.categoryName;
  return raw === 'Left' ? 'Kiri' : (raw === 'Right' ? 'Kanan' : 'Unknown');
}

function flipSide(side) {
  return side === 'Kiri' ? 'Kanan' : (side === 'Kanan' ? 'Kiri' : side);
}

function px(lm, mirrored) { return (mirrored ? 1 - lm.x : lm.x) * videoW; }
function py(lm) { return lm.y * videoH; }

function ensureVideoCanvas() {
  if (videoCanvas.width !== videoW || videoCanvas.height !== videoH) {
    videoCanvas.width = videoW;
    videoCanvas.height = videoH;
  }
}

/* ---------------------- ukuran kanvas sesuai video ---------------------- */

function syncVideoSize() {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh) return;
  const scale = Math.min(1, 640 / vw);   // batasi lebar 640, rasio dijaga
  videoW = Math.max(2, Math.round(vw * scale));
  videoH = Math.max(2, Math.round(vh * scale));
  canvas.width = videoW;
  canvas.height = videoH;
  if (videoWrap) videoWrap.style.aspectRatio = videoW + ' / ' + videoH;
}

/* --------------------------- inisialisasi --------------------------- */

async function initModel() {
  try {
    setProgress(5, 'Mengunduh runtime…', 'mediapipe WASM (~12 MB)');
    fileset = await FilesetResolver.forVisionTasks('mediapipe/wasm');

    setProgress(40, 'Menyiapkan model…', 'hand_landmarker.task (~8 MB)');
    landmarker = await createWithFallback();

    setProgress(100, 'Model siap! 🎉', 'Tekan "Mulai Kamera", lalu tunjukkan tangan.');
    setStatus('MediaPipe siap — tekan Mulai Kamera', true);
    btnStart.disabled = false;
    btnDemo.disabled = false;
    btnFilter.disabled = false;
    updateFilterUI();
  } catch (e) {
    console.error(e);
    setProgress(0, 'Gagal memuat model', '');
    hintDetail.textContent = 'Pastikan file mediapipe/ & hand_landmarker.task ada.';
    setStatus('Gagal memuat model: ' + e.message, false);
  }
}

function makeLandmarker(delegate) {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: 'hand_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function createWithFallback() {
  try {
    setProgress(60, 'Mengaktifkan GPU…', '');
    const g = await makeLandmarker('GPU');
    await warmup(g);
    return g;
  } catch (eGpu) {
    console.warn('GPU tidak tersedia, memakai CPU:', eGpu);
    setProgress(70, 'GPU tidak ada — memakai CPU…', '');
    return makeLandmarker('CPU');
  }
}

async function warmup(lm) {
  setProgress(80, 'Pemanasan model…', '');
  detectCtx.fillStyle = '#000';
  detectCtx.fillRect(0, 0, 320, 240);
  lm.detectForVideo(detectCanvas, 0);
}

async function recoverWithCpu() {
  if (recovering) return;
  recovering = true;
  try {
    setStatus('Mengganti ke CPU…', true);
    try { landmarker.close(); } catch (_) {}
    landmarker = await makeLandmarker('CPU');
    detectErrors = 0;
    setStatus('Kamera aktif (CPU)', true);
  } catch (e) {
    console.error(e);
    setStatus('Gagal mengganti ke CPU: ' + e.message, false);
  } finally {
    recovering = false;
  }
}

/* ------------------------------ kamera ------------------------------ */

async function startCamera() {
  if (!landmarker) return;
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    syncVideoSize();
    ensureVideoCanvas();
    running = true;
    hint.style.display = 'none';
    btnStart.disabled = true;
    btnSwitch.disabled = false;
    btnSnap.disabled = false;
    setStatus('Kamera aktif — tunjukkan tangan ke kamera', true);
    loop();
  } catch (e) {
    setStatus('Kamera tidak tersedia: ' + e.message, false);
    setProgress(100, 'Kamera tidak tersedia', '');
    hintDetail.textContent = 'Izinkan akses kamera lalu coba lagi.';
    hint.style.display = 'flex';
  }
}

async function switchCamera() {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  if (facingMode === 'environment') mirrorEl.checked = false; // kamera belakang tidak dicerminkan
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  await startCamera();
}

function stopCamera() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  btnStart.disabled = false;
  btnSwitch.disabled = true;
  btnSnap.disabled = true;
}

/* --------------------------- uji gambar (tanpa kamera) --------------------------- */

async function ensureImageLandmarker() {
  if (imageLandmarker) return imageLandmarker;
  if (!fileset) fileset = await FilesetResolver.forVisionTasks('mediapipe/wasm');
  imageLandmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: 'hand_landmarker.task', delegate: 'CPU' },
    runningMode: 'IMAGE',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
  });
  return imageLandmarker;
}

async function testImage() {
  stopCamera();
  const img = new Image();
  img.onload = async () => {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (iw && ih) {
      videoW = iw; videoH = ih;
      canvas.width = videoW; canvas.height = videoH;
      if (videoWrap) videoWrap.style.aspectRatio = videoW + ' / ' + videoH;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, videoW, videoH);
    ctx.save();
    if (mirrorEl.checked) { ctx.translate(videoW, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, 0, 0, videoW, videoH);
    ctx.restore();

    // Sinkronkan videoCanvas (untuk filter portal) dengan tampilan.
    ensureVideoCanvas();
    videoCtx.drawImage(canvas, 0, 0);

    try {
      const lmr = await ensureImageLandmarker();
      lastResult = lmr.detect(img);
      curHands = (lastResult.handLandmarks || []).map(lm => lm.map(p => ({ x: p.x, y: p.y })));
      prevHands = curHands;
      detectAt = performance.now();
      renderHands(lastResult);
      drawOverlay();
      const n = lastResult.handLandmarks?.length || 0;
      setStatus('Gambar diuji — ' + n + ' tangan terdeteksi', true);
    } catch (e) {
      console.error(e);
      setStatus('Gagal menguji gambar: ' + e.message, false);
    }
  };
  img.src = 'sample.jpg';
}

/* ------------------------------ loop ------------------------------ */

function paintVideoFrame() {
  ensureVideoCanvas();
  videoCtx.fillStyle = '#000';
  videoCtx.fillRect(0, 0, videoW, videoH);
  videoCtx.save();
  if (mirrorEl.checked) { videoCtx.translate(videoW, 0); videoCtx.scale(-1, 1); }
  if (video.readyState >= 2) videoCtx.drawImage(video, 0, 0, videoW, videoH);
  videoCtx.restore();
  // Salin ke kanvas utama.
  ctx.drawImage(videoCanvas, 0, 0);
}

function loop() {
  if (!running) return;

  paintVideoFrame();

  const now = performance.now();
  fpsFrames++;
  if (now - fpsLast >= 1000) {
    fpsEl.textContent = 'FPS: ' + fpsFrames;
    fpsFrames = 0; fpsLast = now;
  }

  if (landmarker && !recovering && now - lastDetect >= detectEvery) {
    lastDetect = now;
    doDetect(now);
  }

  drawPortalAndOverlay(displayHands());
  rafId = requestAnimationFrame(loop);
}

function doDetect(now) {
  const t0 = performance.now();
  try {
    const src = lastLatency > 150 ? downscaledFrame() : video;
    const result = landmarker.detectForVideo(src, now);
    lastLatency = performance.now() - t0;
    latencyEl.textContent = 'Deteksi: ' + lastLatency.toFixed(0) + ' ms';
    detectErrors = 0;
    detectEvery = lastLatency > 66 ? Math.min(500, Math.round(lastLatency * 1.4)) : 33;

    lastResult = result;
    prevHands = curHands;
    curHands = (result.handLandmarks || []).map(lm => lm.map(p => ({ x: p.x, y: p.y })));
    detectAt = now;

    handleFilterSwitch(result);
    updatePanel(result);
  } catch (e) {
    console.error(e);
    if (++detectErrors >= 3) recoverWithCpu();
  }
}

// Input kecil (letterbox, rasio dijaga) untuk HP lambat.
function downscaledFrame() {
  detectCtx.fillStyle = '#000';
  detectCtx.fillRect(0, 0, 320, 240);
  const vw = video.videoWidth || videoW, vh = video.videoHeight || videoH;
  const r = Math.min(320 / vw, 240 / vh);
  const dw = vw * r, dh = vh * r;
  detectCtx.drawImage(video, (320 - dw) / 2, (240 - dh) / 2, dw, dh);
  return detectCanvas;
}

/* --------------------------- interpolasi (mulus) --------------------------- */

function displayHands() {
  if (!curHands) return null;
  const interval = Math.max(16, detectEvery);
  let t = (performance.now() - detectAt) / interval;
  t = Math.min(1, Math.max(0, t));
  t = t * t * (3 - 2 * t); // smoothstep
  if (!prevHands || prevHands.length !== curHands.length) return curHands;
  return curHands.map((hand, i) => {
    const ph = prevHands[i];
    if (!ph || ph.length !== hand.length) return hand;
    return hand.map((p, k) => ({
      x: ph[k].x + (p.x - ph[k].x) * t,
      y: ph[k].y + (p.y - ph[k].y) * t,
    }));
  });
}

/* ----------------------- portal & overlay (render) ----------------------- */

function orderQuad(pts) {
  const p = pts.slice().sort((a, b) => a.y - b.y);
  const top = p.slice(0, 2).sort((a, b) => a.x - b.x);
  const bot = p.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bot[1], bot[0]]; // tl, tr, br, bl
}

function bboxOf(quadPx) {
  const xs = quadPx.map(p => p.x), ys = quadPx.map(p => p.y);
  const x = Math.floor(Math.max(0, Math.min(...xs)));
  const y = Math.floor(Math.max(0, Math.min(...ys)));
  const r = Math.ceil(Math.min(videoW, Math.max(...xs)));
  const b = Math.ceil(Math.min(videoH, Math.max(...ys)));
  return { x, y, w: Math.max(1, r - x), h: Math.max(1, b - y) };
}

function pathQuad(q) {
  ctx.beginPath();
  ctx.moveTo(q[0].x, q[0].y);
  for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
  ctx.closePath();
}

function drawPortalAndOverlay(disp) {
  // Portal hanya bila ada 2 tangan (4 titik: jempol & telunjuk tiap tangan).
  let quad = null;
  if (disp && disp.length >= 2) {
    const pts = [];
    for (let i = 0; i < 2; i++) {
      const lm = disp[i];
      if (!lm || lm.length < 21) { pts.length = 0; break; }
      pts.push({ x: lm[8].x, y: lm[8].y });
      pts.push({ x: lm[4].x, y: lm[4].y });
    }
    if (pts.length === 4) {
      quad = orderQuad(pts).map(p => ({ x: px(p, mirrorEl.checked), y: py(p) }));
    }
  }

  if (quad) {
    applyFilterInQuad(quad);
    drawPortalFrame(quad);
  }

  if (disp) disp.forEach((lm, i) => drawHand(lm, i));
}

function applyFilterInQuad(q) {
  const f = FILTERS[currentFilter];
  const b = bboxOf(q);
  ctx.save();
  pathQuad(q);
  ctx.clip();
  if (f.type === 'css') {
    ctx.filter = f.value;
    ctx.drawImage(videoCanvas, 0, 0);
    ctx.filter = 'none';
  } else if (f.type === 'pixel') {
    applyPixel(PIXEL_FNS[f.fn], b);
  } else if (f.type === 'pixelate') {
    applyPixelate(b);
  } else if (f.type === 'sketch') {
    applySketch(b);
  }
  ctx.restore();
}

function applyPixel(fn, b) {
  if (b.w <= 0 || b.h <= 0) return;
  const img = videoCtx.getImageData(b.x, b.y, b.w, b.h);
  fn(img.data, b.w, b.h, b.x, b.y);
  filterCanvas.width = b.w; filterCanvas.height = b.h;
  filterCtx.putImageData(img, 0, 0);
  ctx.drawImage(filterCanvas, b.x, b.y);
}

function applyPixelate(b) {
  const block = Math.max(6, Math.round(Math.max(b.w, b.h) / 30));
  const sw = Math.max(1, Math.round(b.w / block));
  const sh = Math.max(1, Math.round(b.h / block));
  filterCanvas.width = sw; filterCanvas.height = sh;
  filterCtx.imageSmoothingEnabled = true;
  filterCtx.drawImage(videoCanvas, b.x, b.y, b.w, b.h, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(filterCanvas, 0, 0, sw, sh, b.x, b.y, b.w, b.h);
  ctx.imageSmoothingEnabled = true;
}

function applySketch(b) {
  const { x, y, w, h } = b;
  tmp1.width = w; tmp1.height = h;
  t1c.filter = 'grayscale(1)';
  t1c.drawImage(videoCanvas, x, y, w, h, 0, 0, w, h);
  tmp2.width = w; tmp2.height = h;
  t2c.filter = 'invert(1) blur(5px)';
  t2c.drawImage(tmp1, 0, 0);
  filterCanvas.width = w; filterCanvas.height = h;
  filterCtx.globalCompositeOperation = 'source-over';
  filterCtx.clearRect(0, 0, w, h);
  filterCtx.drawImage(tmp2, 0, 0);
  filterCtx.globalCompositeOperation = 'color-dodge';
  filterCtx.drawImage(tmp1, 0, 0);
  filterCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(filterCanvas, x, y);
}

function drawPortalFrame(q) {
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2.5;
  pathQuad(q);
  ctx.stroke();

  // Partikel glow di tepi portal (seperti referensi).
  for (let e = 0; e < 4; e++) {
    const a = q[e], b = q[(e + 1) % 4];
    for (let j = 0; j < 3; j++) {
      const t = Math.random();
      const gx = a.x * t + b.x * (1 - t) + (Math.random() * 30 - 15);
      const gy = a.y * t + b.y * (1 - t) + (Math.random() * 30 - 15);
      ctx.fillStyle = 'rgba(0,255,255,0.85)';
      ctx.fillRect(gx, gy, 2.5, 2.5);
    }
  }

  let top = q[0];
  for (const p of q) if (p.y < top.y) top = p;
  const label = 'PORTAL: ' + FILTERS[currentFilter].name;
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(top.x - tw / 2 - 8, top.y - 26, tw + 16, 20);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, top.x, top.y - 12);
}

function drawHand(lm, i) {
  if (!lm || lm.length < 21) return;
  const raw = lastResult && lastResult.handLandmarks ? lastResult.handLandmarks[i] : null;
  const fingers = raw && raw.length ? fingerStates(raw) : null;
  const mirrored = mirrorEl.checked;
  const side = handednessOf(lastResult || { handedness: [] }, i);
  const labelSide = mirrored ? flipSide(side) : side;
  const gesture = raw ? recognize(raw) : null;

  if (skeletonEl.checked) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const part of HAND_PARTS) {
      ctx.strokeStyle = part.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (const [a, b] of part.bones) {
        ctx.moveTo(px(lm[a], mirrored), py(lm[a]));
        ctx.lineTo(px(lm[b], mirrored), py(lm[b]));
      }
      ctx.stroke();
    }
  }

  lm.forEach((p, k) => {
    const name = Object.keys(FINGER_TIPS).find(n => FINGER_TIPS[n] === k);
    const isTip = Boolean(name);
    let color, r;
    if (k === 4 || k === 8) {
      // Titik portal: kuning, seperti referensi.
      color = '#ffeb3b'; r = 8;
    } else if (isTip) {
      const up = name && fingers ? fingers[name] : true;
      color = up ? '#22c55e' : '#ef4444'; r = 6;
    } else {
      color = '#ffffff'; r = 4;
    }
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(px(p, mirrored), py(p), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.stroke();
  });

  if (gesture) {
    const gx = px(lm[0], mirrored), gy = py(lm[0]);
    const label = `${labelSide} · ${gesture.emoji} ${gesture.name}`;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(gx - tw / 2 - 8, gy - 32, tw + 16, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, gx, gy - 16);
  }
}

/* --------------------- gestur ganti filter & panel --------------------- */

function handleFilterSwitch(result) {
  const hands = result.handLandmarks || [];
  let sw = false;
  if (hands.length >= 2 && hands[0].length >= 9 && hands[1].length >= 9) {
    if (normDist(hands[0][8], hands[1][8]) < SWITCH_DIST) sw = true;
  }
  for (const lm of hands) {
    if (!lm || lm.length < 21) continue;
    if (normDist(lm[4], lm[20]) < SWITCH_DIST) sw = true;
  }
  if (sw) {
    if (!switchArmed) {
      currentFilter = (currentFilter + 1) % FILTERS.length;
      updateFilterUI();
      switchArmed = true;
    }
  } else {
    switchArmed = false;
  }
}

function updateFilterUI() {
  filterNameEl.textContent = 'Filter: ' + FILTERS[currentFilter].name;
}

function updatePanel(result) {
  const hands = result.handLandmarks || [];
  if (!hands.length) {
    if (lastNames !== '') { lastNames = ''; renderHands(result); }
    return;
  }
  const names = hands.map((lm, i) => recognize(lm).name + handednessOf(result, i)).join('|');
  if (names !== lastNames) {
    lastNames = names;
    renderHands(result);
  }
}

function renderHands(result) {
  const hands = result.handLandmarks || [];
  if (!hands.length) {
    emptyEl.style.display = 'block';
    handsEl.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';
  handsEl.innerHTML = hands.map((lm, i) => {
    const st = fingerStates(lm);
    const side = handednessOf(result, i);
    const g = recognize(lm);
    const list = Object.entries(st)
      .map(([k, v]) => `<span class="finger ${v ? 'up' : 'down'}">${v ? '▲' : '▼'} ${k}</span>`)
      .join('');
    return `<div class="hand-card">
      <div class="hand-head"><strong>${g.emoji} ${g.name}</strong><span class="badge">${side}</span></div>
      <div class="fingers">${list}</div>
    </div>`;
  }).join('');
}

/* ----------------------------- snapshot ----------------------------- */

function snapshot() {
  const out = document.createElement('canvas');
  out.width = videoW; out.height = videoH;
  const octx = out.getContext('2d');
  octx.drawImage(canvas, 0, 0);
  const a = document.createElement('a');
  a.href = out.toDataURL('image/jpeg', 0.9);
  a.download = 'handtrack-' + Date.now() + '.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ------------------------------ event ------------------------------ */

video.addEventListener('loadedmetadata', syncVideoSize);

btnStart.addEventListener('click', startCamera);
btnSwitch.addEventListener('click', switchCamera);
btnSnap.addEventListener('click', snapshot);
btnDemo.addEventListener('click', testImage);
btnFilter.addEventListener('click', () => {
  currentFilter = (currentFilter + 1) % FILTERS.length;
  updateFilterUI();
});
mirrorEl.addEventListener('change', drawOverlay);

function drawOverlay() {
  drawPortalAndOverlay(displayHands());
}

/* ------------------------------ init ------------------------------ */

btnStart.disabled = true;
setStatus('Memuat model MediaPipe…', true);
updateFilterUI();
initModel();
