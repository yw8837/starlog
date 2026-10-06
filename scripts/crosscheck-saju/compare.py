"""Compare ours.json (our engine) with ref.json (lunar_python + tzdata + KLC, sxtwl) and astro_terms.json
(astropy), plus the wider sweep (ours-fuzz.json vs ref-fuzz.json) when present. Prints the markdown
tables used in docs/research/saju-calendar-crosscheck-2026-10.md and writes results.json.
Exit code 1 if any difference is left unclassified.
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROFS = ["D", "DU", "ES", "FX", "R"]
POS = ["연", "월", "일", "시"]
TERM_KO = ["소한", "대한", "입춘", "우수", "경칩", "춘분", "청명", "곡우", "입하", "소만", "망종", "하지",
           "소서", "대서", "입추", "처서", "백로", "추분", "한로", "상강", "입동", "소설", "대설", "동지"]
KST = timedelta(hours=9)


def P(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def load(name: str) -> dict:
    return json.loads((HERE / name).read_text(encoding="utf-8"))


cases = load("cases.json")
ours_all, ref_all, astro = load("ours.json"), load("ref.json"), load("astro_terms.json")
ours, ref = ours_all["cases"], ref_all["cases"]
TABLE = {int(y): [P(t) for t in v] for y, v in ours_all["terms"].items()}          # manseryeok (our engine)
LP = {int(y): [P(t) for t in v["lunar_python"]] for y, v in ref_all["terms"].items()}
SX = {int(y): [P(t) for t in v["sxtwl"]] for y, v in ref_all["terms"].items()}
AST = {int(y): [P(t) for t in v] for y, v in astro["terms"].items()}
results: dict = {"versions": {"engine": ours_all["engine"], **ref_all["versions"]}}
unclassified: list[str] = []


def fmt_input(c: dict) -> str:
    t = "시간 모름" if c["time"] is None else f"{c['time']['hour']:02d}:{c['time']['minute']:02d}"
    if c["calendar"] == "lunar":
        d = f"음 {c['year']}-{'윤' if c.get('isLeapMonth') else ''}{c['month']:02d}-{c['day']:02d}"
    else:
        d = f"{c['year']}-{c['month']:02d}-{c['day']:02d}"
    return f"{d} {t} {c['place']['name']} {'남' if c['gender'] == 'male' else '여'}"


def rounding_window(birth: datetime, rr: dict) -> tuple[bool, str, float]:
    """Is the birth between our table's 절입 minute and the exact (lunar_python) instant of the nearest 절?"""
    j = rr["nearestJeol"]
    t_lp = P(j["instantUTC"])
    t_tab = TABLE[t_lp.year][j["index"]]
    lo, hi = min(t_lp, t_tab), max(t_lp, t_tab)
    ast = AST[t_lp.year][j["index"]]
    return lo <= birth < hi, j["term"], (birth - ast).total_seconds()


def classify_pillars(o: dict, rr: dict) -> tuple[str, list[str]]:
    diff = [POS[i] for i in range(4) if o["pillars"][i] != rr["pillars"][i]]
    birth = P(rr["instantUTC"])
    inside, term, _ = rounding_window(birth, rr)
    warned = any(w["code"] == "TERM_BOUNDARY" for w in o["warnings"])
    if set(diff) <= {"연", "월"} and inside and warned:
        return "b-rounding", diff
    return "unclassified", diff


def luck_breakdown(days: float) -> dict:
    """manseryeok's display breakdown (3 days = 1 year, 1 day = 4 months, 1 month = 30 days), from reference days."""
    y = math.floor(days / 3)
    rem = (days - y * 3) * 4
    mo = math.floor(rem)
    frac = (rem - mo) * 30
    dd = math.floor(frac + 0.5)
    if dd >= 30:
        dd, mo = dd - 30, mo + 1
    if mo >= 12:
        mo, y = mo - 12, y + 1
    return {"years": y, "months": mo, "days": dd, "edge": abs(frac - math.floor(frac) - 0.5) < 0.05}


