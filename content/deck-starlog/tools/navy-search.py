"""Which direct CMYK builds print as our dark navies? (PRINT.md section 3)

Automatic sRGB -> CMYK turns #0D0A26 grey; this searches CMYK builds (total ink <= 300) whose printed colour
is closest to each target, with the second profile of cmyk-report.py. Replace PROFILES there with the
vendor's ICC and run again.      python3 navy-search.py
"""
import importlib.util
import itertools
from pathlib import Path

from PIL import Image, ImageCms

spec = importlib.util.spec_from_file_location("cr", Path(__file__).with_name("cmyk-report.py"))
cr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cr)

path = list(cr.PROFILES.values())[1]
back = ImageCms.buildTransform(
    ImageCms.getOpenProfile(path), ImageCms.createProfile("sRGB"), "CMYK", "RGB",
    renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, flags=ImageCms.Flags.BLACKPOINTCOMPENSATION,
)
combos = [c for c in itertools.product(range(0, 101, 5), repeat=4) if sum(c) <= 300 and c[3] >= 20]
img = Image.new("CMYK", (len(combos), 1))
img.putdata([tuple(round(v * 255 / 100) for v in c) for c in combos])
rgbs = cr.pixels(ImageCms.applyTransform(img, back))
for name, hexv in [("night", "#0D0A26"), ("night2", "#15113A"), ("navyDeep", "#1C1850")]:
    target = cr.rgb(hexv)
    print(name, hexv)
    for d, c, r in sorted(((cr.de(target, r), c, r) for c, r in zip(combos, rgbs)), key=lambda t: t[0])[:3]:
        print("   dE %.1f  CMYK %s  TAC %d  -> #%02X%02X%02X" % (d, c, sum(c), *r))
