"""Outline every glyph the card plates can need (Roman numerals, Korean names, keyword lines) from
Noto Serif KR (SIL OFL 1.1, installed with Windows), so the SVGs carry no font dependency at all.

    python3 make-glyphs.py     -> glyphs.json  (committed; the build reads only the JSON)

Characters come from ../deck.json (numeral, ko, keyword of every card). Two weights:
  700 = numeral and name, 500 = keyword line.   Run again after adding a card or a keyword.
"""
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT = "C:/Windows/Fonts/NotoSerifKR-VF.ttf"
WEIGHTS = {"name": 700, "keyword": 500}

here = Path(__file__).parent
deck = json.loads((here.parent / "deck.json").read_text(encoding="utf-8"))
chars = set("0123456789")
for c in deck["cards"]:
    chars.update(c["numeral"])
    chars.update(c["ko"])
    chars.update(c["keyword"])
chars.discard(" ")
chars = "".join(sorted(chars))


def rnd(v):
    return str(int(round(v)))


out = {"font": "Noto Serif KR (SIL OFL 1.1)", "upm": 1000, "weights": WEIGHTS, "space": 260, "sets": {}}
for key, wght in WEIGHTS.items():
    font = TTFont(FONT)
    opts = subset.Options()
    opts.layout_features = []
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=chars)
    sub.subset(font)
    inst = instancer.instantiateVariableFont(font, {"wght": wght})
    gs = inst.getGlyphSet()
    cmap = inst.getBestCmap()
    out["upm"] = inst["head"].unitsPerEm
    glyphs = {}
    for ch in chars:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=rnd)
        gs[name].draw(pen)
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        b = bp.bounds or (0, 0, 0, 0)
        glyphs[ch] = {"adv": gs[name].width, "d": pen.getCommands(), "b": [round(v) for v in b]}
    out["sets"][key] = glyphs

(here / "glyphs.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
size = (here / "glyphs.json").stat().st_size
print(f"glyphs.json: {len(chars)} chars x {len(WEIGHTS)} weights, {size // 1024} KB", file=sys.stderr)
