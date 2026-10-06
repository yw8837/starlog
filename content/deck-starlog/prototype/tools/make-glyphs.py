"""Outline the few glyphs the card plates need (Roman numerals + Korean names) from Noto Serif KR
(SIL OFL 1.1, installed with Windows) so the SVGs carry no font dependency at all.

    python3 make-glyphs.py            -> glyphs.json (committed; the build reads only the JSON)

Add a character to CHARS when a new card name needs it.
"""
import io
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT = "C:/Windows/Fonts/NotoSerifKR-VF.ttf"
WGHT = 700
# 0 I V X + 바보 마법사 별 (the three prototype cards)
CHARS = "0IVX바보마법사별"

here = Path(__file__).parent

font = TTFont(FONT)
opts = subset.Options()
opts.layout_features = []
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(text=CHARS)
sub.subset(font)
inst = instancer.instantiateVariableFont(font, {"wght": WGHT})

gs = inst.getGlyphSet()
cmap = inst.getBestCmap()
upm = inst["head"].unitsPerEm
out = {"font": "Noto Serif KR (SIL OFL 1.1)", "wght": WGHT, "upm": upm, "chars": {}}
for ch in CHARS:
    name = cmap[ord(ch)]
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:g}")
    gs[name].draw(pen)
    bp = BoundsPen(gs)
    gs[name].draw(bp)
    out["chars"][ch] = {"adv": gs[name].width, "d": pen.getCommands(), "bounds": bp.bounds}
(here / "glyphs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("glyphs.json:", len(out["chars"]), "chars, upm", upm, "wght", WGHT, file=sys.stderr)
