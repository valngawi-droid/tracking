'use strict';

/* =========================================================================
 * Hand Tracking — MediaPipe Tasks (JavaScript/WASM)
 * Berjalan 100% di browser HP (Android/Chrome), model & runtime lokal
 * (tidak butuh internet saat dipakai, cukup server lokal dari Termux).
 * ========================================================================= */

import { FilesetResolver, HandLandmarker } from './mediapipe/vision.js';

const video     = document.getElementById('video');
const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d');
const hint      = document.getElementById('overlay-hint');
const hintTitle = document.getElementById('hint-title');
const hintDetail= document.getElementById('hint-detail');
const handsEl   = document.getElementById('hands');
const emptyEl   = document.getElementById('empty');
const statusEl  = document.getElementById('status');
const fpsEl     = document.getElementById('fps');
const latencyEl = document.getElementById('latency');

const btnStart  = document.getElementById('btn-start');
const btnSwitch = document.getElementById('btn-switch');
const btnSnap   = document.getElementById('btn-snap');
const btnDemo   = document.getElementById('btn-demo');
const mirrorEl  = document.getElementById('mirror');
const skeletonEl= document.getElementById('skeleton');

let fileset = null;
let imageLandmarker = null;

const W = 640, H = 480;
canvas.width = W; canvas.height = H;

// Kerangka tangan per jari (warna berbeda) — sama seperti versi desktop.
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

let landmarker = null;
let stream = null;
let facingMode = 'user';   // 'user' = kamera depan, 'environment' = belakang
let running = false;
let rafId = null;
let lastDetect = 0;
let detectEvery = 33;      // ~30 fps deteksi
let lastResult = null;

let fpsFrames = 0, fpsLast = performance.now();
let lastLatency = 0;

/* ------------------------------ util ------------------------------ */

function setStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok === false ? 'err' : 'ok';
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

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

function recognize(lm, handedness) {
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

/* --------------------------- inisialisasi --------------------------- */

async function initModel() {
  hintTitle.textContent = 'Memuat model…';
  hintDetail.textContent = 'Mengambil runtime WASM & hand_landmarker.task';
  try {
    fileset = await FilesetResolver.forVisionTasks('mediapipe/wasm');

    const create = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: 'hand_landmarker.task', delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // Coba GPU (lebih cepat); jika HP tidak mendukung WebGL2, fallback ke CPU.
    try {
      landmarker = await create('GPU');
    } catch (eGpu) {
      console.warn('GPU tidak tersedia, memakai CPU:', eGpu);
      landmarker = await create('CPU');
    }

    hintTitle.textContent = 'Model siap! 🎉';
    hintDetail.textContent = 'Tekan "Mulai Kamera", lalu tunjukkan tanganmu.';
    setStatus('MediaPipe siap — tekan Mulai Kamera', true);
    btnStart.disabled = false;
    btnDemo.disabled = false;
  } catch (e) {
    console.error(e);
    hintTitle.textContent = 'Gagal memuat model';
    hintDetail.textContent = 'Pastikan file mediapipe/ & hand_landmarker.task ada.';
    setStatus('Gagal memuat model: ' + e.message, false);
  }
}

/* ------------------------------ kamera ------------------------------ */

async function startCamera() {
  if (!landmarker) return;
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    hint.style.display = 'none';
    btnStart.disabled = true;
    btnSwitch.disabled = false;
    btnSnap.disabled = false;
    setStatus('Kamera aktif — lacak tangan ke kamera', true);
    loop();
  } catch (e) {
    setStatus('Kamera tidak tersedia: ' + e.message, false);
    hintTitle.textContent = 'Kamera tidak tersedia';
    hintDetail.textContent = 'Izinkan akses kamera lalu coba lagi.';
    hint.style.display = 'flex';
  }
}

async function switchCamera() {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  // Kamera belakang tidak dicerminkan (gambar asli).
  mirrorEl.checked = facingMode === 'user';
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
    // Gambar digambar (dicerminkan bila mode cermin aktif) agar overlay konsisten.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (mirrorEl.checked) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();

    try {
      const lmr = await ensureImageLandmarker();
      lastResult = lmr.detect(img);
      renderHands(lastResult);
      drawOverlay();
      setStatus('Gambar diuji — ' + (lastResult.handLandmarks?.length || 0) + ' tangan terdeteksi', true);
    } catch (e) {
      console.error(e);
      setStatus('Gagal menguji gambar: ' + e.message, false);
    }
  };
  img.src = 'sample.jpg';
}

/* ------------------------------ loop ------------------------------ */

function loop() {
  if (!running) return;

  // Gambar video (dicerminkan bila mode cermin aktif).
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (mirrorEl.checked) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  if (video.readyState >= 2) ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();

  const now = performance.now();
  fpsFrames++;
  if (now - fpsLast >= 1000) {
    fpsEl.textContent = 'FPS: ' + fpsFrames;
    fpsFrames = 0; fpsLast = now;
  }

  if (now - lastDetect >= detectEvery && landmarker) {
    lastDetect = now;
    const t0 = performance.now();
    try {
      const result = landmarker.detectForVideo(video, now);
      lastLatency = performance.now() - t0;
      latencyEl.textContent = 'Deteksi: ' + lastLatency.toFixed(0) + ' ms';
      lastResult = result;
      renderHands(result);
    } catch (e) {
      console.error(e);
    }
  }

  drawOverlay();
  rafId = requestAnimationFrame(loop);
}

function drawOverlay() {
  if (!lastResult || !lastResult.handLandmarks) return;
  const mirrored = mirrorEl.checked;
  lastResult.handLandmarks.forEach((lm, i) => drawHand(lm, i, mirrored));
}

function px(lm, mirrored) { return (mirrored ? 1 - lm.x : lm.x) * W; }
function py(lm) { return lm.y * H; }

function drawHand(lm, i, mirrored) {
  if (!lm || lm.length < 21) return;

  // Data jari & gestur
  const fingers = fingerStates(lm);
  const handednessRaw = lastResult.handedness?.[i]?.categories?.[0]?.categoryName || 'Unknown';
  // Saat dicerminkan, kiri/kanan tertukar secara visual.
  const side = handednessRaw === 'Left' ? 'Kiri' : (handednessRaw === 'Right' ? 'Kanan' : 'Unknown');
  const labelSide = mirrored ? (side === 'Kiri' ? 'Kanan' : (side === 'Kanan' ? 'Kiri' : side)) : side;
  const gesture = recognize(lm, labelSide);

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
    const up = name ? fingers[name] : true;
    ctx.beginPath();
    ctx.fillStyle = isTip ? (up ? '#22c55e' : '#ef4444') : '#ffffff';
    ctx.arc(px(p, mirrored), py(p), isTip ? 7 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.stroke();
  });

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

/* ------------------------------ panel ------------------------------ */

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
    const raw = result.handedness?.[i]?.categories?.[0]?.categoryName || 'Unknown';
    const side = raw === 'Left' ? 'Kiri' : (raw === 'Right' ? 'Kanan' : 'Unknown');
    const g = recognize(lm, side);
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
  out.width = W; out.height = H;
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

btnStart.addEventListener('click', startCamera);
btnSwitch.addEventListener('click', switchCamera);
btnSnap.addEventListener('click', snapshot);
btnDemo.addEventListener('click', testImage);
mirrorEl.addEventListener('change', drawOverlay);

/* ------------------------------ init ------------------------------ */

btnStart.disabled = true;
setStatus('Memuat model MediaPipe…', true);
initModel();
