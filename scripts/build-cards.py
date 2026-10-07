#!/usr/bin/env python3
"""Build the app's card images from the 1909 scans in assets/cards/rws1909 (scripts/fetch-cards.py).

The scans are photos of whole printed cards: white scanner background, the card's own shadowed edge, a few
degrees of tilt, and some sides cut close to the black border. A fixed trim cut into the border of most cards.
Per card this script
  1. straightens the scan (the angle that makes the four border lines sharpest),
  2. finds the printed black border: on each side the first dark lines after the scanner white, and of those
     the outermost pair whose distance apart matches the deck's border size (the median over all 78 scans),
     which passes over the card's own shadowed edge and a border cut close or printed faint,
  3. sets the bordered card on a margin of its own paper colour at the frame's 600:1040, the border scaled to the
     deck's size (at most a few percent) so it lands in the same place on every card, keeping a few pixels of real
     paper next to the line and fading into the flat colour.
Needs Pillow and numpy. Usage: python scripts/build-cards.py [out_dir]   (default apps/web/public/cards)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path("assets/cards/rws1909")
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("apps/web/public/cards")
RATIO = 1040 / 600  # the card frame, components/tarot/TarotCard.module.css
SIDE = 0.03  # paper margin left and right, as a share of the border's width
BAND = 6  # pixels of real paper kept outside the line, fading into the flat paper colour
SIZES = ((600, 82, ""), (240, 78, "-sm"))


def profiles(a: np.ndarray) -> dict[str, np.ndarray]:
    """Mean brightness from each edge inward, over the middle 80% of that edge."""
    h, w = a.shape
    r0, r1, c0, c1 = int(h * 0.1), int(h * 0.9), int(w * 0.1), int(w * 0.9)
    return {
        "l": a[r0:r1, : w // 5].mean(0),
        "r": a[r0:r1, w - w // 5 :][:, ::-1].mean(0),
        "t": a[: h // 6, c0:c1].mean(1),
        "b": a[h - h // 6 :, c0:c1][::-1].mean(1),
    }


def card_paper(sides: dict[str, np.ndarray]) -> float:
    """Brightness of the card's margin paper: the plateau before the first dark line, on the sides that have one."""
    plateau = []
    for p in sides.values():
        first_dark = next((i for i, v in enumerate(p) if v < 120), len(p))
        values = [v for v in p[:first_dark] if 170 <= v <= 228]
        if len(values) >= 5:
            plateau += values
    return float(np.median(plateau)) if plateau else 200.0


def dark_runs(p: np.ndarray, paper: float, limit: int = 3) -> list[tuple[int, int, float]]:
    """The first dark runs in an edge-inward profile after any scanner white (> 228):
    (position, offset from the card's first pixel, darkest value)."""
    dark = paper - 45
    start = next((i for i, v in enumerate(p) if v <= 228), len(p))
    runs, i = [], start
    while i < len(p) and len(runs) < limit:
        if p[i] < dark:
            j = i
            while j < len(p) and p[j] < dark:
                j += 1
            runs.append((i, i - start, float(p[i:j].min())))
            i = j
        i += 1
    return runs


def first_guess(runs: list[tuple[int, int, float]]) -> int | None:
    """The border by itself: the first dark run, unless it hugs the card's start (its shadowed edge) and another follows."""
    if not runs:
        return None
    return runs[1][0] if runs[0][1] <= 6 and len(runs) > 1 else runs[0][0]


def pick(near: list[tuple[int, int, float]], far: list[tuple[int, int, float]], total: int, expected: float, tol: float) -> tuple[int, int] | None:
    """Of the dark runs on two opposite sides, the pair whose distance apart is within tol of the deck's border size
    and whose fainter line is darkest, then the outermost. Runs hugging the card's start (within 6 px: usually its
    shadowed edge) count only when no pair without them fits, as on a side cut close to the border."""
    for hug in (6, -1):
        fits = [
            (max(da, db), a + b, a, b)
            for a, oa, da in near
            for b, ob, db in far
            if oa > hug and ob > hug and abs(total - a - b - expected) <= tol * expected
        ]
        if fits:
            return min(fits)[2:]
    return None


