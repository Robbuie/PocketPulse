"""Draws the PocketPulse icon and writes every size the manifest and iOS use
into public/. A pulse line in the app's green-to-teal on its dark background.

    pip install cairosvg
    python tools/make_icons.py
"""
from pathlib import Path

import cairosvg

OUT = Path(__file__).resolve().parent.parent / "public"


def svg(rounded):
    # Rounded corners for the plain icon; full bleed for maskable and iOS,
    # which cut their own shape. The line stays inside the maskable safe zone.
    rx = 112 if rounded else 0
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#171c2e"/><stop offset="1" stop-color="#0a0d16"/>
    </linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#10d070"/><stop offset="1" stop-color="#20c4b8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="{rx}" fill="url(#bg)"/>
  <path d="M100 276 H178 L214 188 L266 348 L306 228 L334 276 H382" fill="none"
        stroke="url(#line)" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="404" cy="276" r="22" fill="#20c4b8"/>
</svg>
'''


(OUT / "icon.svg").write_text(svg(True))
for name, rounded, size in [
    ("pwa-192.png", True, 192),
    ("pwa-512.png", True, 512),
    ("maskable-512.png", False, 512),
    ("apple-touch-icon.png", False, 180),
    ("favicon-32.png", True, 32),
]:
    cairosvg.svg2png(bytestring=svg(rounded).encode(), write_to=str(OUT / name),
                     output_width=size, output_height=size)
