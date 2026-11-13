"""Builds the extension icons from the logo (assets/logo/source-tile.png).

Crops the glass tile, cleans the stray specks around it with a rounded-rect mask, and writes
public/icons/{16,32,48,128}.png plus assets/logo/diarc-tile.png. The 128 px icon keeps the 16 px
transparent margin the Web Store asks for; 16/32 px get a contrast boost so the sparkle stays legible.
Run: npm run icons  (needs Pillow and numpy).
"""
from PIL import Image, ImageDraw, ImageEnhance
import numpy as np

src = Image.open('assets/logo/source-tile.png').convert('RGBA')
x0, y0, x1, y1 = 144, 164, 1095, 1091  # the tile inside the source image
tile = src.crop((x0, y0, x1, y1))
w, h = tile.size
S = 4
mask = Image.new('L', (w * S, h * S), 0)
ImageDraw.Draw(mask).rounded_rectangle((2 * S, 2 * S, (w - 2) * S, (h - 2) * S), radius=int(0.215 * w * S), fill=255)
mask = np.array(mask.resize((w, h), Image.LANCZOS)) / 255.0
px = np.array(tile).astype(float)
px[:, :, 3] = np.where(px[:, :, 3] > 200, 255, px[:, :, 3]) * mask
tile = Image.fromarray(px.astype('uint8'))
side = max(w, h)
square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
square.paste(tile, ((side - w) // 2, (side - h) // 2))
square.resize((512, 512), Image.LANCZOS).save('assets/logo/diarc-512.png')

for size, pad in ((16, 0), (32, 1), (48, 2), (128, 8)):
    inner = size - 2 * pad
    img = square.resize((inner, inner), Image.LANCZOS)
    if size <= 32:
        img = ImageEnhance.Color(ImageEnhance.Contrast(img).enhance(1.35)).enhance(1.3)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (pad, pad), img)
    out.save(f'public/icons/{size}.png')
print('✓ icons written to public/icons/')
