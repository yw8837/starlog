"""Reference pillars for cases.json → ref.json.

Main reference: lunar_python 1.4.8 (6tail) for 节气/八字/运, with
- civil wall clock → UTC instant by IANA tzdata (zoneinfo + tzdata wheel), not our policy.ts table
- Korean lunar → solar by korean_lunar_calendar (KASI data); lunar_python's own (Chinese) conversion is
  recorded next to it
Second opinion: sxtwl 2.0.7 (寿星天文历) 节气 instants, day and hour ganzhi.

Every profile reads year/month from the birth instant (UTC+8 fields fed to lunar_python, whose 节气
are in Beijing time) and day/hour from the profile's clock:
  D  = LMT (instant + longitude×4 min), 晚子时 day stays (lunar_python sect 2)   ← product default
  DU = LMT, day changes at 23:00 (sect 1)
  ES = era standard time (tzdata offset minus DST), sect 2
  FX = fixed 127.5°E (instant + 8h30m), sect 2
  R  = input wall clock read as UTC+9 (no DST table, no correction), sect 2
"""
from __future__ import annotations

import json
import math
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import sxtwl
from korean_lunar_calendar import KoreanLunarCalendar
from lunar_python import Lunar, Solar

from common import (BRANCHES, SEOUL_TZ, STEMS, TERM_KO, UTC, UTC8, civil_to_instants, ganzhi, ganzhi_index,
                    jeol_instants_around, lunar_python_terms, standard_offset)

HERE = Path(__file__).resolve().parent
PROFILES = {
    "D": ("LMT", 2, True),
    "DU": ("LMT", 1, True),
    "ES": ("ERA_STANDARD", 2, True),
    "FX": ("FIXED_127_5", 2, True),
    "R": ("WALL", 2, False),
}
MINUTE = timedelta(minutes=1)
klc = KoreanLunarCalendar()


def js_round(x: float) -> int:  # Math.round (half up), the rule our engine uses for 대운수
    return math.floor(x + 0.5)


_ym_cache: dict[datetime, tuple[str, str]] = {}


def year_month(instant: datetime) -> tuple[str, str]:
    if instant in _ym_cache:
        return _ym_cache[instant]
    bj = instant.astimezone(UTC8)
    ec = Solar.fromYmdHms(bj.year, bj.month, bj.day, bj.hour, bj.minute, bj.second).getLunar().getEightChar()
    _ym_cache[instant] = (ec.getYear(), ec.getMonth())
    return _ym_cache[instant]


def day_hour(clock: datetime, sect: int) -> tuple[str, str]:
    ec = Solar.fromYmdHms(clock.year, clock.month, clock.day, clock.hour, clock.minute, clock.second).getLunar().getEightChar()
    ec.setSect(sect)
    return ec.getDay(), ec.getTime()


def clock_of(kind: str, instant: datetime, wall: datetime, lon: float) -> datetime:
    """The day/hour clock as naive wall-clock fields (seconds truncated like both engines do)."""
    if kind == "LMT":
        c = instant + timedelta(minutes=lon * 4)
    elif kind == "ERA_STANDARD":
        c = instant + standard_offset(instant)
    elif kind == "FIXED_127_5":
        c = instant + timedelta(minutes=510)
    else:
        return wall
    return c.replace(tzinfo=None, microsecond=0)


def luck(instant: datetime, gender: str, year_gz: str, month_gz: str, light: bool = False) -> dict:
    """Direction and days to the adjacent 절 from lunar_python's 节气 (seconds), plus lunar_python's own 起运."""
    forward = (STEMS.index(year_gz[0]) % 2 == 0) == (gender == "male")
    jeols = [t for t, _ in jeol_instants_around(instant)]
    if forward:
        days = (min(t for t in jeols if t > instant) - instant).total_seconds() / 86400
    else:
        days = (instant - max(t for t in jeols if t <= instant)).total_seconds() / 86400
    own = {}
    bj = instant.astimezone(UTC8)
    ec = None if light else Solar.fromYmdHms(bj.year, bj.month, bj.day, bj.hour, bj.minute, bj.second).getLunar().getEightChar()
    for sect in () if light else (1, 2):
        yun = ec.getYun(1 if gender == "male" else 0, sect)
        own[f"sect{sect}"] = {"forward": yun.isForward(), "years": yun.getStartYear(), "months": yun.getStartMonth(),
                              "days": yun.getStartDay(), "hours": yun.getStartHour(), "first": yun.getDaYun()[1].getGanZhi()}
    return {
        "forward": forward, "days": round(days, 6),
        "startAge": {"round": max(1, js_round(days / 3)), "floor": max(1, math.floor(days / 3)), "ceil": max(1, math.ceil(days / 3))},
        "first": ganzhi(ganzhi_index(month_gz) + (1 if forward else -1)),
        "lunar_python": own,
    }


def nearest_jeol(instant: datetime) -> dict:
    t, idx = min(jeol_instants_around(instant), key=lambda p: abs((p[0] - instant).total_seconds()))
    return {"term": TERM_KO[idx], "index": idx, "instantUTC": t.isoformat(), "deltaSeconds": (instant - t).total_seconds()}


