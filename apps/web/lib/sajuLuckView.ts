import { BRANCHES, STEMS, computeChart, ganzhiKo, mainHiddenStem, type SajuChart } from "@starlog/core";
import { tenGodOf } from "./sajuBalance";

/**
 * 대운·세운 as the chart page lists them: the dates, the current cycle and the year in force exactly as the reading's
 * facts compute them (`luckStarts`, `buildFactSet` and `annualPillar` in lib/ai/prompts/saju.ts, which is server-only;
 * lib/sajuLuckView.test.ts keeps the two in step). Labels only: no reading of what a cycle brings.
 */

const KST_MS = 9 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ym = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;

function addSpan(date: Date, span: { years: number; months: number; days: number }): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + span.years, date.getUTCMonth() + span.months, date.getUTCDate() + span.days));
}

const birthDate = (chart: SajuChart) => {
  const [y, m, d] = chart.solarDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};

/** First-대운 start: exact when the time is known; the earliest and latest over the day otherwise (the facts' `luckStarts`). */
function luckStarts(chart: SajuChart): { earliest: Date; latest: Date } | null {
  const birth = birthDate(chart);
  if (chart.luck.start) {
    const start = addSpan(birth, chart.luck.start);
    return { earliest: start, latest: start };
  }
  const starts: Date[] = [];
  for (const time of [{ hour: 0, minute: 0 }, { hour: 23, minute: 59 }, { hour: 12, minute: 0 }]) {
    try {
      const probe = computeChart({ ...chart.input, time }, chart.policy);
      if (probe.luck.start) starts.push(addSpan(birth, probe.luck.start));
    } catch {
      // a clock-jump minute; the other probes cover the day
    }
  }
  if (starts.length === 0) return null;
  const times = starts.map((s) => s.getTime());
  return { earliest: new Date(Math.min(...times)), latest: new Date(Math.max(...times)) };
}

/** 만 나이 on `at`. */
function ageAt(birth: Date, at: Date): number {
  const before = at.getUTCMonth() < birth.getUTCMonth() || (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate());
  return at.getUTCFullYear() - birth.getUTCFullYear() - (before ? 1 : 0);
}

export interface LuckCycleView {
  gz: string;
  ko: string;
  from: Date | null;
  to: Date | null;
  /** 만 나이 when the cycle starts */
  startAge: number | null;
  stemGod: string;
  branchGod: string;
  current: boolean;
}

export interface LuckView {
  /** the hour is unknown: the starts are the middle of the day's range */
  approximate: boolean;
  cycles: LuckCycleView[];
}

/** Every 대운 the engine gives, dated as the reading dates them; null when it gives none (year or month pillar not certain). */
export function luckView(chart: SajuChart, now: number): LuckView | null {
  if (chart.luck.forward === null || chart.luck.pillars.length === 0) return null;
  const starts = luckStarts(chart);
  const mid = starts ? new Date((starts.earliest.getTime() + starts.latest.getTime()) / 2) : null;
  const birth = birthDate(chart);
  const nowYm = ym(new Date(now + KST_MS));
  const day = chart.pillars.day.stem;
  const cycles = chart.luck.pillars.map((p, i): LuckCycleView => {
    const from = mid ? new Date(Date.UTC(mid.getUTCFullYear() + 10 * i, mid.getUTCMonth(), mid.getUTCDate())) : null;
    const to = mid ? new Date(Date.UTC(mid.getUTCFullYear() + 10 * (i + 1), mid.getUTCMonth(), mid.getUTCDate())) : null;
    return {
      gz: p.ganzhi,
      ko: p.ko,
      from,
      to,
      startAge: from ? ageAt(birth, from) : null,
      stemGod: tenGodOf(day, p.ganzhi.charAt(0)),
      branchGod: tenGodOf(day, mainHiddenStem(p.ganzhi.charAt(1))),
      current: from !== null && to !== null && ym(from) <= nowYm && nowYm < ym(to),
    };
  });
  return { approximate: chart.pillars.hour === null, cycles };
}

export function yearGanzhi(year: number): string {
  return STEMS[(((year - 4) % 10) + 10) % 10]! + BRANCHES[(((year - 4) % 12) + 12) % 12]!;
}

export interface AnnualView {
  year: number;
  gz: string;
  ko: string;
  stemGod: string;
  branchGod: string;
  current: boolean;
}

/** The 세운 in force at `now` (it turns at 입춘, read from the engine on the KST clock in Seoul) and the years after it. */
export function annualView(chart: SajuChart, now: number, count = 3): AnnualView[] {
  const kst = new Date(now + KST_MS);
  const probe = computeChart({
    calendar: "solar", year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate(),
    time: { hour: kst.getUTCHours(), minute: kst.getUTCMinutes() }, gender: "female", place: { name: "서울", longitude: 126.978 },
  });
  const gz = probe.pillars.year.stem + probe.pillars.year.branch;
  const first = gz === yearGanzhi(kst.getUTCFullYear()) ? kst.getUTCFullYear() : kst.getUTCFullYear() - 1;
  const day = chart.pillars.day.stem;
  return Array.from({ length: count }, (_, i) => {
    const yearGz = yearGanzhi(first + i);
    return {
      year: first + i,
      gz: yearGz,
      ko: ganzhiKo(yearGz),
      stemGod: tenGodOf(day, yearGz.charAt(0)),
      branchGod: tenGodOf(day, mainHiddenStem(yearGz.charAt(1))),
      current: i === 0,
    };
  });
}
