#!/usr/bin/env python3
"""Build the tiny font subsets the Open Graph image (apps/web/app/opengraph-image.tsx) renders with.

next/og only ships a Latin font. When a glyph is missing it fetches one from Google Fonts at
render time, so the Korean text gets its own offline subset instead: a static instance of the
Noto Serif KR / Noto Sans KR variable fonts (SIL Open Font License 1.1), cut down to TEXT.
Every name-table record (copyright, OFL notice and URL) is kept, as the OFL asks.

Usage: python scripts/build-og-fonts.py [font dir]   (default C:/Windows/Fonts; needs fontTools)
Writes apps/web/assets/og/*.ttf and glyphs.json (the characters each subset covers; a vitest
checks every OG string against it). Rerun after changing the OG text in apps/web/lib/og.ts.
"""
import json
import string
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else "C:/Windows/Fonts")
OUT_DIR = Path(__file__).resolve().parent.parent / "apps" / "web" / "assets" / "og"

# Latin letters, digits and a little punctuation (wordmark, host), plus the Korean in lib/og.ts.
TEXT = string.ascii_letters + string.digits + " .·-—" + "스타로그 카드와 사주로 쌓는 나의 이야기"

FONTS = [
    ("NotoSerifKR-VF.ttf", 700, "NotoSerifKR-Bold.og.ttf"),
    ("NotoSansKR-VF.ttf", 500, "NotoSansKR-Medium.og.ttf"),
]


def build(source: Path, weight: int, out: Path) -> list[str]:
    font = TTFont(source)
    static = instancer.instantiateVariableFont(font, {"wght": weight})
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=TEXT)
    subsetter.subset(static)
    static.save(out)
    cmap = TTFont(out).getBestCmap()
    return sorted({ch for ch in TEXT if ord(ch) in cmap})


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for source, weight, name in FONTS:
        covered = build(FONT_DIR / source, weight, OUT_DIR / name)
        manifest[name] = "".join(covered)
        missing = sorted(set(TEXT) - set(covered))
        print(f"{name}: {len(covered)} chars, {(OUT_DIR / name).stat().st_size} bytes, missing {missing!r}")
    (OUT_DIR / "glyphs.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
