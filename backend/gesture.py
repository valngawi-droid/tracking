"""Pengenalan gestur tangan sederhana dari 21 landmark MediaPipe Hands.

Landmark mengikuti skema MediaPipe (indeks 0 = pergelangan, dst.):

    Jempol:        4 (ujung), 3 (IP), 2 (MCP), 1 (CMC)
    Telunjuk:      8 (ujung), 6 (PIP), 5 (MCP)
    Tengah:       12 (ujung), 10 (PIP), 9 (MCP)
    Manis:        16 (ujung), 14 (PIP), 13 (MCP)
    Kelingking:   20 (ujung), 18 (PIP), 17 (MCP)

Deteksi jari "terangkat" memakai perbandingan jarak (rotation-invariant),
sehingga tetap bekerja meski tangan miring/berputar di depan kamera.
"""

import math

# Nama jari (Bahasa Indonesia) -> indeks ujung jari & sendi PIP
FINGER_TIPS = {
    "jempol": 4,
    "telunjuk": 8,
    "tengah": 12,
    "manis": 16,
    "kelingking": 20,
}
FINGER_PIPS = {
    "jempol": 3,
    "telunjuk": 6,
    "tengah": 10,
    "manis": 14,
    "kelingking": 18,
}

# Ambang "OK" / menjepit: jarak ujung jempol (4) ke ujung telunjuk (8)
PINCH_THRESHOLD = 0.05


def _dist(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def finger_states(landmarks):
    """Mengembalikan dict {nama_jari: bool} apakah jari lurus/terangkat.

    Heuristik: sebuah jari dianggap lurus bila ujungnya lebih jauh dari
    pergelangan (indeks 0) dibanding sendi PIP-nya (dikalikan faktor kecil
    untuk menoleransi noise).
    """
    states = {}
    for name, tip in FINGER_TIPS.items():
        pip = FINGER_PIPS[name]
        if name == "jempol":
            # Jempol punya arah gerak berbeda. Bandingkan jarak ke pangkal
            # kelingking (17) — saat dilipat ujung jempol dekat telapak.
            states[name] = (
                _dist(landmarks[tip], landmarks[17])
                > _dist(landmarks[pip], landmarks[17]) * 1.2
            )
        else:
            states[name] = (
                _dist(landmarks[tip], landmarks[0])
                > _dist(landmarks[pip], landmarks[0]) * 1.1
            )
    return states


def pinch_distance(landmarks):
    """Jarak antara ujung jempol dan ujung telunjuk (normalized)."""
    return _dist(landmarks[4], landmarks[8])


def recognize_gesture(landmarks, handedness="Unknown"):
    """Mengembalikan dict berisi nama gestur, emoji, dan jumlah jari terangkat."""
    states = finger_states(landmarks)
    up = [name for name, is_up in states.items() if is_up]
    count = len(up)
    pinch = pinch_distance(landmarks)

    # Gestur "OK" hanya jika ujung jempol-telunjuk rapat DAN minimal 2 jari lain
    # terangkat (menghindari kepalan yang keliru dibaca sebagai OK).
    if pinch < PINCH_THRESHOLD and count >= 2:
        return {"name": "OK / Jepit", "emoji": "👌", "count": count, "fingers_up": up}

    if count == 0:
        return {"name": "Kepalan", "emoji": "✊", "count": 0, "fingers_up": []}
    if count == 1:
        if states["jempol"]:
            return {"name": "Jempol", "emoji": "👍", "count": 1, "fingers_up": up}
        if states["telunjuk"]:
            return {"name": "Satu", "emoji": "☝️", "count": 1, "fingers_up": up}
        if states["tengah"]:
            return {"name": "Satu (tengah)", "emoji": "🖕", "count": 1, "fingers_up": up}
        return {"name": "Satu", "emoji": "🤙", "count": 1, "fingers_up": up}
    if count == 2 and states["telunjuk"] and states["tengah"]:
        return {"name": "Dua / Victory", "emoji": "✌️", "count": 2, "fingers_up": up}
    if count == 3:
        return {"name": "Tiga", "emoji": "🤟", "count": 3, "fingers_up": up}
    if count == 4:
        return {"name": "Empat", "emoji": "🖐️", "count": 4, "fingers_up": up}
    return {"name": "Lima / Terbuka", "emoji": "🖐️", "count": 5, "fingers_up": up}