def compare_known(o: dict, rr: dict) -> dict:
    """All checks for one known-time case and profile. Returns {'pillars': cls|None, 'luck': cls|None, ...}."""
    res: dict = {}
    if "error" in o or "error" in rr:
        res["error"] = "match" if o.get("error") == rr.get("error") else f"ours={o.get('error')} ref={rr.get('error')}"
        return res
    res["instant"] = P(o["instantUTC"]) == P(rr["instantUTC"])
    res["clock"] = o["correctedLocalTime"] == rr["clock"][11:16]
    res["pillars"], res["diff"] = (None, []) if o["pillars"] == rr["pillars"] else classify_pillars(o, rr)
    L = rr["luck"]
    luck_ok = o["luck"]["forward"] == L["forward"] and o["luck"]["startAge"] == L["startAge"]["round"] and o["luck"]["first"] == L["first"]
    derived = res["pillars"] == "b-rounding" and bool(set(res["diff"]) & {"연", "월"})
    # whole-minute births and whole-minute 절입 can put days/3 exactly on n.5 in our engine (Math.round → up);
    # the exact-second reference then sits a few seconds either side of the tie
    tie = (o["luck"]["forward"] == L["forward"] and o["luck"]["first"] == L["first"]
           and abs((L["days"] / 3) % 1 - 0.5) < 0.0002 and abs(o["luck"]["startAge"] - L["startAge"]["round"]) == 1)
    res["luck"] = None if luck_ok else ("b-derived" if derived else "b-age-tie" if tie else "unclassified")
    bd = luck_breakdown(L["days"])
    same_start = o["luck"]["start"] == {k: bd[k] for k in ("years", "months", "days")}
    res["start"] = None if same_start else ("b-derived" if derived else "b-day-rounding" if bd["edge"] else "unclassified")
    return res


# ---------------------------------------------------------------------------------------------
# A. 절기표 정확도 (1929–2026, 24 terms × 98 years)
# ---------------------------------------------------------------------------------------------
def term_stats() -> None:
    rows = []
    for name, src in (("manseryeok@2.0.0 (우리 엔진)", TABLE), ("lunar_python 1.4.8", LP), ("sxtwl 2.0.7", SX)):
        for label, years in (("1929–1959", range(1929, 1960)), ("1960–2026", range(1960, 2027))):
            d = [(src[y][i] - AST[y][i]).total_seconds() for y in years for i in range(24)]
            rows.append((name, label, len(d), max(abs(x) for x in d), statistics.mean(d), sum(abs(x) > 30.5 for x in d), sum(abs(x) > 60 for x in d)))
    print("\n### A. 절입 시각 정확도 — astropy(IAU SOFA/ERFA) 대비, 1929–2026 전 24절기\n")
    print("| 출처 | 구간 | 절기 수 | 최대 \\|차\\| (초) | 평균 차 (초) | \\|차\\| > 30.5초 | \\|차\\| > 60초 |")
    print("|---|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]:.1f} | {r[4]:+.1f} | {r[5]} | {r[6]} |")

    def nearest_minute(t: datetime) -> datetime:
        return (t + timedelta(seconds=30)).replace(second=0, microsecond=0)

    def first_minute(t: datetime) -> datetime:  # first whole civil minute at or after the instant
        f = t.replace(second=0, microsecond=0)
        return f if f == t else f + timedelta(minutes=1)
    lp_bad = [(y, i) for y in range(1929, 2027) for i in range(24) if TABLE[y][i] != nearest_minute(LP[y][i])]
    ast_bad = [(y, i) for y in range(1929, 2027) for i in range(24) if TABLE[y][i] != nearest_minute(AST[y][i])]
    jeol = [(y, i) for y in range(1930, 2026) for i in range(0, 24, 2)]
    split_ours = [(y, i) for y, i in jeol if TABLE[y][i] != first_minute(AST[y][i])]
    split_lp = [(y, i) for y, i in jeol if first_minute(LP[y][i]) != first_minute(AST[y][i])]
    print(f"\n- manseryeok 표의 분 = lunar_python 초 값을 가장 가까운 분으로 반올림한 값인가: 2352개 중 다른 것 {len(lp_bad)}개")
    print(f"- manseryeok 표의 분 = astropy 값을 반올림한 분인가: 2352개 중 다른 것 {len(ast_bad)}개 (전부 ±32.7초 안)")
    print(f"- 1930–2025 절(節) {len(jeol)}개 중, 새 달(새 해)이 시작되는 첫 출생 분이 정확한 순간(astropy)과 1분 어긋나는 절: "
          f"우리 엔진 {len(split_ours)}개 / lunar_python {len(split_lp)}개. 어긋나는 폭은 항상 1분이고 우리 TERM_BOUNDARY(±120초) 안이다.")
    results["terms"] = {"rows": rows, "manseryeokVsLunarPythonMinute": len(lp_bad), "manseryeokVsAstropyMinute": len(ast_bad),
                        "jeolCount": len(jeol), "jeolFirstMinuteSplitOurs": len(split_ours), "jeolFirstMinuteSplitLunarPython": len(split_lp)}