def sharpness(a: np.ndarray) -> float:
    """Sum of each side's darkest line: lower when the border lines run straight along the profiles."""
    return float(sum(p[: len(p) * 3 // 4].min() for p in profiles(a).values()))


def straighten_angle(gray: Image.Image) -> float:
    small = gray.resize((gray.width // 2, gray.height // 2), Image.BILINEAR)
    score = lambda deg: sharpness(np.asarray(small.rotate(deg, Image.BILINEAR, fillcolor=255), dtype=np.float32))
    best = min(np.arange(-2.0, 2.01, 0.2), key=score)
    return float(min(np.arange(best - 0.2, best + 0.21, 0.04), key=score))


def paper_colour(rgb: np.ndarray, a: np.ndarray, box: tuple[int, int, int, int]) -> tuple[int, int, int]:
    """Median colour of the plain paper just outside the border, where the scan has any."""
    x0, y0, x1, y1 = box
    h, w = a.shape
    strips = [
        (slice(y0, y1), slice(max(0, x0 - 18), max(0, x0 - 4))),
        (slice(y0, y1), slice(min(w, x1 + 5), min(w, x1 + 19))),
        (slice(max(0, y0 - 18), max(0, y0 - 4)), slice(x0, x1)),
        (slice(min(h, y1 + 5), min(h, y1 + 19)), slice(x0, x1)),
    ]
    picks = []
    for rows, cols in strips:
        g, c = a[rows, cols], rgb[rows, cols]
        keep = (g > 165) & (g <= 228)
        if keep.sum() > 200:
            picks.append(c[keep])
    if not picks:
        return (232, 222, 196)
    return tuple(int(v) for v in np.median(np.concatenate(picks), axis=0))


def measure(path: Path) -> dict:
    scan = Image.open(path).convert("RGB")
    angle = straighten_angle(scan.convert("L"))
    a = np.asarray(scan.rotate(angle, Image.BICUBIC, expand=True, fillcolor=(255, 255, 255)).convert("L"), dtype=np.float32)
    sides = profiles(a)
    paper = card_paper(sides)
    return {"angle": angle, "h": a.shape[0], "w": a.shape[1], "runs": {k: dark_runs(p, paper) for k, p in sides.items()}}


def compose(path: Path, angle: float, edge: dict[str, int], deck_w: float, deck_h: float) -> Image.Image:
    """The card at its scan size with its margins; resizing it to the frame scales its border to the deck's."""
    rot = Image.open(path).convert("RGB").rotate(angle, Image.BICUBIC, expand=True, fillcolor=(255, 255, 255))
    rgb = np.asarray(rot)
    a = np.asarray(rot.convert("L"), dtype=np.float32)
    h, w = a.shape
    x0, y0, x1, y1 = edge["l"], edge["t"], w - 1 - edge["r"], h - 1 - edge["b"]
    bw, bh = x1 - x0 + 1, y1 - y0 + 1

    # the deck's frame: SIDE of paper left and right, the rest of 600:1040 split above and below
    side = SIDE * deck_w
    above = ((deck_w + 2 * side) * RATIO - deck_h) / 2
    left, top = round(side * bw / deck_w), round(above * bh / deck_h)
    out_w, out_h = bw + 2 * left, bh + 2 * top

    canvas = np.empty((out_h, out_w, 3), np.float32)
    canvas[:] = paper_colour(rgb, a, (x0, y0, x1, y1))
    # the bordered card plus BAND px of real paper, its weight fading to 0 at BAND px outside the border
    sx0, sy0, sx1, sy1 = max(0, x0 - BAND), max(0, y0 - BAND), min(w - 1, x1 + BAND), min(h - 1, y1 + BAND)
    ys, xs = np.mgrid[sy0 : sy1 + 1, sx0 : sx1 + 1]
    outside = np.maximum.reduce([x0 - xs, xs - x1, y0 - ys, ys - y1, np.zeros_like(xs)])
    weight = np.clip(1 - outside / BAND, 0, 1)[..., None]
    region = canvas[top - (y0 - sy0) : top + (sy1 - y0) + 1, left - (x0 - sx0) : left + (sx1 - x0) + 1]
    region[:] = weight * rgb[sy0 : sy1 + 1, sx0 : sx1 + 1] + (1 - weight) * region
    return Image.fromarray(canvas.round().astype(np.uint8))


def main() -> None:
    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf8"))
    cards = {entry["file"].removesuffix(".jpg"): measure(SRC / entry["file"]) for entry in manifest}
    widths, heights = [], []
    for m in cards.values():
        l, r, t, b = (first_guess(m["runs"][k]) for k in "lrtb")
        if l is not None and r is not None:
            widths.append(m["w"] - l - r)
        if t is not None and b is not None:
            heights.append(m["h"] - t - b)
    border_w, border_h = float(np.median(widths)), float(np.median(heights))

    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    for stem, m in cards.items():
        across = pick(m["runs"]["l"], m["runs"]["r"], m["w"], border_w, 0.02)
        down = pick(m["runs"]["t"], m["runs"]["b"], m["h"], border_h, 0.016)
        if across is None or down is None:
            raise SystemExit(f"{stem}: no border near {border_w:.0f}x{border_h:.0f} in {m['runs']}")
        edge = {"l": across[0], "r": across[1], "t": down[0], "b": down[1]}
        card = compose(SRC / f"{stem}.jpg", m["angle"], edge, border_w, border_h)
        for width, quality, suffix in SIZES:
            card.resize((width, round(width * RATIO)), Image.LANCZOS).save(OUT / f"{stem}{suffix}.webp", quality=quality, method=6)
        report[stem] = {"angle": round(m["angle"], 2), "edge": edge, "border": [m["w"] - across[0] - across[1], m["h"] - down[0] - down[1]]}
    print(f"built {len(report) * len(SIZES)} images; deck border {border_w:.0f}x{border_h:.0f}")
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(json.dumps(report, indent=1), encoding="utf8")


if __name__ == "__main__":
    main()
