"""Independent 절입 instants, 1929–2026, from astropy (IAU SOFA/ERFA) → astro_terms.json.

Not from the 寿星/许剑伟 line that lunar_python, sxtwl and (through lunar-javascript) manseryeok's table
share. Apparent geocentric solar longitude, true ecliptic and equinox of date:
    get_sun(t) (ERFA epv00 + aberration) → GeocentricTrueEcliptic(equinox=t) (IAU 2006/2000A)
solved for λ = 285° + 15°·index by Newton iteration in TT. TT → civil time scale:
- 1960 onward: astropy's UTC (leap seconds; 1960–71 rubber seconds)
- before 1960: UT = TT − ΔT, ΔT from the Espenak & Meeus (2006) polynomials (NASA eclipse site);
  civil clocks then ran on mean solar time (GMT ≈ UT1).
"""
from __future__ import annotations

import json
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from astropy import units as u
from astropy.coordinates import GeocentricTrueEcliptic, get_sun
from astropy.time import Time
from astropy.utils import iers

from common import lunar_python_terms

warnings.filterwarnings("ignore", module="erfa")
warnings.filterwarnings("ignore", message=".*dubious year.*")
iers.conf.auto_download = False
HERE = Path(__file__).resolve().parent
YEARS = range(1929, 2027)


def delta_t_seconds(year_frac: float) -> float:
    """Espenak & Meeus (2006) ΔT polynomials for 1920–1986 (only the pre-1960 part is used here)."""
    y = year_frac
    if 1920 < y <= 1941:
        t = y - 1920
        return 21.20 + 0.84493 * t - 0.076100 * t**2 + 0.0020936 * t**3
    if 1941 < y <= 1961:
        t = y - 1950
        return 29.07 + 0.407 * t - t**2 / 233 + t**3 / 2547
    if 1961 < y <= 1986:
        t = y - 1975
        return 45.45 + 1.067 * t - t**2 / 260 - t**3 / 718
    raise ValueError(y)


def solar_longitude_deg(t: Time) -> np.ndarray:
    return get_sun(t).transform_to(GeocentricTrueEcliptic(equinox=t)).lon.to_value(u.deg)


def main() -> None:
    keys = [(y, i) for y in YEARS for i in range(24)]
    target = np.array([(285 + 15 * i) % 360 for _, i in keys], dtype=float)
    # start from lunar_python's instant (UT) + ~60 s as a TT guess; Newton converges in a few steps
    guess = [lunar_python_terms(y)[i] for y, i in keys]
    jd = np.array([Time(g.replace(tzinfo=None), scale="utc").jd + 60 / 86400 for g in guess])
    for _ in range(6):
        t = Time(jd, format="jd", scale="tt")
        diff = (target - solar_longitude_deg(t) + 180) % 360 - 180
        jd = jd + diff / 0.9856  # deg/day, close enough for Newton steps
    t = Time(jd, format="jd", scale="tt")
    resid = np.abs((target - solar_longitude_deg(t) + 180) % 360 - 180) * 3600  # arcsec
    out: dict[int, list[str]] = {y: [""] * 24 for y in YEARS}
    for k, (y, i) in enumerate(keys):
        tt = t[k]
        if tt.datetime.year >= 1960:
            ut = tt.utc.to_datetime(timezone=timezone.utc)
        else:
            dt = tt.to_datetime()
            ut = (dt - timedelta(seconds=delta_t_seconds(dt.year + (dt.month - 0.5) / 12))).replace(tzinfo=timezone.utc)
        out[y][i] = ut.isoformat(timespec="milliseconds")
    meta = {"method": __doc__.strip().splitlines()[0], "maxResidualArcsec": float(resid.max())}
    (HERE / "astro_terms.json").write_text(json.dumps({"meta": meta, "terms": out}, indent=1) + "\n", encoding="utf-8")
    print(f"wrote astro_terms.json: {len(keys)} terms, max residual {resid.max():.2e} arcsec")


if __name__ == "__main__":
    main()