# ---------------------------------------------------------------------------------------------
# B–C. 시간을 아는 케이스
# ---------------------------------------------------------------------------------------------
def known_cases() -> None:
    mism = defaultdict(list)
    counts, other = Counter(), defaultdict(list)
    amb_bad = []
    for c in cases:
        if c["time"] is None:
            continue
        cid, r = c["id"], ref[c["id"]]
        for prof in PROFS:
            res = compare_known(ours[cid][prof], r[prof])
            if "error" in res:
                counts[(prof, "error-" + res["error"])] += 1
                continue
            counts[(prof, "match" if res["pillars"] is None else "mismatch")] += 1
            for k in ("instant", "clock"):
                if not res[k]:
                    other[k].append((cid, prof))
            for k in ("luck", "start"):
                if res[k] and prof == "D":
                    other[f"{k}:{res[k]}"].append(cid)
                    if res[k] == "unclassified":
                        unclassified.append(f"{cid}/{k}")
            if res["pillars"]:
                mism[(cid, tuple(ours[cid][prof]["pillars"]), tuple(r[prof]["pillars"]))].append((prof, res))
                if res["pillars"] == "unclassified":
                    unclassified.append(f"{cid}/{prof}")
        o = ours[cid]["D"]
        if "error" not in o and any(w["code"] == "AMBIGUOUS_CIVIL_TIME" for w in o["warnings"]) != (r["civilReadings"] == 2):
            amb_bad.append(cid)
    n_known = sum(c["time"] is not None for c in cases)
    print(f"\n### B. 시간을 아는 {n_known}건 × 정책 프로필 5개 — 4주 일치\n")
    print("| 프로필 | 일치 | 불일치 |")
    print("|---|---|---|")
    for prof in PROFS:
        print(f"| {prof} | {counts[(prof, 'match')]} | {counts[(prof, 'mismatch')]} |")
    print(f"\n- 출생 순간(UTC) 불일치: {len(other['instant'])}건 · 보정 시계(HH:mm) 불일치: {len(other['clock'])}건 · "
          f"겹친 시각 판정 불일치: {len(amb_bad)}건 (tzdata상 두 번 있었던 시각: "
          f"{[c['id'] for c in cases if c['time'] and ref[c['id']]['civilReadings'] == 2]})")
    print(f"- sxtwl로 다시 계산한 4주(D) ≠ lunar_python: {[c['id'] for c in cases if c['time'] and ref[c['id']]['D']['sxtwl'] != ref[c['id']]['D']['pillars']]}")
    print(f"- 대운(D) 방향·대운수·첫 대운 불일치: {other['luck:b-derived'] + other['luck:unclassified']} "
          f"(연·월주 불일치에서 파생: {other['luck:b-derived']})")
    print(f"- 대운 세부 기산(년·월·일) 불일치: 파생 {other['start:b-derived']}, 일 반올림 경계(.5±0.05) {other['start:b-day-rounding']}, "
          f"미분류 {other['start:unclassified']}")

    print("\n### C. 4주 불일치 전체 목록\n")
    print("| ID | 입력 | 프로필 | 우리 엔진 | 기준(lunar_python) | 다른 기둥 | 출생 − 정확한 절입 (lunar_python / astropy) | 우리 경고 | 분류 |")
    print("|---|---|---|---|---|---|---|---|---|")
    rows = []
    for (cid, op, rp), items in mism.items():
        c, rr = next(x for x in cases if x["id"] == cid), ref[cid]["D"]
        profs = [p for p, _ in items]
        cls, diff = items[0][1]["pillars"], items[0][1]["diff"]
        inside, term, ast_delta = rounding_window(P(rr["instantUTC"]), rr)
        j = rr["nearestJeol"]
        t_tab = TABLE[P(j["instantUTC"]).year][j["index"]]
        warn = ",".join(sorted({w["code"] for w in ours[cid][profs[0]]["warnings"]})) or "-"
        text = (f"(b) 관례·정밀도: 우리 표는 {term} 절입을 {(t_tab + KST):%H:%M} KST(분 반올림)로 보고, 출생 "
                f"{(P(rr['instantUTC']) + KST):%H:%M} KST를 절입 후로 판정. 실제 절입은 {-j['deltaSeconds']:.0f}초 뒤") if cls == "b-rounding" else "미분류"
        rows.append({"id": cid, "profiles": profs, "ours": op, "ref": rp, "diff": diff, "lp": j["deltaSeconds"], "astro": ast_delta, "class": cls})
        print(f"| {cid} | {fmt_input(c)} | {','.join(profs)} | {' '.join(op)} | {' '.join(rp)} | {','.join(diff)} | "
              f"{term} {j['deltaSeconds']:+.0f}초 / {ast_delta:+.1f}초 | {warn} | {text} |")
    results["known"] = {"counts": {f"{k[0]}:{k[1]}": v for k, v in counts.items()}, "mismatches": rows,
                        "other": {k: v for k, v in other.items()}, "ambiguityMismatches": amb_bad}