# ---- sxtwl second opinion ----------------------------------------------------------------------
_sx_cache: dict[int, list[datetime]] = {}


def sxtwl_terms(year: int) -> list[datetime]:
    """24 terms of solar `year` (index 0=소한) from sxtwl, UTC (sxtwl reports Beijing time)."""
    if year in _sx_cache:
        return _sx_cache[year]
    found: dict[int, datetime] = {}
    for y in (year - 1, year):
        for x in sxtwl.getJieQiByYear(y):
            t = sxtwl.JD2DD(x.jd)
            bj = datetime(int(t.Y), int(t.M), int(t.D), int(t.h), int(t.m), tzinfo=UTC8) + timedelta(seconds=t.s)
            if bj.year == year:
                found[(x.jqIndex - 1) % 24] = bj.astimezone(UTC)
    _sx_cache[year] = [found[i] for i in range(24)]
    return _sx_cache[year]


def sxtwl_year_month(instant: datetime) -> tuple[str, str]:
    """Year/month pillars from sxtwl's exact 절입 instants (입춘 for the year, 五虎遁 for the month stem)."""
    y = instant.astimezone(UTC).year
    jeols = sorted((t, idx) for yr in (y - 1, y, y + 1) for idx, t in enumerate(sxtwl_terms(yr)) if idx % 2 == 0)
    t_prev, idx = max(p for p in jeols if p[0] <= instant)
    saju_year = max(t for t, i in jeols if i == 2 and t <= instant).astimezone(UTC8).year
    month_no = 12 if idx == 0 else idx // 2  # 입춘(2)→1=寅 … 대설(22)→11=子, 소한(0)→12=丑
    year_stem = (saju_year - 4) % 10
    month_stem = ((year_stem % 5) * 2 + month_no + 1) % 10
    return ganzhi((saju_year - 4) % 60), STEMS[month_stem] + BRANCHES[(month_no + 1) % 12]


def sxtwl_day_hour(clock: datetime) -> tuple[str, str]:
    day = sxtwl.fromSolar(clock.year, clock.month, clock.day)
    d, h = day.getDayGZ(), day.getHourGZ(clock.hour)  # default: 23:00 takes the next day's stem (split)
    return STEMS[d.tg] + BRANCHES[d.dz], STEMS[h.tg] + BRANCHES[h.dz]


# ---- per case ------------------------------------------------------------------------------------
def solar_date_of(case: dict) -> tuple[date, dict]:
    if case["calendar"] == "solar":
        return date(case["year"], case["month"], case["day"]), {}
    y, m, d, leap = case["year"], case["month"], case["day"], case.get("isLeapMonth", False)
    info: dict = {}
    if not klc.setLunarDate(y, m, d, leap):
        raise ValueError(f"KLC rejects lunar {y}-{m}-{d} leap={leap}")
    kr = date(klc.solarYear, klc.solarMonth, klc.solarDay)
    info["kr"] = kr.isoformat()
    try:
        s = Lunar.fromYmd(y, -m if leap else m, d).getSolar()
        info["cn"] = f"{s.getYear():04d}-{s.getMonth():02d}-{s.getDay():02d}"
    except Exception as e:  # the Chinese calendar has no such (leap) month
        info["cn"] = f"error: {e}"
    return kr, info


def kr_lunar_label(d: date) -> str:
    klc.setSolarDate(d.year, d.month, d.day)
    return f"{klc.lunarYear:04d}-{'윤' if klc.isIntercalation else ''}{klc.lunarMonth:02d}-{klc.lunarDay:02d}"


def known_time(case: dict, d: date, light: bool = False) -> dict:
    hh, mm = case["time"]["hour"], case["time"]["minute"]
    lon = case["place"]["longitude"]
    wall = datetime(d.year, d.month, d.day, hh, mm)
    civil = civil_to_instants(d.year, d.month, d.day, hh, mm)
    out: dict = {"civilReadings": len(civil)}
    for name, (kind, sect, dst) in PROFILES.items():
        if dst:
            if not civil:
                out[name] = {"error": "NONEXISTENT_CIVIL_TIME"}
                continue
            instant = civil[0]
        else:
            instant = wall.replace(tzinfo=UTC) - timedelta(hours=9)
        y_gz, m_gz = year_month(instant)
        clock = clock_of(kind, instant, wall, lon)
        d_gz, h_gz = day_hour(clock, sect)
        res = {
            "pillars": [y_gz, m_gz, d_gz, h_gz], "instantUTC": instant.isoformat(), "clock": clock.isoformat(),
            "luck": luck(instant, case["gender"], y_gz, m_gz, light), "nearestJeol": nearest_jeol(instant),
        }
        if name == "D" and not light:
            sy, sm = sxtwl_year_month(instant)
            sd, sh = sxtwl_day_hour(clock)
            res["sxtwl"] = [sy, sm, sd, sh]
        out[name] = res
    return out


