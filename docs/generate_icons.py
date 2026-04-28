#!/usr/bin/env python3
"""Generate icons for the Dinner Planner PWA.

Outputs:
  icons/icon-192.png        (any-purpose)
  icons/icon-512.png        (any-purpose)
  icons/icon-maskable.png   (512x512, with safe-area padding)
  icons/apple-touch-icon.png (180x180)

Run from the docs/ folder:  python3 generate_icons.py
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / "icons"

BG = (253, 248, 241)        # parchment --bg
PLATE = (255, 255, 255)
PLATE_RIM = (231, 217, 196)
ACCENT = (194, 65, 12)      # terracotta
INK = (42, 31, 23)
SAGE = (107, 127, 85)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(img)

    # Maskable safe area: keep meaningful content inside the inner 80%.
    inset = int(size * 0.10) if maskable else int(size * 0.06)
    plate_box = (inset, inset, size - inset, size - inset)
    cx = size / 2
    cy = size / 2
    plate_r = (size - 2 * inset) / 2

    # Plate (white circle with rim).
    draw.ellipse(plate_box, fill=PLATE, outline=PLATE_RIM, width=max(2, size // 80))

    # Inner rim ring (subtle).
    inner_inset = inset + max(4, size // 36)
    draw.ellipse(
        (inner_inset, inner_inset, size - inner_inset, size - inner_inset),
        outline=PLATE_RIM,
        width=max(1, size // 140),
    )

    # Bowl-of-food: terracotta dome with sage steam-curls.
    food_r = plate_r * 0.62
    food_box = (cx - food_r, cy - food_r * 0.85, cx + food_r, cy + food_r * 0.85)
    draw.ellipse(food_box, fill=ACCENT)

    # Highlight on the food (subtle).
    hl_r = food_r * 0.55
    hl_cx = cx - food_r * 0.18
    hl_cy = cy - food_r * 0.30
    hl_box = (hl_cx - hl_r, hl_cy - hl_r * 0.4, hl_cx + hl_r, hl_cy + hl_r * 0.4)
    draw.ellipse(hl_box, fill=lerp(ACCENT, (255, 255, 255), 0.18))

    # Three steam curls above the food.
    steam_w = max(3, size // 70)
    base_y = cy - food_r * 0.95
    for i, dx in enumerate((-food_r * 0.45, 0, food_r * 0.45)):
        x = cx + dx
        y0 = base_y
        y1 = base_y - food_r * 0.55
        # S-curve approximated with two arcs.
        amp = food_r * 0.10 * (1 if i % 2 == 0 else -1)
        points = []
        for t in range(0, 21):
            ft = t / 20.0
            py = y0 + (y1 - y0) * ft
            px = x + math.sin(ft * math.pi * 2) * amp
            points.append((px, py))
        for a, b in zip(points, points[1:]):
            draw.line([a, b], fill=SAGE, width=steam_w)

    return img


def save_all():
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ]
    for name, size, maskable in sizes:
        img = draw_icon(size, maskable=maskable)
        path = OUT / name
        img.save(path, format="PNG", optimize=True)
        print(f"wrote {path}  ({size}x{size}{' maskable' if maskable else ''})")


if __name__ == "__main__":
    save_all()