# ---------------------------------------------------------------------------------------------
# D. 시간 모름
# ---------------------------------------------------------------------------------------------
def compare_unknown(o: dict, odu: dict, u: dict) -> bool:
    ow = [w["window"] for w in o["warnings"] if w["code"] == "DAY_PILLAR_WINDOW"]
    owu = [w["window"] for w in odu["warnings"] if w["code"] == "DAY_PILLAR_WINDOW"]
    same_a = [(a["pillar"], a["candidates"]) for a in o["ambiguous"]] == [(a["pillar"], a["candidates"]) for a in u["ambiguous"]]
    # our switch minute is the table's rounded minute; the reference is exact → compare with its nearest minute
    same_sw = all(a["switchesAtKST"] == (datetime.strptime(b["switchesAtCivil"], "%H:%M:%S") + timedelta(seconds=30)).strftime("%H:%M")
                  for a, b in zip(o["ambiguous"], u["ambiguous"]))
    return (o["pillars"] == u["pillars"] and same_a and same_sw and ow == u["windows"]["D"] and owu == u["windows"]["DU"]
            and o["luck"]["forward"] == u["luckForward"] and u.get("sxtwlDay", u["pillars"][2]) == u["pillars"][2])


def unknown_cases() -> None:
    print("\n### D. 시간 모름 (기본 프로필 D; 일주 창은 D와 DU 둘 다)\n")
    print("| ID | 입력 | 우리 3주 | 기준 3주 | 모호성: 우리 (전환 시각) | 모호성: 기준 (정확한 전환 시각) | 일주 창 D: 우리 / 기준 | 일주 창 DU: 우리 / 기준 | 대운 방향 우리/기준 | 판정 |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    bad = []
    for c in cases:
        if c["time"] is not None:
            continue
        cid, o, u, odu = c["id"], ours[c["id"]]["D"], ref[c["id"]]["unknown"], ours[c["id"]]["DU"]

        def win(ws):
            return "; ".join(f"{w['from']}~{w['to']}→{w['dayPillar']}" for w in ws) or "-"
        ok = compare_unknown(o, odu, u)
        if not ok:
            bad.append(cid)
            unclassified.append(cid)
        ow = [w["window"] for w in o["warnings"] if w["code"] == "DAY_PILLAR_WINDOW"]
        owu = [w["window"] for w in odu["warnings"] if w["code"] == "DAY_PILLAR_WINDOW"]
        fwd = {True: "순", False: "역", None: "없음"}

        def amb(items, key):
            return "; ".join(a["pillar"] + " " + "/".join(a["candidates"]) + " @" + a[key] for a in items) or "-"
        print(f"| {cid} | {fmt_input(c)} {c['note']} | {' '.join(o['pillars'][:3])} | {' '.join(u['pillars'][:3])} | "
              f"{amb(o['ambiguous'], 'switchesAtKST')} | {amb(u['ambiguous'], 'switchesAtCivil')} | "
              f"{win(ow)} / {win(u['windows']['D'])} | {win(owu)} / {win(u['windows']['DU'])} | "
              f"{fwd[o['luck']['forward']]}/{fwd[u['luckForward']]} | {'일치' if ok else '불일치'} |")
    results["unknown"] = {"mismatches": bad}


# ---------------------------------------------------------------------------------------------
# E. 음력
# ---------------------------------------------------------------------------------------------
def lunar_cases() -> None:
    print("\n### E. 음력 입력 → 양력 (기준: korean_lunar_calendar = KASI 데이터 / 참고: lunar_python = 중국력)\n")
    print("| ID | 음력 입력 | 우리 양력 | KLC(한국) | lunar_python(중국) | 판정 |")
    print("|---|---|---|---|---|---|")
    bad = []
    for c in cases:
        if c["calendar"] != "lunar":
            continue
        o, r = ours[c["id"]]["D"], ref[c["id"]]
        ok = o["solarDate"] == r["solarDate"]
        cn = r["lunarInput"]["cn"]
        note = "" if cn == r["solarDate"] else " · 중국력은 다름(c: lunar_python 한계, 한국 음력 아님)"
        if not ok:
            bad.append(c["id"])
            unclassified.append(c["id"])
        lab = fmt_input(c).split(" ")
        print(f"| {c['id']} | {lab[0]} {lab[1]} | {o['solarDate']} | {r['solarDate']} | {cn} | {'일치' if ok else '불일치'}{note} |")
    label_bad = [(c["id"], ours[c["id"]]["D"]["lunarDate"], ref[c["id"]]["lunarDateKR"]) for c in cases
                 if ours[c["id"]]["D"].get("lunarDate") != ref[c["id"]]["lunarDateKR"]]
    print(f"\n- 100건 전부의 음력 표시(lunarDate, 윤달 표기 포함)를 KLC와 대조: 불일치 {len(label_bad)}건")
    results["lunar"] = {"mismatches": bad, "labelMismatches": label_bad}


# ---------------------------------------------------------------------------------------------
# F. 대운
# ---------------------------------------------------------------------------------------------
def luck_cases() -> None:
    rows, sens = [], Counter()
    for c in cases:
        if c["time"] is None or "error" in ours[c["id"]]["D"]:
            continue
        o, L = ours[c["id"]]["D"], ref[c["id"]]["D"]["luck"]
        sens["n"] += 1
        sens["floor"] += L["startAge"]["floor"] != L["startAge"]["round"]
        sens["ceil"] += L["startAge"]["ceil"] != L["startAge"]["round"]
        sens["lp_sect1_years"] += L["lunar_python"]["sect1"]["years"] != L["startAge"]["round"]
        sens["lp_dir_first"] += L["lunar_python"]["sect1"]["forward"] != L["forward"] or L["lunar_python"]["sect1"]["first"] != L["first"]
        rows.append((c, o, L))
    print(f"\n### F. 대운 (시간을 아는 {sens['n']}건 전부, 프로필 D) — 표는 그중 12건\n")
    print(f"- 대운수 관례 민감도: 우리(round, 최소 1) 대신 floor면 {sens['floor']}건, ceil이면 {sens['ceil']}건의 대운수가 1 달라짐. "
          f"lunar_python 기본 기산(sect 1, 時辰 단위·내림)의 '년'은 우리 대운수와 {sens['lp_sect1_years']}건 다름. 방향·첫 대운 간지가 lunar_python 자체 운과 다른 건 {sens['lp_dir_first']}건")
    print("\n| ID | 입력 | 방향 우리/기준 | 인접 절까지 일수(기준) | 대운수 우리 / 기준 round·floor·ceil | 기산 우리 (년-월-일) | lunar_python 기산 sect1 / sect2 | 첫 대운 우리/기준 |")
    print("|---|---|---|---|---|---|---|---|")
    pick = [r for r in rows if r[0]["id"] in ("JE01", "JE02", "JE07", "JE08", "DS09", "DS10", "JA05", "LU04")]
    pick += [r for r in rows if r[0]["group"] == "random"][:4]
    for c, o, L in pick:
        s1, s2 = L["lunar_python"]["sect1"], L["lunar_python"]["sect2"]
        st = o["luck"]["start"]
        print(f"| {c['id']} | {fmt_input(c)} | {'순' if o['luck']['forward'] else '역'}/{'순' if L['forward'] else '역'} | {L['days']:.3f} | "
              f"{o['luck']['startAge']} / {L['startAge']['round']}·{L['startAge']['floor']}·{L['startAge']['ceil']} | "
              f"{st['years']}-{st['months']}-{st['days']} | {s1['years']}년{s1['months']}월{s1['days']}일 / {s2['years']}년{s2['months']}월{s2['days']}일{s2['hours']}시간 | "
              f"{o['luck']['first']}/{L['first']} |")
    results["luck"] = dict(sens)


# ---------------------------------------------------------------------------------------------
# G. 관례 영향
# ---------------------------------------------------------------------------------------------
def convention_impact() -> None:
    print("\n### G. 관례를 바꾸면 몇 건이 달라지나 (시간을 아는 88건, 기준 계산, D 대비)\n")
    print("| 대안 | 4주가 달라진 건 | 연 | 월 | 일 | 시 | 달라진 ID |")
    print("|---|---|---|---|---|---|---|")
    out = {}
    for prof, label in (("DU", "DU: 23시에 날 바뀜(통자시)"), ("ES", "ES: 경도 보정 없음(그 시대 표준시, DST만 제거)"),
                        ("FX", "FX: 동경 127.5° 고정(−30분)"), ("R", "R: 입력 벽시계 그대로(DST·보정 없음)")):
        ids, by = [], Counter()
        for c in cases:
            if c["time"] is None:
                continue
            a, b = ref[c["id"]]["D"], ref[c["id"]][prof]
            d = [POS[i] for i in range(4) if a["pillars"][i] != b["pillars"][i]]
            if d:
                ids.append(c["id"])
                by.update(d)
        out[prof] = {"n": len(ids), "by": dict(by), "ids": ids}
        print(f"| {label} | {len(ids)} | {by['연']} | {by['월']} | {by['일']} | {by['시']} | {', '.join(ids)} |")
    results["conventions"] = out


# ---------------------------------------------------------------------------------------------
# H. 넓은 스윕 (fuzz)
# ---------------------------------------------------------------------------------------------
def fuzz() -> None:
    if not (HERE / "ours-fuzz.json").exists() or not (HERE / "ref-fuzz.json").exists():
        print("\n(H. 스윕 생략: ours-fuzz.json / ref-fuzz.json 없음)")
        return
    fcases = load("fuzz-cases.json")
    fo, fr = load("ours-fuzz.json")["cases"], load("ref-fuzz.json")["cases"]
    tally = defaultdict(Counter)
    bad = []
    for c in fcases:
        cid, g = c["id"], c["group"]
        if c["time"] is None:
            ok = compare_unknown(fo[cid]["D"], fo[cid]["DU"], fr[cid]["unknown"])
            tally[g]["unknown-ok" if ok else "unknown-BAD"] += 1
            if not ok:
                bad.append((cid, "unknown"))
            continue
        for prof in PROFS:
            res = compare_known(fo[cid][prof], fr[cid][prof])
            if "error" in res:
                tally[g][f"error-{res['error']}"] += 1
                if res["error"] != "match":
                    bad.append((cid, prof, res["error"]))
                continue
            tally[g]["checked"] += 1
            for k in ("instant", "clock"):
                if not res[k]:
                    tally[g][f"{k}-BAD"] += 1
                    bad.append((cid, prof, k))
            if res["pillars"]:
                tally[g][f"pillars-{res['pillars']}"] += 1
                if res["pillars"] == "unclassified":
                    bad.append((cid, prof, "pillars", fo[cid][prof]["pillars"], fr[cid][prof]["pillars"]))
            for k in ("luck", "start"):
                if res[k]:
                    tally[g][f"{k}-{res[k]}"] += 1
                    if res[k] == "unclassified":
                        bad.append((cid, prof, k))
            if prof == "D":
                amb = any(w["code"] == "AMBIGUOUS_CIVIL_TIME" for w in fo[cid]["D"]["warnings"])
                if amb != (fr[cid]["civilReadings"] == 2):
                    tally[g]["ambiguity-BAD"] += 1
                    bad.append((cid, "ambiguity"))
                tally[g]["overlap"] += fr[cid]["civilReadings"] == 2
    print("\n### H. 넓은 스윕 (같은 파이프라인, 14,539건 × 프로필 5개)\n")
    print("| 묶음 | 내용 | 비교한 (케이스×프로필) | 4주 불일치: (b) 절입 분 반올림 | 4주 불일치: 미분류 | 없는 시각 거부 일치 | 겹친 시각(D) | 시간 모름 일치 | 기타 불일치 |")
    print("|---|---|---|---|---|---|---|---|---|")
    desc = {"FR": "무작위 1930–2025, 시각·출생지 무작위", "FB": "1930–2025 모든 절의 절입 분과 다음 분",
            "FT": "한국 시간대 변경 26회 전후 ±90분(5분 간격)", "FU": "시간 모름: 변경일 전후 + 무작위 200일"}
    for g in ("FR", "FB", "FT", "FU"):
        t = tally[g]
        other = sum(v for k, v in t.items() if k.endswith("-BAD") or k.endswith("unclassified") and not k.startswith("pillars"))
        print(f"| {g} | {desc[g]} | {t['checked']} | {t['pillars-b-rounding']} | {t['pillars-unclassified']} | {t['error-match']} | "
              f"{t['overlap']} | {t['unknown-ok']}/{t['unknown-ok'] + t['unknown-BAD']} | {other} |")
    derived = sum(t["luck-b-derived"] for t in tally.values())
    ties = sum(t["luck-b-age-tie"] for t in tally.values())
    print(f"\n- 대운(방향·대운수·첫 대운) 불일치: 연·월주 (b)에서 파생 {derived}건, 일수/3이 정확히 x.5인 동률 {ties}건 (케이스×프로필). "
          f"표시용 기산 '일' 반올림 경계: {sum(t['start-b-day-rounding'] for t in tally.values())}건. 미분류: {len(bad)}건 {bad[:10]}")
    results["fuzz"] = {g: dict(t) for g, t in tally.items()} | {"unclassified": bad}
    unclassified.extend(str(b) for b in bad)


def lunar_sweep() -> None:
    """manseryeok's solarToLunar / lunarToSolar (what computeChart calls) vs korean_lunar_calendar, every day."""
    if not (HERE / "ours-lunar.json").exists():
        print("\n(I. 음력 전수 생략: ours-lunar.json 없음)")
        return
    from korean_lunar_calendar import KoreanLunarCalendar
    klc = KoreanLunarCalendar()
    ol = load("ours-lunar.json")
    s2l_bad = []
    for solar, lunar in ol["solarToLunar"].items():
        y, m, d = map(int, solar.split("-"))
        klc.setSolarDate(y, m, d)
        if lunar != f"{klc.lunarYear:04d}-{'윤' if klc.isIntercalation else ''}{klc.lunarMonth:02d}-{klc.lunarDay:02d}":
            s2l_bad.append(solar)
    l2s_bad, valid_klc = [], 0
    for y in range(1930, 2026):
        for m in range(1, 13):
            for leap in (False, True):
                for d in range(1, 31):
                    key = f"{y:04d}-{'윤' if leap else ''}{m:02d}-{d:02d}"
                    ok = klc.setLunarDate(y, m, d, leap)
                    valid_klc += ok
                    mine = ol["lunarToSolar"].get(key)
                    theirs = f"{klc.solarYear:04d}-{klc.solarMonth:02d}-{klc.solarDay:02d}" if ok else None
                    if mine != theirs:
                        l2s_bad.append((key, mine, theirs))
    print(f"\n### I. 음력 전수 대조 (manseryeok 함수 = computeChart가 부르는 것, 기준 korean_lunar_calendar)\n")
    print(f"- 양력→음력 {len(ol['solarToLunar'])}일(1930-01-01~2025-12-31): 불일치 {len(s2l_bad)}일 {s2l_bad[:5]}")
    print(f"- 음력→양력 1930~2025 모든 (월, 일, 평/윤) 조합: 유효 날짜 {valid_klc}개, 존재 여부·변환 결과 불일치 {len(l2s_bad)}개 {l2s_bad[:5]}")
    results["lunarSweep"] = {"solarDays": len(ol["solarToLunar"]), "solarToLunarMismatches": s2l_bad, "validLunarDates": valid_klc,
                             "lunarToSolarMismatches": l2s_bad}
    unclassified.extend(s2l_bad + [k for k, _, _ in l2s_bad])


term_stats()
known_cases()
unknown_cases()
lunar_cases()
luck_cases()
convention_impact()
fuzz()
lunar_sweep()
results["unclassified"] = sorted(set(unclassified))
print(f"\n미분류 차이: {results['unclassified'] or '없음'}")
(HERE / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1, default=str) + "\n", encoding="utf-8")
sys.exit(1 if results["unclassified"] else 0)
