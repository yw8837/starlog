"""Shared helpers for the saju cross-check (reference side).

Time handling, stated once:
- Birth input = civil wall clock at a Korean birthplace. The reference turns it into an absolute
  instant with IANA tzdata (Python zoneinfo + the pinned `tzdata` wheel), independently of the
  table in packages/core/src/saju/policy.ts. fold=0 picks the earlier instant in a fall-back
  overlap (the same rule as our engine).
- lunar_python (6tail) works in Beijing time (UTC+8): its 节气 table and its 八字 year/month are
  computed on UTC+8 wall-clock fields. So year/month are read by giving it the instant's UTC+8
  fields, and day/hour by giving it the corrected clock's fields.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from lunar_python import Lunar

SEOUL_TZ = ZoneInfo("Asia/Seoul")
UTC = timezone.utc
UTC8 = timezone(timedelta(hours=8))

STEMS = "甲乙丙丁戊己庚辛壬癸"
BRANCHES = "子丑寅卯辰巳午未申酉戌亥"

# lunar_python 节气 keys (simplified Chinese) in manseryeok index order 0=소한 … 23=동지
TERM_CN = ["小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
           "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至"]
TERM_KO = ["소한", "대한", "입춘", "우수", "경칩", "춘분", "청명", "곡우", "입하", "소만", "망종", "하지",
           "소서", "대서", "입추", "처서", "백로", "추분", "한로", "상강", "입동", "소설", "대설", "동지"]
# pinyin keys lunar_python uses for the terms that belong to the next/previous solar year
_PINYIN = {"DA_XUE": "大雪", "DONG_ZHI": "冬至", "XIAO_HAN": "小寒", "DA_HAN": "大寒", "LI_CHUN": "立春",
           "YU_SHUI": "雨水", "JING_ZHE": "惊蛰"}

_term_cache: dict[int, list[datetime]] = {}


def lunar_python_terms(year: int) -> list[datetime]:
    """24 terms of solar `year` (index 0=소한 … 23=동지) as UTC datetimes, from lunar_python (second precision)."""
    if year in _term_cache:
        return _term_cache[year]
    found: dict[str, datetime] = {}
    for ly in (year - 1, year, year + 1):
        for key, solar in Lunar.fromYmd(ly, 6, 1).getJieQiTable().items():
            name = _PINYIN.get(key, key)
            bj = datetime(solar.getYear(), solar.getMonth(), solar.getDay(), solar.getHour(), solar.getMinute(),
                          solar.getSecond(), tzinfo=UTC8)
            if bj.year == year:
                found[name] = bj.astimezone(UTC)
    out = [found[n] for n in TERM_CN]
    _term_cache[year] = out
    return out


def jeol_instants_around(instant: datetime) -> list[tuple[datetime, int]]:
    """(UTC instant, manseryeok index) of every 절 (even index) from the year before to the year after."""
    y = instant.astimezone(UTC).year
    out = []
    for yr in (y - 1, y, y + 1):
        terms = lunar_python_terms(yr)
        for idx in range(0, 24, 2):
            out.append((terms[idx], idx))
    return sorted(out)


def civil_to_instants(y: int, m: int, d: int, hh: int, mm: int) -> list[datetime]:
    """Every UTC instant a Korean civil wall-clock minute denotes (IANA tzdata): [] in a gap, 2 in an overlap."""
    out = []
    for fold in (0, 1):
        local = datetime(y, m, d, hh, mm, tzinfo=SEOUL_TZ, fold=fold)
        inst = local.astimezone(UTC)
        back = inst.astimezone(SEOUL_TZ)
        if (back.year, back.month, back.day, back.hour, back.minute) == (y, m, d, hh, mm) and inst not in out:
            out.append(inst)
    return sorted(out)


def standard_offset(instant: datetime) -> timedelta:
    """The era's standard UTC offset at an instant (DST removed), from tzdata."""
    loc = instant.astimezone(SEOUL_TZ)
    return loc.utcoffset() - loc.dst()


def ganzhi(index60: int) -> str:
    return STEMS[index60 % 10] + BRANCHES[index60 % 12]


def ganzhi_index(gz: str) -> int:
    s, b = STEMS.index(gz[0]), BRANCHES.index(gz[1])
    for i in range(60):
        if i % 10 == s and i % 12 == b:
            return i
    raise ValueError(gz)
