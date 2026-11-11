"""Builds the launcher icons from the brand logo (apps/web/public/logo.png, 512 px, read-only source).

usage (from apps/android):  python tools/make_icons.py      (needs Pillow; nothing is added to the repo)

Writes app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/:
  ic_launcher_foreground.png  adaptive-icon foreground, 108 dp: the logo scaled to the 72 dp visible area,
                              centred on transparency; the background layer is @color/ic_launcher_background
                              (#0D0A26, the site theme colour; the logo's corner pixel is a near-identical #0F0C2B)
  ic_launcher.png             legacy icon (API 24-25), 48 dp, rounded square like apps/web/app/icon.png
  ic_launcher_round.png       legacy round icon (API 25), 48 dp circle
Only downscaling happens (largest output is 432 px), so the icons stay sharp.
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
LOGO = HERE.parents[1] / "web" / "public" / "logo.png"
RES = HERE.parent / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}
SUPERSAMPLE = 4  # anti-aliased mask edges


def mask(size: int, radius_ratio: float) -> Image.Image:
    """An anti-aliased rounded-rectangle mask; radius_ratio 0.5 gives a circle."""
    big = size * SUPERSAMPLE
    m = Image.new("L", (big, big), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * radius_ratio), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def shaped(logo: Image.Image, size: int, radius_ratio: float) -> Image.Image:
    out = logo.resize((size, size), Image.LANCZOS)
    out.putalpha(mask(size, radius_ratio))
    return out


def main() -> None:
    logo = Image.open(LOGO).convert("RGBA")
    assert logo.size == (512, 512), f"expected a 512 px logo, got {logo.size}"
    print(f"source {LOGO} {logo.size}, corner pixel {logo.getpixel((0, 0))}")
    for name, scale in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)

        layer = round(108 * scale)
        visible = round(72 * scale)
        foreground = Image.new("RGBA", (layer, layer), (0, 0, 0, 0))
        offset = (layer - visible) // 2
        foreground.paste(logo.resize((visible, visible), Image.LANCZOS), (offset, offset))
        outputs = {
            "ic_launcher_foreground.png": foreground,
            # 0.219 = rx 112 / 512 of the web's rounded icon (scripts/build-icons.mjs)
            "ic_launcher.png": shaped(logo, round(48 * scale), 112 / 512),
            "ic_launcher_round.png": shaped(logo, round(48 * scale), 0.5),
        }
        for file, image in outputs.items():
            path = folder / file
            image.save(path, optimize=True)
            print(f"{path.relative_to(HERE.parent)}: {image.size[0]} px, {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
