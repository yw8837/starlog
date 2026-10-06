"""Build cases.json: 100 deterministic birth inputs for the saju cross-check.

Groups (counts): random 40 · jeol 20 (±30 min of a 절입) · jasi 10 (23:00–01:30) · dst 10 ·
lunar 10 (6 leap months) · unknown 10 (hour unknown). Re-running gives the same file (fixed seed).
"""
from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from korean_lunar_calendar import KoreanLunarCalendar

from common import SEOUL_TZ, TERM_KO, UTC, civil_to_instants, lunar_python_terms

SEED = 20261006
rng = random.Random(SEED)
HERE = Path(__file__).resolve().parent

SEOUL = ("서울", 126.978)
PLACES = [SEOUL, ("부산", 129.075), ("대구", 128.601), ("인천", 126.705), ("광주", 126.851), ("대전", 127.385),
          ("울산", 129.311), ("제주", 126.531), ("강릉", 128.876), ("전주", 127.148), ("춘천", 127.730), ("포항", 129.343)]
LO, HI = date(1930, 1, 1), date(2025, 12, 31)

cases: list[dict] = []


def rand_date(lo: date = LO, hi: date = HI) -> date:
    return lo + timedelta(days=rng.randrange((hi - lo).days + 1))


def rand_place() -> tuple[str, float]:
    return SEOUL if rng.random() < 0.5 else rng.choice(PLACES)


def is_dst(d: date, hh: int, mm: int) -> bool:
    inst = civil_to_instants(d.year, d.month, d.day, hh, mm)
    return bool(inst) and inst[0].astimezone(SEOUL_TZ).dst().total_seconds() != 0


def add(group: str, d: date, hm: tuple[int, int] | None, place=None, note: str = "", **extra) -> None:
    if hm is not None:
        assert civil_to_instants(d.year, d.month, d.day, *hm), (d, hm)  # never a skipped (DST gap) minute
    name, lon = place or rand_place()
    cases.append({
        "id": f"{group[:2].upper()}{sum(c['group'] == group for c in cases) + 1:02d}",
        "group": group, "calendar": "solar", "year": d.year, "month": d.month, "day": d.day,
        "time": None if hm is None else {"hour": hm[0], "minute": hm[1]},
        "gender": rng.choice(["female", "male"]), "place": {"name": name, "longitude": lon}, "note": note, **extra,
    })


