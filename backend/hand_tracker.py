"""Inti deteksi tangan dengan MediaPipe Hands.

Modul ini diimpor oleh `app.py` (API Flask) dan `track_image.py` (CLI),
sehingga logika deteksi cukup ditulis satu kali.
"""

import base64
import os
import time

# Redam log internal MediaPipe/TFLite (INFO -> hanya WARNING ke atas),
# supaya output stdout CLI/API tetap bersih.
os.environ.setdefault("GLOG_minloglevel", "2")

import cv2
import mediapipe as mp
import numpy as np

from gesture import finger_states, recognize_gesture

# Inisialisasi model sekali saja (agar proses menjadi cepat untuk tiap frame).
_mp_hands = mp.solutions.hands
_HANDS = _mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    model_complexity=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

_HANDEDNESS_ID = {"Left": "Kiri", "Right": "Kanan"}


def decode_image(data_b64):
    """Mengubah base64 (dengan/tanpa prefix `data:image/...;base64,`) menjadi frame BGR."""
    if not data_b64:
        return None
    if isinstance(data_b64, bytes):
        payload = data_b64
    else:
        if "," in data_b64:
            data_b64 = data_b64.split(",", 1)[1]
        try:
            payload = base64.b64decode(data_b64)
        except Exception:
            return None
    arr = np.frombuffer(payload, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def detect(frame_bgr):
    """Menjalankan MediaPipe Hands pada satu frame BGR.

    Mengembalikan dict:
        {
            "hands": [ {handedness, handedness_raw, score, landmarks, fingers, gesture} ],
            "elapsed_ms": float,
            "width": int, "height": int,
        }
    """
    if frame_bgr is None:
        return {"hands": [], "elapsed_ms": 0.0, "width": 0, "height": 0}

    height, width = frame_bgr.shape[:2]
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    t0 = time.perf_counter()
    results = _HANDS.process(rgb)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    hands_out = []
    if results.multi_hand_landmarks:
        for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
            landmarks = [
                {"x": round(p.x, 4), "y": round(p.y, 4), "z": round(p.z, 4)}
                for p in hand_landmarks.landmark
            ]

            label = "Unknown"
            score = 0.0
            if results.multi_handedness and idx < len(results.multi_handedness):
                classification = results.multi_handedness[idx].classification[0]
                label = classification.label
                score = round(classification.score, 4)

            fingers = finger_states(landmarks)
            gesture = recognize_gesture(landmarks, label)

            hands_out.append(
                {
                    "handedness": _HANDEDNESS_ID.get(label, label),
                    "handedness_raw": label,
                    "score": score,
                    "landmarks": landmarks,
                    "fingers": fingers,
                    "gesture": gesture,
                }
            )

    return {
        "hands": hands_out,
        "elapsed_ms": round(elapsed_ms, 1),
        "width": width,
        "height": height,
    }
