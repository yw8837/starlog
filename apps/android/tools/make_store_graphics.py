"""Store graphics from the owner's existing art only (crop / compose, no new drawing).

- icon-512.png: apps/web/public/logo.png as is (512x512, 32-bit PNG).
- feature-1024x500.png: apps/web/assets/brand/starlog-og-1200x630.png with the three chips (one says 무료: Play's
  metadata policy keeps price and promotion words out of store assets) and the URL line covered by the sky's own colours, then scaled to 1024 wide and cropped to 500 high. No alpha (Play: JPEG or 24-bit PNG).
Run from apps/android:  python -I tools/make_store_graphics.py
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]  # apps/
OUT = Path(__file__).resolve().parents[1] / "store" / "graphics"
OUT.mkdir(parents=True, exist_ok=True)

logo = Image.open(ROOT / "web/public/logo.png").convert("RGBA")
assert logo.size == (512, 512)
logo.save(OUT / "icon-512.png", optimize=True)

og = Image.open(ROOT / "web/assets/brand/starlog-og-1200x630.png").convert("RGB")
assert og.size == (1200, 630)
# The area to cover (chips and URL), filled row by row with the sky's own colours: each row runs from the colour just
# left of the area to the colour just right of it (the picture's sky is a smooth gradient there; its few stars are lost).
x0, y0, x1, y1 = 30, 436, 472, 630
h = y1 - y0
left = og.crop((x0 - 10, y0, x0 - 2, y1)).resize((1, h), Image.BOX)
right = og.crop((x1 + 2, y0, x1 + 10, y1)).resize((1, h), Image.BOX)
ends = Image.new("RGB", (2, h))
ends.paste(left, (0, 0))
ends.paste(right, (1, 0))
cover = ends.resize((x1 - x0, h), Image.BILINEAR)
mask = Image.new("L", cover.size, 0)
mask.paste(255, (4, 5, cover.width - 4, cover.height + 20))  # soft on the left, top and right; hard at the bottom edge
mask = mask.filter(ImageFilter.GaussianBlur(3))
og.paste(cover, (x0, y0), mask)
scaled = og.resize((1024, round(630 * 1024 / 1200)), Image.LANCZOS)  # 1024 x 538
top = (scaled.height - 500) // 2
scaled.crop((0, top, 1024, top + 500)).save(OUT / "feature-1024x500.png", optimize=True)
for name in ("icon-512.png", "feature-1024x500.png"):
    im = Image.open(OUT / name)
    print(name, im.size, im.mode, (OUT / name).stat().st_size // 1024, "KB")