def rand_hm() -> tuple[int, int]:
    m = rng.randrange(1440)
    return (m // 60, m % 60)


# 1) random 40 ------------------------------------------------------------------------------------
while sum(c["group"] == "random" for c in cases) < 40:
    d, hm = rand_date(), rand_hm()
    if civil_to_instants(d.year, d.month, d.day, *hm):
        add("random", d, hm)

# 2) ±30 min of a 절입 (6 입춘 + 14 other 절) ---------------------------------------------------------
# offsets are minutes from the floor of the 절입 minute on the civil clock; 0 with seconds < 30 is the
# minute where a minute-rounded 절입 table and the exact instant disagree (kept on purpose, 3 cases)
plan = [(2, "s<30", 0), (2, "any", -1), (2, "any", 1), (2, None, None), (2, None, None), (2, None, None)]
others = [0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
plan += [(rng.choice(others), "s<30", 0), (rng.choice(others), "s<30", 0), (rng.choice(others), "s>=30", 0)]
plan += [(rng.choice(others), None, None) for _ in range(11)]
used = set()
for idx, cond, offset in plan:
    while True:
        year = rng.randrange(1930, 2026)
        if (year, idx) in used:
            continue
        inst = lunar_python_terms(year)[idx]
        sec = inst.second
        if cond == "s<30" and not (0 < sec < 30):
            continue
        if cond == "s>=30" and sec < 30:
            continue
        off = offset if offset is not None else rng.choice([o for o in range(-30, 31) if o != 0])
        wall = inst.astimezone(SEOUL_TZ).replace(second=0, tzinfo=None) + timedelta(minutes=off)
        if not civil_to_instants(wall.year, wall.month, wall.day, wall.hour, wall.minute):
            continue
        used.add((year, idx))
        loc = inst.astimezone(SEOUL_TZ)
        add("jeol", wall.date(), (wall.hour, wall.minute),
            note=f"{TERM_KO[idx]} {loc:%Y-%m-%d %H:%M:%S} (civil, lunar_python) {off:+d} min")
        break

# 3) 23:00–01:30 on the civil clock (standard-time dates) ----------------------------------------
for i, hm in enumerate([(23, 10), (23, 32), (23, 33), (23, 50), (0, 0), (0, 20), (0, 32), (0, 33), (1, 0), (1, 30)]):
    while True:
        d = rand_date()
        if not is_dst(d, 12, 0) and civil_to_instants(d.year, d.month, d.day, *hm):
            break
    place = {3: ("부산", 129.075), 7: ("광주", 126.851)}.get(i, SEOUL)
    add("jasi", d, hm, place=place)

# 4) Korean DST periods: 8 random + 2 targeted ---------------------------------------------------
DST_YEARS = [1948, 1949, 1950, 1951, 1955, 1956, 1957, 1958, 1959, 1960, 1987, 1988]
while sum(c["group"] == "dst" for c in cases) < 8:
    y = rng.choice(DST_YEARS)
    d, hm = rand_date(date(y, 4, 1), date(y, 10, 12)), rand_hm()
    if is_dst(d, *hm):
        add("dst", d, hm)
add("dst", date(1955, 9, 8), (23, 40), place=SEOUL, note="DST ended at 24:00: 23:00-23:59 happened twice (earlier = DST)")
add("dst", date(1949, 7, 15), (0, 45), place=SEOUL, note="DST, just after civil midnight")

# 5) lunar inputs: 6 leap months + 4 plain (two where the Korean and Chinese calendars differ) -----
klc = KoreanLunarCalendar()
leaps = [(y, m) for y in range(1930, 2026) for m in range(1, 13) if klc.setLunarDate(y, m, 1, True)]
lunar_inputs = []
for y, m in rng.sample(leaps, 6):
    while True:
        dd = rng.randrange(1, 31)
        if klc.setLunarDate(y, m, dd, True):
            break
    lunar_inputs.append((y, m, dd, True, "leap month"))
lunar_inputs += [(1997, 1, 1, False, "KR 1997-02-08 vs CN 1997-02-07"), (2017, 6, 15, False, "KR 2017-08-06 vs CN 2017-07-08 (CN has 闰六月)")]
while len(lunar_inputs) < 10:
    y, m, dd = rng.randrange(1930, 2025), rng.randrange(1, 13), rng.randrange(1, 30)
    if klc.setLunarDate(y, m, dd, False):
        lunar_inputs.append((y, m, dd, False, ""))
for i, (y, m, dd, leap, note) in enumerate(lunar_inputs):
    klc.setLunarDate(y, m, dd, leap)
    solar = date(klc.solarYear, klc.solarMonth, klc.solarDay)
    hm = None if i in (2, 8) else rand_hm()
    if hm is not None and not civil_to_instants(solar.year, solar.month, solar.day, *hm):
        hm = (12, 0)
    add("lunar", solar, hm, note=note)
    c = cases[-1]
    c.update({"calendar": "lunar", "year": y, "month": m, "day": dd, "isLeapMonth": leap, "solarHint": solar.isoformat()})

# 6) hour unknown -------------------------------------------------------------------------------
def term_day(idx: int) -> date:
    return lunar_python_terms(rng.randrange(1930, 2026))[idx].astimezone(SEOUL_TZ).date()


unknown_dates = [(term_day(2), "입춘 day"), (term_day(2), "입춘 day")]
unknown_dates += [(term_day(i), f"{TERM_KO[i]} day") for i in rng.sample(others, 2)]
for years in ([1955, 1956, 1957, 1958, 1959, 1960], [1987, 1988]):
    while True:
        y = rng.choice(years)
        d = rand_date(date(y, 5, 1), date(y, 9, 1))
        if is_dst(d, 0, 0) or is_dst(d, 12, 0):
            unknown_dates.append((d, "DST date"))
            break
while True:
    d = rand_date(date(1954, 3, 22), date(1961, 8, 8))
    if not is_dst(d, 12, 0):
        unknown_dates.append((d, "UTC+8:30 era"))
        break
unknown_dates += [(rand_date(), "") for _ in range(3)]
for d, note in unknown_dates:
    add("unknown", d, None, place=SEOUL, note=note)

assert len(cases) == 100, len(cases)
(HERE / "cases.json").write_text(json.dumps(cases, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"wrote {len(cases)} cases → cases.json")

# ---------------------------------------------------------------------------------------------
# Wider sweep (fuzz-cases.json, not committed): same pipeline, counts only in the report.
#   FR 10,000 random known-time inputs · FB every 절 1930–2025 at the civil minute of the 절입 and
#   the next minute · FT every 5 min within ±90 min of each Korean civil-time change ·
#   FU hour unknown on each change date and its neighbours + 200 random dates
# ---------------------------------------------------------------------------------------------
frng = random.Random(SEED + 1)
fuzz: list[dict] = []


def fadd(prefix: str, d: date, hm: tuple[int, int] | None, place=None, note: str = "") -> None:
    name, lon = place or (SEOUL if frng.random() < 0.5 else frng.choice(PLACES))
    fuzz.append({"id": f"{prefix}{len(fuzz):05d}", "group": prefix, "calendar": "solar", "year": d.year, "month": d.month,
                 "day": d.day, "time": None if hm is None else {"hour": hm[0], "minute": hm[1]},
                 "gender": frng.choice(["female", "male"]), "place": {"name": name, "longitude": lon}, "note": note})


while sum(c["group"] == "FR" for c in fuzz) < 10_000:
    d = LO + timedelta(days=frng.randrange((HI - LO).days + 1))
    m = frng.randrange(1440)
    if civil_to_instants(d.year, d.month, d.day, m // 60, m % 60):
        fadd("FR", d, (m // 60, m % 60))
for year in range(1930, 2026):
    for idx in range(0, 24, 2):
        inst = lunar_python_terms(year)[idx]
        wall = inst.astimezone(SEOUL_TZ).replace(second=0, tzinfo=None)
        for off in (0, 1):
            w = wall + timedelta(minutes=off)
            if civil_to_instants(w.year, w.month, w.day, w.hour, w.minute):
                fadd("FB", w.date(), (w.hour, w.minute), note=f"{TERM_KO[idx]} {inst.astimezone(SEOUL_TZ):%Y-%m-%d %H:%M:%S} {off:+d}")
# every tzdata change of Asia/Seoul offset 1930–1995, found on the UTC axis (independent of our table)
changes = []
t = datetime(1930, 1, 1, tzinfo=UTC)
prev = t.astimezone(SEOUL_TZ).utcoffset()
while t < datetime(1996, 1, 1, tzinfo=UTC):
    t2 = t + timedelta(minutes=30)
    if t2.astimezone(SEOUL_TZ).utcoffset() != prev:
        m = t
        while m.astimezone(SEOUL_TZ).utcoffset() == prev:
            m += timedelta(minutes=1)
        changes.append((m, prev))
        prev = m.astimezone(SEOUL_TZ).utcoffset()
    t = t2
change_days = set()
for inst, old in changes:
    for wall in ((inst + old).replace(tzinfo=None), inst.astimezone(SEOUL_TZ).replace(tzinfo=None)):  # old clock, new clock
        change_days.add(wall.date())
        for k in range(-90, 91, 5):
            w = wall + timedelta(minutes=k)
            fadd("FT", w.date(), (w.hour, w.minute), place=SEOUL, note=f"civil-time change {inst:%Y-%m-%d %H:%M}Z")
for cd in sorted(change_days):
    for dd in (cd - timedelta(days=1), cd, cd + timedelta(days=1)):
        fadd("FU", dd, None, place=SEOUL, note=f"near civil-time change {cd}")
for _ in range(200):
    fadd("FU", LO + timedelta(days=frng.randrange((HI - LO).days + 1)), None)
(HERE / "fuzz-cases.json").write_text(json.dumps(fuzz, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {len(fuzz)} sweep cases → fuzz-cases.json ({len(change_days)} civil-time change days)")
