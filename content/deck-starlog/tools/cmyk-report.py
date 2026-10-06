"""sRGB -> CMYK gamut report for the deck palette (feeds PRINT.md).

    python3 cmyk-report.py [--all]

Converts every colour with an ICC profile (relative colorimetric + black point compensation), converts it back,
and reports the CMYK split, the total ink (TAC) and the shift (CIE76 dE). dE <= 3 = inside the press gamut,
3-8 = shifts a little, > 8 = clearly out of gamut. The profiles found on this PC are US SWOP types; the real
vendor profile (FOGRA39, Japan Color 2001, GRACoL...) must replace them before ordering (PRINT.md checklist).
"""
import glob
import re
import sys
from pathlib import Path

from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parent.parent
PROFILES = {
    "SWOP (Agfa RSWOP.icm)": "C:/Windows/System32/spool/drivers/color/RSWOP.icm",
    "SWOP (Photoshop 5 Default CMYK)": "C:/Program Files/Honeyview/data/cmyk.icc",
}
# name, hex: the master palette (tools/lib/kit.mjs C) and the flat scene colours (cards/*.mjs)
PALETTE = {
    "night": "#0D0A26", "night2": "#15113A", "navyDeep": "#1C1850", "navy": "#2E2A78", "indigo": "#3B3594",
    "violet": "#5B4FB8", "violetLight": "#8C7BE0", "lav": "#AA94E6", "lavLight": "#CDBDF5", "ink": "#F1ECFF",
    "cream": "#FFF7E8", "gold": "#E9C46F", "goldLight": "#F3DCA1", "goldDeep": "#B98A2E", "sun": "#FFF2C8",
    "coral": "#D8435A", "coralDeep": "#9E2A42", "green": "#43AA90", "greenDark": "#23687A",
    "water": "#3F66CC", "waterLight": "#9FC0F5",
    "fool sky": "#F0C552", "fool sun": "#D9801C", "fool peak": "#A28FE4", "magician ground": "#5B4FB8", "magician halo": "#7566D0",
    "star sky": "#1F1C66", "star sky low": "#2B3490", "star hill": "#2E8A7E", "star jug": "#E08A52",
    "priestess cloak": "#6F9BE8", "empress sky": "#F2D170", "empress cushion": "#E0764A", "empress wheat": "#E8B33A",
    "emperor sky": "#E8894F", "emperor mountain": "#E9B03C", "emperor steel": "#B9C8E8",
    "hierophant wall": "#6A63AC", "hierophant pillar": "#8F88C8", "lovers sky": "#7FA3EA", "lovers sun": "#F6D060", "lovers mountain": "#8774D8",
}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def lab(c):
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (lin(v) for v in c)
    x, y, z = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def de(a, b):
    return sum((p - q) ** 2 for p, q in zip(lab(a), lab(b))) ** 0.5


def convert(colors, path):
    srgb = ImageCms.createProfile("sRGB")
    cmyk = ImageCms.getOpenProfile(path)
    flags = ImageCms.Flags.BLACKPOINTCOMPENSATION
    to = ImageCms.buildTransform(srgb, cmyk, "RGB", "CMYK", renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, flags=flags)
    back = ImageCms.buildTransform(cmyk, srgb, "CMYK", "RGB", renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, flags=flags)
    img = Image.new("RGB", (len(colors), 1))
    img.putdata(colors)
    c = ImageCms.applyTransform(img, to)
    r = ImageCms.applyTransform(c, back)
    return pixels(c), pixels(r)


def pixels(img):
    raw, n = img.tobytes(), len(img.getbands())
    return [tuple(raw[i : i + n]) for i in range(0, len(raw), n)]


def used_colors():
    n = {}
    for f in glob.glob(str(ROOT / "svg" / "*.svg")):
        for m in re.findall(r"#([0-9A-Fa-f]{6})\b", Path(f).read_text(encoding="utf-8")):
            n[m.upper()] = n.get(m.upper(), 0) + 1
    return n


def report(title, items, path):
    cols = [rgb(h) for _, h in items]
    cm, rt = convert(cols, path)
    print(f"\n### {title}\n")
    print("| 색 | sRGB | C | M | Y | K | 잉크합 | 인쇄 후 | ΔE | 판정 |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    worst = []
    for (name, h), o, c, r in zip(items, cols, cm, rt):
        d = de(o, r)
        pc = [round(v / 255 * 100) for v in c]
        verdict = "안쪽" if d <= 3 else "조금 변함" if d <= 8 else "벗어남"
        back = "#%02X%02X%02X" % r
        print(f"| {name} | {h} | {pc[0]} | {pc[1]} | {pc[2]} | {pc[3]} | {sum(pc)} | {back} | {d:.1f} | {verdict} |")
        worst.append((d, name))
    return worst


if __name__ == "__main__":
    for label, path in PROFILES.items():
        if not Path(path).exists():
            print(f"(profile missing: {path})")
            continue
        report(f"{label}: 팔레트", list(PALETTE.items()), path)
    if "--all" in sys.argv:
        used = used_colors()
        items = [(f"x{n}", "#" + h) for h, n in sorted(used.items(), key=lambda t: -t[1])]
        worst = report("svg/*.svg에서 쓰인 모든 색(사용 횟수 순), Photoshop 5 Default CMYK", items, list(PROFILES.values())[1])
        n = len(worst)
        print(f"\n총 {n}색: 안쪽 {sum(d <= 3 for d, _ in worst)}, 조금 변함 {sum(3 < d <= 8 for d, _ in worst)}, 벗어남 {sum(d > 8 for d, _ in worst)}")
