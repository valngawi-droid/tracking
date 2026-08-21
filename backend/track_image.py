#!/usr/bin/env python3
"""CLI: deteksi tangan dari file gambar, hasil dicetak sebagai JSON.

Contoh:
    python track_image.py gambar.jpg
    python track_image.py gambar.jpg --pretty
"""

import argparse
import json
import sys

import cv2

from hand_tracker import detect


def main():
    parser = argparse.ArgumentParser(description="Deteksi tangan dari gambar (MediaPipe).")
    parser.add_argument("image", help="Path ke file gambar")
    parser.add_argument(
        "--pretty", action="store_true", help="Cetak JSON dengan indentasi"
    )
    args = parser.parse_args()

    frame = cv2.imread(args.image)
    if frame is None:
        print(f"Gagal membaca gambar: {args.image}", file=sys.stderr)
        sys.exit(1)

    result = detect(frame)
    if args.pretty:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
