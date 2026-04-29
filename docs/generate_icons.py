#!/usr/bin/env python3
"""Generate icons for the Dinner Planner PWA: chef's hat over a pot.

Outputs:
  icons/icon-192.png        (any-purpose)
  icons/icon-512.png        (any-purpose)
  icons/icon-maskable.png   (512x512, with safe-area padding)
  icons/apple-touch-icon.png (180x180)

Run from the docs/ folder:  python3 generate_icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent / "icons"

BG = (253, 248, 241)        # parchment --bg
HAT_PUFF = (255, 255, 255)
HAT_BAND = (246, 237, 224)  # cream --surface-2
INK = (42, 31, 23)          # --ink
INK_SOFT = (107, 89, 70)    # --ink-2
POT = (194, 65, 12)         # terracotta --accent
POT_DARK = (154, 51, 10)    # --accent-hover
POT_HIGHLIGHT = (218, 100, 50)
SAGE = (107, 127, 85)


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))

    # Maskable safe area: keep meaningful content inside the inner 80%.
    pad = int(size * (0.12 if maskable else 0.06))
    inner = size - 2 * pad

    # Anchor the design: hat takes top ~45%, pot takes bottom ~55%.
    cx = size / 2
    hat_top = pad + inner * 0.04
    hat_bottom = pad + inner * 0.48
    pot_top = pad + inner * 0.50
    pot_bottom = pad + inner * 0.94

    draw_chef_hat(img, cx, hat_top, hat_bottom, inner)
    draw_pot(img, cx, pot_top, pot_bottom, inner)

    return img


def draw_chef_hat(img: Image.Image, cx: float, top: float, bottom: float, inner: float):
    draw = ImageDraw.Draw(img)
    height = bottom - top
    width = inner * 0.62

    band_h = height * 0.22
    band_top = bottom - band_h
    band_left = cx - width / 2
    band_right = cx + width / 2

    puff_height = height - band_h
    puff_y_center = top + puff_height * 0.55

    # Three overlapping puffs across the top.
    side_r = puff_height * 0.55
    mid_r = puff_height * 0.62
    centers = [
        (cx - width * 0.32, puff_y_center, side_r),
        (cx, puff_y_center - puff_height * 0.05, mid_r),
        (cx + width * 0.32, puff_y_center, side_r),
    ]

    # Soft drop shadow under the hat band.
    shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle(
        [band_left + 2, band_top + 4, band_right + 2, bottom + 6],
        radius=int(band_h * 0.55),
        fill=(74, 42, 15, 60),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=max(2, inner * 0.012)))
    img.alpha_composite(shadow_layer)
    draw = ImageDraw.Draw(img)

    # Puffs (filled white circles).
    for x, y, r in centers:
        draw.ellipse(
            [x - r, y - r, x + r, y + r],
            fill=HAT_PUFF,
        )

    # Outline pass — darker stroke so puffs read against parchment.
    for x, y, r in centers:
        draw.ellipse(
            [x - r, y - r, x + r, y + r],
            outline=INK,
            width=max(3, int(inner * 0.012)),
        )

    # Hat band (rounded rectangle).
    draw.rounded_rectangle(
        [band_left, band_top, band_right, bottom],
        radius=int(band_h * 0.45),
        fill=HAT_BAND,
        outline=INK,
        width=max(3, int(inner * 0.010)),
    )

    # Three subtle vertical pleats on the band.
    pleat_h = band_h * 0.55
    pleat_y0 = band_top + (band_h - pleat_h) / 2
    pleat_y1 = pleat_y0 + pleat_h
    for f in (-0.28, 0.0, 0.28):
        x = cx + width * f
        draw.line(
            [(x, pleat_y0), (x, pleat_y1)],
            fill=INK_SOFT,
            width=max(1, int(inner * 0.005)),
        )


def draw_pot(img: Image.Image, cx: float, top: float, bottom: float, inner: float):
    draw = ImageDraw.Draw(img)
    body_w = inner * 0.74
    body_left = cx - body_w / 2
    body_right = cx + body_w / 2

    rim_h = (bottom - top) * 0.18
    rim_top = top
    rim_bottom = top + rim_h

    body_top = rim_top + rim_h * 0.55
    body_bottom = bottom

    # Handles (rounded rectangles flanking the rim).
    handle_w = body_w * 0.16
    handle_h = rim_h * 0.95
    handle_y0 = rim_top + (rim_h - handle_h) / 2
    handle_y1 = handle_y0 + handle_h
    handle_radius = int(handle_h * 0.5)
    outline_w = max(3, int(inner * 0.010))
    draw.rounded_rectangle(
        [body_left - handle_w * 0.85, handle_y0, body_left + handle_w * 0.05, handle_y1],
        radius=handle_radius,
        fill=POT_DARK,
        outline=INK,
        width=outline_w,
    )
    draw.rounded_rectangle(
        [body_right - handle_w * 0.05, handle_y0, body_right + handle_w * 0.85, handle_y1],
        radius=handle_radius,
        fill=POT_DARK,
        outline=INK,
        width=outline_w,
    )

    # Pot body — wider at the rim, slightly tapered toward the bottom for a saucepan look.
    body_radius = int((body_bottom - body_top) * 0.18)
    draw.rounded_rectangle(
        [body_left, body_top, body_right, body_bottom],
        radius=body_radius,
        fill=POT,
        outline=INK,
        width=outline_w,
    )

    # Rim (darker band along the top of the body).
    draw.rounded_rectangle(
        [body_left, rim_top, body_right, rim_bottom],
        radius=int(rim_h * 0.45),
        fill=POT_DARK,
        outline=INK,
        width=outline_w,
    )
    # Rim inner shadow line for separation.
    draw.line(
        [(body_left + body_w * 0.04, rim_bottom + max(1, inner * 0.004)),
         (body_right - body_w * 0.04, rim_bottom + max(1, inner * 0.004))],
        fill=(0, 0, 0, 60),
        width=max(1, int(inner * 0.004)),
    )

    # Highlight stripe on the body for a glossy hint.
    hl_x0 = body_left + body_w * 0.10
    hl_x1 = body_left + body_w * 0.22
    hl_y0 = body_top + (body_bottom - body_top) * 0.18
    hl_y1 = body_bottom - (body_bottom - body_top) * 0.18
    draw.rounded_rectangle(
        [hl_x0, hl_y0, hl_x1, hl_y1],
        radius=int((hl_x1 - hl_x0) / 2),
        fill=POT_HIGHLIGHT,
    )


def draw_steam(img: Image.Image, cx: float, top: float, bottom: float, inner: float):
    """Two thin sage steam curls between the hat and the pot."""
    draw = ImageDraw.Draw(img)
    height = bottom - top
    if height < inner * 0.04:
        return
    steam_w = max(2, int(inner * 0.012))
    amp = inner * 0.025

    for offset in (-inner * 0.10, inner * 0.10):
        x_base = cx + offset
        points = []
        steps = 18
        for i in range(steps + 1):
            t = i / steps
            y = top + height * t
            phase = (i / steps) * 3.14159 * 2
            x = x_base + amp * (1 if offset > 0 else -1) * (1 if i % 2 == 0 else -1) * 0.0  # base
            # Use sine for a smooth wave.
            import math
            x = x_base + math.sin(phase) * amp * (1 if offset > 0 else -1)
            points.append((x, y))
        for a, b in zip(points, points[1:]):
            draw.line([a, b], fill=SAGE, width=steam_w)


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