def unknown_time(case: dict, d: date) -> dict:
    lon = case["place"]["longitude"]
    first = next((hh, mm, ins[0]) for i in range(180) for hh, mm in [divmod(i, 60)] if (ins := civil_to_instants(d.year, d.month, d.day, hh, mm)))
    last = next((hh, mm, ins[-1]) for i in range(180) for hh, mm in [divmod(1439 - i, 60)] if (ins := civil_to_instants(d.year, d.month, d.day, hh, mm)))
    ya, ma = year_month(first[2])
    yb, mb = year_month(last[2])
    switch = next((t for t, _ in jeol_instants_around(first[2]) if first[2] < t <= last[2]), None)
    ambiguous, chosen = [], (ya, ma)
    if switch is not None and (ya != yb or ma != mb):
        civil_switch = switch.astimezone(SEOUL_TZ)
        for key, a, b in (("year", ya, yb), ("month", ma, mb)):
            if a != b:
                ambiguous.append({"pillar": key, "candidates": [a, b], "switchesAtCivil": civil_switch.strftime("%H:%M:%S")})
        if switch - first[2] < last[2] + MINUTE - switch:
            chosen = (yb, mb)
    day_gz = day_hour(datetime(d.year, d.month, d.day, 12, 0), 2)[0]

    def windows(sect: int) -> list[dict]:
        def shift(hh: int, mm: int) -> int | None:
            readings = civil_to_instants(d.year, d.month, d.day, hh, mm)
            if not readings:
                return None
            s = 0
            for r in readings:
                c = clock_of("LMT", r, datetime(d.year, d.month, d.day, hh, mm), lon)
                cd = c.date() + (timedelta(days=1) if sect == 1 and c.hour >= 23 else timedelta(0))
                if (cd - d).days:
                    s = 1 if (cd - d).days > 0 else -1
            return s

        out = []
        for want, order in ((-1, range(1440)), (1, range(1439, -1, -1))):
            hit = []
            for i in order:
                s = shift(*divmod(i, 60))
                if s is None:
                    continue
                if s != want:
                    break
                hit.append(i)
            if hit:
                lo, hi = min(hit), max(hit)
                out.append({"from": f"{lo // 60:02d}:{lo % 60:02d}", "to": f"{hi // 60:02d}:{hi % 60:02d}",
                            "dayPillar": ganzhi(ganzhi_index(day_gz) + want)})
        return out

    year_certain = not any(a["pillar"] == "year" for a in ambiguous)
    forward = (STEMS.index(chosen[0][0]) % 2 == 0) == (case["gender"] == "male") if year_certain else None
    sd = sxtwl.fromSolar(d.year, d.month, d.day).getDayGZ()
    return {
        "pillars": [chosen[0], chosen[1], day_gz, None], "ambiguous": ambiguous,
        "windows": {"D": windows(2), "DU": windows(1)}, "luckForward": forward,
        "probes": {"first": first[2].isoformat(), "last": last[2].isoformat()},
        "sxtwlDay": STEMS[sd.tg] + BRANCHES[sd.dz],
    }


def compute(cases: list[dict], light: bool) -> dict:
    out = {}
    for case in cases:
        d, lunar_info = solar_date_of(case)
        res = {"solarDate": d.isoformat(), "lunarDateKR": kr_lunar_label(d), "lunarInput": lunar_info}
        res.update(known_time(case, d, light) if case["time"] else {"unknown": unknown_time(case, d)})
        out[case["id"]] = res
    return out


def write_json_lines(path: Path, head: dict, cases: dict) -> None:
    """One case per line, so the committed file diffs and reads well."""
    lines = [f" {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}" for k, v in cases.items()]
    head_text = json.dumps(head, ensure_ascii=False)[1:-1]
    path.write_text("{" + head_text + ',\n"cases": {\n' + ",\n".join(lines) + "\n}}\n", encoding="utf-8")


def main() -> None:
    from importlib.metadata import version

    import tzdata
    versions = {pkg: version(pkg) for pkg in ("lunar_python", "sxtwl", "tzdata", "korean_lunar_calendar")}
    versions["IANA"] = tzdata.IANA_VERSION
    if "fuzz" in sys.argv[1:]:
        cases = json.loads((HERE / "fuzz-cases.json").read_text(encoding="utf-8"))
        write_json_lines(HERE / "ref-fuzz.json", {"versions": versions}, compute(cases, light=True))
        print(f"wrote ref-fuzz.json ({len(cases)} cases)")
        return
    cases = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))
    out = compute(cases, light=False)
    # 절기 tables for the term-accuracy check (lunar_python and sxtwl), 1929–2026
    terms = {y: {"lunar_python": [t.isoformat() for t in lunar_python_terms(y)], "sxtwl": [t.isoformat() for t in sxtwl_terms(y)]}
             for y in range(1929, 2027)}
    write_json_lines(HERE / "ref.json", {"versions": versions, "terms": terms}, out)
    print(f"wrote ref.json ({len(out)} cases) with {versions}")


if __name__ == "__main__":
    main()
